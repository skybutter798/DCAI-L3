import { motion, AnimatePresence } from 'motion/react';
import { useState, useEffect, useRef } from 'react';
import { Search, Activity, Zap, Globe, Database, Hash, Clock, Box, ArrowRightLeft, Cpu, ChevronRight, ChevronLeft, CheckCircle2, Layers, Info, Code2, Menu, X, List } from 'lucide-react';
import { ethers } from 'ethers';

const DashboardView = () => {
  const STAKE_CONTRACT = '0x54ff6c64f1f7915a3aD54743aDd92b32412B06BC';

  const apiBase = (() => {
    try {
      return `${window.location.protocol}//${window.location.hostname}/admin/api`;
    } catch {
      return 'http://139.180.140.143/admin/api';
    }
  })();

  const publicBase = (() => {
    try {
      return `${window.location.protocol}//${window.location.hostname}`;
    } catch {
      return 'http://139.180.140.143';
    }
  })();

  const [addr, setAddr] = useState<string | null>(null);
  const [chainId, setChainId] = useState<number | null>(null);
  const [stake, setStake] = useState<{ tier: number; stakeWei: string; requestedAt: string } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [note, setNote] = useState('');
  const [tier, setTier] = useState<'basic' | 'pro' | 'ultra'>('basic');
  const [docsTab, setDocsTab] = useState<'dapp' | 'ops'>('dapp');
  const [lastReq, setLastReq] = useState<any>(null);
  const [revealedKeys, setRevealedKeys] = useState<any[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [nowSec, setNowSec] = useState(() => Math.floor(Date.now() / 1000));

  const tiers = {
    basic: { label: 'Basic', enum: 1, stake: '1000', rate: '10 r/s', burst: '40' },
    pro: { label: 'Pro', enum: 2, stake: '5000', rate: '50 r/s', burst: '200' },
    ultra: { label: 'Ultra', enum: 3, stake: '10000', rate: '200 r/s', burst: '800' },
  } as const;

  const connect = async () => {
    setErr(null);
    const eth = (window as any).ethereum;
    if (!eth) {
      setErr('No wallet detected (install MetaMask).');
      return;
    }
    try {
      setBusy('Connecting wallet…');
      const provider = new ethers.BrowserProvider(eth);
      await provider.send('eth_requestAccounts', []);
      const signer = await provider.getSigner();
      const a = await signer.getAddress();
      const net = await provider.getNetwork();
      setAddr(a);
      setChainId(Number(net.chainId));
    } catch (e: any) {
      setErr(String(e?.message || e));
    } finally {
      setBusy(null);
    }
  };

  const refreshStake = async () => {
    if (!addr) return;
    setErr(null);
    try {
      setBusy('Loading stake status…');
      const eth = (window as any).ethereum;
      const provider = new ethers.BrowserProvider(eth);
      const c = new ethers.Contract(
        STAKE_CONTRACT,
        ['function getStake(address) view returns (uint8 tier, uint256 stakeWei, uint256 requestedAt)'],
        provider
      );
      const [t, s, r] = await c.getStake(addr);
      setStake({ tier: Number(t), stakeWei: String(s), requestedAt: String(r) });
    } catch (e: any) {
      setErr(String(e?.message || e));
    } finally {
      setBusy(null);
    }
  };

  useEffect(() => {
    if (addr) refreshStake();
  }, [addr]);

  useEffect(() => {
    const t = setInterval(() => setNowSec(Math.floor(Date.now() / 1000)), 1000);
    return () => clearInterval(t);
  }, []);

  const doStake = async (tierKey: 'basic' | 'pro' | 'ultra') => {
    setErr(null);
    const eth = (window as any).ethereum;
    if (!eth) return;
    try {
      setBusy('Sending stake tx…');
      const provider = new ethers.BrowserProvider(eth);
      const signer = await provider.getSigner();
      const c = new ethers.Contract(
        STAKE_CONTRACT,
        ['function stake(uint8 tier) payable'],
        signer
      );
      const v = ethers.parseEther(tiers[tierKey].stake);
      const tx = await c.stake(tiers[tierKey].enum, { value: v });
      await tx.wait();
      await refreshStake();
    } catch (e: any) {
      setErr(String(e?.message || e));
    } finally {
      setBusy(null);
    }
  };

  const requestUnstake = async () => {
    if (!addr) return;
    setErr(null);
    const eth = (window as any).ethereum;
    if (!eth) return;
    try {
      setBusy('Requesting unstake (sign tx)…');
      const provider = new ethers.BrowserProvider(eth);
      const signer = await provider.getSigner();
      const c = new ethers.Contract(
        STAKE_CONTRACT,
        ['function requestUnstake()'],
        signer
      );
      const tx = await c.requestUnstake();
      await tx.wait();
      await refreshStake();
    } catch (e: any) {
      setErr(String(e?.message || e));
    } finally {
      setBusy(null);
    }
  };

  const withdrawStake = async () => {
    if (!addr) return;
    setErr(null);
    const eth = (window as any).ethereum;
    if (!eth) return;
    try {
      setBusy('Withdrawing stake (sign tx)…');
      const provider = new ethers.BrowserProvider(eth);
      const signer = await provider.getSigner();
      const c = new ethers.Contract(
        STAKE_CONTRACT,
        ['function withdraw()'],
        signer
      );
      const tx = await c.withdraw();
      await tx.wait();
      await refreshStake();
    } catch (e: any) {
      setErr(String(e?.message || e));
    } finally {
      setBusy(null);
    }
  };

  const requestApiKey = async () => {
    if (!addr) return;
    setErr(null);
    try {
      setBusy('Requesting API key (sign message)…');
      const eth = (window as any).ethereum;
      const provider = new ethers.BrowserProvider(eth);
      const signer = await provider.getSigner();

      const nonceRes = await fetch(`${apiBase}/auth/nonce?address=${encodeURIComponent(addr)}`);
      const nonceJson = await nonceRes.json();
      const nonce = nonceJson?.nonce;
      if (!nonce) throw new Error('Failed to get nonce');

      const message = `DCAI API Key Request\nAddress: ${addr}\nTier: ${tier}\nNonce: ${nonce}`;
      const signature = await signer.signMessage(message);

      const res = await fetch(`${apiBase}/apikey/request`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ address: addr, tier, note, signature }),
      });
      const j = await res.json();
      setLastReq(j);
      if (!j?.ok) setErr(j?.error || 'Request failed');
    } catch (e: any) {
      setErr(String(e?.message || e));
    } finally {
      setBusy(null);
    }
  };

  const revealMyKeys = async () => {
    if (!addr) return;
    setErr(null);
    try {
      setBusy('Revealing keys (sign message)…');
      const eth = (window as any).ethereum;
      const provider = new ethers.BrowserProvider(eth);
      const signer = await provider.getSigner();

      const nonceRes = await fetch(`${apiBase}/auth/nonce?address=${encodeURIComponent(addr)}`);
      const nonceJson = await nonceRes.json();
      const nonce = nonceJson?.nonce;
      if (!nonce) throw new Error('Failed to get nonce');

      const message = `DCAI API Key Reveal\nAddress: ${addr}\nNonce: ${nonce}`;
      const signature = await signer.signMessage(message);

      const res = await fetch(`${apiBase}/apikey/reveal`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ address: addr, signature }),
      });
      const j = await res.json();
      if (!j?.ok) throw new Error(j?.error || 'Reveal failed');
      setRevealedKeys(j?.keys || []);
    } catch (e: any) {
      setErr(String(e?.message || e));
    } finally {
      setBusy(null);
    }
  };

  const endpointFor = (tierKey: string, key: string) => {
    return {
      http: `${publicBase}/rpc/${tierKey}/${key}/`,
      ws: `${publicBase.replace('http', 'ws')}/ws/${tierKey}/${key}/`,
    };
  };

  const stakeTierLabel = (() => {
    const t = stake?.tier ?? 0;
    if (t === 1) return 'basic';
    if (t === 2) return 'pro';
    if (t === 3) return 'ultra';
    return 'none';
  })();

  const stakeAmount = (() => {
    try {
      if (!stake?.stakeWei) return '0';
      return ethers.formatEther(BigInt(stake.stakeWei));
    } catch {
      return stake?.stakeWei || '0';
    }
  })();

  const requestedAtSec = (() => {
    try {
      return Number(stake?.requestedAt || '0');
    } catch {
      return 0;
    }
  })();

  const cooldownEndsSec = requestedAtSec > 0 ? (requestedAtSec + 86400) : 0;
  const cooldownLeftSec = cooldownEndsSec > 0 ? (cooldownEndsSec - nowSec) : 0;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pb-20 pt-8 relative z-10"
    >
      <div className="mb-6 flex items-center gap-4">
        <div className="p-4 bg-cyan-500/10 rounded-xl border border-cyan-500/20 shadow-[0_0_20px_rgba(0,240,255,0.10)]">
          <Code2 className="w-8 h-8 text-cyan-400" />
        </div>
        <div className="min-w-0">
          <h1 className="text-3xl md:text-4xl font-black tracking-widest">API <span className="glow-text-cyan text-cyan-300">DASHBOARD</span></h1>
          <div className="mt-2 text-xs font-mono text-gold-500/60">Stake tDCAI → Apply → Admin approve → Get API key</div>
        </div>
      </div>

      <div className="glow-box bg-dark-800/60 backdrop-blur-md rounded-2xl p-6 border-t-2 border-t-cyan-500/30 mb-8">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="text-xs font-mono text-gold-500/50">WALLET</div>
            <div className="mt-1 text-sm font-mono text-cyan-200/90 break-all">{addr || '-- not connected --'}</div>
            <div className="mt-1 text-[10px] font-mono text-gold-500/40">chainId {chainId ?? '--'} · stake contract {STAKE_CONTRACT}</div>
          </div>
          <div className="flex gap-2">
            <button onClick={connect} className="px-3 py-2 rounded-lg border border-cyan-500/20 text-cyan-300 text-xs font-mono hover:border-cyan-400/60">CONNECT</button>
            <button disabled={!addr} onClick={refreshStake} className={`px-3 py-2 rounded-lg border text-xs font-mono ${addr ? 'border-gold-500/20 text-gold-500/80 hover:border-cyan-500/40 hover:text-cyan-300' : 'border-gold-500/10 text-gold-500/30 cursor-not-allowed'}`}>REFRESH</button>
          </div>
        </div>

        {err ? <div className="mt-3 text-[11px] font-mono text-rose-300">{err}</div> : null}
        {busy ? <div className="mt-3 text-[11px] font-mono text-gold-500/60">{busy}</div> : null}
      </div>

      <div className="glow-box bg-dark-800/60 backdrop-blur-md rounded-2xl p-6 border-t-2 border-t-gold-500/30 mb-8">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <div className="text-xs font-mono text-gold-500/50">CURRENT STAKE</div>
            <div className="mt-1 text-sm font-mono text-cyan-200/90">tier <span className="text-cyan-300">{stakeTierLabel}</span> · amount <span className="text-cyan-300">{stakeAmount}</span> tDCAI</div>
            <div className="mt-1 text-[10px] font-mono text-gold-500/40">unstake cooldown: 24h</div>
            {requestedAtSec > 0 ? (
              <div className="mt-2 text-[10px] font-mono text-gold-500/60">
                requestedAt {requestedAtSec} · withdraw {(cooldownLeftSec <= 0) ? <span className="text-emerald-400">available now</span> : <span className="text-yellow-400">in {Math.max(0, cooldownLeftSec)}s</span>}
              </div>
            ) : (
              <div className="mt-2 text-[10px] font-mono text-gold-500/50">No unstake requested.</div>
            )}
          </div>

          <div className="flex gap-2">
            <button
              disabled={!addr || stakeTierLabel === 'none' || requestedAtSec > 0}
              onClick={requestUnstake}
              className={`px-3 py-2 rounded-lg border text-xs font-mono ${(!addr || stakeTierLabel === 'none' || requestedAtSec > 0) ? 'border-gold-500/10 text-gold-500/30 cursor-not-allowed' : 'border-rose-500/30 text-rose-300 hover:border-rose-400/70'}`}
            >
              REQUEST UNSTAKE
            </button>
            <button
              disabled={!addr || requestedAtSec <= 0 || cooldownLeftSec > 0}
              onClick={withdrawStake}
              className={`px-3 py-2 rounded-lg border text-xs font-mono ${(!addr || requestedAtSec <= 0 || cooldownLeftSec > 0) ? 'border-gold-500/10 text-gold-500/30 cursor-not-allowed' : 'border-emerald-500/30 text-emerald-300 hover:border-emerald-400/70'}`}
            >
              WITHDRAW
            </button>
          </div>
        </div>

        <div className="mt-3 text-[10px] font-mono text-gold-500/40">
          If you withdraw, we can revoke your API key (policy: key valid while staked). For now revoke is manual from /admin.
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
        {(['basic','pro','ultra'] as const).map((k) => (
          <div key={k} className="rounded-2xl border border-gold-500/15 bg-dark-900/40 p-5">
            <div className="text-xs font-mono text-gold-500/50">{tiers[k].label.toUpperCase()}</div>
            <div className="mt-2 text-lg font-mono text-cyan-200/90">Stake {tiers[k].stake} tDCAI</div>
            <div className="mt-1 text-[10px] font-mono text-gold-500/40">limit {tiers[k].rate} · burst {tiers[k].burst}</div>
            <button
              disabled={!addr}
              onClick={() => { setTier(k); doStake(k); }}
              className={`mt-4 w-full px-3 py-2 rounded-lg border text-xs font-mono ${addr ? 'border-cyan-500/20 text-cyan-300 hover:border-cyan-400/60' : 'border-gold-500/10 text-gold-500/30 cursor-not-allowed'}`}
            >
              STAKE & SELECT
            </button>
          </div>
        ))}
      </div>

      <div className="glow-box bg-dark-800/60 backdrop-blur-md rounded-2xl p-6 border-t-2 border-t-gold-500/30 mb-8">
        <h2 className="text-lg font-bold tracking-widest flex items-center gap-2 text-gold-500">
          <CheckCircle2 className="w-5 h-5" /> APPLY
        </h2>
        <div className="mt-2 text-xs font-mono text-gold-500/60">Selected tier: <span className="text-cyan-300">{tier}</span></div>
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Tell us your intended usage (optional)…"
          className="mt-4 w-full min-h-[90px] bg-dark-900/50 border border-gold-500/15 rounded-xl p-3 text-xs font-mono text-gold-500/80 outline-none"
        />
        <div className="mt-4 flex flex-wrap gap-2">
          <button disabled={!addr} onClick={requestApiKey} className={`px-4 py-2 rounded-lg border text-xs font-mono ${addr ? 'border-cyan-500/20 text-cyan-300 hover:border-cyan-400/60' : 'border-gold-500/10 text-gold-500/30 cursor-not-allowed'}`}>SUBMIT REQUEST</button>
          <button disabled={!addr} onClick={revealMyKeys} className={`px-4 py-2 rounded-lg border text-xs font-mono ${addr ? 'border-gold-500/20 text-gold-500/80 hover:border-cyan-500/40 hover:text-cyan-300' : 'border-gold-500/10 text-gold-500/30 cursor-not-allowed'}`}>REVEAL MY KEYS</button>
        </div>

        {lastReq ? (
          <pre className="mt-4 text-[10px] font-mono text-gold-500/60 whitespace-pre-wrap break-all">{JSON.stringify(lastReq, null, 2)}</pre>
        ) : null}
      </div>

      <div className="glow-box bg-dark-800/60 backdrop-blur-md rounded-2xl p-6 border-t-2 border-t-cyan-500/30">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <h2 className="text-lg font-bold tracking-widest flex items-center gap-2 text-cyan-400">
            <Code2 className="w-5 h-5" /> ENDPOINTS
          </h2>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setDocsTab('dapp')}
              className={`px-3 py-1.5 rounded-lg border text-[10px] font-mono ${docsTab === 'dapp' ? 'border-cyan-400/60 text-cyan-200 bg-cyan-500/10' : 'border-gold-500/15 text-gold-500/60 hover:border-cyan-500/30 hover:text-cyan-300'}`}
            >
              DAPP (ethers/viem)
            </button>
            <button
              onClick={() => setDocsTab('ops')}
              className={`px-3 py-1.5 rounded-lg border text-[10px] font-mono ${docsTab === 'ops' ? 'border-cyan-400/60 text-cyan-200 bg-cyan-500/10' : 'border-gold-500/15 text-gold-500/60 hover:border-cyan-500/30 hover:text-cyan-300'}`}
            >
              OPS (curl/cast/web3.py)
            </button>
          </div>
        </div>
        <div className="mt-2 text-[10px] font-mono text-gold-500/50">chainId <span className="text-cyan-300">18441</span> · native <span className="text-cyan-300">tDCAI</span></div>

        <details className="mt-4 rounded-xl border border-gold-500/10 bg-dark-950/30 p-4">
          <summary className="cursor-pointer select-none text-[10px] font-mono text-gold-500/60 hover:text-cyan-300">
            Supported Ethereum JSON-RPC methods
          </summary>
          <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-4 text-[11px] font-mono">
            <div className="rounded-xl border border-gold-500/10 bg-dark-900/30 p-3">
              <div className="text-gold-500/50">web3_*</div>
              <div className="mt-2 text-gold-500/70 space-y-1">
                <div>web3_clientVersion</div>
                <div>web3_sha3</div>
              </div>
            </div>

            <div className="rounded-xl border border-gold-500/10 bg-dark-900/30 p-3">
              <div className="text-gold-500/50">net_*</div>
              <div className="mt-2 text-gold-500/70 space-y-1">
                <div>net_version</div>
                <div>net_listening</div>
                <div>net_peerCount</div>
              </div>
            </div>

            <div className="rounded-xl border border-gold-500/10 bg-dark-900/30 p-3">
              <div className="text-gold-500/50">eth_* (node status / basics)</div>
              <div className="mt-2 text-gold-500/70 space-y-1">
                <div>eth_protocolVersion</div>
                <div>eth_syncing</div>
                <div>eth_coinbase</div>
                <div>eth_mining</div>
                <div>eth_hashrate</div>
                <div>eth_gasPrice</div>
                <div>eth_feeHistory</div>
                <div>eth_maxPriorityFeePerGas</div>
                <div>eth_accounts</div>
                <div>eth_chainId</div>
                <div>eth_blockNumber</div>
              </div>
            </div>

            <div className="rounded-xl border border-gold-500/10 bg-dark-900/30 p-3">
              <div className="text-gold-500/50">eth_* (state / account / contract)</div>
              <div className="mt-2 text-gold-500/70 space-y-1">
                <div>eth_getBalance</div>
                <div>eth_getStorageAt</div>
                <div>eth_getTransactionCount</div>
                <div>eth_getCode</div>
                <div>eth_call</div>
                <div>eth_estimateGas</div>
                <div>eth_createAccessList</div>
                <div>eth_getProof</div>
              </div>
            </div>

            <div className="rounded-xl border border-gold-500/10 bg-dark-900/30 p-3">
              <div className="text-gold-500/50">eth_* (blocks / tx lookup)</div>
              <div className="mt-2 text-gold-500/70 space-y-1">
                <div>eth_getBlockByHash</div>
                <div>eth_getBlockByNumber</div>
                <div>eth_getTransactionByHash</div>
                <div>eth_getTransactionReceipt</div>
                <div>eth_getTransactionByBlockHashAndIndex</div>
                <div>eth_getTransactionByBlockNumberAndIndex</div>
                <div>eth_getBlockTransactionCountByHash</div>
                <div>eth_getBlockTransactionCountByNumber</div>
                <div>eth_getUncleCountByBlockHash</div>
                <div>eth_getUncleCountByBlockNumber</div>
                <div>eth_getUncleByBlockHashAndIndex</div>
                <div>eth_getUncleByBlockNumberAndIndex</div>
              </div>
            </div>

            <div className="rounded-xl border border-gold-500/10 bg-dark-900/30 p-3">
              <div className="text-gold-500/50">eth_* (logs / filters)</div>
              <div className="mt-2 text-gold-500/70 space-y-1">
                <div>eth_newFilter</div>
                <div>eth_newBlockFilter</div>
                <div>eth_newPendingTransactionFilter</div>
                <div>eth_uninstallFilter</div>
                <div>eth_getFilterChanges</div>
                <div>eth_getFilterLogs</div>
                <div>eth_getLogs</div>
              </div>
            </div>

            <div className="rounded-xl border border-gold-500/10 bg-dark-900/30 p-3">
              <div className="text-gold-500/50">eth_* (send / sign / mining work)</div>
              <div className="mt-2 text-gold-500/70 space-y-1">
                <div>eth_sign</div>
                <div>eth_signTransaction</div>
                <div>eth_sendTransaction</div>
                <div>eth_sendRawTransaction</div>
                <div>eth_getWork</div>
                <div>eth_submitWork</div>
                <div>eth_submitHashrate</div>
              </div>
            </div>

            <div className="rounded-xl border border-gold-500/10 bg-dark-900/30 p-3 md:col-span-2">
              <div className="text-gold-500/50">WS only (PubSub)</div>
              <div className="mt-2 text-gold-500/70 space-y-1">
                <div>eth_subscribe (newHeads / logs / newPendingTransactions)</div>
                <div>eth_unsubscribe</div>
              </div>
              <div className="mt-3 text-[10px] text-gold-500/40">
                Not public by default: <span className="text-gold-500/50">debug_*, admin_*, personal_*, txpool_*, trace_*</span>
              </div>
            </div>
          </div>
        </details>

        {revealedKeys && revealedKeys.length ? (
          <div className="mt-4 space-y-3">
            {revealedKeys.map((k, i) => {
              const e = endpointFor(String(k.tier), String(k.key));
              return (
                <div key={i} className="rounded-xl border border-cyan-500/15 bg-dark-900/40 p-4">
                  <div className="text-xs font-mono text-gold-500/60">tier <span className="text-cyan-300">{k.tier}</span></div>
                  <div className="mt-1 text-[11px] font-mono text-gold-500/70 break-all">key {k.key}</div>
                  <div className="mt-2 text-[10px] font-mono text-gold-500/50">
                    usage today <span className="text-cyan-200/90">{k?.usage?.today ?? '--'}</span> · last 5m <span className="text-cyan-200/90">{k?.usage?.last5m ?? '--'}</span> · last 60m <span className="text-cyan-200/90">{k?.usage?.last60m ?? '--'}</span>
                    <div className="mt-1 text-gold-500/50">
                      status (60m)
                      {' '}2xx <span className="text-cyan-200/90">{k?.usage?.statusLast60m?.['2xx'] ?? 0}</span>
                      {' '}· 4xx <span className="text-cyan-200/90">{k?.usage?.statusLast60m?.['4xx'] ?? 0}</span>
                      {' '}· 5xx <span className="text-cyan-200/90">{k?.usage?.statusLast60m?.['5xx'] ?? 0}</span>
                      {' '}· 401 <span className="text-cyan-200/90">{k?.usage?.statusLast60m?.['401'] ?? 0}</span>
                      {' '}· 429 <span className="text-cyan-200/90">{k?.usage?.statusLast60m?.['429'] ?? 0}</span>
                    </div>
                    <div className="mt-1 text-gold-500/50">
                      latency (60m)
                      {' '}p50 <span className="text-cyan-200/90">{k?.usage?.latencyLast60m?.p50Ms ?? '--'}</span>ms
                      {' '}· p95 <span className="text-cyan-200/90">{k?.usage?.latencyLast60m?.p95Ms ?? '--'}</span>ms
                    </div>
                    <div className="mt-1 text-gold-500/50">
                      top methods (60m)
                      {Array.isArray(k?.usage?.topMethodsLast60m) && k.usage.topMethodsLast60m.length ? (
                        <span className="text-cyan-200/90">{' '}{k.usage.topMethodsLast60m.slice(0, 6).map((m: any) => `${m.method}:${m.count}`).join(' · ')}</span>
                      ) : (
                        <span className="text-cyan-200/90"> --</span>
                      )}
                    </div>
                  </div>
                  <div className="mt-3 text-[11px] font-mono text-gold-500/60">HTTP</div>
                  <div className="text-[11px] font-mono text-cyan-200/90 break-all">{e.http}</div>
                  <div className="mt-2 text-[11px] font-mono text-gold-500/60">WS</div>
                  <div className="text-[11px] font-mono text-cyan-200/90 break-all">{e.ws}</div>

                  <div className="mt-4 rounded-xl border border-gold-500/10 bg-dark-950/30 p-3">
                    <div className="text-[10px] font-mono text-gold-500/50">Quickstart ({docsTab})</div>
                    <pre className="mt-2 text-[10px] font-mono text-gold-500/70 whitespace-pre-wrap break-all">
{docsTab === 'dapp'
? `// ethers v6\nimport { ethers } from \"ethers\";\n\nconst provider = new ethers.JsonRpcProvider(\"${e.http}\", 18441);\nconsole.log(await provider.getBlockNumber());\n\n// viem\nimport { createPublicClient, http } from \"viem\";\n\nconst client = createPublicClient({\n  chain: { id: 18441, name: \"DCAI L3\", nativeCurrency: { name: \"tDCAI\", symbol: \"tDCAI\", decimals: 18 }, rpcUrls: { default: { http: [\"${e.http}\"] } } },\n  transport: http(\"${e.http}\"),\n});\nconsole.log(await client.getBlockNumber());`
: `# curl (eth_chainId)\ncurl -s \"${e.http}\" \\\n  -H 'content-type: application/json' \\\n  --data '{\"jsonrpc\":\"2.0\",\"id\":1,\"method\":\"eth_chainId\",\"params\":[]}'\n\n# Foundry cast\ncast chain-id --rpc-url \"${e.http}\"\ncast block-number --rpc-url \"${e.http}\"\n\n# web3.py\nfrom web3 import Web3\nw3 = Web3(Web3.HTTPProvider(\"${e.http}\"))\nprint(w3.eth.chain_id)\nprint(w3.eth.block_number)`}
                    </pre>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="mt-4 text-xs font-mono text-gold-500/60">No active keys revealed yet.</div>
        )}
      </div>
    </motion.div>
  );
};

export default DashboardView;
