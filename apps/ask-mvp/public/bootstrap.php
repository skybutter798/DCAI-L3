<?php

declare(strict_types=1);

function ask_config(): array
{
    static $config = null;
    if ($config === null) {
        $config = require __DIR__ . '/config.php';
    }
    return $config;
}

function ask_db(): PDO
{
    static $pdo = null;
    if ($pdo !== null) {
        return $pdo;
    }

    $config = ask_config();
    $dbPath = $config['storage']['sqlite'];
    $dir = dirname($dbPath);
    if (!is_dir($dir)) {
        mkdir($dir, 0775, true);
    }

    $pdo = new PDO('sqlite:' . $dbPath, null, null, [
        PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
    ]);

    ask_init_db($pdo);
    return $pdo;
}

function ask_init_db(PDO $pdo): void
{
    $pdo->exec('CREATE TABLE IF NOT EXISTS survey_templates (
        id INTEGER PRIMARY KEY,
        title TEXT NOT NULL,
        total_questions INTEGER NOT NULL,
        created_at TEXT NOT NULL
    )');

    $pdo->exec('CREATE TABLE IF NOT EXISTS survey_questions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        survey_id INTEGER NOT NULL,
        question_no INTEGER NOT NULL,
        question_text TEXT NOT NULL,
        UNIQUE(survey_id, question_no)
    )');

    $pdo->exec('CREATE TABLE IF NOT EXISTS survey_nfts (
        token_id INTEGER PRIMARY KEY,
        survey_id INTEGER NOT NULL,
        payer_address TEXT NOT NULL,
        mint_tx_hash TEXT,
        mode TEXT NOT NULL DEFAULT "demo",
        created_at TEXT NOT NULL,
        completed_at TEXT DEFAULT NULL
    )');

    $pdo->exec('CREATE TABLE IF NOT EXISTS survey_answers (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        token_id INTEGER NOT NULL,
        question_no INTEGER NOT NULL,
        answer TEXT NOT NULL,
        wallet_address TEXT NOT NULL,
        answered_at TEXT NOT NULL,
        UNIQUE(token_id, question_no)
    )');

    $count = (int) $pdo->query('SELECT COUNT(*) FROM survey_templates')->fetchColumn();
    if ($count === 0) {
        $config = ask_config();
        $total = (int) ($config['survey']['totalQuestions'] ?? 100);
        $now = gmdate('c');
        $pdo->prepare('INSERT INTO survey_templates (id, title, total_questions, created_at) VALUES (1, ?, ?, ?)')
            ->execute(['DCAI Survey Prototype', $total, $now]);
        $insert = $pdo->prepare('INSERT INTO survey_questions (survey_id, question_no, question_text) VALUES (1, ?, ?)');
        for ($i = 1; $i <= $total; $i++) {
            $insert->execute([$i, sprintf('Question %d — replace this placeholder with your real YES / NO prompt.', $i)]);
        }
    }
}

function ask_json($payload, int $status = 200): void
{
    http_response_code($status);
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode($payload, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT);
    exit;
}

function ask_input(): array
{
    $raw = file_get_contents('php://input') ?: '';
    $json = json_decode($raw, true);
    if (is_array($json)) {
        return $json;
    }
    return $_POST ?: [];
}

function ask_wallet(?string $wallet): string
{
    $wallet = strtolower(trim((string) $wallet));
    if (!preg_match('/^0x[a-f0-9]{40}$/', $wallet)) {
        throw new InvalidArgumentException('Invalid wallet address');
    }
    return $wallet;
}

function ask_survey_summary(PDO $pdo, int $tokenId): array
{
    $survey = $pdo->prepare('SELECT * FROM survey_nfts WHERE token_id = ?');
    $survey->execute([$tokenId]);
    $row = $survey->fetch();
    if (!$row) {
        throw new RuntimeException('Survey pass not found');
    }

    $answersStmt = $pdo->prepare('SELECT question_no, answer FROM survey_answers WHERE token_id = ? ORDER BY question_no ASC');
    $answersStmt->execute([$tokenId]);
    $answers = $answersStmt->fetchAll();
    $answerMap = [];
    foreach ($answers as $answer) {
        $answerMap[(int) $answer['question_no']] = $answer['answer'];
    }

    $questionsStmt = $pdo->prepare('SELECT question_no, question_text FROM survey_questions WHERE survey_id = ? ORDER BY question_no ASC');
    $questionsStmt->execute([(int) $row['survey_id']]);
    $questions = $questionsStmt->fetchAll();

    $answeredCount = count($answers);
    $totalQuestions = count($questions);
    $nextQuestionNo = null;
    foreach ($questions as $question) {
        if (!isset($answerMap[(int) $question['question_no']])) {
            $nextQuestionNo = (int) $question['question_no'];
            break;
        }
    }

    if ($answeredCount >= $totalQuestions && !$row['completed_at']) {
        $row['completed_at'] = gmdate('c');
        $pdo->prepare('UPDATE survey_nfts SET completed_at = ? WHERE token_id = ?')->execute([$row['completed_at'], $tokenId]);
    }

    return [
        'tokenId' => (int) $row['token_id'],
        'surveyId' => (int) $row['survey_id'],
        'payerAddress' => $row['payer_address'],
        'mintTxHash' => $row['mint_tx_hash'],
        'mode' => $row['mode'],
        'createdAt' => $row['created_at'],
        'completedAt' => $row['completed_at'],
        'answeredCount' => $answeredCount,
        'score' => $answeredCount,
        'totalQuestions' => $totalQuestions,
        'progressPercent' => $totalQuestions > 0 ? round(($answeredCount / $totalQuestions) * 100, 2) : 0,
        'nextQuestionNo' => $nextQuestionNo,
        'answers' => $answerMap,
        'questions' => $questions,
    ];
}
