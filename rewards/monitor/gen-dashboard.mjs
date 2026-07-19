import fs from 'node:fs';
import { ethers } from 'ethers';
import { CONTRIBUTOR_TIERS, policyForOperator } from './contributor-policy.mjs';

const RPC_URL = process.env.RPC_URL || 'http://139.180.188.61:8545';
const DASHBOARD_OUTPUT = process.env.DASHBOARD_OUTPUT || '/var/www/html/admin/index.html';
const TREASURY_ADDR = '0xae201c3daacd53e4cb305fa91678b16cc7eae43a';
const DISTRIBUTOR_ADDR = '0x728f2C63b9A0ff0918F5ffB3D4C2d004107476B7';

// Infrastructure Map
const INFRA = [
  { name: 'Signer 1 (Sealer)', ip: '45.76.190.151', role: 'Consensus', type: 'Core' },
  { name: 'Signer 2 (Sealer)', ip: '139.180.188.167', role: 'Consensus', type: 'Core' },
  { name: 'Signer 3 (Sealer)', ip: '45.76.145.198', role: 'Consensus', type: 'Core' },
  { name: 'RPC 1 (Gateway)', ip: '139.180.188.61', role: 'API/HTTP', type: 'Gate' },
  { name: 'RPC 2 (Gateway)', ip: '207.148.72.238', role: 'API/HTTP', type: 'Gate' },
  { name: 'Indexer Node', ip: '139.180.141.226', role: 'Indexer', type: 'L3' },
  { name: 'Infra (Explorer/Faucet)', ip: '139.180.140.143', role: 'Public UI', type: 'Hub' }
];

async function main() {
  const provider = new ethers.JsonRpcProvider(RPC_URL);

  let treasuryBal = 0n;
  let distributorBal = 0n;
  let blockNumber = 0;
  try {
    treasuryBal = await provider.getBalance(TREASURY_ADDR);
    distributorBal = await provider.getBalance(DISTRIBUTOR_ADDR);
    blockNumber = await provider.getBlockNumber();
  } catch (e) { console.error('Balance check failed', e); }

  const config = JSON.parse(fs.readFileSync('/opt/dcai/rewards/monitor/config.json', 'utf8'));

  let measurements = { epochId: 'N/A', dayId: 'N/A', operators: [] };
  for (const p of ['/opt/dcai/rewards/monitor/measurements.json', '/opt/dcai/rewards/inbox/measurements.json']) {
    if (fs.existsSync(p)) { measurements = JSON.parse(fs.readFileSync(p, 'utf8')); break; }
  }

  let latestRewards = null;
  try { latestRewards = JSON.parse(fs.readFileSync('/var/www/html/rewards/latest.json', 'utf8')); } catch (e) { latestRewards = null; }
  const latestEpochId = latestRewards?.epochId ?? 'N/A';
  const latestTotalWei = latestRewards?.totalWei ? BigInt(latestRewards.totalWei) : 0n;

  // 4-key canonical weights. Fall back per-key so a stale 3-key config still renders.
  const n = (v, d) => { const x = Number(v); return Number.isFinite(x) && x >= 0 ? x : d; };
  const rawW = config.weights || {};
  const W = { rpc: n(rawW.rpc, 40), indexer: n(rawW.indexer, 20), storage: n(rawW.storage, 30), multiregion: n(rawW.multiregion, 10) };
  const wSum = (W.rpc + W.indexer + W.storage + W.multiregion) || 1;
  const wPct = (v) => ((v / wSum) * 100).toFixed(0);

  const distAbi = [
    'function dailyCapWei() view returns (uint256)',
    'function dailySpentWei(uint256 dayId) view returns (uint256)'
  ];
  const dist = new ethers.Contract(DISTRIBUTOR_ADDR, distAbi, provider);
  const dayId = Number(measurements.dayId) || Number(new Date().toISOString().slice(0, 10).replaceAll('-', ''));
  let dailyCapWei = 0n;
  let dailySpentWei = 0n;
  try {
    dailyCapWei = BigInt(await dist.dailyCapWei());
    dailySpentWei = BigInt(await dist.dailySpentWei(dayId));
  } catch (e) { console.error('cap read failed', e); }
  const dailyRemainWei = dailyCapWei - dailySpentWei;
  const capNum = Number(ethers.formatEther(dailyCapWei)) || 0;
  const spentNum = Number(ethers.formatEther(dailySpentWei)) || 0;
  const spentPct = capNum > 0 ? Math.min(100, (spentNum / capNum) * 100) : 0;

  // Recent published epochs (on-chain events), today only
  let recentRewardEpochIds = [];
  try {
    const iface = new ethers.Interface([
      'event EpochPublished(uint256 indexed epochId,uint256 indexed dayId,bytes32 merkleRoot,uint256 totalWei)'
    ]);
    const topic0 = iface.getEvent('EpochPublished').topicHash;
    const latestBlock = await provider.getBlockNumber();
    const fromBlock = Math.max(0, latestBlock - 50000);
    const logs = await provider.getLogs({ address: DISTRIBUTOR_ADDR, fromBlock, toBlock: latestBlock, topics: [topic0] });
    const todayDayId = BigInt(dayId);
    const items = [];
    for (const log of logs) {
      const parsed = iface.parseLog(log);
      if (BigInt(parsed.args.dayId.toString()) !== todayDayId) continue;
      items.push(parsed.args.epochId.toString());
    }
    recentRewardEpochIds = Array.from(new Set(items)).sort().reverse().slice(0, 12);
  } catch (e) { recentRewardEpochIds = []; }

  const fmt4 = (wei) => { try { const p = ethers.formatEther(wei).split('.'); return p.length === 1 ? p[0] : p[0] + '.' + p[1].slice(0, 4); } catch { return '--'; } };
  const fmt2 = (wei) => { try { return Number(ethers.formatEther(wei)).toFixed(2); } catch { return '--'; } };
  const epochsToday = recentRewardEpochIds.length;

  // Merge config operators with any measured scores for the Operators table
  const opRows = (config.operators || []).map((op) => {
    const meas = (measurements.operators || []).find((m) => String(m.operator).toLowerCase() === String(op.operator).toLowerCase());
    const svc = op.services || {};
    const enabled = Object.entries(svc).filter(([, v]) => v).map(([k]) => k);
    const policy = policyForOperator(op);
    return {
      operator: op.operator, services: svc, enabled, endpoints: op.endpoints || {}, hasMeasurement: !!meas,
      programTier:policy.key, rewardFactor:policy.rewardFactor,
      contributionPolicyVersion:op.contributionPolicyVersion || 'v1', p2p:op.p2p || null,
    };
  });

  const esc = (s) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const shortAddr = (a) => a ? (a.slice(0, 8) + '…' + a.slice(-6)) : '--';

  const html = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>DCAI L3 · Foundation Control</title>
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="robots" content="noindex,nofollow">
  <script src="https://cdn.tailwindcss.com"></script>
  <script>
    tailwind.config = { theme: { extend: {
      colors: {
        ink: { 950:'#07080a', 900:'#0c0e11', 850:'#101318', 800:'#12151a', 750:'#171b21', 700:'#1e232b' },
        gold: { DEFAULT:'#f0b90b', 2:'#ffd34d' },
        aqua: { DEFAULT:'#22d3ee', 2:'#67e8f9' },
      },
      fontFamily: { sans:['Inter','system-ui','sans-serif'], mono:['"JetBrains Mono"','ui-monospace','monospace'] },
    } } };
  </script>
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400;500;700&display=swap');
    body { font-family:'Inter',sans-serif; background:#07080a; }
    .mono { font-family:'JetBrains Mono',monospace; }
    .tnum { font-variant-numeric: tabular-nums; }
    .keyline { height:1px; background:linear-gradient(90deg, rgba(240,185,11,0) 0%, rgba(240,185,11,.5) 30%, rgba(34,211,238,.5) 60%, rgba(240,185,11,0) 100%); }
    input[type=range]{ -webkit-appearance:none; background:transparent; }
    input[type=range]::-webkit-slider-runnable-track{ height:4px; border-radius:2px; background:#1e232b; }
    input[type=range]::-webkit-slider-thumb{ -webkit-appearance:none; height:16px; width:16px; border-radius:50%; background:#f0b90b; cursor:pointer; margin-top:-6px; }
    ::-webkit-scrollbar{ width:8px; height:8px; } ::-webkit-scrollbar-track{ background:#07080a; } ::-webkit-scrollbar-thumb{ background:#232833; border-radius:4px; }
    .card{ background:#12151a; border:1px solid #232833; border-radius:14px; }
    .subtle{ color:#6e7683; }
    .admin-tab[aria-selected="true"]{ color:#07080a; background:#f0b90b; border-color:#f0b90b; }
    .admin-tab[aria-selected="false"]{ color:#a2a9b4; background:#0c0e11; border-color:#232833; }
    .admin-tab[aria-selected="false"]:hover{ color:#fff; border-color:#303747; }
    [data-tab-panel][hidden]{ display:none; }
  </style>
</head>
<body class="text-[#e8eaee]">
  <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">

    <!-- Header -->
    <header class="flex flex-wrap items-center justify-between gap-3 pb-4">
      <div class="flex items-center gap-3">
        <div class="w-9 h-9 rounded-lg bg-gold flex items-center justify-center font-extrabold text-ink-950">D</div>
        <div>
          <h1 class="text-lg font-bold tracking-tight">DCAI <span class="text-gold">L3</span> · Foundation Control</h1>
          <div class="text-[11px] mono subtle">Admin console · chainId 18441 · block #${blockNumber.toLocaleString()}</div>
        </div>
      </div>
      <div class="flex items-center gap-2">
        <a href="/" target="_blank" class="text-[11px] mono px-3 py-1.5 rounded-lg border border-[#232833] text-[#a2a9b4] hover:text-white hover:border-[#303747]">Explorer ↗</a>
        <button onclick="location.reload()" class="text-[11px] mono px-3 py-1.5 rounded-lg border border-[#232833] text-[#a2a9b4] hover:text-white hover:border-[#303747]">Refresh</button>
      </div>
    </header>
    <div class="keyline mb-4"></div>

    <!-- Focused admin navigation -->
    <nav id="adminTabs" class="sticky top-0 z-40 mb-6 -mx-2 px-2 py-2 bg-ink-950/95 backdrop-blur border-y border-[#171b21] overflow-x-auto" role="tablist" aria-label="Admin sections">
      <div class="flex min-w-max gap-2">
        <button id="tabButton-overview" type="button" class="admin-tab px-4 py-2 rounded-lg border text-[10px] font-bold uppercase tracking-widest transition" role="tab" aria-controls="tabPanel-overview" aria-selected="true" data-admin-tab="overview">Overview</button>
        <button id="tabButton-operators" type="button" class="admin-tab px-4 py-2 rounded-lg border text-[10px] font-bold uppercase tracking-widest transition" role="tab" aria-controls="tabPanel-operators" aria-selected="false" data-admin-tab="operators">Operators</button>
        <button id="tabButton-api-access" type="button" class="admin-tab px-4 py-2 rounded-lg border text-[10px] font-bold uppercase tracking-widest transition" role="tab" aria-controls="tabPanel-api-access" aria-selected="false" data-admin-tab="api-access">API Access</button>
        <button id="tabButton-infrastructure" type="button" class="admin-tab px-4 py-2 rounded-lg border text-[10px] font-bold uppercase tracking-widest transition" role="tab" aria-controls="tabPanel-infrastructure" aria-selected="false" data-admin-tab="infrastructure">Infrastructure</button>
        <button id="tabButton-security" type="button" class="admin-tab px-4 py-2 rounded-lg border text-[10px] font-bold uppercase tracking-widest transition" role="tab" aria-controls="tabPanel-security" aria-selected="false" data-admin-tab="security">Security</button>
      </div>
    </nav>

    <main>
    <div id="tabPanel-overview" role="tabpanel" aria-labelledby="tabButton-overview" data-tab-panel="overview">

    <!-- Intro / legend -->
    <div class="card p-4 mb-6">
      <div class="text-[11px] leading-relaxed text-[#a2a9b4]">
        This console runs the <b class="text-white">rewards pipeline</b> and the <b class="text-white">RPC API-key system</b> for the DCAI L3 testnet.
        Sections are ordered by how the reward flow works: money in (treasury → distributor), the per-day budget (daily cap),
        how each 2-hour epoch is scored (reward strategy), who earns (operators), and who may call the RPC (API keys).
        <span class="block mt-1 subtle">本控制台管理 DCAI L3 测试网的<b class="text-[#a2a9b4]">奖励流程</b>与 <b class="text-[#a2a9b4]">RPC API Key 体系</b>。下面各板块按奖励资金流向排列，每块都有中文说明。</span>
      </div>
    </div>

    <!-- Overview stats -->
    <div class="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
      <div class="card p-4">
        <div class="text-[10px] uppercase tracking-widest subtle">Treasury Reserve</div>
        <div class="mt-1 text-xl font-bold mono tnum text-gold">${fmt4(treasuryBal)}</div>
        <div class="text-[10px] mono subtle mt-0.5">tDCAI · fee sink</div>
      </div>
      <div class="card p-4">
        <div class="text-[10px] uppercase tracking-widest subtle">Distributor Pool</div>
        <div class="mt-1 text-xl font-bold mono tnum text-aqua">${fmt4(distributorBal)}</div>
        <div class="text-[10px] mono subtle mt-0.5">tDCAI · pays claims</div>
      </div>
      <div class="card p-4">
        <div class="text-[10px] uppercase tracking-widest subtle">Epochs Today</div>
        <div class="mt-1 text-xl font-bold mono tnum">${epochsToday}<span class="text-[11px] subtle"> / 12</span></div>
        <div class="text-[10px] mono subtle mt-0.5">published on-chain</div>
      </div>
      <button onclick="openLatestRewards()" class="card p-4 text-left hover:border-[#303747] transition">
        <div class="text-[10px] uppercase tracking-widest subtle">Latest Reward ↗</div>
        <div class="mt-1 text-xl font-bold mono tnum">${fmt4(latestTotalWei)}</div>
        <div class="text-[10px] mono subtle mt-0.5">epoch ${esc(latestEpochId)} · click for breakdown</div>
      </button>
    </div>

    <!-- Rewards Pipeline: Daily cap -->
    <section class="card p-5 mb-6">
      <div class="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h2 class="text-sm font-bold">Rewards Pipeline · Daily Cap <span class="mono subtle text-[11px]">(Day ${dayId})</span></h2>
          <p class="text-[11px] text-[#a2a9b4] mt-1 max-w-2xl">Every 2 hours a cron scores operators and publishes one <b>epoch</b> (pool = daily cap ÷ 12). The on-chain distributor refuses to pay more than the <b>daily cap</b> per UTC day. "Day ${dayId}" is today's dayId; the bar shows how much of today's budget is already committed.
          <span class="block subtle mt-1">每 2 小时结算一个 epoch（额度 = 每日上限 ÷ 12）。链上合约限制每天最多发放「每日上限」。进度条 = 今日已发放比例。</span></p>
        </div>
        <div class="flex gap-2 shrink-0">
          <button onclick="setCap()" class="bg-gold text-ink-950 text-[11px] font-bold px-4 py-2 rounded-lg hover:bg-gold-2">Set cap</button>
          <button onclick="increaseCap()" class="text-[11px] mono px-3 py-2 rounded-lg border border-[#232833] text-[#a2a9b4] hover:text-white">+100</button>
        </div>
      </div>
      <div class="mt-4 grid grid-cols-3 gap-3 text-center">
        <div class="rounded-lg bg-ink-900 border border-[#232833] py-2"><div class="text-[10px] subtle uppercase tracking-widest">Cap</div><div class="mono font-bold">${fmt2(dailyCapWei)}</div></div>
        <div class="rounded-lg bg-ink-900 border border-[#232833] py-2"><div class="text-[10px] subtle uppercase tracking-widest">Spent</div><div class="mono font-bold text-gold">${fmt2(dailySpentWei)}</div></div>
        <div class="rounded-lg bg-ink-900 border border-[#232833] py-2"><div class="text-[10px] subtle uppercase tracking-widest">Remaining</div><div class="mono font-bold text-aqua">${fmt2(dailyRemainWei)}</div></div>
      </div>
      <div class="mt-3 h-2 rounded-full bg-ink-900 overflow-hidden border border-[#232833]">
        <div class="h-full bg-gradient-to-r from-gold to-gold-2" style="width:${spentPct.toFixed(1)}%"></div>
      </div>
      <div class="mt-1 text-[10px] mono subtle text-right">${spentPct.toFixed(1)}% of today's cap committed</div>
    </section>

    <!-- Reward Strategy: weights (NOW LIVE) -->
    <section class="card p-5 mb-6">
      <div class="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h2 class="text-sm font-bold">Network Reward Strategy
            <span class="ml-2 align-middle text-[9px] font-bold px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-400 border border-emerald-500/25">LIVE · AFFECTS PAYOUTS</span>
          </h2>
          <p class="text-[11px] text-[#a2a9b4] mt-1 max-w-2xl">These weights decide how each operator's service scores combine into their epoch share. They are <b>relative</b> — only the ratio matters — and are now read live by the scorer. Changing them changes real payouts from the next epoch onward.
          <span class="block subtle mt-1">这些权重决定各项服务得分如何合成运营者的 epoch 份额。数值是<b>相对</b>的（只看比例），现已被打分脚本实时读取——改动会从下一个 epoch 起真实影响发奖。</span></p>
        </div>
        <button onclick="saveWeights()" id="saveBtn" class="bg-gold text-ink-950 text-[11px] font-bold px-4 py-2 rounded-lg hover:bg-gold-2 shrink-0">Save weights</button>
      </div>
      <div class="mt-4 grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-4">
        ${[['rpc', 'RPC', 'text-gold'], ['indexer', 'Indexer', 'text-aqua'], ['storage', 'Storage', 'text-emerald-400'], ['multiregion', 'Multi-region', 'text-violet-400']].map(([k, label, cls]) => `
        <div>
          <div class="flex justify-between text-[11px] mb-1">
            <span class="subtle uppercase tracking-widest">${label}</span>
            <span class="mono ${cls} font-bold"><span id="${k}WeightLabel">${W[k]}</span> <span class="subtle">· <span id="${k}WeightPct">${wPct(W[k])}</span>%</span></span>
          </div>
          <input type="range" id="${k}Weight" min="0" max="100" value="${W[k]}" oninput="updateLabels()" class="w-full">
        </div>`).join('')}
      </div>
      <div class="mt-3 text-[10px] mono subtle">Raw total <span id="weightTotal">${wSum}</span> · percentages are the live split. No need to sum to 100 — ratios are what count.</div>
    </section>

    </div>
    <div id="tabPanel-operators" role="tabpanel" aria-labelledby="tabButton-operators" data-tab-panel="operators" hidden>

    <!-- Operators / Contributors -->
    <section class="card p-5 mb-6">
      <h2 class="text-sm font-bold">Operators &amp; External Contributors</h2>
      <p class="text-[11px] text-[#a2a9b4] mt-1 max-w-3xl">Nodes enrolled in the reward program. "External" means machines outside the 7-server core fleet, probed through dedicated nginx routes. Each must also be <b>ACTIVE in OperatorRegistry</b> on-chain before <code class="text-aqua">claim()</code> works.
      <span class="block subtle mt-1">参与奖励计划的节点。「外部」= 核心 7 台之外、别人运营、通过专用路由探测的机器。运营者还必须在链上 OperatorRegistry 里被激活，claim() 才有效。</span></p>
      <div class="mt-4 grid grid-cols-1 md:grid-cols-3 gap-3">
        ${Object.entries(CONTRIBUTOR_TIERS).map(([key, tier]) => `
        <div class="rounded-lg bg-ink-900 border border-[#232833] p-3">
          <div class="flex items-center justify-between"><span class="text-[11px] font-bold uppercase tracking-widest">${esc(tier.label)}</span><span class="mono text-gold text-[10px]">${esc(tier.stakeEther)} tDCAI</span></div>
          <div class="mt-1 text-[10px] subtle">${esc(tier.function)}</div>
          <div class="mt-2 mono text-[10px] text-aqua">${tier.rpcRatePerSecond} req/s · reward ${tier.rewardFactor.toFixed(2)}x</div>
          <div class="mt-1 mono text-[9px] subtle">uptime ${(tier.slo.uptimeFloor * 100).toFixed(tier.slo.uptimeFloor >= .999 ? 1 : 0)}% · RPC p95 ≤ ${tier.slo.rpcP95Ms}ms · lag ≤ ${tier.slo.indexerLagBlocks}</div>
        </div>`).join('')}
      </div>
      <div id="contributionStatus" class="mt-4 rounded-lg bg-ink-900 border border-[#232833] p-3 text-[10px] mono subtle">Loading real traffic and P2P status...</div>
      <div class="mt-4 overflow-x-auto">
        <table class="w-full text-left text-[11px]">
          <thead class="text-[10px] uppercase tracking-widest subtle border-b border-[#232833]">
            <tr><th class="py-2 pr-4">Operator</th><th class="py-2 pr-4">Lane</th><th class="py-2 pr-4">Policy / P2P</th><th class="py-2 pr-4">Services</th><th class="py-2 pr-4">RPC endpoint</th><th class="py-2">Measured</th></tr>
          </thead>
          <tbody class="divide-y divide-[#1e232b]">
            ${opRows.length ? opRows.map((o) => `
            <tr>
              <td class="py-2 pr-4 mono text-gold cursor-pointer" onclick="copyText('${esc(o.operator)}')">${esc(shortAddr(o.operator))}</td>
              <td class="py-2 pr-4"><span class="uppercase font-bold">${esc(o.programTier)}</span><span class="block mono text-[9px] subtle">${Number(o.rewardFactor).toFixed(2)}x</span></td>
              <td class="py-2 pr-4"><span class="mono text-[9px] ${o.contributionPolicyVersion === 'v2' ? 'text-emerald-400' : 'subtle'}">${esc(o.contributionPolicyVersion)}</span><span class="block mono text-[9px] subtle">${o.p2p ? ('node '+esc(String(o.p2p.nodeId || '').slice(0,10))+'...') : 'unverified legacy'}</span></td>
              <td class="py-2 pr-4">${o.enabled.length ? o.enabled.map((s) => `<span class="inline-block mono text-[9px] px-1.5 py-0.5 rounded border border-[#303747] text-[#a2a9b4] mr-1">${esc(s)}</span>`).join('') : '<span class="subtle">none</span>'}</td>
              <td class="py-2 pr-4 mono subtle truncate max-w-[280px]" title="${esc(o.endpoints.rpc || '')}">${esc(o.endpoints.rpc || '--')}</td>
              <td class="py-2">${o.hasMeasurement ? '<span class="text-emerald-400">yes</span>' : '<span class="subtle">pending</span>'}</td>
            </tr>`).join('') : '<tr><td colspan="6" class="py-3 subtle">No operators configured.</td></tr>'}
          </tbody>
        </table>
      </div>
    </section>

    </div>
    <div id="tabPanel-api-access" role="tabpanel" aria-labelledby="tabButton-api-access" data-tab-panel="api-access" hidden>

    <!-- API Keys -->
    <section class="card p-5 mb-6">
      <h2 class="text-sm font-bold">API Key Approvals</h2>
      <p class="text-[11px] text-[#a2a9b4] mt-1 max-w-3xl">One staking contract, two front-ends. Contributor lanes map Observer/Core/Backbone to Basic/Pro/Ultra, then add enforced service SLOs and reward capacity factors. Approval now also proves a live Enode connection to Foundation peers before the endpoint can enter real canary traffic.
      <span class="block subtle mt-1">同一质押合约、两个入口。Contributor 的 Observer/Core/Backbone 对应 Basic/Pro/Ultra，并额外强制服务质量与奖励容量系数；批准时会校验等级、质押、区域和端点。</span></p>
      <div id="apiKeyReqStatus" class="mt-3 text-[10px] mono subtle"></div>
      <div class="mt-3 flex flex-wrap items-center gap-2">
        <input id="requestSearchInput" placeholder="Search wallet / endpoint / note" class="bg-ink-900 border border-[#232833] rounded-lg px-3 py-2 text-[11px] mono w-[300px]">
        <select id="requestFilterSelect" class="bg-ink-900 border border-[#232833] rounded-lg px-3 py-2 text-[11px] mono text-[#a2a9b4]">
          <option value="all">All sources</option>
          <option value="developer">Developer (API Dashboard)</option>
          <option value="contributor">Contributor Program</option>
        </select>
      </div>
      <div id="apiKeyRequestsTable" class="mt-4"></div>

      <div class="mt-6 border-t border-[#1e232b] pt-4">
        <h3 class="text-[11px] font-bold uppercase tracking-widest subtle">Request History</h3>
        <div id="apiKeyRequestHistoryTable" class="mt-3"></div>
      </div>

      <div class="mt-6 border-t border-[#1e232b] pt-4">
        <div class="flex items-center justify-between gap-2 flex-wrap">
          <h3 class="text-[11px] font-bold uppercase tracking-widest subtle">Active Managed Keys</h3>
          <input id="keySearchInput" placeholder="Search prefix / wallet / source" class="bg-ink-900 border border-[#232833] rounded-lg px-3 py-2 text-[11px] mono w-[260px]">
        </div>
        <div id="apiKeyKeysTable" class="mt-3"></div>
      </div>

      <div class="mt-6 border-t border-[#1e232b] pt-4">
        <h3 class="text-[11px] font-bold uppercase tracking-widest subtle">Legacy Master Keys <span class="text-rose-400/80 normal-case tracking-normal">· unstaked, defined in nginx</span></h3>
        <p class="text-[10px] subtle mt-1 max-w-2xl">These bypass the staking system entirely — they predate it and are hard-coded in the nginx map. Treat as break-glass credentials; migrate integrations off them when possible. Managed here as read-only.
        <span class="block mt-0.5">这些绕过质押体系，硬编码在 nginx 里，属于「元老级」万能钥匙。视为应急凭证，尽量迁移掉。此处只读展示。</span></p>
        <div id="legacyKeysTable" class="mt-3"></div>
      </div>
    </section>

    <!-- Stake watch -->
    <section class="card p-5 mb-6">
      <h2 class="text-sm font-bold">Stake Watch</h2>
      <p class="text-[11px] text-[#a2a9b4] mt-1 max-w-3xl">On-chain stake status for every wallet that has a key or request. Policy: a key is valid while staked; if a wallet requests unstake or becomes withdrawable, consider revoking its key.
      <span class="block subtle mt-1">所有持有 key 或申请过的钱包的链上质押状态。策略：质押期间 key 有效；若发起解押/可提取，考虑撤销其 key。</span></p>
      <div id="stakeWatchStatus" class="mt-3 text-[10px] mono subtle"></div>
      <div id="stakeWatchTable" class="mt-3"></div>
    </section>

    </div>
    <div id="tabPanel-infrastructure" role="tabpanel" aria-labelledby="tabButton-infrastructure" data-tab-panel="infrastructure" hidden>

    <!-- Health + infra -->
    <section class="card p-5 mb-6">
      <div class="flex items-center justify-between">
        <h2 class="text-sm font-bold">Health Check <span class="subtle text-[11px] mono">(1-min)</span></h2>
        <div id="healthUpdatedAt" class="text-[10px] mono subtle"></div>
      </div>
      <div id="healthTable" class="mt-4 text-[11px]"></div>
      <div class="mt-5 grid grid-cols-2 md:grid-cols-4 gap-3">
        ${INFRA.map((node) => `
        <div class="rounded-lg bg-ink-900 border border-[#232833] p-3">
          <div class="text-[11px] font-bold">${esc(node.name)}</div>
          <div class="text-[9px] mono subtle">${esc(node.ip)} · ${esc(node.role)}</div>
          <div class="mt-2 flex items-center gap-1.5">
            <div id="dot_${node.ip.replaceAll('.', '_')}" class="w-1.5 h-1.5 rounded-full bg-[#3a4150]"></div>
            <span id="st_${node.ip.replaceAll('.', '_')}" class="text-[9px] subtle font-bold">CHECKING</span>
          </div>
          <div class="mt-1 text-[9px] mono subtle">Last: <span id="ts_${node.ip.replaceAll('.', '_')}">--</span> · <span id="ms_${node.ip.replaceAll('.', '_')}">--</span></div>
        </div>`).join('')}
      </div>
    </section>

    </div>
    <div id="tabPanel-security" role="tabpanel" aria-labelledby="tabButton-security" data-tab-panel="security" hidden>

    <!-- Admin login -->
    <section class="card p-5 mb-6">
      <h2 class="text-sm font-bold">Admin Login Password</h2>
      <p class="text-[11px] subtle mt-1">Updates the Basic Auth password for /admin/ and /admin/api/. 更新 /admin 登录密码。</p>
      <div class="mt-3 flex flex-wrap gap-2">
        <input id="adminBasicUserInput" value="dcaiadmin" placeholder="Username" class="bg-ink-900 border border-[#232833] rounded-lg px-3 py-2 text-[11px] mono">
        <input id="adminBasicCurrentInput" type="password" placeholder="Current password" class="bg-ink-900 border border-[#232833] rounded-lg px-3 py-2 text-[11px] mono">
        <input id="adminBasicNewInput" type="password" placeholder="New password" class="bg-ink-900 border border-[#232833] rounded-lg px-3 py-2 text-[11px] mono">
        <input id="adminBasicConfirmInput" type="password" placeholder="Confirm new" class="bg-ink-900 border border-[#232833] rounded-lg px-3 py-2 text-[11px] mono">
        <button onclick="changeAdminPassword()" class="bg-gold text-ink-950 text-[11px] font-bold px-4 py-2 rounded-lg hover:bg-gold-2">Update</button>
      </div>
      <div id="adminBasicStatus" class="mt-3 text-[10px] mono subtle"></div>
    </section>
    </div>
    </main>

    <footer class="text-center py-6 text-[10px] mono subtle uppercase tracking-[0.3em]">DCAI Foundation Control · Admin v2</footer>
  </div>

  <!-- Latest rewards modal -->
  <div id="latestRewardsModal" class="fixed inset-0 hidden items-center justify-center bg-black/70 p-4" style="z-index:9999;">
    <div class="w-full max-w-5xl card overflow-hidden max-h-[90vh] flex flex-col">
      <div class="p-4 border-b border-[#232833] flex items-center justify-between gap-4">
        <div>
          <div class="text-[10px] uppercase tracking-widest subtle">Latest Published Reward</div>
          <div id="latestRewardsTitle" class="text-base mono text-gold font-bold">--</div>
          <div id="latestRewardsMeta" class="mt-1 text-[10px] mono subtle">--</div>
          <select id="latestRewardsEpochSelect" class="mt-3 bg-ink-900 border border-[#232833] rounded-lg px-3 py-2 text-[11px] mono"></select>
        </div>
        <button onclick="closeLatestRewards()" class="px-3 py-1.5 rounded-lg border border-[#232833] text-[11px] font-bold hover:text-white">Close</button>
      </div>
      <div class="p-4 overflow-y-auto">
        <div id="latestRewardsList" class="space-y-4"></div>
        <div class="text-[10px] subtle mt-4">Tip: click an address to copy.</div>
      </div>
    </div>
  </div>

  <script>
    const API_URL = '/admin/api';
    const ADMIN_TABS = ['overview', 'operators', 'api-access', 'infrastructure', 'security'];

    function setActiveAdminTab(tab, updateHash){
      const active = ADMIN_TABS.includes(tab) ? tab : 'overview';
      document.querySelectorAll('[data-admin-tab]').forEach(function(btn){
        const selected = btn.dataset.adminTab === active;
        btn.setAttribute('aria-selected', selected ? 'true' : 'false');
        btn.tabIndex = selected ? 0 : -1;
      });
      document.querySelectorAll('[data-tab-panel]').forEach(function(panel){ panel.hidden = panel.dataset.tabPanel !== active; });
      try { localStorage.setItem('dcai-admin-tab', active); } catch(e) {}
      if(updateHash && location.hash !== '#' + active) history.replaceState(null, '', '#' + active);
    }

    function initAdminTabs(){
      const fromHash = location.hash.replace(/^#/, '');
      let initial = ADMIN_TABS.includes(fromHash) ? fromHash : 'overview';
      if(!ADMIN_TABS.includes(fromHash)) { try { const saved=localStorage.getItem('dcai-admin-tab'); if(ADMIN_TABS.includes(saved)) initial=saved; } catch(e) {} }
      setActiveAdminTab(initial, false);
      document.querySelectorAll('[data-admin-tab]').forEach(function(btn){
        btn.addEventListener('click', function(){ setActiveAdminTab(btn.dataset.adminTab, true); window.scrollTo({top:0, behavior:'smooth'}); });
      });
      const nav=document.getElementById('adminTabs');
      if(nav) nav.addEventListener('keydown', function(e){
        if(e.key!=='ArrowLeft' && e.key!=='ArrowRight') return;
        const current=ADMIN_TABS.indexOf(document.activeElement?.dataset?.adminTab); if(current<0) return;
        e.preventDefault(); const step=e.key==='ArrowRight'?1:-1; const next=(current+step+ADMIN_TABS.length)%ADMIN_TABS.length;
        setActiveAdminTab(ADMIN_TABS[next], true); document.getElementById('tabButton-'+ADMIN_TABS[next])?.focus();
      });
      window.addEventListener('hashchange', function(){ const tab=location.hash.replace(/^#/,''); if(ADMIN_TABS.includes(tab)) setActiveAdminTab(tab, false); });
    }

    async function setCap() {
      const cap = prompt('Set new DAILY CAP (tDCAI). Example: 300');
      if (!cap || isNaN(cap) || parseFloat(cap) <= 0) return;
      if (!confirm('Confirm on-chain tx: setDailyCap(' + cap + ' tDCAI)?')) return;
      const r = await fetch(API_URL + '/set-cap', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ cap: parseFloat(cap) }) });
      const d = await r.json();
      if (d.success) { alert('CAP tx sent: ' + d.hash); location.reload(); } else { alert('Set cap failed: ' + (d.error || 'unknown')); }
    }
    async function increaseCap() {
      const r = await fetch(API_URL + '/cap'); const d = await r.json();
      const newCap = parseFloat(d.cap) + 100;
      if (!confirm('Increase daily cap to ' + newCap + ' tDCAI?')) return;
      const r2 = await fetch(API_URL + '/set-cap', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ cap: newCap }) });
      const d2 = await r2.json();
      if (d2.success) { alert('CAP tx sent: ' + d2.hash); location.reload(); } else { alert('Increase failed: ' + (d2.error || 'unknown')); }
    }

    function updateLabels() {
      const keys = ['rpc','indexer','storage','multiregion'];
      const vals = {}; let sum = 0;
      keys.forEach(k => { vals[k] = parseInt(document.getElementById(k + 'Weight').value) || 0; sum += vals[k]; });
      const s = sum || 1;
      keys.forEach(k => {
        document.getElementById(k + 'WeightLabel').innerText = vals[k];
        document.getElementById(k + 'WeightPct').innerText = ((vals[k] / s) * 100).toFixed(0);
      });
      document.getElementById('weightTotal').innerText = sum;
    }

    async function saveWeights() {
      const btn = document.getElementById('saveBtn'); const orig = btn.innerText;
      btn.innerText = 'Saving…'; btn.disabled = true;
      try {
        const body = {
          rpc: parseInt(document.getElementById('rpcWeight').value) || 0,
          indexer: parseInt(document.getElementById('indexerWeight').value) || 0,
          storage: parseInt(document.getElementById('storageWeight').value) || 0,
          multiregion: parseInt(document.getElementById('multiregionWeight').value) || 0,
        };
        const r = await fetch(API_URL + '/update-weights', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(body) });
        const d = await r.json();
        if (!r.ok || !d.success) throw new Error(d.error || 'save failed');
        btn.innerText = 'Saved ✓'; btn.classList.remove('bg-gold'); btn.classList.add('bg-emerald-500');
        setTimeout(() => location.reload(), 1200);
      } catch (e) { alert('Save weights failed: ' + (e?.message || e)); btn.innerText = orig; btn.disabled = false; }
    }

    async function topup(amount) {
      if (!confirm('Authorize transfer of ' + amount + ' tDCAI to distributor?')) return;
      try {
        const r = await fetch(API_URL + '/topup', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ amount }) });
        const d = await r.json();
        if (d.success) { alert('Top-up sent: ' + d.hash); location.reload(); } else { alert('Top-up failed: ' + (d.error || 'unknown')); }
      } catch (e) { alert(e.message); }
    }
    function customTopup() { const a = prompt('Amount (tDCAI):'); if (a && !isNaN(a)) topup(parseFloat(a)); }

    function copyText(text) {
      const toast = () => { const t = document.createElement('div'); t.className='fixed bottom-8 left-1/2 -translate-x-1/2 bg-gold text-ink-950 px-5 py-2.5 rounded-xl text-[10px] font-bold shadow-2xl z-[10000]'; t.innerText='Copied: ' + text; document.body.appendChild(t); setTimeout(()=>t.remove(),2000); };
      if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(toast).catch(()=>fb(text)); else fb(text);
      function fb(x){ try{ const ta=document.createElement('textarea'); ta.value=x; ta.style.position='fixed'; ta.style.left='-9999px'; document.body.appendChild(ta); ta.select(); document.execCommand('copy'); ta.remove(); toast(); }catch(e){ alert('Copy failed'); } }
    }

    async function loadHealth() {
      try {
        const r = await fetch('/admin/health.json', { cache:'no-store' }); const d = await r.json();
        const ua = document.getElementById('healthUpdatedAt'); if (ua) ua.innerText = d.generatedAt ? ('Updated: ' + new Date(d.generatedAt).toLocaleString()) : '';
        const rows = []; const add = (name,obj)=>{ if(!obj) return; const ok=obj.ok===true; rows.push({name,status:ok?'OK':'DOWN',ms:obj.ms!=null?Math.round(obj.ms):null,info:ok?(obj.status!=null?('HTTP '+obj.status):''):(obj.error||'')}); };
        add('Infra: nginx /', d.nodes?.Infra?.nginx); add('Infra: faucet :8080', d.nodes?.Infra?.faucet); add('Infra: adminApi :3001', d.nodes?.Infra?.adminApi);
        add('RPC1: eth_chainId', d.nodes?.RPC1?.rpc); add('RPC2: eth_chainId', d.nodes?.RPC2?.rpc);
        add('Signer1: ssh', d.nodes?.Signer1?.ssh); add('Signer2: ssh', d.nodes?.Signer2?.ssh); add('Signer3: ssh', d.nodes?.Signer3?.ssh); add('Indexer: ssh', d.nodes?.Indexer?.ssh);
        let h = '<div class="overflow-x-auto"><table class="w-full text-left text-[11px]"><thead class="text-[10px] uppercase tracking-widest subtle border-b border-[#232833]"><tr><th class="py-2 pr-4">Target</th><th class="py-2 pr-4">Status</th><th class="py-2 pr-4">Latency</th><th class="py-2">Info</th></tr></thead><tbody class="divide-y divide-[#1e232b]">';
        for (const row of rows) { const cls=row.status==='OK'?'text-emerald-400':'text-rose-400'; h += '<tr><td class="py-2 pr-4 mono text-[#a2a9b4]">'+row.name+'</td><td class="py-2 pr-4 '+cls+' font-bold">'+row.status+'</td><td class="py-2 pr-4 mono subtle">'+(row.ms==null?'':row.ms+'ms')+'</td><td class="py-2 mono subtle truncate">'+(row.info||'')+'</td></tr>'; }
        h += '</tbody></table></div>';
        const el = document.getElementById('healthTable'); if (el) el.innerHTML = h;
        const byIp = { '45.76.190.151':d.nodes?.Signer1?.ssh, '139.180.188.167':d.nodes?.Signer2?.ssh, '45.76.145.198':d.nodes?.Signer3?.ssh, '139.180.188.61':d.nodes?.RPC1?.rpc, '207.148.72.238':d.nodes?.RPC2?.rpc, '139.180.141.226':d.nodes?.Indexer?.ssh, '139.180.140.143':d.nodes?.Infra?.nginx };
        for (const [ip,obj] of Object.entries(byIp)) { const id=ip.replaceAll('.','_'); const ok=obj?.ok===true; const ms=obj?.ms!=null?Math.round(obj.ms):null; const ts=d.generatedAt?new Date(d.generatedAt).toLocaleTimeString():'';
          const dot=document.getElementById('dot_'+id), st=document.getElementById('st_'+id), tsEl=document.getElementById('ts_'+id), msEl=document.getElementById('ms_'+id);
          if(dot){ dot.className='w-1.5 h-1.5 rounded-full ' + (ok?'bg-emerald-500':'bg-rose-500'); }
          if(st){ st.innerText=ok?'OK':'DOWN'; st.className='text-[9px] font-bold ' + (ok?'text-emerald-400':'text-rose-400'); }
          if(tsEl) tsEl.innerText=ts||'--'; if(msEl) msEl.innerText=(ms==null?'--':ms+'ms');
        }
      } catch (e) { const el=document.getElementById('healthTable'); if(el) el.innerText='Health load failed: '+(e?.message||e); }
    }

    // ---- rewards modal ----
    window.__LATEST_REWARDS__ = ${JSON.stringify(latestRewards || {})};
    window.__RECENT_REWARD_EPOCHS__ = ${JSON.stringify(recentRewardEpochIds || [])};
    function weiTo18(w){ try{ let s=BigInt(w||'0').toString(); if(s.length<=18) s='0'.repeat(18-s.length+1)+s; return s.slice(0,-18)+'.'+s.slice(-18).slice(0,6); }catch(e){ return '--'; } }
    function fPct(v,d){ if(v==null||isNaN(Number(v))) return '--'; return (Number(v)*100).toFixed(d==null?2:d)+'%'; }
    function fScore(v,d){ if(v==null||isNaN(Number(v))) return '--'; return Number(v).toFixed(d==null?4:d); }
    function svcCard(name, svc){ if(!svc) return ''; const on=!!svc.enabled; return '<div class="p-3 rounded-lg bg-ink-900 border border-[#232833]"><div class="flex justify-between mb-1"><span class="text-[11px] font-bold uppercase tracking-widest">'+name+'</span><span class="mono text-[10px] '+(on?'text-emerald-400':'subtle')+'">'+(on?'ENABLED':'DISABLED')+' · w'+(svc.weight==null?'--':svc.weight)+'</span></div><div class="text-[10px] mono subtle">raw '+fScore(svc.rawScore,4)+' · weighted <span class="text-gold">'+fScore(svc.weightedScore,4)+'</span></div></div>'; }
    function renderClaims(listEl, claims){
      if(!claims.length){ listEl.innerHTML='<div class="text-[11px] subtle">No claims for this epoch.</div>'; return; }
      listEl.innerHTML = claims.map(function(c){ const b=c.breakdown||{}; return '<div class="p-4 rounded-xl bg-ink-900 border border-[#232833]"><div class="flex flex-wrap items-start justify-between gap-3 mb-3"><div><div class="text-[10px] uppercase tracking-widest subtle">Operator</div><div class="mono text-[12px] text-gold break-all cursor-pointer" data-copy="'+(c.operator||'')+'">'+(c.operator||'--')+'</div></div><div class="grid grid-cols-3 gap-2 text-center"><div class="px-3 py-1.5 rounded-lg bg-ink-850 border border-[#232833]"><div class="text-[9px] subtle uppercase">Amount</div><div class="mono text-gold text-[12px] font-bold">'+weiTo18(c.amountWei)+'</div></div><div class="px-3 py-1.5 rounded-lg bg-ink-850 border border-[#232833]"><div class="text-[9px] subtle uppercase">Score</div><div class="mono text-emerald-400 text-[12px] font-bold">'+fScore(c.totalScore,4)+'</div></div><div class="px-3 py-1.5 rounded-lg bg-ink-850 border border-[#232833]"><div class="text-[9px] subtle uppercase">Share</div><div class="mono text-aqua text-[12px] font-bold">'+fPct(c.sharePct,2)+'</div></div></div></div><div class="grid grid-cols-1 md:grid-cols-2 gap-2">'+svcCard('RPC',b.rpc)+svcCard('Indexer',b.indexer)+svcCard('Storage',b.storage)+svcCard('Multi-region',b.multiregion)+'</div></div>'; }).join('');
      Array.from(listEl.querySelectorAll('[data-copy]')).forEach(el=>el.addEventListener('click',()=>copyText(el.getAttribute('data-copy'))));
    }
    async function loadEpochIntoModal(epochId){
      const titleEl=document.getElementById('latestRewardsTitle'), metaEl=document.getElementById('latestRewardsMeta'), listEl=document.getElementById('latestRewardsList');
      let data;
      try{ const res=await fetch('/rewards/epochs/'+epochId+'.json',{cache:'no-store'}); if(!res.ok) throw 0; data=await res.json(); }catch(e){ data=window.__LATEST_REWARDS__||{epochId,totalWei:'0',claims:[]}; }
      titleEl.textContent='epoch '+(data.epochId||epochId)+' · '+weiTo18(data.totalWei||'0')+' tDCAI';
      metaEl.textContent='pool '+weiTo18(data.epochPoolWei||data.totalWei||'0')+' tDCAI · sumScore '+fScore(data.sumScore,4)+' · weights '+JSON.stringify(data.weights||{});
      renderClaims(listEl, Array.isArray(data.claims)?data.claims:[]);
    }
    function openLatestRewards(){
      const modal=document.getElementById('latestRewardsModal'), sel=document.getElementById('latestRewardsEpochSelect');
      const recent=window.__RECENT_REWARD_EPOCHS__||[]; const data=window.__LATEST_REWARDS__||{}; const epochId=data.epochId||(recent[0]||'N/A');
      if(sel){ sel.innerHTML=recent.map(id=>'<option value="'+id+'"'+(id===epochId?' selected':'')+'>'+id+'</option>').join(''); sel.onchange=()=>loadEpochIntoModal(sel.value); }
      modal.classList.remove('hidden'); modal.classList.add('flex'); loadEpochIntoModal(epochId);
    }
    function closeLatestRewards(){ const m=document.getElementById('latestRewardsModal'); m.classList.add('hidden'); m.classList.remove('flex'); }

    // ---- api keys ----
    async function adminFetch(path, opts){ return await fetch(API_URL + path, opts || {}); }
    let apiKeyRequestsCache = [], apiKeyKeysCache = [], legacyKeysCache = [], stakeWatchCache = [];
    const TABLE_PAGE_SIZE = 10;
    const tablePages = { requests:1, history:1, keys:1, legacy:1, stakes:1 };

    function paginateRows(rows, key){
      const items=Array.isArray(rows)?rows:[]; const total=items.length; const totalPages=Math.max(1,Math.ceil(total/TABLE_PAGE_SIZE));
      const requested=Math.max(1,parseInt(tablePages[key],10)||1); const page=Math.min(requested,totalPages); tablePages[key]=page;
      const start=(page-1)*TABLE_PAGE_SIZE;
      return { rows:items.slice(start,start+TABLE_PAGE_SIZE), total, totalPages, page, start };
    }
    function paginationHtml(key, pageData){
      if(!pageData.total) return '';
      const first=pageData.start+1, last=Math.min(pageData.start+TABLE_PAGE_SIZE,pageData.total);
      const summary='<span class="mono text-[10px] subtle">Showing '+first+'-'+last+' of '+pageData.total+'</span>';
      if(pageData.totalPages<=1) return '<div class="mt-3">'+summary+'</div>';
      const button=function(label,target,disabled){ return '<button type="button" data-page-key="'+key+'" data-page="'+target+'" '+(disabled?'disabled ':'')+'class="px-3 py-1.5 rounded-lg border border-[#232833] text-[10px] mono '+(disabled?'subtle opacity-40 cursor-not-allowed':'text-[#a2a9b4] hover:text-white hover:border-[#303747]')+'">'+label+'</button>'; };
      return '<div class="mt-3 flex flex-wrap items-center justify-between gap-2">'+summary+'<div class="flex items-center gap-2">'+button('Previous',pageData.page-1,pageData.page===1)+'<span class="mono text-[10px] subtle">Page '+pageData.page+' / '+pageData.totalPages+'</span>'+button('Next',pageData.page+1,pageData.page===pageData.totalPages)+'</div></div>';
    }
    function bindPagination(el){
      Array.from(el.querySelectorAll('[data-page-key]')).forEach(function(btn){ btn.addEventListener('click',function(){ changeTablePage(btn.dataset.pageKey,btn.dataset.page); }); });
    }
    function changeTablePage(key,page){
      tablePages[key]=Math.max(1,parseInt(page,10)||1);
      if(key==='requests'||key==='history') renderRequestsFromCache();
      else if(key==='keys') renderKeys(apiKeyKeysCache);
      else if(key==='legacy') renderLegacyKeys(legacyKeysCache);
      else if(key==='stakes') renderStakeWatch(stakeWatchCache);
    }

    function initControls(){
      const bind=(id,ev,fn)=>{ const el=document.getElementById(id); if(el&&!el.dataset.bound){ el.dataset.bound='1'; el.addEventListener(ev,fn); } };
      bind('requestSearchInput','input',()=>{ tablePages.requests=1; renderRequestsFromCache(); });
      bind('requestFilterSelect','change',()=>{ tablePages.requests=1; renderRequestsFromCache(); });
      bind('keySearchInput','input',()=>{ tablePages.keys=1; renderKeys(apiKeyKeysCache); });
    }
    function parseNote(note){
      const lines=String(note||'').replace(/\\r/g,'').split('\\n');
      const get=l=>{ const row=lines.find(x=>x.startsWith(l+':')); return row?row.slice(l.length+1).trim():''; };
      return { isContributor: lines[0]==='Contributor Program Application', role:get('Role'), programTier:get('Program Tier'), region:get('Region'), endpoint:get('Endpoint'), enode:get('Enode'), freeNote:get('Note') };
    }
    function sourceBadge(src){ const c = src==='contributor' ? 'text-aqua border-aqua/30 bg-aqua/10' : 'text-gold border-gold/30 bg-gold/10'; return '<span class="inline-block mono text-[9px] px-1.5 py-0.5 rounded border '+c+'">'+(src||'developer')+'</span>'; }

    function renderRequests(reqs){
      const el=document.getElementById('apiKeyRequestsTable'); if(!el) return;
      if(!reqs.length){ el.innerHTML='<div class="text-[11px] subtle mono">No pending requests.</div>'; return; }
      const pageData=paginateRows(reqs,'requests');
      let h='<div class="overflow-x-auto"><table class="w-full text-left text-[11px]"><thead class="text-[10px] uppercase tracking-widest subtle border-b border-[#232833]"><tr><th class="py-2 pr-4">Address</th><th class="py-2 pr-4">Tier</th><th class="py-2 pr-4">Source</th><th class="py-2 pr-4">Created</th><th class="py-2">Action</th></tr></thead><tbody class="divide-y divide-[#1e232b]">';
      for(const r of pageData.rows){ const src=r.source||(parseNote(r.note).isContributor?'contributor':'developer'); const m=parseNote(r.note); const t=(r.note||'').replace(/"/g,'&quot;');
        h+='<tr class="align-top"><td class="py-2 pr-4 mono text-gold cursor-pointer" data-copy="'+(r.address||'')+'">'+(r.address?(r.address.slice(0,10)+'…'+r.address.slice(-6)):'')+'</td>';
        h+='<td class="py-2 pr-4 font-bold">'+(r.tier||'')+'</td>';
        h+='<td class="py-2 pr-4">'+sourceBadge(src)+'</td>';
        h+='<td class="py-2 pr-4 subtle">'+String(r.createdAt||'').replace('T',' ').replace('Z','')+'</td>';
        h+='<td class="py-2"><div class="flex gap-2"><button class="bg-emerald-500/10 text-emerald-400 text-[10px] font-bold px-3 py-1.5 rounded-lg border border-emerald-500/20 hover:bg-emerald-500/20" data-approve="'+r.id+'">APPROVE</button><button class="bg-rose-500/10 text-rose-400 text-[10px] font-bold px-3 py-1.5 rounded-lg border border-rose-500/20 hover:bg-rose-500/20" data-reject="'+r.id+'">REJECT</button></div>';
        if(m.isContributor){ h+='<div class="mt-2 text-[10px] subtle">lane <span class="uppercase text-aqua">'+(m.programTier||'-')+'</span> · role '+(m.role||'-')+' · region '+(m.region||'-')+' · <span title="'+t+'">endpoint '+(m.endpoint||'-')+'</span></div>'; }
        else if(r.note){ h+='<div class="mt-1 text-[10px] subtle truncate max-w-[420px]" title="'+t+'">'+r.note+'</div>'; }
        h+='</td></tr>';
      }
      h+='</tbody></table></div>'+paginationHtml('requests',pageData); el.innerHTML=h;
      Array.from(el.querySelectorAll('[data-copy]')).forEach(x=>x.addEventListener('click',()=>copyText(x.getAttribute('data-copy'))));
      Array.from(el.querySelectorAll('[data-approve]')).forEach(b=>b.addEventListener('click',()=>approveKey(b.getAttribute('data-approve'))));
      Array.from(el.querySelectorAll('[data-reject]')).forEach(b=>b.addEventListener('click',()=>rejectKey(b.getAttribute('data-reject'))));
      bindPagination(el);
    }
    function renderHistory(rows){
      const el=document.getElementById('apiKeyRequestHistoryTable'); if(!el) return;
      if(!rows.length){ el.innerHTML='<div class="text-[11px] subtle mono">No history.</div>'; return; }
      const sorted=rows.slice().sort((a,b)=>String(b.createdAt||'').localeCompare(String(a.createdAt||'')));
      const pageData=paginateRows(sorted,'history');
      let h='<div class="overflow-x-auto"><table class="w-full text-left text-[11px]"><thead class="text-[10px] uppercase tracking-widest subtle border-b border-[#232833]"><tr><th class="py-2 pr-4">Address</th><th class="py-2 pr-4">Tier</th><th class="py-2 pr-4">Source</th><th class="py-2 pr-4">Status</th><th class="py-2">Created</th></tr></thead><tbody class="divide-y divide-[#1e232b]">';
      for(const r of pageData.rows){ const src=r.source||(parseNote(r.note).isContributor?'contributor':'developer'); const st=r.status||'pending'; const cls=st==='approved'?'text-emerald-400':st==='rejected'?'text-rose-400':'text-gold';
        h+='<tr><td class="py-2 pr-4 mono text-gold cursor-pointer" data-copy="'+(r.address||'')+'">'+(r.address?(r.address.slice(0,10)+'…'+r.address.slice(-6)):'')+'</td><td class="py-2 pr-4">'+(r.tier||'')+'</td><td class="py-2 pr-4">'+sourceBadge(src)+'</td><td class="py-2 pr-4 font-bold '+cls+'">'+st+'</td><td class="py-2 subtle">'+String(r.createdAt||'').replace('T',' ').replace('Z','')+'</td></tr>';
      }
      h+='</tbody></table></div>'+paginationHtml('history',pageData); el.innerHTML=h;
      Array.from(el.querySelectorAll('[data-copy]')).forEach(x=>x.addEventListener('click',()=>copyText(x.getAttribute('data-copy'))));
      bindPagination(el);
    }
    function renderRequestsFromCache(){
      initControls();
      const q=String((document.getElementById('requestSearchInput')||{}).value||'').toLowerCase().trim();
      const mode=String((document.getElementById('requestFilterSelect')||{}).value||'all');
      const pending=(apiKeyRequestsCache||[]).filter(x=>x.status==='pending').filter(function(r){
        const src=r.source||(parseNote(r.note).isContributor?'contributor':'developer');
        if(mode!=='all' && src!==mode) return false;
        if(!q) return true;
        const m=parseNote(r.note); return [r.address,r.tier,r.note,m.role,m.region,m.endpoint,m.enode].join(' ').toLowerCase().includes(q);
      });
      renderRequests(pending); renderHistory(apiKeyRequestsCache||[]);
    }
    async function loadRequests(){
      initControls(); const st=document.getElementById('apiKeyReqStatus'); if(st) st.textContent='Loading requests…';
      try{ const r=await adminFetch('/apikey/requests'); const d=await r.json(); if(!d.ok) throw new Error(d.error||'failed'); apiKeyRequestsCache=d.requests||[]; renderRequestsFromCache(); const p=apiKeyRequestsCache.filter(x=>x.status==='pending').length; if(st) st.textContent='Loaded '+p+' pending request(s).'; }
      catch(e){ if(st) st.textContent='Load failed: '+(e?.message||e); }
    }
    async function approveKey(id){
      if(!confirm('Approve request '+id+'? Contributor approval validates stake and endpoint, proves the Enode against Foundation peers, creates monitoring/canary configuration, and activates OperatorRegistry on-chain.')) return;
      const st=document.getElementById('apiKeyReqStatus'); if(st) st.textContent='Approving…';
      try{ const r=await adminFetch('/apikey/approve',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({id})}); const d=await r.json(); if(!d.ok) throw new Error(d.error||'approve failed'); const op=d.onboarding?('\\nOperator: ACTIVE\\nReward service: '+d.onboarding.service+'\\nMonitoring route: created'):''; alert('Approved!\\nTier: '+d.tier+'\\nAddress: '+d.address+'\\nAPI Key: '+d.key+op); refreshAll(); }
      catch(e){ if(st) st.textContent='Approve failed: '+(e?.message||e); alert('Approve failed: '+(e?.message||e)); }
    }
    async function rejectKey(id){
      const reason=prompt('Reject '+id+'. Optional reason:')||''; if(!confirm('Reject request '+id+'?')) return;
      const st=document.getElementById('apiKeyReqStatus'); if(st) st.textContent='Rejecting…';
      try{ const r=await adminFetch('/apikey/reject',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({id,reason})}); const d=await r.json(); if(!d.ok) throw new Error(d.error||'reject failed'); refreshAll(); }
      catch(e){ if(st) st.textContent='Reject failed: '+(e?.message||e); alert('Reject failed: '+(e?.message||e)); }
    }
    function renderKeys(keys){
      const el=document.getElementById('apiKeyKeysTable'); if(!el) return;
      const q=String((document.getElementById('keySearchInput')||{}).value||'').toLowerCase().trim();
      const rows=(Array.isArray(keys)?keys:[]).filter(k=>!q||[k.keyPrefix,k.address,k.tier,k.status,k.source].join(' ').toLowerCase().includes(q));
      if(!rows.length){ el.innerHTML='<div class="text-[11px] subtle mono">No keys.</div>'; return; }
      const pageData=paginateRows(rows,'keys');
      let h='<div class="overflow-x-auto"><table class="w-full text-left text-[11px]"><thead class="text-[10px] uppercase tracking-widest subtle border-b border-[#232833]"><tr><th class="py-2 pr-4">Prefix</th><th class="py-2 pr-4">Address</th><th class="py-2 pr-4">Tier</th><th class="py-2 pr-4">Source</th><th class="py-2 pr-4">Status</th><th class="py-2 pr-4">Created</th><th class="py-2">Action</th></tr></thead><tbody class="divide-y divide-[#1e232b]">';
      for(const k of pageData.rows){ h+='<tr><td class="py-2 pr-4 mono text-[#a2a9b4]">'+(k.keyPrefix||'')+'…</td><td class="py-2 pr-4 mono text-gold cursor-pointer" data-copy="'+(k.address||'')+'">'+(k.address?(k.address.slice(0,10)+'…'+k.address.slice(-6)):'')+'</td><td class="py-2 pr-4 font-bold">'+(k.tier||'')+'</td><td class="py-2 pr-4">'+sourceBadge(k.source)+'</td><td class="py-2 pr-4 '+(k.status==='active'?'text-emerald-400':'subtle')+' font-bold">'+(k.status||(k.active?'active':'revoked'))+'</td><td class="py-2 pr-4 subtle">'+String(k.createdAt||'').replace('T',' ').replace('Z','')+'</td><td class="py-2">'+((k.active||k.status==='active')?('<div class="flex gap-2"><button class="bg-aqua/10 text-aqua text-[10px] font-bold px-3 py-1.5 rounded-lg border border-aqua/20 hover:bg-aqua/20" data-rotate="'+(k.id||'')+'" data-rp="'+(k.keyPrefix||'')+'">ROTATE</button><button class="bg-rose-500/10 text-rose-400 text-[10px] font-bold px-3 py-1.5 rounded-lg border border-rose-500/20 hover:bg-rose-500/20" data-revoke="'+(k.id||'')+'" data-rp="'+(k.keyPrefix||'')+'">REVOKE</button></div>'):'<span class="subtle">-</span>')+'</td></tr>'; }
      h+='</tbody></table></div>'+paginationHtml('keys',pageData); el.innerHTML=h;
      Array.from(el.querySelectorAll('[data-copy]')).forEach(x=>x.addEventListener('click',()=>copyText(x.getAttribute('data-copy'))));
      Array.from(el.querySelectorAll('[data-revoke]')).forEach(b=>b.addEventListener('click',()=>revokeById(b.getAttribute('data-revoke'),b.getAttribute('data-rp'))));
      Array.from(el.querySelectorAll('[data-rotate]')).forEach(b=>b.addEventListener('click',()=>rotateById(b.getAttribute('data-rotate'),b.getAttribute('data-rp'))));
      bindPagination(el);
    }
    async function loadKeys(){
      initControls();
      try{ const r=await adminFetch('/apikey/keys'); const d=await r.json(); if(!d.ok) throw new Error(d.error||'failed'); apiKeyKeysCache=d.keys||[]; renderKeys(apiKeyKeysCache); }
      catch(e){ const el=document.getElementById('apiKeyKeysTable'); if(el) el.innerHTML='<div class="text-[11px] text-rose-400 mono">Load keys failed: '+(e?.message||e)+'</div>'; }
    }
    async function revokeById(id,prefix){ if(!id) return; if(!confirm('Revoke key '+(prefix||id)+'? Removes from nginx + reload.')) return;
      try{ const r=await adminFetch('/apikey/revoke',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({id})}); const d=await r.json(); if(!d.ok) throw new Error(d.error||'revoke failed'); refreshAll(); }catch(e){ alert('Revoke failed: '+(e?.message||e)); } }
    async function rotateById(id,prefix){ if(!id) return; if(!confirm('Rotate key '+(prefix||id)+'? Old key revoked, new key issued.')) return;
      try{ const r=await adminFetch('/apikey/rotate',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({id})}); const d=await r.json(); if(!d.ok) throw new Error(d.error||'rotate failed'); alert('Rotated!\\nTier: '+d.tier+'\\nAddress: '+d.address+'\\nNew API Key: '+d.key); refreshAll(); }catch(e){ alert('Rotate failed: '+(e?.message||e)); } }

    function renderLegacyKeys(keys){
      const el=document.getElementById('legacyKeysTable'); if(!el) return;
      if(!keys.length){ el.innerHTML='<div class="text-[11px] subtle mono">None found in nginx map.</div>'; return; }
      const pageData=paginateRows(keys,'legacy');
      let h='<div class="overflow-x-auto"><table class="w-full text-left text-[11px]"><thead class="text-[10px] uppercase tracking-widest subtle border-b border-[#232833]"><tr><th class="py-2 pr-4">Key (masked)</th><th class="py-2 pr-4">Type</th><th class="py-2">Copy</th></tr></thead><tbody class="divide-y divide-[#1e232b]">';
      for(const k of pageData.rows){ const masked=k.slice(0,6)+'…'+k.slice(-4); h+='<tr><td class="py-2 pr-4 mono text-rose-300">'+masked+'</td><td class="py-2 pr-4"><span class="mono text-[9px] px-1.5 py-0.5 rounded border border-rose-500/30 text-rose-400 bg-rose-500/10">legacy master</span></td><td class="py-2"><button class="text-[10px] mono px-2 py-1 rounded border border-[#232833] text-[#a2a9b4] hover:text-white" data-copy="'+k+'">copy full</button></td></tr>'; }
      h+='</tbody></table></div>'+paginationHtml('legacy',pageData); el.innerHTML=h;
      Array.from(el.querySelectorAll('[data-copy]')).forEach(x=>x.addEventListener('click',()=>copyText(x.getAttribute('data-copy'))));
      bindPagination(el);
    }
    async function loadLegacyKeys(){
      const el=document.getElementById('legacyKeysTable'); if(!el) return;
      try{ const r=await adminFetch('/legacy-keys'); const d=await r.json(); if(!d.ok) throw new Error(d.error||'failed'); legacyKeysCache=d.keys||[]; renderLegacyKeys(legacyKeysCache); }
      catch(e){ el.innerHTML='<div class="text-[11px] text-rose-400 mono">Load legacy keys failed: '+(e?.message||e)+'</div>'; }
    }

    function renderStakeWatch(rows){
      const el=document.getElementById('stakeWatchTable'); if(!el) return;
      if(!rows.length){ el.innerHTML='<div class="text-[11px] subtle mono">No tracked addresses.</div>'; return; }
      const pageData=paginateRows(rows,'stakes');
      let h='<div class="overflow-x-auto"><table class="w-full text-left text-[11px]"><thead class="text-[10px] uppercase tracking-widest subtle border-b border-[#232833]"><tr><th class="py-2 pr-4">Address</th><th class="py-2 pr-4">Tier</th><th class="py-2 pr-4">Stake</th><th class="py-2 pr-4">Unstake</th><th class="py-2 pr-4">Keys</th><th class="py-2">Hint</th></tr></thead><tbody class="divide-y divide-[#1e232b]">';
      for(const r of pageData.rows){ let lbl='STAKED',cls='text-emerald-400'; if(r.unstakeStatus==='withdrawable'){lbl='WITHDRAWABLE';cls='text-rose-400';} else if(r.unstakeStatus==='cooldown'){lbl='COOLDOWN '+Math.max(0,r.cooldownLeftSec)+'s';cls='text-gold';} else if(r.unstakeStatus==='no-stake'){lbl='NO STAKE';cls='subtle';}
        const keys=(r.activeKeys||[]).map(k=>(k.keyPrefix||'')+(k.tier?('/'+k.tier):'')).join(', ');
        let hint='-'; if((r.unstakeStatus==='cooldown'||r.unstakeStatus==='withdrawable')&&(r.activeKeys||[]).length>0) hint='consider revoke'; else if(r.unstakeStatus==='staked'&&(r.activeKeys||[]).length>0) hint='key active while staked';
        h+='<tr><td class="py-2 pr-4 mono text-gold cursor-pointer" data-copy="'+(r.address||'')+'">'+(r.address?(r.address.slice(0,10)+'…'+r.address.slice(-6)):'')+'</td><td class="py-2 pr-4 font-bold uppercase">'+(r.tier||'none')+'</td><td class="py-2 pr-4 mono">'+(r.stake||'0')+'</td><td class="py-2 pr-4 mono font-bold '+cls+'">'+lbl+'</td><td class="py-2 pr-4 mono">'+((r.activeKeys||[]).length)+(keys?(' <span class="subtle">('+keys+')</span>'):'')+'</td><td class="py-2 subtle mono">'+hint+'</td></tr>';
      }
      h+='</tbody></table></div>'+paginationHtml('stakes',pageData); el.innerHTML=h;
      Array.from(el.querySelectorAll('[data-copy]')).forEach(x=>x.addEventListener('click',()=>copyText(x.getAttribute('data-copy'))));
      bindPagination(el);
    }
    async function loadStakeWatch(){
      const st=document.getElementById('stakeWatchStatus'); if(st) st.textContent='Loading stake watch…';
      try{ const r=await adminFetch('/stakes'); const d=await r.json(); if(!d.ok) throw new Error(d.error||'failed'); stakeWatchCache=d.rows||[]; renderStakeWatch(stakeWatchCache); if(st) st.textContent='Loaded '+stakeWatchCache.length+' address(es).'; }
      catch(e){ if(st) st.textContent='Load failed: '+(e?.message||e); const el=document.getElementById('stakeWatchTable'); if(el) el.innerHTML='<div class="text-[11px] text-rose-400 mono">Load stakes failed: '+(e?.message||e)+'</div>'; }
    }

    async function changeAdminPassword(){
      const st=document.getElementById('adminBasicStatus');
      const username=(document.getElementById('adminBasicUserInput')?.value||'').trim();
      const currentPassword=document.getElementById('adminBasicCurrentInput')?.value||'';
      const newPassword=document.getElementById('adminBasicNewInput')?.value||'';
      const confirmPassword=document.getElementById('adminBasicConfirmInput')?.value||'';
      if(!username) return st.textContent='Username required.';
      if(!currentPassword) return st.textContent='Current password required.';
      if(!newPassword) return st.textContent='New password required.';
      if(newPassword!==confirmPassword) return st.textContent='Confirmation mismatch.';
      st.textContent='Updating…';
      try{ const r=await fetch(API_URL+'/auth/change-password',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username,currentPassword,newPassword,confirmPassword})}); const d=await r.json(); if(!r.ok||!d.ok) throw new Error(d.error||'failed'); st.textContent='Password updated. Use it on next login.'; ['adminBasicCurrentInput','adminBasicNewInput','adminBasicConfirmInput'].forEach(id=>{const e=document.getElementById(id); if(e) e.value='';}); }
      catch(e){ st.textContent='Update failed: '+(e?.message||e); }
    }

    async function loadContributionStatus(){
      const el=document.getElementById('contributionStatus'); if(!el) return;
      try{
        const r=await adminFetch('/contribution-status'); const d=await r.json(); if(!d.ok) throw new Error(d.error||'failed');
        const candidates=new Map(((d.router&&d.router.candidates)||[]).map(x=>[String(x.operator||'').toLowerCase(),x]));
        const traffic=(d.traffic&&d.traffic.operators)||{};
        let h='<div class="flex flex-wrap items-center justify-between gap-2"><span class="text-white font-bold">REAL CONTRIBUTION · '+Number(d.canaryPercent||0).toFixed(2)+'% HTTP RPC CANARY</span><span>window '+((d.traffic&&d.traffic.windowMinutes)||120)+' min</span></div>';
        h+='<div class="mt-2 grid grid-cols-1 md:grid-cols-2 gap-2">';
        for(const op of (d.operators||[])){
          const addr=String(op.operator||'').toLowerCase(), c=candidates.get(addr), t=traffic[addr]||{};
          const v2=op.contributionPolicyVersion==='v2', healthy=!!(c&&c.healthy);
          h+='<div class="rounded border border-[#232833] p-2"><div><span class="text-gold">'+(addr?addr.slice(0,10)+'...'+addr.slice(-6):'--')+'</span> · <span class="'+(v2?'text-emerald-400':'subtle')+'">'+(v2?'v2 verified':'v1 legacy')+'</span></div>';
          h+='<div class="mt-1">P2P '+(c?(c.p2pConnectedAgents+'/2'):(op.p2p?'checking':'unverified'))+' · route <span class="'+(healthy?'text-emerald-400':'subtle')+'">'+(healthy?'HEALTHY':(c&&c.error?c.error:'not in canary'))+'</span></div>';
          h+='<div class="mt-1">requests '+Number(t.requests||0)+' · success '+(Number(t.successRate||0)*100).toFixed(1)+'% · avg '+(t.avgLatencyMs==null?'--':Number(t.avgLatencyMs).toFixed(1))+'ms · fallbacks '+Number(t.fallbacks||0)+'</div></div>';
        }
        h+='</div>'; el.innerHTML=h;
      }catch(e){ el.innerHTML='<span class="text-rose-400">Contribution status unavailable: '+(e?.message||e)+'</span>'; }
    }
    function refreshAll(){ loadRequests(); loadKeys(); loadLegacyKeys(); loadStakeWatch(); loadContributionStatus(); }

    document.addEventListener('click', function(e){ const m=document.getElementById('latestRewardsModal'); if(!m.classList.contains('hidden') && e.target===m) closeLatestRewards(); });

    // init
    try{ initAdminTabs(); }catch(e){}
    try{ updateLabels(); }catch(e){}
    try{ loadHealth(); refreshAll(); }catch(e){}
    setInterval(loadHealth, 60000);
  </script>
</body>
</html>
`;
  fs.writeFileSync(DASHBOARD_OUTPUT, html);
  console.log('dashboard written', new Date().toISOString());
}

main().catch(console.error);
