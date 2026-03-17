type TierKey = 'basic' | 'pro' | 'ultra';

type TierCardsProps = {
  addr: string | null;
  tiers: Record<TierKey, { label: string; enum: number; stake: string; rate: string; burst: string }>;
  onStakeSelect: (tierKey: TierKey) => void;
};

const TierCards = ({ addr, tiers, onStakeSelect }: TierCardsProps) => {
  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
      {(['basic','pro','ultra'] as const).map((k) => (
        <div key={k} className="rounded-2xl border border-gold-500/15 bg-dark-900/40 p-5">
          <div className="text-xs font-mono text-gold-500/50">{tiers[k].label.toUpperCase()}</div>
          <div className="mt-2 text-lg font-mono text-cyan-200/90">Stake {tiers[k].stake} tDCAI</div>
          <div className="mt-1 text-[10px] font-mono text-gold-500/40">limit {tiers[k].rate} · burst {tiers[k].burst}</div>
          <button
            disabled={!addr}
            onClick={() => onStakeSelect(k)}
            className={`mt-4 w-full px-3 py-2 rounded-lg border text-xs font-mono ${addr ? 'border-cyan-500/20 text-cyan-300 hover:border-cyan-400/60' : 'border-gold-500/10 text-gold-500/30 cursor-not-allowed'}`}
          >
            STAKE & SELECT
          </button>
        </div>
      ))}
    </div>
  );
};

export default TierCards;
