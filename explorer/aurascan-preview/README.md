# Aurascan Preview (DCAI Explorer UI Prototype)

This folder contains the Vite/React UI prototype currently served on the Infra host.

## Live Preview

- Preview URL: `http://139.180.140.143:3002/`

## On-Server Paths (Infra host)

- Source directory: `/opt/aurascan-explorer`
- Nginx config (bind-mounted into preview container): `/opt/aurascan-explorer/nginx.conf`
- Container: `aurascan_preview` (nginx)

## Development

```bash
cd explorer/aurascan-preview
npm install
npm run dev
```

## Build

```bash
npm run build
```

> `dist/` is generated output and is not committed by default.

## API + RPC

The preview nginx proxies:

- Blockscout API via `/api/*` (to Blockscout backend on the same host)
- RPC via `/rpc1/`

