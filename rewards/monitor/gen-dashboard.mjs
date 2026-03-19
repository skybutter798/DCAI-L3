import fs from 'node:fs';
import { ethers } from 'ethers';

const RPC_URL = process.env.RPC_URL || 'http://139.180.188.61:8545';
const TREASURY_ADDR = '0xae201c3daacd53e4cb305fa91678b16cc7eae43a';
const DISTRIBUTOR_ADDR = '0x728f2C63b9A0ff0918F5ffB3D4C2d004107476B7';

// Infrastructure Map
const INFRA = [
  { name: 'Signer 1 (Sealer)', ip: '45.76.190.151', role: 'Consensus', type: 'Core' },
  { name: 'Signer 2 (Sealer)', ip: '139.180.188.167', role: 'Consensus', type: 'Core' },
  { name: 'Signer 3 (Sealer)', ip: '45.76.145.198', role: 'Consensus', type: 'Core' },
  { name: 'RPC 1 (Gateway)', ip: '139.180.188.61', role: 'API/HTTP', type: 'Gate' },
  { name: 'RPC 2 (Gateway)', ip: '207.148.72.238', role: 'API/HTTP', type: 'Gate' },
  { name: "Indexer Node", ip: "139.180.141.226", role: "Indexer", type: "L3" },
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
  } catch(e) { console.error('Balance check failed', e); }
  
  const config = JSON.parse(fs.readFileSync('/opt/dcai/rewards/monitor/config.json', 'utf8'));
  
  let measurements = { epochId: 'N/A', dayId: 'N/A', operators: [] };
  const possiblePaths = [
    '/opt/dcai/rewards/monitor/measurements.json',
    '/opt/dcai/rewards/inbox/measurements.json'
  ];
  for (const p of possiblePaths) {
    if (fs.existsSync(p)) {
      measurements = JSON.parse(fs.readFileSync(p, 'utf8'));
      break;
    }
  }

  // latest published rewards (off-chain mirror)
  let latestRewards = null;
  try {
    latestRewards = JSON.parse(fs.readFileSync('/var/www/html/rewards/latest.json', 'utf8'));
  } catch (e) {
    latestRewards = null;
  }
  const latestEpochId = latestRewards?.epochId ?? 'N/A';
  const latestDayId = latestRewards?.dayId ?? 'N/A';
  const latestTotalWei = latestRewards?.totalWei ? BigInt(latestRewards.totalWei) : 0n;


const weights = config.weights || { rpc: 0.4, storage: 0.3, indexer: 0.3 };
    const distAbi = [
    "function dailyCapWei() view returns (uint256)",
    "function dailySpentWei(uint256 dayId) view returns (uint256)"
  ];
  const dist = new ethers.Contract(DISTRIBUTOR_ADDR, distAbi, provider);
  const dayId = Number(measurements.dayId) || (new Date().toISOString().slice(0,10).replaceAll("-",""));
  let dailyCapWei = 0n;
  let dailySpentWei = 0n;
  try {
    dailyCapWei = BigInt(await dist.dailyCapWei());
    dailySpentWei = BigInt(await dist.dailySpentWei(dayId));
  } catch (e) { console.error("cap read failed", e); }
  const dailyRemainWei = dailyCapWei - dailySpentWei;

  // Recent published epochs (on-chain events), last 10 for current day
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
      const eDayId = BigInt(parsed.args.dayId.toString());
      if (eDayId !== todayDayId) continue;
      const eEpochId = parsed.args.epochId.toString();
      items.push(eEpochId);
    }
    recentRewardEpochIds = Array.from(new Set(items)).sort().reverse().slice(0, 10);
  } catch (e) {
    recentRewardEpochIds = [];
  }

  const format2 = (wei) => {
    try { return Number(ethers.formatEther(wei)).toFixed(2); } catch { return "--"; }
  };

  const formatBalance = (val) => {
    const ether = ethers.formatEther(val);
    const parts = ether.split('.');
    if (parts.length === 1) return parts[0];
    return parts[0] + '.' + parts[1].slice(0, 4);
  };

  const html = `
<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <title>DCAI Foundation Control</title>
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <script src="https://cdn.tailwindcss.com"></script>
    <style>
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700&family=Space+Mono:wght@400;700&display=swap');
        body { font-family: 'Inter', sans-serif; }
        .font-mono { font-family: 'Space Mono', monospace; letter-spacing: -0.02em; }
        input[type=range] { -webkit-appearance: none; background: transparent; }
        input[type=range]::-webkit-slider-thumb {
            -webkit-appearance: none;
            height: 18px;
            width: 18px;
            border-radius: 50%;
            background: #eab308;
            cursor: pointer;
            margin-top: -7px;
        }
        input[type=range]::-webkit-slider-runnable-track {
            width: 100%;
            height: 4px;
            cursor: pointer;
            background: #334155;
            border-radius: 2px;
        }
    </style>
</head>
<body class="bg-slate-950 text-slate-100 p-4 md:p-8">
    <div class="max-w-7xl mx-auto">
        <header class="mb-10 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
            <div>
                <h1 class="text-4xl font-extrabold tracking-tight text-white">
                    DCAI <span class="text-yellow-500">Foundation</span>
                </h1>
                <p class="text-slate-400 font-medium mt-1 uppercase text-xs tracking-widest">Unified Network Control Center</p>
            </div>
            <div class="flex items-center gap-6 bg-slate-900/50 p-4 rounded-3xl border border-slate-800 shadow-2xl">
                <div class="text-right">
                    <div class="text-[10px] text-slate-500 font-bold uppercase tracking-wider mb-1">Latest Block</div>
                    <div class="text-xl font-mono text-emerald-400 font-bold tracking-tighter">#${blockNumber}</div>
                </div>
                <div class="w-px h-10 bg-slate-800"></div>
                <div class="text-right">
                    <div class="flex items-center justify-end gap-2">
                        <span class="relative flex h-2 w-2">
                          <span class="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
                          <span class="relative inline-flex rounded-full h-2 w-2 bg-green-500"></span>
                        </span>
                        <span class="text-green-400 text-xs font-bold uppercase tracking-wider">Network Active</span>
                    </div>
                    <p class="text-[10px] text-slate-500 mt-0.5">Update: ${new Date().toLocaleTimeString()}</p>
                </div>
            </div>
        </header>

        <div class="grid grid-cols-1 md:grid-cols-4 gap-6 mb-10">
            <div class="bg-slate-900 p-6 rounded-3xl border border-slate-800 shadow-xl md:col-span-2">
                <h3 class="text-slate-500 text-xs font-bold uppercase tracking-widest mb-4">Treasury Reserve</h3>
                <div class="text-3xl font-mono text-blue-400 font-bold">${formatBalance(treasuryBal)} <span class="text-lg font-sans text-slate-600 ml-1">tDCAI</span></div>
                <div class="mt-4 pt-4 border-t border-slate-800/50">
                    <span class="text-[9px] text-slate-600 font-mono tracking-tight cursor-pointer hover:text-blue-400" onclick="copyText('${TREASURY_ADDR}')">${TREASURY_ADDR.slice(0,18)}...</span>
                </div>
            </div>
            <div class="bg-slate-900 p-6 rounded-3xl border border-slate-800 shadow-xl">
                <h3 class="text-slate-500 text-xs font-bold uppercase tracking-widest mb-4">Distributor Pool</h3>
                <div class="text-3xl font-mono text-yellow-500 font-bold">${formatBalance(distributorBal)} <span class="text-lg font-sans text-slate-600 ml-1">tDCAI</span></div>
                <div class="mt-4 flex flex-wrap gap-2">
                    <button onclick="topup(100)" class="bg-slate-800 hover:bg-slate-700 text-[10px] font-bold px-2 py-1 rounded-lg border border-slate-700 transition">+100</button>
                    <button onclick="topup(500)" class="bg-slate-800 hover:bg-slate-700 text-[10px] font-bold px-2 py-1 rounded-lg border border-slate-700 transition">+500</button>
                    <button onclick="customTopup()" class="bg-yellow-500/10 text-yellow-500 text-[10px] font-bold px-2 py-1 rounded-lg border border-yellow-500/20 transition">CUSTOM</button>
                </div>
            </div>
            <div class="bg-slate-900 p-6 rounded-3xl border border-slate-800 shadow-xl">
                <h3 class="text-slate-500 text-xs font-bold uppercase tracking-widest mb-4">Current Epoch</h3>
                <div class="text-3xl font-mono text-purple-400 font-bold">${measurements.epochId}</div>
                <div class="mt-4 pt-4 border-t border-slate-800/50">
                    <span class="text-[10px] text-slate-600 font-bold uppercase">Day: ${measurements.dayId || 'N/A'}</span>
                </div>
            </div>

            <div class="bg-slate-900 p-6 rounded-3xl border border-slate-800 shadow-xl md:col-span-2 cursor-pointer hover:border-yellow-500/40 transition" onclick="openLatestRewards()">
                <h3 class="text-slate-500 text-xs font-bold uppercase tracking-widest mb-4">Latest Published Reward</h3>
                <div class="text-3xl font-mono text-yellow-400 font-bold">${format2(latestTotalWei)} <span class="text-lg font-sans text-slate-600 ml-1">tDCAI</span></div>
                <div class="mt-4 pt-4 border-t border-slate-800/50 flex items-center justify-between">
                    <div>
                      <div class="text-[9px] text-slate-600 font-bold uppercase">Epoch</div>
                      <div class="text-xs font-mono text-slate-300">${latestEpochId}</div>
                      <div class="text-[9px] text-slate-600 font-bold uppercase mt-2">Day</div>
                      <div class="text-xs font-mono text-slate-300">${latestDayId}</div>
                      <div class="text-[9px] text-slate-600 font-bold uppercase mt-3">Recent (max 10)</div>
                      <div class="text-[10px] font-mono text-slate-400">${recentRewardEpochIds.join(' · ') || 'N/A'}</div>
                    </div>
                    <div class="text-[10px] text-yellow-400 font-bold uppercase tracking-wider">View →</div>
                </div>
            </div>
            <div class="bg-slate-900 p-6 rounded-3xl border border-slate-800 shadow-xl">
                <div class="flex justify-between items-start">
                    <h3 class="text-slate-500 text-xs font-bold uppercase tracking-widest mb-4">Daily Cap (Day ${dayId})</h3>
                </div>
                <div class="grid grid-cols-3 gap-3">
                    <div>
                        <div class="text-[9px] text-slate-600 font-bold uppercase">Cap</div>
                        <div class="text-sm font-mono text-white font-bold">${format2(dailyCapWei)} <span class="text-[10px] text-slate-600 ml-1">tDCAI</span></div>
                    </div>
                    <div>
                        <div class="text-[9px] text-slate-600 font-bold uppercase">Spent</div>
                        <div class="text-sm font-mono text-amber-400 font-bold">${format2(dailySpentWei)} <span class="text-[10px] text-slate-600 ml-1">tDCAI</span></div>
                    </div>
                    <div>
                        <div class="text-[9px] text-slate-600 font-bold uppercase">Remaining</div>
                        <div class="text-sm font-mono text-emerald-400 font-bold">${format2(dailyRemainWei)} <span class="text-[10px] text-slate-600 ml-1">tDCAI</span></div>
                    </div>
                </div>
                <div class="mt-4 pt-4 border-t border-slate-800/50 flex gap-2">
                    <button onclick="increaseCap()" class="flex-1 bg-emerald-500/10 text-emerald-400 text-[10px] font-bold px-2 py-1 rounded-lg border border-emerald-500/20 hover:bg-emerald-500/20 transition">INCREASE +100</button>
                    <button onclick="setCap()" class="flex-1 bg-yellow-500/10 text-yellow-500 text-[10px] font-bold px-2 py-1 rounded-lg border border-yellow-500/20 hover:bg-yellow-500/20 transition">SET CAP</button>
                </div>
            </div>
        </div>


        <div class="grid grid-cols-1 lg:grid-cols-2 gap-10 mb-10">
            <div class="bg-slate-900 p-6 rounded-3xl border border-slate-800 shadow-xl mb-10">
                <div class="flex justify-between items-center">
                    <h2 class="text-xl font-bold text-white">Health Check (1-min)</h2>
                    <div id="healthUpdatedAt" class="text-[10px] text-slate-500 font-mono"></div>
                </div>
                <div id="healthTable" class="mt-4 text-xs text-slate-300"></div>
            </div>
            <!-- Infra Monitoring -->
            <div class="bg-slate-900 rounded-3xl border border-slate-800 shadow-2xl overflow-hidden flex flex-col">
                <div class="p-6 border-b border-slate-800 bg-slate-900/50">
                    <h2 class="text-xl font-bold text-white">DCAI Core Infrastructure</h2>
                </div>
                <div class="p-4 grid grid-cols-1 md:grid-cols-2 gap-4">
                    ${INFRA.map(node => `
                    <div class="p-4 bg-slate-800/30 rounded-2xl border border-slate-800 hover:border-slate-700 transition group">
                        <div class="flex justify-between items-start">
                            <div class="text-xs font-bold text-slate-300">${node.name}</div>
                            <span class="px-2 py-0.5 rounded-full bg-slate-700 text-[8px] font-bold text-slate-400 uppercase tracking-widest">${node.type}</span>
                        </div>
                        <div class="mt-2 font-mono text-sm text-yellow-500 cursor-pointer" onclick="copyText('${node.ip}')">${node.ip}</div>
                        <div class="mt-2 flex items-center justify-between">
                            <div class="text-[9px] text-slate-500 uppercase font-bold">${node.role}</div>
                            <div class="flex items-center gap-1">
                                <div id="dot_${node.ip.replaceAll('.','_')}" class="w-1.5 h-1.5 rounded-full bg-slate-600"></div>
                                <span id="st_${node.ip.replaceAll('.','_')}" class="text-[9px] text-slate-400 font-bold">CHECKING</span>
                            </div>
                        </div>
                        <div class="mt-2 text-[9px] text-slate-600 font-mono">Last: <span id="ts_${node.ip.replaceAll('.','_')}">--</span> • <span id="ms_${node.ip.replaceAll('.','_')}">--</span></div>
                    </div>
                    `).join('')}
                </div>
                <div class="mt-auto p-4 bg-slate-900/50 border-t border-slate-800">
                    <div class="flex justify-between text-[10px] text-slate-500 font-bold uppercase">
                        <span>Network Health Index</span>
                        <span class="text-emerald-400">100% (Optimal)</span>
                    </div>
                    <div class="mt-2 w-full bg-slate-800 h-1 rounded-full"><div class="bg-emerald-500 h-full w-full"></div></div>
                </div>
            </div>

        </div>

        <div class="grid grid-cols-1 lg:grid-cols-2 gap-10 mb-10">
            <!-- Contributor Performance -->
            <div class="bg-slate-900 rounded-3xl border border-slate-800 shadow-2xl overflow-hidden">
                <div class="p-6 border-b border-slate-800 bg-slate-900/50 flex justify-between items-center">
                    <h2 class="text-xl font-bold text-white">External Contributors</h2>
                    <span class="px-3 py-1 bg-yellow-500/10 text-yellow-500 text-[10px] font-bold rounded-full">REWARDS ACTIVE</span>
                </div>
                <div class="overflow-x-auto">
                    <table class="w-full text-left">
                        <thead>
                            <tr class="text-slate-500 text-[9px] font-bold uppercase tracking-widest bg-slate-900/50">
                                <th class="px-6 py-4">Operator</th>
                                <th class="px-6 py-4">RPC Stats</th>
                                <th class="px-6 py-4 text-right">Indexer (shared infra)</th>
                            </tr>
                        </thead>
                        <tbody class="divide-y divide-slate-800/50">
                            ${measurements.operators.map((op, idx) => {
                                const conf = config.operators.find(c => c.operator.toLowerCase() === op.operator.toLowerCase());
                                const rpcIp = conf?.endpoints?.rpc?.match(/\\d+\\.\\d+\\.\\d+\\.\\d+/) || 'N/A';
                                const rpcUptime = op.metrics?.rpc?.uptime ?? 0;
                                const rpcP95 = op.metrics?.rpc?.p95_ms;
                                const indexerEnabled = !!conf?.services?.indexer;
                                const indexerLag = op.metrics?.indexer?.lag_blocks;
                                return `
                            <tr class="hover:bg-slate-800/20 transition-colors">
                                <td class="px-6 py-5">
                                    <div class="text-xs font-bold text-white mb-0.5">${op.operator === '0x6B876620391BD2A1281247B1fC15ae4994D50663' ? 'Contributor 1' : 'Contributor 2'}</div>
                                    <div class="text-[9px] text-slate-500 font-mono">IP: ${rpcIp}</div>
                                    <div class="text-[8px] text-slate-600 font-mono mt-0.5 cursor-pointer hover:text-yellow-500" onclick="copyText('${op.operator}')">${op.operator.slice(0,20)}...</div>
                                </td>
                                <td class="px-6 py-5">
                                    <div class="${rpcUptime > 0.9 ? 'text-emerald-400' : 'text-rose-500'} text-xs font-bold">${(rpcUptime * 100).toFixed(1)}%</div>
                                    <div class="text-[9px] text-slate-500 font-mono">${rpcP95 == null ? '--' : rpcP95.toFixed(0) + 'ms'}</div>
                                </td>
                                <td class="px-6 py-5 text-right">
                                    ${indexerEnabled && indexerLag != null
                                      ? `<div class="text-xs font-bold ${indexerLag < 5 ? 'text-emerald-400' : 'text-amber-500'}">-${indexerLag}</div><div class="text-[9px] text-slate-600 uppercase font-bold">Blocks</div>`
                                      : `<div class="text-xs font-bold text-slate-500">OFF</div><div class="text-[9px] text-slate-600 uppercase font-bold">Disabled</div>`}
                                </td>
                            </tr>
                            `;}).join('')}
                        </tbody>
                    </table>
                </div>
            </div>
            <!-- Strategy Panel -->
            <div class="bg-slate-900 p-8 rounded-3xl border border-slate-800 shadow-xl mb-10">
                <div class="flex justify-between items-center mb-8">
                    <div>
                        <h2 class="text-xl font-bold text-white">Network Reward Strategy</h2>
                        <p class="text-slate-500 text-xs mt-1">Dynamically adjust incentives for different node roles</p>
                    </div>
                    <button onclick="saveWeights()" id="saveBtn" class="bg-yellow-500 text-black px-6 py-2.5 rounded-2xl text-xs font-bold hover:bg-yellow-400 transition shadow-lg shadow-yellow-500/20">UPDATE GLOBAL WEIGHTS</button>
                </div>
                
                <div class="grid grid-cols-1 md:grid-cols-3 gap-10">
                    <div class="p-6 bg-slate-800/30 rounded-2xl border border-slate-800">
                        <div class="flex justify-between items-center mb-4">
                            <label class="text-xs font-bold text-slate-400 uppercase tracking-widest">RPC Gateway</label>
                            <span id="rpcWeightLabel" class="text-sm font-mono text-yellow-500 font-bold">${(weights.rpc * 100).toFixed(0)}%</span>
                        </div>
                        <input type="range" id="rpcWeight" min="0" max="100" value="${weights.rpc * 100}" oninput="updateLabels()" class="w-full">
                    </div>
    
                    <div class="p-6 bg-slate-800/30 rounded-2xl border border-slate-800">
                        <div class="flex justify-between items-center mb-4">
                            <label class="text-xs font-bold text-slate-400 uppercase tracking-widest">Storage Node</label>
                            <span id="storageWeightLabel" class="text-sm font-mono text-emerald-400 font-bold">${(weights.storage * 100).toFixed(0)}%</span>
                        </div>
                        <input type="range" id="storageWeight" min="0" max="100" value="${weights.storage * 100}" oninput="updateLabels()" class="w-full">
                    </div>
    
                    <div class="p-6 bg-slate-800/30 rounded-2xl border border-slate-800">
                        <div class="flex justify-between items-center mb-4">
                            <label class="text-xs font-bold text-slate-400 uppercase tracking-widest">Indexer Sync</label>
                            <span id="indexerWeightLabel" class="text-sm font-mono text-blue-400 font-bold">${(weights.indexer * 100).toFixed(0)}%</span>
                        </div>
                        <input type="range" id="indexerWeight" min="0" max="100" value="${weights.indexer * 100}" oninput="updateLabels()" class="w-full">
                    </div>
                </div>
                
                <div id="weightAlert" class="mt-6 hidden p-3 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-500 text-[10px] font-bold text-center uppercase tracking-wider">
                    Total allocation must equal 100% (Current: <span id="totalWeight">100</span>%)
                </div>
            </div>
    
        </div>



        <div class="bg-slate-900 p-6 rounded-3xl border border-slate-800 shadow-xl mb-10">
            <div class="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                <div>
                    <h2 class="text-xl font-bold text-white">API Key Approvals</h2>
                    <p class="text-slate-500 text-xs mt-1">Stake-gated requests for app plans + ecosystem contributors (approve / reject / revoke)</p>
                </div>
                <div class="flex flex-wrap gap-2 items-center">
                    <div class="px-3 py-2 rounded-2xl border border-slate-700 bg-slate-950 text-[10px] font-mono text-slate-400">Signed in via Basic Auth</div>
                    <button onclick="refreshAdminData()" class="bg-yellow-500 text-black text-[10px] font-bold px-3 py-2 rounded-2xl hover:bg-yellow-400 transition">REFRESH</button>
                </div>
            </div>

            <div id="apiKeyReqStatus" class="mt-3 text-[10px] font-mono text-slate-500"></div>
            <div class="mt-3 flex flex-wrap gap-2 items-center">
                <input id="requestSearchInput" placeholder="Search wallet / endpoint / note" class="bg-slate-950 border border-slate-700 rounded-2xl px-3 py-2 text-xs font-mono w-[320px]" />
                <select id="requestFilterSelect" class="bg-slate-950 border border-slate-700 rounded-2xl px-3 py-2 text-xs font-mono text-slate-300">
                    <option value="all">All pending</option>
                    <option value="contributor">Contributor only</option>
                    <option value="app">App/API only</option>
                </select>
            </div>
            <div id="apiKeyRequestsTable" class="mt-4"></div>

            <div class="mt-6 pt-4 border-t border-slate-800/50">
                <div class="flex flex-col md:flex-row md:items-center md:justify-between gap-2">
                    <div>
                        <div class="text-xs font-bold text-slate-300">Request History</div>
                        <div class="text-[10px] font-mono text-slate-500 mt-1">Recent approved / rejected / pending requests</div>
                    </div>
                </div>
                <div id="apiKeyRequestHistoryTable" class="mt-3"></div>
            </div>

            <div class="mt-6 pt-4 border-t border-slate-800/50">
                <div class="text-xs font-bold text-slate-300">Key Controls</div>
                <div class="mt-2 flex flex-wrap gap-2 items-center">
                    <input id="revokeKeyInput" placeholder="32-hex key" class="bg-slate-950 border border-slate-700 rounded-2xl px-3 py-2 text-xs font-mono w-[240px]" />
                    <input id="keySearchInput" placeholder="Search key prefix / wallet" class="bg-slate-950 border border-slate-700 rounded-2xl px-3 py-2 text-xs font-mono w-[240px]" />
                    <button onclick="revokeKey()" class="bg-rose-500/10 text-rose-400 text-[10px] font-bold px-3 py-2 rounded-2xl border border-rose-500/20 hover:bg-rose-500/20 transition">REVOKE</button>
                    <button onclick="loadApiKeyKeys()" class="bg-slate-800 hover:bg-slate-700 text-[10px] font-bold px-3 py-2 rounded-2xl border border-slate-700 transition">LIST KEYS</button>
                </div>
                <div id="apiKeyKeysTable" class="mt-3"></div>
            </div>

            <div class="mt-6 pt-4 border-t border-slate-800/50">
                <div class="flex flex-col md:flex-row md:items-center md:justify-between gap-2">
                    <div>
                        <div class="text-xs font-bold text-slate-300">Stake / Unstake Watch</div>
                        <div class="text-[10px] font-mono text-slate-500 mt-1">Tracked addresses from API-key requests + issued keys. Shows unstake cooldown / withdrawable state.</div>
                    </div>
                    <div class="flex gap-2 items-center">
                        <button onclick="loadStakeWatch()" class="bg-slate-800 hover:bg-slate-700 text-[10px] font-bold px-3 py-2 rounded-2xl border border-slate-700 transition">LOAD STAKES</button>
                    </div>
                </div>
                <div id="stakeWatchStatus" class="mt-3 text-[10px] font-mono text-slate-500"></div>
                <div id="stakeWatchTable" class="mt-3"></div>
            </div>

            <div class="mt-6 pt-4 border-t border-slate-800/50">
                <div>
                    <div class="text-xs font-bold text-slate-300">Admin Login Password</div>
                    <div class="text-[10px] font-mono text-slate-500 mt-1">Updates the Basic Auth password used for /admin/ and /admin/api/.</div>
                </div>
                <div class="mt-3 grid grid-cols-1 md:grid-cols-4 gap-2">
                    <input id="adminBasicUserInput" value="dcaiadmin" placeholder="Username" class="bg-slate-950 border border-slate-700 rounded-2xl px-3 py-2 text-xs font-mono" />
                    <input id="adminBasicCurrentInput" type="password" placeholder="Current password" class="bg-slate-950 border border-slate-700 rounded-2xl px-3 py-2 text-xs font-mono" />
                    <input id="adminBasicNewInput" type="password" placeholder="New password" class="bg-slate-950 border border-slate-700 rounded-2xl px-3 py-2 text-xs font-mono" />
                    <input id="adminBasicConfirmInput" type="password" placeholder="Confirm new password" class="bg-slate-950 border border-slate-700 rounded-2xl px-3 py-2 text-xs font-mono" />
                </div>
                <div class="mt-3 flex flex-wrap gap-2 items-center">
                    <button onclick="changeAdminPassword()" class="bg-emerald-500/10 text-emerald-400 text-[10px] font-bold px-3 py-2 rounded-2xl border border-emerald-500/20 hover:bg-emerald-500/20 transition">UPDATE LOGIN PASSWORD</button>
                </div>
                <div id="adminBasicStatus" class="mt-3 text-[10px] font-mono text-slate-500"></div>
            </div>
        </div>
        <footer class="mt-12 mb-8 text-center">
            <p class="text-slate-600 text-[10px] font-bold uppercase tracking-[0.3em]">DCAI Foundation Unified Dashboard &bull; Admin v1.4</p>
        </footer>
    </div>

    <script>
        const API_URL = '/admin/api';

      setTimeout(function(){ try { initAdminTokenInput(); } catch(e){} }, 0);

        async function setCap() {
            const cap = prompt("Set new DAILY CAP (tDCAI). Example: 500");
            if (!cap || isNaN(cap) || parseFloat(cap) <= 0) return;
            if (!confirm("Confirm on-chain tx: setDailyCap(" + cap + " tDCAI)?")) return;
            const r = await fetch(API_URL + "/set-cap", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ cap: parseFloat(cap) })
            });
            const d = await r.json();
            if (d.success) {
                alert("CAP tx sent: " + d.hash);
                location.reload();
            } else {
                alert("Set cap failed: " + (d.error || "unknown"));
            }
        }

        async function increaseCap() {
            const r = await fetch(API_URL + "/cap");
            const d = await r.json();
            const newCap = parseFloat(d.cap) + 100;
            if (!confirm("Increase daily cap to " + newCap + " tDCAI?")) return;
            const r2 = await fetch(API_URL + "/set-cap", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ cap: newCap })
            });
            const d2 = await r2.json();
            if (d2.success) {
                alert("CAP tx sent: " + d2.hash);
                location.reload();
            } else {
                alert("Increase cap failed: " + (d2.error || "unknown"));
            }
        }


        async function loadHealth() {
            try {
                const r = await fetch("/admin/health.json", { cache: "no-store" });
                const d = await r.json();
                const ts = d.generatedAt ? new Date(d.generatedAt).toLocaleString() : "";
                const ua = document.getElementById("healthUpdatedAt");
                if (ua) ua.innerText = ts ? ("Updated: " + ts) : "";

                const rows = [];
                const add = (name, obj) => {
                    if (!obj) return;
                    const ok = obj.ok === true;
                    rows.push({
                        name,
                        status: ok ? "OK" : "DOWN",
                        ms: obj.ms != null ? Math.round(obj.ms) : null,
                        info: ok ? (obj.status != null ? ("HTTP " + obj.status) : "") : (obj.error || "")
                    });
                };

                add("Infra: nginx /", d.nodes?.Infra?.nginx);
                add("Infra: faucet :8080", d.nodes?.Infra?.faucet);
                add("Infra: adminApi :3001", d.nodes?.Infra?.adminApi);
                add("RPC1: eth_chainId", d.nodes?.RPC1?.rpc);
                add("RPC2: eth_chainId", d.nodes?.RPC2?.rpc);
                add("Signer1: ssh", d.nodes?.Signer1?.ssh);
                add("Signer2: ssh", d.nodes?.Signer2?.ssh);
                add("Signer3: ssh", d.nodes?.Signer3?.ssh);
                add("Indexer: ssh", d.nodes?.Indexer?.ssh);

                let html = "<div class=\\\"overflow-x-auto\\\"><table class=\\\"w-full text-left text-[11px]\\\">";
                html += "<thead class=\\\"text-slate-500 uppercase tracking-widest text-[10px]\\\"><tr>";
                html += "<th class=\\\"py-2 pr-4\\\">Target</th><th class=\\\"py-2 pr-4\\\">Status</th><th class=\\\"py-2 pr-4\\\">Latency</th><th class=\\\"py-2\\\">Info</th>";
                html += "</tr></thead><tbody class=\\\"divide-y divide-slate-800/50\\\">";

                for (const row of rows) {
                    const cls = row.status === "OK" ? "text-emerald-400" : "text-rose-500";
                    const ms = row.ms == null ? "" : (row.ms + "ms");
                    html += "<tr>";
                    html += "<td class=\\\"py-2 pr-4 font-mono text-slate-300\\\">" + row.name + "</td>";
                    html += "<td class=\\\"py-2 pr-4 " + cls + " font-bold\\\">" + row.status + "</td>";
                    html += "<td class=\\\"py-2 pr-4 text-slate-400 font-mono\\\">" + ms + "</td>";
                    html += "<td class=\\\"py-2 text-slate-500 font-mono truncate\\\">" + (row.info || "") + "</td>";
                    html += "</tr>";
                }

                html += "</tbody></table></div>";

                const el = document.getElementById("healthTable");
                if (el) el.innerHTML = html;

                // Update the status dots in "DCAI Core Infrastructure" cards (they default to CHECKING).
                try {
                    const byIp = {
                        "45.76.190.151": d.nodes?.Signer1?.ssh,
                        "139.180.188.167": d.nodes?.Signer2?.ssh,
                        "45.76.145.198": d.nodes?.Signer3?.ssh,
                        "139.180.188.61": d.nodes?.RPC1?.rpc,
                        "207.148.72.238": d.nodes?.RPC2?.rpc,
                        "139.180.141.226": d.nodes?.Indexer?.ssh,
                        "139.180.140.143": d.nodes?.Infra?.nginx
                    };

                    for (const [ip, obj] of Object.entries(byIp)) {
                        const id = ip.replaceAll(".", "_");
                        const ok = obj?.ok === true;
                        const ms = obj?.ms != null ? Math.round(obj.ms) : null;
                        const ts = d.generatedAt ? new Date(d.generatedAt).toLocaleTimeString() : "";

                        const dot = document.getElementById("dot_" + id);
                        const st = document.getElementById("st_" + id);
                        const tsEl = document.getElementById("ts_" + id);
                        const msEl = document.getElementById("ms_" + id);

                        if (dot) {
                            dot.classList.remove("bg-slate-600", "bg-emerald-500", "bg-rose-500");
                            dot.classList.add(ok ? "bg-emerald-500" : "bg-rose-500");
                        }
                        if (st) {
                            st.innerText = ok ? "OK" : "DOWN";
                            st.classList.remove("text-slate-400", "text-emerald-400", "text-rose-500");
                            st.classList.add(ok ? "text-emerald-400" : "text-rose-500");
                        }
                        if (tsEl) tsEl.innerText = ts || "--";
                        if (msEl) msEl.innerText = (ms == null ? "--" : (ms + "ms"));
                    }
                } catch (e) {}
            } catch (e) {
                const el = document.getElementById("healthTable");
                if (el) el.innerText = "Health load failed: " + (e?.message || e);
            }
        }
        function copyText(text) {
            const showToast = () => {
                const toast = document.createElement('div');
                toast.className = 'fixed bottom-8 left-1/2 -translate-x-1/2 bg-yellow-500 text-black px-6 py-3 rounded-2xl text-[10px] font-bold shadow-2xl z-50 animate-bounce';
                toast.innerText = 'COPIED: ' + text;
                document.body.appendChild(toast);
                setTimeout(() => toast.remove(), 2500);
            };

            // navigator.clipboard is unavailable on some browsers / non-https contexts
            if (navigator.clipboard && navigator.clipboard.writeText) {
                navigator.clipboard.writeText(text).then(showToast).catch(() => fallbackCopy(text));
            } else {
                fallbackCopy(text);
            }

            function fallbackCopy(t) {
                try {
                    const ta = document.createElement('textarea');
                    ta.value = t;
                    ta.style.position = 'fixed';
                    ta.style.left = '-9999px';
                    ta.style.top = '-9999px';
                    document.body.appendChild(ta);
                    ta.focus();
                    ta.select();
                    document.execCommand('copy');
                    ta.remove();
                    showToast();
                } catch (e) {
                    alert('Copy failed: ' + (e?.message || e));
                }
            }
        }

        function updateLabels() {
            const rpc = parseInt(document.getElementById('rpcWeight').value);
            const storage = parseInt(document.getElementById('storageWeight').value);
            const indexer = parseInt(document.getElementById('indexerWeight').value);
            document.getElementById('rpcWeightLabel').innerText = rpc + '%';
            document.getElementById('storageWeightLabel').innerText = storage + '%';
            document.getElementById('indexerWeightLabel').innerText = indexer + '%';
            const total = rpc + storage + indexer;
            document.getElementById('totalWeight').innerText = total;
            const btn = document.getElementById('saveBtn');
            if (total !== 100) {
                document.getElementById('weightAlert').classList.remove('hidden');
                btn.disabled = true; btn.classList.add('opacity-30');
            } else {
                document.getElementById('weightAlert').classList.add('hidden');
                btn.disabled = false; btn.classList.remove('opacity-30');
            }
        }

        async function saveWeights() {
            const btn = document.getElementById('saveBtn');
            const originalText = btn.innerText;
            btn.innerText = 'COMMITING...'; btn.disabled = true;
            try {
                const response = await fetch(API_URL + '/update-weights', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        rpc: parseInt(document.getElementById('rpcWeight').value) / 100,
                        storage: parseInt(document.getElementById('storageWeight').value) / 100,
                        indexer: parseInt(document.getElementById('indexerWeight').value) / 100
                    })
                });
                if (response.ok) {
                    btn.innerText = 'SUCCESS'; btn.classList.replace('bg-yellow-500', 'bg-emerald-500');
                    setTimeout(() => location.reload(), 1500);
                }
            } catch (e) { alert(e.message); btn.innerText = originalText; btn.disabled = false; }
        }

        async function topup(amount) {
            if (!confirm('Authorize transfer of ' + amount + ' tDCAI?')) return;
            try {
                const response = await fetch(API_URL + '/topup', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ amount: amount })
                });
                const data = await response.json();
                if (data.success) { alert('Top-up Success! Tx: ' + data.hash); location.reload(); }
            } catch (e) { alert(e.message); }
        }

        function customTopup() {
            const amount = prompt('Amount (tDCAI):');
            if (amount && !isNaN(amount)) topup(parseFloat(amount));
        }
        // init
        try { loadHealth(); } catch (e) {}
        try { updateLabels(); } catch (e) {}
        try { refreshAdminData(); loadApiKeyKeys(); } catch (e) {}

    </script>

    <!-- Latest Rewards Modal -->
    <div id="latestRewardsModal" class="fixed inset-0 hidden items-center justify-center bg-black/60 p-4" style="z-index: 9999;">
      <div class="w-full max-w-5xl bg-slate-950 border border-slate-800 rounded-3xl shadow-2xl overflow-hidden max-h-[90vh] flex flex-col">
        <div class="p-5 border-b border-slate-800 flex items-center justify-between gap-4">
          <div>
            <div class="text-xs text-slate-500 font-bold uppercase tracking-widest">Latest Published Reward</div>
            <div id="latestRewardsTitle" class="text-lg font-mono text-yellow-400 font-bold">--</div>
            <div id="latestRewardsMeta" class="mt-1 text-[10px] text-slate-500 font-mono">--</div>
            <select id="latestRewardsEpochSelect" class="mt-3 bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-xs font-mono text-slate-200"></select>
          </div>
          <button onclick="closeLatestRewards()" class="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-xs font-bold">Close</button>
        </div>
        <div class="p-5 overflow-y-auto">
          <div class="text-[10px] text-slate-500 font-bold uppercase tracking-widest mb-3">Distribution + Score Breakdown</div>
          <div id="latestRewardsList" class="space-y-4"></div>
          <div class="text-[10px] text-slate-600 mt-4">Tip: click address to copy</div>
        </div>
      </div>
    </div>

    <script>
      window.__LATEST_REWARDS__ = ${JSON.stringify(latestRewards || {})};
      window.__RECENT_REWARD_EPOCHS__ = ${JSON.stringify(recentRewardEpochIds || [])};

      function weiTo18(weiStr) {
        try {
          var s = (BigInt(weiStr || '0')).toString();
          if (s.length <= 18) s = '0'.repeat(18 - s.length + 1) + s;
          var head = s.slice(0, -18);
          var tail = s.slice(-18);
          var tail6 = tail.slice(0, 6);
          return head + '.' + tail6;
        } catch (e) {
          return '--';
        }
      }

      function formatPct(v, digits) {
        if (v == null || Number.isNaN(Number(v))) return '--';
        return (Number(v) * 100).toFixed(digits == null ? 2 : digits) + '%';
      }

      function formatScore(v, digits) {
        if (v == null || Number.isNaN(Number(v))) return '--';
        return Number(v).toFixed(digits == null ? 4 : digits);
      }

      function formatMetricValue(key, value) {
        if (value == null) return '--';
        if (key === 'uptime' || key === 'error_rate') return formatPct(value, 2);
        if (key === 'p95_ms' || key === 'io_p95_ms') return Number(value).toFixed(0) + 'ms';
        if (key === 'lag_blocks') return Number(value).toFixed(0) + ' blk';
        if (key === 'regions_ok' || key === 'regions_required') return String(value);
        return formatScore(value, 4);
      }

      function renderKeyValueBadges(obj, title) {
        var entries = Object.entries(obj || {}).filter(function(pair) {
          return pair[1] != null;
        });
        if (!entries.length) return '';
        return '' +
          '<div>' +
            '<div class="text-[10px] text-slate-500 font-bold uppercase tracking-widest mb-2">' + title + '</div>' +
            '<div class="flex flex-wrap gap-2">' +
              entries.map(function(pair) {
                return '<span class="px-2 py-1 rounded-lg bg-slate-950 border border-slate-800 text-[10px] font-mono text-slate-300">' + pair[0] + ': ' + formatMetricValue(pair[0], pair[1]) + '</span>';
              }).join('') +
            '</div>' +
          '</div>';
      }

      function renderServiceBreakdown(name, svc) {
        if (!svc) return '';
        var enabled = !!svc.enabled;
        var stateClass = enabled ? 'text-emerald-400' : 'text-slate-500';
        var stateText = enabled ? 'ENABLED' : 'DISABLED';
        var note = '';
        if (name === 'RPC Route') note = 'Live probe against operator-specific RPC route.';
        if (name === 'Shared Infra Indexer') note = 'Single shared Blockscout probe on infra, not per-operator indexer attribution.';
        if (name === 'Storage Health Endpoint') note = 'Simple HTTP health endpoint check only.';
        if (name === 'Multi-route Check') note = 'Configured route-availability check, not direct proof of separate regional deployments.';
        return '' +
          '<div class="p-3 rounded-2xl bg-slate-900/70 border border-slate-800">' +
            '<div class="flex flex-col md:flex-row md:items-center md:justify-between gap-2 mb-3">' +
              '<div>' +
                '<div class="text-xs font-bold text-white uppercase tracking-widest">' + name + '</div>' +
                '<div class="text-[10px] font-mono ' + stateClass + '">' + stateText + ' · weight ' + (svc.weight == null ? '--' : svc.weight) + '</div>' +
                (note ? ('<div class="text-[10px] text-slate-500 mt-1 max-w-xl">' + note + '</div>') : '') +
              '</div>' +
              '<div class="text-left md:text-right">' +
                '<div class="text-[10px] text-slate-500 font-bold uppercase tracking-widest">Raw / Weighted</div>' +
                '<div class="text-xs font-mono text-slate-200">' + formatScore(svc.rawScore, 6) + ' / <span class="text-yellow-400">' + formatScore(svc.weightedScore, 6) + '</span></div>' +
              '</div>' +
            '</div>' +
            '<div class="grid grid-cols-1 lg:grid-cols-2 gap-3">' +
              renderKeyValueBadges(svc.metrics, 'Metrics') +
              renderKeyValueBadges(svc.factors, 'Factors') +
            '</div>' +
          '</div>';
      }

      function renderClaimsInto(listEl, claims, epochData) {
        if (!claims.length) {
          listEl.innerHTML = '<div class="text-sm text-slate-400">No archived claims for this epoch yet.</div>';
          return;
        }

        listEl.innerHTML = claims.map(function(c) {
          var op = c.operator || '--';
          var amtWei = c.amountWei || '--';
          var amtTDCAI = weiTo18(amtWei);
          var sharePct = formatPct(c.sharePct, 4);
          var totalScore = formatScore(c.totalScore, 6);
          var breakdown = c.breakdown || {};
          return '' +
            '<div class="p-4 rounded-3xl bg-slate-900/60 border border-slate-800 hover:border-yellow-500/30 transition">' +
              '<div class="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4 mb-4">' +
                '<div class="min-w-0">' +
                  '<div class="text-[10px] text-slate-500 font-bold uppercase tracking-widest">Operator</div>' +
                  '<div class="text-sm font-mono text-slate-200 break-all cursor-pointer" data-copy="' + op + '">' + op + '</div>' +
                '</div>' +
                '<div class="grid grid-cols-1 md:grid-cols-3 gap-3 lg:min-w-[420px]">' +
                  '<div class="p-3 rounded-2xl bg-slate-950 border border-slate-800">' +
                    '<div class="text-[10px] text-slate-500 font-bold uppercase tracking-widest">Amount</div>' +
                    '<div class="text-sm font-mono text-yellow-400 font-bold">' + amtTDCAI + ' tDCAI</div>' +
                    '<div class="text-[10px] font-mono text-slate-500 break-all">wei: ' + amtWei + '</div>' +
                  '</div>' +
                  '<div class="p-3 rounded-2xl bg-slate-950 border border-slate-800">' +
                    '<div class="text-[10px] text-slate-500 font-bold uppercase tracking-widest">Total Score</div>' +
                    '<div class="text-sm font-mono text-emerald-400 font-bold">' + totalScore + '</div>' +
                    '<div class="text-[10px] text-slate-500">sum share basis</div>' +
                  '</div>' +
                  '<div class="p-3 rounded-2xl bg-slate-950 border border-slate-800">' +
                    '<div class="text-[10px] text-slate-500 font-bold uppercase tracking-widest">Share</div>' +
                    '<div class="text-sm font-mono text-blue-400 font-bold">' + sharePct + '</div>' +
                    '<div class="text-[10px] text-slate-500">of epoch pool</div>' +
                  '</div>' +
                '</div>' +
              '</div>' +
              '<div class="grid grid-cols-1 xl:grid-cols-2 gap-3">' +
                renderServiceBreakdown('RPC Route', breakdown.rpc) +
                renderServiceBreakdown('Shared Infra Indexer', breakdown.indexer) +
                renderServiceBreakdown('Storage Health Endpoint', breakdown.storage) +
                renderServiceBreakdown('Multi-route Check', breakdown.multiregion) +
              '</div>' +
            '</div>';
        }).join('');

        try {
          Array.from(listEl.querySelectorAll('[data-copy]')).forEach(function(el) {
            el.addEventListener('click', function() {
              copyText(el.getAttribute('data-copy'));
            });
          });
        } catch (e) {}
      }

      async function loadEpochIntoModal(epochId) {
        var titleEl = document.getElementById('latestRewardsTitle');
        var metaEl = document.getElementById('latestRewardsMeta');
        var listEl = document.getElementById('latestRewardsList');

        // try load archived epoch json
        try {
          var res = await fetch('/rewards/epochs/' + epochId + '.json', { cache: 'no-store' });
          if (!res.ok) throw new Error('archive not found');
          var data = await res.json();
          window.__LATEST_REWARDS__ = data;
        } catch (e) {
          window.__LATEST_REWARDS__ = { epochId: epochId, totalWei: '0', claims: [] };
        }

        var data2 = window.__LATEST_REWARDS__ || {};
        var eId = data2.epochId || epochId || 'N/A';
        var totalWei = data2.totalWei || '0';
        titleEl.textContent = 'epoch ' + eId + ' · totalWei ' + totalWei;
        var epochPoolWei = data2.epochPoolWei || data2.totalWei || '0';
        var dustWei = data2.roundingDustWei || '0';
        var sumScore = data2.sumScore == null ? '--' : formatScore(data2.sumScore, 6);
        var cfgHash = data2.configHash ? String(data2.configHash).replace('sha256:', '').slice(0, 12) : '';
        metaEl.textContent = 'pool ' + weiTo18(epochPoolWei) + ' tDCAI · sumScore ' + sumScore + ' · dust ' + dustWei + ' wei' + (cfgHash ? (' · cfg ' + cfgHash) : '');

        var claims = Array.isArray(data2.claims) ? data2.claims : [];
        renderClaimsInto(listEl, claims, data2);
      }

      function openLatestRewards() {
        var modal = document.getElementById('latestRewardsModal');
        var sel = document.getElementById('latestRewardsEpochSelect');

        var recent = window.__RECENT_REWARD_EPOCHS__ || [];
        var data = window.__LATEST_REWARDS__ || {};
        var epochId = data.epochId || (recent[0] || 'N/A');

        if (sel) {
          sel.innerHTML = recent.map(function(id) {
            var selected = (id === epochId) ? ' selected' : '';
            return '<option value="' + id + '"' + selected + '>' + id + '</option>';
          }).join('');
          sel.onchange = function() {
            loadEpochIntoModal(sel.value);
          };
        }

        modal.classList.remove('hidden');
        modal.classList.add('flex');
        loadEpochIntoModal(epochId);
      }

      function closeLatestRewards() {
        var modal = document.getElementById('latestRewardsModal');
        modal.classList.add('hidden');
        modal.classList.remove('flex');
      }



      // ---------------- API KEY APPROVALS ----------------
      function initAdminTokenInput() {}

      async function adminFetch(path, opts) {
        return await fetch(API_URL + path, (opts || {}));
      }

      async function changeAdminPassword() {
        const st = document.getElementById('adminBasicStatus');
        const username = (document.getElementById('adminBasicUserInput')?.value || '').trim();
        const currentPassword = document.getElementById('adminBasicCurrentInput')?.value || '';
        const newPassword = document.getElementById('adminBasicNewInput')?.value || '';
        const confirmPassword = document.getElementById('adminBasicConfirmInput')?.value || '';

        if (!username) return (st.textContent = 'Username required.');
        if (!currentPassword) return (st.textContent = 'Current password required.');
        if (!newPassword) return (st.textContent = 'New password required.');
        if (newPassword !== confirmPassword) return (st.textContent = 'Password confirmation mismatch.');

        st.textContent = 'Updating login password…';
        try {
          const r = await fetch(API_URL + '/auth/change-password', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, currentPassword, newPassword, confirmPassword })
          });
          const d = await r.json();
          if (!r.ok || !d.ok) throw new Error(d.error || 'update failed');
          st.textContent = 'Login password updated. Use the new password on your next login.';
          try {
            document.getElementById('adminBasicCurrentInput').value = '';
            document.getElementById('adminBasicNewInput').value = '';
            document.getElementById('adminBasicConfirmInput').value = '';
          } catch (e) {}
        } catch (e) {
          st.textContent = 'Password update failed: ' + (e?.message || e);
        }
      }

      let apiKeyRequestsCache = [];
      let apiKeyKeysCache = [];

      function initApiKeyControls() {
        const reqSearch = document.getElementById('requestSearchInput');
        if (reqSearch && !reqSearch.dataset.bound) {
          reqSearch.dataset.bound = '1';
          reqSearch.addEventListener('input', function(){ renderApiKeyRequestsFromCache(); });
        }
        const reqFilter = document.getElementById('requestFilterSelect');
        if (reqFilter && !reqFilter.dataset.bound) {
          reqFilter.dataset.bound = '1';
          reqFilter.addEventListener('change', function(){ renderApiKeyRequestsFromCache(); });
        }
        const keySearch = document.getElementById('keySearchInput');
        if (keySearch && !keySearch.dataset.bound) {
          keySearch.dataset.bound = '1';
          keySearch.addEventListener('input', function(){ renderApiKeyKeys(apiKeyKeysCache); });
        }
      }

      function parseContributorNote(note) {
        const text = String(note || '');
        const lines = text.split(/\r?\n/);
        const get = (label) => {
          const row = lines.find((line) => line.startsWith(label + ':'));
          return row ? row.slice(label.length + 1).trim() : '';
        };
        return {
          isContributor: lines[0] === 'Contributor Program Application',
          role: get('Role'),
          programTier: get('Program Tier'),
          internalTier: get('Internal Tier'),
          region: get('Region'),
          endpoint: get('Endpoint'),
          freeNote: get('Note'),
        };
      }

      function renderApiKeyRequests(reqs) {
        const el = document.getElementById('apiKeyRequestsTable');
        if (!el) return;
        if (!Array.isArray(reqs) || reqs.length === 0) {
          el.innerHTML = '<div class="text-[11px] text-slate-500 font-mono">No pending requests.</div>';
          return;
        }

        let html = '<div class="overflow-x-auto"><table class="w-full text-left text-[11px]">';
        html += '<thead class="text-slate-500 uppercase tracking-widest text-[10px] bg-slate-900/50"><tr>';
        html += '<th class="py-2 pr-4">ID</th><th class="py-2 pr-4">Address</th><th class="py-2 pr-4">Tier</th><th class="py-2 pr-4">StakeWei</th><th class="py-2 pr-4">Created</th><th class="py-2">Action</th>';
        html += '</tr></thead><tbody class="divide-y divide-slate-800/50">';

        for (const r of reqs) {
          const id = r.id || '';
          const addr = r.address || '';
          const tier = r.tier || '';
          const stakeWei = r.stakeWei || '';
          const created = r.createdAt || '';
          const note = r.note || '';
          const meta = parseContributorNote(note);
          const safeTitle = note.replace(/"/g,'&quot;');

          html += '<tr class="hover:bg-slate-800/20 align-top">';
          html += '<td class="py-2 pr-4 font-mono text-slate-300">' + id + '</td>';
          html += '<td class="py-2 pr-4 font-mono text-yellow-500 cursor-pointer" data-copy="' + addr + '">' + (addr ? (addr.slice(0, 10) + '…' + addr.slice(-6)) : '') + '</td>';
          html += '<td class="py-2 pr-4 text-slate-300 font-bold">' + tier + (meta.isContributor ? '<div class="mt-1 text-[10px] text-cyan-400">contributor</div>' : '') + '</td>';
          html += '<td class="py-2 pr-4 font-mono text-slate-500">' + stakeWei + '</td>';
          html += '<td class="py-2 pr-4 text-slate-500">' + String(created).replace('T',' ').replace('Z','') + '</td>';
          html += '<td class="py-2">' +
            '<div class="flex flex-wrap gap-2">' +
              '<button class="bg-emerald-500/10 text-emerald-400 text-[10px] font-bold px-3 py-1.5 rounded-2xl border border-emerald-500/20 hover:bg-emerald-500/20" data-approve="' + id + '">APPROVE</button>' +
              '<button class="bg-rose-500/10 text-rose-400 text-[10px] font-bold px-3 py-1.5 rounded-2xl border border-rose-500/20 hover:bg-rose-500/20" data-reject="' + id + '">REJECT</button>' +
            '</div>' +
            (meta.isContributor
              ? ('<div class="mt-2 space-y-1 text-[10px] text-slate-400">' +
                  '<div><span class="text-slate-500">role</span> ' + (meta.role || '-') + ' · <span class="text-slate-500">program</span> ' + (meta.programTier || '-') + '</div>' +
                  '<div><span class="text-slate-500">region</span> ' + (meta.region || '-') + '</div>' +
                  '<div class="truncate max-w-[520px]" title="' + safeTitle + '"><span class="text-slate-500">endpoint</span> ' + (meta.endpoint || '-') + '</div>' +
                  (meta.freeNote && meta.freeNote !== '-' ? ('<div class="truncate max-w-[520px]" title="' + safeTitle + '"><span class="text-slate-500">note</span> ' + meta.freeNote + '</div>') : '') +
                '</div>')
              : (note ? ('<div class="mt-1 text-[10px] text-slate-500 truncate max-w-[520px]" title="' + safeTitle + '">' + note + '</div>') : '')) +
            '</td>';
          html += '</tr>';
        }

        html += '</tbody></table></div>';
        el.innerHTML = html;

        try {
          Array.from(el.querySelectorAll('[data-copy]')).forEach(function(x){
            x.addEventListener('click', function(){ copyText(x.getAttribute('data-copy')); });
          });
          Array.from(el.querySelectorAll('[data-approve]')).forEach(function(b){
            b.addEventListener('click', function(){ approveApiKey(b.getAttribute('data-approve')); });
          });
          Array.from(el.querySelectorAll('[data-reject]')).forEach(function(b){
            b.addEventListener('click', function(){ rejectApiKey(b.getAttribute('data-reject')); });
          });
        } catch (e) {}
      }

      function renderApiKeyRequestHistory(rows) {
        const el = document.getElementById('apiKeyRequestHistoryTable');
        if (!el) return;
        if (!Array.isArray(rows) || rows.length === 0) {
          el.innerHTML = '<div class="text-[11px] text-slate-500 font-mono">No request history.</div>';
          return;
        }
        const sorted = rows.slice().sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || ''))).slice(0, 30);
        let html = '<div class="overflow-x-auto"><table class="w-full text-left text-[11px]">';
        html += '<thead class="text-slate-500 uppercase tracking-widest text-[10px] bg-slate-900/50"><tr>';
        html += '<th class="py-2 pr-4">Address</th><th class="py-2 pr-4">Tier</th><th class="py-2 pr-4">Type</th><th class="py-2 pr-4">Status</th><th class="py-2">Created</th>';
        html += '</tr></thead><tbody class="divide-y divide-slate-800/50">';
        for (const r of sorted) {
          const meta = parseContributorNote(r.note || '');
          const addr = r.address || '';
          const status = r.status || 'pending';
          const statusCls = status === 'approved' ? 'text-emerald-400' : status === 'rejected' ? 'text-rose-400' : 'text-yellow-400';
          html += '<tr class="hover:bg-slate-800/20">';
          html += '<td class="py-2 pr-4 font-mono text-yellow-500 cursor-pointer" data-copy="' + addr + '">' + (addr ? (addr.slice(0, 10) + '…' + addr.slice(-6)) : '') + '</td>';
          html += '<td class="py-2 pr-4 text-slate-300">' + (r.tier || '') + '</td>';
          html += '<td class="py-2 pr-4 text-slate-500">' + (meta.isContributor ? 'contributor' : 'app/api') + '</td>';
          html += '<td class="py-2 pr-4 font-bold ' + statusCls + '">' + status + '</td>';
          html += '<td class="py-2 text-slate-500">' + String(r.createdAt || '').replace('T',' ').replace('Z','') + '</td>';
          html += '</tr>';
        }
        html += '</tbody></table></div>';
        el.innerHTML = html;
        try {
          Array.from(el.querySelectorAll('[data-copy]')).forEach(function(x){
            x.addEventListener('click', function(){ copyText(x.getAttribute('data-copy')); });
          });
        } catch (e) {}
      }

      function renderApiKeyRequestsFromCache() {
        initApiKeyControls();
        const q = String((document.getElementById('requestSearchInput') || {}).value || '').toLowerCase().trim();
        const mode = String((document.getElementById('requestFilterSelect') || {}).value || 'all');
        const pending = (apiKeyRequestsCache || []).filter(x => x.status === 'pending').filter(function(r){
          const meta = parseContributorNote(r.note || '');
          if (mode === 'contributor' && !meta.isContributor) return false;
          if (mode === 'app' && meta.isContributor) return false;
          if (!q) return true;
          const hay = [r.address, r.tier, r.note, meta.role, meta.region, meta.endpoint, meta.programTier].join(' ').toLowerCase();
          return hay.includes(q);
        });
        renderApiKeyRequests(pending);
        renderApiKeyRequestHistory(apiKeyRequestsCache || []);
      }

      async function loadApiKeyRequests() {
        initAdminTokenInput();
        initApiKeyControls();
        const st = document.getElementById('apiKeyReqStatus');
        if (st) st.textContent = 'Loading requests…';
        try {
          const r = await adminFetch('/apikey/requests', { method: 'GET' });
          const d = await r.json();
          if (!d.ok) throw new Error(d.error || 'failed');
          apiKeyRequestsCache = d.requests || [];
          renderApiKeyRequestsFromCache();
          const pendingCount = apiKeyRequestsCache.filter(x => x.status === 'pending').length;
          if (st) st.textContent = 'Loaded ' + pendingCount + ' pending request(s).';
        } catch (e) {
          if (st) st.textContent = 'Load failed: ' + (e?.message || e);
        }
      }

      async function approveApiKey(id) {
        if (!confirm('Approve request ' + id + '? This will generate an API key + reload nginx.')) return;
        const st = document.getElementById('apiKeyReqStatus');
        if (st) st.textContent = 'Approving…';
        try {
          const r = await adminFetch('/apikey/approve', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id: id })
          });
          const d = await r.json();
          if (!d.ok) throw new Error(d.error || 'approve failed');
          alert('Approved!\\nTier: ' + d.tier + '\\nAddress: ' + d.address + '\\nAPI Key: ' + d.key);
          if (st) st.textContent = 'Approved ' + id;
          refreshAdminData();
          loadApiKeyKeys();
        } catch (e) {
          if (st) st.textContent = 'Approve failed: ' + (e?.message || e);
          alert('Approve failed: ' + (e?.message || e));
        }
      }

      async function rejectApiKey(id) {
        const reason = prompt('Reject request ' + id + '. Optional reason:') || '';
        if (!confirm('Reject request ' + id + '?')) return;
        const st = document.getElementById('apiKeyReqStatus');
        if (st) st.textContent = 'Rejecting…';
        try {
          const r = await adminFetch('/apikey/reject', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id: id, reason: reason })
          });
          const d = await r.json();
          if (!d.ok) throw new Error(d.error || 'reject failed');
          if (st) st.textContent = 'Rejected ' + id;
          refreshAdminData();
          loadApiKeyRequests();
        } catch (e) {
          if (st) st.textContent = 'Reject failed: ' + (e?.message || e);
          alert('Reject failed: ' + (e?.message || e));
        }
      }

      async function revokeKey() {
        initAdminTokenInput();
        const input = document.getElementById('revokeKeyInput');
        const key = (input && input.value) ? input.value.trim() : '';
        if (!key) return alert('Paste key first');
        if (!confirm('Revoke this key? This will remove it from nginx and reload.')) return;
        const st = document.getElementById('apiKeyReqStatus');
        if (st) st.textContent = 'Revoking…';
        try {
          const r = await adminFetch('/apikey/revoke', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ key: key })
          });
          const d = await r.json();
          if (!d.ok) throw new Error(d.error || 'revoke failed');
          alert('Revoked.');
          if (st) st.textContent = 'Revoked key.';
          if (input) input.value = '';
          loadApiKeyKeys();
          loadStakeWatch();
        } catch (e) {
          if (st) st.textContent = 'Revoke failed: ' + (e?.message || e);
          alert('Revoke failed: ' + (e?.message || e));
        }
      }

      async function revokeKeyById(id, keyPrefix) {
        initAdminTokenInput();
        if (!id) return;
        if (!confirm('Revoke key ' + (keyPrefix || id) + '? This will remove it from nginx and reload.')) return;
        const st = document.getElementById('apiKeyReqStatus');
        if (st) st.textContent = 'Revoking…';
        try {
          const r = await adminFetch('/apikey/revoke', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id: id })
          });
          const d = await r.json();
          if (!d.ok) throw new Error(d.error || 'revoke failed');
          if (st) st.textContent = 'Revoked ' + (d.keyPrefix || keyPrefix || id) + '.';
          loadApiKeyKeys();
          loadStakeWatch();
        } catch (e) {
          if (st) st.textContent = 'Revoke failed: ' + (e?.message || e);
          alert('Revoke failed: ' + (e?.message || e));
        }
      }

      async function rotateKeyById(id, keyPrefix) {
        initAdminTokenInput();
        if (!id) return;
        if (!confirm('Rotate key ' + (keyPrefix || id) + '? Old key will be revoked and a new key will be issued.')) return;
        const st = document.getElementById('apiKeyReqStatus');
        if (st) st.textContent = 'Rotating…';
        try {
          const r = await adminFetch('/apikey/rotate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id: id })
          });
          const d = await r.json();
          if (!d.ok) throw new Error(d.error || 'rotate failed');
          alert('Rotated!\nTier: ' + d.tier + '\nAddress: ' + d.address + '\nNew API Key: ' + d.key);
          if (st) st.textContent = 'Rotated ' + (keyPrefix || id) + '.';
          loadApiKeyKeys();
          loadStakeWatch();
        } catch (e) {
          if (st) st.textContent = 'Rotate failed: ' + (e?.message || e);
          alert('Rotate failed: ' + (e?.message || e));
        }
      }

      function renderApiKeyKeys(keys) {
        const el = document.getElementById('apiKeyKeysTable');
        if (!el) return;
        const q = String((document.getElementById('keySearchInput') || {}).value || '').toLowerCase().trim();
        const rows = (Array.isArray(keys) ? keys : []).filter(function(k){
          if (!q) return true;
          const hay = [k.keyPrefix, k.address, k.tier, k.status].join(' ').toLowerCase();
          return hay.includes(q);
        });
        if (rows.length === 0) {
          el.innerHTML = '<div class="text-[11px] text-slate-500 font-mono">No keys.</div>';
          return;
        }
        let html = '<div class="overflow-x-auto"><table class="w-full text-left text-[11px]">';
        html += '<thead class="text-slate-500 uppercase tracking-widest text-[10px] bg-slate-900/50"><tr>';
        html += '<th class="py-2 pr-4">KeyPrefix</th><th class="py-2 pr-4">Address</th><th class="py-2 pr-4">Tier</th><th class="py-2 pr-4">Status</th><th class="py-2 pr-4">Created</th><th class="py-2">Action</th>';
        html += '</tr></thead><tbody class="divide-y divide-slate-800/50">';
        for (const k of rows) {
          html += '<tr class="hover:bg-slate-800/20">';
          html += '<td class="py-2 pr-4 font-mono text-slate-300">' + (k.keyPrefix || '') + '</td>';
          html += '<td class="py-2 pr-4 font-mono text-yellow-500 cursor-pointer" data-copy="' + (k.address || '') + '">' + (k.address ? (k.address.slice(0,10) + '…' + k.address.slice(-6)) : '') + '</td>';
          html += '<td class="py-2 pr-4 text-slate-300 font-bold">' + (k.tier || '') + '</td>';
          html += '<td class="py-2 pr-4 ' + (k.status === 'active' ? 'text-emerald-400' : 'text-slate-500') + ' font-bold">' + (k.status || '') + '</td>';
          html += '<td class="py-2 pr-4 text-slate-500">' + String(k.createdAt || '').replace('T',' ').replace('Z','') + '</td>';
          html += '<td class="py-2">' + (k.status === 'active'
            ? ('<div class="flex flex-wrap gap-2">' +
                '<button class="bg-cyan-500/10 text-cyan-300 text-[10px] font-bold px-3 py-1.5 rounded-2xl border border-cyan-500/20 hover:bg-cyan-500/20" data-rotate-id="' + (k.id || '') + '" data-rotate-prefix="' + (k.keyPrefix || '') + '">ROTATE</button>' +
                '<button class="bg-rose-500/10 text-rose-400 text-[10px] font-bold px-3 py-1.5 rounded-2xl border border-rose-500/20 hover:bg-rose-500/20" data-revoke-id="' + (k.id || '') + '" data-revoke-prefix="' + (k.keyPrefix || '') + '">REVOKE</button>' +
              '</div>')
            : '<span class="text-slate-600 font-mono">-</span>') + '</td>';
          html += '</tr>';
        }
        html += '</tbody></table></div>';
        el.innerHTML = html;

        try {
          Array.from(el.querySelectorAll('[data-copy]')).forEach(function(x){
            x.addEventListener('click', function(){ copyText(x.getAttribute('data-copy')); });
          });
          Array.from(el.querySelectorAll('[data-revoke-id]')).forEach(function(b){
            b.addEventListener('click', function(){ revokeKeyById(b.getAttribute('data-revoke-id'), b.getAttribute('data-revoke-prefix')); });
          });
          Array.from(el.querySelectorAll('[data-rotate-id]')).forEach(function(b){
            b.addEventListener('click', function(){ rotateKeyById(b.getAttribute('data-rotate-id'), b.getAttribute('data-rotate-prefix')); });
          });
        } catch (e) {}
      }

      async function loadApiKeyKeys() {
        initAdminTokenInput();
        initApiKeyControls();
        try {
          const r = await adminFetch('/apikey/keys', { method: 'GET' });
          const d = await r.json();
          if (!d.ok) throw new Error(d.error || 'failed');
          apiKeyKeysCache = d.keys || [];
          renderApiKeyKeys(apiKeyKeysCache);
        } catch (e) {
          const el = document.getElementById('apiKeyKeysTable');
          if (el) el.innerHTML = '<div class="text-[11px] text-rose-400 font-mono">Load keys failed: ' + (e?.message || e) + '</div>';
        }
      }

      function renderStakeWatch(rows) {
        const el = document.getElementById('stakeWatchTable');
        if (!el) return;
        if (!Array.isArray(rows) || rows.length === 0) {
          el.innerHTML = '<div class="text-[11px] text-slate-500 font-mono">No tracked stake addresses.</div>';
          return;
        }

        let html = '<div class="overflow-x-auto"><table class="w-full text-left text-[11px]">';
        html += '<thead class="text-slate-500 uppercase tracking-widest text-[10px] bg-slate-900/50"><tr>';
        html += '<th class="py-2 pr-4">Address</th><th class="py-2 pr-4">Tier</th><th class="py-2 pr-4">Stake</th><th class="py-2 pr-4">Unstake</th><th class="py-2 pr-4">Requested</th><th class="py-2 pr-4">Active Keys</th><th class="py-2">Hint</th>';
        html += '</tr></thead><tbody class="divide-y divide-slate-800/50">';

        for (const row of rows) {
          const addr = row.address || '';
          const tier = row.tier || 'none';
          const stake = row.stake || '0';
          const requestedAtSec = Number(row.requestedAtSec || 0);
          const cooldownLeftSec = Number(row.cooldownLeftSec || 0);
          const activeKeys = Array.isArray(row.activeKeys) ? row.activeKeys : [];
          const keyList = activeKeys.map(function(k){ return (k.keyPrefix || '') + (k.tier ? ('/' + k.tier) : ''); }).join(', ');

          let unstakeLabel = 'STAKED';
          let unstakeClass = 'text-emerald-400';
          if (row.unstakeStatus === 'withdrawable') {
            unstakeLabel = 'WITHDRAWABLE';
            unstakeClass = 'text-rose-400';
          } else if (row.unstakeStatus === 'cooldown') {
            unstakeLabel = 'COOLDOWN ' + Math.max(0, cooldownLeftSec) + 's';
            unstakeClass = 'text-yellow-400';
          } else if (row.unstakeStatus === 'no-stake') {
            unstakeLabel = 'NO STAKE';
            unstakeClass = 'text-slate-500';
          }

          let hint = '-';
          if ((row.unstakeStatus === 'cooldown' || row.unstakeStatus === 'withdrawable') && activeKeys.length > 0) {
            hint = 'consider revoke';
          } else if (row.unstakeStatus === 'withdrawable' && activeKeys.length === 0) {
            hint = 'can withdraw now';
          } else if (row.unstakeStatus === 'staked' && activeKeys.length > 0) {
            hint = 'key active while staked';
          }

          html += '<tr class="hover:bg-slate-800/20">';
          html += '<td class="py-2 pr-4 font-mono text-yellow-500 cursor-pointer" data-copy="' + addr + '">' + (addr ? (addr.slice(0, 10) + '…' + addr.slice(-6)) : '') + '</td>';
          html += '<td class="py-2 pr-4 text-slate-300 font-bold uppercase">' + tier + '</td>';
          html += '<td class="py-2 pr-4 font-mono text-slate-300">' + stake + ' <span class="text-slate-600">tDCAI</span></td>';
          html += '<td class="py-2 pr-4 font-mono ' + unstakeClass + ' font-bold">' + unstakeLabel + '</td>';
          html += '<td class="py-2 pr-4 text-slate-500 font-mono">' + (requestedAtSec > 0 ? requestedAtSec : '-') + '</td>';
          html += '<td class="py-2 pr-4 text-slate-300 font-mono">' + activeKeys.length + (keyList ? (' <span class="text-slate-500">(' + keyList + ')</span>') : '') + '</td>';
          html += '<td class="py-2 text-slate-500 font-mono">' + hint + '</td>';
          html += '</tr>';
        }

        html += '</tbody></table></div>';
        el.innerHTML = html;

        try {
          Array.from(el.querySelectorAll('[data-copy]')).forEach(function(x){
            x.addEventListener('click', function(){ copyText(x.getAttribute('data-copy')); });
          });
        } catch (e) {}
      }

      async function loadStakeWatch() {
        initAdminTokenInput();
        const st = document.getElementById('stakeWatchStatus');
        if (st) st.textContent = 'Loading stake watch…';
        try {
          const r = await adminFetch('/stakes', { method: 'GET' });
          const d = await r.json();
          if (!d.ok) throw new Error(d.error || 'failed');
          renderStakeWatch(d.rows || []);
          if (st) st.textContent = 'Loaded ' + ((d.rows || []).length) + ' tracked address(es).';
        } catch (e) {
          if (st) st.textContent = 'Load failed: ' + (e?.message || e);
          const el = document.getElementById('stakeWatchTable');
          if (el) el.innerHTML = '<div class="text-[11px] text-rose-400 font-mono">Load stakes failed: ' + (e?.message || e) + '</div>';
        }
      }

      function refreshAdminData() {
        loadApiKeyRequests();
        loadStakeWatch();
      }
      document.addEventListener('click', function(e) {
        var modal = document.getElementById('latestRewardsModal');
        if (!modal.classList.contains('hidden') && e.target === modal) {
          closeLatestRewards();
        }
      });
    </script>

</body>
</html>
`;
  fs.writeFileSync('/var/www/html/admin/index.html', html);
}

main().catch(console.error);
