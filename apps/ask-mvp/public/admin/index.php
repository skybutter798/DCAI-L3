<?php

declare(strict_types=1);
require dirname(__DIR__) . '/bootstrap.php';

$config = ask_config();
$adminConfig = $config['admin'] ?? [];
$sessionKey = (string) ($adminConfig['sessionKey'] ?? 'ask_admin_auth');

session_name('ask_admin');
session_start();

$pdo = ask_db();
$surveyId = 1;
$message = null;
$error = null;

function admin_password_hash_path(): string
{
    return dirname(__DIR__) . '/admin-auth.php';
}

function admin_write_password_hash(string $hash, string $sessionKey): void
{
    $content = "<?php\nreturn [\n    'passwordHash' => '" . addslashes($hash) . "',\n    'sessionKey' => '" . addslashes($sessionKey) . "',\n];\n";
    file_put_contents(admin_password_hash_path(), $content, LOCK_EX);
}

function admin_is_authed(string $sessionKey): bool
{
    return !empty($_SESSION[$sessionKey]);
}

function admin_parse_questions(string $raw): array
{
    $raw = trim($raw);
    if ($raw === '') {
        throw new InvalidArgumentException('Please paste some questions first.');
    }

    if ($raw[0] === '[' || $raw[0] === '{') {
        $json = json_decode($raw, true);
        if (!is_array($json)) {
            throw new InvalidArgumentException('JSON format is invalid.');
        }
        $items = [];
        $index = 1;
        foreach ($json as $row) {
            if (is_string($row)) {
                $items[] = [
                    'title' => sprintf('Question %03d', $index),
                    'content' => trim($row),
                ];
            } elseif (is_array($row)) {
                $title = trim((string) ($row['title'] ?? sprintf('Question %03d', $index)));
                $content = trim((string) ($row['content'] ?? $row['question'] ?? ''));
                if ($content === '') {
                    continue;
                }
                $items[] = ['title' => $title, 'content' => $content];
            }
            $index++;
        }
        return $items;
    }

    $lines = preg_split('/\r\n|\r|\n/', $raw) ?: [];
    $items = [];
    $index = 1;
    foreach ($lines as $line) {
        $line = trim($line);
        if ($line === '') {
            continue;
        }

        $title = sprintf('Question %03d', $index);
        $content = $line;

        foreach (["|||", "\t", "|"] as $separator) {
            if (str_contains($line, $separator)) {
                [$left, $right] = array_map('trim', explode($separator, $line, 2));
                if ($right !== '') {
                    $title = $left !== '' ? $left : $title;
                    $content = $right;
                }
                break;
            }
        }

        $items[] = ['title' => $title, 'content' => $content];
        $index++;
    }

    if (!$items) {
        throw new InvalidArgumentException('No usable questions were found.');
    }

    return $items;
}

function admin_parse_csv_upload(array $file): array
{
    if (($file['error'] ?? UPLOAD_ERR_NO_FILE) === UPLOAD_ERR_NO_FILE) {
        return [];
    }
    if (($file['error'] ?? UPLOAD_ERR_OK) !== UPLOAD_ERR_OK) {
        throw new RuntimeException('CSV upload failed.');
    }

    $handle = fopen($file['tmp_name'], 'rb');
    if (!$handle) {
        throw new RuntimeException('Unable to read uploaded CSV file.');
    }

    $items = [];
    $header = null;
    $index = 1;
    while (($row = fgetcsv($handle)) !== false) {
        if ($row === [null] || $row === false) {
            continue;
        }
        $row = array_map(static fn($v) => trim((string) $v), $row);
        if ($header === null) {
            $lower = array_map('strtolower', $row);
            if (in_array('title', $lower, true) || in_array('content', $lower, true) || in_array('question', $lower, true)) {
                $header = $lower;
                continue;
            }
        }

        if ($header !== null) {
            $mapped = array_combine($header, array_pad($row, count($header), '')) ?: [];
            $title = trim((string) ($mapped['title'] ?? sprintf('Question %03d', $index)));
            $content = trim((string) ($mapped['content'] ?? $mapped['question'] ?? ''));
        } else {
            $title = trim((string) ($row[0] ?? sprintf('Question %03d', $index)));
            $content = trim((string) ($row[1] ?? ''));
            if ($content === '') {
                $content = $title;
                $title = sprintf('Question %03d', $index);
            }
        }

        if ($content === '') {
            continue;
        }

        $items[] = ['title' => $title, 'content' => $content];
        $index++;
    }
    fclose($handle);

    if (!$items) {
        throw new InvalidArgumentException('CSV file did not contain any usable rows.');
    }

    return $items;
}

function admin_replace_questions(PDO $pdo, int $surveyId, string $surveyTitle, array $items): void
{
    $pdo->beginTransaction();
    try {
        $pdo->prepare('INSERT OR IGNORE INTO survey_templates (id, title, total_questions, created_at) VALUES (?, ?, ?, ?)')
            ->execute([$surveyId, $surveyTitle, count($items), gmdate('c')]);

        $pdo->prepare('UPDATE survey_templates SET title = ?, total_questions = ? WHERE id = ?')
            ->execute([$surveyTitle, count($items), $surveyId]);

        $pdo->prepare('DELETE FROM survey_questions WHERE survey_id = ?')->execute([$surveyId]);

        $insert = $pdo->prepare('INSERT INTO survey_questions (survey_id, question_no, question_title, question_content, question_text) VALUES (?, ?, ?, ?, ?)');
        foreach ($items as $i => $item) {
            $number = $i + 1;
            $title = trim((string) ($item['title'] ?? '')) ?: sprintf('Question %03d', $number);
            $content = trim((string) ($item['content'] ?? ''));
            $insert->execute([$surveyId, $number, $title, $content, $content]);
        }

        $pdo->commit();
    } catch (Throwable $e) {
        $pdo->rollBack();
        throw $e;
    }
}

if (($_POST['action'] ?? '') === 'logout') {
    unset($_SESSION[$sessionKey]);
    header('Location: ./');
    exit;
}

if (($_POST['action'] ?? '') === 'login') {
    $password = (string) ($_POST['password'] ?? '');
    $hash = (string) ($adminConfig['passwordHash'] ?? '');
    if ($hash !== '' && password_verify($password, $hash)) {
        $_SESSION[$sessionKey] = true;
        header('Location: ./');
        exit;
    }
    $error = 'Password is incorrect.';
}

if (admin_is_authed($sessionKey) && $_SERVER['REQUEST_METHOD'] === 'POST') {
    $action = (string) ($_POST['action'] ?? '');
    try {
        if ($action === 'save_questions') {
            $surveyTitle = trim((string) ($_POST['survey_title'] ?? 'DCAI Survey')) ?: 'DCAI Survey';
            $raw = trim((string) ($_POST['questions_raw'] ?? ''));
            $items = [];
            if (!empty($_FILES['questions_csv']['name'] ?? '')) {
                $items = admin_parse_csv_upload($_FILES['questions_csv']);
            } else {
                $items = admin_parse_questions($raw);
            }
            admin_replace_questions($pdo, $surveyId, $surveyTitle, $items);
            $message = sprintf('Imported %d questions into survey #%d.', count($items), $surveyId);
        }

        if ($action === 'change_password') {
            $current = (string) ($_POST['current_password'] ?? '');
            $new = (string) ($_POST['new_password'] ?? '');
            $confirm = (string) ($_POST['confirm_password'] ?? '');
            $hash = (string) ($adminConfig['passwordHash'] ?? '');

            if (!password_verify($current, $hash)) {
                throw new RuntimeException('Current password is incorrect.');
            }
            if (strlen($new) < 8) {
                throw new RuntimeException('New password must be at least 8 characters.');
            }
            if ($new !== $confirm) {
                throw new RuntimeException('New password and confirm password do not match.');
            }

            $newHash = password_hash($new, PASSWORD_DEFAULT);
            admin_write_password_hash($newHash, $sessionKey);
            $message = 'Admin password updated successfully.';
            $config = ask_config();
            $config['admin']['passwordHash'] = $newHash;
            $adminConfig = $config['admin'];
        }
    } catch (Throwable $e) {
        $error = $e->getMessage();
    }
}

$template = $pdo->prepare('SELECT * FROM survey_templates WHERE id = ?');
$template->execute([$surveyId]);
$currentTemplate = $template->fetch() ?: ['title' => 'DCAI Survey Prototype', 'total_questions' => 0];

$questions = $pdo->prepare('SELECT question_title, question_content FROM survey_questions WHERE survey_id = ? ORDER BY question_no ASC');
$questions->execute([$surveyId]);
$currentQuestions = $questions->fetchAll();
$prefill = implode("\n", array_map(static fn(array $q): string => trim((string)$q['question_title']) . ' ||| ' . trim((string)$q['question_content']), $currentQuestions));

$authed = admin_is_authed($sessionKey);
?><!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>ASK Admin</title>
  <link rel="stylesheet" href="../style.css">
</head>
<body>
  <div class="shell">
    <header class="hero card">
      <div>
        <p class="eyebrow">ASK • Admin</p>
        <h1><?= $authed ? 'Question Manager' : 'Admin Login' ?></h1>
        <p class="muted"><?= $authed ? 'Protected admin area for replacing live survey questions and managing access.' : 'Login required before you can edit the live question set.' ?></p>
      </div>
      <?php if ($authed): ?>
        <form method="post" class="inline-actions">
          <input type="hidden" name="action" value="logout">
          <button type="submit" class="ghost">Logout</button>
        </form>
      <?php else: ?>
        <div class="status-banner">
          <strong>Protected:</strong> password login is now enabled.
        </div>
      <?php endif; ?>
    </header>

    <?php if ($message): ?>
      <section class="card status-banner" style="margin-top:20px; border-color: rgba(54,179,107,.25);">
        ✅ <?= htmlspecialchars($message) ?>
      </section>
    <?php endif; ?>

    <?php if ($error): ?>
      <section class="card status-banner" style="margin-top:20px; border-color: rgba(228,104,104,.25);">
        ❌ <?= htmlspecialchars($error) ?>
      </section>
    <?php endif; ?>

    <?php if (!$authed): ?>
      <section class="grid top-grid" style="margin-top:20px;">
        <section class="card">
          <h2>Sign in</h2>
          <form method="post" class="form-grid">
            <input type="hidden" name="action" value="login">
            <div>
              <label for="password"><strong>Password</strong></label>
              <input id="password" type="password" name="password" autocomplete="current-password">
            </div>
            <div class="inline-actions">
              <button type="submit">Login</button>
            </div>
          </form>
        </section>
      </section>
    <?php else: ?>
      <section class="grid top-grid" style="margin-top:20px;">
        <section class="card">
          <h2>Bulk Import</h2>
          <form method="post" enctype="multipart/form-data" class="form-grid">
            <input type="hidden" name="action" value="save_questions">
            <div>
              <label for="survey_title"><strong>Survey title</strong></label>
              <input id="survey_title" type="text" name="survey_title" value="<?= htmlspecialchars((string) $currentTemplate['title']) ?>">
            </div>

            <div>
              <label for="questions_csv"><strong>CSV upload</strong></label>
              <input id="questions_csv" type="file" name="questions_csv" accept=".csv,text/csv">
              <p class="note">CSV can use columns like <code>title,content</code> or just plain rows.</p>
            </div>

            <div>
              <label for="questions_raw"><strong>Paste questions</strong></label>
              <textarea id="questions_raw" name="questions_raw"><?= htmlspecialchars($prefill) ?></textarea>
            </div>

            <div class="inline-actions">
              <button type="submit">Save & Replace Questions</button>
            </div>
          </form>
        </section>

        <section class="card">
          <h2>Change admin password</h2>
          <form method="post" class="form-grid">
            <input type="hidden" name="action" value="change_password">
            <div>
              <label for="current_password"><strong>Current password</strong></label>
              <input id="current_password" type="password" name="current_password" autocomplete="current-password">
            </div>
            <div>
              <label for="new_password"><strong>New password</strong></label>
              <input id="new_password" type="password" name="new_password" autocomplete="new-password">
            </div>
            <div>
              <label for="confirm_password"><strong>Confirm new password</strong></label>
              <input id="confirm_password" type="password" name="confirm_password" autocomplete="new-password">
            </div>
            <div class="inline-actions">
              <button type="submit" class="ghost">Update password</button>
            </div>
          </form>

          <div class="admin-help" style="margin-top:18px;">
            <p><strong>CSV tips</strong></p>
            <p>- Header row supported: <code>title,content</code></p>
            <p>- Also supports a single content column with auto-generated question numbers</p>
            <p>- Paste mode still supports <code>Title ||| Content</code>, tab, <code>|</code>, or JSON array</p>
            <p><strong>Current survey:</strong> <?= htmlspecialchars((string) $currentTemplate['title']) ?> (<?= (int) $currentTemplate['total_questions'] ?> questions)</p>
          </div>
        </section>
      </section>
    <?php endif; ?>
  </div>
</body>
</html>
