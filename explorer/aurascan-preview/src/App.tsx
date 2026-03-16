import { motion, AnimatePresence } from 'motion/react';
import { useState, useEffect, useRef } from 'react';
import { Search, Activity, Zap, Globe, Database, Hash, Clock, Box, ArrowRightLeft, Cpu, ChevronRight, ChevronLeft, CheckCircle2, Layers, Info, Code2, Menu, X, List } from 'lucide-react';

function navigateTo(path: string) {
  try {
    window.history.pushState({}, '', path);
    window.dispatchEvent(new PopStateEvent('popstate'));
  } catch {
    window.location.href = path;
  }
}

async function copyToClipboard(text: string) {
  try {
    if (navigator.clipboard && (window as any).isSecureContext) {
      await navigator.clipboard.writeText(text);
      return true;
    }
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.position = 'fixed';
    ta.style.left = '-9999px';
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand('copy');
    document.body.removeChild(ta);
    return ok;
  } catch {
    return false;
  }
}

const generateHash = (length = 40) => '0x' + Array.from({length}, () => Math.floor(Math.random()*16).toString(16)).join('');

const generateBlock = (height: number) => ({
  height,
  hash: generateHash(64),
  miner: 'DCAINode_' + Math.floor(Math.random() * 999).toString().padStart(3, '0'),
  txCount: Math.floor(Math.random() * 500) + 50,
  time: new Date().toLocaleTimeString('en-US', { hour12: false }),
  reward: (Math.random() * 10 + 2).toFixed(2)
});

const generateBlockDetails = (baseBlock: any) => ({
  ...baseBlock,
  status: 'FINALIZED',
  confirmations: Math.floor(Math.random() * 1000) + 120,
  size: (Math.random() * 50 + 10).toFixed(2) + ' KB',
  gasUsed: Math.floor(Math.random() * 15000000),
  gasLimit: 30000000,
  parentHash: generateHash(64),
  stateRoot: generateHash(64),
  nonce: '0x' + Math.floor(Math.random() * 1000000000000000).toString(16)
});

const generateTx = () => ({
  hash: generateHash(64),
  from: generateHash(40),
  to: generateHash(40),
  value: (Math.random() * 1000).toFixed(2),
  fee: (Math.random() * 0.01).toFixed(4),
  time: new Date().toLocaleTimeString('en-US', { hour12: false }),
});

const CursorFollower = () => {
  const [pos, setPos] = useState({ x: -100, y: -100 });
  
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      setPos({ x: e.clientX, y: e.clientY });
    };
    window.addEventListener('mousemove', handleMouseMove);
    return () => window.removeEventListener('mousemove', handleMouseMove);
  }, []);

  return (
    <motion.div
      className="fixed top-0 left-0 w-96 h-96 bg-cyan-500/10 rounded-full blur-[100px] pointer-events-none z-50"
      animate={{ x: pos.x - 192, y: pos.y - 192 }}
      transition={{ type: 'tween', ease: 'backOut', duration: 0.5 }}
    />
  );
};

const Header = ({
  active,
  onHome,
  onBlocks,
  onTxs,
}: {
  active: 'home' | 'blocks' | 'txs' | 'tx' | 'block' | 'address',
  onHome: () => void,
  onBlocks: () => void,
  onTxs: () => void,
}) => {
  const [mobileOpen, setMobileOpen] = useState(false);

  const NavItem = ({ label, isActive, onClick }: { label: string, isActive?: boolean, onClick?: () => void }) => (
    <button
      onClick={onClick}
      className={`text-sm font-mono transition-all ${isActive ? 'text-cyan-300 glow-text-cyan' : 'text-gold-500/70 hover:text-cyan-400 hover:glow-text-cyan'}`}
    >
      {label}
    </button>
  );

  return (
    <header className="sticky top-0 z-40 bg-dark-900/80 backdrop-blur-md border-b border-gold-500/20">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
        <div className="flex items-center gap-3 cursor-pointer group" onClick={() => { setMobileOpen(false); onHome(); }}>
          <div className="w-8 h-8 rounded bg-gold-500 flex items-center justify-center shadow-[0_0_10px_#FFD700] group-hover:shadow-[0_0_20px_#FFD700] transition-shadow">
            <Cpu className="w-5 h-5 text-dark-900" />
          </div>
          <span className="font-black text-xl tracking-widest glow-text">DCAI<span className="text-cyan-400 glow-text-cyan">L3</span></span>
          <div className="hidden sm:flex items-center gap-2 px-3 py-1 ml-4 rounded-full border border-cyan-500/30 bg-cyan-500/10">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-cyan-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-cyan-500"></span>
            </span>
            <span className="text-[10px] font-mono font-bold tracking-widest text-cyan-400">MAINNET</span>
          </div>
        </div>

        <nav className="hidden md:flex items-center gap-8">
          <NavItem label="BLOCKS" isActive={active === 'blocks' || active === 'block'} onClick={() => { setMobileOpen(false); onBlocks(); }} />
          <NavItem label="TRANSACTIONS" isActive={active === 'txs' || active === 'tx'} onClick={() => { setMobileOpen(false); onTxs(); }} />
          <NavItem label="TOKENS" onClick={() => { /* next */ }} />
          <NavItem label="NODES" onClick={() => { /* next */ }} />
          <NavItem label="API" onClick={() => { /* next */ }} />
        </nav>

        <div className="flex items-center gap-3">
          <button className="hidden sm:inline-flex glow-box px-4 py-1.5 rounded text-xs font-mono font-bold hover:bg-cyan-500 hover:text-dark-900 hover:shadow-[0_0_15px_#00F0FF] transition-all border-cyan-500/50 text-cyan-400">
            CONNECT WALLET
          </button>

          <button
            onClick={() => setMobileOpen(v => !v)}
            className="md:hidden w-10 h-10 inline-flex items-center justify-center rounded-lg border border-cyan-500/20 text-cyan-300 hover:border-cyan-400/50"
            aria-label="Menu"
          >
            {mobileOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
        </div>
      </div>

      <AnimatePresence>
        {mobileOpen ? (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.16 }}
            className="md:hidden border-t border-gold-500/10 bg-dark-900/95 backdrop-blur-md"
          >
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex flex-col gap-3">
              <NavItem label="BLOCKS" isActive={active === 'blocks' || active === 'block'} onClick={() => { setMobileOpen(false); onBlocks(); }} />
              <NavItem label="TRANSACTIONS" isActive={active === 'txs' || active === 'tx'} onClick={() => { setMobileOpen(false); onTxs(); }} />
              <NavItem label="TOKENS" onClick={() => { setMobileOpen(false); }} />
              <NavItem label="NODES" onClick={() => { setMobileOpen(false); }} />
              <NavItem label="API" onClick={() => { setMobileOpen(false); }} />
              <button className="mt-2 glow-box px-4 py-2 rounded text-xs font-mono font-bold border-cyan-500/50 text-cyan-300 hover:bg-cyan-500 hover:text-dark-900 transition-all">
                CONNECT WALLET
              </button>
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </header>
  );
};

const Hero = () => (
  <div className="py-20 flex flex-col items-center justify-center text-center relative">
    <motion.div
      initial={{ scale: 0.8, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      transition={{ duration: 1, ease: "easeOut" }}
      className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-cyan-500/5 rounded-full blur-3xl pointer-events-none"
    />
    
    <motion.div
      initial={{ y: 20, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      className="relative z-10 mb-8"
    >
      <h1 className="text-5xl md:text-7xl font-black tracking-tighter mb-4">
        DCAI <span className="glow-text-cyan text-transparent bg-clip-text bg-gradient-to-b from-cyan-300 to-cyan-600">FOUNDATION</span>
      </h1>
      <p className="font-mono text-gold-500/60 max-w-2xl mx-auto">
        EXPLORE THE DCAI L3 NETWORK. REAL-TIME DATA STREAMING. UNCOMPROMISED SECURITY.
      </p>
    </motion.div>

    <motion.div
      initial={{ y: 20, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ delay: 0.2 }}
      className="w-full max-w-3xl relative z-10 group px-4"
    >
      <div className="absolute -inset-1 bg-gradient-to-r from-gold-600 via-cyan-500 to-gold-400 rounded-xl blur opacity-20 group-hover:opacity-40 transition duration-500"></div>
      <div className="relative flex items-center bg-dark-800/90 backdrop-blur-sm border border-cyan-500/40 rounded-xl p-2 shadow-[0_0_30px_rgba(0,240,255,0.1)]">
        <div className="pl-4 pr-2">
          <Search className="w-6 h-6 text-cyan-400" />
        </div>
        <input
          type="text"
          placeholder="Search by Address / Txn Hash / Block / Token..."
          className="w-full bg-transparent border-none outline-none text-gold-500 placeholder-gold-500/40 font-mono text-sm sm:text-lg py-3"
        />
        <button className="bg-cyan-500 text-dark-900 px-4 sm:px-8 py-3 rounded-lg font-bold font-mono hover:bg-cyan-400 transition-colors shadow-[0_0_15px_rgba(0,240,255,0.5)]">
          SCAN
        </button>
      </div>
    </motion.div>
  </div>
);

const Stats = () => {
  const [stats, setStats] = useState<any>(null);
  const [latestBlock, setLatestBlock] = useState<number | null>(null);
  const [txTodayLive, setTxTodayLive] = useState<number | null>(null);
  const [totalTxLive, setTotalTxLive] = useState<number | null>(null);
  const txTodayBaseRef = useRef<number | null>(null);
  const totalTxBaseRef = useRef<number | null>(null);
  const txDeltaRef = useRef<number>(0);
  const lastSeenRef = useRef<number | null>(null);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      try {
        const res = await fetch('/api/v2/stats', { cache: 'no-store' });
        if (res.status === 429) return;
        const data = await res.json();
        if (!cancelled) setStats(data);
      } catch (e) {
        // keep previous
      }
    };
    const loadLatest = async () => {
      try {
        // Use the same Blockscout API as the blocks list so the UI stays consistent
        const res = await fetch('/api/v2/blocks?type=block&limit=1', { cache: 'no-store' });
        if (res.status === 429) return;
        const data = await res.json();
        const h = Number(data?.items?.[0]?.height);
        if (Number.isFinite(h) && !cancelled) setLatestBlock(h);
      } catch {}
    };

    const loadLiveTxCounters = async () => {
      try {
        const baseToday = stats?.transactions_today != null ? Number(stats.transactions_today) : null;
        const baseTotal = stats?.total_transactions != null ? Number(stats.total_transactions) : null;
        if (baseToday != null && (txTodayBaseRef.current == null || txTodayBaseRef.current !== baseToday)) {
          txTodayBaseRef.current = baseToday;
          txDeltaRef.current = 0;
          lastSeenRef.current = null;
        }
        if (baseTotal != null && (totalTxBaseRef.current == null || totalTxBaseRef.current !== baseTotal)) {
          totalTxBaseRef.current = baseTotal;
          txDeltaRef.current = 0;
          lastSeenRef.current = null;
        }

        const res = await fetch('/api/v2/blocks?type=block&limit=10', { cache: 'no-store' });
        if (res.status === 429) return;
        const data = await res.json();
        const items = (data?.items || []).map((b: any) => ({ height: Number(b.height), tx: Number(b.transaction_count ?? 0) }));
        if (!items.length) return;
        const newest = Math.max(...items.map((x: any) => x.height));
        const lastSeen = lastSeenRef.current;
        if (lastSeen == null) {
          lastSeenRef.current = newest;
        } else {
          const inc = items.filter((x: any) => x.height > lastSeen).reduce((a: number, x: any) => a + x.tx, 0);
          if (inc > 0) {
            txDeltaRef.current += inc;
            lastSeenRef.current = newest;
          }
        }

        if (!cancelled) {
          if (txTodayBaseRef.current != null) setTxTodayLive(txTodayBaseRef.current + txDeltaRef.current);
          if (totalTxBaseRef.current != null) setTotalTxLive(totalTxBaseRef.current + txDeltaRef.current);
        }
      } catch {}
    };

    load();
    loadLatest();
    loadLiveTxCounters();
    const t = setInterval(load, 30000);
    const t2 = setInterval(loadLatest, 2000);
    const t3 = setInterval(loadLiveTxCounters, 4000);
    return () => {
      cancelled = true;
      clearInterval(t);
      clearInterval(t2);
      clearInterval(t3);
    };
  }, [stats]);

  const avgBlockSec = stats?.average_block_time ? (Number(stats.average_block_time) / 1000) : null;

  const cards = [
    {
      label: 'LATEST BLOCK (INDEXED)',
      value: latestBlock != null ? `#${latestBlock}` : (stats?.total_blocks ? `#${stats.total_blocks}` : '--'),
      sub: avgBlockSec != null ? `${avgBlockSec.toFixed(2)}s avg block time` : 'avg block time --',
      icon: Layers,
      color: 'cyan',
      pulse: true,
    },
    {
      label: 'TX TODAY',
      value: txTodayLive != null ? txTodayLive : (stats?.transactions_today ?? '--'),
      sub: stats?.network_utilization_percentage != null ? `${Number(stats.network_utilization_percentage).toFixed(1)}% utilization` : 'utilization --',
      icon: ArrowRightLeft,
      color: 'gold',
    },
    {
      label: 'TOTAL TX',
      value: totalTxLive != null ? totalTxLive : (stats?.total_transactions ?? '--'),
      sub: stats?.total_addresses != null ? `${stats.total_addresses} addresses` : 'addresses --',
      icon: Hash,
      color: 'cyan',
    },
    {
      label: 'GAS (AVG)',
      value: stats?.gas_prices?.average != null ? `${stats.gas_prices.average}` : '--',
      sub: stats?.gas_prices ? `slow ${stats.gas_prices.slow} · fast ${stats.gas_prices.fast}` : 'slow/fast --',
      icon: Zap,
      color: 'gold',
    },
  ];

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-16 relative z-10">
      {cards.map((c, i) => (
        <motion.div
          key={c.label}
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 + i * 0.1 }}
          className={`glow-box ${c.color === 'cyan' ? 'border-t-cyan-500/50 hover:border-cyan-500' : 'border-t-gold-500/50 hover:border-gold-500'} bg-dark-800/60 backdrop-blur-md p-6 rounded-xl border-t-2 flex flex-col items-center text-center group transition-colors`}
        >
          <div className={`mb-4 p-3 rounded-full ${c.color === 'cyan' ? 'bg-cyan-500/10 group-hover:bg-cyan-500/20' : 'bg-gold-500/10 group-hover:bg-gold-500/20'} transition-colors relative`}>
            {c.pulse && (
              <span className="absolute top-0 right-0 flex h-3 w-3">
                <span className={`animate-ping absolute inline-flex h-full w-full rounded-full ${c.color === 'cyan' ? 'bg-cyan-400' : 'bg-gold-500'} opacity-75`}></span>
                <span className={`relative inline-flex rounded-full h-3 w-3 ${c.color === 'cyan' ? 'bg-cyan-500' : 'bg-gold-500'}`}></span>
              </span>
            )}
            <c.icon className={`w-6 h-6 ${c.color === 'cyan' ? 'text-cyan-400' : 'text-gold-500'}`} />
          </div>

          <div className="text-xs font-mono text-gold-500/50 mb-1">{c.label}</div>
          <div className={`text-xl sm:text-2xl font-bold font-mono ${c.color === 'cyan' ? 'glow-text-cyan text-cyan-400' : 'glow-text text-gold-500'}`}>{c.value}</div>
          <div className="mt-2 text-[10px] font-mono text-gold-500/40">{c.sub}</div>
        </motion.div>
      ))}
    </div>
  );
};

const DetailRow = ({ label, value, isCyan = false, onCopy }: { label: string, value: string | number, isCyan?: boolean, onCopy?: () => void }) => (
  <div className="flex flex-col gap-1 border-b border-gold-500/10 pb-4">
    <span className="text-xs font-mono text-gold-500/50">{label}</span>
    <div className="flex items-start justify-between gap-3">
      <div className={`text-sm font-mono break-all ${isCyan ? 'text-cyan-400 glow-text-cyan' : 'text-gold-400'}`}>
        {value}
      </div>
      {onCopy ? (
        <button
          onClick={onCopy}
          className="shrink-0 w-6 h-6 inline-flex items-center justify-center text-[11px] font-mono text-cyan-300 border border-cyan-500/25 hover:border-cyan-400 rounded transition-colors"
        >
          ⧉
        </button>
      ) : null}
    </div>
  </div>
);

const BlocksListView = ({ onViewBlock }: { onViewBlock: (h: number) => void }) => {
  const [items, setItems] = useState<any[] | null>(null);
  const [loading, setLoading] = useState(false);

  const [pageParams, setPageParams] = useState<any | null>(() => {
    try {
      const sp = new URLSearchParams(window.location.search || '');
      const o: any = {};
      for (const k of ['block_number', 'items_count', 'limit']) {
        const v = sp.get(k);
        if (v != null) o[k] = v;
      }
      return Object.keys(o).length ? o : null;
    } catch {
      return null;
    }
  });
  const [nextParams, setNextParams] = useState<any | null>(null);
  const [prevStack, setPrevStack] = useState<any[]>([]);

  const short = (s: string, a = 10, b = 6) => (s && s.length > a + b ? `${s.slice(0, a)}…${s.slice(-b)}` : s);

  const setBlocksUrl = (p: any | null, replace = false) => {
    try {
      const sp = new URLSearchParams();
      if (p) for (const [k, v] of Object.entries(p)) if (v != null) sp.set(String(k), String(v));
      const qs = sp.toString();
      const url = '/blocks' + (qs ? `?${qs}` : '');
      const fn: any = replace ? window.history.replaceState : window.history.pushState;
      fn.call(window.history, { view: 'blocks' }, '', url);
    } catch {}
  };

  useEffect(() => {
    let cancelled = false;

    const buildUrl = () => {
      const sp = new URLSearchParams();
      sp.set('type', 'block');
      // Blockscout typically returns 50 items per page; keep limit small anyway.
      sp.set('limit', '25');
      if (pageParams) {
        for (const [k, v] of Object.entries(pageParams)) {
          if (v == null) continue;
          sp.set(String(k), String(v));
        }
      }
      return `/api/v2/blocks?${sp.toString()}`;
    };

    const load = async () => {
      try {
        setLoading(true);
        const res = await fetch(buildUrl(), { cache: 'no-store' });
        if (res.status === 429) return;
        const j = await res.json();
        if (!cancelled) {
          setItems(j?.items || []);
          setNextParams(j?.next_page_params || null);
        }
      } catch {}
      finally { if (!cancelled) setLoading(false); }
    };

    load();

    // Only auto-refresh the first page
    if (!pageParams) {
      const id = window.setInterval(load, 8000);
      return () => { cancelled = true; window.clearInterval(id); };
    }

    return () => { cancelled = true; };
  }, [pageParams]);

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pb-20 pt-8 relative z-10"
    >
      <div className="mb-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="p-4 bg-cyan-500/10 rounded-xl border border-cyan-500/20 shadow-[0_0_20px_rgba(0,240,255,0.10)]">
            <List className="w-8 h-8 text-cyan-400" />
          </div>
          <div className="min-w-0">
            <h1 className="text-3xl md:text-4xl font-black tracking-widest">BLOCKS <span className="glow-text-cyan text-cyan-400">LIST</span></h1>
            <div className="mt-2 text-xs font-mono text-gold-500/60">{loading ? 'Loading…' : (items ? `${items.length} block(s)` : '—')}</div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            disabled={prevStack.length === 0}
            onClick={() => {
              if (!prevStack.length) return;
              const copy = prevStack.slice();
              const prev = copy.pop();
              setPrevStack(copy);
              setBlocksUrl(prev || null);
              setPageParams(prev || null);
            }}
            className={`px-3 py-2 rounded-lg border font-mono text-xs tracking-widest transition-colors ${prevStack.length ? 'text-gold-400 border-gold-500/20 hover:border-cyan-500/40 hover:text-cyan-300' : 'text-gold-500/30 border-gold-500/10 cursor-not-allowed'}`}
          >
            PREV
          </button>

          <button
            disabled={!nextParams}
            onClick={() => {
              if (!nextParams) return;
              setPrevStack(s => [...s, pageParams]);
              setBlocksUrl(nextParams);
              setPageParams(nextParams);
            }}
            className={`px-3 py-2 rounded-lg border font-mono text-xs tracking-widest transition-colors ${nextParams ? 'text-gold-400 border-gold-500/20 hover:border-cyan-500/40 hover:text-cyan-300' : 'text-gold-500/30 border-gold-500/10 cursor-not-allowed'}`}
          >
            NEXT
          </button>
        </div>
      </div>

      <div className="glow-box bg-dark-800/60 backdrop-blur-md rounded-2xl p-6 border-t-2 border-t-cyan-500/30">
        <div className="space-y-3">
          {(items || []).map((b: any) => (
            <motion.div
              key={b.hash}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.16 }}
              className="rounded-xl border border-cyan-500/15 bg-dark-900/40 p-4"
            >
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <button
                    onClick={() => onViewBlock(Number(b.height))}
                    className="text-left text-sm font-mono text-cyan-300 hover:text-cyan-200 underline decoration-cyan-500/30 hover:decoration-cyan-400/60"
                  >
                    Block #{b.height}
                  </button>
                  <div className="mt-1 text-[11px] font-mono text-gold-500/60 break-all">{short(String(b.hash || ''))}</div>
                  <div className="mt-1 text-[10px] font-mono text-gold-500/40">miner {short(String(b.miner?.hash || '0x0'))} · tx {b.transaction_count ?? '--'} · size {b.size ?? '--'} bytes</div>
                </div>
                <div className="shrink-0 text-right">
                  <div className="text-[11px] font-mono text-gold-500/60">{String(b.timestamp || '').replace('T', ' ').replace('Z', '')}</div>
                  <div className="mt-2 text-[10px] font-mono text-gold-500/40">gas used {b.gas_used ?? '--'} / {b.gas_limit ?? '--'}</div>
                </div>
              </div>
            </motion.div>
          ))}

          {!loading && items && items.length === 0 ? (
            <div className="text-xs font-mono text-gold-500/60">No blocks.</div>
          ) : null}
        </div>
      </div>
    </motion.div>
  );
};

const TxsListView = ({ onViewTx, onViewAddress }: { onViewTx: (h: string) => void, onViewAddress: (a: string) => void }) => {
  const [items, setItems] = useState<any[] | null>(null);
  const [loading, setLoading] = useState(false);

  const [pageParams, setPageParams] = useState<any | null>(() => {
    try {
      const sp = new URLSearchParams(window.location.search || '');
      const o: any = {};
      for (const k of ['block_number', 'index', 'items_count', 'limit']) {
        const v = sp.get(k);
        if (v != null) o[k] = v;
      }
      return Object.keys(o).length ? o : null;
    } catch {
      return null;
    }
  });
  const [nextParams, setNextParams] = useState<any | null>(null);
  const [prevStack, setPrevStack] = useState<any[]>([]);

  const short = (s: string, a = 12, b = 6) => (s && s.length > a + b ? `${s.slice(0, a)}…${s.slice(-b)}` : s);

  const fmtTDCAI = (weiLike: any, dp = 6) => {
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

  const fmtTDCAIParts = (weiLike: any, dp = 6) => {
    const s = fmtTDCAI(weiLike, dp);
    if (s === '--') return { i: '--', f: ''.padEnd(dp, '-') };
    const [i, f0] = String(s).split('.');
    return { i: i || '0', f: (f0 || '').padEnd(dp, '0').slice(0, dp) };
  };

  const methodLabel = (tx: any) => {
    try {
      if (tx?.created_contract?.hash) return 'CONTRACT CREATE';
      const ri = String(tx?.raw_input || '');
      if (!ri || ri === '0x' || ri.length < 10) return 'TRANSFER';
      return ri.slice(0, 10);
    } catch {
      return '—';
    }
  };

  const timeAgo = (iso?: string) => {
    try {
      if (!iso) return '--';
      const ms = Date.now() - new Date(iso).getTime();
      const s = Math.floor(ms / 1000);
      if (s < 5) return 'just now';
      if (s < 60) return `${s}s ago`;
      const m = Math.floor(s / 60);
      if (m < 60) return `${m}m ago`;
      const h = Math.floor(m / 60);
      if (h < 48) return `${h}h ago`;
      const d = Math.floor(h / 24);
      return `${d}d ago`;
    } catch {
      return '--';
    }
  };

  const setTxsUrl = (p: any | null, replace = false) => {
    try {
      const sp = new URLSearchParams();
      if (p) for (const [k, v] of Object.entries(p)) if (v != null) sp.set(String(k), String(v));
      const qs = sp.toString();
      const url = '/txs' + (qs ? `?${qs}` : '');
      const fn: any = replace ? window.history.replaceState : window.history.pushState;
      fn.call(window.history, { view: 'txs' }, '', url);
    } catch {}
  };

  useEffect(() => {
    let cancelled = false;

    const buildUrl = () => {
      const sp = new URLSearchParams();
      sp.set('limit', '25');
      if (pageParams) {
        for (const [k, v] of Object.entries(pageParams)) {
          if (v == null) continue;
          sp.set(String(k), String(v));
        }
      }
      return `/api/v2/transactions?${sp.toString()}`;
    };

    const load = async () => {
      try {
        setLoading(true);
        const res = await fetch(buildUrl(), { cache: 'no-store' });
        if (res.status === 429) return;
        const j = await res.json();
        if (!cancelled) {
          setItems(j?.items || []);
          setNextParams(j?.next_page_params || null);
        }
      } catch {}
      finally { if (!cancelled) setLoading(false); }
    };

    load();

    if (!pageParams) {
      const id = window.setInterval(load, 6000);
      return () => { cancelled = true; window.clearInterval(id); };
    }
    return () => { cancelled = true; };
  }, [pageParams]);

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pb-20 pt-8 relative z-10"
    >
      <div className="mb-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="p-4 bg-gold-500/10 rounded-xl border border-gold-500/20 shadow-[0_0_20px_rgba(255,215,0,0.10)]">
            <ArrowRightLeft className="w-8 h-8 text-gold-400" />
          </div>
          <div className="min-w-0">
            <h1 className="text-3xl md:text-4xl font-black tracking-widest">TRANSACTIONS <span className="glow-text text-gold-500">LIST</span></h1>
            <div className="mt-2 text-xs font-mono text-gold-500/60">{loading ? 'Loading…' : (items ? `${items.length} tx(s)` : '—')}</div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            disabled={prevStack.length === 0}
            onClick={() => {
              if (!prevStack.length) return;
              const copy = prevStack.slice();
              const prev = copy.pop();
              setPrevStack(copy);
              setTxsUrl(prev || null);
              setPageParams(prev || null);
            }}
            className={`px-3 py-2 rounded-lg border font-mono text-xs tracking-widest transition-colors ${prevStack.length ? 'text-gold-400 border-gold-500/20 hover:border-cyan-500/40 hover:text-cyan-300' : 'text-gold-500/30 border-gold-500/10 cursor-not-allowed'}`}
          >
            PREV
          </button>
          <button
            disabled={!nextParams}
            onClick={() => {
              if (!nextParams) return;
              setPrevStack(s => [...s, pageParams]);
              setTxsUrl(nextParams);
              setPageParams(nextParams);
            }}
            className={`px-3 py-2 rounded-lg border font-mono text-xs tracking-widest transition-colors ${nextParams ? 'text-gold-400 border-gold-500/20 hover:border-cyan-500/40 hover:text-cyan-300' : 'text-gold-500/30 border-gold-500/10 cursor-not-allowed'}`}
          >
            NEXT
          </button>
        </div>
      </div>

      <div className="glow-box bg-dark-800/60 backdrop-blur-md rounded-2xl p-6 border-t-2 border-t-gold-500/30">
        <div className="space-y-3">
          {(items || []).map((tx: any) => (
            <motion.div
              key={tx.hash}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.16 }}
              className="rounded-xl border border-gold-500/15 bg-dark-900/40 p-4"
            >
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-[10px] font-mono tracking-widest px-2 py-0.5 rounded border border-cyan-500/20 bg-cyan-500/10 text-cyan-300">
                      {methodLabel(tx)}
                    </span>
                    <button
                      onClick={() => onViewTx(String(tx.hash))}
                      className="text-left text-[11px] font-mono text-cyan-300 hover:text-cyan-200 underline decoration-cyan-500/30 hover:decoration-cyan-400/60 break-all"
                    >
                      {String(tx.hash)}
                    </button>
                  </div>

                  <div className="mt-1 text-[10px] font-mono text-gold-500/45">
                    block {tx.block ?? tx.block_number ?? '--'} · pos {tx.position ?? '--'} · status {String(tx.status ?? tx.result ?? '--')} · conf {tx.confirmations ?? '--'}
                  </div>

                  <div className="mt-2 text-[10px] font-mono text-gold-500/40 flex flex-col gap-1">
                    <div>
                      <span className="text-gold-500/35">from</span>{' '}
                      <button onClick={() => tx?.from?.hash && onViewAddress(String(tx.from.hash))} className="text-cyan-300 hover:text-cyan-200 underline decoration-cyan-500/30 hover:decoration-cyan-400/60">
                        {short(String(tx.from?.hash || ''))}
                      </button>
                    </div>
                    <div>
                      <span className="text-gold-500/35">to</span>{' '}
                      {tx?.created_contract?.hash ? (
                        <button onClick={() => onViewAddress(String(tx.created_contract.hash))} className="text-cyan-300 hover:text-cyan-200 underline decoration-cyan-500/30 hover:decoration-cyan-400/60">
                          {short(String(tx.created_contract.hash))}
                        </button>
                      ) : (
                        <button onClick={() => tx?.to?.hash && onViewAddress(String(tx.to.hash))} className="text-cyan-300 hover:text-cyan-200 underline decoration-cyan-500/30 hover:decoration-cyan-400/60">
                          {short(String(tx.to?.hash || ''))}
                        </button>
                      )}
                    </div>
                  </div>
                </div>

                <div className="shrink-0 text-right">
                  <div className="text-[10px] font-mono text-gold-500/60">{timeAgo(String(tx.timestamp || ''))}</div>
                  <div className="text-[10px] font-mono text-gold-500/35">{String(tx.timestamp || '').replace('T', ' ').replace('Z', '')}</div>

                  <div className="mt-2 text-xs font-mono text-gold-500/90 tabular-nums">
                    {(() => {
                      const p = fmtTDCAIParts(tx.value, 6);
                      return (
                        <span>
                          <span className="inline-block text-right w-[72px]">{p.i}</span>
                          <span className="text-gold-500/60">.</span>
                          <span className="inline-block w-[52px]">{p.f}</span>
                          <span className="ml-1 text-gold-500/60">tDCAI</span>
                        </span>
                      );
                    })()}
                  </div>
                  <div className="text-[10px] font-mono text-gold-500/35">{String(tx.value ?? '0')} wei</div>

                  <div className="mt-2 text-[10px] font-mono text-gold-500/70 tabular-nums">
                    {(() => {
                      const p = fmtTDCAIParts(tx.fee?.value ?? tx.fee ?? '0', 6);
                      return (
                        <span>
                          <span className="text-gold-500/50">fee</span>{' '}
                          <span className="inline-block text-right w-[72px]">{p.i}</span>
                          <span className="text-gold-500/50">.</span>
                          <span className="inline-block w-[52px]">{p.f}</span>
                          <span className="ml-1 text-gold-500/50">tDCAI</span>
                        </span>
                      );
                    })()}
                  </div>
                  <div className="text-[10px] font-mono text-gold-500/35">{String(tx.fee?.value ?? tx.fee ?? '0')} wei</div>
                </div>
              </div>
            </motion.div>
          ))}

          {!loading && items && items.length === 0 ? (
            <div className="text-xs font-mono text-gold-500/60">No transactions.</div>
          ) : null}
        </div>
      </div>
    </motion.div>
  );
};

const BlockView = ({ block, onBack }: { block: any, onBack: () => void, key?: string }) => {
  const [details, setDetails] = useState<any>(null);
  const [blockTxs, setBlockTxs] = useState<any[]>([]);
  const [copyToast, setCopyToast] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    const fmt = (weiLike: any, decimals = 18, dp = 6) => {
      try {
        const wei = BigInt(String(weiLike ?? '0'));
        const neg = wei < 0n;
        const x = neg ? -wei : wei;
        const s = x.toString();
        const head = s.length > decimals ? s.slice(0, -decimals) : '0';
        const tail = s.length > decimals ? s.slice(-decimals) : s.padStart(decimals, '0');
        return (neg ? '-' : '') + head + '.' + tail.slice(0, dp);
      } catch {
        return '--';
      }
    };

    const short = (addr: string) => (addr ? (addr.slice(0, 6) + '…' + addr.slice(-4)) : '--');

    const load = async () => {
      try {
        window.scrollTo(0, 0);

        const res = await fetch(`/api/v2/blocks/${block.height}`, { cache: 'no-store' });
        const b = await res.json();

        // head block for confirmations
        let head: number | null = null;
        try {
          const headRes = await fetch('/rpc1/', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'eth_blockNumber', params: [] }),
          });
          const headJson = await headRes.json();
          const hx = headJson?.result;
          if (typeof hx === 'string' && hx.startsWith('0x')) head = parseInt(hx, 16);
        } catch {}

        // clique signer
        let signer = '';
        try {
          const hexNum = '0x' + Number(block.height).toString(16);
          const snapRes = await fetch('/rpc1/', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'clique_getSnapshot', params: [hexNum] }),
          });
          const snap = await snapRes.json();
          signer = (snap?.result?.recents?.[String(block.height)] || '').toLowerCase();
        } catch {}

        const conf = head != null ? Math.max(0, head - Number(b.height)) : null;
        const status = conf != null && conf <= 0 ? 'PENDING' : 'FINALIZED';

        const details = {
          height: b.height,
          hash: b.hash,
          status,
          confirmations: conf != null ? conf : '--',
          size: b.size != null ? String(b.size) : '--',
          txCount: Number(b.transaction_count ?? 0),
          time: b.timestamp ? new Date(b.timestamp).toLocaleString('en-GB', { hour12: false }) : '--',
          miner: signer ? (short(signer) + '  ' + signer) : '--',
          reward: fmt(b.transaction_fees ?? '0', 18, 6),
          gasUsed: Number(b.gas_used ?? 0),
          gasLimit: Number(b.gas_limit ?? 0),
          parentHash: b.parent_hash ?? '--',
          stateRoot: b.state_root ?? '--',
        };

        const txRes = await fetch(`/api/v2/blocks/${block.height}/transactions?limit=12`, { cache: 'no-store' });
        const txData = await txRes.json();
        const txs = (txData?.items || []).map((tx: any) => ({
          hash: tx.hash,
          from: tx.from?.hash || tx.from || '--',
          to: tx.to?.hash || tx.to || '--',
          value: fmt(tx.value ?? '0', 18, 6),
          fee: fmt(tx.fee?.value ?? tx.fee ?? '0', 18, 6),
          timestamp: tx.timestamp,
          time: tx.timestamp ? new Date(tx.timestamp).toLocaleTimeString('en-US', { hour12: false }) : '--',
        }));

        if (!cancelled) {
          setDetails(details);
          setBlockTxs(txs);
        }
      } catch {
        // ignore
      }
    };

    load();
    return () => {
      cancelled = true;
    };
  }, [block]);

  if (!details) return null;

  return (
    <motion.div 
      initial={{ opacity: 0, y: 20 }} 
      animate={{ opacity: 1, y: 0 }} 
      exit={{ opacity: 0, y: -20 }} 
      className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pb-20 pt-8 relative z-10"
    >
       <AnimatePresence>
        {copyToast ? (
          <motion.div
            key="copytoast-block"
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
     <button 
        onClick={onBack} 
        className="text-cyan-400 hover:text-cyan-300 flex items-center gap-2 font-mono text-sm mb-8 group transition-colors cursor-pointer"
      >
        <ChevronLeft className="w-4 h-4 group-hover:-translate-x-1 transition-transform" /> 
        BACK TO STREAM
      </button>

      <div className="mb-8 flex items-center gap-4">
        <div className="p-4 bg-cyan-500/10 rounded-xl border border-cyan-500/30 shadow-[0_0_20px_rgba(0,240,255,0.2)]">
          <Layers className="w-8 h-8 text-cyan-400" />
        </div>
        <div>
          <h1 className="text-3xl md:text-4xl font-black tracking-widest">
            BLOCK <span className="glow-text-cyan text-cyan-400">#{details.height}</span>
          </h1>
          <div className="flex items-center gap-3 mt-2">
            <div className="flex items-center gap-1 text-xs font-mono text-emerald-400 bg-emerald-500/10 px-2 py-1 rounded border border-emerald-500/20">
              <CheckCircle2 className="w-3 h-3" /> {details.status}
            </div>
            <span className="text-xs font-mono text-gold-500/50">{details.confirmations} Block Confirmations</span>
          </div>
        </div>
      </div>

      <div className="glow-box-cyan bg-dark-800/80 backdrop-blur-xl p-6 md:p-8 rounded-2xl border-t-4 border-t-cyan-500 mb-12">
        <h2 className="text-lg font-bold tracking-widest flex items-center gap-2 mb-6 text-cyan-400">
          <Box className="w-5 h-5" />
          OVERVIEW
        </h2>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-x-12 gap-y-6">
          <DetailRow label="BLOCK HASH" value={details.hash} isCyan onCopy={() => copyToClipboard(String(details.hash))} />
          <DetailRow label="TIMESTAMP" value={details.time} />
          <div className="flex flex-col gap-1 border-b border-gold-500/10 pb-4">
            <span className="text-xs font-mono text-gold-500/50">VALIDATOR</span>
            <div className="flex items-start justify-between gap-3">
              <button
                onClick={() => details.validator && navigateTo(`/address/${details.validator}`)}
                className="text-left text-sm font-mono break-all text-cyan-400 glow-text-cyan hover:text-cyan-300 underline decoration-cyan-500/30 hover:decoration-cyan-400/60"
              >
                {details.validator || details.miner}
              </button>
              <button onClick={() => details.validator && copyToClipboard(String(details.validator))} className="shrink-0 w-6 h-6 inline-flex items-center justify-center text-[11px] font-mono text-cyan-300 border border-cyan-500/25 hover:border-cyan-400 rounded">⧉</button>
            </div>
          </div>
          <DetailRow label="BLOCK REWARD" value={`${details.reward} DCAI`} />
          <DetailRow label="TRANSACTIONS" value={details.txCount} />
          <DetailRow label="SIZE" value={details.size} />
          <DetailRow label="GAS USED" value={`${details.gasUsed.toLocaleString()} (${((details.gasUsed / details.gasLimit) * 100).toFixed(2)}%)`} />
          <DetailRow label="GAS LIMIT" value={details.gasLimit.toLocaleString()} />
          <DetailRow label="PARENT HASH" value={details.parentHash} onCopy={() => copyToClipboard(String(details.parentHash))} />
          <DetailRow label="STATE ROOT" value={details.stateRoot} />
        </div>
      </div>

      <div className="glow-box bg-dark-800/50 backdrop-blur-md rounded-2xl p-6 border-t-2 border-t-gold-500/30">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-bold tracking-widest flex items-center gap-2">
            <ArrowRightLeft className="w-5 h-5 text-gold-500" />
            TRANSACTIONS ({details.txCount})
          </h2>
        </div>

        <div className="space-y-3">
          {blockTxs.map((tx, idx) => (
            <motion.div
              key={tx.hash}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: idx * 0.05 }}
              className="group flex flex-col sm:flex-row sm:items-center justify-between p-4 rounded-lg border border-gold-500/10 hover:border-cyan-500/40 bg-dark-900/50 transition-colors"
            >
              <div className="flex items-center gap-4 mb-2 sm:mb-0">
                <div className="p-2 bg-gold-500/10 rounded-md group-hover:bg-cyan-500/20 transition-colors">
                  <Hash className="w-4 h-4 text-gold-500 group-hover:text-cyan-400 transition-colors" />
                </div>
                <div>
                  <div className="text-[11px] font-mono text-cyan-400 break-all w-44 sm:w-72 leading-4">{tx.hash}</div>
                  <div className="text-[10px] font-mono text-gold-500/50">{tx.time}{tx.timestamp ? (' · ' + timeAgo(tx.timestamp)) : ""}</div>
                </div>
              </div>

              <div className="flex items-center gap-2 flex-1 px-3">
                <div className="flex items-center gap-2 w-28">
  <button onClick={() => navigateTo(`/address/${tx.from}`)} className="text-xs font-mono text-gold-500/70 hover:text-cyan-300 truncate cursor-pointer underline decoration-gold-500/20 hover:decoration-cyan-400/60">{tx.from}</button>
  <button onClick={async () => {
    const ok = await copyToClipboard(tx.from);
    if (ok) {
      setCopyToast('Copied FROM: ' + tx.from);
      setTimeout(() => setCopyToast(null), 1200);
    }
  }} className="w-6 h-6 inline-flex items-center justify-center text-[11px] font-mono text-cyan-300 border border-cyan-500/25 hover:border-cyan-400 rounded transition-colors">⧉</button>
</div>
                <div className="h-px flex-1 bg-gradient-to-r from-transparent via-cyan-500/30 to-transparent relative">
                  <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-2 h-2 bg-cyan-400 rounded-full blur-[1px] shadow-[0_0_8px_#00F0FF]" />
                </div>
                <div className="flex items-center gap-2 w-28 justify-end">
  <button onClick={() => navigateTo(`/address/${tx.to}`)} className="text-xs font-mono text-gold-500/70 hover:text-cyan-300 truncate cursor-pointer underline decoration-gold-500/20 hover:decoration-cyan-400/60">{tx.to}</button>
  <button onClick={async () => {
    const ok = await copyToClipboard(tx.to);
    if (ok) {
      setCopyToast('Copied TO: ' + tx.to);
      setTimeout(() => setCopyToast(null), 1200);
    }
  }} className="w-6 h-6 inline-flex items-center justify-center text-[11px] font-mono text-cyan-300 border border-cyan-500/25 hover:border-cyan-400 rounded transition-colors">⧉</button>
</div>
              </div>

              <div className="text-right mt-2 sm:mt-0">
                <div className="text-sm font-mono font-bold text-gold-500 glow-text">{tx.value} DCAI</div>
                <div className="text-[10px] font-mono text-gold-500/40">FEE: {tx.fee}</div>
              </div>
            </motion.div>
          ))}
        </div>
        
        <div className="mt-6 text-center">
          <button className="text-xs font-mono text-cyan-400 hover:text-cyan-300 border border-cyan-500/30 hover:border-cyan-400 px-6 py-2 rounded transition-colors cursor-pointer">
            LOAD MORE TRANSACTIONS
          </button>
        </div>
      </div>
    </motion.div>
  );
};

const TxView = ({ hash, onBack, onViewBlock, onViewAddress }: { hash: string, onBack: () => void, onViewBlock: (h: number) => void, onViewAddress: (a: string) => void }) => {
  const [tx, setTx] = useState<any>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [copyToast, setCopyToast] = useState<string | null>(null);
  const [tab, setTab] = useState<'overview' | 'logs' | 'transfers'>('overview');
  const [showInput, setShowInput] = useState<boolean>(false);
  const [logs, setLogs] = useState<any[] | null>(null);
  const [logsLoading, setLogsLoading] = useState<boolean>(false);
  const [logOpen, setLogOpen] = useState<Record<string, boolean>>({});
  const [transfers, setTransfers] = useState<any[] | null>(null);
  const [transfersLoading, setTransfersLoading] = useState<boolean>(false);

  const fmtTDCAI = (weiLike: any, dp = 6) => {
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

  const short = (addr: string) => (addr ? (addr.slice(0, 6) + '…' + addr.slice(-4)) : '--');

  const EVENT_SIGS: Record<string, string> = {
    // ERC-20 / ERC-721
    '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef': 'Transfer(address,address,uint256)',
    '0x8c5be1e5ebec7d5bd14f71427d1e84f3dd0314c0f7b2291e5b200ac8c7c3b925': 'Approval(address,address,uint256)',
  };

  const eventName = (topic0?: string) => {
    if (!topic0) return 'Unknown event';
    const k = String(topic0).toLowerCase();
    return EVENT_SIGS[k] || 'Unknown event';
  };

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        setLoading(true);
        const res = await fetch(`/api/v2/transactions/${hash}`, { cache: 'no-store' });
        if (res.status === 429) return;
        const data = await res.json();
        if (!cancelled) setTx(data);
      } catch {
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    load();
    return () => { cancelled = true; };
  }, [hash]);

  // Reset tab payloads when hash changes
  useEffect(() => {
    setLogs(null);
    setTransfers(null);
    setLogOpen({});
  }, [hash]);

  // Lazy-load Logs / Token Transfers only when the tab is opened
  useEffect(() => {
    let cancelled = false;
    const loadLogs = async () => {
      try {
        setLogsLoading(true);
        const res = await fetch(`/api/v2/transactions/${hash}/logs`, { cache: 'no-store' });
        if (res.status === 429) return;
        const j = await res.json();
        if (!cancelled) setLogs(j?.items || []);
      } catch {}
      finally { if (!cancelled) setLogsLoading(false); }
    };
    const loadTransfers = async () => {
      try {
        setTransfersLoading(true);
        const res = await fetch(`/api/v2/transactions/${hash}/token-transfers`, { cache: 'no-store' });
        if (res.status === 429) return;
        const j = await res.json();
        if (!cancelled) setTransfers(j?.items || []);
      } catch {}
      finally { if (!cancelled) setTransfersLoading(false); }
    };

    if (tab === 'logs' && logs == null && !logsLoading) loadLogs();
    if (tab === 'transfers' && transfers == null && !transfersLoading) loadTransfers();

    return () => { cancelled = true; };
  }, [tab, hash]);


  const copy = async (label: string, value: string) => {
    const ok = await copyToClipboard(value);
    if (ok) {
      setCopyToast(`Copied ${label}: ${value}`);
      setTimeout(() => setCopyToast(null), 1400);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pb-20 pt-8 relative z-10"
    >
      <AnimatePresence>
        {copyToast ? (
          <motion.div
            key="copytoast-tx"
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

      <button
        onClick={onBack}
        className="text-cyan-400 hover:text-cyan-300 flex items-center gap-2 font-mono text-sm mb-8 group transition-colors cursor-pointer"
      >
        <ChevronLeft className="w-4 h-4 group-hover:-translate-x-1 transition-transform" />
        BACK TO STREAM
      </button>

      <div className="mb-6 flex items-center gap-4">
        <div className="p-4 bg-cyan-500/10 rounded-xl border border-cyan-500/30 shadow-[0_0_20px_rgba(0,240,255,0.2)] relative overflow-hidden">
          <motion.div
            className="absolute inset-0"
            animate={{ opacity: [0.05, 0.16, 0.05] }}
            transition={{ duration: 1.2, repeat: Infinity, ease: 'easeInOut' }}
            style={{ background: 'radial-gradient(circle at 30% 30%, rgba(0,240,255,0.18), transparent 60%)' }}
          />
          <Activity className="w-8 h-8 text-cyan-400 relative" />
        </div>
        <div className="min-w-0">
          <h1 className="text-3xl md:text-4xl font-black tracking-widest">
            TRANSACTION <span className="glow-text-cyan text-cyan-400">DETAILS</span>
          </h1>
          <div className="mt-2 flex items-center gap-3">
            <div className={`text-xs font-mono px-2 py-1 rounded border ${tx?.status === 'ok' ? 'text-emerald-300 bg-emerald-500/10 border-emerald-500/20' : 'text-rose-300 bg-rose-500/10 border-rose-500/20'}`}>
              {tx?.status ?? (loading ? 'loading' : '--')}
            </div>
            <div className="text-xs font-mono text-gold-500/50">{tx?.confirmations != null ? `${tx.confirmations} confirmations` : ''}</div>
          </div>
        </div>
      </div>

      <div className="mb-8 flex flex-wrap gap-2">
        {[
          { k: 'overview', label: 'OVERVIEW' },
          { k: 'logs', label: 'LOGS' },
          { k: 'transfers', label: 'TOKEN TRANSFERS' },
        ].map((t) => (
          <button
            key={t.k}
            onClick={() => setTab(t.k as any)}
            className={`relative px-4 py-2 rounded-lg border font-mono text-xs tracking-widest transition-colors ${tab === t.k ? 'text-cyan-200 border-cyan-500/50 bg-cyan-500/10' : 'text-gold-500/60 border-gold-500/15 hover:border-cyan-500/30 hover:text-cyan-300'}`}
          >
            {tab === t.k && (
              <motion.span
                layoutId="tx-tab"
                className="absolute inset-0 rounded-lg border border-cyan-400/30"
                initial={false}
                transition={{ type: 'spring', stiffness: 240, damping: 26 }}
              />
            )}
            <span className="relative">{t.label}</span>
          </button>
        ))}
      </div>

      {tab === 'overview' ? (
        <>
      <div className="glow-box-cyan bg-dark-800/80 backdrop-blur-xl p-6 md:p-8 rounded-2xl border-t-4 border-t-cyan-500 mb-10 relative overflow-hidden">
        <motion.div
          className="absolute -right-24 -top-24 w-64 h-64 rounded-full"
          animate={{ opacity: [0.15, 0.3, 0.15], scale: [1, 1.05, 1] }}
          transition={{ duration: 2.2, repeat: Infinity, ease: 'easeInOut' }}
          style={{ background: 'radial-gradient(circle, rgba(0,240,255,0.18), transparent 60%)' }}
        />

        <div className="relative z-10">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-lg font-bold tracking-widest flex items-center gap-2 text-cyan-400">
              <Info className="w-5 h-5" /> OVERVIEW
            </h2>
            <button
              onClick={() => copy('HASH', tx?.hash || hash)}
              className="text-xs font-mono text-cyan-300 hover:text-cyan-200 border border-cyan-500/30 hover:border-cyan-400 px-3 py-1.5 rounded transition-colors"
            >
              COPY HASH
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-x-12 gap-y-6">
            <DetailRow label="HASH" value={tx?.hash || hash} isCyan />
            <DetailRow label="RESULT" value={tx?.result || '--'} />
            <DetailRow label="BLOCK" value={tx?.block ? `#${tx.block}` : '--'} isCyan />
            <DetailRow label="POSITION" value={tx?.position ?? '--'} />
            <DetailRow label="FROM" value={tx?.from?.hash || '--'} isCyan onCopy={() => tx?.from?.hash && copy('FROM', tx.from.hash)} />
            <DetailRow label="TO" value={tx?.to?.hash || '--'} onCopy={() => tx?.to?.hash && copy('TO', tx.to.hash)} />
            <DetailRow label="VALUE" value={`${fmtTDCAI(tx?.value)} tDCAI`} isCyan />
            <DetailRow label="FEE (wei)" value={tx?.fee?.value ?? tx?.fee ?? '--'} />
            <DetailRow label="GAS USED" value={tx?.gas_used ?? '--'} />
            <DetailRow label="GAS PRICE" value={tx?.gas_price ?? tx?.max_fee_per_gas ?? '--'} />
            <DetailRow label="NONCE" value={tx?.nonce ?? '--'} />
            <DetailRow label="METHOD" value={tx?.method ?? tx?.decoded_input?.method_call ?? '--'} />
          </div>
        </div>
      </div>


      <div className="glow-box bg-dark-800/60 backdrop-blur-md rounded-2xl p-6 border-t-2 border-t-gold-500/30 mb-10 overflow-hidden relative">
        <div className="flex items-center justify-between gap-4">
          <h2 className="text-xl font-bold tracking-widest flex items-center gap-2">
            <Database className="w-5 h-5 text-gold-500" /> INPUT DATA
          </h2>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowInput((v) => !v)}
              className="text-xs font-mono text-cyan-300 hover:text-cyan-200 border border-cyan-500/25 hover:border-cyan-400 px-3 py-1.5 rounded transition-colors"
            >
              {showInput ? 'COLLAPSE' : 'EXPAND'}
            </button>
            <button
              onClick={() => copy('INPUT', String(tx?.raw_input ?? ''))}
              className="text-xs font-mono text-gold-500/80 hover:text-cyan-300 border border-gold-500/20 hover:border-cyan-500/40 px-3 py-1.5 rounded transition-colors"
            >
              COPY
            </button>
          </div>
        </div>

        <div className="mt-3 text-[11px] font-mono text-gold-500/60">
          {tx?.decoded_input?.method_call ? (<>Decoded: <span className="text-cyan-300">{tx.decoded_input.method_call}</span></>) : (<>Decoded: <span className="text-gold-500/40">(pending)</span></>)}
        </div>

        <AnimatePresence initial={false}>
          {showInput ? (
            <motion.div
              key="input-expanded"
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.28, ease: 'easeInOut' }}
              className="mt-4 relative"
            >
              <div className="relative rounded-lg border border-cyan-500/20 bg-dark-900/60 p-4 overflow-hidden">
                <motion.div
                  className="absolute left-0 top-0 w-full h-[2px] bg-gradient-to-r from-transparent via-cyan-400 to-transparent"
                  animate={{ x: ['-100%', '200%'] }}
                  transition={{ duration: 1.6, repeat: Infinity, ease: 'linear' }}
                />
                <div className="text-[10px] font-mono text-gold-500/40 mb-2">RAW INPUT</div>
                <div className="text-[11px] font-mono text-cyan-200/90 break-all whitespace-pre-wrap">{String(tx?.raw_input ?? '--')}</div>
              </div>

              <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="rounded-lg border border-gold-500/15 bg-dark-900/40 p-4">
                  <div className="text-[10px] font-mono text-gold-500/40 mb-2">DECODED</div>
                  {tx?.decoded_input?.parameters?.length ? (
                    <div>
                      <div className="text-xs font-mono text-cyan-300 mb-3">{tx?.decoded_input?.method_call || 'decoded'} </div>
                      <div className="overflow-x-auto">
                        <table className="w-full text-[11px] font-mono">
                          <thead>
                            <tr className="text-gold-500/50">
                              <th className="text-left py-1 pr-4">NAME</th>
                              <th className="text-left py-1 pr-4">TYPE</th>
                              <th className="text-left py-1">VALUE</th>
                            </tr>
                          </thead>
                          <tbody>
                            {tx.decoded_input.parameters.map((p: any, i: number) => (
                              <motion.tr
                                key={i}
                                initial={{ opacity: 0, y: 6 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ delay: i * 0.03 }}
                                className="border-t border-gold-500/10"
                              >
                                <td className="py-2 pr-4 text-gold-500/70">{p.name || `arg${i}`}</td>
                                <td className="py-2 pr-4 text-gold-500/50">{p.type || '--'}</td>
                                <td className="py-2 text-cyan-200/90 break-all">{String(p.value ?? p.hex ?? p)}</td>
                              </motion.tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {[0,1,2].map((i) => (
                        <motion.div
                          key={i}
                          className="h-3 rounded bg-gold-500/10"
                          animate={{ opacity: [0.35, 0.8, 0.35] }}
                          transition={{ duration: 1.2, repeat: Infinity, ease: 'easeInOut', delay: i * 0.1 }}
                        />
                      ))}
                      <div className="text-[10px] font-mono text-gold-500/40">decoded pending / unavailable</div>
                    </div>
                  )}
                </div>
                <div className="rounded-lg border border-gold-500/15 bg-dark-900/40 p-4">
                  <div className="text-[10px] font-mono text-gold-500/40 mb-2">INTERACTIONS</div>
                  <div className="text-xs font-mono text-gold-500/60">Click-to-copy, scanline, decode queue…</div>
                </div>
              </div>
            </motion.div>
          ) : (
            <motion.div
              key="input-collapsed"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="mt-4 text-[11px] font-mono text-gold-500/60 truncate"
            >
              {String(tx?.raw_input ?? '--')}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
      <div className="glow-box bg-dark-800/50 backdrop-blur-md rounded-2xl p-6 border-t-2 border-t-gold-500/30">
        <h2 className="text-xl font-bold tracking-widest flex items-center gap-2 mb-4">
          <Hash className="w-5 h-5 text-gold-500" /> QUICK ACTIONS
        </h2>
        <div className="flex flex-wrap gap-3">
          <button onClick={() => copy('HASH', tx?.hash || hash)} className="text-xs font-mono text-gold-500/80 hover:text-cyan-300 border border-gold-500/20 hover:border-cyan-500/40 px-4 py-2 rounded transition-colors">
            COPY HASH
          </button>
          <button onClick={() => tx?.from?.hash && copy('FROM', tx.from.hash)} className="text-xs font-mono text-gold-500/80 hover:text-cyan-300 border border-gold-500/20 hover:border-cyan-500/40 px-4 py-2 rounded transition-colors">
            COPY FROM
          </button>
          <button onClick={() => tx?.to?.hash && copy('TO', tx.to.hash)} className="text-xs font-mono text-gold-500/80 hover:text-cyan-300 border border-gold-500/20 hover:border-cyan-500/40 px-4 py-2 rounded transition-colors">
            COPY TO
          </button>
          <button onClick={() => tx?.from?.hash && onViewAddress(String(tx.from.hash))} className="text-xs font-mono text-gold-500/80 hover:text-cyan-300 border border-gold-500/20 hover:border-cyan-500/40 px-4 py-2 rounded transition-colors">
            VIEW FROM
          </button>
          <button onClick={() => tx?.to?.hash && onViewAddress(String(tx.to.hash))} className="text-xs font-mono text-gold-500/80 hover:text-cyan-300 border border-gold-500/20 hover:border-cyan-500/40 px-4 py-2 rounded transition-colors">
            VIEW TO
          </button>
        </div>

      </div>
        </>
      ) : tab === 'logs' ? (
        <div className="glow-box bg-dark-800/60 backdrop-blur-md rounded-2xl p-6 border-t-2 border-t-cyan-500/30">
          <h2 className="text-xl font-bold tracking-widest flex items-center gap-2 mb-4">
            <Database className="w-5 h-5 text-cyan-400" /> LOGS
          </h2>
          <div className="text-xs font-mono text-gold-500/60">
            {logsLoading ? 'Loading logs…' : (logs && logs.length ? `${logs.length} log(s) found` : 'No logs')}
          </div>

          <div className="mt-4 space-y-3">
            {(logsLoading ? [0,1,2] : (logs || [])).map((lg: any, i: any) => (
              <motion.div
                key={logsLoading ? `sk-${i}` : String(lg?.index ?? i)}
                layout
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.18 }}
                className="rounded-xl border border-cyan-500/15 bg-dark-900/40 overflow-hidden"
              >
                <button
                  onClick={() => {
                    if (logsLoading) return;
                    const k = String(lg?.index ?? i);
                    setLogOpen((m) => ({ ...m, [k]: !m[k] }));
                  }}
                  className="w-full text-left p-4 flex items-start justify-between gap-4 hover:bg-cyan-500/5 transition-colors"
                >
                  <div className="min-w-0">
                    <div className="text-[10px] font-mono text-gold-500/40">LOG #{logsLoading ? '--' : (lg?.index ?? i)}</div>
                    <button
                      onClick={() => {
                        if (logsLoading) return;
                        const a = (lg?.address?.hash || lg?.address || '');
                        if (a) onViewAddress(String(a));
                      }}
                      className="mt-1 text-left text-xs font-mono text-cyan-300 hover:text-cyan-200 break-all underline decoration-cyan-500/30 hover:decoration-cyan-400/60"
                    >
                      {logsLoading ? 'loading…' : (lg?.address?.hash || lg?.address || '--')}
                    </button>
                    <div className="mt-1 text-[10px] font-mono text-gold-500/50">
                      {eventName((lg?.topics || [])[0])} · topics {(lg?.topics || []).filter(Boolean).length} · block {lg?.block_number ?? '--'}
                    </div>
                  </div>
                  <div className="shrink-0 text-[10px] font-mono text-cyan-300 border border-cyan-500/20 px-2 py-1 rounded">
                    {logsLoading ? '…' : (logOpen[String(lg?.index ?? i)] ? 'COLLAPSE' : 'EXPAND')}
                  </div>
                </button>

                <AnimatePresence initial={false}>
                  {!logsLoading && logOpen[String(lg?.index ?? i)] ? (
                    <motion.div
                      key="open"
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.22, ease: 'easeInOut' }}
                      className="px-4 pb-4"
                    >
                      <div className="rounded-lg border border-gold-500/15 bg-dark-900/50 p-4 relative overflow-hidden">
                        <motion.div
                          className="absolute left-0 top-0 w-full h-[2px] bg-gradient-to-r from-transparent via-cyan-400 to-transparent"
                          animate={{ x: ['-100%', '200%'] }}
                          transition={{ duration: 1.6, repeat: Infinity, ease: 'linear' }}
                        />
                        <div className="text-[10px] font-mono text-gold-500/40 mb-2">EVENT</div>
                        <div className="text-xs font-mono text-cyan-300 mb-3">{eventName((lg?.topics || [])[0])}</div>
                        <div className="text-[10px] font-mono text-gold-500/40 mb-2">TOPICS</div>
                        <div className="space-y-2">
                          {(lg?.topics || []).filter(Boolean).map((t: string, j: number) => (
                            <div key={j} className="flex items-center justify-between gap-3">
                              <div className="text-[11px] font-mono text-cyan-200/90 break-all">{t}</div>
                              <button onClick={() => copy(`TOPIC${j}`, t)} className="text-[10px] font-mono text-cyan-300 border border-cyan-500/20 px-2 py-1 rounded hover:border-cyan-400/50">COPY</button>
                            </div>
                          ))}
                        </div>

                        <div className="mt-4 text-[10px] font-mono text-gold-500/40 mb-2">DATA</div>
                        <div className="text-[11px] font-mono text-gold-500/80 break-all">{lg?.data || '--'}</div>
                        <div className="mt-3 flex gap-2">
                          <button onClick={() => copy('LOG_DATA', String(lg?.data || ''))} className="text-[10px] font-mono text-gold-500/80 border border-gold-500/20 px-2 py-1 rounded hover:border-cyan-500/40">COPY DATA</button>
                          <button onClick={() => copy('LOG_ADDRESS', String(lg?.address?.hash || ''))} className="text-[10px] font-mono text-gold-500/80 border border-gold-500/20 px-2 py-1 rounded hover:border-cyan-500/40">COPY ADDRESS</button>
                        </div>
                      </div>
                    </motion.div>
                  ) : null}
                </AnimatePresence>
              </motion.div>
            ))}
          </div>
        </div>
      ) : (
        <div className="glow-box bg-dark-800/60 backdrop-blur-md rounded-2xl p-6 border-t-2 border-t-gold-500/30">
          <h2 className="text-xl font-bold tracking-widest flex items-center gap-2 mb-4">
            <ArrowRightLeft className="w-5 h-5 text-gold-500" /> TOKEN TRANSFERS
          </h2>
          <div className="text-xs font-mono text-gold-500/60">
            {transfersLoading ? 'Loading token transfers…' : (transfers && transfers.length ? `${transfers.length} transfer(s) found` : 'No token transfers')}
          </div>

          <div className="mt-4 space-y-3">
            {(transfersLoading ? [0,1,2] : (transfers || [])).map((tr: any, i: any) => {
              if (transfersLoading) {
                return (
                  <div key={`sk-${i}`} className="rounded-xl border border-gold-500/15 bg-dark-900/40 p-4">
                    <div className="h-3 w-48 rounded bg-gold-500/10 mb-2" />
                    <div className="h-3 w-full rounded bg-cyan-500/10" />
                  </div>
                );
              }

              // Best-effort field mapping (Blockscout varies by version)
              const from = tr?.from?.hash || tr?.from || '--';
              const to = tr?.to?.hash || tr?.to || '--';
              const token = tr?.token?.symbol || tr?.token?.name || tr?.token?.address || tr?.token?.hash || '--';
              const amount = tr?.total?.value || tr?.value || tr?.amount || '--';
              const direction = (String(from).toLowerCase() === String(tx?.from?.hash || '').toLowerCase()) ? 'OUT' : 'IN';

              return (
                <motion.div
                  key={String(tr?.log_index ?? tr?.tx_hash ?? i)}
                  layout
                  initial={{ opacity: 0, x: -16 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ duration: 0.18 }}
                  className="rounded-xl border border-gold-500/15 bg-dark-900/40 p-4 overflow-hidden relative"
                >
                  <motion.div
                    className="absolute inset-y-0 left-0 w-1"
                    animate={{ opacity: [0.25, 0.8, 0.25] }}
                    transition={{ duration: 1.4, repeat: Infinity, ease: 'easeInOut' }}
                    style={{ background: direction === 'OUT' ? 'linear-gradient(#FFD700, rgba(255,215,0,0))' : 'linear-gradient(#00F0FF, rgba(0,240,255,0))' }}
                  />

                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0">
                      <div className="text-[10px] font-mono text-gold-500/40">{direction} · {token}</div>
                      <div className="mt-1 text-sm font-mono text-cyan-200/90">{String(amount)}</div>
                      <div className="mt-2 text-[11px] font-mono text-gold-500/70">
                        <span className="text-gold-500/40">from</span> {String(from).slice(0, 10)}…{String(from).slice(-6)}
                      </div>
                      <div className="text-[11px] font-mono text-gold-500/70">
                        <span className="text-gold-500/40">to</span> {String(to).slice(0, 10)}…{String(to).slice(-6)}
                      </div>
                    </div>

                    <div className="shrink-0 flex flex-col gap-2">
                      <button onClick={() => copy('TRANSFER_FROM', String(from))} className="text-[10px] font-mono text-cyan-300 border border-cyan-500/20 px-2 py-1 rounded hover:border-cyan-400/50">COPY FROM</button>
                      <button onClick={() => copy('TRANSFER_TO', String(to))} className="text-[10px] font-mono text-cyan-300 border border-cyan-500/20 px-2 py-1 rounded hover:border-cyan-400/50">COPY TO</button>
                    </div>
                  </div>
                </motion.div>
              );
            })}
          </div>
        </div>
      )}

    </motion.div>
  );
};


const AddressView = ({ address, onBack, onViewTx, onViewAddress }: { address: string, onBack: () => void, onViewTx: (h: string) => void, onViewAddress: (a: string) => void }) => {
  const [info, setInfo] = useState<any>(null);
  const [tab, setTab] = useState<'overview' | 'contract' | 'txs' | 'tokens'>('overview');
  const [copyToast, setCopyToast] = useState<string | null>(null);
  const [addrTxs, setAddrTxs] = useState<any[] | null>(null);
  const [addrTxsLoading, setAddrTxsLoading] = useState<boolean>(false);

  const [contract, setContract] = useState<any>(null);
  const [contractLoading, setContractLoading] = useState<boolean>(false);

  const fmtTDCAI = (weiLike: any, dp = 6) => {
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

  useEffect(() => {
    // reset per-address caches
    setAddrTxs(null);
    setContract(null);
    setTab('overview');
  }, [address]);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const res = await fetch(`/api/v2/addresses/${address}`, { cache: 'no-store' });
        if (res.status === 429) return;
        const j = await res.json();
        if (!cancelled) setInfo(j);
      } catch {}
    };
    load();
    return () => { cancelled = true; };
  }, [address]);

  useEffect(() => {
    let cancelled = false;
    const loadAddrTxs = async () => {
      try {
        setAddrTxsLoading(true);
        const res = await fetch(`/api/v2/addresses/${address}/transactions?limit=25`, { cache: 'no-store' });
        if (res.status === 429) return;
        const j = await res.json();
        if (!cancelled) setAddrTxs(j?.items || []);
      } catch {}
      finally { if (!cancelled) setAddrTxsLoading(false); }
    };
    if (tab === 'txs' && addrTxs == null && !addrTxsLoading) loadAddrTxs();
    return () => { cancelled = true; };
  }, [tab, address]);

  useEffect(() => {
    let cancelled = false;
    const loadContract = async () => {
      try {
        setContractLoading(true);
        const res = await fetch(`/api/v2/smart-contracts/${address}`, { cache: 'no-store' });
        if (res.status === 404) { if (!cancelled) setContract(null); return; }
        if (res.status === 429) return;
        const j = await res.json();
        if (!cancelled) setContract(j);
      } catch {}
      finally { if (!cancelled) setContractLoading(false); }
    };
    if (tab === 'contract' && info?.is_contract && contract == null && !contractLoading) loadContract();
    return () => { cancelled = true; };
  }, [tab, address, info?.is_contract]);

  const copy = async (label: string, value: string) => {
    const ok = await copyToClipboard(value);
    if (ok) {
      setCopyToast(`Copied ${label}: ${value}`);
      setTimeout(() => setCopyToast(null), 1400);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pb-20 pt-8 relative z-10"
    >
      <AnimatePresence>
        {copyToast ? (
          <motion.div
            key="copytoast-addr"
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

      <button
        onClick={onBack}
        className="text-cyan-400 hover:text-cyan-300 flex items-center gap-2 font-mono text-sm mb-8 group transition-colors cursor-pointer"
      >
        <ChevronLeft className="w-4 h-4 group-hover:-translate-x-1 transition-transform" />
        BACK
      </button>

      <div className="mb-6 flex items-center gap-4">
        <div className="p-4 bg-gold-500/10 rounded-xl border border-gold-500/20 shadow-[0_0_20px_rgba(255,215,0,0.12)]">
          <Globe className="w-8 h-8 text-gold-400" />
        </div>
        <div className="min-w-0">
          <h1 className="text-3xl md:text-4xl font-black tracking-widest">
            ADDRESS <span className="glow-text text-gold-500">VIEW</span>
          </h1>
          <div className="mt-2 flex items-center gap-3">
            <div className="text-xs font-mono text-cyan-200/90 break-all">{info?.hash || address}</div>
            <button onClick={() => copy('ADDRESS', info?.hash || address)} className="text-[10px] font-mono text-cyan-300 border border-cyan-500/20 px-2 py-1 rounded hover:border-cyan-400/50">
              COPY
            </button>
          </div>
        </div>
      </div>

      <div className="mb-8 flex flex-wrap gap-2">
        {([
          { k: 'overview', label: 'OVERVIEW' },
          ...(info?.is_contract ? [{ k: 'contract', label: 'CONTRACT' }] : []),
          { k: 'txs', label: 'TXS' },
          { k: 'tokens', label: 'TOKENS' },
        ] as any[]).map((t: any) => (
          <button
            key={t.k}
            onClick={() => setTab(t.k)}
            className={`relative px-4 py-2 rounded-lg border font-mono text-xs tracking-widest transition-colors ${tab === t.k ? 'text-cyan-200 border-cyan-500/50 bg-cyan-500/10' : 'text-gold-500/60 border-gold-500/15 hover:border-cyan-500/30 hover:text-cyan-300'}`}
          >
            {tab === t.k && (
              <motion.span
                layoutId="addr-tab"
                className="absolute inset-0 rounded-lg border border-cyan-400/30"
                initial={false}
                transition={{ type: 'spring', stiffness: 240, damping: 26 }}
              />
            )}
            <span className="relative">{t.label}</span>
          </button>
        ))}
      </div>

      {tab === 'overview' ? (
        <div className="glow-box bg-dark-800/60 backdrop-blur-md rounded-2xl p-6 border-t-2 border-t-gold-500/30">
          <h2 className="text-xl font-bold tracking-widest flex items-center gap-2 mb-4">
            <Info className="w-5 h-5 text-gold-500" /> OVERVIEW
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-x-12 gap-y-6">
            <DetailRow label="ADDRESS" value={info?.hash || address} isCyan />
            <DetailRow label="COIN BALANCE" value={`${fmtTDCAI(info?.coin_balance)} tDCAI`} />
            <DetailRow label="UPDATED AT BLOCK" value={info?.block_number_balance_updated_at ?? '--'} />
            <DetailRow label="IS CONTRACT" value={String(info?.is_contract ?? '--')} />
          </div>
        </div>
      ) : tab === 'contract' ? (
        <div className="glow-box bg-dark-800/60 backdrop-blur-md rounded-2xl p-6 border-t-2 border-t-gold-500/30">
          <h2 className="text-xl font-bold tracking-widest flex items-center gap-2 mb-4">
            <Code2 className="w-5 h-5 text-gold-500" /> CONTRACT
          </h2>

          {!info?.is_contract ? (
            <div className="text-xs font-mono text-gold-500/60">Not a contract.</div>
          ) : (
            <>
              <div className="text-xs font-mono text-gold-500/60 flex flex-wrap items-center gap-3">
                <span>Status: <span className={info?.is_verified ? 'text-cyan-300' : 'text-gold-400'}>{info?.is_verified ? 'Verified' : 'Unverified'}</span></span>
                <button
                  onClick={() => { try { window.open(`http://139.180.140.143/address/${address}?tab=contract`, '_blank'); } catch {} }}
                  className="text-[10px] font-mono text-cyan-300 border border-cyan-500/20 px-2 py-1 rounded hover:border-cyan-400/50"
                >
                  Verify / Publish (Blockscout)
                </button>
              </div>

              <div className="mt-6 grid grid-cols-1 md:grid-cols-2 gap-x-12 gap-y-6">
                <div className="flex flex-col gap-2 border-b border-gold-500/10 pb-4">
                  <span className="text-xs font-mono text-gold-500/50">CREATOR</span>
                  <div className="flex items-start justify-between gap-3">
                    {info?.creator_address_hash ? (
                      <button
                        onClick={() => onViewAddress(String(info.creator_address_hash))}
                        className="text-left text-sm font-mono break-all text-cyan-300 hover:text-cyan-200 underline decoration-cyan-500/30 hover:decoration-cyan-400/60"
                      >
                        {String(info.creator_address_hash)}
                      </button>
                    ) : (
                      <div className="text-sm font-mono break-all text-gold-400">--</div>
                    )}
                    {info?.creator_address_hash ? (
                      <button
                        onClick={() => copy('CREATOR', String(info.creator_address_hash))}
                        className="shrink-0 w-6 h-6 inline-flex items-center justify-center text-[11px] font-mono text-cyan-300 border border-cyan-500/25 hover:border-cyan-400 rounded transition-colors"
                      >
                        ⧉
                      </button>
                    ) : null}
                  </div>
                </div>
                <div className="flex flex-col gap-2 border-b border-gold-500/10 pb-4">
                  <span className="text-xs font-mono text-gold-500/50">CREATION TX</span>
                  <div className="flex items-start justify-between gap-3">
                    {info?.creation_transaction_hash ? (
                      <button
                        onClick={() => onViewTx(String(info.creation_transaction_hash))}
                        className="text-left text-sm font-mono break-all text-cyan-300 hover:text-cyan-200 underline decoration-cyan-500/30 hover:decoration-cyan-400/60"
                      >
                        {String(info.creation_transaction_hash)}
                      </button>
                    ) : (
                      <div className="text-sm font-mono break-all text-gold-400">--</div>
                    )}
                    {info?.creation_transaction_hash ? (
                      <button
                        onClick={() => copy('CREATION_TX', String(info.creation_transaction_hash))}
                        className="shrink-0 w-6 h-6 inline-flex items-center justify-center text-[11px] font-mono text-cyan-300 border border-cyan-500/25 hover:border-cyan-400 rounded transition-colors"
                      >
                        ⧉
                      </button>
                    ) : null}
                  </div>
                </div>
              </div>

              <div className="mt-8">
                <div className="flex items-center justify-between gap-3">
                  <div className="text-xs font-mono text-gold-500/60 tracking-widest">CONTRACT CREATION CODE</div>
                  {contract?.creation_bytecode ? (
                    <button onClick={() => copy('CREATION_CODE', String(contract.creation_bytecode))} className="shrink-0 w-7 h-7 inline-flex items-center justify-center text-[11px] font-mono text-cyan-300 border border-cyan-500/25 hover:border-cyan-400 rounded transition-colors">⧉</button>
                  ) : null}
                </div>
                <div className="mt-2 rounded-xl border border-gold-500/15 bg-dark-900/40 p-4">
                  <pre className="whitespace-pre-wrap break-all text-[11px] leading-relaxed font-mono text-cyan-200/90 max-h-64 overflow-auto">
                    {contractLoading ? 'Loading…' : (contract?.creation_bytecode || '—')}
                  </pre>
                </div>
              </div>

              <div className="mt-8">
                <div className="flex items-center justify-between gap-3">
                  <div className="text-xs font-mono text-gold-500/60 tracking-widest">DEPLOYED BYTECODE</div>
                  {contract?.deployed_bytecode ? (
                    <button onClick={() => copy('DEPLOYED_BYTECODE', String(contract.deployed_bytecode))} className="shrink-0 w-7 h-7 inline-flex items-center justify-center text-[11px] font-mono text-cyan-300 border border-cyan-500/25 hover:border-cyan-400 rounded transition-colors">⧉</button>
                  ) : null}
                </div>
                <div className="mt-2 rounded-xl border border-gold-500/15 bg-dark-900/40 p-4">
                  <pre className="whitespace-pre-wrap break-all text-[11px] leading-relaxed font-mono text-cyan-200/90 max-h-64 overflow-auto">
                    {contractLoading ? 'Loading…' : (contract?.deployed_bytecode || '—')}
                  </pre>
                </div>
              </div>

              <div className="mt-8 text-[11px] font-mono text-gold-500/50">
                Tip: these fields come from Blockscout API v2 (<span className="text-cyan-300">:4000/api/v2</span>). If you want, I can also add ABI / Read / Write tabs once the contract is verified.
              </div>
            </>
          )}
        </div>
      ) : tab === 'txs' ? (
        <div className="glow-box bg-dark-800/60 backdrop-blur-md rounded-2xl p-6 border-t-2 border-t-cyan-500/30">
          <h2 className="text-xl font-bold tracking-widest flex items-center gap-2 mb-4">
            <ArrowRightLeft className="w-5 h-5 text-cyan-400" /> TRANSACTIONS
          </h2>
          <div className="text-xs font-mono text-gold-500/60">{addrTxsLoading ? 'Loading…' : (addrTxs && addrTxs.length ? `${addrTxs.length} tx(s)` : 'No transactions')}</div>
          <div className="mt-4 space-y-3">
            {(addrTxsLoading ? [0,1,2] : (addrTxs || [])).map((tx: any, i: any) => (
              <motion.div
                key={addrTxsLoading ? `sk-${i}` : tx.hash}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.18 }}
                className="rounded-xl border border-cyan-500/15 bg-dark-900/40 p-4"
              >
                {addrTxsLoading ? (
                  <div className="h-3 w-full rounded bg-gold-500/10" />
                ) : (
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0">
                      <button
                        onClick={() => onViewTx(tx.hash)}
                        className="text-left text-[11px] font-mono text-cyan-300 hover:text-cyan-200 break-all underline decoration-cyan-500/30 hover:decoration-cyan-400/60"
                      >
                        {tx.hash}
                      </button>
                      <div className="mt-1 text-[10px] font-mono text-gold-500/50">
                        status {tx.status ?? tx.result ?? '--'} · block {tx.block ?? '--'} · pos {tx.position ?? '--'}
                      </div>
                    </div>
                    <div className="shrink-0 text-right">
                      <div className="text-xs font-mono text-gold-500/90">
                        {fmtTDCAI(tx.value)} <span className="text-gold-500/60">tDCAI</span>
                      </div>
                      <div className="text-[10px] font-mono text-gold-500/35">{String(tx.value ?? '0')} wei</div>
                      <div className="mt-2 text-[10px] font-mono text-gold-500/60">fee {fmtTDCAI(tx.fee?.value ?? tx.fee ?? '0')} tDCAI</div>
                      <div className="text-[10px] font-mono text-gold-500/35">{String(tx.fee?.value ?? tx.fee ?? '0')} wei</div>
                      <div className="text-[10px] font-mono text-gold-500/50">conf {tx.confirmations ?? '--'}</div>
                    </div>
                  </div>
                )}
              </motion.div>
            ))}
          </div>
        </div>
      ) : (
        <div className="glow-box bg-dark-800/60 backdrop-blur-md rounded-2xl p-6 border-t-2 border-t-cyan-500/30">
          <h2 className="text-xl font-bold tracking-widest flex items-center gap-2 mb-4">
            <Database className="w-5 h-5 text-cyan-400" /> TOKENS
          </h2>
          <div className="text-xs font-mono text-gold-500/60">Skeleton ready. Next: fetch /api/v2/addresses/:hash/tokens</div>
        </div>
      )}
    </motion.div>
  );
};

export default function App() {
  const [currentView, setCurrentView] = useState<'home' | 'blocks' | 'txs' | 'block' | 'tx' | 'address'>('home');
  const [selectedBlock, setSelectedBlock] = useState<any>(null);
  const [selectedTxHash, setSelectedTxHash] = useState<string | null>(null);
  const [selectedAddress, setSelectedAddress] = useState<string | null>(null);

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
  
  const [blocks, setBlocks] = useState<ReturnType<typeof generateBlock>[]>([]);
  const [txs, setTxs] = useState<any[]>([]);
  const [expandedTx, setExpandedTx] = useState<string | null>(null);
  const [copyToast, setCopyToast] = useState<string | null>(null);
  const blockHeightRef = useRef(29402934);

  // INCOMING block countdown + new-block animation helpers
  const [avgBlockMs, setAvgBlockMs] = useState<number>(2000);
  const [incomingMs, setIncomingMs] = useState<number>(2000);
  const latestHeightRef = useRef<number | null>(null);
  const lastNewBlockAtRef = useRef<number>(Date.now());


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

  // Update the incoming-block countdown in real time
  useEffect(() => {
    const id = setInterval(() => {
      const elapsed = Date.now() - lastNewBlockAtRef.current;
      const ms = Math.max(0, avgBlockMs - (elapsed % avgBlockMs));
      setIncomingMs(ms);
    }, 100);
    return () => clearInterval(id);
  }, [avgBlockMs]);

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

        // Clique snapshot for real signer per block
        let recents: Record<string, string> = {};
        try {
          const snapRes = await fetch('/rpc1/', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'clique_getSnapshot', params: ['latest'] }),
          });
          const snap = await snapRes.json();
          recents = snap?.result?.recents || {};
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
          const signer = (recents[String(height)] || '').toLowerCase();
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

    const bInt = setInterval(fetchBlocks, 2000);
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
            key="blocks"
            onViewBlock={(h: number) => { setSelectedBlock({ height: h }); setCurrentView('block'); try { window.history.pushState({ view: 'block', height: h }, '', `/block/${h}`); } catch {} }}
          />
        ) : currentView === 'txs' ? (
          <TxsListView
            key="txs"
            onViewTx={(h: string) => { setSelectedTxHash(h); setCurrentView('tx'); try { window.history.pushState({ view: 'tx', hash: h }, '', `/tx/${h}`); } catch {} }}
            onViewAddress={(a: string) => handleViewAddress(a)}
          />
        ) : currentView === 'tx' ? (
          <TxView
            key="tx"
            hash={selectedTxHash || ''}
            onBack={() => setCurrentView('home')}
            onViewBlock={(h: number) => { setSelectedBlock({ height: h }); setCurrentView('block'); try { window.history.pushState({ view: 'block', height: h }, '', `/block/${h}`); } catch {} }}
            onViewAddress={(a: string) => handleViewAddress(a)}
          />
        ) : currentView === 'address' ? (
          <AddressView
            key="address"
            address={selectedAddress || ''}
            onBack={() => setCurrentView('home')}
            onViewTx={(h: string) => { setSelectedTxHash(h); setCurrentView('tx'); try { window.history.pushState({ view: 'tx', hash: h }, '', `/tx/${h}`); } catch {} }}
            onViewAddress={(a: string) => handleViewAddress(a)}
          />
        ) : (
          <BlockView 
            key="block" 
            block={selectedBlock} 
            onBack={() => setCurrentView('home')} 
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
