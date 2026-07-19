#!/usr/bin/env python3
import http.server
import hmac
import ipaddress
import json
import os
import re
import socket
import time
from datetime import datetime, timezone

PORT = int(os.environ.get("PEER_AGENT_PORT", "3090"))
IPC_PATH = os.environ.get("GETH_IPC_PATH", "/opt/dcai/rpc/data/geth.ipc")
ENV_PATH = os.environ.get("PEER_AGENT_ENV", "/etc/dcai-p2p-agent.env")
ALLOWED_CLIENTS = {
    value.strip()
    for value in os.environ.get(
        "PEER_AGENT_ALLOWED_IPS", "139.180.140.143,127.0.0.1,::1"
    ).split(",")
    if value.strip()
}
ENODE_RE = re.compile(
    r"^enode://([0-9a-f]{128})@((?:\d{1,3}\.){3}\d{1,3}):(\d{1,5})$",
    re.IGNORECASE,
)


def read_env_value(path, key):
    with open(path, "r", encoding="utf-8") as handle:
        for line in handle:
            if line.startswith(key + "="):
                return line.split("=", 1)[1].strip()
    return ""


TOKEN = os.environ.get("P2P_AGENT_TOKEN") or read_env_value(
    ENV_PATH, "P2P_AGENT_TOKEN"
)
if not re.fullmatch(r"[0-9a-fA-F]{64}", TOKEN or ""):
    raise RuntimeError("P2P_AGENT_TOKEN is missing or invalid")


def utc_now():
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def ipc_call(method, params=None, timeout=5):
    request = {
        "jsonrpc": "2.0",
        "id": int(time.time_ns()),
        "method": method,
        "params": params or [],
    }
    client = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
    client.settimeout(timeout)
    try:
        client.connect(IPC_PATH)
        client.sendall((json.dumps(request) + "\n").encode("utf-8"))
        chunks = []
        while True:
            chunk = client.recv(65536)
            if not chunk:
                break
            chunks.append(chunk)
            try:
                response = json.loads(b"".join(chunks).decode("utf-8"))
                if response.get("error"):
                    raise RuntimeError(
                        response["error"].get("message", "geth IPC error")
                    )
                return response.get("result")
            except json.JSONDecodeError:
                continue
        raise RuntimeError("geth IPC closed before a complete response")
    finally:
        client.close()


def parse_enode(value):
    enode = str(value or "").strip()
    match = ENODE_RE.fullmatch(enode)
    if not match:
        raise ValueError(
            "enode must use enode://<128 hex node id>@<public IPv4>:<port>"
        )
    address = ipaddress.ip_address(match.group(2))
    port = int(match.group(3))
    if not address.is_global or port < 1 or port > 65535:
        raise ValueError("enode address or port is invalid")
    return {
        "enode": enode,
        "nodeId": match.group(1).lower(),
        "address": str(address),
        "port": port,
    }


def snapshot():
    node_info = ipc_call("admin_nodeInfo") or {}
    peers = ipc_call("admin_peers") or []
    block_number = int(ipc_call("eth_blockNumber") or "0x0", 16)
    syncing = ipc_call("eth_syncing")
    return {
        "ok": True,
        "observedAt": utc_now(),
        "node": {
            "id": str(node_info.get("id", "")).lower(),
            "enode": node_info.get("enode", ""),
        },
        "blockNumber": block_number,
        "syncing": syncing,
        "peers": [
            {
                "id": str(peer.get("id", "")).lower(),
                "enode": peer.get("enode", ""),
                "name": peer.get("name", ""),
                "remoteAddress": peer.get("network", {}).get(
                    "remoteAddress", ""
                ),
                "inbound": bool(peer.get("network", {}).get("inbound")),
            }
            for peer in peers
        ],
    }


def connect_peer(enode):
    parsed = parse_enode(enode)
    peers = ipc_call("admin_peers") or []
    was_connected = any(
        str(peer.get("id", "")).lower() == parsed["nodeId"] for peer in peers
    )
    if not was_connected:
        ipc_call("admin_addPeer", [parsed["enode"]])
    for _ in range(12):
        peers = ipc_call("admin_peers") or []
        for peer in peers:
            if str(peer.get("id", "")).lower() == parsed["nodeId"]:
                return {
                    "ok": True,
                    "connected": True,
                    "wasConnected": was_connected,
                    "nodeId": parsed["nodeId"],
                    "peer": {
                        "enode": peer.get("enode", ""),
                        "name": peer.get("name", ""),
                        "remoteAddress": peer.get("network", {}).get(
                            "remoteAddress", ""
                        ),
                    },
                }
        time.sleep(1)
    if not was_connected:
        try:
            ipc_call("admin_removePeer", [parsed["enode"]])
        except Exception:
            pass
    return {
        "ok": False,
        "connected": False,
        "wasConnected": was_connected,
        "nodeId": parsed["nodeId"],
        "error": "peer did not connect within 12 seconds",
    }


class Handler(http.server.BaseHTTPRequestHandler):
    server_version = "DCAIPeerAgent/1.0"

    def log_message(self, fmt, *args):
        print("%s - %s" % (self.client_address[0], fmt % args), flush=True)

    def send_json(self, status, body):
        payload = json.dumps(body, separators=(",", ":")).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Cache-Control", "no-store")
        self.send_header("Content-Length", str(len(payload)))
        self.end_headers()
        self.wfile.write(payload)

    def authorized(self):
        remote = self.client_address[0]
        bearer = self.headers.get("Authorization", "")
        if bearer.lower().startswith("bearer "):
            bearer = bearer[7:]
        return remote in ALLOWED_CLIENTS and hmac.compare_digest(bearer, TOKEN)

    def read_json(self):
        length = int(self.headers.get("Content-Length", "0"))
        if length < 1 or length > 4096:
            raise ValueError("invalid request body size")
        return json.loads(self.rfile.read(length).decode("utf-8"))

    def do_GET(self):
        try:
            if self.path == "/health":
                return self.send_json(
                    200,
                    {
                        "ok": True,
                        "blockNumber": int(
                            ipc_call("eth_blockNumber") or "0x0", 16
                        ),
                    },
                )
            if not self.authorized():
                return self.send_json(403, {"ok": False, "error": "forbidden"})
            if self.path == "/v1/status":
                return self.send_json(200, snapshot())
            return self.send_json(404, {"ok": False, "error": "not found"})
        except Exception as error:
            return self.send_json(500, {"ok": False, "error": str(error)})

    def do_POST(self):
        try:
            if not self.authorized():
                return self.send_json(403, {"ok": False, "error": "forbidden"})
            body = self.read_json()
            if self.path == "/v1/peers/connect":
                result = connect_peer(body.get("enode"))
                return self.send_json(200 if result["ok"] else 422, result)
            if self.path == "/v1/peers/remove":
                parsed = parse_enode(body.get("enode"))
                removed = bool(ipc_call("admin_removePeer", [parsed["enode"]]))
                return self.send_json(
                    200,
                    {"ok": True, "removed": removed, "nodeId": parsed["nodeId"]},
                )
            return self.send_json(404, {"ok": False, "error": "not found"})
        except Exception as error:
            return self.send_json(500, {"ok": False, "error": str(error)})


class Server(http.server.ThreadingHTTPServer):
    daemon_threads = True


if __name__ == "__main__":
    server = Server(("0.0.0.0", PORT), Handler)
    print(f"DCAI peer agent listening on {PORT}", flush=True)
    server.serve_forever()
