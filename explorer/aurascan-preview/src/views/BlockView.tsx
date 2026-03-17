import { motion, AnimatePresence } from 'motion/react';
import { useState, useEffect, useRef } from 'react';
import { Search, Activity, Zap, Globe, Database, Hash, Clock, Box, ArrowRightLeft, Cpu, ChevronRight, ChevronLeft, CheckCircle2, Layers, Info, Code2, Menu, X, List } from 'lucide-react';
import { copyToClipboard } from '../lib/appUtils';
import { shortHash } from '../lib/formatters';
import DetailRow from '../components/DetailRow';

const BlockView = ({ block, onBack, onViewTx, onViewAddress }: { block: any, onBack: () => void, onViewTx: (h: string) => void, onViewAddress: (a: string) => void, key?: string }) => {
  const [details, setDetails] = useState<any>(null);
  const [blockTxs, setBlockTxs] = useState<any[]>([]);
  const [copyToast, setCopyToast] = useState<string | null>(null);

  const timeAgo = (iso?: string) => {
    try {
      if (!iso) return '';
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
      return '';
    }
  };

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

    const short = (addr: string) => shortHash(addr, 6, 4);

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
          validator: signer || '',
          miner: signer ? short(signer) : '--',
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
              {details?.validator ? (
                <div className="min-w-0">
                  <button
                    onClick={() => onViewAddress(String(details.validator))}
                    className="text-left text-sm font-mono text-cyan-400 glow-text-cyan hover:text-cyan-300 underline decoration-cyan-500/30 hover:decoration-cyan-400/60"
                  >
                    {details?.miner || String(details.validator).slice(0, 6) + '…' + String(details.validator).slice(-4)}
                  </button>
                  <button
                    onClick={() => onViewAddress(String(details.validator))}
                    className="mt-1 block text-left text-[10px] font-mono text-gold-500/50 hover:text-cyan-300 underline decoration-gold-500/10 hover:decoration-cyan-400/60 break-all"
                  >
                    {String(details.validator)}
                  </button>
                </div>
              ) : (
                <div className="text-sm font-mono text-gold-400">--</div>
              )}

              {details?.validator ? (
                <button
                  onClick={() => copyToClipboard(String(details.validator))}
                  className="shrink-0 w-6 h-6 inline-flex items-center justify-center text-[11px] font-mono text-cyan-300 border border-cyan-500/25 hover:border-cyan-400 rounded"
                >
                  ⧉
                </button>
              ) : null}
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
                  <button
                    onClick={() => onViewTx(String(tx.hash))}
                    className="text-left text-[11px] font-mono text-cyan-400 break-all w-44 sm:w-72 leading-4 hover:text-cyan-300 underline decoration-cyan-500/30 hover:decoration-cyan-400/60"
                  >
                    {tx.hash}
                  </button>
                  <div className="text-[10px] font-mono text-gold-500/50">{tx.time}{tx.timestamp ? (' · ' + timeAgo(tx.timestamp)) : ""}</div>
                </div>
              </div>

              <div className="flex items-center gap-2 flex-1 px-3">
                <div className="flex items-center gap-2 w-28">
  <button onClick={() => {
    const a = (tx as any)?.from?.hash || (tx as any)?.from;
    if (a) onViewAddress(String(a));
  }} className="text-xs font-mono text-gold-500/70 hover:text-cyan-300 truncate cursor-pointer underline decoration-gold-500/20 hover:decoration-cyan-400/60">{String((tx as any)?.from?.hash || (tx as any)?.from || '--')}</button>
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
  <button onClick={() => {
    const a = (tx as any)?.to?.hash || (tx as any)?.to;
    if (a) onViewAddress(String(a));
  }} className="text-xs font-mono text-gold-500/70 hover:text-cyan-300 truncate cursor-pointer underline decoration-gold-500/20 hover:decoration-cyan-400/60">{String((tx as any)?.to?.hash || (tx as any)?.to || '--')}</button>
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

export default BlockView;
