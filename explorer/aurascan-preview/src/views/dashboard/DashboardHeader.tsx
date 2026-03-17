import { Code2 } from 'lucide-react';

const DashboardHeader = () => {
  return (
    <div className="mb-6 flex items-center gap-4">
      <div className="p-4 bg-cyan-500/10 rounded-xl border border-cyan-500/20 shadow-[0_0_20px_rgba(0,240,255,0.10)]">
        <Code2 className="w-8 h-8 text-cyan-400" />
      </div>
      <div className="min-w-0">
        <h1 className="text-3xl md:text-4xl font-black tracking-widest">API <span className="glow-text-cyan text-cyan-300">DASHBOARD</span></h1>
        <div className="mt-2 text-xs font-mono text-gold-500/60">Stake tDCAI → Apply → Admin approve → Get API key</div>
      </div>
    </div>
  );
};

export default DashboardHeader;
