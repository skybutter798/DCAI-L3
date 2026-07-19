#!/usr/bin/env python3
import http.client
import json
import re
import time


CONFIG = "/etc/nginx/sites-available/dcai-testnet"
REQUESTS = 126


def api_key():
    with open(CONFIG, "r", encoding="utf-8") as handle:
        text = handle.read()
    match = re.search(r'map\s+\$http_x_api_key\s+\$rpc_key_ok\s*\{[\s\S]*?"([0-9a-fA-F]{32})"\s+1\s*;', text)
    if not match:
        raise RuntimeError("no legacy validation key found")
    return match.group(1)


def main():
    key = api_key()
    payload = json.dumps({"jsonrpc": "2.0", "id": 1, "method": "eth_chainId", "params": []})
    routes = {}
    failures = []
    for index in range(REQUESTS):
        connection = http.client.HTTPConnection("127.0.0.1", 80, timeout=10)
        try:
            connection.request("POST", "/rpc/", payload, {
                "Content-Type": "application/json",
                "X-API-Key": key,
            })
            response = connection.getresponse()
            body = response.read()
            route = response.getheader("X-DCAI-Route") or "foundation-direct"
            routes[route] = routes.get(route, 0) + 1
            data = json.loads(body)
            if response.status != 200 or data.get("result") != "0x4809":
                failures.append({"request": index + 1, "status": response.status})
        except Exception as error:
            failures.append({"request": index + 1, "error": str(error)})
        finally:
            connection.close()
        time.sleep(0.12)

    routed = sum(count for route, count in routes.items() if route != "foundation-direct")
    result = {
        "ok": not failures and 1 <= routed <= 20,
        "requests": REQUESTS,
        "validChainResponses": REQUESTS - len(failures),
        "routes": routes,
        "routerSharePercent": round(100 * routed / REQUESTS, 2),
        "failureCount": len(failures),
    }
    print(json.dumps(result))
    if not result["ok"]:
        raise SystemExit(1)


if __name__ == "__main__":
    main()
