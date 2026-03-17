import { motion, AnimatePresence } from 'motion/react';
import { useState, useEffect, useRef } from 'react';
import { Search, Activity, Zap, Globe, Database, Hash, Clock, Box, ArrowRightLeft, Cpu, ChevronRight, ChevronLeft, CheckCircle2, Layers, Info, Code2, Menu, X, List } from 'lucide-react';
import { navigateTo } from '../lib/appUtils';

const Hero = () => {
  const [q, setQ] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [searching, setSearching] = useState(false);

  const doSearch = async () => {
    const raw = q.trim();
    if (!raw || searching) return;
    setErr(null);
    setSearching(true);

    const s = raw;

    const norm0x = (h: string) => (h.startsWith('0x') ? h : `0x${h}`);

    try {
      // block number (123 or #123)
      const mBlock = s.match(/^#?(\d+)$/);
      if (mBlock) {
        navigateTo(`/block/${mBlock[1]}`);
        return;
      }

      // address without/with 0x
      if (/^(0x)?[0-9a-fA-F]{40}$/.test(s)) {
        navigateTo(`/address/${norm0x(s)}`);
        return;
      }

      // 64-hex can be tx hash OR block hash → ask Blockscout search to disambiguate
      if (/^(0x)?[0-9a-fA-F]{64}$/.test(s)) {
        const q0 = norm0x(s);
        const res = await fetch(`/api/v2/search?q=${encodeURIComponent(q0)}`, { cache: 'no-store' });
        const j = await res.json();
        const it = j?.items?.[0];
        if (it?.type === 'transaction' && it?.transaction_hash) {
          navigateTo(`/tx/${String(it.transaction_hash)}`);
          return;
        }
        if (it?.type === 'block' && (it?.block_number != null || it?.block_hash)) {
          // Prefer numeric height since our router already supports it
          if (it.block_number != null) {
            navigateTo(`/block/${String(it.block_number)}`);
          } else {
            navigateTo(`/block/${String(it.block_hash)}`);
          }
          return;
        }
        // default fallback
        navigateTo(`/tx/${q0}`);
        return;
      }

      // General search (token name, etc.)
      const res = await fetch(`/api/v2/search?q=${encodeURIComponent(s)}`, { cache: 'no-store' });
      const j = await res.json();
      const it = j?.items?.[0];
      if (!it) {
        setErr('Not found.');
        return;
      }

      if (it.type === 'address' && it.address) {
        navigateTo(`/address/${String(it.address)}`);
        return;
      }
      if (it.type === 'transaction' && it.transaction_hash) {
        navigateTo(`/tx/${String(it.transaction_hash)}`);
        return;
      }
      if (it.type === 'block' && it.block_number != null) {
        navigateTo(`/block/${String(it.block_number)}`);
        return;
      }
      if (it.url) {
        // Last resort: follow Blockscout-provided URL
        navigateTo(String(it.url));
        return;
      }

      setErr('Not supported yet.');
    } catch {
      setErr('Search failed.');
    } finally {
      setSearching(false);
    }
  };

  return (
    <div className="py-20 flex flex-col items-center justify-center text-center relative">
      <motion.div
        initial={{ scale: 0.8, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ duration: 1, ease: 'easeOut' }}
        className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-cyan-500/5 rounded-full blur-3xl pointer-events-none"
      />

      <motion.div initial={{ y: 20, opacity: 0 }} animate={{ y: 0, opacity: 1 }} className="relative z-10 mb-8">
        <h1 className="text-5xl md:text-7xl font-black tracking-tighter mb-4">
          DCAI{' '}
          <span className="glow-text-cyan text-transparent bg-clip-text bg-gradient-to-b from-cyan-300 to-cyan-600">FOUNDATION</span>
        </h1>
        <p className="font-mono text-gold-500/60 max-w-2xl mx-auto">
          EXPLORE THE DCAI L3 NETWORK. REAL-TIME DATA STREAMING. UNCOMPROMISED SECURITY.
        </p>
      </motion.div>

      <motion.div
        initial={{ y: 20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ delay: 0.2 }}
        className="w-full max-w-3xl relative z-10 group px-4"
      >
        <div className="absolute -inset-1 bg-gradient-to-r from-gold-600 via-cyan-500 to-gold-400 rounded-xl blur opacity-20 group-hover:opacity-40 transition duration-500" />
        <div className="relative flex items-center bg-dark-800/90 backdrop-blur-sm border border-cyan-500/40 rounded-xl p-2 shadow-[0_0_30px_rgba(0,240,255,0.1)]">
          <div className="pl-4 pr-2">
            <Search className="w-6 h-6 text-cyan-400" />
          </div>
          <input
            type="text"
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              if (err) setErr(null);
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') doSearch();
            }}
            placeholder="Search by Address / Txn Hash / Block / Token..."
            className="w-full bg-transparent border-none outline-none text-gold-500 placeholder-gold-500/40 font-mono text-sm sm:text-lg py-3"
          />
          <button
            onClick={doSearch}
            disabled={searching}
            className={`bg-cyan-500 text-dark-900 px-4 sm:px-8 py-3 rounded-lg font-bold font-mono transition-colors shadow-[0_0_15px_rgba(0,240,255,0.5)] ${searching ? 'opacity-60 cursor-not-allowed' : 'hover:bg-cyan-400'}`}
          >
            {searching ? 'SCANNING…' : 'SCAN'}
          </button>
        </div>

        {err ? <div className="mt-3 text-[11px] font-mono text-rose-300">{err}</div> : null}
      </motion.div>
    </div>
  );
};

export default Hero;
