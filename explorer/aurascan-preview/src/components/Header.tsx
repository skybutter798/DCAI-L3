import { motion, AnimatePresence } from 'motion/react';
import { useState, useEffect, useRef } from 'react';
import { Search, Activity, Zap, Globe, Database, Hash, Clock, Box, ArrowRightLeft, Cpu, ChevronRight, ChevronLeft, CheckCircle2, Layers, Info, Code2, Menu, X, List } from 'lucide-react';

const Header = ({
  active,
  onHome,
  onBlocks,
  onTxs,
  onTokens,
  onDashboard,
}: {
  active: 'home' | 'blocks' | 'txs' | 'tx' | 'block' | 'address' | 'tokens' | 'token' | 'dashboard',
  onHome: () => void,
  onBlocks: () => void,
  onTxs: () => void,
  onTokens: () => void,
  onDashboard: () => void,
}) => {
  const [mobileOpen, setMobileOpen] = useState(false);

  const NavItem = ({ label, isActive, onClick }: { label: string, isActive?: boolean, onClick?: () => void }) => (
    <button
      onClick={onClick}
      className={`text-sm font-mono transition-all ${isActive ? 'text-cyan-300 glow-text-cyan' : 'text-gold-500/70 hover:text-cyan-400 hover:glow-text-cyan'}`}
    >
      {label}
    </button>
  );

  return (
    <header className="sticky top-0 z-[100] bg-dark-900/80 backdrop-blur-md border-b border-gold-500/20 pointer-events-auto">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
        <div className="flex items-center gap-3 cursor-pointer group" onClick={() => { setMobileOpen(false); onHome(); }}>
          <div className="w-8 h-8 rounded bg-gold-500 flex items-center justify-center shadow-[0_0_10px_#FFD700] group-hover:shadow-[0_0_20px_#FFD700] transition-shadow">
            <Cpu className="w-5 h-5 text-dark-900" />
          </div>
          <span className="font-black text-xl tracking-widest glow-text">DCAI<span className="text-cyan-400 glow-text-cyan">L3</span></span>
          <div className="hidden sm:flex items-center gap-2 px-3 py-1 ml-4 rounded-full border border-cyan-500/30 bg-cyan-500/10">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-cyan-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-cyan-500"></span>
            </span>
            <span className="text-[10px] font-mono font-bold tracking-widest text-cyan-400">TESTNET</span>
          </div>
        </div>

        <nav className="hidden md:flex items-center gap-8">
          <NavItem label="BLOCKS" isActive={active === 'blocks' || active === 'block'} onClick={() => { setMobileOpen(false); onBlocks(); }} />
          <NavItem label="TRANSACTIONS" isActive={active === 'txs' || active === 'tx'} onClick={() => { setMobileOpen(false); onTxs(); }} />
          <NavItem label="TOKENS" isActive={active === 'tokens' || active === 'token'} onClick={() => { setMobileOpen(false); onTokens(); }} />
          <NavItem label="NODES" onClick={() => { /* next */ }} />
          <NavItem label="API" isActive={active === 'dashboard'} onClick={() => { setMobileOpen(false); onDashboard(); }} />
        </nav>

        <div className="flex items-center gap-3">
          <button className="hidden sm:inline-flex glow-box px-4 py-1.5 rounded text-xs font-mono font-bold hover:bg-cyan-500 hover:text-dark-900 hover:shadow-[0_0_15px_#00F0FF] transition-all border-cyan-500/50 text-cyan-400">
            CONNECT WALLET
          </button>

          <button
            onClick={() => setMobileOpen(v => !v)}
            className="md:hidden w-10 h-10 inline-flex items-center justify-center rounded-lg border border-cyan-500/20 text-cyan-300 hover:border-cyan-400/50"
            aria-label="Menu"
          >
            {mobileOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
        </div>
      </div>

      <AnimatePresence>
        {mobileOpen ? (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.16 }}
            className="md:hidden border-t border-gold-500/10 bg-dark-900/95 backdrop-blur-md"
          >
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex flex-col gap-3">
              <NavItem label="BLOCKS" isActive={active === 'blocks' || active === 'block'} onClick={() => { setMobileOpen(false); onBlocks(); }} />
              <NavItem label="TRANSACTIONS" isActive={active === 'txs' || active === 'tx'} onClick={() => { setMobileOpen(false); onTxs(); }} />
              <NavItem label="TOKENS" isActive={active === 'tokens' || active === 'token'} onClick={() => { setMobileOpen(false); onTokens(); }} />
              <NavItem label="NODES" onClick={() => { setMobileOpen(false); }} />
              <NavItem label="API" isActive={active === 'dashboard'} onClick={() => { setMobileOpen(false); onDashboard(); }} />
              <button className="mt-2 glow-box px-4 py-2 rounded text-xs font-mono font-bold border-cyan-500/50 text-cyan-300 hover:bg-cyan-500 hover:text-dark-900 transition-all">
                CONNECT WALLET
              </button>
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </header>
  );
};

export default Header;
