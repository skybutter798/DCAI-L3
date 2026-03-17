import { motion, AnimatePresence } from 'motion/react';
import { useState, useEffect, useRef } from 'react';
import { Search, Activity, Zap, Globe, Database, Hash, Clock, Box, ArrowRightLeft, Cpu, ChevronRight, ChevronLeft, CheckCircle2, Layers, Info, Code2, Menu, X, List } from 'lucide-react';

import { navigateTo, copyToClipboard } from './lib/appUtils';
import CursorFollower from './components/CursorFollower';
import Header from './components/Header';
import Hero from './components/Hero';
import Stats from './components/Stats';
import BlocksListView from './views/BlocksListView';
import TxsListView from './views/TxsListView';
import BlockView from './views/BlockView';
import TxView from './views/TxView';
import AddressView from './views/AddressView';
import TokensView from './views/TokensView';
import TokenView from './views/TokenView';
import DashboardView from './views/DashboardView';

export default function App() {
  const [currentView, setCurrentView] = useState<'home' | 'blocks' | 'txs' | 'block' | 'tx' | 'address' | 'tokens' | 'token' | 'dashboard'>('home');
  const [selectedBlock, setSelectedBlock] = useState<any>(null);
  const [selectedTxHash, setSelectedTxHash] = useState<string | null>(null);
  const [selectedAddress, setSelectedAddress] = useState<string | null>(null);
  const [selectedTokenAddress, setSelectedTokenAddress] = useState<string | null>(null);

  // Basic client-side routing for direct URL opens (/tx/<hash>, /block/<height>)
  useEffect(() => {
    const applyRouteFromPath = () => {
      try {
        const path = window.location.pathname || '/';

        if (path === '/blocks' || path === '/blocks/') {
          setCurrentView('blocks');
          return;
        }

        if (path === '/txs' || path === '/txs/') {
          setCurrentView('txs');
          return;
        }

        if (path === '/tokens' || path === '/tokens/') {
          setCurrentView('tokens');
          return;
        }

        if (path === '/dashboard' || path === '/dashboard/') {
          setCurrentView('dashboard');
          return;
        }

        const txm = path.match(/^\/tx\/(0x[0-9a-fA-F]{64})/);
        if (txm) {
          setSelectedTxHash(txm[1]);
          setCurrentView('tx');
          return;
        }

        const bm = path.match(/^\/block\/(\d+)/);
        if (bm) {
          const h = parseInt(bm[1], 10);
          if (Number.isFinite(h)) {
            setSelectedBlock({ height: h });
            setCurrentView('block');
            return;
          }
        }

        const tokm = path.match(/^\/token\/(0x[0-9a-fA-F]{40})/);
        if (tokm) {
          setSelectedTokenAddress(tokm[1]);
          setCurrentView('token');
          return;
        }

        const am = path.match(/^\/address\/(0x[0-9a-fA-F]{40})/);
        if (am) {
          setSelectedAddress(am[1]);
          setCurrentView('address');
          return;
        }
      } catch {}
      // default
      setCurrentView('home');
    };

    applyRouteFromPath();
    window.addEventListener('popstate', applyRouteFromPath);
    return () => window.removeEventListener('popstate', applyRouteFromPath);
  }, []);
  
  const [blocks, setBlocks] = useState<any[]>([]);
  const [txs, setTxs] = useState<any[]>([]);
  const [expandedTx, setExpandedTx] = useState<string | null>(null);
  const [copyToast, setCopyToast] = useState<string | null>(null);
  const blockHeightRef = useRef(29402934);

  // INCOMING block timing helpers
  const [avgBlockMs, setAvgBlockMs] = useState<number>(2000);
  const latestHeightRef = useRef<number | null>(null);
  const lastNewBlockAtRef = useRef<number>(Date.now());

  // Cache clique recents mapping so the validator label doesn't flicker to "--" on transient RPC errors.
  const cliqueRecentsRef = useRef<Record<string, string>>({});
  // Cache resolved signer per height (Clique recents only covers a tiny window).
  const signerByHeightRef = useRef<Record<number, string>>({});
  const signerInflightRef = useRef<Set<number>>(new Set());


  const timeAgo = (iso?: string) => {
    try {
      if (!iso) return '';
      const ms = Date.now() - new Date(iso).getTime();
      const m = Math.floor(ms / 60000);
      if (m < 1) return 'just now';
      if (m < 60) return String(m) + 'm ago';
      const h = Math.floor(m / 60);
      if (h < 24) return String(h) + 'h ago';
      const d = Math.floor(h / 24);
      return String(d) + 'd ago';
    } catch {
      return '';
    }
  };

  // (Removed 100ms countdown state updates; it caused constant re-renders and could make the desktop header feel unclickable.)

  useEffect(() => {
    let cancelled = false;

    const formatTDCAI = (weiLike: any, dp = 6) => {
      try {
        const wei = BigInt(String(weiLike ?? '0'));
        const s = wei.toString();
        const pad = s.length <= 18 ? '0'.repeat(18 - s.length + 1) + s : s;
        const head = pad.slice(0, -18);
        const tail = pad.slice(-18);
        return `${head}.${tail.slice(0, dp)}`;
      } catch {
        return '--';
      }
    };

    const fetchBlocks = async () => {
      try {
        const res = await fetch('/api/v2/blocks?type=block&limit=15', { cache: 'no-store' });
        if (res.status === 429) return;
        const data = await res.json();
        const apiItems = (data?.items || []).slice(0, 15);

        // Clique snapshot for real signer per block (cached to avoid flicker on transient RPC issues)
        let recents: Record<string, string> = cliqueRecentsRef.current || {};
        try {
          const snapRes = await fetch('/rpc1/', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'clique_getSnapshot', params: ['latest'] }),
          });
          const snap = await snapRes.json();
          const next = snap?.result?.recents;
          if (next && typeof next === 'object' && Object.keys(next).length) {
            cliqueRecentsRef.current = next as Record<string, string>;
            recents = next as Record<string, string>;
          }
        } catch {}

        const short = (addr: string) => (addr ? (addr.slice(0, 6) + '…' + addr.slice(-4)) : '--');

        const fmt = (weiLike: any, dp = 2) => {
          try {
            const wei = BigInt(String(weiLike ?? '0'));
            const s = wei.toString();
            const head = s.length > 18 ? s.slice(0, -18) : '0';
            const tail = s.length > 18 ? s.slice(-18) : s.padStart(18, '0');
            return head + '.' + tail.slice(0, dp);
          } catch {
            return '--';
          }
        };

        const items = apiItems.map((b: any) => {
          const height = Number(b.height);
          const signer = (signerByHeightRef.current[height] || recents[String(height)] || '').toLowerCase();
          const rewardWei = b.transaction_fees ?? '0';
          return {
            height,
            hash: b.hash,
            miner: signer ? short(signer) : '--',
            validator: signer || '',
            txCount: Number(b.transaction_count ?? 0),
            timestamp: b.timestamp,
            time: b.timestamp ? new Date(b.timestamp).toLocaleTimeString('en-US', { hour12: false }) : '--',
            reward: fmt(rewardWei, 2),
            rewardWei: String(rewardWei ?? '0'),
            gasUsed: b.gas_used,
            gasLimit: b.gas_limit,
            baseFeePerGas: b.base_fee_per_gas,
          };
        });

        if (!cancelled) {
          // Estimate avg block time from the newest two blocks when possible
          try {
            if (items.length >= 2 && items[0]?.timestamp && items[1]?.timestamp) {
              const t0 = new Date(items[0].timestamp).getTime();
              const t1 = new Date(items[1].timestamp).getTime();
              const dt = Math.abs(t0 - t1);
              if (Number.isFinite(dt) && dt > 500 && dt < 20000) setAvgBlockMs(dt);
            }
          } catch {}

          // If a new block arrived, reset the incoming countdown
          const newest = items[0];
          if (newest && typeof newest.height === 'number') {
            if (latestHeightRef.current == null) {
              latestHeightRef.current = newest.height;
              lastNewBlockAtRef.current = Date.now();
            } else if (newest.height > latestHeightRef.current) {
              latestHeightRef.current = newest.height;
              lastNewBlockAtRef.current = Date.now();
            }
          }

          setBlocks(items);

          // Resolve signer for blocks outside Clique "recents" window (do it once per height, cached)
          const missingHeights = Array.from(
            new Set(
              items
                .map((x: any) => Number(x.height))
                .filter(
                  (h: number) =>
                    Number.isFinite(h) &&
                    !signerByHeightRef.current[h] &&
                    !(recents[String(h)] || '').toLowerCase()
                )
            )
          ).slice(0, 10) as number[];

          const toFetch = missingHeights.filter((h) => !signerInflightRef.current.has(h));
          toFetch.forEach((h) => signerInflightRef.current.add(h));

          if (toFetch.length) {
            (async () => {
              const updates: Record<number, string> = {};

              for (const h of toFetch) {
                try {
                  const hex = '0x' + h.toString(16);
                  const snapRes = await fetch('/rpc1/', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'clique_getSnapshot', params: [hex] }),
                  });
                  const snap = await snapRes.json();
                  const signer = String(snap?.result?.recents?.[String(h)] || '').toLowerCase();
                  if (signer) updates[h] = signer;
                } catch {
                  // ignore
                } finally {
                  signerInflightRef.current.delete(h);
                }
              }

              const ks = Object.keys(updates);
              if (!ks.length) return;

              for (const k of ks) signerByHeightRef.current[Number(k)] = updates[Number(k)];

              if (!cancelled) {
                const short = (addr: string) => (addr ? addr.slice(0, 6) + '…' + addr.slice(-4) : '--');
                setBlocks((prev) =>
                  (prev || []).map((b: any) => {
                    const s = updates[Number(b.height)];
                    if (!s) return b;
                    return { ...b, validator: s, miner: short(s) };
                  })
                );
              }
            })();
          }
        }
      } catch {}
    };

    const fetchTxs = async () => {
      try {
        const res = await fetch('/api/v2/transactions?limit=15', { cache: 'no-store' });
        if (res.status === 429) return;
        const data = await res.json();
        const items = (data?.items || []).slice(0, 15).map((tx: any) => ({
          hash: tx.hash,
          result: tx.result || tx.status || '--',
          method: tx.method || (tx.transaction_types?.[0] || 'txn'),
          type: tx.type,
          nonce: tx.nonce,
          position: tx.position,
          from: tx.from?.hash || tx.from || '--',
          to: tx.to?.hash || tx.to || '--',
          valueWei: String(tx.value ?? '0'),
          value: formatTDCAI(tx.value),
          feeWei: String(tx.fee?.value ?? tx.fee ?? '0'),
          fee: formatTDCAI(tx.fee?.value ?? tx.fee ?? '0'),
          gasLimit: String(tx.gas_limit ?? '--'),
          gasUsed: String(tx.gas_used ?? '--'),
          baseFeePerGas: String(tx.base_fee_per_gas ?? '--'),
          gasPrice: String(tx.gas_price ?? '--'),
          timestamp: tx.timestamp,
          time: tx.timestamp ? new Date(tx.timestamp).toLocaleTimeString('en-US', { hour12: false }) : '--',
        }));
        if (!cancelled) setTxs(items);
      } catch {}
    };

    // Faster new-block detection: poll eth_blockNumber and refresh blocks immediately on change
    let lastBn: number | null = null;
    const pollBlockNumber = async () => {
      try {
        const r = await fetch('/rpc1/', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'eth_blockNumber', params: [] }),
          cache: 'no-store',
        });
        const j = await r.json();
        const hex = j?.result;
        if (typeof hex === 'string' && hex.startsWith('0x')) {
          const bn = parseInt(hex, 16);
          if (Number.isFinite(bn)) {
            if (lastBn == null) lastBn = bn;
            if (bn > (lastBn ?? 0)) {
              lastBn = bn;
              fetchBlocks();
            }
          }
        }
      } catch {}
    };

    pollBlockNumber();
    const bnInt = setInterval(pollBlockNumber, 1000);

    fetchBlocks();
    fetchTxs();

    // Fallback refresh (new blocks are mainly detected via eth_blockNumber polling above)
    const bInt = setInterval(fetchBlocks, 8000);
    const tInt = setInterval(fetchTxs, 3000);

    return () => {
      cancelled = true;
      clearInterval(bInt);
      clearInterval(tInt);
      clearInterval(bnInt);
    };
  }, []);

  const handleViewBlock = (block: any) => {
    setSelectedBlock(block);
    setCurrentView('block');
    try {
      if (block?.height != null) window.history.pushState({ view: 'block', height: block.height }, '', `/block/${block.height}`);
    } catch {}
  };

  const handleViewTx = (hash: string) => {
    setSelectedTxHash(hash);
    setCurrentView('tx');
    try {
      window.history.pushState({ view: 'tx', hash }, '', `/tx/${hash}`);
    } catch {}
  };

  const handleViewAddress = (addr: string) => {
    setSelectedAddress(addr);
    setCurrentView('address');
    try {
      window.history.pushState({ view: 'address', address: addr }, '', `/address/${addr}`);
    } catch {}
  };

  const handleViewToken = (addr: string) => {
    setSelectedTokenAddress(addr);
    setCurrentView('token');
    try {
      window.history.pushState({ view: 'token', address: addr }, '', `/token/${addr}`);
    } catch {}
  };

  return (
    <div className="min-h-screen bg-dark-900 text-gold-500 font-sans selection:bg-cyan-500 selection:text-dark-900 relative overflow-x-hidden">
      <AnimatePresence>
        {copyToast ? (
          <motion.div
            key="copytoast"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 10 }}
            transition={{ duration: 0.18 }}
            className="fixed bottom-6 right-6 z-50 px-4 py-2 rounded-lg bg-dark-900/80 border border-cyan-500/30 backdrop-blur-md text-xs font-mono text-cyan-300 shadow-[0_0_20px_rgba(0,240,255,0.15)]"
          >
            {copyToast}
          </motion.div>
        ) : null}
      </AnimatePresence>
      <div className="hex-bg" />
      <CursorFollower />
      <div className="scanline" />
      <div className="perspective-grid" />
      
      <Header
        active={currentView}
        onHome={() => { setCurrentView('home'); try { window.history.pushState({ view: 'home' }, '', '/'); } catch {} }}
        onBlocks={() => { setCurrentView('blocks'); try { window.history.pushState({ view: 'blocks' }, '', '/blocks'); } catch {} }}
        onTxs={() => { setCurrentView('txs'); try { window.history.pushState({ view: 'txs' }, '', '/txs'); } catch {} }}
        onTokens={() => { setCurrentView('tokens'); try { window.history.pushState({ view: 'tokens' }, '', '/tokens'); } catch {} }}
        onDashboard={() => { setCurrentView('dashboard'); try { window.history.pushState({ view: 'dashboard' }, '', '/dashboard'); } catch {} }}
      />
      
      <AnimatePresence mode="wait">
        {currentView === 'home' ? (
          <motion.main 
            key="home"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0, y: -20 }}
            className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pb-20"
          >
            <Hero />
            <Stats />
            
            <div className="mb-12 relative z-10">
              <h2 className="text-xl font-bold tracking-widest flex items-center gap-2 mb-6 px-4">
                <Box className="w-5 h-5 text-cyan-400" />
                LATEST BLOCKS
              </h2>
              
              <div className="flex overflow-x-auto gap-8 pb-12 pt-4 px-4 snap-x hide-scrollbar relative items-center">
                {/* Animated Chain Background */}
                <div className="absolute top-1/2 left-0 w-full h-1 bg-dark-800 -translate-y-1/2 z-0 overflow-hidden rounded-full">
                  <motion.div 
                    className="h-full w-1/3 bg-gradient-to-r from-transparent via-cyan-400 to-transparent"
                    animate={{ x: ['-100%', '300%'] }}
                    transition={{ duration: 2.5, repeat: Infinity, ease: "linear" }}
                  />
                </div>
                
                <AnimatePresence mode="popLayout">
                  {/* Incoming block placeholder (left-most) */}
                  <motion.div
                    key="incoming"
                    layout
                    initial={{ opacity: 0, x: -20, scale: 0.95 }}
                    animate={{ opacity: 1, x: 0, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.95 }}
                    transition={{ type: 'spring', stiffness: 140, damping: 24, mass: 0.9 }}
                    className="shrink-0 w-44 sm:w-52 snap-center relative z-10"
                  >
                    <div className="relative glow-box bg-dark-800/50 backdrop-blur-xl p-3 rounded-xl border border-gold-500/25 overflow-hidden">
                      <motion.div
                        className="absolute inset-0"
                        animate={{ opacity: [0.06, 0.14, 0.06] }}
                        transition={{ duration: 1.2, repeat: Infinity, ease: 'easeInOut' }}
                        style={{ background: 'radial-gradient(circle at 30% 30%, rgba(255,215,0,0.14), transparent 60%)' }}
                      />
                      <div className="relative z-10">
                        <div className="text-[10px] text-gold-500/70 font-mono tracking-widest">INCOMING</div>
                        <div className="mt-2 flex items-center gap-2">
                          <motion.div
                            className="w-2.5 h-2.5 rounded-full bg-cyan-400 shadow-[0_0_10px_rgba(0,240,255,0.8)]"
                            animate={{ opacity: [0.2, 1, 0.2], scale: [0.9, 1.05, 0.9] }}
                            transition={{ duration: 0.9, repeat: Infinity, ease: 'easeInOut' }}
                          />
                          <div className="text-xs font-mono text-gold-500/60">scanning…</div>
                        </div>
                      </div>
                    </div>
                  </motion.div>
                  {blocks.map((block, i) => (
                    <motion.div
                      key={block.height}
                      layout
                      initial={{ opacity: 0, x: -40, scale: 0.95 }}
                      animate={{ opacity: 1, x: 0, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.5 }}
                      transition={{ type: "spring", stiffness: 120, damping: 26, mass: 0.9 }}
                      className="shrink-0 w-80 snap-center relative z-10"
                    >
                      {/* Left Node Connector */}
                      <div className="absolute top-1/2 -left-4 w-4 h-4 bg-dark-900 border-2 border-cyan-500 rounded-full -translate-y-1/2 z-20 shadow-[0_0_10px_#00F0FF]">
                        <div className="absolute inset-1 bg-cyan-400 rounded-full animate-pulse" />
                      </div>
                      {/* Right Node Connector */}
                      <div className="absolute top-1/2 -right-4 w-4 h-4 bg-dark-900 border-2 border-cyan-500 rounded-full -translate-y-1/2 z-20 shadow-[0_0_10px_#00F0FF]">
                         <div className="absolute inset-1 bg-cyan-400 rounded-full animate-pulse" />
                      </div>

                      <div className="relative glow-box bg-dark-800/90 backdrop-blur-xl p-6 rounded-2xl border-t-4 border-t-cyan-500 overflow-hidden group hover:border-cyan-400 transition-colors">
                        <div className="absolute -right-10 -top-10 text-cyan-500/5 group-hover:text-cyan-500/10 transition-colors duration-500">
                          <Box className="w-40 h-40" />
                        </div>
                        
                        <div className="relative z-10">
                          <div className="flex justify-between items-start mb-4">
                            <div>
                              <div className="text-xs text-cyan-500/60 font-mono mb-1">BLOCK HEIGHT</div>
                              <div className="text-2xl font-bold font-mono text-cyan-400 glow-text-cyan">#{block.height}</div>
                            </div>
                            <div className="flex items-center gap-1 text-xs text-cyan-400/80 font-mono bg-cyan-500/10 px-2 py-1 rounded border border-cyan-500/20">
                              <Clock className="w-3 h-3" /> {block.time}
                            </div>
                          </div>

                          <div className="space-y-3">
                            <div>
                              <div className="text-[10px] text-gold-500/40 font-mono mb-1">BLOCK HASH</div>
                              <div className="text-sm font-mono text-gold-500/80 truncate">{block.hash}</div>
                            </div>
                            
                            <div className="flex justify-between items-end">
                              <div>
                                <div className="text-[10px] text-gold-500/40 font-mono mb-1">VALIDATOR (SIGNER)</div>
                                <button
                                  onClick={() => block.validator && navigateTo(`/address/${block.validator}`)}
                                  className="text-left text-xs font-mono text-gold-400 hover:text-cyan-300 underline decoration-gold-500/20 hover:decoration-cyan-400/60"
                                >
                                  {block.miner}
                                </button>
                                <button
                                  onClick={() => block.validator && navigateTo(`/address/${block.validator}`)}
                                  className="text-left text-[10px] font-mono text-gold-500/40 hover:text-cyan-300 truncate max-w-[170px] underline decoration-gold-500/10 hover:decoration-cyan-400/60"
                                >
                                  {block.validator ?? ""}
                                </button>
                              </div>
                              <div className="text-right">
                                <div className="text-[10px] text-gold-500/40 font-mono mb-1">REWARD / FEES</div>
                                <div className="text-sm font-mono font-bold text-cyan-400">{block.reward} tDCAI</div>
                                <div className="text-[10px] font-mono text-gold-500/40">{block.rewardWei} wei · baseFee {block.baseFeePerGas ?? "--"} wei</div>
                              </div>
                            </div>
                          </div>

                          <div className="mt-4 pt-4 border-t border-cyan-500/20 flex justify-between items-center">
                            <div className="text-xs font-mono text-gold-500/60">{block.txCount} Transactions</div>
                            <div className="text-[10px] font-mono text-gold-500/40">gas {block.gasUsed ?? "--"} / {block.gasLimit ?? "--"}</div>
                            <button 
                              onClick={() => handleViewBlock(block)}
                              className="text-xs font-mono text-cyan-400 hover:text-cyan-300 flex items-center gap-1 group-hover:translate-x-1 transition-transform cursor-pointer"
                            >
                              VIEW <ChevronRight className="w-3 h-3" />
                            </button>
                          </div>
                        </div>
                      </div>
                    </motion.div>
                  ))}
                </AnimatePresence>
              </div>
            </div>

            <div className="relative z-10">
              <div className="glow-box bg-dark-800/50 backdrop-blur-md rounded-2xl p-6 border-t-2 border-t-gold-500/30">
                <div className="flex items-center justify-between mb-6">
                  <h2 className="text-xl font-bold tracking-widest flex items-center gap-2">
                    <ArrowRightLeft className="w-5 h-5 text-gold-500" />
                    LIVE TRANSACTIONS
                  </h2>
                  <div className="flex items-center gap-2">
                    <span className="relative flex h-3 w-3">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-cyan-400 opacity-75"></span>
                      <span className="relative inline-flex rounded-full h-3 w-3 bg-cyan-500"></span>
                    </span>
                    <span className="text-xs font-mono text-cyan-400/80">STREAMING</span>
                  </div>
                </div>

                <div className="space-y-3">
                  <AnimatePresence initial={false}>
                    {txs.map(tx => (
                      <motion.div
                        key={tx.hash}
                        layout
                        initial={{ opacity: 0, y: -20, backgroundColor: 'rgba(0, 240, 255, 0.1)' }}
                        animate={{ opacity: 1, y: 0, backgroundColor: 'rgba(0, 240, 255, 0)' }}
                        exit={{ opacity: 0, scale: 0.95 }}
                        transition={{ duration: 0.5 }}
                        className="group flex flex-col sm:flex-row sm:items-center justify-between p-3 rounded-lg border border-gold-500/10 hover:border-cyan-500/40 bg-dark-900/50 transition-colors relative"
                      >
                        <div className="flex items-center gap-4 mb-2 sm:mb-0">
                          <div className="p-2 bg-gold-500/10 rounded-md group-hover:bg-cyan-500/20 transition-colors">
                            <button onClick={() => setExpandedTx(expandedTx === tx.hash ? null : tx.hash)} className="cursor-pointer">
                              <Info className="w-4 h-4 text-gold-500 group-hover:text-cyan-400 transition-colors" />
                            </button>
                          </div>
                          <div>
                            <div className="flex items-center gap-2 mb-1">
                              <span className={"text-[10px] font-mono px-2 py-0.5 rounded border " + ((tx.result === "success" || tx.result === "ok") ? "text-emerald-300 border-emerald-500/30 bg-emerald-500/10" : "text-rose-300 border-rose-500/30 bg-rose-500/10")}>
                                {(tx.result === "success" || tx.result === "ok") ? "SUCCESS" : "FAILED"}
                              </span>
                              <span className="text-[10px] font-mono px-2 py-0.5 rounded border border-cyan-500/20 bg-cyan-500/10 text-cyan-300">
                                {String(tx.method ?? "txn").toUpperCase()}
                              </span>
                            </div>
                            <button
  onClick={() => handleViewTx(tx.hash)}
  className="text-left text-[11px] font-mono text-cyan-400 hover:text-cyan-300 break-all w-44 sm:w-72 leading-4 underline decoration-cyan-500/30 hover:decoration-cyan-400/60 transition-colors cursor-pointer"
  title="View transaction details"
>{tx.hash}</button>
                            <div className="text-[10px] font-mono text-gold-500/50">{tx.time}{tx.timestamp ? (' · ' + timeAgo(tx.timestamp)) : ""}</div>
                          </div>
                        </div>

                        <div className="flex items-center gap-2 flex-1 px-3">
                          <button onClick={async () => {
  const ok = await copyToClipboard(tx.from);
  if (ok) {
    setCopyToast('Copied FROM: ' + tx.from);
    setTimeout(() => setCopyToast(null), 1200);
  }
}} className="text-xs font-mono text-gold-500/70 hover:text-cyan-300 truncate w-24 cursor-pointer">{tx.from}</button>
                          <div className="h-px flex-1 bg-gradient-to-r from-transparent via-cyan-500/30 to-transparent relative">
                            <div className="absolute top-1/2 -translate-y-1/2 w-2 h-2 bg-cyan-400 rounded-full blur-[1px] shadow-[0_0_8px_#00F0FF] tx-flow-dot" />
                          </div>
                          <button onClick={async () => {
  const ok = await copyToClipboard(tx.to);
  if (ok) {
    setCopyToast('Copied TO: ' + tx.to);
    setTimeout(() => setCopyToast(null), 1200);
  }
}} className="text-xs font-mono text-gold-500/70 hover:text-cyan-300 truncate w-24 cursor-pointer">{tx.to}</button>
                        </div>

                        <div className="text-right mt-2 sm:mt-0">
                          <div className="text-sm font-mono font-bold text-gold-500 glow-text">Value {tx.value} tDCAI</div>
                          <div className="text-[10px] font-mono text-gold-500/40">Fee {tx.fee} tDCAI</div>
                        </div>

                        {expandedTx === tx.hash && (
                          <div className="absolute left-0 top-full mt-2 z-50 w-full sm:w-[720px] rounded-lg border border-cyan-500/30 bg-dark-900/95 backdrop-blur-md p-3 text-[11px] font-mono text-gold-500/80 shadow-[0_0_30px_rgba(0,240,255,0.18)] max-h-60 overflow-auto">
                            <div className="text-cyan-300/80 mb-2">Additional info</div>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                              <div>Transaction fee: <span className="text-cyan-300">{tx.fee} tDCAI</span> ({tx.feeWei} wei)</div>
                              <div>Gas limit | used: <span className="text-cyan-300">{tx.gasLimit}</span> | <span className="text-cyan-300">{tx.gasUsed}</span></div>
                              <div>Base fee (wei): <span className="text-cyan-300">{tx.baseFeePerGas}</span></div>
                              <div>Txn type: <span className="text-cyan-300">{String(tx.type ?? '--')}</span> · Nonce: <span className="text-cyan-300">{String(tx.nonce ?? '--')}</span> · Position: <span className="text-cyan-300">{String(tx.position ?? '--')}</span></div>
                            </div>
                          </div>
                        )}
                      </motion.div>
                    ))}
                  </AnimatePresence>
                </div>
              </div>
            </div>
          </motion.main>
        ) : currentView === 'blocks' ? (
          <BlocksListView
            onViewBlock={(h: number) => { setSelectedBlock({ height: h }); setCurrentView('block'); try { window.history.pushState({ view: 'block', height: h }, '', `/block/${h}`); } catch {} }}
          />
        ) : currentView === 'txs' ? (
          <TxsListView
            onViewTx={(h: string) => { setSelectedTxHash(h); setCurrentView('tx'); try { window.history.pushState({ view: 'tx', hash: h }, '', `/tx/${h}`); } catch {} }}
            onViewAddress={(a: string) => handleViewAddress(a)}
            onViewBlock={(h: number) => { setSelectedBlock({ height: h }); setCurrentView('block'); try { window.history.pushState({ view: 'block', height: h }, '', `/block/${h}`); } catch {} }}
          />
        ) : currentView === 'tokens' ? (
          <TokensView
            onViewToken={(a: string) => handleViewToken(a)}
            onViewAddress={(a: string) => handleViewAddress(a)}
          />
        ) : currentView === 'dashboard' ? (
          <DashboardView />
        ) : currentView === 'token' ? (
          <TokenView
            address={selectedTokenAddress || ''}
            onBack={() => { setCurrentView('tokens'); try { window.history.pushState({ view: 'tokens' }, '', '/tokens'); } catch {} }}
            onViewTx={(h: string) => { setSelectedTxHash(h); setCurrentView('tx'); try { window.history.pushState({ view: 'tx', hash: h }, '', `/tx/${h}`); } catch {} }}
            onViewBlock={(h: number) => { setSelectedBlock({ height: h }); setCurrentView('block'); try { window.history.pushState({ view: 'block', height: h }, '', `/block/${h}`); } catch {} }}
            onViewAddress={(a: string) => handleViewAddress(a)}
          />
        ) : currentView === 'tx' ? (
          <TxView
            hash={selectedTxHash || ''}
            onBack={() => setCurrentView('home')}
            onViewBlock={(h: number) => { setSelectedBlock({ height: h }); setCurrentView('block'); try { window.history.pushState({ view: 'block', height: h }, '', `/block/${h}`); } catch {} }}
            onViewAddress={(a: string) => handleViewAddress(a)}
          />
        ) : currentView === 'address' ? (
          <AddressView
            address={selectedAddress || ''}
            onBack={() => setCurrentView('home')}
            onViewTx={(h: string) => { setSelectedTxHash(h); setCurrentView('tx'); try { window.history.pushState({ view: 'tx', hash: h }, '', `/tx/${h}`); } catch {} }}
            onViewAddress={(a: string) => handleViewAddress(a)}
            onViewToken={(a: string) => handleViewToken(a)}
          />
        ) : (
          <BlockView 
            block={selectedBlock} 
            onBack={() => setCurrentView('home')} 
            onViewTx={(h: string) => { setSelectedTxHash(h); setCurrentView('tx'); try { window.history.pushState({ view: 'tx', hash: h }, '', `/tx/${h}`); } catch {} }}
            onViewAddress={(a: string) => handleViewAddress(a)}
          />
        )}
      </AnimatePresence>

      <footer className="border-t border-cyan-500/20 py-8 mt-20 relative z-10 bg-dark-900/80 backdrop-blur-md">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col md:flex-row justify-between items-center gap-4">
          <div className="flex items-center gap-2">
            <Cpu className="w-5 h-5 text-cyan-400" />
            <span className="font-black tracking-widest text-gold-500/50">DCAI<span className="text-cyan-500/50">L3</span></span>
          </div>
          <div className="text-xs font-mono text-gold-500/40">
            © 2026 DCAI FOUNDATION. ALL SYSTEMS NOMINAL.
          </div>
        </div>
      </footer>
    </div>
  );
}
