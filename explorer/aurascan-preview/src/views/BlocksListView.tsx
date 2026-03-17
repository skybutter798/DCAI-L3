import { motion, AnimatePresence } from 'motion/react';
import { useState, useEffect, useRef } from 'react';
import { Search, Activity, Zap, Globe, Database, Hash, Clock, Box, ArrowRightLeft, Cpu, ChevronRight, ChevronLeft, CheckCircle2, Layers, Info, Code2, Menu, X, List } from 'lucide-react';

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

export default BlocksListView;
