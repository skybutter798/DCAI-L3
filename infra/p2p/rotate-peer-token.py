#!/usr/bin/env python3
import os
import re
import sys
import tempfile


def main():
    if len(sys.argv) != 3:
        raise SystemExit("usage: rotate-peer-token.py ENV_FILE TOKEN_FILE")
    env_path, token_path = sys.argv[1:]
    with open(token_path, "r", encoding="utf-8") as handle:
        token = handle.read().strip()
    if not re.fullmatch(r"[0-9a-f]{64}", token):
        raise SystemExit("token file must contain exactly 32 random bytes as hex")

    try:
        with open(env_path, "r", encoding="utf-8") as handle:
            lines = handle.read().splitlines()
    except FileNotFoundError:
        lines = []

    replacement = "P2P_AGENT_TOKEN=" + token
    output = []
    replaced = False
    for line in lines:
        if line.startswith("P2P_AGENT_TOKEN="):
            if not replaced:
                output.append(replacement)
                replaced = True
        else:
            output.append(line)
    if not replaced:
        output.append(replacement)

    directory = os.path.dirname(os.path.abspath(env_path))
    fd, temp_path = tempfile.mkstemp(prefix=".p2p-token-", dir=directory)
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as handle:
            handle.write("\n".join(output) + "\n")
        os.chmod(temp_path, 0o600)
        os.replace(temp_path, env_path)
    finally:
        try:
            os.unlink(temp_path)
        except FileNotFoundError:
            pass


if __name__ == "__main__":
    main()
