#!/usr/bin/env python3
"""Atomically switch the live DCAI nginx entry to its canonical HTTPS domain.

The live nginx file contains generated API keys and an admin token, so this
script edits only the server-listen preamble and preserves the rest verbatim.
Run it only after certbot has issued the explorer.dcai.ai certificate.
"""

import os
import sys
import tempfile


DOMAIN = "explorer.dcai.ai"
DEFAULT_PATH = "/etc/nginx/sites-available/dcai-testnet"

HTTP_PREAMBLE = """server {
  include /etc/nginx/dcai-apikey-locations.conf;
  listen 80 default_server;
  listen [::]:80 default_server;
"""

# certbot's nginx authenticator needs a matching HTTP server name before the
# certificate exists. The live cutover may therefore see this temporary form.
HTTP_PREAMBLE_WITH_DOMAIN = HTTP_PREAMBLE + f"  server_name {DOMAIN};\n"

HTTPS_PREAMBLE = f"""server {{
  listen 80 default_server;
  listen [::]:80 default_server;
  server_name {DOMAIN} _;

  return 308 https://{DOMAIN}$request_uri;
}}

server {{
  include /etc/nginx/dcai-apikey-locations.conf;
  listen 443 ssl;
  listen [::]:443 ssl;
  http2 on;
  server_name {DOMAIN};

  ssl_certificate /etc/letsencrypt/live/{DOMAIN}/fullchain.pem;
  ssl_certificate_key /etc/letsencrypt/live/{DOMAIN}/privkey.pem;
  include /etc/letsencrypt/options-ssl-nginx.conf;
  ssl_dhparam /etc/letsencrypt/ssl-dhparams.pem;

  add_header Strict-Transport-Security "max-age=31536000" always;
"""

REQUIRED_TLS_FILES = (
    f"/etc/letsencrypt/live/{DOMAIN}/fullchain.pem",
    f"/etc/letsencrypt/live/{DOMAIN}/privkey.pem",
    "/etc/letsencrypt/options-ssl-nginx.conf",
    "/etc/letsencrypt/ssl-dhparams.pem",
)


def main():
    path = sys.argv[1] if len(sys.argv) > 1 else DEFAULT_PATH
    missing = [item for item in REQUIRED_TLS_FILES if not os.path.exists(item)]
    if missing:
        raise SystemExit("TLS prerequisites are missing: " + ", ".join(missing))

    with open(path, "r", encoding="utf-8") as handle:
        text = handle.read()

    if HTTPS_PREAMBLE in text:
        print(f"canonical HTTPS domain already configured in {path}")
        return
    source_preamble = (
        HTTP_PREAMBLE_WITH_DOMAIN
        if text.count(HTTP_PREAMBLE_WITH_DOMAIN) == 1
        else HTTP_PREAMBLE
    )
    if text.count(source_preamble) != 1:
        raise SystemExit("expected the HTTP server preamble exactly once")

    updated = text.replace(source_preamble, HTTPS_PREAMBLE, 1)
    mode = os.stat(path).st_mode & 0o777
    directory = os.path.dirname(os.path.abspath(path))
    fd, temporary = tempfile.mkstemp(prefix=".dcai-domain-", dir=directory)
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as handle:
            handle.write(updated)
        os.chmod(temporary, mode)
        os.replace(temporary, path)
    finally:
        try:
            os.unlink(temporary)
        except FileNotFoundError:
            pass
    print(f"configured canonical HTTPS domain {DOMAIN} in {path}")


if __name__ == "__main__":
    main()
