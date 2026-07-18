import { useEffect, useRef, useState } from 'react';
import { navigateTo, FX_OFF } from '../lib/api';
import { shortAddr } from '../lib/format';
import { LivePill } from './ui';

// Live chain visualization. Color language: settled blocks are uniform dim
// gold; ONLY the newest sealed block is cyan and the incoming slot is gold —
// the two brand colors carry the "now" of the chain. Node size scales with
// the block's transaction count. Sealing a block fires a burst: ripple
// rings + particles at the seal point, a white-hot border cooling to cyan,
// and an energy wave running left along the chain line.
// One canvas, one rAF loop; paused when the tab is hidden. Under
// prefers-reduced-motion or ?fx=off the panel renders a settled static frame
// (no slide/burst is ever armed).

export type PulseBlock = {
  height: number;
  validator: string;
  txCount: number;
  timestamp?: string;
};

const GOLD = '240,185,11';
const CYAN = '34,211,238';

const SLOT = 92; // px per block slot
const BASE_SIZE = 26; // node size for an empty block
const MAX_EXTRA = 16; // extra px at high tx counts
const INCOMING_SIZE = 34;
const EDGE_FADE = 96; // left fade width; outgoing blocks exit through it
const LEGEND_MAX = 6;

const sizeFor = (b: PulseBlock) => BASE_SIZE + Math.min(MAX_EXTRA, (b?.txCount || 0) * 4);

type Dot = { p: number; lane: number; speed: number; hue: number };
type Particle = { x: number; y: number; vx: number; vy: number; gold: boolean };

type PulseState = {
  blocks: PulseBlock[];
  lastTop: number | null;
  shift: number; // 1 -> 0 slide progress after a new block
  seal: number; // 1 -> 0 seal-burst progress
  sealArm: boolean; // set on new block; consumed by draw (needs canvas coords)
  particles: Particle[];
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
    seal: 0,
    sealArm: false,
    particles: [],
    dots: [],
    signerIndex: new Map(),
  });

  // Feed fresh chain data into the animation state.
  useEffect(() => {
    const st = stateRef.current;
    const newest = blocks[0]?.height ?? null;
    // Never arm the slide/burst in static mode — they can only decay via
    // draw calls, and at static cadence they would sit mid-flight forever.
    if (!FX_OFF && newest != null && st.lastTop != null && newest > st.lastTop) {
      st.shift = 1;
      st.sealArm = true;
    }
    if (newest != null) st.lastTop = newest;
    st.blocks = blocks;

    let newSigner = false;
    for (const b of blocks) {
      const v = (b.validator || '').toLowerCase();
      if (v && !st.signerIndex.has(v)) {
        st.signerIndex.set(v, st.signerIndex.size);
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

    const ring = (x: number, y: number, r: number, style: string, width: number) => {
      ctx.strokeStyle = style;
      ctx.lineWidth = width;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.stroke();
    };

    const draw = (t: number) => {
      // Animation dt (clamped — dots/particles shouldn't teleport after a
      // long gap); slide/burst decay uses wall-clock dt so infrequent draws
      // still settle them.
      const rawDt = lastT ? (t - lastT) / 1000 : 0.016;
      const dt = Math.min(0.05, rawDt);
      const wallDt = Math.min(0.5, rawDt);
      lastT = t;

      ctx.clearRect(0, 0, W, H);

      const baseline = H * 0.42;
      const marginL = 16;
      const marginR = 16;
      const incomingX = W - marginR - INCOMING_SIZE - 26;
      const sealX = incomingX + INCOMING_SIZE / 2;

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
      ctx.strokeStyle = `rgba(${CYAN},0.16)`;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(marginL, baseline);
      ctx.lineTo(sealX, baseline);
      ctx.stroke();

      // decay the new-block slide (never armed in FX_OFF mode)
      if (st.shift > 0) st.shift = Math.max(0, st.shift - wallDt * 3.2);
      const ease = st.shift * st.shift * (3 - 2 * st.shift); // smoothstep
      const shiftPx = ease * SLOT;

      // consume the seal trigger BEFORE the block loop so the white-hot
      // flash appears on the very frame the block arrives
      if (st.sealArm) {
        st.sealArm = false;
        st.seal = 1;
        st.particles = [];
        for (let i = 0; i < 14; i++) {
          const a = Math.random() * Math.PI * 2;
          const v = 26 + Math.random() * 55;
          st.particles.push({
            x: sealX,
            y: baseline,
            vx: Math.cos(a) * v,
            vy: Math.sin(a) * v * 0.7,
            gold: i % 2 === 0,
          });
        }
      }

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
        const col = d.hue < 0.55 ? CYAN : GOLD;
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
        const s = sizeFor(b);
        const x = cx - s / 2;
        const y = baseline - s / 2;
        const isNewest = i === 0;

        // connector node on the baseline between blocks
        ctx.fillStyle = `rgba(${CYAN},0.5)`;
        ctx.beginPath();
        ctx.arc(cx + SLOT / 2, baseline, 2, 0, Math.PI * 2);
        ctx.fill();

        // Uniform dim gold for settled blocks; cyan for the newest one.
        const strokeStyle = isNewest ? `rgba(${CYAN},1)` : `rgba(${GOLD},0.38)`;
        const haloStyle = isNewest ? `rgba(${CYAN},0.25)` : `rgba(${GOLD},0.10)`;

        // halo (double stroke — cheaper than shadowBlur)
        roundRect(x - 1.5, y - 1.5, s + 3, s + 3, 8);
        ctx.strokeStyle = haloStyle;
        ctx.lineWidth = 3;
        ctx.stroke();

        roundRect(x, y, s, s, 7);
        ctx.fillStyle = isNewest ? 'rgba(23,27,33,0.98)' : 'rgba(18,21,26,0.95)';
        ctx.fill();
        ctx.strokeStyle = strokeStyle;
        ctx.lineWidth = 1;
        ctx.stroke();

        // white-hot flash on the newest block, cooling to cyan as the seal
        // burst decays
        if (isNewest && st.seal > 0) {
          roundRect(x - 3, y - 3, s + 6, s + 6, 9);
          ctx.strokeStyle = `rgba(${CYAN},${0.35 * st.seal})`;
          ctx.lineWidth = 4;
          ctx.stroke();
          roundRect(x, y, s, s, 7);
          ctx.strokeStyle = `rgba(255,255,255,${0.75 * st.seal})`;
          ctx.lineWidth = 1;
          ctx.stroke();
        }

        // tx count inside (or a dim idle dot)
        if (b.txCount > 0) {
          ctx.fillStyle = isNewest ? `rgba(${CYAN},0.95)` : `rgba(${GOLD},0.8)`;
          ctx.font = 'bold 11px "JetBrains Mono", monospace';
          ctx.fillText(String(b.txCount), cx, baseline + 4);
          ctx.font = '9px "JetBrains Mono", monospace';
        } else {
          ctx.fillStyle = isNewest ? `rgba(${CYAN},0.5)` : `rgba(${GOLD},0.3)`;
          ctx.beginPath();
          ctx.arc(cx, baseline, 2.2, 0, Math.PI * 2);
          ctx.fill();
        }

        // height label (newest fades in as the block settles). Pinned to a
        // common baseline so different-sized nodes don't make the row ragged.
        const labelAlpha = isNewest ? Math.max(0, 1 - ease * 1.6) : 1;
        ctx.fillStyle = isNewest
          ? `rgba(${CYAN},${0.9 * labelAlpha})`
          : 'rgba(110,118,131,0.9)';
        ctx.fillText(`#${b.height}`, cx, baseline + (BASE_SIZE + MAX_EXTRA) / 2 + 14);
      });

      // ---- seal burst (rings/particles/wave overlay the blocks) ----
      if (st.seal > 0) {
        const sp = st.seal;

        // ripple rings expanding from the seal point
        ring(sealX, baseline, 8 + (1 - sp) * 40, `rgba(${CYAN},${0.5 * sp})`, 1.5);
        ring(sealX, baseline, 4 + (1 - sp) * 62, `rgba(${GOLD},${0.3 * sp})`, 1);

        // particle burst
        for (const p of st.particles) {
          p.x += p.vx * dt;
          p.y += p.vy * dt;
          p.vx *= 0.985;
          p.vy *= 0.985;
          ctx.fillStyle = `rgba(${p.gold ? GOLD : CYAN},${0.85 * sp})`;
          ctx.beginPath();
          ctx.arc(p.x, p.y, 1.6, 0, Math.PI * 2);
          ctx.fill();
        }

        // energy wave running left along the chain line as the block locks in
        const wx = marginL + (sealX - marginL) * sp;
        const wave = ctx.createLinearGradient(wx - 45, 0, wx + 45, 0);
        wave.addColorStop(0, `rgba(${CYAN},0)`);
        wave.addColorStop(0.5, `rgba(${CYAN},${0.65 * sp})`);
        wave.addColorStop(1, `rgba(${CYAN},0)`);
        ctx.strokeStyle = wave;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(Math.max(marginL, wx - 45), baseline);
        ctx.lineTo(Math.min(sealX, wx + 45), baseline);
        ctx.stroke();

        st.seal = Math.max(0, st.seal - wallDt * 1.25);
      }

      // incoming slot — fades out while a freshly sealed block passes over it
      const handoff = Math.max(0, 1 - ease * 2.2);
      const pulse = (FX_OFF ? 0.6 : 0.45 + 0.35 * Math.sin(t / 320)) * handoff;
      const ix = incomingX;
      const iy = baseline - INCOMING_SIZE / 2;
      ctx.setLineDash([4, 4]);
      roundRect(ix, iy, INCOMING_SIZE, INCOMING_SIZE, 7);
      ctx.strokeStyle = `rgba(${GOLD},${pulse})`;
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = `rgba(${GOLD},${pulse * 0.9})`;
      ctx.beginPath();
      ctx.arc(ix + INCOMING_SIZE / 2, baseline, 2.4, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = `rgba(${GOLD},${0.6 * handoff})`;
      ctx.fillText('incoming', ix + INCOMING_SIZE / 2, baseline + (BASE_SIZE + MAX_EXTRA) / 2 + 14);

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

    // ResizeObserver callbacks ride the rendering pipeline and never fire in
    // hidden/throttled tabs, and mount-time layout can report width 0 there —
    // so every out-of-band draw first re-checks the measured width.
    drawRef.current = () => {
      const cw = wrap.clientWidth;
      if (cw > 0 && cw !== W) resize();
      draw(performance.now());
    };
    resize();

    if (FX_OFF) {
      // static render, refreshed only when data changes (cheap 1s cadence)
      drawRef.current();
      const id = window.setInterval(() => drawRef.current?.(), 1000);
      const ro = new ResizeObserver(() => drawRef.current?.());
      ro.observe(wrap);
      return () => { window.clearInterval(id); ro.disconnect(); drawRef.current = null; };
    }

    // One synchronous frame so the panel is never blank even if rAF is
    // throttled (background tab) before the loop gets going.
    drawRef.current();
    start();
    const onVis = () => (document.hidden ? stop() : start());
    document.addEventListener('visibilitychange', onVis);
    const ro = new ResizeObserver(() => drawRef.current?.());
    ro.observe(wrap);
    return () => {
      stop();
      document.removeEventListener('visibilitychange', onVis);
      ro.disconnect();
      drawRef.current = null;
    };
  }, []);

  // Signer legend (first-seen order). Colors no longer encode signers on the
  // canvas — the legend simply lists the active validators.
  void legendVersion;
  const seen: string[] = [];
  for (const [addr] of stateRef.current.signerIndex) {
    if (seen.length >= LEGEND_MAX) break;
    seen.push(addr);
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
            <span className="text-[10px] font-mono text-txt-3/70">signers</span>
            {seen.map((addr) => (
              <button
                key={addr}
                onClick={() => navigateTo(`/address/${addr}`)}
                title={addr}
                className="inline-flex items-center gap-1.5 text-[10px] font-mono text-txt-3 hover:text-txt transition-colors"
              >
                <span className="w-1.5 h-1.5 rounded-full inline-block bg-gold/60" />
                {shortAddr(addr)}
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
