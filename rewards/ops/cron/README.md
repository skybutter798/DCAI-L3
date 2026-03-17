# Cron job (epoch publisher)

This folder provides a minimal cron entrypoint to:

1. Convert a prepared `claims.json` into `epoch-out.json` (merkle root + proofs)
2. Publish the epoch on-chain via Hardhat

## Scripts

- `publish-epoch.sh` — publish from an already-prepared `claims.json`
- `run-epoch.sh` — probe + score + publish in one go

## What it does NOT do

- It does not randomize timing.
- It does not rotate admin keys.

Those are intentionally left to your scoring/ops layer.

## Install on your ops server

```bash
# On the ops box
mkdir -p /opt/dcai/rewards/{inbox,out}
cp publish-epoch.sh /opt/dcai/rewards/publish-epoch.sh
chmod +x /opt/dcai/rewards/publish-epoch.sh

# Put a claims file at:
# /opt/dcai/rewards/inbox/claims.json

# Add a crontab entry based on crontab.example
crontab -e
```

## Security note

Cron needs `PRIVATE_KEY`. For production, use a signer service or vault.
