import { motion, AnimatePresence } from 'motion/react';
import { useState, useEffect, useRef } from 'react';
import { Search, Activity, Zap, Globe, Database, Hash, Clock, Box, ArrowRightLeft, Cpu, ChevronRight, ChevronLeft, CheckCircle2, Layers, Info, Code2, Menu, X, List } from 'lucide-react';

const Stats = () => {
  const [stats, setStats] = useState<any>(null);
  const [latestBlock, setLatestBlock] = useState<number | null>(null);
  const [headBlock, setHeadBlock] = useState<number | null>(null);
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

    const loadHead = async () => {
      try {
        // RPC head block (real-time). This is usually ahead of Blockscout "indexed" height.
        const res = await fetch('/rpc1/', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'eth_blockNumber', params: [] }),
          cache: 'no-store',
        });
        const j = await res.json();
        const hx = j?.result;
        if (typeof hx === 'string' && hx.startsWith('0x')) {
          const bn = parseInt(hx, 16);
          if (Number.isFinite(bn) && !cancelled) setHeadBlock(bn);
        }
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
    loadHead();
    loadLiveTxCounters();
    const t = setInterval(load, 30000);
    // Indexed height doesn't need to be ultra-fast (Blockscout can lag behind head anyway)
    const t2 = setInterval(loadLatest, 5000);
    const tHead = setInterval(loadHead, 1000);
    const t3 = setInterval(loadLiveTxCounters, 4000);
    return () => {
      cancelled = true;
      clearInterval(t);
      clearInterval(t2);
      clearInterval(tHead);
      clearInterval(t3);
    };
  }, [stats]);

  const avgBlockSec = stats?.average_block_time ? (Number(stats.average_block_time) / 1000) : null;
  const indexedLag = headBlock != null && latestBlock != null ? Math.max(0, headBlock - latestBlock) : null;

  const cards = [
    {
      label: 'LATEST BLOCK (HEAD)',
      value: headBlock != null ? `#${headBlock}` : (latestBlock != null ? `#${latestBlock}` : (stats?.total_blocks ? `#${stats.total_blocks}` : '--')),
      sub:
        (avgBlockSec != null ? `${avgBlockSec.toFixed(2)}s avg` : 'avg --') +
        ' · indexed ' +
        (latestBlock != null ? `#${latestBlock}` : '--') +
        (indexedLag != null ? ` · lag ${indexedLag}` : ''),
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

export default Stats;
