import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));

async function freePort() {
  const server = http.createServer();
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  await new Promise((resolve) => server.close(resolve));
  return port;
}

async function waitFor(url, attempts = 40) {
  for (let attempt = 0; attempt < attempts; attempt++) {
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error('router did not become ready');
}

test('routes safely to an official RPC when no verified contributor exists', async () => {
  const officialPort = await freePort();
  const routerPort = await freePort();
  const official = http.createServer(async (req, res) => {
    let body = '';
    for await (const chunk of req) body += chunk;
    const call = JSON.parse(body);
    const result = call.method === 'eth_blockNumber' ? '0x100' : '18441';
    res.writeHead(200, { 'Content-Type':'application/json' });
    res.end(JSON.stringify({ jsonrpc:'2.0', id:call.id, result }));
  });
  await new Promise((resolve) => official.listen(officialPort, '127.0.0.1', resolve));

  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dcai-router-'));
  const configPath = path.join(dir, 'config.json');
  const statsPath = path.join(dir, 'stats.json');
  fs.writeFileSync(configPath, JSON.stringify({ operators:[] }));
  const child = spawn(process.execPath, [path.join(here, 'contributor-router.mjs')], {
    env:{
      ...process.env,
      CONTRIBUTOR_ROUTER_PORT:String(routerPort),
      CONFIG_PATH:configPath,
      TRAFFIC_STATS_PATH:statsPath,
      OFFICIAL_RPC_URLS:`http://127.0.0.1:${officialPort}`,
    },
    stdio:'ignore',
  });

  try {
    await waitFor(`http://127.0.0.1:${routerPort}/health`);
    const response = await fetch(`http://127.0.0.1:${routerPort}/`, {
      method:'POST', headers:{ 'Content-Type':'application/json' },
      body:JSON.stringify({ jsonrpc:'2.0', id:9, method:'net_version', params:[] }),
    });
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('x-dcai-route'), 'official-fallback');
    assert.equal((await response.json()).result, '18441');
  } finally {
    child.kill('SIGTERM');
    await new Promise((resolve) => official.close(resolve));
    fs.rmSync(dir, { recursive:true, force:true });
  }
});
