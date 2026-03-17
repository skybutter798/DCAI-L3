type StakePanelProps = {
  addr: string | null;
  stakeTierLabel: string;
  stakeAmount: string;
  requestedAtSec: number;
  cooldownLeftSec: number;
  onRequestUnstake: () => void;
  onWithdraw: () => void;
};

const StakePanel = ({ addr, stakeTierLabel, stakeAmount, requestedAtSec, cooldownLeftSec, onRequestUnstake, onWithdraw }: StakePanelProps) => {
  return (
    <div className="glow-box bg-dark-800/60 backdrop-blur-md rounded-2xl p-6 border-t-2 border-t-gold-500/30 mb-8">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <div className="text-xs font-mono text-gold-500/50">CURRENT STAKE</div>
          <div className="mt-1 text-sm font-mono text-cyan-200/90">tier <span className="text-cyan-300">{stakeTierLabel}</span> · amount <span className="text-cyan-300">{stakeAmount}</span> tDCAI</div>
          <div className="mt-1 text-[10px] font-mono text-gold-500/40">unstake cooldown: 24h</div>
          {requestedAtSec > 0 ? (
            <div className="mt-2 text-[10px] font-mono text-gold-500/60">
              requestedAt {requestedAtSec} · withdraw {(cooldownLeftSec <= 0) ? <span className="text-emerald-400">available now</span> : <span className="text-yellow-400">in {Math.max(0, cooldownLeftSec)}s</span>}
            </div>
          ) : (
            <div className="mt-2 text-[10px] font-mono text-gold-500/50">No unstake requested.</div>
          )}
        </div>

        <div className="flex gap-2">
          <button
            disabled={!addr || stakeTierLabel === 'none' || requestedAtSec > 0}
            onClick={onRequestUnstake}
            className={`px-3 py-2 rounded-lg border text-xs font-mono ${(!addr || stakeTierLabel === 'none' || requestedAtSec > 0) ? 'border-gold-500/10 text-gold-500/30 cursor-not-allowed' : 'border-rose-500/30 text-rose-300 hover:border-rose-400/70'}`}
          >
            REQUEST UNSTAKE
          </button>
          <button
            disabled={!addr || requestedAtSec <= 0 || cooldownLeftSec > 0}
            onClick={onWithdraw}
            className={`px-3 py-2 rounded-lg border text-xs font-mono ${(!addr || requestedAtSec <= 0 || cooldownLeftSec > 0) ? 'border-gold-500/10 text-gold-500/30 cursor-not-allowed' : 'border-emerald-500/30 text-emerald-300 hover:border-emerald-400/70'}`}
          >
            WITHDRAW
          </button>
        </div>
      </div>

      <div className="mt-3 text-[10px] font-mono text-gold-500/40">
        If you withdraw, we can revoke your API key (policy: key valid while staked). For now revoke is manual from /admin.
      </div>
    </div>
  );
};

export default StakePanel;
