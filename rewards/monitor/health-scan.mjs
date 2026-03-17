import fs from "node:fs";
import net from "node:net";
import { performance } from "node:perf_hooks";

function nowIso() { return new Date().toISOString(); }

async function timedFetch(url, opts = {}) {
  const t0 = performance.now();
  try {
    const res = await fetch(url, { ...opts, signal: AbortSignal.timeout(opts.timeoutMs || 2000) });
    const ms = performance.now() - t0;
    return { ok: res.ok, status: res.status, ms };
  } catch (e) {
    const ms = performance.now() - t0;
    return { ok: false, error: String(e.message || e), ms };
  }
}

async function rpcCheck(url) {
  return timedFetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_chainId", params: [] }),
    timeoutMs: 2500
  });
}

function tcpCheck(host, port, timeoutMs = 1500) {
  return new Promise((resolve) => {
    const t0 = performance.now();
    const socket = new net.Socket();
    let done = false;

    const finish = (obj) => {
      if (done) return;
      done = true;
      try { socket.destroy(); } catch {}
      obj.ms = performance.now() - t0;
      resolve(obj);
    };

    socket.setTimeout(timeoutMs);
    socket.once("connect", () => finish({ ok: true }));
    socket.once("timeout", () => finish({ ok: false, error: "TCP_TIMEOUT" }));
    socket.once("error", (e) => finish({ ok: false, error: e.code || e.message }));

    socket.connect(port, host);
  });
}

async function main() {
  const result = {
    generatedAt: nowIso(),
    nodes: {}
  };

  result.nodes["Infra"] = {
    nginx: await timedFetch("http://127.0.0.1/", { timeoutMs: 2000 }),
    faucet: await timedFetch("http://127.0.0.1:8080/", { timeoutMs: 2000 }),
    adminApi: await timedFetch("http://127.0.0.1:3001/cap", { timeoutMs: 2000 }),
  };

  result.nodes["RPC1"] = { rpc: await rpcCheck("http://139.180.188.61:8545/") };
  result.nodes["RPC2"] = { rpc: await rpcCheck("http://207.148.72.238:8545/") };

  // TCP reachability checks (SSH port)
  const signerIps = ["45.76.190.151","139.180.188.167","45.76.145.198"]; 
  for (const [i, ip] of signerIps.entries()) {
    result.nodes[`Signer${i+1}`] = { ssh: await tcpCheck(ip, 22, 1500) };
  }

  result.nodes["Indexer"] = { ssh: await tcpCheck("139.180.141.226", 22, 1500) };

  fs.writeFileSync("/var/www/html/admin/health.json", JSON.stringify(result, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
