import { motion, AnimatePresence } from 'motion/react';
import { useState, useEffect, useRef } from 'react';
import { Search, Activity, Zap, Globe, Database, Hash, Clock, Box, ArrowRightLeft, Cpu, ChevronRight, ChevronLeft, CheckCircle2, Layers, Info, Code2, Menu, X, List } from 'lucide-react';

const TxsListView = ({ onViewTx, onViewAddress, onViewBlock }: { onViewTx: (h: string) => void, onViewAddress: (a: string) => void, onViewBlock: (h: number) => void }) => {
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
      // Prefer Blockscout decoded input (when contract is verified)
      const di = tx?.decoded_input;
      if (di) {
        const mc = (di as any)?.method_call || (di as any)?.method;
        if (mc && String(mc).trim()) return String(mc).trim();
        const mid = (di as any)?.method_id;
        if (mid && String(mid).trim()) return String(mid).trim();
      }

      // Some Blockscout instances also surface a top-level `method`
      if (tx?.method && String(tx.method).trim()) return String(tx.method).trim();

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
                    <span className="text-[10px] font-mono tracking-widest px-2 py-0.5 rounded border border-cyan-500/20 bg-cyan-500/10 text-cyan-300 max-w-[180px] truncate">
                      {methodLabel(tx)}
                    </span>
                    <button
                      onClick={() => onViewTx(String(tx.hash))}
                      className="text-left text-[11px] font-mono text-cyan-300 hover:text-cyan-200 underline decoration-cyan-500/30 hover:decoration-cyan-400/60 break-all"
                    >
                      {String(tx.hash)}
                    </button>
                  </div>

                  <div className="mt-1 text-[10px] font-mono text-gold-500/45 flex flex-wrap gap-x-2 gap-y-1 items-center">
                    <span>
                      <span className="text-gold-500/35">block</span>{' '}
                      {tx.block_number != null ? (
                        <button
                          onClick={() => onViewBlock(Number(tx.block_number))}
                          className="text-cyan-300 hover:text-cyan-200 underline decoration-cyan-500/30 hover:decoration-cyan-400/60"
                        >
                          #{String(tx.block_number)}
                        </button>
                      ) : (
                        <span className="text-gold-400">--</span>
                      )}
                    </span>
                    <span>· pos {tx.position ?? '--'}</span>
                    <span>· status {String(tx.status ?? tx.result ?? '--')}</span>
                    <span>· conf {tx.confirmations ?? '--'}</span>
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

                  <div className="mt-3 grid gap-3 tabular-nums">
                    <div>
                      <div className="text-[10px] font-mono tracking-widest text-gold-500/45">VALUE</div>
                      <div className="mt-1 text-sm font-mono text-cyan-200/90">
                        {(() => {
                          const p = fmtTDCAIParts(tx.value, 6);
                          return (
                            <span>
                              <span className="inline-block text-right w-[72px]">{p.i}</span>
                              <span className="text-cyan-200/40">.</span>
                              <span className="inline-block w-[52px]">{p.f}</span>
                              <span className="ml-1 text-cyan-200/50">tDCAI</span>
                            </span>
                          );
                        })()}
                      </div>
                      <div className="text-[10px] font-mono text-gold-500/35">{String(tx.value ?? '0')} wei</div>
                    </div>

                    <div>
                      <div className="text-[10px] font-mono tracking-widest text-gold-500/45">FEE</div>
                      <div className="mt-1 text-sm font-mono text-gold-500/90">
                        {(() => {
                          const p = fmtTDCAIParts(tx.fee?.value ?? tx.fee ?? '0', 6);
                          return (
                            <span>
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

export default TxsListView;
