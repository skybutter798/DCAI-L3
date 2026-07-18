import { useState, type ReactNode } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Copy, Check, ChevronLeft, ChevronRight, SearchX } from 'lucide-react';
import { copyToClipboard } from '../lib/api';

/* ---------------------------------- Cards ---------------------------------- */

export const Card = ({ className = '', children }: { className?: string; children: ReactNode }) => (
  <div className={`rounded-xl border border-line bg-ink-800 ${className}`}>{children}</div>
);

export const CardHead = ({
  title,
  meta,
  actions,
}: {
  title: ReactNode;
  meta?: ReactNode;
  actions?: ReactNode;
}) => (
  <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-line">
    <div className="flex items-center gap-2 min-w-0">
      <h2 className="text-[13px] font-semibold text-txt tracking-wide truncate">{title}</h2>
      {meta ? <span className="text-[11px] text-txt-3 font-mono truncate">{meta}</span> : null}
    </div>
    {actions ? <div className="flex items-center gap-2 shrink-0">{actions}</div> : null}
  </div>
);

/* -------------------------------- Page shell -------------------------------- */

export const Page = ({ children }: { children: ReactNode }) => (
  <motion.div
    initial={{ opacity: 0, y: 6 }}
    animate={{ opacity: 1, y: 0 }}
    exit={{ opacity: 0 }}
    transition={{ duration: 0.14 }}
    className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pb-16 pt-6 relative z-10"
  >
    {children}
  </motion.div>
);

export const PageTitle = ({
  title,
  accent,
  sub,
  right,
  onBack,
  backLabel,
}: {
  title: string;
  accent?: string;
  sub?: ReactNode;
  right?: ReactNode;
  onBack?: () => void;
  backLabel?: string;
}) => (
  <div className="mb-5">
    {onBack ? (
      <button
        onClick={onBack}
        className="mb-3 inline-flex items-center gap-1 text-[12px] text-txt-2 hover:text-cyan transition-colors"
      >
        <ChevronLeft className="w-3.5 h-3.5" /> {backLabel || 'Back'}
      </button>
    ) : null}
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div className="min-w-0">
        <h1 className="text-xl font-bold tracking-tight text-txt">
          {title}
          {accent ? <span className="text-gold"> {accent}</span> : null}
        </h1>
        {sub ? <div className="mt-1.5 text-[12px] text-txt-2 break-all">{sub}</div> : null}
      </div>
      {right ? <div className="shrink-0">{right}</div> : null}
    </div>
  </div>
);

/* --------------------------------- Badges ---------------------------------- */

type BadgeTone = 'neutral' | 'gold' | 'cyan' | 'ok' | 'bad' | 'warn';

const badgeTones: Record<BadgeTone, string> = {
  neutral: 'border-line text-txt-2 bg-ink-750',
  gold: 'border-gold/30 text-gold bg-gold/10',
  cyan: 'border-cyan/30 text-cyan bg-cyan/10',
  ok: 'border-ok/30 text-ok bg-ok/10',
  bad: 'border-bad/30 text-bad bg-bad/10',
  warn: 'border-warn/30 text-warn bg-warn/10',
};

export const Badge = ({
  tone = 'neutral',
  className = '',
  children,
  title,
}: {
  tone?: BadgeTone;
  className?: string;
  children: ReactNode;
  title?: string;
}) => (
  <span
    title={title}
    className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded border text-[10px] font-mono leading-4 whitespace-nowrap ${badgeTones[tone]} ${className}`}
  >
    {children}
  </span>
);

export const StatusBadge = ({ status }: { status: any }) => {
  const s = String(status ?? '').toLowerCase();
  if (s === 'ok' || s === 'success') return <Badge tone="ok">success</Badge>;
  if (!s || s === '--' || s === 'null' || s === 'pending') return <Badge tone="warn">pending</Badge>;
  return <Badge tone="bad" title={String(status)}>failed</Badge>;
};

export const LivePill = ({ label = 'live' }: { label?: string }) => (
  <span className="inline-flex items-center gap-1.5 text-[10px] font-mono text-cyan">
    <span className="live-dot w-1.5 h-1.5 rounded-full bg-cyan inline-block" />
    {label}
  </span>
);

/* --------------------------------- Buttons ---------------------------------- */

export const Btn = ({
  onClick,
  disabled,
  tone = 'ghost',
  className = '',
  children,
  title,
}: {
  onClick?: () => void;
  disabled?: boolean;
  tone?: 'primary' | 'ghost' | 'danger' | 'ok';
  className?: string;
  children: ReactNode;
  title?: string;
}) => {
  const tones = {
    primary: disabled
      ? 'bg-gold/20 text-ink-950/60 cursor-not-allowed'
      : 'bg-gold text-ink-950 hover:bg-gold-2 font-semibold',
    ghost: disabled
      ? 'border border-line text-txt-3 cursor-not-allowed'
      : 'border border-line text-txt-2 hover:text-txt hover:border-line-2',
    danger: disabled
      ? 'border border-line text-txt-3 cursor-not-allowed'
      : 'border border-bad/30 text-bad hover:border-bad/60',
    ok: disabled
      ? 'border border-line text-txt-3 cursor-not-allowed'
      : 'border border-ok/30 text-ok hover:border-ok/60',
  };
  return (
    <button
      title={title}
      disabled={disabled}
      onClick={onClick}
      className={`px-3 py-1.5 rounded-lg text-[12px] transition-colors ${tones[tone]} ${className}`}
    >
      {children}
    </button>
  );
};

/* ------------------------------ Copy interaction ------------------------------ */

export const CopyBtn = ({ value, label }: { value: string; label?: string }) => {
  const [done, setDone] = useState(false);
  return (
    <button
      title={`Copy ${label || 'value'}`}
      onClick={async (e) => {
        e.stopPropagation();
        const ok = await copyToClipboard(value);
        if (ok) {
          setDone(true);
          setTimeout(() => setDone(false), 1200);
        }
      }}
      className="shrink-0 inline-flex items-center justify-center w-5 h-5 rounded text-txt-3 hover:text-cyan transition-colors"
    >
      {done ? <Check className="w-3 h-3 text-ok" /> : <Copy className="w-3 h-3" />}
    </button>
  );
};

/* ---------------------------------- Links ----------------------------------- */

export const LinkText = ({
  onClick,
  children,
  tone = 'cyan',
  className = '',
  title,
}: {
  onClick?: () => void;
  children: ReactNode;
  tone?: 'cyan' | 'gold' | 'muted';
  className?: string;
  title?: string;
}) => {
  const tones = {
    cyan: 'text-cyan hover:text-cyan-2',
    gold: 'text-gold hover:text-gold-2',
    muted: 'text-txt-2 hover:text-cyan',
  };
  return (
    <button
      title={title}
      onClick={onClick}
      className={`text-left font-mono transition-colors ${tones[tone]} ${className}`}
    >
      {children}
    </button>
  );
};

/* ----------------------------------- Tabs ------------------------------------ */

export const Tabs = ({
  tabs,
  active,
  onChange,
}: {
  tabs: { k: string; label: string }[];
  active: string;
  onChange: (k: string) => void;
}) => (
  <div className="flex items-center gap-1 border-b border-line mb-4 overflow-x-auto hide-scrollbar">
    {tabs.map((t) => (
      <button
        key={t.k}
        onClick={() => onChange(t.k)}
        className={`relative px-3 py-2 text-[12px] whitespace-nowrap transition-colors ${
          active === t.k ? 'text-gold font-semibold' : 'text-txt-2 hover:text-txt'
        }`}
      >
        {t.label}
        {active === t.k ? (
          <motion.span
            layoutId="tab-underline"
            className="absolute inset-x-2 -bottom-px h-0.5 bg-gold rounded-full"
            transition={{ type: 'spring', stiffness: 400, damping: 34 }}
          />
        ) : null}
      </button>
    ))}
  </div>
);

/* ----------------------------------- Pager ----------------------------------- */

export const Pager = ({
  canPrev,
  canNext,
  onPrev,
  onNext,
}: {
  canPrev: boolean;
  canNext: boolean;
  onPrev: () => void;
  onNext: () => void;
}) => (
  <div className="flex items-center gap-1.5">
    <button
      disabled={!canPrev}
      onClick={onPrev}
      className={`inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border text-[11px] transition-colors ${
        canPrev ? 'border-line text-txt-2 hover:text-txt hover:border-line-2' : 'border-line/50 text-txt-3/50 cursor-not-allowed'
      }`}
    >
      <ChevronLeft className="w-3 h-3" /> Prev
    </button>
    <button
      disabled={!canNext}
      onClick={onNext}
      className={`inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border text-[11px] transition-colors ${
        canNext ? 'border-line text-txt-2 hover:text-txt hover:border-line-2' : 'border-line/50 text-txt-3/50 cursor-not-allowed'
      }`}
    >
      Next <ChevronRight className="w-3 h-3" />
    </button>
  </div>
);

/* ---------------------------------- Tables ----------------------------------- */

export const Table = ({ children, className = '' }: { children: ReactNode; className?: string }) => (
  <div className={`overflow-x-auto ${className}`}>
    <table className="w-full text-[12px]">{children}</table>
  </div>
);

export const Th = ({ children, right = false, className = '' }: { children?: ReactNode; right?: boolean; className?: string }) => (
  <th
    className={`px-3 py-2 font-medium text-[10px] uppercase tracking-wider text-txt-3 whitespace-nowrap ${
      right ? 'text-right' : 'text-left'
    } ${className}`}
  >
    {children}
  </th>
);

export const Td = ({
  children,
  right = false,
  mono = false,
  className = '',
  title,
}: {
  children?: ReactNode;
  right?: boolean;
  mono?: boolean;
  className?: string;
  title?: string;
}) => (
  <td
    title={title}
    className={`px-3 py-2 align-middle whitespace-nowrap ${right ? 'text-right' : 'text-left'} ${
      mono ? 'font-mono tnum' : ''
    } ${className}`}
  >
    {children}
  </td>
);

export const TRow = ({ children, flash = false }: { children: ReactNode; flash?: boolean }) => (
  <tr className={`border-t border-line/60 hover:bg-ink-750/60 transition-colors ${flash ? 'row-flash' : ''}`}>
    {children}
  </tr>
);

export const SkeletonRows = ({ rows = 5, cols = 5 }: { rows?: number; cols?: number }) => (
  <>
    {Array.from({ length: rows }).map((_, r) => (
      <tr key={r} className="border-t border-line/60">
        {Array.from({ length: cols }).map((__, c) => (
          <td key={c} className="px-3 py-2.5">
            <div className="h-2.5 rounded bg-ink-700" style={{ width: `${55 + ((r * 7 + c * 13) % 40)}%` }} />
          </td>
        ))}
      </tr>
    ))}
  </>
);

export const Empty = ({ label = 'No data yet.' }: { label?: string }) => (
  <div className="flex flex-col items-center justify-center gap-2 py-10 text-txt-3">
    <SearchX className="w-5 h-5" />
    <div className="text-[12px]">{label}</div>
  </div>
);

/* --------------------------------- KV rows ----------------------------------- */

export const KV = ({
  label,
  children,
  copy,
}: {
  label: string;
  children: ReactNode;
  copy?: string;
}) => (
  <div className="flex flex-col sm:flex-row sm:items-start gap-1 sm:gap-4 py-2.5 border-b border-line/60 last:border-b-0">
    <div className="w-44 shrink-0 text-[11px] uppercase tracking-wider text-txt-3 pt-0.5">{label}</div>
    <div className="min-w-0 flex-1 flex items-start justify-between gap-2">
      <div className="text-[12px] text-txt break-all min-w-0">{children}</div>
      {copy ? <CopyBtn value={copy} label={label} /> : null}
    </div>
  </div>
);

/* --------------------------------- Gas bar ----------------------------------- */

export const GasBar = ({ pct }: { pct: number | null }) => {
  if (pct == null) return <span className="text-txt-3">--</span>;
  return (
    <span className="inline-flex items-center gap-2">
      <span className="inline-block w-12 h-1 rounded-full bg-ink-700 overflow-hidden">
        <span
          className={`block h-full rounded-full ${pct > 90 ? 'bg-warn' : 'bg-gold'}`}
          style={{ width: `${Math.max(2, pct)}%` }}
        />
      </span>
      <span className="text-txt-3 tnum">{pct.toFixed(1)}%</span>
    </span>
  );
};

/* ------------------------------ Stat tile (KPI) ------------------------------- */

export const StatTile = ({
  label,
  value,
  sub,
  live = false,
}: {
  label: string;
  value: ReactNode;
  sub?: ReactNode;
  live?: boolean;
}) => (
  <div className="rounded-xl border border-line bg-ink-800 px-3.5 py-3">
    <div className="flex items-center justify-between gap-2">
      <div className="text-[10px] uppercase tracking-wider text-txt-3">{label}</div>
      {live ? <LivePill label="" /> : null}
    </div>
    <div className="mt-1 text-lg font-semibold font-mono tnum text-txt leading-6 truncate">{value}</div>
    {sub ? <div className="mt-0.5 text-[10px] font-mono text-txt-3 truncate">{sub}</div> : null}
  </div>
);

/* ------------------------------- Notices/toasts ------------------------------- */

export const Notice = ({ tone = 'neutral', children }: { tone?: 'neutral' | 'bad' | 'warn' | 'ok'; children: ReactNode }) => {
  const tones = {
    neutral: 'border-line text-txt-2',
    bad: 'border-bad/30 text-bad',
    warn: 'border-warn/30 text-warn',
    ok: 'border-ok/30 text-ok',
  };
  return <div className={`mt-3 rounded-lg border px-3 py-2 text-[12px] ${tones[tone]}`}>{children}</div>;
};

export const Modal = ({
  open,
  onClose,
  children,
  title,
  wide = false,
}: {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
  title?: ReactNode;
  wide?: boolean;
}) => (
  <AnimatePresence>
    {open ? (
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.14 }}
        className="fixed inset-0 z-[80] bg-black/70 backdrop-blur-sm flex items-center justify-center p-4"
        onClick={onClose}
      >
        <motion.div
          initial={{ opacity: 0, y: 12, scale: 0.99 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 12 }}
          transition={{ duration: 0.16 }}
          onClick={(e) => e.stopPropagation()}
          className={`w-full ${wide ? 'max-w-4xl' : 'max-w-lg'} rounded-xl border border-line bg-ink-900 overflow-hidden`}
        >
          {title ? (
            <div className="flex items-center justify-between px-4 py-3 border-b border-line">
              <div className="text-[13px] font-semibold text-txt">{title}</div>
              <button onClick={onClose} className="text-txt-3 hover:text-txt text-lg leading-none px-1">×</button>
            </div>
          ) : null}
          {children}
        </motion.div>
      </motion.div>
    ) : null}
  </AnimatePresence>
);
