<?php

declare(strict_types=1);
require __DIR__ . '/bootstrap.php';

$config = ask_config();
$pdo = ask_db();
$action = $_GET['action'] ?? 'config';

try {
    switch ($action) {
        case 'config':
            ask_json([
                'ok' => true,
                'app' => $config['app_name'],
                'chain' => $config['chain'],
                'survey' => $config['survey'],
            ]);
            break;

        case 'my-surveys':
            $wallet = ask_wallet($_GET['wallet'] ?? '');
            $stmt = $pdo->prepare('SELECT token_id FROM survey_nfts WHERE payer_address = ? ORDER BY token_id DESC');
            $stmt->execute([$wallet]);
            $tokenIds = array_map(static fn ($row) => (int) $row['token_id'], $stmt->fetchAll());
            $surveys = array_map(static fn ($tokenId) => ask_survey_summary($pdo, $tokenId), $tokenIds);
            ask_json(['ok' => true, 'wallet' => $wallet, 'surveys' => $surveys]);
            break;

        case 'survey':
            $tokenId = (int) ($_GET['tokenId'] ?? 0);
            if ($tokenId < 1) {
                throw new InvalidArgumentException('tokenId is required');
            }
            ask_json(['ok' => true, 'survey' => ask_survey_summary($pdo, $tokenId)]);
            break;

        case 'demo-mint':
            if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
                throw new InvalidArgumentException('POST required');
            }
            if (empty($config['survey']['allowDemoMint'])) {
                throw new RuntimeException('Demo mint disabled');
            }
            $input = ask_input();
            $wallet = ask_wallet($input['walletAddress'] ?? '');
            $tokenId = (int) $pdo->query('SELECT COALESCE(MAX(token_id), 0) + 1 FROM survey_nfts')->fetchColumn();
            $stmt = $pdo->prepare('INSERT INTO survey_nfts (token_id, survey_id, payer_address, mint_tx_hash, mode, created_at) VALUES (?, ?, ?, ?, ?, ?)');
            $stmt->execute([
                $tokenId,
                (int) ($config['survey']['defaultSurveyId'] ?? 1),
                $wallet,
                'demo-' . bin2hex(random_bytes(8)),
                'demo',
                gmdate('c'),
            ]);
            ask_json(['ok' => true, 'tokenId' => $tokenId, 'survey' => ask_survey_summary($pdo, $tokenId)]);
            break;

        case 'register-mint':
            if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
                throw new InvalidArgumentException('POST required');
            }
            $input = ask_input();
            $wallet = ask_wallet($input['walletAddress'] ?? '');
            $tokenId = (int) ($input['tokenId'] ?? 0);
            $mintTxHash = trim((string) ($input['mintTxHash'] ?? ''));
            if ($tokenId < 1) {
                throw new InvalidArgumentException('tokenId is required');
            }
            $stmt = $pdo->prepare('INSERT OR IGNORE INTO survey_nfts (token_id, survey_id, payer_address, mint_tx_hash, mode, created_at) VALUES (?, ?, ?, ?, ?, ?)');
            $stmt->execute([
                $tokenId,
                (int) ($input['surveyId'] ?? $config['survey']['defaultSurveyId'] ?? 1),
                $wallet,
                $mintTxHash,
                'onchain',
                gmdate('c'),
            ]);
            ask_json(['ok' => true, 'tokenId' => $tokenId, 'survey' => ask_survey_summary($pdo, $tokenId)]);
            break;

        case 'answer':
            if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
                throw new InvalidArgumentException('POST required');
            }
            $input = ask_input();
            $wallet = ask_wallet($input['walletAddress'] ?? '');
            $tokenId = (int) ($input['tokenId'] ?? 0);
            $questionNo = (int) ($input['questionNo'] ?? 0);
            $answer = strtolower(trim((string) ($input['answer'] ?? '')));
            if ($tokenId < 1 || $questionNo < 1) {
                throw new InvalidArgumentException('tokenId and questionNo are required');
            }
            if (!in_array($answer, ['yes', 'no'], true)) {
                throw new InvalidArgumentException('answer must be yes or no');
            }
            $exists = $pdo->prepare('SELECT COUNT(*) FROM survey_nfts WHERE token_id = ?');
            $exists->execute([$tokenId]);
            if (!(int) $exists->fetchColumn()) {
                throw new RuntimeException('Survey pass not found');
            }
            $stmt = $pdo->prepare('INSERT INTO survey_answers (token_id, question_no, answer, wallet_address, answered_at)
                VALUES (?, ?, ?, ?, ?)
                ON CONFLICT(token_id, question_no) DO UPDATE SET answer = excluded.answer, wallet_address = excluded.wallet_address, answered_at = excluded.answered_at');
            $stmt->execute([$tokenId, $questionNo, $answer, $wallet, gmdate('c')]);
            ask_json(['ok' => true, 'survey' => ask_survey_summary($pdo, $tokenId)]);
            break;

        default:
            throw new InvalidArgumentException('Unknown action');
    }
} catch (Throwable $e) {
    ask_json([
        'ok' => false,
        'error' => $e->getMessage(),
    ], 400);
}
