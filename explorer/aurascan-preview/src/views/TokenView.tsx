import { motion, AnimatePresence } from 'motion/react';
import { useState, useEffect, useRef } from 'react';
import { Search, Activity, Zap, Globe, Database, Hash, Clock, Box, ArrowRightLeft, Cpu, ChevronRight, ChevronLeft, CheckCircle2, Layers, Info, Code2, Menu, X, List } from 'lucide-react';
import DetailRow from '../components/DetailRow';
import { shortHash, formatUnits } from '../lib/formatters';
import useTokenDetails from '../hooks/useTokenDetails';

const TokenView = ({
  address,
  onBack,
  onViewTx,
  onViewBlock,
  onViewAddress,
}: {
  address: string,
  onBack: () => void,
  onViewTx: (h: string) => void,
  onViewBlock: (h: number) => void,
  onViewAddress: (a: string) => void,
}) => {
  const { info, loading } = useTokenDetails(address);
  const [tab, setTab] = useState<'overview' | 'transfers' | 'holders'>('transfers');

  const [transfers, setTransfers] = useState<any[] | null>(null);
  const [transfersPageParams, setTransfersPageParams] = useState<any | null>(null);
  const [transfersNextParams, setTransfersNextParams] = useState<any | null>(null);
  const [transfersPrevStack, setTransfersPrevStack] = useState<any[]>([]);

  const [holders, setHolders] = useState<any[] | null>(null);
  const [holdersPageParams, setHoldersPageParams] = useState<any | null>(null);
  const [holdersNextParams, setHoldersNextParams] = useState<any | null>(null);
  const [holdersPrevStack, setHoldersPrevStack] = useState<any[]>([]);

  // Reset pagination caches when switching tokens
  useEffect(() => {
    setTransfers(null);
    setTransfersPageParams(null);
    setTransfersNextParams(null);
    setTransfersPrevStack([]);

    setHolders(null);
    setHoldersPageParams(null);
    setHoldersNextParams(null);
    setHoldersPrevStack([]);
  }, [address]);

  useEffect(() => {
    let cancelled = false;

    const loadTransfers = async () => {
      try {
        const sp = new URLSearchParams();
        sp.set('limit', '25');
        if (transfersPageParams) {
          for (const [k, v] of Object.entries(transfersPageParams)) if (v != null) sp.set(String(k), String(v));
        }
        const res = await fetch(`/api/v2/tokens/${address}/transfers?${sp.toString()}`, { cache: 'no-store' });
        if (res.status === 429) return;
        const j = await res.json();
        if (!cancelled) {
          setTransfers(j?.items || []);
          setTransfersNextParams(j?.next_page_params || null);
        }
      } catch {
        if (!cancelled) {
          setTransfers([]);
          setTransfersNextParams(null);
        }
      }
    };

    const loadHolders = async () => {
      try {
        const sp = new URLSearchParams();
        sp.set('limit', '25');
        if (holdersPageParams) {
          for (const [k, v] of Object.entries(holdersPageParams)) if (v != null) sp.set(String(k), String(v));
        }
        const res = await fetch(`/api/v2/tokens/${address}/holders?${sp.toString()}`, { cache: 'no-store' });
        if (res.status === 429) return;
        const j = await res.json();
        if (!cancelled) {
          setHolders(j?.items || []);
          setHoldersNextParams(j?.next_page_params || null);
        }
      } catch {
        if (!cancelled) {
          setHolders([]);
          setHoldersNextParams(null);
        }
      }
    };

    if (!address) return () => { cancelled = true; };

    if (tab === 'transfers') loadTransfers();
    if (tab === 'holders') loadHolders();

    return () => {
      cancelled = true;
    };
  }, [address, tab, transfersPageParams, holdersPageParams]);

  const decimals = info?.decimals ?? '18';
  const symbol = info?.symbol || 'TOKEN';
  const name = info?.name || '';

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pb-20 pt-8 relative z-10"
    >
      <button onClick={onBack} className="text-cyan-400 hover:text-cyan-300 flex items-center gap-2 font-mono text-sm mb-6 group transition-colors">
        <ChevronLeft className="w-4 h-4 group-hover:-translate-x-1 transition-transform" />
        BACK TO TOKENS
      </button>

      <div className="mb-6 flex items-center gap-4">
        <div className="p-4 bg-gold-500/10 rounded-xl border border-gold-500/20 shadow-[0_0_20px_rgba(255,215,0,0.10)]">
          <Database className="w-8 h-8 text-gold-400" />
        </div>
        <div className="min-w-0">
          <h1 className="text-3xl md:text-4xl font-black tracking-widest">
            {symbol} <span className="glow-text text-gold-500">·</span> <span className="glow-text-cyan text-cyan-300">{name || 'Token'}</span>
          </h1>
          <button
            onClick={() => onViewAddress(address)}
            className="mt-2 text-left text-xs font-mono text-gold-500/60 hover:text-cyan-300 underline decoration-gold-500/10 hover:decoration-cyan-400/60 break-all"
          >
            {address}
          </button>
          <div className="mt-1 text-[10px] font-mono text-gold-500/40">decimals {decimals} · holders {info?.holders ?? '--'} · type {info?.type ?? '--'}</div>
        </div>
      </div>

      <div className="mb-6 flex flex-wrap gap-2">
        {[
          { k: 'transfers', label: 'TOKEN TRANSFERS' },
          { k: 'holders', label: 'HOLDERS' },
          { k: 'overview', label: 'OVERVIEW' },
        ].map((t) => (
          <button
            key={t.k}
            onClick={() => setTab(t.k as any)}
            className={`relative px-4 py-2 rounded-lg border font-mono text-xs tracking-widest transition-colors ${tab === t.k ? 'text-cyan-200 border-cyan-500/50 bg-cyan-500/10' : 'text-gold-500/60 border-gold-500/15 hover:border-cyan-500/30 hover:text-cyan-300'}`}
          >
            {tab === t.k && (
              <motion.span
                layoutId="token-tab"
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
          <h2 className="text-lg font-bold tracking-widest flex items-center gap-2 text-gold-500">
            <Info className="w-5 h-5" /> OVERVIEW
          </h2>
          <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-x-12 gap-y-6">
            <DetailRow label="SYMBOL" value={symbol} isCyan />
            <DetailRow label="NAME" value={name || '--'} />
            <DetailRow label="DECIMALS" value={String(decimals)} />
            <DetailRow label="TOTAL SUPPLY" value={`${formatUnits(info?.total_supply, decimals, 6)} ${symbol}`} />
          </div>
          <div className="mt-4 text-[11px] font-mono text-gold-500/50">{loading ? 'Loading…' : ''}</div>
        </div>
      ) : tab === 'holders' ? (
        <div className="glow-box bg-dark-800/60 backdrop-blur-md rounded-2xl p-6 border-t-2 border-t-cyan-500/30">
          <h2 className="text-lg font-bold tracking-widest flex items-center gap-2 text-cyan-400">
            <Globe className="w-5 h-5" /> HOLDERS
          </h2>
          <div className="mt-2 text-xs font-mono text-gold-500/60">{holders == null ? 'Loading…' : `${holders.length} holder(s)`}</div>

          <div className="mt-4 flex items-center gap-2">
            <button
              disabled={holdersPrevStack.length === 0}
              onClick={() => {
                if (!holdersPrevStack.length) return;
                const copy = holdersPrevStack.slice();
                const prev = copy.pop();
                setHoldersPrevStack(copy);
                setHoldersPageParams(prev || null);
              }}
              className={`px-3 py-2 rounded-lg border font-mono text-xs tracking-widest transition-colors ${holdersPrevStack.length ? 'text-gold-400 border-gold-500/20 hover:border-cyan-500/40 hover:text-cyan-300' : 'text-gold-500/30 border-gold-500/10 cursor-not-allowed'}`}
            >
              PREV
            </button>
            <button
              disabled={!holdersNextParams}
              onClick={() => {
                if (!holdersNextParams) return;
                setHoldersPrevStack((s) => [...s, holdersPageParams]);
                setHoldersPageParams(holdersNextParams);
              }}
              className={`px-3 py-2 rounded-lg border font-mono text-xs tracking-widest transition-colors ${holdersNextParams ? 'text-gold-400 border-gold-500/20 hover:border-cyan-500/40 hover:text-cyan-300' : 'text-gold-500/30 border-gold-500/10 cursor-not-allowed'}`}
            >
              NEXT
            </button>
          </div>

          <div className="mt-6 space-y-3">
            {(holders || []).map((h: any, i: number) => {
              const a = String(h?.address?.hash || h?.address || '').trim();
              const v = h?.value;
              return (
                <div key={a || i} className="rounded-xl border border-cyan-500/15 bg-dark-900/40 p-4">
                  <div className="flex items-start justify-between gap-4">
                    <button
                      onClick={() => a && onViewAddress(a)}
                      className="text-left text-[11px] font-mono text-cyan-300 hover:text-cyan-200 underline decoration-cyan-500/30 hover:decoration-cyan-400/60 break-all"
                    >
                      {a ? shortHash(a, 14, 10) : '--'}
                    </button>
                    <div className="text-right">
                      <div className="text-sm font-mono text-gold-500/90">{formatUnits(v, decimals, 6)} {symbol}</div>
                      <div className="text-[10px] font-mono text-gold-500/35">{String(v ?? '--')} raw</div>
                    </div>
                  </div>
                </div>
              );
            })}

            {holders && holders.length === 0 ? (
              <div className="text-xs font-mono text-gold-500/60">No holders.</div>
            ) : null}
          </div>
        </div>
      ) : (
        <div className="glow-box bg-dark-800/60 backdrop-blur-md rounded-2xl p-6 border-t-2 border-t-gold-500/30">
          <h2 className="text-lg font-bold tracking-widest flex items-center gap-2 text-gold-500">
            <ArrowRightLeft className="w-5 h-5" /> TOKEN TRANSFERS
          </h2>
          <div className="mt-2 text-xs font-mono text-gold-500/60">{transfers == null ? 'Loading…' : `${transfers.length} transfer(s)`}</div>

          <div className="mt-4 flex items-center gap-2">
            <button
              disabled={transfersPrevStack.length === 0}
              onClick={() => {
                if (!transfersPrevStack.length) return;
                const copy = transfersPrevStack.slice();
                const prev = copy.pop();
                setTransfersPrevStack(copy);
                setTransfersPageParams(prev || null);
              }}
              className={`px-3 py-2 rounded-lg border font-mono text-xs tracking-widest transition-colors ${transfersPrevStack.length ? 'text-gold-400 border-gold-500/20 hover:border-cyan-500/40 hover:text-cyan-300' : 'text-gold-500/30 border-gold-500/10 cursor-not-allowed'}`}
            >
              PREV
            </button>
            <button
              disabled={!transfersNextParams}
              onClick={() => {
                if (!transfersNextParams) return;
                setTransfersPrevStack((s) => [...s, transfersPageParams]);
                setTransfersPageParams(transfersNextParams);
              }}
              className={`px-3 py-2 rounded-lg border font-mono text-xs tracking-widest transition-colors ${transfersNextParams ? 'text-gold-400 border-gold-500/20 hover:border-cyan-500/40 hover:text-cyan-300' : 'text-gold-500/30 border-gold-500/10 cursor-not-allowed'}`}
            >
              NEXT
            </button>
          </div>

          <div className="mt-6 space-y-3">
            {(transfers || []).map((tr: any, i: number) => {
              const txh = String(tr?.transaction_hash || tr?.tx_hash || '').trim();
              const bn = Number(tr?.block_number);
              const from = String(tr?.from?.hash || tr?.from || '').trim();
              const to = String(tr?.to?.hash || tr?.to || '').trim();
              const method = String(tr?.method || '').trim();
              const amt = tr?.total?.value ?? tr?.value ?? tr?.amount ?? '0';
              const tokenId = tr?.token_id;

              const methodLabel = () => {
                const z = '0x0000000000000000000000000000000000000000';
                if (String(from).toLowerCase() === z) return 'MINT';
                if (method.toLowerCase() === '0xa9059cbb') return 'TRANSFER';
                return method ? method.slice(0, 10) : '--';
              };

              return (
                <div key={(txh || i) + ':' + String(tr?.log_index ?? i)} className="rounded-xl border border-gold-500/15 bg-dark-900/40 p-4">
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-[10px] font-mono tracking-widest px-2 py-0.5 rounded border border-cyan-500/20 bg-cyan-500/10 text-cyan-300">
                          {methodLabel()}
                        </span>
                        {txh ? (
                          <button
                            onClick={() => onViewTx(txh)}
                            className="text-left text-[11px] font-mono text-cyan-300 hover:text-cyan-200 underline decoration-cyan-500/30 hover:decoration-cyan-400/60 break-all"
                          >
                            {shortHash(txh, 14, 10)}
                          </button>
                        ) : null}
                        {Number.isFinite(bn) ? (
                          <button
                            onClick={() => onViewBlock(bn)}
                            className="text-[11px] font-mono text-gold-500/70 hover:text-cyan-300 underline decoration-gold-500/10 hover:decoration-cyan-400/60"
                          >
                            #{bn}
                          </button>
                        ) : null}
                      </div>

                      <div className="mt-2 text-[10px] font-mono text-gold-500/55 flex flex-col gap-1">
                        <div>
                          <span className="text-gold-500/35">from</span>{' '}
                          <button onClick={() => from && onViewAddress(from)} className="text-cyan-300 hover:text-cyan-200 underline decoration-cyan-500/30 hover:decoration-cyan-400/60">{shortHash(from, 12, 6)}</button>
                        </div>
                        <div>
                          <span className="text-gold-500/35">to</span>{' '}
                          <button onClick={() => to && onViewAddress(to)} className="text-cyan-300 hover:text-cyan-200 underline decoration-cyan-500/30 hover:decoration-cyan-400/60">{shortHash(to, 12, 6)}</button>
                        </div>
                      </div>
                    </div>

                    <div className="shrink-0 text-right">
                      <div className="text-sm font-mono text-gold-500/90">{formatUnits(amt, decimals, 6)} <span className="text-gold-500/60">{symbol}</span></div>
                      <div className="text-[10px] font-mono text-gold-500/35">tokenId {tokenId == null ? '-' : String(tokenId)}</div>
                    </div>
                  </div>
                </div>
              );
            })}

            {transfers && transfers.length === 0 ? (
              <div className="text-xs font-mono text-gold-500/60">No token transfers yet.</div>
            ) : null}
          </div>
        </div>
      )}
    </motion.div>
  );
};

export default TokenView;
