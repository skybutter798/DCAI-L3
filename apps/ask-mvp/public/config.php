<?php
return [
    'app_name' => 'ASK — DCAI Survey Pass',
    'base_url' => 'https://ask.skybutter.com',
    'chain' => [
        'chainId' => 18441,
        'chainIdHex' => '0x4809',
        'chainName' => 'DCAI L3 Testnet',
        'nativeCurrency' => [
            'name' => 'tDCAI',
            'symbol' => 'tDCAI',
            'decimals' => 18,
        ],
        'rpcUrls' => [
            'http://139.180.188.61:8545',
            'http://207.148.72.238:8545',
        ],
        'blockExplorerUrls' => [
            'http://139.180.140.143/',
        ],
    ],
    'survey' => [
        'defaultSurveyId' => 1,
        'totalQuestions' => 100,
        'mintPriceWei' => '1000000000000000000',
        'mintPriceDisplay' => '1',
        'contractAddress' => '',
        'allowDemoMint' => true,
        'demoModeLabel' => 'Demo mint enabled until SurveyPassNFT is deployed',
    ],
    'storage' => [
        'sqlite' => __DIR__ . '/storage/ask.sqlite',
    ],
];
