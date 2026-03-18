# ask-mvp

MVP scaffold for `ask.skybutter.com` on DCAI L3.

## What this includes

- Wallet-connect survey UI (plain HTML/CSS/JS, no build step)
- PHP + SQLite API/backend for survey progress and answers
- Dynamic NFT metadata/image endpoints for future ERC-721 tokenURI use
- Solidity scaffold for `SurveyPassNFT`
- Demo mint mode when contract address is not configured yet

## Deploy shape

`public/` is the Apache docroot content for `ask.skybutter.com`.

## Next steps

1. Deploy `contracts/SurveyPassNFT.sol`
2. Put deployed contract address into `public/config.php`
3. Replace placeholder questions in SQLite seeding with real survey content
4. Optionally move SQLite to MySQL later
