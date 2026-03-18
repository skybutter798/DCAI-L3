<?php

declare(strict_types=1);
require dirname(__DIR__) . '/bootstrap.php';

$pdo = ask_db();
$config = ask_config();
$tokenId = (int) ($_GET['tokenId'] ?? 0);

if ($tokenId < 1) {
    http_response_code(400);
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode(['error' => 'tokenId required']);
    exit;
}

try {
    $survey = ask_survey_summary($pdo, $tokenId);
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode([
        'name' => sprintf('DCAI Survey Pass #%d', $tokenId),
        'description' => 'Survey ownership NFT for ASK on DCAI L3.',
        'image' => $config['base_url'] . '/nft/img.php?tokenId=' . $tokenId,
        'external_url' => $config['base_url'] . '/?tokenId=' . $tokenId,
        'attributes' => [
            ['trait_type' => 'Survey ID', 'value' => $survey['surveyId']],
            ['trait_type' => 'Answered', 'value' => $survey['answeredCount']],
            ['trait_type' => 'Total Questions', 'value' => $survey['totalQuestions']],
            ['trait_type' => 'Progress %', 'value' => $survey['progressPercent']],
            ['trait_type' => 'Mode', 'value' => $survey['mode']],
            ['trait_type' => 'Status', 'value' => $survey['completedAt'] ? 'Completed' : 'In Progress'],
        ],
    ], JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT);
} catch (Throwable $e) {
    http_response_code(404);
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode(['error' => $e->getMessage()]);
}
