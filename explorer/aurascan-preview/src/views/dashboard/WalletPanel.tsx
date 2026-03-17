type WalletPanelProps = {
  addr: string | null;
  chainId: number | null;
  stakeContract: string;
  err: string | null;
  busy: string | null;
  onConnect: () => void;
  onRefresh: () => void;
};

const WalletPanel = ({ addr, chainId, stakeContract, err, busy, onConnect, onRefresh }: WalletPanelProps) => {
  return (
    <div className="glow-box bg-dark-800/60 backdrop-blur-md rounded-2xl p-6 border-t-2 border-t-cyan-500/30 mb-8">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="text-xs font-mono text-gold-500/50">WALLET</div>
          <div className="mt-1 text-sm font-mono text-cyan-200/90 break-all">{addr || '-- not connected --'}</div>
          <div className="mt-1 text-[10px] font-mono text-gold-500/40">chainId {chainId ?? '--'} · stake contract {stakeContract}</div>
        </div>
        <div className="flex gap-2">
          <button onClick={onConnect} className="px-3 py-2 rounded-lg border border-cyan-500/20 text-cyan-300 text-xs font-mono hover:border-cyan-400/60">CONNECT</button>
          <button disabled={!addr} onClick={onRefresh} className={`px-3 py-2 rounded-lg border text-xs font-mono ${addr ? 'border-gold-500/20 text-gold-500/80 hover:border-cyan-500/40 hover:text-cyan-300' : 'border-gold-500/10 text-gold-500/30 cursor-not-allowed'}`}>REFRESH</button>
        </div>
      </div>

      {err ? <div className="mt-3 text-[11px] font-mono text-rose-300">{err}</div> : null}
      {busy ? <div className="mt-3 text-[11px] font-mono text-gold-500/60">{busy}</div> : null}
    </div>
  );
};

export default WalletPanel;
