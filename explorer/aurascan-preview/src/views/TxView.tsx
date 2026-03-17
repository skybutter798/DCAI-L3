import { motion, AnimatePresence } from 'motion/react';
import { useState, useEffect, useRef } from 'react';
import { Search, Activity, Zap, Globe, Database, Hash, Clock, Box, ArrowRightLeft, Cpu, ChevronRight, ChevronLeft, CheckCircle2, Layers, Info, Code2, Menu, X, List } from 'lucide-react';
import { copyToClipboard } from '../lib/appUtils';
import { shortHash, formatTDCAI } from '../lib/formatters';
import useTxDetails from '../hooks/useTxDetails';
import DetailRow from '../components/DetailRow';

const TxView = ({ hash, onBack, onViewBlock, onViewAddress }: { hash: string, onBack: () => void, onViewBlock: (h: number) => void, onViewAddress: (a: string) => void }) => {
  const { tx, loading } = useTxDetails(hash);
  const [copyToast, setCopyToast] = useState<string | null>(null);
  const [tab, setTab] = useState<'overview' | 'logs' | 'transfers'>('overview');
  const [showInput, setShowInput] = useState<boolean>(false);
  const [logs, setLogs] = useState<any[] | null>(null);
  const [logsLoading, setLogsLoading] = useState<boolean>(false);
  const [logOpen, setLogOpen] = useState<Record<string, boolean>>({});
  const [transfers, setTransfers] = useState<any[] | null>(null);
  const [transfersLoading, setTransfersLoading] = useState<boolean>(false);

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
            <div className="flex flex-col gap-1 border-b border-gold-500/10 pb-4">
              <span className="text-xs font-mono text-gold-500/50">BLOCK</span>
              <div className="flex items-start justify-between gap-3">
                {(tx?.block_number ?? tx?.block) != null ? (
                  <button
                    onClick={() => onViewBlock(Number(tx?.block_number ?? tx?.block))}
                    className="text-left text-sm font-mono break-all text-cyan-400 glow-text-cyan hover:text-cyan-300 underline decoration-cyan-500/30 hover:decoration-cyan-400/60"
                  >
                    #{String(tx?.block_number ?? tx?.block)}
                  </button>
                ) : (
                  <div className="text-sm font-mono break-all text-gold-400">--</div>
                )}
              </div>
            </div>
            <DetailRow label="POSITION" value={tx?.position ?? '--'} />
            <div className="flex flex-col gap-2 border-b border-gold-500/10 pb-4">
              <span className="text-xs font-mono text-gold-500/50">FROM</span>
              <div className="flex items-start justify-between gap-3">
                {tx?.from?.hash ? (
                  <button
                    onClick={() => onViewAddress(String(tx.from.hash))}
                    className="text-left text-sm font-mono break-all text-cyan-400 glow-text-cyan hover:text-cyan-300 underline decoration-cyan-500/30 hover:decoration-cyan-400/60"
                  >
                    {String(tx.from.hash)}
                  </button>
                ) : (
                  <div className="text-sm font-mono break-all text-gold-400">--</div>
                )}
                {tx?.from?.hash ? (
                  <button onClick={() => copy('FROM', String(tx.from.hash))} className="shrink-0 w-6 h-6 inline-flex items-center justify-center text-[11px] font-mono text-cyan-300 border border-cyan-500/25 hover:border-cyan-400 rounded transition-colors">⧉</button>
                ) : null}
              </div>
            </div>

            <div className="flex flex-col gap-2 border-b border-gold-500/10 pb-4">
              <span className="text-xs font-mono text-gold-500/50">TO</span>
              <div className="flex items-start justify-between gap-3">
                {tx?.to?.hash ? (
                  <button
                    onClick={() => onViewAddress(String(tx.to.hash))}
                    className="text-left text-sm font-mono break-all text-gold-400 hover:text-cyan-300 underline decoration-gold-500/20 hover:decoration-cyan-400/60"
                  >
                    {String(tx.to.hash)}
                  </button>
                ) : (
                  <div className="text-sm font-mono break-all text-gold-400">--</div>
                )}
                {tx?.to?.hash ? (
                  <button onClick={() => copy('TO', String(tx.to.hash))} className="shrink-0 w-6 h-6 inline-flex items-center justify-center text-[11px] font-mono text-cyan-300 border border-cyan-500/25 hover:border-cyan-400 rounded transition-colors">⧉</button>
                ) : null}
              </div>
            </div>
            <DetailRow label="VALUE" value={`${formatTDCAI(tx?.value)} tDCAI`} isCyan />
            <DetailRow label="FEE (wei)" value={tx?.fee?.value ?? tx?.fee ?? '--'} />
            <DetailRow label="GAS USED" value={tx?.gas_used ?? '--'} />
            <DetailRow label="GAS PRICE" value={tx?.gas_price ?? tx?.max_fee_per_gas ?? '--'} />
            <DetailRow label="NONCE" value={tx?.nonce ?? '--'} />
            <DetailRow label="METHOD" value={tx?.method ?? tx?.decoded_input?.method_call ?? '--'} />
          </div>
        </div>
      </div>

      <div className="-mt-6 mb-10 flex flex-wrap gap-2">
        <button
          onClick={() => tx?.from?.hash && onViewAddress(String(tx.from.hash))}
          className="text-xs font-mono text-gold-500/80 hover:text-cyan-300 border border-gold-500/20 hover:border-cyan-500/40 px-4 py-2 rounded transition-colors"
        >
          OPEN FROM
        </button>
        <button
          onClick={() => tx?.to?.hash && onViewAddress(String(tx.to.hash))}
          className="text-xs font-mono text-gold-500/80 hover:text-cyan-300 border border-gold-500/20 hover:border-cyan-500/40 px-4 py-2 rounded transition-colors"
        >
          OPEN TO
        </button>
        {(tx?.block_number ?? tx?.block) != null ? (
          <button
            onClick={() => onViewBlock(Number(tx?.block_number ?? tx?.block))}
            className="text-xs font-mono text-gold-500/80 hover:text-cyan-300 border border-gold-500/20 hover:border-cyan-500/40 px-4 py-2 rounded transition-colors"
          >
            OPEN BLOCK
          </button>
        ) : null}
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

export default TxView;
