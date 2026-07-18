import { useEffect, useRef, useState } from 'react';
import { navigateTo, FX_OFF } from '../lib/api';
import { shortAddr } from '../lib/format';
import { LivePill } from './ui';

// Live chain visualization: the most recent blocks as neon nodes (colored by
// Clique signer), ambient transaction dots streaming toward the pulsing
// "incoming" slot, and a one-shot slide when a new block seals. One canvas,
// one rAF loop; paused when the tab is hidden. Under prefers-reduced-motion
// or ?fx=off the panel renders a fully settled static frame (no slide is ever
// armed and the incoming slot stays visible).

export type PulseBlock = {
  height: number;
  validator: string;
  txCount: number;
  timestamp?: string;
};

export const SIGNER_COLORS = ['#f0b90b', '#22d3ee', '#c084fc', '#34d399', '#fb7185'];

const SLOT = 92; // px per block slot
const BLOCK_SIZE = 34;
const EDGE_FADE = 96; // left fade width; outgoing blocks exit through it
const LEGEND_MAX = 6;

type Dot = { p: number; lane: number; speed: number; hue: number };

type PulseState = {
  blocks: PulseBlock[];
  lastTop: number | null;
  shift: number; // 1 -> 0 slide progress after a new block
  dots: Dot[];
  signerIndex: Map<string, number>;
};

export default function ChainPulse({ blocks }: { blocks: PulseBlock[] }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const drawRef = useRef<(() => void) | null>(null);
  // bumped when a signer is seen for the first time so the legend re-renders
  const [legendVersion, setLegendVersion] = useState(0);
  const stateRef = useRef<PulseState>({
    blocks: [],
    lastTop: null,
    shift: 0,
    dots: [],
    signerIndex: new Map(),
  });

  // Feed fresh chain data into the animation state.
  useEffect(() => {
    const st = stateRef.current;
    const newest = blocks[0]?.height ?? null;
    // Never arm the slide in static mode — it can only decay via draw calls,
    // and at static cadence it would sit mid-slide forever.
    if (!FX_OFF && newest != null && st.lastTop != null && newest > st.lastTop) st.shift = 1;
    if (newest != null) st.lastTop = newest;
    st.blocks = blocks;

    let newSigner = false;
    for (const b of blocks) {
      const v = (b.validator || '').toLowerCase();
      if (v && !st.signerIndex.has(v)) {
        st.signerIndex.set(v, st.signerIndex.size % SIGNER_COLORS.length);
        newSigner = true;
      }
    }
    if (newSigner) setLegendVersion((x) => x + 1);

    // keep the static frame fresh even when rAF is throttled (background tab)
    drawRef.current?.();
  }, [blocks]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const wrap = wrapRef.current;
    if (!canvas || !wrap) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const st = stateRef.current;
    if (!st.dots.length) {
      for (let i = 0; i < 16; i++) {
        st.dots.push({
          p: Math.random(),
          lane: (Math.random() - 0.5) * 2,
          speed: 0.045 + Math.random() * 0.09,
          hue: Math.random(),
        });
      }
    }

    let raf = 0;
    let running = false;
    let lastT = 0;
    let W = 0;
    let H = 0;

    const resize = () => {
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      W = wrap.clientWidth;
      H = 128;
      canvas.width = Math.max(1, Math.floor(W * dpr));
      canvas.height = Math.max(1, Math.floor(H * dpr));
      canvas.style.width = `${W}px`;
      canvas.style.height = `${H}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };

    const roundRect = (x: number, y: number, w: number, h: number, r: number) => {
      ctx.beginPath();
      ctx.moveTo(x + r, y);
      ctx.arcTo(x + w, y, x + w, y + h, r);
      ctx.arcTo(x + w, y + h, x, y + h, r);
      ctx.arcTo(x, y + h, x, y, r);
      ctx.arcTo(x, y, x + w, y, r);
      ctx.closePath();
    };

    const draw = (t: number) => {
      // Animation dt (clamped — dots shouldn't teleport after a long gap);
      // slide decay uses wall-clock dt so infrequent draws still settle it.
      const rawDt = lastT ? (t - lastT) / 1000 : 0.016;
      const dt = Math.min(0.05, rawDt);
      const wallDt = Math.min(0.5, rawDt);
      lastT = t;

      ctx.clearRect(0, 0, W, H);

      const baseline = H * 0.42;
      const marginL = 16;
      const marginR = 16;
      const incomingX = W - marginR - BLOCK_SIZE - 26;

      // faint vertical grid
      ctx.strokeStyle = 'rgba(255,255,255,0.025)';
      ctx.lineWidth = 1;
      for (let gx = marginL; gx < W - marginR; gx += 46) {
        ctx.beginPath();
        ctx.moveTo(gx, 10);
        ctx.lineTo(gx, H - 26);
        ctx.stroke();
      }

      // chain baseline
      ctx.strokeStyle = 'rgba(34,211,238,0.16)';
      ctx.beginPath();
      ctx.moveTo(marginL, baseline);
      ctx.lineTo(incomingX + BLOCK_SIZE / 2, baseline);
      ctx.stroke();

      // decay the new-block slide (never armed in FX_OFF mode)
      if (st.shift > 0) st.shift = Math.max(0, st.shift - wallDt * 3.2);
      const ease = st.shift * st.shift * (3 - 2 * st.shift); // smoothstep
      const shiftPx = ease * SLOT;

      // ambient tx dots flowing toward the incoming slot
      const lineLen = incomingX - marginL;
      for (const d of st.dots) {
        if (!FX_OFF) d.p += d.speed * dt;
        if (d.p > 1) {
          d.p = 0;
          d.lane = (Math.random() - 0.5) * 2;
          d.hue = Math.random();
        }
        const dx = marginL + d.p * lineLen;
        const wob = Math.sin(d.p * Math.PI * 3 + d.lane * 5) * 4 * d.lane;
        const dy = baseline + wob;
        const near = Math.min(1, (1 - d.p) * 6); // fade as they merge into incoming
        const col = d.hue < 0.55 ? '34,211,238' : '240,185,11';
        ctx.fillStyle = `rgba(${col},${0.25 + 0.45 * near})`;
        ctx.beginPath();
        ctx.arc(dx, dy, 1.7, 0, Math.PI * 2);
        ctx.fill();
      }

      // blocks (newest at the right, next to incoming). Render one extra so
      // the block leaving the window slides out through the edge fade
      // instead of popping.
      const visible = Math.max(2, Math.floor((incomingX - marginL - 20) / SLOT));
      const list = st.blocks.slice(0, visible + 1);
      ctx.font = '9px "JetBrains Mono", monospace';
      ctx.textAlign = 'center';
      list.forEach((b, i) => {
        const cx = incomingX - (i + 1) * SLOT + shiftPx;
        if (cx < marginL - SLOT / 2) return;
        const x = cx - BLOCK_SIZE / 2;
        const y = baseline - BLOCK_SIZE / 2;
        const v = (b.validator || '').toLowerCase();
        const color = SIGNER_COLORS[st.signerIndex.get(v) ?? 0] || SIGNER_COLORS[0];
        const isNewest = i === 0;

        // connector node on the baseline between blocks
        ctx.fillStyle = 'rgba(34,211,238,0.5)';
        ctx.beginPath();
        ctx.arc(cx + SLOT / 2, baseline, 2, 0, Math.PI * 2);
        ctx.fill();

        // halo (double stroke — cheaper than shadowBlur)
        roundRect(x - 1.5, y - 1.5, BLOCK_SIZE + 3, BLOCK_SIZE + 3, 8);
        ctx.strokeStyle = `${color}30`;
        ctx.lineWidth = 3;
        ctx.stroke();

        roundRect(x, y, BLOCK_SIZE, BLOCK_SIZE, 7);
        ctx.fillStyle = isNewest ? 'rgba(23,27,33,0.98)' : 'rgba(18,21,26,0.95)';
        ctx.fill();
        ctx.strokeStyle = color;
        ctx.lineWidth = 1;
        ctx.stroke();

        // tx count inside (or a dim idle dot)
        if (b.txCount > 0) {
          ctx.fillStyle = color;
          ctx.font = 'bold 11px "JetBrains Mono", monospace';
          ctx.fillText(String(b.txCount), cx, baseline + 4);
          ctx.font = '9px "JetBrains Mono", monospace';
        } else {
          ctx.fillStyle = `${color}55`;
          ctx.beginPath();
          ctx.arc(cx, baseline, 2.2, 0, Math.PI * 2);
          ctx.fill();
        }

        // height label (newest label fades in as the block settles into place)
        const labelAlpha = isNewest ? Math.max(0, 1 - ease * 1.6) : 1;
        ctx.fillStyle = isNewest
          ? `rgba(232,234,238,${0.85 * labelAlpha})`
          : 'rgba(110,118,131,0.9)';
        ctx.fillText(`#${b.height}`, cx, baseline + BLOCK_SIZE / 2 + 16);
      });

      // incoming slot — fades out while a freshly sealed block passes over it
      const handoff = Math.max(0, 1 - ease * 2.2);
      const pulse = (FX_OFF ? 0.6 : 0.45 + 0.35 * Math.sin(t / 320)) * handoff;
      const ix = incomingX;
      const iy = baseline - BLOCK_SIZE / 2;
      ctx.setLineDash([4, 4]);
      roundRect(ix, iy, BLOCK_SIZE, BLOCK_SIZE, 7);
      ctx.strokeStyle = `rgba(240,185,11,${pulse})`;
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = `rgba(240,185,11,${pulse * 0.9})`;
      ctx.beginPath();
      ctx.arc(ix + BLOCK_SIZE / 2, baseline, 2.4, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = `rgba(240,185,11,${0.6 * handoff})`;
      ctx.fillText('incoming', ix + BLOCK_SIZE / 2, baseline + BLOCK_SIZE / 2 + 16);

      // edge fade into the panel background
      const fade = ctx.createLinearGradient(0, 0, EDGE_FADE, 0);
      fade.addColorStop(0, 'rgba(12,14,17,1)');
      fade.addColorStop(1, 'rgba(12,14,17,0)');
      ctx.fillStyle = fade;
      ctx.fillRect(0, 0, EDGE_FADE, H);
    };

    const loop = (t: number) => {
      if (!running) return;
      draw(t);
      raf = requestAnimationFrame(loop);
    };

    const start = () => {
      if (running || FX_OFF) return;
      running = true;
      lastT = 0;
      raf = requestAnimationFrame(loop);
    };
    const stop = () => {
      running = false;
      cancelAnimationFrame(raf);
    };

    drawRef.current = () => draw(performance.now());
    resize();

    if (FX_OFF) {
      // static render, refreshed only when data changes (cheap 1s cadence)
      draw(performance.now());
      const id = window.setInterval(() => draw(performance.now()), 1000);
      const ro = new ResizeObserver(() => { resize(); draw(performance.now()); });
      ro.observe(wrap);
      return () => { window.clearInterval(id); ro.disconnect(); drawRef.current = null; };
    }

    // One synchronous frame so the panel is never blank even if rAF is
    // throttled (background tab) before the loop gets going.
    draw(performance.now());
    start();
    const onVis = () => (document.hidden ? stop() : start());
    document.addEventListener('visibilitychange', onVis);
    const ro = new ResizeObserver(() => { resize(); draw(performance.now()); });
    ro.observe(wrap);
    return () => {
      stop();
      document.removeEventListener('visibilitychange', onVis);
      ro.disconnect();
      drawRef.current = null;
    };
  }, []);

  // Signer legend (first-seen order, matches canvas colors). legendVersion
  // bumps whenever a new signer is recorded, so this stays in sync.
  void legendVersion;
  const seen: { addr: string; color: string }[] = [];
  for (const [addr, i] of stateRef.current.signerIndex) {
    if (seen.length >= LEGEND_MAX) break;
    seen.push({ addr, color: SIGNER_COLORS[i] || SIGNER_COLORS[0] });
  }

  return (
    <div className="hud-corners relative rounded-xl border border-cyan/15 bg-ink-900 mb-6">
      <div className="scanlines relative overflow-hidden rounded-xl">
        <div className="flex items-center justify-between gap-3 px-4 pt-3">
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-mono uppercase tracking-[0.2em] text-cyan/80 glow-cyan-text">Chain pulse</span>
            <LivePill label="" />
          </div>
          <div className="flex items-center gap-3 flex-wrap">
            {seen.map((s) => (
              <button
                key={s.addr}
                onClick={() => navigateTo(`/address/${s.addr}`)}
                title={s.addr}
                className="inline-flex items-center gap-1.5 text-[10px] font-mono text-txt-3 hover:text-txt transition-colors"
              >
                <span className="w-1.5 h-1.5 rounded-full inline-block" style={{ backgroundColor: s.color }} />
                {shortAddr(s.addr)}
              </button>
            ))}
          </div>
        </div>
        <div ref={wrapRef} className="relative">
          <canvas ref={canvasRef} className="block w-full" aria-hidden="true" />
          {!blocks.length ? (
            <div className="absolute inset-0 flex items-center justify-center text-[11px] font-mono text-txt-3">
              syncing chain…
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
