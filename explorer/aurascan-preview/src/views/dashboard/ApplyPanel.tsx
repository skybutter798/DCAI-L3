import { CheckCircle2 } from 'lucide-react';

type ApplyPanelProps = {
  tier: 'basic' | 'pro' | 'ultra';
  note: string;
  addr: string | null;
  lastReq: any;
  setNote: (value: string) => void;
  onRequestApiKey: () => void;
  onRevealMyKeys: () => void;
};

const ApplyPanel = ({ tier, note, addr, lastReq, setNote, onRequestApiKey, onRevealMyKeys }: ApplyPanelProps) => {
  return (
    <div className="glow-box bg-dark-800/60 backdrop-blur-md rounded-2xl p-6 border-t-2 border-t-gold-500/30 mb-8">
      <h2 className="text-lg font-bold tracking-widest flex items-center gap-2 text-gold-500">
        <CheckCircle2 className="w-5 h-5" /> APPLY
      </h2>
      <div className="mt-2 text-xs font-mono text-gold-500/60">Selected tier: <span className="text-cyan-300">{tier}</span></div>
      <textarea
        value={note}
        onChange={(e) => setNote(e.target.value)}
        placeholder="Tell us your intended usage (optional)…"
        className="mt-4 w-full min-h-[90px] bg-dark-900/50 border border-gold-500/15 rounded-xl p-3 text-xs font-mono text-gold-500/80 outline-none"
      />
      <div className="mt-4 flex flex-wrap gap-2">
        <button disabled={!addr} onClick={onRequestApiKey} className={`px-4 py-2 rounded-lg border text-xs font-mono ${addr ? 'border-cyan-500/20 text-cyan-300 hover:border-cyan-400/60' : 'border-gold-500/10 text-gold-500/30 cursor-not-allowed'}`}>SUBMIT REQUEST</button>
        <button disabled={!addr} onClick={onRevealMyKeys} className={`px-4 py-2 rounded-lg border text-xs font-mono ${addr ? 'border-gold-500/20 text-gold-500/80 hover:border-cyan-500/40 hover:text-cyan-300' : 'border-gold-500/10 text-gold-500/30 cursor-not-allowed'}`}>REVEAL MY KEYS</button>
      </div>

      {lastReq ? (
        <pre className="mt-4 text-[10px] font-mono text-gold-500/60 whitespace-pre-wrap break-all">{JSON.stringify(lastReq, null, 2)}</pre>
      ) : null}
    </div>
  );
};

export default ApplyPanel;
