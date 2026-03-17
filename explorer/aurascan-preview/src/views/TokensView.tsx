import { motion, AnimatePresence } from 'motion/react';
import { useState, useEffect, useRef } from 'react';
import { Search, Activity, Zap, Globe, Database, Hash, Clock, Box, ArrowRightLeft, Cpu, ChevronRight, ChevronLeft, CheckCircle2, Layers, Info, Code2, Menu, X, List } from 'lucide-react';

const TokensView = ({
  onViewToken,
  onViewAddress,
}: {
  onViewToken: (a: string) => void,
  onViewAddress: (a: string) => void,
}) => {
  const [featured, setFeatured] = useState<any[]>([]);
  const [featuredLoading, setFeaturedLoading] = useState(true);
  const [items, setItems] = useState<any[] | null>(null);
  const [loading, setLoading] = useState(false);

  const short = (s: string, a = 10, b = 6) => (s && s.length > a + b ? `${s.slice(0, a)}…${s.slice(-b)}` : s);

  useEffect(() => {
    let cancelled = false;
    const loadFeatured = async () => {
      try {
        setFeaturedLoading(true);
        const res = await fetch('/featured-tokens.json', { cache: 'no-store' });
        const j = await res.json();
        const arr = Array.isArray(j?.featured) ? j.featured : [];
        if (!cancelled) setFeatured(arr);
      } catch {
        if (!cancelled) setFeatured([]);
      } finally {
        if (!cancelled) setFeaturedLoading(false);
      }
    };
    loadFeatured();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        setLoading(true);
        const res = await fetch('/api/v2/tokens?limit=25', { cache: 'no-store' });
        if (res.status === 429) return;
        const j = await res.json();
        if (!cancelled) setItems(j?.items || []);
      } catch {
        if (!cancelled) setItems([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    load();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pb-20 pt-8 relative z-10"
    >
      <div className="mb-6 flex items-center gap-4">
        <div className="p-4 bg-gold-500/10 rounded-xl border border-gold-500/20 shadow-[0_0_20px_rgba(255,215,0,0.10)]">
          <Database className="w-8 h-8 text-gold-400" />
        </div>
        <div className="min-w-0">
          <h1 className="text-3xl md:text-4xl font-black tracking-widest">TOKENS <span className="glow-text text-gold-500">LIST</span></h1>
          <div className="mt-2 text-xs font-mono text-gold-500/60">Official featured + all indexed tokens</div>
        </div>
      </div>

      <div className="mb-10 glow-box bg-dark-800/60 backdrop-blur-md rounded-2xl p-6 border-t-2 border-t-cyan-500/30">
        <div className="flex items-center justify-between gap-4">
          <h2 className="text-lg font-bold tracking-widest flex items-center gap-2 text-cyan-400">
            <CheckCircle2 className="w-5 h-5" /> FEATURED
          </h2>
          <div className="text-[10px] font-mono text-gold-500/50">edit /featured-tokens.json</div>
        </div>

        <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4">
          {featuredLoading ? (
            <div className="text-xs font-mono text-gold-500/60">Loading…</div>
          ) : featured.length ? (
            featured.map((t: any, i: number) => {
              const addr = String(t?.address || t?.hash || t?.contract || '').trim();
              const symbol = String(t?.symbol || '');
              const name = String(t?.name || '');
              const kind = String(t?.type || '');
              return (
                <div key={addr || i} className="rounded-xl border border-cyan-500/15 bg-dark-900/40 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-xs font-mono text-cyan-300">{symbol || name || 'Featured token'}</div>
                      <div className="mt-1 text-[10px] font-mono text-gold-500/50">{kind ? kind.toUpperCase() : '—'}</div>
                      {addr ? (
                        <button
                          onClick={() => onViewToken(addr)}
                          className="mt-2 text-left text-[11px] font-mono text-gold-500/70 hover:text-cyan-300 break-all underline decoration-gold-500/10 hover:decoration-cyan-400/60"
                        >
                          {addr}
                        </button>
                      ) : (
                        <div className="mt-2 text-[11px] font-mono text-rose-300">Missing address</div>
                      )}
                    </div>
                    {addr ? (
                      <button
                        onClick={() => onViewToken(addr)}
                        className="shrink-0 px-3 py-2 rounded-lg border border-cyan-500/20 text-cyan-300 text-xs font-mono hover:border-cyan-400/60"
                      >
                        VIEW
                      </button>
                    ) : null}
                  </div>
                </div>
              );
            })
          ) : (
            <div className="text-xs font-mono text-gold-500/60">
              No featured tokens configured yet. Put official token contracts into <span className="text-cyan-300">/featured-tokens.json</span>.
            </div>
          )}
        </div>
      </div>

      <div className="glow-box bg-dark-800/60 backdrop-blur-md rounded-2xl p-6 border-t-2 border-t-gold-500/30">
        <h2 className="text-lg font-bold tracking-widest flex items-center gap-2 text-gold-500">
          <Database className="w-5 h-5" /> ALL TOKENS
        </h2>
        <div className="mt-2 text-xs font-mono text-gold-500/60">{loading ? 'Loading…' : (items ? `${items.length} token(s)` : '—')}</div>

        <div className="mt-6 space-y-3">
          {(items || []).map((t: any, i: number) => {
            const addr = String(t?.address || t?.hash || t?.contract_address || t?.contractAddress || '').trim();
            const sym = String(t?.symbol || t?.token_symbol || '').trim();
            const nm = String(t?.name || t?.token_name || '').trim();
            const holders = t?.holders_count ?? t?.holders ?? null;
            const transfers = t?.transfers_count ?? t?.transfers ?? null;

            return (
              <div key={addr || i} className="rounded-xl border border-gold-500/15 bg-dark-900/40 p-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <div className="text-sm font-mono text-cyan-200/90">
                      {(sym || nm) ? (<>{sym ? <span className="text-cyan-300">{sym}</span> : null}{sym && nm ? ' · ' : ''}{nm ? <span className="text-gold-500/80">{nm}</span> : null}</>) : 'Token'}
                    </div>
                    {addr ? (
                      <button
                        onClick={() => onViewToken(addr)}
                        className="mt-1 text-left text-[11px] font-mono text-gold-500/60 hover:text-cyan-300 break-all underline decoration-gold-500/10 hover:decoration-cyan-400/60"
                      >
                        {short(addr, 14, 10)}
                      </button>
                    ) : (
                      <div className="mt-1 text-[11px] font-mono text-gold-500/40">--</div>
                    )}
                    <div className="mt-1 text-[10px] font-mono text-gold-500/40">
                      holders {holders ?? '--'} · transfers {transfers ?? '--'}
                    </div>
                  </div>
                  {addr ? (
                    <button
                      onClick={() => onViewToken(addr)}
                      className="shrink-0 px-3 py-2 rounded-lg border border-gold-500/20 text-gold-500/80 text-xs font-mono hover:border-cyan-500/40 hover:text-cyan-300"
                    >
                      OPEN
                    </button>
                  ) : null}
                </div>
              </div>
            );
          })}

          {!loading && items && items.length === 0 ? (
            <div className="text-xs font-mono text-gold-500/60">
              No tokens indexed yet. Once developers deploy ERC-20/NFT contracts (and there are transfers/holders), Blockscout will start listing them here.
            </div>
          ) : null}
        </div>
      </div>
    </motion.div>
  );
};

export default TokensView;
