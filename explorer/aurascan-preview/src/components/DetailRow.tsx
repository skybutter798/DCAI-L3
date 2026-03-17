import { motion, AnimatePresence } from 'motion/react';
import { useState, useEffect, useRef } from 'react';
import { Search, Activity, Zap, Globe, Database, Hash, Clock, Box, ArrowRightLeft, Cpu, ChevronRight, ChevronLeft, CheckCircle2, Layers, Info, Code2, Menu, X, List } from 'lucide-react';

const DetailRow = ({ label, value, isCyan = false, onCopy }: { label: string, value: string | number, isCyan?: boolean, onCopy?: () => void }) => (
  <div className="flex flex-col gap-1 border-b border-gold-500/10 pb-4">
    <span className="text-xs font-mono text-gold-500/50">{label}</span>
    <div className="flex items-start justify-between gap-3">
      <div className={`text-sm font-mono break-all ${isCyan ? 'text-cyan-400 glow-text-cyan' : 'text-gold-400'}`}>
        {value}
      </div>
      {onCopy ? (
        <button
          onClick={onCopy}
          className="shrink-0 w-6 h-6 inline-flex items-center justify-center text-[11px] font-mono text-cyan-300 border border-cyan-500/25 hover:border-cyan-400 rounded transition-colors"
        >
          ⧉
        </button>
      ) : null}
    </div>
  </div>
);

export default DetailRow;
