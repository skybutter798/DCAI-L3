#!/usr/bin/env python3
import os
import sys
import tempfile


OLD_RPC1 = "  server 139.180.188.61:8545 max_fails=3 fail_timeout=10s;"
OLD_RPC2 = "  server 207.148.72.238:8545 max_fails=3 fail_timeout=10s;"
NEW_RPC1 = "  server 139.180.188.61:8545 weight=20 max_fails=3 fail_timeout=10s;"
NEW_RPC2 = "  server 207.148.72.238:8545 weight=20 max_fails=3 fail_timeout=10s;"
ROUTER = "  server 127.0.0.1:3998 weight=2 max_fails=1 fail_timeout=5s;"


def main():
    path = sys.argv[1] if len(sys.argv) > 1 else "/etc/nginx/sites-available/dcai-testnet"
    with open(path, "r", encoding="utf-8") as handle:
        text = handle.read()

    if ROUTER in text:
        if NEW_RPC1 not in text or NEW_RPC2 not in text:
            raise SystemExit("router exists but Foundation weights are inconsistent")
        print("nginx contributor canary already configured")
        return
    if text.count(OLD_RPC1) != 1 or text.count(OLD_RPC2) != 1:
        raise SystemExit("expected Foundation RPC upstream lines were not found exactly once")

    text = text.replace(OLD_RPC1, NEW_RPC1, 1)
    text = text.replace(OLD_RPC2, NEW_RPC2 + "\n" + ROUTER, 1)
    mode = os.stat(path).st_mode & 0o777
    directory = os.path.dirname(os.path.abspath(path))
    fd, temp_path = tempfile.mkstemp(prefix=".dcai-testnet-", dir=directory)
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as handle:
            handle.write(text)
        os.chmod(temp_path, mode)
        os.replace(temp_path, path)
    finally:
        try:
            os.unlink(temp_path)
        except FileNotFoundError:
            pass
    print("nginx contributor canary configured")


if __name__ == "__main__":
    main()
