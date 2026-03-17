import http from 'node:http';
import fs from 'node:fs';

const LOG_PATH = '/var/log/nginx/rpc_access.log';
const STORE_DIR = '/opt/dcai/apikey';
const OUT_PATH = STORE_DIR + '/usage.json';
const STATE_PATH = STORE_DIR + '/usage-state.json';
const LISTEN_HOST = '127.0.0.1';
const LISTEN_PORT = 3999;

function loadJson(p, fallback) {
  try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch { return fallback; }
}

function saveJsonAtomic(p, obj) {
  const tmp = p + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(obj, null, 2));
  fs.renameSync(tmp, p);
}

function ensureStore() {
  fs.mkdirSync(STORE_DIR, { recursive: true });
  if (!fs.existsSync(LOG_PATH)) fs.writeFileSync(LOG_PATH, '');
}

function isoDay(iso) { return String(iso || '').slice(0, 10); }
function isoMinute(iso) { return String(iso || '').slice(0, 16); }

function pruneMinuteMap(obj, keepMinutes = 24 * 60) {
  const keys = Object.keys(obj || {});
  if (keys.length <= keepMinutes) return;
  keys.sort();
  const drop = keys.slice(0, Math.max(0, keys.length - keepMinutes));
  for (const k of drop) delete obj[k];
}

function bump(obj, key, delta = 1) {
  obj[key] = (obj[key] || 0) + delta;
}

function ensureKeyRec(usage, apikey, tier, ts) {
  usage.keys ||= {};
  usage.keys[apikey] ||= {
    tier: tier || 'unknown',
    lastSeen: ts || null,
    byDay: {},
    byMinute: {},
    byDayStatus: {},
    byMinuteStatus: {},
    methodsByDay: {},
    methodsByMinute: {},
    latByDay: {},
    latByMinute: {},
  };
  const rec = usage.keys[apikey];

  // migrate old records
  rec.byDay ||= {};
  rec.byMinute ||= {};
  rec.byDayStatus ||= {};
  rec.byMinuteStatus ||= {};
  rec.methodsByDay ||= {};
  rec.methodsByMinute ||= {};
  rec.latByDay ||= {};
  rec.latByMinute ||= {};

  if (tier) rec.tier = tier;
  if (ts) rec.lastSeen = ts;
  return rec;
}


function bucketLatencyMs(ms) {
  // coarse buckets (ms)
  if (ms <= 5) return 'le5';
  if (ms <= 10) return 'le10';
  if (ms <= 25) return 'le25';
  if (ms <= 50) return 'le50';
  if (ms <= 100) return 'le100';
  if (ms <= 250) return 'le250';
  if (ms <= 500) return 'le500';
  if (ms <= 1000) return 'le1000';
  if (ms <= 2500) return 'le2500';
  if (ms <= 5000) return 'le5000';
  return 'gt5000';
}

function bumpLatency(rec, day, min, requestTimeSec) {
  const ms = Math.max(0, Math.round((Number(requestTimeSec) || 0) * 1000));
  const b = bucketLatencyMs(ms);
  rec.latByDay[day] ||= {};
  rec.latByMinute[min] ||= {};
  bump(rec.latByDay[day], b, 1);
  bump(rec.latByMinute[min], b, 1);
  pruneMinuteMap(rec.latByMinute, 24 * 60);
}

function bumpStatus(rec, day, min, statusCode) {
  const sc = Number(statusCode) || 0;
  const cls = sc >= 100 ? `${Math.floor(sc / 100)}xx` : 'other';
  rec.byDayStatus[day] ||= {};
  rec.byMinuteStatus[min] ||= {};

  bump(rec.byDayStatus[day], cls, 1);
  bump(rec.byMinuteStatus[min], cls, 1);

  // also keep exact 401/429 counters
  if (sc === 401 || sc === 429) {
    bump(rec.byDayStatus[day], String(sc), 1);
    bump(rec.byMinuteStatus[min], String(sc), 1);
  }

  pruneMinuteMap(rec.byMinuteStatus, 24 * 60);
}

function bumpMethod(rec, day, min, method) {
  if (!method) return;
  rec.methodsByDay[day] ||= {};
  rec.methodsByMinute[min] ||= {};
  bump(rec.methodsByDay[day], method, 1);
  bump(rec.methodsByMinute[min], method, 1);
  pruneMinuteMap(rec.methodsByMinute, 24 * 60);
}

function statKey(path) {
  try {
    const st = fs.statSync(path);
    return { ino: st.ino, size: st.size };
  } catch {
    return { ino: null, size: 0 };
  }
}

let usage = loadJson(OUT_PATH, { generatedAt: new Date().toISOString(), keys: {} });
let state = loadJson(STATE_PATH, { ino: null, pos: 0, partial: '' });

function processTrafficLines(lines) {
  for (const line of lines) {
    if (!line.trim()) continue;
    const parts = line.split('\t');
    if (parts.length < 8) continue;
    const [ts, tier, key, status] = parts;
    const apikey = String(key || '').trim();
    const t = String(tier || '').trim();
    if (!apikey) continue;

    const rec = ensureKeyRec(usage, apikey, t, ts);
    const day = isoDay(ts);
    const min = isoMinute(ts);

    bump(rec.byDay, day, 1);
    bump(rec.byMinute, min, 1);
    pruneMinuteMap(rec.byMinute, 24 * 60);

    bumpStatus(rec, day, min, status);
    bumpLatency(rec, day, min, parts[4]);
  }
}

function tickTraffic() {
  ensureStore();
  const st = statKey(LOG_PATH);

  let pos = Number(state.pos || 0);
  let partial = String(state.partial || '');

  // rotation/truncate
  if (state.ino != null && st.ino != null && state.ino != st.ino) {
    pos = 0;
    partial = '';
  }
  if (pos > st.size) {
    pos = 0;
    partial = '';
  }

  const toRead = st.size - pos;
  if (toRead <= 0) {
    state = { ino: st.ino, pos, partial };
    usage.generatedAt = new Date().toISOString();
    saveJsonAtomic(OUT_PATH, usage);
    saveJsonAtomic(STATE_PATH, state);
    return;
  }

  const fd = fs.openSync(LOG_PATH, 'r');
  try {
    const buf = Buffer.alloc(toRead);
    const n = fs.readSync(fd, buf, 0, toRead, pos);
    pos = pos + n;
    let text = partial + buf.slice(0, n).toString('utf8');
    const lines = text.split('\n');
    partial = lines.pop() || '';

    processTrafficLines(lines);

    state = { ino: st.ino, pos, partial };
    usage.generatedAt = new Date().toISOString();
    saveJsonAtomic(OUT_PATH, usage);
    saveJsonAtomic(STATE_PATH, state);
  } finally {
    fs.closeSync(fd);
  }
}

function topN(mapObj, n = 8) {
  const arr = Object.entries(mapObj || {}).map(([k, v]) => [k, Number(v) || 0]);
  arr.sort((a, b) => b[1] - a[1]);
  return arr.slice(0, n).map(([k, v]) => ({ method: k, count: v }));
}

const server = http.createServer(async (req, res) => {
  try {
    if (req.method === 'POST' && (req.url === '/ingest' || req.url?.startsWith('/ingest?'))) {
      const apikey = String(req.headers['x-apikey'] || '').trim();
      const tier = String(req.headers['x-tier'] || '').trim();
      if (!apikey) {
        res.writeHead(204);
        res.end();
        return;
      }

      let body = '';
      req.on('data', (c) => {
        body += c;
        if (body.length > 1_000_000) req.destroy();
      });
      await new Promise((resolve) => req.on('end', resolve));

      let parsed = null;
      try { parsed = JSON.parse(body || '{}'); } catch { parsed = null; }

      const ts = new Date().toISOString();
      const day = isoDay(ts);
      const min = isoMinute(ts);
      const rec = ensureKeyRec(usage, apikey, tier, ts);

      const pushMethod = (m) => {
        if (typeof m === 'string' && m.length) bumpMethod(rec, day, min, m);
      };

      if (Array.isArray(parsed)) {
        for (const item of parsed) pushMethod(item?.method);
      } else {
        pushMethod(parsed?.method);
      }

      // persist soon; we rely on tickTraffic flush as well, but do quick flush for mirror updates
      usage.generatedAt = new Date().toISOString();
      saveJsonAtomic(OUT_PATH, usage);

      res.writeHead(204);
      res.end();
      return;
    }

    if (req.method === 'GET' && req.url === '/health') {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ ok: true }));
      return;
    }

    res.writeHead(404);
    res.end('not found');
  } catch (e) {
    res.writeHead(500);
    res.end('error');
  }
});

server.listen(LISTEN_PORT, LISTEN_HOST, () => {
  // eslint-disable-next-line no-console
  console.log('usage collector listening on http://' + LISTEN_HOST + ':' + LISTEN_PORT);
});

ensureStore();
setInterval(() => {
  try { tickTraffic(); } catch (e) {
    try { process.stderr.write('[usage-collector] ' + (e?.stack || e) + '\n'); } catch {}
  }
}, 5000);

try { tickTraffic(); } catch {}
