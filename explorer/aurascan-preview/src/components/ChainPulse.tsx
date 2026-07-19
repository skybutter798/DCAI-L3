import { useEffect, useMemo, useRef, useState } from 'react';
import { navigateTo, FX_OFF } from '../lib/api';
import { shortAddr } from '../lib/format';
import { LivePill } from './ui';

export type PulseBlock = {
  height: number;
  validator: string;
  txCount: number;
  timestamp?: string;
  gasUsed?: string | number;
  gasLimit?: string | number;
  _new?: boolean;
};

const RECENT_BLOCKS = 5;

function formatHeight(height: number) {
  return Number.isFinite(height) ? height.toLocaleString('en-US') : '--';
}

function blockAge(timestamp?: string) {
  if (!timestamp) return 'just now';
  const ms = Date.now() - new Date(timestamp).getTime();
  if (!Number.isFinite(ms) || ms < 2_000) return 'just now';
  if (ms < 60_000) return `${Math.max(2, Math.floor(ms / 1000))}s ago`;
  return `${Math.floor(ms / 60_000)}m ago`;
}

function gasPercent(block?: PulseBlock) {
  const used = Number(block?.gasUsed ?? 0);
  const limit = Number(block?.gasLimit ?? 0);
  if (!Number.isFinite(used) || !Number.isFinite(limit) || limit <= 0) return 0;
  return Math.max(0, Math.min(100, (used / limit) * 100));
}

function signerLabel(validator?: string) {
  return validator ? shortAddr(validator) : 'resolving…';
}

export default function ChainPulse({ blocks }: { blocks: PulseBlock[] }) {
  const previousHead = useRef<number | null>(null);
  const [arrivingHeight, setArrivingHeight] = useState<number | null>(null);
  const newest = blocks[0];

  useEffect(() => {
    const height = newest?.height;
    if (!Number.isFinite(height)) return;
    const prior = previousHead.current;
    previousHead.current = height;
    if (FX_OFF || prior == null || height <= prior) return;
    setArrivingHeight(height);
    const timer = window.setTimeout(() => setArrivingHeight(null), 900);
    return () => window.clearTimeout(timer);
  }, [newest?.height]);

  const recent = useMemo(
    () => blocks.slice(0, RECENT_BLOCKS).reverse(),
    [blocks],
  );

  const activeSigners = useMemo(() => {
    const seen = new Set<string>();
    const result: string[] = [];
    for (const block of blocks) {
      const signer = String(block.validator || '').toLowerCase();
      if (!signer || seen.has(signer)) continue;
      seen.add(signer);
      result.push(signer);
      if (result.length === 4) break;
    }
    return result;
  }, [blocks]);

  const latestGas = gasPercent(newest);
  const isArriving = newest != null && arrivingHeight === newest.height;

  return (
    <section
      className="hud-corners relative mb-6 rounded-xl border border-cyan/15 bg-ink-900"
      aria-label="Live block arrival flow"
    >
      <div className="scanlines relative overflow-hidden rounded-xl">
        <div className="flex flex-wrap items-end justify-between gap-3 border-b border-line px-4 py-3">
          <div>
            <div className="flex items-center gap-2">
              <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-cyan/80 glow-cyan-text">
                Block arrival flow
              </span>
              <LivePill label="" />
            </div>
            <div className="mt-1 font-mono text-[11px] text-txt-3">
              seal → RPC → Explorer · ~2.0s cadence
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-end gap-3">
            <span className="font-mono text-[10px] text-txt-3">active signers</span>
            {activeSigners.map((address) => (
              <button
                key={address}
                type="button"
                onClick={() => navigateTo(`/address/${address}`)}
                className="inline-flex items-center gap-1.5 font-mono text-[10px] text-txt-2 transition-colors hover:text-txt"
                title={address}
              >
                <span className="inline-block h-1.5 w-1.5 rounded-full bg-gold/70" aria-hidden="true" />
                {shortAddr(address)}
              </button>
            ))}
          </div>
        </div>

        {newest ? (
          <>
            <div className="grid grid-cols-1 border-b border-line sm:grid-cols-3">
              <div className="px-4 py-3 sm:border-r sm:border-line">
                <div className="font-mono text-[9px] uppercase tracking-[0.16em] text-txt-3">New block</div>
                <div className="mt-1 font-mono text-lg font-semibold tabular-nums text-txt">
                  #{formatHeight(newest.height)}
                </div>
                <div className="mt-0.5 font-mono text-[10px] text-cyan">{blockAge(newest.timestamp)}</div>
              </div>
              <div className="border-t border-line px-4 py-3 sm:border-r sm:border-t-0">
                <div className="font-mono text-[9px] uppercase tracking-[0.16em] text-txt-3">Payload</div>
                <div className="mt-1 font-mono text-lg font-semibold tabular-nums text-txt">
                  {newest.txCount} <span className="text-[11px] font-normal text-txt-3">txs</span>
                </div>
                <div className="mt-0.5 font-mono text-[10px] text-gold">{latestGas.toFixed(1)}% gas used</div>
              </div>
              <div className="border-t border-line px-4 py-3 sm:border-t-0">
                <div className="font-mono text-[9px] uppercase tracking-[0.16em] text-txt-3">Signer</div>
                <button
                  type="button"
                  disabled={!newest.validator}
                  onClick={() => newest.validator && navigateTo(`/address/${newest.validator}`)}
                  className="mt-1 block font-mono text-lg font-semibold text-txt transition-colors enabled:hover:text-cyan disabled:cursor-default"
                  title={newest.validator || undefined}
                >
                  {signerLabel(newest.validator)}
                </button>
                <div className="mt-0.5 font-mono text-[10px] text-ok">sealed</div>
              </div>
            </div>

            <div className="px-4 py-4">
              <div
                className="relative grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6"
                role="list"
                aria-label="Five recent blocks followed by the next expected block"
              >
                <div className="pointer-events-none absolute left-[5%] right-[5%] top-7 hidden h-px bg-line lg:block" aria-hidden="true" />
                {recent.map((block) => {
                  const latest = block.height === newest.height;
                  const gas = gasPercent(block);
                  return (
                    <button
                      key={block.height}
                      type="button"
                      role="listitem"
                      onClick={() => navigateTo(`/block/${block.height}`)}
                      className={`relative z-[1] min-w-0 rounded-lg border px-3 py-2.5 text-left transition-colors ${
                        latest
                          ? `border-cyan/55 bg-cyan/[0.08] hover:bg-cyan/[0.12] ${isArriving ? 'block-arrival-enter' : ''}`
                          : 'border-line bg-ink-800/90 hover:border-gold/35 hover:bg-ink-750'
                      }`}
                      aria-label={`Block ${block.height}, ${block.txCount} transactions, signer ${signerLabel(block.validator)}`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className={`truncate font-mono text-[11px] font-medium ${latest ? 'text-cyan' : 'text-txt-2'}`}>
                          #{String(block.height).slice(-6)}
                        </span>
                        <span className={`h-2 w-2 shrink-0 rounded-sm ${latest ? 'bg-cyan' : 'bg-gold/55'}`} aria-hidden="true" />
                      </div>
                      <div className="mt-2 h-1 overflow-hidden rounded-full bg-ink-700" aria-label={`${gas.toFixed(1)}% gas used`}>
                        <span
                          className={`block h-full rounded-full ${latest ? 'bg-cyan' : 'bg-gold/60'}`}
                          style={{ width: `${Math.max(3, gas)}%` }}
                        />
                      </div>
                      <div className="mt-2 flex items-center justify-between gap-2 font-mono text-[9px] text-txt-3">
                        <span>{block.txCount} txs</span>
                        <span>{signerLabel(block.validator)}</span>
                      </div>
                    </button>
                  );
                })}

                <div
                  role="listitem"
                  className="relative z-[1] grid min-h-[76px] place-items-center rounded-lg border border-dashed border-gold/35 bg-gold/[0.025] px-3 py-2.5 text-center"
                  aria-label="Waiting for the next block, expected in about two seconds"
                >
                  <div>
                    <span className="mx-auto block h-2 w-2 rounded-sm bg-gold/55" aria-hidden="true" />
                    <div className="mt-2 font-mono text-[10px] text-gold/80">next block</div>
                    <div className="mt-0.5 font-mono text-[9px] text-txt-3">~2.0s</div>
                  </div>
                </div>
              </div>

              <div className="mt-5 grid grid-cols-2 gap-x-3 gap-y-4 md:grid-cols-4" aria-label="Latest block lifecycle">
                {[
                  { step: '1', label: 'Proposed', value: `#${newest.height}` },
                  { step: '2', label: 'Signer sealed', value: signerLabel(newest.validator) },
                  { step: '3', label: 'RPC observed', value: 'chainId 18441' },
                  { step: '4', label: 'Explorer indexed', value: blockAge(newest.timestamp) },
                ].map((phase, index) => (
                  <div key={phase.label} className="relative flex min-w-0 items-center gap-2">
                    {index > 0 ? <span className="absolute -left-3 top-3 hidden h-px w-3 bg-line md:block" aria-hidden="true" /> : null}
                    <span
                      className={`grid h-6 w-6 shrink-0 place-items-center rounded-full border font-mono text-[9px] ${
                        index === 3 ? 'border-cyan bg-cyan text-ink-950' : 'border-gold/45 bg-gold/[0.08] text-gold'
                      }`}
                      aria-hidden="true"
                    >
                      {phase.step}
                    </span>
                    <div className="min-w-0">
                      <div className="truncate text-[11px] font-medium text-txt-2">{phase.label}</div>
                      <div className="truncate font-mono text-[9px] text-txt-3">{phase.value}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-[auto_minmax(0,1fr)] items-center gap-3 border-t border-line px-4 py-3 sm:grid-cols-[auto_minmax(0,1fr)_auto]" aria-live="polite">
              <span className={`h-8 w-1.5 rounded-full bg-cyan ${isArriving ? 'block-event-signal' : ''}`} aria-hidden="true" />
              <div className="min-w-0">
                <div className="font-mono text-[9px] uppercase tracking-[0.16em] text-txt-3">Latest event</div>
                <div className="mt-0.5 truncate font-mono text-[10px] text-txt-2">
                  Block #{formatHeight(newest.height)} indexed · {signerLabel(newest.validator)} · {newest.txCount} transactions
                </div>
              </div>
              <div className="col-start-2 flex items-center gap-1.5 sm:col-start-auto" aria-label="Three settled chain markers">
                <span className="mr-1 font-mono text-[9px] text-txt-3">settled</span>
                <span className="h-1.5 w-1.5 rounded-full bg-gold/70" />
                <span className="h-1.5 w-1.5 rounded-full bg-gold/70" />
                <span className="h-1.5 w-1.5 rounded-full bg-gold/70" />
              </div>
            </div>
          </>
        ) : (
          <div className="flex min-h-48 items-center justify-center font-mono text-[11px] text-txt-3">
            syncing chain…
          </div>
        )}
      </div>
    </section>
  );
}
