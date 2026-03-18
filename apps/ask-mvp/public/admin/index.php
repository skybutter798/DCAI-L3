<?php

declare(strict_types=1);
require dirname(__DIR__) . '/bootstrap.php';

$pdo = ask_db();
$surveyId = 1;
$message = null;
$error = null;

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

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    try {
        $surveyTitle = trim((string) ($_POST['survey_title'] ?? 'DCAI Survey')) ?: 'DCAI Survey';
        $raw = (string) ($_POST['questions_raw'] ?? '');
        $items = admin_parse_questions($raw);
        admin_replace_questions($pdo, $surveyId, $surveyTitle, $items);
        $message = sprintf('Imported %d questions into survey #%d.', count($items), $surveyId);
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
        <h1>Question Manager</h1>
        <p class="muted">Replace the live survey question set in one paste. Designed for quick iteration while the product is still moving fast.</p>
      </div>
      <div class="status-banner">
        <strong>Current survey:</strong> <?= htmlspecialchars((string) $currentTemplate['title']) ?><br>
        <strong>Current count:</strong> <?= (int) $currentTemplate['total_questions'] ?> questions
      </div>
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

    <section class="grid top-grid" style="margin-top:20px;">
      <section class="card">
        <h2>Bulk Import</h2>
        <form method="post" class="form-grid">
          <div>
            <label for="survey_title"><strong>Survey title</strong></label>
            <input id="survey_title" type="text" name="survey_title" value="<?= htmlspecialchars((string) $currentTemplate['title']) ?>">
          </div>

          <div>
            <label for="questions_raw"><strong>Questions</strong></label>
            <textarea id="questions_raw" name="questions_raw"><?= htmlspecialchars($prefill) ?></textarea>
          </div>

          <div class="inline-actions">
            <button type="submit">Save & Replace Questions</button>
          </div>
        </form>
      </section>

      <section class="card">
        <h2>Accepted formats</h2>
        <div class="admin-help">
          <p><strong>Option 1 — one line per question</strong></p>
          <p><code>Question 001 ||| Real content here</code></p>
          <p><strong>Option 2 — title and content separated by a single <code>|</code> or tab</strong></p>
          <p><strong>Option 3 — JSON</strong> array of strings or objects:</p>
<pre style="white-space:pre-wrap; color:#667085;">[
  {"title":"Question 001","content":"Real content here"},
  {"title":"Question 002","content":"Another question"}
]</pre>
          <p>When a title is missing, the system auto-generates <code>Question 001</code>, <code>Question 002</code>, and so on.</p>
          <p><strong>Current note:</strong> this first admin screen is intentionally simple so you can move fast. We can add auth / CSV upload / multi-survey support next.</p>
        </div>
      </section>
    </section>
  </div>
</body>
</html>
