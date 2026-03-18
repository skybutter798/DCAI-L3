<?php

declare(strict_types=1);
require dirname(__DIR__) . '/bootstrap.php';

$pdo = ask_db();
$tokenId = (int) ($_GET['tokenId'] ?? 0);
if ($tokenId < 1) {
    http_response_code(400);
    header('Content-Type: text/plain; charset=utf-8');
    echo 'tokenId required';
    exit;
}

try {
    $survey = ask_survey_summary($pdo, $tokenId);
    $progressWidth = max(0, min(100, (float) $survey['progressPercent']));
    $status = $survey['completedAt'] ? 'COMPLETED' : 'IN PROGRESS';
    $svg = <<<SVG
<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#0a1022"/>
      <stop offset="100%" stop-color="#16274d"/>
    </linearGradient>
    <linearGradient id="bar" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0%" stop-color="#f7c948"/>
      <stop offset="100%" stop-color="#ffde73"/>
    </linearGradient>
  </defs>
  <rect width="1200" height="630" fill="url(#bg)" rx="36"/>
  <text x="70" y="120" fill="#f7c948" font-size="34" font-family="Arial, sans-serif">ASK • DCAI L3</text>
  <text x="70" y="210" fill="#ffffff" font-size="68" font-weight="700" font-family="Arial, sans-serif">Survey Pass #{$tokenId}</text>
  <text x="70" y="278" fill="#c4d2ff" font-size="30" font-family="Arial, sans-serif">{$status}</text>
  <rect x="70" y="360" width="1060" height="34" rx="17" fill="#21345d"/>
  <rect x="70" y="360" width="{$progressWidth}%" height="34" rx="17" fill="url(#bar)"/>
  <text x="70" y="455" fill="#ffffff" font-size="42" font-family="Arial, sans-serif">{$survey['answeredCount']} / {$survey['totalQuestions']} answered</text>
  <text x="70" y="520" fill="#c4d2ff" font-size="28" font-family="Arial, sans-serif">Score: {$survey['score']} • Progress: {$survey['progressPercent']}%</text>
  <text x="70" y="575" fill="#8fa6dd" font-size="20" font-family="Arial, sans-serif">Ownership follows the NFT. Whoever holds it can continue the survey.</text>
</svg>
SVG;
    header('Content-Type: image/svg+xml; charset=utf-8');
    echo $svg;
} catch (Throwable $e) {
    http_response_code(404);
    header('Content-Type: text/plain; charset=utf-8');
    echo $e->getMessage();
}
