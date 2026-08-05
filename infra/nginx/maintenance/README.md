# Maintenance / takedown mask

Snapshot of the "server expired" mask that was live on infra-1 from 2026-08-01
until decommission: every route and method on `explorer.dcai.ai` returns the
blank expired page with HTTP 500, while the backend keeps running untouched
behind it.

## Files

- `dcai-testnet.expired.conf` — minimal 2-block replacement for
  `/etc/nginx/sites-available/dcai-testnet`
- `expired.html` — the page, installed at `/var/www/html/maintenance/expired.html`

## How it works / gotchas

- The `location / { return 500; }` + `error_page 500 /expired.html` form is
  required so POST/RPC requests also get the page instead of a 405; a
  `try_files` static form only works for GET.
- Do NOT try to graft a maintenance block into the full site config — the
  included tier map needs `$path_key` from the RPC locations, so `nginx -t`
  fails. Swap the whole site file instead.
- `/.well-known/acme-challenge/` stays open so certbot can renew while masked.
- 500 was chosen deliberately here; 503 is the semantically correct
  maintenance code if you don't need the "expired" look.

## Toggle

```bash
# ON: install this conf as the site file
cp dcai-testnet.expired.conf /etc/nginx/sites-available/dcai-testnet && nginx -t && systemctl reload nginx

# OFF: restore the full site config (repo copy: infra/nginx/dcai-testnet.conf
# plus real keys, or the *.preexpired.* backup on the server)
```
