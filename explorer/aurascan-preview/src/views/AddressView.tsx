import { motion, AnimatePresence } from 'motion/react';
import { useState, useEffect, useRef } from 'react';
import { Search, Activity, Zap, Globe, Database, Hash, Clock, Box, ArrowRightLeft, Cpu, ChevronRight, ChevronLeft, CheckCircle2, Layers, Info, Code2, Menu, X, List } from 'lucide-react';
import { copyToClipboard } from '../lib/appUtils';
import { formatTDCAI } from '../lib/formatters';
import DetailRow from '../components/DetailRow';

const AddressView = ({ address, onBack, onViewTx, onViewAddress, onViewToken }: { address: string, onBack: () => void, onViewTx: (h: string) => void, onViewAddress: (a: string) => void, onViewToken: (a: string) => void }) => {
  const [info, setInfo] = useState<any>(null);
  const [tokenMeta, setTokenMeta] = useState<any>(null);
  const [tokenMetaLoading, setTokenMetaLoading] = useState<boolean>(false);
  const [tab, setTab] = useState<'overview' | 'contract' | 'txs' | 'tokens'>('overview');
  const [copyToast, setCopyToast] = useState<string | null>(null);
  const [addrTxs, setAddrTxs] = useState<any[] | null>(null);
  const [addrTxsLoading, setAddrTxsLoading] = useState<boolean>(false);

  const [contract, setContract] = useState<any>(null);
  const [contractLoading, setContractLoading] = useState<boolean>(false);

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

  // Detect if this address is a token contract (so we can suggest the Token page)
  useEffect(() => {
    let cancelled = false;
    const loadTokenMeta = async () => {
      try {
        setTokenMetaLoading(true);
        const res = await fetch(`/api/v2/tokens/${address}`, { cache: 'no-store' });
        if (res.status === 404) {
          if (!cancelled) setTokenMeta(null);
          return;
        }
        if (res.status === 429) return;
        const j = await res.json();
        if (!cancelled && j?.address) setTokenMeta(j);
      } catch {
        if (!cancelled) setTokenMeta(null);
      } finally {
        if (!cancelled) setTokenMetaLoading(false);
      }
    };

    setTokenMeta(null);
    loadTokenMeta();

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

      {tokenMeta ? (
        <div className="mb-6 glow-box bg-dark-800/60 backdrop-blur-md rounded-2xl p-4 border-t-2 border-t-cyan-500/30">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <div className="text-xs font-mono text-gold-500/60">This address is a token contract</div>
              <div className="mt-1 text-sm font-mono text-cyan-300">
                {String(tokenMeta.symbol || 'TOKEN')} · {String(tokenMeta.name || 'Token')}
              </div>
              <div className="mt-1 text-[10px] font-mono text-gold-500/45">decimals {String(tokenMeta.decimals ?? '--')} · holders {String(tokenMeta.holders ?? '--')}</div>
            </div>
            <button
              onClick={() => onViewToken(String(tokenMeta.address || address))}
              className="shrink-0 px-3 py-2 rounded-lg border border-cyan-500/20 text-cyan-300 text-xs font-mono hover:border-cyan-400/60"
            >
              OPEN TOKEN PAGE
            </button>
          </div>
        </div>
      ) : tokenMetaLoading ? (
        <div className="mb-6 text-xs font-mono text-gold-500/50">Checking token metadata…</div>
      ) : null}

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
            <DetailRow label="COIN BALANCE" value={`${formatTDCAI(info?.coin_balance)} tDCAI`} />
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
                        status {tx.status ?? tx.result ?? '--'} · block {tx.block_number ?? tx.block ?? '--'} · pos {tx.position ?? '--'}
                      </div>
                      <div className="mt-2 text-[10px] font-mono text-gold-500/55 flex flex-col gap-1">
                        <div>
                          <span className="text-gold-500/35">from</span>{' '}
                          <button
                            onClick={() => tx?.from?.hash && onViewAddress(String(tx.from.hash))}
                            className="text-cyan-300 hover:text-cyan-200 underline decoration-cyan-500/30 hover:decoration-cyan-400/60"
                          >
                            {String(tx?.from?.hash || '').slice(0, 10)}…{String(tx?.from?.hash || '').slice(-6)}
                          </button>
                        </div>
                        <div>
                          <span className="text-gold-500/35">to</span>{' '}
                          <button
                            onClick={() => tx?.to?.hash && onViewAddress(String(tx.to.hash))}
                            className="text-cyan-300 hover:text-cyan-200 underline decoration-cyan-500/30 hover:decoration-cyan-400/60"
                          >
                            {String(tx?.to?.hash || '').slice(0, 10)}…{String(tx?.to?.hash || '').slice(-6)}
                          </button>
                        </div>
                      </div>
                    </div>
                    <div className="shrink-0 text-right">
                      <div className="text-xs font-mono text-gold-500/90">
                        {formatTDCAI(tx.value)} <span className="text-gold-500/60">tDCAI</span>
                      </div>
                      <div className="text-[10px] font-mono text-gold-500/35">{String(tx.value ?? '0')} wei</div>
                      <div className="mt-2 text-[10px] font-mono text-gold-500/60">fee {formatTDCAI(tx.fee?.value ?? tx.fee ?? '0')} tDCAI</div>
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

export default AddressView;
