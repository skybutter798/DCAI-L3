import { motion, AnimatePresence } from 'motion/react';
import { useState, useEffect, useRef, lazy, Suspense } from 'react';
import {
  Search, Box, ArrowRightLeft, Cpu, Menu, X, Database, Code2, ShieldCheck,
} from 'lucide-react';

// The wallet-facing views are the only consumers of ethers (~2/3 of the old
// bundle). Lazy route chunks keep it out of the explorer's critical path.
//
// If a redeploy replaces the hashed chunks while a session still holds the old
// index.html, the dynamic import rejects — recover by reloading once (fresh
// index.html points at the new chunks) instead of white-screening.
const CHUNK_RETRY_KEY = 'aurascan-chunk-retry';
const lazyView = (load: () => Promise<{ default: any }>) =>
  lazy(() =>
    load()
      .then((m) => {
        sessionStorage.removeItem(CHUNK_RETRY_KEY);
        return m;
      })
      .catch(() => {
        if (!sessionStorage.getItem(CHUNK_RETRY_KEY)) {
          sessionStorage.setItem(CHUNK_RETRY_KEY, '1');
          window.location.reload();
          return new Promise<{ default: any }>(() => {});
        }
        sessionStorage.removeItem(CHUNK_RETRY_KEY);
        return {
          default: () => (
            <div className="max-w-7xl mx-auto px-4 py-10 text-[12px] text-txt-2">
              Failed to load this page module — please hard-refresh (Ctrl+Shift+R).
            </div>
          ),
        };
      })
  );

const ContributorProgram = lazyView(() => import('./ContributorProgram'));
const DashboardView = lazyView(() => import('./views/DashboardView'));
import { bs, rpc, rpcBlockNumber, resolveCliqueSigners, navigateTo, CHAIN_ID, NATIVE_SYMBOL, adminApiBase, publicBase } from './lib/api';
import { short, shortAddr, fmtWei, fmtUnits, fmtNum, timeAgo, fmtStamp, gasPct } from './lib/format';
import {
  Card, CardHead, Page, PageTitle, Badge, StatusBadge, LivePill, Btn, CopyBtn, LinkText,
  Tabs, Pager, Table, Th, Td, TRow, SkeletonRows, Empty, KV, GasBar, StatTile, Notice, Modal,
} from './components/ui';

/* ----------------------------- Shared helpers ------------------------------ */

// Suspense fallback while a lazy route chunk downloads.
const ViewLoading = () => (
  <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pb-16 pt-6 relative z-10">
    <div className="h-5 w-44 rounded bg-ink-700 mb-5" />
    <div className="rounded-xl border border-line bg-ink-800 p-4 space-y-3">
      {[0, 1, 2, 3].map((i) => (
        <div key={i} className="h-3 rounded bg-ink-700" style={{ width: `${80 - i * 12}%` }} />
      ))}
    </div>
  </div>
);

const methodLabel = (tx: any) => {
  try {
    const di = tx?.decoded_input;
    if (di) {
      const mc = (di as any)?.method_call || (di as any)?.method;
      if (mc && String(mc).trim()) return String(mc).trim().split('(')[0];
      const mid = (di as any)?.method_id;
      if (mid && String(mid).trim()) return String(mid).trim();
    }
    if (tx?.method && String(tx.method).trim()) return String(tx.method).trim();
    if (tx?.created_contract?.hash) return 'create';
    const ri = String(tx?.raw_input || '');
    if (!ri || ri === '0x' || ri.length < 10) return 'transfer';
    return ri.slice(0, 10);
  } catch {
    return '—';
  }
};

const EVENT_SIGS: Record<string, string> = {
  '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef': 'Transfer(address,address,uint256)',
  '0x8c5be1e5ebec7d5bd14f71427d1e84f3dd0314c0f7b2291e5b200ac8c7c3b925': 'Approval(address,address,uint256)',
};

const eventName = (topic0?: string) => {
  if (!topic0) return 'Unknown event';
  const k = String(topic0).toLowerCase();
  return EVENT_SIGS[k] || 'Unknown event';
};

/* --------------------------------- Header ---------------------------------- */

type ViewKey = 'home' | 'blocks' | 'txs' | 'tx' | 'block' | 'address' | 'tokens' | 'token' | 'contributors' | 'dashboard';

const NAV: { label: string; k: ViewKey[]; path: string }[] = [
  { label: 'Blocks', k: ['blocks', 'block'], path: '/blocks' },
  { label: 'Transactions', k: ['txs', 'tx'], path: '/txs' },
  { label: 'Tokens', k: ['tokens', 'token'], path: '/tokens' },
  { label: 'Contributors', k: ['contributors'], path: '/contributors' },
  { label: 'API', k: ['dashboard'], path: '/dashboard' },
];

const Header = ({ active }: { active: ViewKey }) => {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [head, setHead] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      const bn = await rpcBlockNumber();
      if (bn != null && !cancelled) setHead(bn);
    };
    load();
    const t = setInterval(load, 2000);
    return () => { cancelled = true; clearInterval(t); };
  }, []);

  const go = (path: string) => {
    setMobileOpen(false);
    navigateTo(path);
  };

  return (
    <header className="sticky top-0 z-[100] bg-ink-950/85 backdrop-blur-md border-b border-line">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-14 flex items-center justify-between gap-4">
        <div className="flex items-center gap-2.5 cursor-pointer shrink-0" onClick={() => go('/')}>
          <div className="w-7 h-7 rounded-lg bg-gold flex items-center justify-center">
            <Cpu className="w-4 h-4 text-ink-950" />
          </div>
          <span className="font-bold text-[15px] tracking-tight text-txt">
            DCAI <span className="text-gold">L3</span>
          </span>
          <Badge tone="cyan" className="hidden sm:inline-flex">testnet</Badge>
        </div>

        <nav className="hidden md:flex items-center gap-1">
          {NAV.map((n) => (
            <button
              key={n.label}
              onClick={() => go(n.path)}
              className={`px-3 py-1.5 rounded-lg text-[13px] transition-colors ${
                n.k.includes(active) ? 'text-gold font-semibold bg-gold/10' : 'text-txt-2 hover:text-txt'
              }`}
            >
              {n.label}
            </button>
          ))}
        </nav>

        <div className="flex items-center gap-3 shrink-0">
          <button
            onClick={() => head != null && navigateTo(`/block/${head}`)}
            title="Chain head (live)"
            className="hidden sm:inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border border-line hover:border-line-2 transition-colors"
          >
            <span className="live-dot w-1.5 h-1.5 rounded-full bg-cyan inline-block" />
            <span className="text-[11px] font-mono tnum text-txt-2">{head != null ? `#${fmtNum(head)}` : '—'}</span>
          </button>

          <button
            onClick={() => setMobileOpen((v) => !v)}
            className="md:hidden w-9 h-9 inline-flex items-center justify-center rounded-lg border border-line text-txt-2"
            aria-label="Menu"
          >
            {mobileOpen ? <X className="w-4 h-4" /> : <Menu className="w-4 h-4" />}
          </button>
        </div>
      </div>

      <AnimatePresence>
        {mobileOpen ? (
          <motion.div
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.14 }}
            className="md:hidden border-t border-line bg-ink-950/95 backdrop-blur-md"
          >
            <div className="max-w-7xl mx-auto px-4 py-3 flex flex-col gap-1">
              {NAV.map((n) => (
                <button
                  key={n.label}
                  onClick={() => go(n.path)}
                  className={`px-3 py-2 rounded-lg text-left text-[13px] ${
                    n.k.includes(active) ? 'text-gold font-semibold bg-gold/10' : 'text-txt-2'
                  }`}
                >
                  {n.label}
                </button>
              ))}
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </header>
  );
};

/* -------------------------------- Search bar -------------------------------- */

const SearchBar = () => {
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
      const mBlock = s.match(/^#?(\d+)$/);
      if (mBlock) {
        navigateTo(`/block/${mBlock[1]}`);
        return;
      }
      if (/^(0x)?[0-9a-fA-F]{40}$/.test(s)) {
        navigateTo(`/address/${norm0x(s)}`);
        return;
      }
      if (/^(0x)?[0-9a-fA-F]{64}$/.test(s)) {
        const q0 = norm0x(s);
        const j = await bs(`/search?q=${encodeURIComponent(q0)}`);
        const it = j?.items?.[0];
        if (it?.type === 'transaction' && it?.transaction_hash) {
          navigateTo(`/tx/${String(it.transaction_hash)}`);
          return;
        }
        if (it?.type === 'block' && (it?.block_number != null || it?.block_hash)) {
          navigateTo(`/block/${String(it.block_number != null ? it.block_number : it.block_hash)}`);
          return;
        }
        navigateTo(`/tx/${q0}`);
        return;
      }
      const j = await bs(`/search?q=${encodeURIComponent(s)}`);
      const it = j?.items?.[0];
      if (!it) {
        setErr('No results.');
        return;
      }
      if (it.type === 'address' && it.address) { navigateTo(`/address/${String(it.address)}`); return; }
      if (it.type === 'token' && it.address) { navigateTo(`/token/${String(it.address)}`); return; }
      if (it.type === 'transaction' && it.transaction_hash) { navigateTo(`/tx/${String(it.transaction_hash)}`); return; }
      if (it.type === 'block' && it.block_number != null) { navigateTo(`/block/${String(it.block_number)}`); return; }
      if (it.url) { navigateTo(String(it.url)); return; }
      setErr('Not supported yet.');
    } catch {
      setErr('Search failed.');
    } finally {
      setSearching(false);
    }
  };

  return (
    <div className="relative z-10 border-b border-line bg-ink-900/60">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3">
        <div className="flex items-center gap-2 rounded-xl border border-line bg-ink-800 px-3 focus-within:border-gold/50 transition-colors">
          <Search className="w-4 h-4 text-txt-3 shrink-0" />
          <input
            type="text"
            value={q}
            onChange={(e) => { setQ(e.target.value); if (err) setErr(null); }}
            onKeyDown={(e) => { if (e.key === 'Enter') doSearch(); }}
            placeholder="Search by address / tx hash / block / token"
            className="w-full bg-transparent border-none outline-none text-txt placeholder-txt-3 font-mono text-[13px] py-2.5"
          />
          {err ? <span className="text-[11px] text-bad shrink-0">{err}</span> : null}
          <button
            onClick={doSearch}
            disabled={searching}
            className={`shrink-0 px-4 py-1.5 my-1 rounded-lg text-[12px] font-semibold transition-colors ${
              searching ? 'bg-gold/30 text-ink-950/60' : 'bg-gold text-ink-950 hover:bg-gold-2'
            }`}
          >
            {searching ? 'Searching…' : 'Search'}
          </button>
        </div>
      </div>
    </div>
  );
};

/* ------------------------------- Network stats ------------------------------- */

const Stats = () => {
  const [stats, setStats] = useState<any>(null);
  const [latestBlock, setLatestBlock] = useState<number | null>(null);
  const [headBlock, setHeadBlock] = useState<number | null>(null);
  const [txTodayLive, setTxTodayLive] = useState<number | null>(null);
  const [totalTxLive, setTotalTxLive] = useState<number | null>(null);
  const txTodayBaseRef = useRef<number | null>(null);
  const totalTxBaseRef = useRef<number | null>(null);
  const txDeltaRef = useRef<number>(0);
  const lastSeenRef = useRef<number | null>(null);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      const data = await bs('/stats');
      if (data && !cancelled) setStats(data);
    };
    const loadLatest = async () => {
      const data = await bs('/blocks?type=block&limit=1');
      const h = Number(data?.items?.[0]?.height);
      if (Number.isFinite(h) && !cancelled) setLatestBlock(h);
    };
    const loadHead = async () => {
      const bn = await rpcBlockNumber();
      if (bn != null && !cancelled) setHeadBlock(bn);
    };
    const loadLiveTxCounters = async () => {
      try {
        const baseToday = stats?.transactions_today != null ? Number(stats.transactions_today) : null;
        const baseTotal = stats?.total_transactions != null ? Number(stats.total_transactions) : null;
        if (baseToday != null && (txTodayBaseRef.current == null || txTodayBaseRef.current !== baseToday)) {
          txTodayBaseRef.current = baseToday;
          txDeltaRef.current = 0;
          lastSeenRef.current = null;
        }
        if (baseTotal != null && (totalTxBaseRef.current == null || totalTxBaseRef.current !== baseTotal)) {
          totalTxBaseRef.current = baseTotal;
          txDeltaRef.current = 0;
          lastSeenRef.current = null;
        }

        const data = await bs('/blocks?type=block&limit=10');
        const items = (data?.items || []).map((b: any) => ({ height: Number(b.height), tx: Number(b.transaction_count ?? 0) }));
        if (!items.length) return;
        const newest = Math.max(...items.map((x: any) => x.height));
        const lastSeen = lastSeenRef.current;
        if (lastSeen == null) {
          lastSeenRef.current = newest;
        } else {
          const inc = items.filter((x: any) => x.height > lastSeen).reduce((a: number, x: any) => a + x.tx, 0);
          if (inc > 0) {
            txDeltaRef.current += inc;
            lastSeenRef.current = newest;
          }
        }

        if (!cancelled) {
          if (txTodayBaseRef.current != null) setTxTodayLive(txTodayBaseRef.current + txDeltaRef.current);
          if (totalTxBaseRef.current != null) setTotalTxLive(totalTxBaseRef.current + txDeltaRef.current);
        }
      } catch {}
    };

    load();
    loadLatest();
    loadHead();
    loadLiveTxCounters();
    const t = setInterval(load, 30000);
    const t2 = setInterval(loadLatest, 5000);
    const tHead = setInterval(loadHead, 1000);
    const t3 = setInterval(loadLiveTxCounters, 4000);
    return () => {
      cancelled = true;
      clearInterval(t);
      clearInterval(t2);
      clearInterval(tHead);
      clearInterval(t3);
    };
  }, [stats]);

  const avgBlockSec = stats?.average_block_time ? (Number(stats.average_block_time) / 1000) : null;
  const indexedLag = headBlock != null && latestBlock != null ? Math.max(0, headBlock - latestBlock) : null;

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 mb-6">
      <StatTile
        label="Chain head"
        live
        value={headBlock != null ? `#${fmtNum(headBlock)}` : (latestBlock != null ? `#${fmtNum(latestBlock)}` : '--')}
        sub={indexedLag != null ? `indexed lag ${indexedLag}` : 'indexed --'}
      />
      <StatTile
        label="Block time"
        value={avgBlockSec != null ? `${avgBlockSec.toFixed(2)}s` : '--'}
        sub="Clique PoA"
      />
      <StatTile
        label="Txs today"
        value={txTodayLive != null ? fmtNum(txTodayLive) : (stats?.transactions_today != null ? fmtNum(stats.transactions_today) : '--')}
        sub={stats?.network_utilization_percentage != null ? `${Number(stats.network_utilization_percentage).toFixed(1)}% utilization` : undefined}
      />
      <StatTile
        label="Total txs"
        value={totalTxLive != null ? fmtNum(totalTxLive) : (stats?.total_transactions != null ? fmtNum(stats.total_transactions) : '--')}
      />
      <StatTile
        label="Addresses"
        value={stats?.total_addresses != null ? fmtNum(stats.total_addresses) : '--'}
      />
      <StatTile
        label="Gas (gwei-ish)"
        value={stats?.gas_prices?.average != null ? String(stats.gas_prices.average) : '--'}
        sub={stats?.gas_prices ? `slow ${stats.gas_prices.slow} · fast ${stats.gas_prices.fast}` : undefined}
      />
    </div>
  );
};

/* -------------------------------- Home tables -------------------------------- */

const HomeView = ({
  blocks,
  txs,
  onViewBlock,
  onViewTx,
}: {
  blocks: any[];
  txs: any[];
  onViewBlock: (b: any) => void;
  onViewTx: (h: string) => void;
}) => (
  <Page>
    <div className="mb-5 flex flex-wrap items-end justify-between gap-2">
      <div>
        <h1 className="text-xl font-bold tracking-tight text-txt">DCAI L3 Explorer</h1>
        <div className="mt-1 text-[12px] text-txt-2 font-mono">
          chainId {CHAIN_ID} · {NATIVE_SYMBOL} · Clique PoA · ~2s blocks
        </div>
      </div>
      <div className="text-[11px] font-mono text-txt-3">AuraScan</div>
    </div>

    <Stats />

    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      <Card>
        <CardHead
          title="Latest blocks"
          meta={<LivePill />}
          actions={<LinkText onClick={() => navigateTo('/blocks')} className="text-[11px]">View all →</LinkText>}
        />
        <Table>
          <thead>
            <tr>
              <Th>Block</Th>
              <Th>Age</Th>
              <Th>Signer</Th>
              <Th right>Txns</Th>
              <Th right>Fees ({NATIVE_SYMBOL})</Th>
            </tr>
          </thead>
          <tbody>
            {blocks.length === 0 ? (
              <SkeletonRows rows={10} cols={5} />
            ) : (
              blocks.slice(0, 12).map((b: any) => (
                <TRow key={b.height} flash={!!b._new}>
                  <Td mono>
                    <LinkText onClick={() => onViewBlock(b)} className="text-[12px]">#{b.height}</LinkText>
                  </Td>
                  <Td mono className="text-txt-3" title={String(b.timestamp || '')}>{timeAgo(b.timestamp)}</Td>
                  <Td mono>
                    <LinkText tone="muted" onClick={() => b.validator && navigateTo(`/address/${b.validator}`)} title={b.validator}>
                      {b.miner}
                    </LinkText>
                  </Td>
                  <Td right mono className="text-txt-2">{b.txCount}</Td>
                  <Td right mono className="text-gold">{b.reward}</Td>
                </TRow>
              ))
            )}
          </tbody>
        </Table>
      </Card>

      <Card>
        <CardHead
          title="Latest transactions"
          meta={<LivePill />}
          actions={<LinkText onClick={() => navigateTo('/txs')} className="text-[11px]">View all →</LinkText>}
        />
        <Table>
          <thead>
            <tr>
              <Th>Tx hash</Th>
              <Th>Method</Th>
              <Th>From / To</Th>
              <Th right>Value ({NATIVE_SYMBOL})</Th>
              <Th right>Age</Th>
            </tr>
          </thead>
          <tbody>
            {txs.length === 0 ? (
              <SkeletonRows rows={10} cols={5} />
            ) : (
              txs.slice(0, 12).map((tx: any) => (
                <TRow key={tx.hash} flash={!!tx._new}>
                  <Td mono>
                    <LinkText onClick={() => onViewTx(tx.hash)} title={tx.hash} className="text-[12px]">
                      {short(tx.hash, 10, 6)}
                    </LinkText>
                  </Td>
                  <Td>
                    <div className="flex items-center gap-1.5">
                      <StatusBadge status={tx.result} />
                      <Badge tone="neutral" className="max-w-[110px] overflow-hidden text-ellipsis" title={String(tx.method ?? 'txn')}>
                        {String(tx.method ?? 'txn')}
                      </Badge>
                    </div>
                  </Td>
                  <Td mono>
                    <div className="flex flex-col leading-4">
                      <LinkText tone="muted" onClick={() => tx.from && tx.from !== '--' && navigateTo(`/address/${tx.from}`)} title={tx.from} className="text-[11px]">
                        {shortAddr(tx.from)}
                      </LinkText>
                      <LinkText tone="muted" onClick={() => tx.to && tx.to !== '--' && navigateTo(`/address/${tx.to}`)} title={tx.to} className="text-[11px]">
                        → {shortAddr(tx.to)}
                      </LinkText>
                    </div>
                  </Td>
                  <Td right mono className="text-gold" title={`fee ${tx.fee} ${NATIVE_SYMBOL}`}>{tx.value}</Td>
                  <Td right mono className="text-txt-3" title={String(tx.timestamp || '')}>{timeAgo(tx.timestamp)}</Td>
                </TRow>
              ))
            )}
          </tbody>
        </Table>
      </Card>
    </div>
  </Page>
);

/* ------------------------------- Blocks list -------------------------------- */

const BlocksListView = ({ onViewBlock }: { onViewBlock: (h: number) => void }) => {
  const [items, setItems] = useState<any[] | null>(null);
  const [loading, setLoading] = useState(false);

  const [pageParams, setPageParams] = useState<any | null>(() => {
    try {
      const sp = new URLSearchParams(window.location.search || '');
      const o: any = {};
      for (const k of ['block_number', 'items_count', 'limit']) {
        const v = sp.get(k);
        if (v != null) o[k] = v;
      }
      return Object.keys(o).length ? o : null;
    } catch {
      return null;
    }
  });
  const [nextParams, setNextParams] = useState<any | null>(null);
  const [prevStack, setPrevStack] = useState<any[]>([]);

  const setBlocksUrl = (p: any | null, replace = false) => {
    try {
      const sp = new URLSearchParams();
      if (p) for (const [k, v] of Object.entries(p)) if (v != null) sp.set(String(k), String(v));
      const qs = sp.toString();
      const url = '/blocks' + (qs ? `?${qs}` : '');
      const fn: any = replace ? window.history.replaceState : window.history.pushState;
      fn.call(window.history, { view: 'blocks' }, '', url);
    } catch {}
  };

  useEffect(() => {
    let cancelled = false;

    const buildPath = () => {
      const sp = new URLSearchParams();
      sp.set('type', 'block');
      sp.set('limit', '25');
      if (pageParams) {
        for (const [k, v] of Object.entries(pageParams)) {
          if (v == null) continue;
          sp.set(String(k), String(v));
        }
      }
      return `/blocks?${sp.toString()}`;
    };

    const load = async () => {
      setLoading(true);
      const j = await bs(buildPath());
      if (j && !cancelled) {
        const its = j?.items || [];
        setItems(its);
        setNextParams(j?.next_page_params || null);

        const heights = its.map((b: any) => Number(b.height)).filter((h: number) => Number.isFinite(h));
        resolveCliqueSigners(heights).then((m) => {
          if (cancelled || !Object.keys(m).length) return;
          setItems((prev) =>
            (prev || []).map((b: any) => (m[Number(b.height)] ? { ...b, _signer: m[Number(b.height)] } : b))
          );
        });
      }
      if (!cancelled) setLoading(false);
    };

    load();
    if (!pageParams) {
      const id = window.setInterval(load, 8000);
      return () => { cancelled = true; window.clearInterval(id); };
    }
    return () => { cancelled = true; };
  }, [pageParams]);

  return (
    <Page>
      <PageTitle
        title="Blocks"
        sub={loading ? 'Loading…' : (items ? `${items.length} blocks on this page` : '—')}
        right={
          <Pager
            canPrev={prevStack.length > 0}
            canNext={!!nextParams}
            onPrev={() => {
              if (!prevStack.length) return;
              const copy = prevStack.slice();
              const prev = copy.pop();
              setPrevStack(copy);
              setBlocksUrl(prev || null);
              setPageParams(prev || null);
            }}
            onNext={() => {
              if (!nextParams) return;
              setPrevStack((s) => [...s, pageParams]);
              setBlocksUrl(nextParams);
              setPageParams(nextParams);
            }}
          />
        }
      />

      <Card>
        <Table>
          <thead>
            <tr>
              <Th>Block</Th>
              <Th>Age</Th>
              <Th>Hash</Th>
              <Th>Signer</Th>
              <Th right>Txns</Th>
              <Th right>Gas used</Th>
              <Th right>Base fee (wei)</Th>
              <Th right>Size</Th>
            </tr>
          </thead>
          <tbody>
            {items == null ? (
              <SkeletonRows rows={12} cols={8} />
            ) : items.length === 0 ? (
              <tr><td colSpan={8}><Empty label="No blocks." /></td></tr>
            ) : (
              items.map((b: any) => (
                <TRow key={b.hash}>
                  <Td mono>
                    <LinkText onClick={() => onViewBlock(Number(b.height))}>#{b.height}</LinkText>
                  </Td>
                  <Td mono className="text-txt-3" title={String(b.timestamp || '')}>{timeAgo(b.timestamp)}</Td>
                  <Td mono>
                    <span className="text-txt-2" title={String(b.hash || '')}>{short(String(b.hash || ''), 10, 8)}</span>
                  </Td>
                  <Td mono>
                    {(() => {
                      const zero = /^0x0+$/.test(String(b.miner?.hash || ''));
                      const signer = b._signer || (!zero ? b.miner?.hash : '');
                      return signer ? (
                        <LinkText tone="muted" onClick={() => navigateTo(`/address/${signer}`)} title={String(signer)}>
                          {shortAddr(String(signer))}
                        </LinkText>
                      ) : <span className="text-txt-3">…</span>;
                    })()}
                  </Td>
                  <Td right mono className="text-txt-2">{b.transaction_count ?? '--'}</Td>
                  <Td right mono><GasBar pct={gasPct(b.gas_used, b.gas_limit)} /></Td>
                  <Td right mono className="text-txt-3">{b.base_fee_per_gas ?? '--'}</Td>
                  <Td right mono className="text-txt-3">{b.size ?? '--'}</Td>
                </TRow>
              ))
            )}
          </tbody>
        </Table>
      </Card>
    </Page>
  );
};

/* ---------------------------------- Txs list --------------------------------- */

const TxsListView = ({
  onViewTx,
  onViewAddress,
  onViewBlock,
}: {
  onViewTx: (h: string) => void;
  onViewAddress: (a: string) => void;
  onViewBlock: (h: number) => void;
}) => {
  const [items, setItems] = useState<any[] | null>(null);
  const [loading, setLoading] = useState(false);

  const [pageParams, setPageParams] = useState<any | null>(() => {
    try {
      const sp = new URLSearchParams(window.location.search || '');
      const o: any = {};
      for (const k of ['block_number', 'index', 'items_count', 'limit']) {
        const v = sp.get(k);
        if (v != null) o[k] = v;
      }
      return Object.keys(o).length ? o : null;
    } catch {
      return null;
    }
  });
  const [nextParams, setNextParams] = useState<any | null>(null);
  const [prevStack, setPrevStack] = useState<any[]>([]);

  const setTxsUrl = (p: any | null, replace = false) => {
    try {
      const sp = new URLSearchParams();
      if (p) for (const [k, v] of Object.entries(p)) if (v != null) sp.set(String(k), String(v));
      const qs = sp.toString();
      const url = '/txs' + (qs ? `?${qs}` : '');
      const fn: any = replace ? window.history.replaceState : window.history.pushState;
      fn.call(window.history, { view: 'txs' }, '', url);
    } catch {}
  };

  useEffect(() => {
    let cancelled = false;

    const buildPath = () => {
      const sp = new URLSearchParams();
      sp.set('limit', '25');
      if (pageParams) {
        for (const [k, v] of Object.entries(pageParams)) {
          if (v == null) continue;
          sp.set(String(k), String(v));
        }
      }
      return `/transactions?${sp.toString()}`;
    };

    const load = async () => {
      setLoading(true);
      const j = await bs(buildPath());
      if (j && !cancelled) {
        setItems(j?.items || []);
        setNextParams(j?.next_page_params || null);
      }
      if (!cancelled) setLoading(false);
    };

    load();
    if (!pageParams) {
      const id = window.setInterval(load, 6000);
      return () => { cancelled = true; window.clearInterval(id); };
    }
    return () => { cancelled = true; };
  }, [pageParams]);

  return (
    <Page>
      <PageTitle
        title="Transactions"
        sub={loading ? 'Loading…' : (items ? `${items.length} transactions on this page` : '—')}
        right={
          <Pager
            canPrev={prevStack.length > 0}
            canNext={!!nextParams}
            onPrev={() => {
              if (!prevStack.length) return;
              const copy = prevStack.slice();
              const prev = copy.pop();
              setPrevStack(copy);
              setTxsUrl(prev || null);
              setPageParams(prev || null);
            }}
            onNext={() => {
              if (!nextParams) return;
              setPrevStack((s) => [...s, pageParams]);
              setTxsUrl(nextParams);
              setPageParams(nextParams);
            }}
          />
        }
      />

      <Card>
        <Table>
          <thead>
            <tr>
              <Th>Tx hash</Th>
              <Th>Method</Th>
              <Th>Block</Th>
              <Th>Age</Th>
              <Th>From</Th>
              <Th>To</Th>
              <Th right>Value ({NATIVE_SYMBOL})</Th>
              <Th right>Fee</Th>
            </tr>
          </thead>
          <tbody>
            {items == null ? (
              <SkeletonRows rows={12} cols={8} />
            ) : items.length === 0 ? (
              <tr><td colSpan={8}><Empty label="No transactions." /></td></tr>
            ) : (
              items.map((tx: any) => (
                <TRow key={tx.hash}>
                  <Td mono>
                    <div className="flex items-center gap-1">
                      <StatusBadge status={tx.status ?? tx.result} />
                      <LinkText onClick={() => onViewTx(String(tx.hash))} title={String(tx.hash)}>
                        {short(String(tx.hash), 10, 6)}
                      </LinkText>
                    </div>
                  </Td>
                  <Td>
                    <Badge tone="neutral" className="max-w-[120px] overflow-hidden text-ellipsis" title={methodLabel(tx)}>
                      {methodLabel(tx)}
                    </Badge>
                  </Td>
                  <Td mono>
                    {tx.block_number != null ? (
                      <LinkText tone="muted" onClick={() => onViewBlock(Number(tx.block_number))}>#{tx.block_number}</LinkText>
                    ) : <span className="text-txt-3">--</span>}
                  </Td>
                  <Td mono className="text-txt-3" title={String(tx.timestamp || '')}>{timeAgo(tx.timestamp)}</Td>
                  <Td mono>
                    <LinkText tone="muted" onClick={() => tx?.from?.hash && onViewAddress(String(tx.from.hash))} title={tx?.from?.hash}>
                      {shortAddr(String(tx?.from?.hash || ''))}
                    </LinkText>
                  </Td>
                  <Td mono>
                    {tx?.created_contract?.hash ? (
                      <LinkText tone="muted" onClick={() => onViewAddress(String(tx.created_contract.hash))} title={`contract ${tx.created_contract.hash}`}>
                        <Badge tone="warn" className="mr-1">create</Badge>{shortAddr(String(tx.created_contract.hash))}
                      </LinkText>
                    ) : (
                      <LinkText tone="muted" onClick={() => tx?.to?.hash && onViewAddress(String(tx.to.hash))} title={tx?.to?.hash}>
                        {shortAddr(String(tx?.to?.hash || ''))}
                      </LinkText>
                    )}
                  </Td>
                  <Td right mono className="text-gold">{fmtWei(tx.value)}</Td>
                  <Td right mono className="text-txt-3">{fmtWei(tx.fee?.value ?? tx.fee ?? '0')}</Td>
                </TRow>
              ))
            )}
          </tbody>
        </Table>
      </Card>
    </Page>
  );
};

/* --------------------------------- Block view -------------------------------- */

const BlockView = ({
  block,
  onBack,
  onViewTx,
  onViewAddress,
  onViewBlock,
}: {
  block: any;
  onBack: () => void;
  onViewTx: (h: string) => void;
  onViewAddress: (a: string) => void;
  onViewBlock: (h: number) => void;
}) => {
  const [details, setDetails] = useState<any>(null);
  const [blockTxs, setBlockTxs] = useState<any[]>([]);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      try {
        window.scrollTo(0, 0);
        const b = await bs(`/blocks/${block.height}`);
        if (!b) return;

        const head = await rpcBlockNumber();

        let signer = '';
        try {
          const hexNum = '0x' + Number(block.height).toString(16);
          const snap = await rpc('clique_getSnapshot', [hexNum]);
          signer = (snap?.recents?.[String(block.height)] || '').toLowerCase();
        } catch {}

        const conf = head != null ? Math.max(0, head - Number(b.height)) : null;
        const status = conf != null && conf <= 0 ? 'PENDING' : 'FINALIZED';

        const d = {
          height: b.height,
          hash: b.hash,
          status,
          confirmations: conf != null ? conf : '--',
          size: b.size != null ? String(b.size) : '--',
          txCount: Number(b.transaction_count ?? 0),
          timestamp: b.timestamp,
          validator: signer || '',
          reward: fmtWei(b.transaction_fees ?? '0'),
          gasUsed: Number(b.gas_used ?? 0),
          gasLimit: Number(b.gas_limit ?? 0),
          baseFee: b.base_fee_per_gas ?? '--',
          parentHash: b.parent_hash ?? '--',
          stateRoot: b.state_root ?? '--',
        };

        const txData = await bs(`/blocks/${block.height}/transactions?limit=25`);
        const txs = (txData?.items || []).map((tx: any) => ({
          hash: tx.hash,
          from: tx.from?.hash || tx.from || '--',
          to: tx.to?.hash || tx.to || '--',
          value: fmtWei(tx.value ?? '0'),
          fee: fmtWei(tx.fee?.value ?? tx.fee ?? '0'),
          timestamp: tx.timestamp,
          status: tx.status ?? tx.result,
        }));

        if (!cancelled) {
          setDetails(d);
          setBlockTxs(txs);
        }
      } catch {}
    };

    load();
    return () => { cancelled = true; };
  }, [block]);

  if (!details) {
    return (
      <Page>
        <PageTitle title={`Block #${block?.height ?? ''}`} sub="Loading…" onBack={onBack} backLabel="Back" />
        <Card><Table><tbody><SkeletonRows rows={8} cols={2} /></tbody></Table></Card>
      </Page>
    );
  }

  const h = Number(details.height);

  return (
    <Page>
      <PageTitle
        title="Block"
        accent={`#${details.height}`}
        onBack={onBack}
        backLabel="Back"
        sub={
          <span className="inline-flex items-center gap-2 flex-wrap">
            {details.status === 'FINALIZED' ? <Badge tone="ok">finalized</Badge> : <Badge tone="warn">pending</Badge>}
            <span className="font-mono">{details.confirmations} confirmations</span>
            <span className="font-mono text-txt-3">{fmtStamp(details.timestamp)} · {timeAgo(details.timestamp)}</span>
          </span>
        }
        right={
          <div className="flex items-center gap-1.5">
            <Btn onClick={() => Number.isFinite(h) && onViewBlock(h - 1)} title="Previous block">← #{h - 1}</Btn>
            <Btn onClick={() => Number.isFinite(h) && onViewBlock(h + 1)} title="Next block">#{h + 1} →</Btn>
          </div>
        }
      />

      <Card className="mb-4">
        <CardHead title="Overview" />
        <div className="px-4 py-1">
          <KV label="Block hash" copy={String(details.hash)}><span className="font-mono text-cyan">{details.hash}</span></KV>
          <KV label="Signer (validator)" copy={details.validator || undefined}>
            {details.validator ? (
              <LinkText onClick={() => onViewAddress(String(details.validator))} className="text-[12px]">{details.validator}</LinkText>
            ) : '--'}
          </KV>
          <KV label="Transactions"><span className="font-mono">{details.txCount}</span></KV>
          <KV label="Fees collected"><span className="font-mono text-gold">{details.reward} {NATIVE_SYMBOL}</span></KV>
          <KV label="Gas used">
            <span className="inline-flex items-center gap-3 font-mono">
              {fmtNum(details.gasUsed)} / {fmtNum(details.gasLimit)}
              <GasBar pct={gasPct(details.gasUsed, details.gasLimit)} />
            </span>
          </KV>
          <KV label="Base fee"><span className="font-mono">{details.baseFee} wei</span></KV>
          <KV label="Size"><span className="font-mono">{details.size} bytes</span></KV>
          <KV label="Parent hash" copy={String(details.parentHash)}>
            <LinkText tone="muted" onClick={() => onViewBlock(h - 1)} className="text-[12px]">{details.parentHash}</LinkText>
          </KV>
          <KV label="State root"><span className="font-mono text-txt-2">{details.stateRoot}</span></KV>
        </div>
      </Card>

      <Card>
        <CardHead title={`Transactions (${details.txCount})`} />
        {blockTxs.length === 0 ? (
          <Empty label="No transactions in this block." />
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Tx hash</Th>
                <Th>From</Th>
                <Th>To</Th>
                <Th right>Value ({NATIVE_SYMBOL})</Th>
                <Th right>Fee</Th>
              </tr>
            </thead>
            <tbody>
              {blockTxs.map((tx: any) => (
                <TRow key={tx.hash}>
                  <Td mono>
                    <div className="flex items-center gap-1">
                      <StatusBadge status={tx.status} />
                      <LinkText onClick={() => onViewTx(String(tx.hash))} title={tx.hash}>{short(tx.hash, 12, 8)}</LinkText>
                    </div>
                  </Td>
                  <Td mono>
                    <LinkText tone="muted" onClick={() => tx.from !== '--' && onViewAddress(String(tx.from))} title={tx.from}>
                      {shortAddr(String(tx.from))}
                    </LinkText>
                  </Td>
                  <Td mono>
                    <LinkText tone="muted" onClick={() => tx.to !== '--' && onViewAddress(String(tx.to))} title={tx.to}>
                      {shortAddr(String(tx.to))}
                    </LinkText>
                  </Td>
                  <Td right mono className="text-gold">{tx.value}</Td>
                  <Td right mono className="text-txt-3">{tx.fee}</Td>
                </TRow>
              ))}
            </tbody>
          </Table>
        )}
      </Card>
    </Page>
  );
};

/* ----------------------------------- Tx view --------------------------------- */

const TxView = ({
  hash,
  onBack,
  onViewBlock,
  onViewAddress,
}: {
  hash: string;
  onBack: () => void;
  onViewBlock: (h: number) => void;
  onViewAddress: (a: string) => void;
}) => {
  const [tx, setTx] = useState<any>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [tab, setTab] = useState<'overview' | 'logs' | 'transfers'>('overview');
  const [showInput, setShowInput] = useState<boolean>(false);
  const [logs, setLogs] = useState<any[] | null>(null);
  const [logsLoading, setLogsLoading] = useState<boolean>(false);
  const [logOpen, setLogOpen] = useState<Record<string, boolean>>({});
  const [transfers, setTransfers] = useState<any[] | null>(null);
  const [transfersLoading, setTransfersLoading] = useState<boolean>(false);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      const data = await bs(`/transactions/${hash}`);
      if (data && !cancelled) setTx(data);
      if (!cancelled) setLoading(false);
    };
    load();
    return () => { cancelled = true; };
  }, [hash]);

  useEffect(() => {
    setLogs(null);
    setTransfers(null);
    setLogOpen({});
    setTab('overview');
  }, [hash]);

  useEffect(() => {
    let cancelled = false;
    const loadLogs = async () => {
      setLogsLoading(true);
      const j = await bs(`/transactions/${hash}/logs`);
      if (j && !cancelled) setLogs(j?.items || []);
      if (!cancelled) setLogsLoading(false);
    };
    const loadTransfers = async () => {
      setTransfersLoading(true);
      const j = await bs(`/transactions/${hash}/token-transfers`);
      if (j && !cancelled) setTransfers(j?.items || []);
      if (!cancelled) setTransfersLoading(false);
    };

    if (tab === 'logs' && logs == null && !logsLoading) loadLogs();
    if (tab === 'transfers' && transfers == null && !transfersLoading) loadTransfers();
    return () => { cancelled = true; };
  }, [tab, hash]);

  return (
    <Page>
      <PageTitle
        title="Transaction"
        onBack={onBack}
        backLabel="Back"
        sub={
          <span className="inline-flex items-center gap-2 flex-wrap">
            <StatusBadge status={tx?.status ?? (loading ? 'pending' : '--')} />
            <span className="font-mono break-all">{hash}</span>
            <CopyBtn value={hash} label="hash" />
          </span>
        }
      />

      <Tabs
        tabs={[
          { k: 'overview', label: 'Overview' },
          { k: 'logs', label: 'Logs' },
          { k: 'transfers', label: 'Token transfers' },
        ]}
        active={tab}
        onChange={(k) => setTab(k as any)}
      />

      {tab === 'overview' ? (
        <>
          <Card className="mb-4">
            <CardHead title="Overview" />
            <div className="px-4 py-1">
              <KV label="Status">
                <span className="inline-flex items-center gap-2">
                  <StatusBadge status={tx?.status} />
                  <span className="font-mono text-txt-3">{tx?.confirmations != null ? `${fmtNum(tx.confirmations)} confirmations` : ''}</span>
                </span>
              </KV>
              <KV label="Block">
                {(tx?.block_number ?? tx?.block) != null ? (
                  <LinkText onClick={() => onViewBlock(Number(tx?.block_number ?? tx?.block))}>#{String(tx?.block_number ?? tx?.block)}</LinkText>
                ) : '--'}
              </KV>
              <KV label="Timestamp"><span className="font-mono">{fmtStamp(tx?.timestamp)} · {timeAgo(tx?.timestamp)}</span></KV>
              <KV label="From" copy={tx?.from?.hash}>
                {tx?.from?.hash ? (
                  <LinkText onClick={() => onViewAddress(String(tx.from.hash))} className="text-[12px]">{String(tx.from.hash)}</LinkText>
                ) : '--'}
              </KV>
              <KV label={tx?.created_contract?.hash ? 'Created contract' : 'To'} copy={tx?.created_contract?.hash || tx?.to?.hash}>
                {tx?.created_contract?.hash ? (
                  <LinkText onClick={() => onViewAddress(String(tx.created_contract.hash))} className="text-[12px]">{String(tx.created_contract.hash)}</LinkText>
                ) : tx?.to?.hash ? (
                  <LinkText onClick={() => onViewAddress(String(tx.to.hash))} className="text-[12px]">{String(tx.to.hash)}</LinkText>
                ) : '--'}
              </KV>
              <KV label="Value"><span className="font-mono text-gold">{fmtWei(tx?.value)} {NATIVE_SYMBOL}</span></KV>
              <KV label="Fee">
                <span className="font-mono">{fmtWei(tx?.fee?.value ?? tx?.fee ?? '0')} {NATIVE_SYMBOL} <span className="text-txt-3">({String(tx?.fee?.value ?? tx?.fee ?? '0')} wei)</span></span>
              </KV>
              <KV label="Gas used / price">
                <span className="font-mono">{tx?.gas_used != null ? fmtNum(tx.gas_used) : '--'} <span className="text-txt-3">@ {tx?.gas_price ?? tx?.max_fee_per_gas ?? '--'} wei</span></span>
              </KV>
              <KV label="Nonce / position"><span className="font-mono">{tx?.nonce ?? '--'} / {tx?.position ?? '--'}</span></KV>
              <KV label="Method"><Badge tone="neutral">{methodLabel(tx)}</Badge></KV>
            </div>
          </Card>

          <Card>
            <CardHead
              title="Input data"
              meta={tx?.decoded_input?.method_call ? String(tx.decoded_input.method_call) : 'raw'}
              actions={
                <div className="flex items-center gap-1.5">
                  <Btn onClick={() => setShowInput((v) => !v)}>{showInput ? 'Collapse' : 'Expand'}</Btn>
                  <CopyBtn value={String(tx?.raw_input ?? '')} label="input" />
                </div>
              }
            />
            <div className="px-4 py-3">
              {showInput ? (
                <>
                  <div className="rounded-lg border border-line bg-ink-900 p-3 text-[11px] font-mono text-txt-2 break-all whitespace-pre-wrap max-h-64 overflow-auto">
                    {String(tx?.raw_input ?? '--')}
                  </div>
                  {tx?.decoded_input?.parameters?.length ? (
                    <div className="mt-3 rounded-lg border border-line bg-ink-900 p-3 overflow-x-auto">
                      <div className="text-[11px] font-mono text-cyan mb-2">{tx?.decoded_input?.method_call || 'decoded'}</div>
                      <table className="w-full text-[11px] font-mono">
                        <thead>
                          <tr className="text-txt-3 text-left">
                            <th className="py-1 pr-4 font-medium">name</th>
                            <th className="py-1 pr-4 font-medium">type</th>
                            <th className="py-1 font-medium">value</th>
                          </tr>
                        </thead>
                        <tbody>
                          {tx.decoded_input.parameters.map((p: any, i: number) => (
                            <tr key={i} className="border-t border-line/60">
                              <td className="py-1.5 pr-4 text-txt-2">{p.name || `arg${i}`}</td>
                              <td className="py-1.5 pr-4 text-txt-3">{p.type || '--'}</td>
                              <td className="py-1.5 text-txt break-all">{String(p.value ?? p.hex ?? p)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : null}
                </>
              ) : (
                <div className="text-[11px] font-mono text-txt-3 truncate">{String(tx?.raw_input ?? '--')}</div>
              )}
            </div>
          </Card>
        </>
      ) : tab === 'logs' ? (
        <Card>
          <CardHead title="Logs" meta={logsLoading ? 'loading…' : `${logs?.length ?? 0} log(s)`} />
          <div className="px-4 py-3 space-y-2">
            {logsLoading ? (
              <div className="space-y-2">
                {[0, 1, 2].map((i) => <div key={i} className="h-10 rounded-lg bg-ink-700" />)}
              </div>
            ) : !logs || logs.length === 0 ? (
              <Empty label="No logs." />
            ) : (
              logs.map((lg: any, i: any) => {
                const k = String(lg?.index ?? i);
                const open = !!logOpen[k];
                return (
                  <div key={k} className="rounded-lg border border-line bg-ink-900 overflow-hidden">
                    <button
                      onClick={() => setLogOpen((m) => ({ ...m, [k]: !m[k] }))}
                      className="w-full text-left px-3 py-2.5 flex items-center justify-between gap-3 hover:bg-ink-750/60 transition-colors"
                    >
                      <div className="min-w-0 flex items-center gap-2 flex-wrap">
                        <Badge tone="neutral">log #{lg?.index ?? i}</Badge>
                        <span className="text-[11px] font-mono text-cyan truncate">{eventName((lg?.topics || [])[0])}</span>
                        <LinkText
                          tone="muted"
                          className="text-[11px]"
                          onClick={() => {
                            const a = lg?.address?.hash || lg?.address || '';
                            if (a) onViewAddress(String(a));
                          }}
                        >
                          {shortAddr(String(lg?.address?.hash || lg?.address || ''))}
                        </LinkText>
                      </div>
                      <span className="text-[10px] font-mono text-txt-3 shrink-0">{open ? 'collapse' : 'expand'}</span>
                    </button>
                    {open ? (
                      <div className="px-3 pb-3 border-t border-line/60">
                        <div className="mt-2 text-[10px] uppercase tracking-wider text-txt-3">Topics</div>
                        <div className="mt-1 space-y-1">
                          {(lg?.topics || []).filter(Boolean).map((t: string, j: number) => (
                            <div key={j} className="flex items-center justify-between gap-2">
                              <div className="text-[11px] font-mono text-txt-2 break-all">{t}</div>
                              <CopyBtn value={t} label={`topic${j}`} />
                            </div>
                          ))}
                        </div>
                        <div className="mt-3 text-[10px] uppercase tracking-wider text-txt-3">Data</div>
                        <div className="mt-1 flex items-start justify-between gap-2">
                          <div className="text-[11px] font-mono text-txt-2 break-all">{lg?.data || '--'}</div>
                          <CopyBtn value={String(lg?.data || '')} label="data" />
                        </div>
                      </div>
                    ) : null}
                  </div>
                );
              })
            )}
          </div>
        </Card>
      ) : (
        <Card>
          <CardHead title="Token transfers" meta={transfersLoading ? 'loading…' : `${transfers?.length ?? 0} transfer(s)`} />
          {transfersLoading ? (
            <div className="px-4 py-3 space-y-2">
              {[0, 1, 2].map((i) => <div key={i} className="h-10 rounded-lg bg-ink-700" />)}
            </div>
          ) : !transfers || transfers.length === 0 ? (
            <Empty label="No token transfers." />
          ) : (
            <Table>
              <thead>
                <tr>
                  <Th>Direction</Th>
                  <Th>Token</Th>
                  <Th>From</Th>
                  <Th>To</Th>
                  <Th right>Amount</Th>
                </tr>
              </thead>
              <tbody>
                {transfers.map((tr: any, i: any) => {
                  const from = tr?.from?.hash || tr?.from || '--';
                  const to = tr?.to?.hash || tr?.to || '--';
                  const token = tr?.token?.symbol || tr?.token?.name || shortAddr(String(tr?.token?.address || tr?.token?.hash || ''));
                  const tokenType = String(tr?.token?.type || '');
                  const tokenId = tr?.total?.token_id ?? tr?.token_id ?? null;
                  const isNft = /721|1155/i.test(tokenType);
                  const amount = isNft
                    ? (tokenId != null ? `NFT #${String(tokenId)}` : 'NFT')
                    : fmtUnits(tr?.total?.value || tr?.value || tr?.amount || '0', tr?.total?.decimals ?? tr?.token?.decimals ?? 18);
                  const out = String(from).toLowerCase() === String(tx?.from?.hash || '').toLowerCase();
                  return (
                    <TRow key={String(tr?.log_index ?? i)}>
                      <Td>{out ? <Badge tone="gold">out</Badge> : <Badge tone="cyan">in</Badge>}</Td>
                      <Td mono className="text-txt-2">{String(token)}</Td>
                      <Td mono>
                        <LinkText tone="muted" onClick={() => from !== '--' && onViewAddress(String(from))} title={String(from)}>
                          {shortAddr(String(from))}
                        </LinkText>
                      </Td>
                      <Td mono>
                        <LinkText tone="muted" onClick={() => to !== '--' && onViewAddress(String(to))} title={String(to)}>
                          {shortAddr(String(to))}
                        </LinkText>
                      </Td>
                      <Td right mono className="text-gold">{String(amount)}</Td>
                    </TRow>
                  );
                })}
              </tbody>
            </Table>
          )}
        </Card>
      )}
    </Page>
  );
};

/* ------------------------------ NFT instance modal ---------------------------- */

const NftInstanceModal = ({
  instance,
  onClose,
  onViewToken,
  onViewAddress,
}: {
  instance: any | null;
  onClose: () => void;
  onViewToken?: (a: string) => void;
  onViewAddress?: (a: string) => void;
}) => {
  const traits = Array.isArray(instance?.metadata?.attributes) ? instance.metadata.attributes : [];
  const tokenAddr = String(instance?.token?.address || '').trim();
  const owner = String(instance?.owner?.hash || '').trim();

  return (
    <Modal
      open={!!instance}
      onClose={onClose}
      wide
      title={instance ? String(instance?.metadata?.name || `NFT #${instance?.id || '--'}`) : ''}
    >
      {instance ? (
        <div className="grid grid-cols-1 lg:grid-cols-[340px_1fr]">
          <div className="p-4 border-b lg:border-b-0 lg:border-r border-line bg-ink-950/50">
            <div className="rounded-xl overflow-hidden border border-line bg-ink-900">
              {instance?.image_url ? (
                <img src={String(instance.image_url)} alt={String(instance?.metadata?.name || instance?.id || 'NFT')} className="w-full aspect-square object-cover" />
              ) : (
                <div className="aspect-square flex items-center justify-center text-[11px] font-mono text-txt-3">no image</div>
              )}
            </div>
          </div>

          <div className="p-4">
            <div className="grid grid-cols-2 gap-3 text-[12px]">
              <div className="rounded-lg border border-line bg-ink-800 p-3">
                <div className="text-[10px] uppercase tracking-wider text-txt-3">Token ID</div>
                <div className="mt-1 font-mono text-cyan">#{String(instance?.id || '--')}</div>
              </div>
              <div className="rounded-lg border border-line bg-ink-800 p-3">
                <div className="text-[10px] uppercase tracking-wider text-txt-3">Type</div>
                <div className="mt-1 font-mono text-txt-2">{String(instance?.token_type || instance?.token?.type || '--')}</div>
              </div>
              <div className="rounded-lg border border-line bg-ink-800 p-3 col-span-2">
                <div className="text-[10px] uppercase tracking-wider text-txt-3">Owner</div>
                {owner && onViewAddress ? (
                  <LinkText onClick={() => { onClose(); onViewAddress(owner); }} className="mt-1 text-[12px] break-all">{owner}</LinkText>
                ) : (
                  <div className="mt-1 font-mono text-txt-2 break-all">{owner || '--'}</div>
                )}
              </div>
            </div>

            <div className="mt-4">
              <div className="text-[10px] uppercase tracking-wider text-txt-3">Traits</div>
              <div className="mt-2 grid grid-cols-2 gap-2">
                {traits.length ? traits.map((trait: any, i: number) => (
                  <div key={i} className="rounded-lg border border-line bg-ink-800 p-2.5">
                    <div className="text-[10px] text-txt-3">{String(trait?.trait_type || 'trait')}</div>
                    <div className="mt-0.5 text-[12px] font-mono text-txt break-words">{String(trait?.value ?? '--')}</div>
                  </div>
                )) : (
                  <div className="text-[12px] text-txt-3 col-span-2">No traits.</div>
                )}
              </div>
            </div>

            <div className="mt-4 flex items-center gap-2 flex-wrap">
              {tokenAddr && onViewToken ? (
                <Btn onClick={() => { onClose(); onViewToken(tokenAddr); }}>Open token</Btn>
              ) : null}
              {instance?.external_app_url ? (
                <a
                  href={String(instance.external_app_url)}
                  target="_blank"
                  rel="noreferrer"
                  className="px-3 py-1.5 rounded-lg text-[12px] border border-line text-txt-2 hover:text-txt hover:border-line-2 transition-colors"
                >
                  External ↗
                </a>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}
    </Modal>
  );
};

/* -------------------------------- Address view -------------------------------- */

const AddressView = ({
  address,
  onBack,
  onViewTx,
  onViewAddress,
  onViewToken,
}: {
  address: string;
  onBack: () => void;
  onViewTx: (h: string) => void;
  onViewAddress: (a: string) => void;
  onViewToken: (a: string) => void;
}) => {
  const [info, setInfo] = useState<any>(null);
  const [tokenMeta, setTokenMeta] = useState<any>(null);
  const [tokenMetaLoading, setTokenMetaLoading] = useState<boolean>(false);
  const [tab, setTab] = useState<'overview' | 'contract' | 'txs' | 'tokens'>('overview');
  const [addrTxs, setAddrTxs] = useState<any[] | null>(null);
  const [addrTxsLoading, setAddrTxsLoading] = useState<boolean>(false);
  const [heldTokens, setHeldTokens] = useState<any[] | null>(null);
  const [heldTokensLoading, setHeldTokensLoading] = useState<boolean>(false);
  const [nftCollections, setNftCollections] = useState<any[] | null>(null);
  const [nftCollectionsLoading, setNftCollectionsLoading] = useState<boolean>(false);
  const [selectedNftInstance, setSelectedNftInstance] = useState<any | null>(null);
  const [contract, setContract] = useState<any>(null);
  const [contractLoading, setContractLoading] = useState<boolean>(false);

  useEffect(() => {
    setAddrTxs(null);
    setHeldTokens(null);
    setNftCollections(null);
    setContract(null);
    setTab('overview');
  }, [address]);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      const j = await bs(`/addresses/${address}`);
      if (j && !cancelled) setInfo(j);
    };
    load();
    return () => { cancelled = true; };
  }, [address]);

  useEffect(() => {
    let cancelled = false;
    const loadTokenMeta = async () => {
      try {
        setTokenMetaLoading(true);
        const res = await fetch(`/api/v2/tokens/${address}`, { cache: 'no-store' });
        if (res.status === 404) { if (!cancelled) setTokenMeta(null); return; }
        if (res.status === 429) return;
        const j = await res.json();
        if (!cancelled && j?.address) setTokenMeta(j);
      } catch {
        if (!cancelled) setTokenMeta(null);
      } finally {
        if (!cancelled) setTokenMetaLoading(false);
      }
    };
    setTokenMeta(null);
    loadTokenMeta();
    return () => { cancelled = true; };
  }, [address]);

  useEffect(() => {
    let cancelled = false;
    const loadAddrTxs = async () => {
      setAddrTxsLoading(true);
      const j = await bs(`/addresses/${address}/transactions?limit=25`);
      if (j && !cancelled) setAddrTxs(j?.items || []);
      if (!cancelled) setAddrTxsLoading(false);
    };
    if (tab === 'txs' && addrTxs == null && !addrTxsLoading) loadAddrTxs();
    return () => { cancelled = true; };
  }, [tab, address]);

  useEffect(() => {
    let cancelled = false;
    const loadHeldTokens = async () => {
      setHeldTokensLoading(true);
      const j = await bs(`/addresses/${address}/tokens`);
      if (!cancelled) setHeldTokens(j?.items || []);
      if (!cancelled) setHeldTokensLoading(false);
    };
    if (tab === 'tokens' && heldTokens == null && !heldTokensLoading) loadHeldTokens();
    return () => { cancelled = true; };
  }, [tab, address]);

  useEffect(() => {
    let cancelled = false;
    const loadNftCollections = async () => {
      setNftCollectionsLoading(true);
      const j = await bs(`/addresses/${address}/nft/collections`);
      if (!cancelled) setNftCollections(j?.items || []);
      if (!cancelled) setNftCollectionsLoading(false);
    };
    if (tab === 'tokens' && nftCollections == null && !nftCollectionsLoading) loadNftCollections();
    return () => { cancelled = true; };
  }, [tab, address]);

  useEffect(() => {
    let cancelled = false;
    const loadContract = async () => {
      try {
        setContractLoading(true);
        const res = await fetch(`/api/v2/smart-contracts/${address}`, { cache: 'no-store' });
        if (res.status === 404) { if (!cancelled) setContract(null); return; }
        if (res.status === 429) return;
        const j = await res.json();
        if (!cancelled) setContract(j);
      } catch {}
      finally { if (!cancelled) setContractLoading(false); }
    };
    if (tab === 'contract' && info?.is_contract && contract == null && !contractLoading) loadContract();
    return () => { cancelled = true; };
  }, [tab, address, info?.is_contract]);

  const isNftMeta = String(tokenMeta?.type || '').includes('721') || String(tokenMeta?.type || '').includes('1155');

  return (
    <Page>
      <NftInstanceModal
        instance={selectedNftInstance}
        onClose={() => setSelectedNftInstance(null)}
        onViewToken={(a: string) => onViewToken(a)}
        onViewAddress={(a: string) => onViewAddress(a)}
      />

      <PageTitle
        title="Address"
        onBack={onBack}
        backLabel="Back"
        sub={
          <span className="inline-flex items-center gap-2 flex-wrap">
            {info?.is_contract ? <Badge tone="warn">contract</Badge> : <Badge tone="neutral">EOA</Badge>}
            {info?.is_verified ? <Badge tone="ok">verified</Badge> : null}
            <span className="font-mono break-all">{info?.hash || address}</span>
            <CopyBtn value={info?.hash || address} label="address" />
          </span>
        }
        right={
          <div className="rounded-xl border border-line bg-ink-800 px-4 py-2 text-right">
            <div className="text-[10px] uppercase tracking-wider text-txt-3">Balance</div>
            <div className="font-mono text-gold text-[15px] tnum">{fmtWei(info?.coin_balance)} {NATIVE_SYMBOL}</div>
          </div>
        }
      />

      {tokenMeta ? (
        <Card className="mb-4">
          <div className="px-4 py-3 flex items-center justify-between gap-3 flex-wrap">
            <div className="min-w-0">
              <div className="text-[11px] text-txt-3">{isNftMeta ? 'This address is an NFT contract' : 'This address is a token contract'}</div>
              <div className="mt-0.5 text-[13px] font-mono text-txt">
                <span className="text-gold">{String(tokenMeta.symbol || 'TOKEN')}</span> · {String(tokenMeta.name || 'Token')}
                <span className="text-txt-3 text-[11px]"> · {String(tokenMeta.type || '--')} · holders {String(tokenMeta.holders ?? '--')}</span>
              </div>
            </div>
            <Btn tone="primary" onClick={() => onViewToken(String(tokenMeta.address || address))}>Open token page</Btn>
          </div>
        </Card>
      ) : tokenMetaLoading ? (
        <div className="mb-4 text-[11px] font-mono text-txt-3">Checking token metadata…</div>
      ) : null}

      <Tabs
        tabs={[
          { k: 'overview', label: 'Overview' },
          ...(info?.is_contract ? [{ k: 'contract', label: 'Contract' }] : []),
          { k: 'txs', label: 'Transactions' },
          { k: 'tokens', label: 'Tokens & NFTs' },
        ]}
        active={tab}
        onChange={(k) => setTab(k as any)}
      />

      {tab === 'overview' ? (
        <Card>
          <CardHead title="Overview" />
          <div className="px-4 py-1">
            <KV label="Address" copy={info?.hash || address}><span className="font-mono text-cyan break-all">{info?.hash || address}</span></KV>
            <KV label="Balance"><span className="font-mono text-gold">{fmtWei(info?.coin_balance)} {NATIVE_SYMBOL}</span></KV>
            <KV label="Last balance update"><span className="font-mono">block {info?.block_number_balance_updated_at ?? '--'}</span></KV>
            <KV label="Type"><span className="font-mono">{info?.is_contract ? 'Contract' : 'Externally owned account'}</span></KV>
          </div>
        </Card>
      ) : tab === 'contract' ? (
        <Card>
          <CardHead
            title="Contract"
            meta={info?.is_verified ? 'verified' : 'unverified'}
            actions={
              <a
                href={`http://${window.location.hostname}:3000/address/${address}?tab=contract`}
                target="_blank"
                rel="noreferrer"
                className="px-3 py-1.5 rounded-lg text-[12px] border border-line text-txt-2 hover:text-txt hover:border-line-2 transition-colors"
              >
                Verify on Blockscout ↗
              </a>
            }
          />
          <div className="px-4 py-1">
            <KV label="Creator" copy={info?.creator_address_hash || undefined}>
              {info?.creator_address_hash ? (
                <LinkText onClick={() => onViewAddress(String(info.creator_address_hash))} className="text-[12px]">{String(info.creator_address_hash)}</LinkText>
              ) : '--'}
            </KV>
            <KV label="Creation tx" copy={info?.creation_transaction_hash || undefined}>
              {info?.creation_transaction_hash ? (
                <LinkText onClick={() => onViewTx(String(info.creation_transaction_hash))} className="text-[12px]">{String(info.creation_transaction_hash)}</LinkText>
              ) : '--'}
            </KV>
          </div>
          <div className="px-4 pb-4">
            <div className="mt-2 flex items-center justify-between gap-2">
              <div className="text-[10px] uppercase tracking-wider text-txt-3">Creation bytecode</div>
              {contract?.creation_bytecode ? <CopyBtn value={String(contract.creation_bytecode)} label="creation code" /> : null}
            </div>
            <pre className="mt-1.5 rounded-lg border border-line bg-ink-900 p-3 whitespace-pre-wrap break-all text-[10px] leading-relaxed font-mono text-txt-2 max-h-48 overflow-auto">
              {contractLoading ? 'Loading…' : (contract?.creation_bytecode || '—')}
            </pre>
            <div className="mt-3 flex items-center justify-between gap-2">
              <div className="text-[10px] uppercase tracking-wider text-txt-3">Deployed bytecode</div>
              {contract?.deployed_bytecode ? <CopyBtn value={String(contract.deployed_bytecode)} label="deployed code" /> : null}
            </div>
            <pre className="mt-1.5 rounded-lg border border-line bg-ink-900 p-3 whitespace-pre-wrap break-all text-[10px] leading-relaxed font-mono text-txt-2 max-h-48 overflow-auto">
              {contractLoading ? 'Loading…' : (contract?.deployed_bytecode || '—')}
            </pre>
          </div>
        </Card>
      ) : tab === 'txs' ? (
        <Card>
          <CardHead title="Transactions" meta={addrTxsLoading ? 'loading…' : `${addrTxs?.length ?? 0} shown`} />
          <Table>
            <thead>
              <tr>
                <Th>Tx hash</Th>
                <Th>Block</Th>
                <Th>Age</Th>
                <Th>From</Th>
                <Th>To</Th>
                <Th right>Value ({NATIVE_SYMBOL})</Th>
                <Th right>Fee</Th>
              </tr>
            </thead>
            <tbody>
              {addrTxsLoading || addrTxs == null ? (
                <SkeletonRows rows={8} cols={7} />
              ) : addrTxs.length === 0 ? (
                <tr><td colSpan={7}><Empty label="No transactions." /></td></tr>
              ) : (
                addrTxs.map((tx: any) => {
                  const from = String(tx?.from?.hash || '');
                  const to = String(tx?.to?.hash || '');
                  const self = String(address).toLowerCase();
                  const out = from.toLowerCase() === self;
                  return (
                    <TRow key={tx.hash}>
                      <Td mono>
                        <div className="flex items-center gap-1">
                          <StatusBadge status={tx.status ?? tx.result} />
                          <LinkText onClick={() => onViewTx(tx.hash)} title={tx.hash}>{short(String(tx.hash), 10, 6)}</LinkText>
                        </div>
                      </Td>
                      <Td mono>
                        <span className="text-txt-3">#{tx.block_number ?? tx.block ?? '--'}</span>
                      </Td>
                      <Td mono className="text-txt-3" title={String(tx.timestamp || '')}>{timeAgo(tx.timestamp)}</Td>
                      <Td mono>
                        <span className="inline-flex items-center gap-1">
                          {out ? <Badge tone="gold">out</Badge> : <Badge tone="cyan">in</Badge>}
                          <LinkText tone="muted" onClick={() => from && onViewAddress(from)} title={from}>{shortAddr(from)}</LinkText>
                        </span>
                      </Td>
                      <Td mono>
                        <LinkText tone="muted" onClick={() => to && onViewAddress(to)} title={to}>{shortAddr(to)}</LinkText>
                      </Td>
                      <Td right mono className="text-gold">{fmtWei(tx.value)}</Td>
                      <Td right mono className="text-txt-3">{fmtWei(tx.fee?.value ?? tx.fee ?? '0')}</Td>
                    </TRow>
                  );
                })
              )}
            </tbody>
          </Table>
        </Card>
      ) : (
        <div className="space-y-4">
          {tokenMeta ? (
            <Card>
              <div className="px-4 py-3 flex items-center justify-between gap-3">
                <div className="text-[12px] text-txt-2">
                  {isNftMeta ? 'This address is the NFT contract itself.' : 'This address is the token contract itself.'}{' '}
                  <span className="font-mono text-gold">{String(tokenMeta.symbol || 'TOKEN')}</span>
                  <span className="text-txt-3"> · supply {String(tokenMeta.total_supply ?? '--')}</span>
                </div>
                <Btn onClick={() => onViewToken(String(tokenMeta.address || address))}>Open token</Btn>
              </div>
            </Card>
          ) : null}

          {nftCollectionsLoading ? (
            <div className="text-[11px] font-mono text-txt-3">Loading NFT collections…</div>
          ) : nftCollections && nftCollections.length ? (
            <Card>
              <CardHead title="NFT collections" meta={`${nftCollections.length} collection(s)`} />
              <div className="px-4 py-3 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
                {nftCollections.map((col: any, i: number) => {
                  const token = col?.token || {};
                  const tokenAddr = String(token?.address || '').trim();
                  const instances = Array.isArray(col?.token_instances) ? col.token_instances : [];
                  return (
                    <div key={tokenAddr || i} className="rounded-lg border border-line bg-ink-900 p-3">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <div className="text-[13px] font-mono"><span className="text-gold">{String(token?.symbol || 'NFT')}</span> · <span className="text-txt-2">{String(token?.name || 'Collection')}</span></div>
                          <div className="mt-0.5 text-[10px] font-mono text-txt-3">{String(token?.type || '--')} · {String(col?.amount || '--')} item(s)</div>
                        </div>
                        {tokenAddr ? <Btn onClick={() => onViewToken(tokenAddr)}>Open</Btn> : null}
                      </div>
                      <div className="mt-3 grid grid-cols-4 gap-2">
                        {instances.slice(0, 4).map((inst: any) => (
                          <button
                            type="button"
                            key={String(inst?.id)}
                            onClick={() => setSelectedNftInstance({ ...inst, token })}
                            className="rounded-lg border border-line bg-ink-800 overflow-hidden hover:border-line-2 transition-colors text-left"
                          >
                            <div className="aspect-square bg-ink-950/60">
                              {inst?.image_url ? (
                                <img src={String(inst.image_url)} alt={String(inst?.metadata?.name || inst?.id || 'NFT')} className="w-full h-full object-cover" />
                              ) : (
                                <div className="w-full h-full flex items-center justify-center text-[9px] font-mono text-txt-3">#{String(inst?.id || '?')}</div>
                              )}
                            </div>
                          </button>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            </Card>
          ) : null}

          <Card>
            <CardHead title="Held tokens" meta={heldTokensLoading ? 'loading…' : `${heldTokens?.length ?? 0} token(s)`} />
            {heldTokensLoading || heldTokens == null ? (
              <Table><tbody><SkeletonRows rows={4} cols={4} /></tbody></Table>
            ) : heldTokens.length === 0 ? (
              <Empty label="No tokens held by this address." />
            ) : (
              <Table>
                <thead>
                  <tr>
                    <Th>Token</Th>
                    <Th>Contract</Th>
                    <Th>Type</Th>
                    <Th right>Amount</Th>
                  </tr>
                </thead>
                <tbody>
                  {heldTokens.map((item: any, i: number) => {
                    const token = item?.token || item;
                    const tokenAddr = String(token?.address || token?.hash || '').trim();
                    return (
                      <TRow key={tokenAddr || i}>
                        <Td mono>
                          <span className="text-gold">{String(token?.symbol || 'TOKEN')}</span>{' '}
                          <span className="text-txt-2">{String(token?.name || '')}</span>
                        </Td>
                        <Td mono>
                          <LinkText tone="muted" onClick={() => tokenAddr && onViewToken(tokenAddr)} title={tokenAddr}>
                            {shortAddr(tokenAddr)}
                          </LinkText>
                        </Td>
                        <Td mono className="text-txt-3">{String(token?.type || '--')}</Td>
                        <Td right mono className="text-txt-2">
                          {/721|1155/i.test(String(token?.type || ''))
                            ? String(item?.value ?? '--')
                            : fmtUnits(item?.value ?? '0', token?.decimals ?? 18)}
                        </Td>
                      </TRow>
                    );
                  })}
                </tbody>
              </Table>
            )}
          </Card>
        </div>
      )}
    </Page>
  );
};

/* -------------------------------- Tokens list -------------------------------- */

const TokensView = ({
  onViewToken,
}: {
  onViewToken: (a: string) => void;
  onViewAddress: (a: string) => void;
}) => {
  const [featured, setFeatured] = useState<any[]>([]);
  const [featuredLoading, setFeaturedLoading] = useState(true);
  const [items, setItems] = useState<any[] | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const loadFeatured = async () => {
      try {
        setFeaturedLoading(true);
        const res = await fetch('/featured-tokens.json', { cache: 'no-store' });
        const j = await res.json();
        const arr = Array.isArray(j?.featured) ? j.featured : [];
        if (!cancelled) setFeatured(arr);
      } catch {
        if (!cancelled) setFeatured([]);
      } finally {
        if (!cancelled) setFeaturedLoading(false);
      }
    };
    loadFeatured();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      const j = await bs('/tokens?limit=25');
      if (!cancelled) setItems(j?.items || []);
      if (!cancelled) setLoading(false);
    };
    load();
    return () => { cancelled = true; };
  }, []);

  return (
    <Page>
      <PageTitle title="Tokens" sub="Official featured tokens and everything indexed on-chain" />

      <Card className="mb-4">
        <CardHead title="Featured" meta="curated by DCAI" />
        <div className="px-4 py-3">
          {featuredLoading ? (
            <div className="text-[11px] font-mono text-txt-3">Loading…</div>
          ) : featured.length ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {featured.map((t: any, i: number) => {
                const addr = String(t?.address || t?.hash || t?.contract || '').trim();
                return (
                  <div key={addr || i} className="rounded-lg border border-gold/25 bg-gold/5 p-3 flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-[13px] font-mono">
                        <span className="text-gold font-semibold">{String(t?.symbol || t?.name || 'Token')}</span>
                        {t?.name && t?.symbol ? <span className="text-txt-2"> · {String(t.name)}</span> : null}
                        {t?.type ? <Badge tone="neutral" className="ml-2">{String(t.type).toUpperCase()}</Badge> : null}
                      </div>
                      <div className="mt-1 text-[11px] font-mono text-txt-3 break-all">{addr || 'missing address'}</div>
                    </div>
                    {addr ? <Btn tone="primary" onClick={() => onViewToken(addr)}>View</Btn> : null}
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="text-[12px] text-txt-3">No featured tokens configured (edit /featured-tokens.json).</div>
          )}
        </div>
      </Card>

      <Card>
        <CardHead title="All tokens" meta={loading ? 'loading…' : `${items?.length ?? 0} indexed`} />
        <Table>
          <thead>
            <tr>
              <Th>Token</Th>
              <Th>Contract</Th>
              <Th>Type</Th>
              <Th right>Holders</Th>
              <Th right>Transfers</Th>
            </tr>
          </thead>
          <tbody>
            {items == null ? (
              <SkeletonRows rows={6} cols={5} />
            ) : items.length === 0 ? (
              <tr><td colSpan={5}><Empty label="No tokens indexed yet." /></td></tr>
            ) : (
              items.map((t: any, i: number) => {
                const addr = String(t?.address || t?.hash || t?.contract_address || '').trim();
                return (
                  <TRow key={addr || i}>
                    <Td mono>
                      <LinkText onClick={() => addr && onViewToken(addr)}>
                        <span className="text-gold">{String(t?.symbol || '?')}</span>
                        <span className="text-txt-2"> · {String(t?.name || 'Token')}</span>
                      </LinkText>
                    </Td>
                    <Td mono>
                      <span className="text-txt-3" title={addr}>{shortAddr(addr)}</span>
                    </Td>
                    <Td><Badge tone="neutral">{String(t?.type || '--')}</Badge></Td>
                    <Td right mono className="text-txt-2">{t?.holders_count ?? t?.holders ?? '--'}</Td>
                    <Td right mono className="text-txt-2">{t?.transfers_count ?? t?.transfers ?? '--'}</Td>
                  </TRow>
                );
              })
            )}
          </tbody>
        </Table>
      </Card>
    </Page>
  );
};

/* --------------------------------- Token view -------------------------------- */

const TokenView = ({
  address,
  onBack,
  onViewTx,
  onViewBlock,
  onViewAddress,
}: {
  address: string;
  onBack: () => void;
  onViewTx: (h: string) => void;
  onViewBlock: (h: number) => void;
  onViewAddress: (a: string) => void;
}) => {
  const [info, setInfo] = useState<any>(null);
  const [tab, setTab] = useState<'overview' | 'transfers' | 'holders' | 'instances'>('transfers');

  const [transfers, setTransfers] = useState<any[] | null>(null);
  const [transfersPageParams, setTransfersPageParams] = useState<any | null>(null);
  const [transfersNextParams, setTransfersNextParams] = useState<any | null>(null);
  const [transfersPrevStack, setTransfersPrevStack] = useState<any[]>([]);

  const [holders, setHolders] = useState<any[] | null>(null);
  const [holdersPageParams, setHoldersPageParams] = useState<any | null>(null);
  const [holdersNextParams, setHoldersNextParams] = useState<any | null>(null);
  const [holdersPrevStack, setHoldersPrevStack] = useState<any[]>([]);
  const [instances, setInstances] = useState<any[] | null>(null);
  const [instancesLoading, setInstancesLoading] = useState<boolean>(false);
  const [selectedInstance, setSelectedInstance] = useState<any | null>(null);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      const j = await bs(`/tokens/${address}`);
      if (!cancelled) setInfo(j);
    };
    if (address) load();
    return () => { cancelled = true; };
  }, [address]);

  useEffect(() => {
    setTransfers(null);
    setTransfersPageParams(null);
    setTransfersNextParams(null);
    setTransfersPrevStack([]);
    setHolders(null);
    setHoldersPageParams(null);
    setHoldersNextParams(null);
    setHoldersPrevStack([]);
    setInstances(null);
  }, [address]);

  useEffect(() => {
    let cancelled = false;

    const loadTransfers = async () => {
      const sp = new URLSearchParams();
      sp.set('limit', '25');
      if (transfersPageParams) {
        for (const [k, v] of Object.entries(transfersPageParams)) if (v != null) sp.set(String(k), String(v));
      }
      const j = await bs(`/tokens/${address}/transfers?${sp.toString()}`);
      if (!cancelled) {
        setTransfers(j?.items || []);
        setTransfersNextParams(j?.next_page_params || null);
      }
    };

    const loadHolders = async () => {
      const sp = new URLSearchParams();
      sp.set('limit', '25');
      if (holdersPageParams) {
        for (const [k, v] of Object.entries(holdersPageParams)) if (v != null) sp.set(String(k), String(v));
      }
      const j = await bs(`/tokens/${address}/holders?${sp.toString()}`);
      if (!cancelled) {
        setHolders(j?.items || []);
        setHoldersNextParams(j?.next_page_params || null);
      }
    };

    const loadInstances = async () => {
      setInstancesLoading(true);
      const j = await bs(`/tokens/${address}/instances`);
      if (!cancelled) setInstances(j?.items || []);
      if (!cancelled) setInstancesLoading(false);
    };

    if (!address) return () => { cancelled = true; };
    if (tab === 'transfers') loadTransfers();
    if (tab === 'holders') loadHolders();
    if (tab === 'instances' && /721|1155/i.test(String(info?.type || '')) && instances == null && !instancesLoading) loadInstances();

    return () => { cancelled = true; };
  }, [address, tab, transfersPageParams, holdersPageParams, info?.type]);

  const isNft = /721|1155/i.test(String(info?.type || ''));
  const decimals = isNft ? null : (info?.decimals ?? '18');
  const symbol = info?.symbol || 'TOKEN';
  const name = info?.name || '';

  return (
    <Page>
      <NftInstanceModal
        instance={selectedInstance}
        onClose={() => setSelectedInstance(null)}
        onViewAddress={(a: string) => onViewAddress(a)}
      />

      <PageTitle
        title={symbol}
        accent={name || 'Token'}
        onBack={onBack}
        backLabel="All tokens"
        sub={
          <span className="inline-flex items-center gap-2 flex-wrap">
            <Badge tone="neutral">{String(info?.type || '--')}</Badge>
            <LinkText tone="muted" onClick={() => onViewAddress(address)} className="text-[12px] break-all">{address}</LinkText>
            <CopyBtn value={address} label="token address" />
          </span>
        }
        right={
          <div className="rounded-xl border border-line bg-ink-800 px-4 py-2 text-right">
            <div className="text-[10px] uppercase tracking-wider text-txt-3">Holders</div>
            <div className="font-mono text-txt text-[15px] tnum">{info?.holders ?? '--'}</div>
          </div>
        }
      />

      <Tabs
        tabs={[
          { k: 'transfers', label: 'Transfers' },
          { k: 'holders', label: 'Holders' },
          ...(isNft ? [{ k: 'instances', label: 'NFTs' }] : []),
          { k: 'overview', label: 'Overview' },
        ]}
        active={tab}
        onChange={(k) => setTab(k as any)}
      />

      {tab === 'overview' ? (
        <Card>
          <CardHead title="Overview" />
          <div className="px-4 py-1">
            <KV label="Symbol"><span className="font-mono text-gold">{symbol}</span></KV>
            <KV label="Name"><span className="font-mono">{name || '--'}</span></KV>
            <KV label="Type"><Badge tone="neutral">{String(info?.type || '--')}</Badge></KV>
            <KV label="Decimals"><span className="font-mono">{isNft ? 'n/a (NFT)' : String(decimals)}</span></KV>
            <KV label="Total supply">
              <span className="font-mono">{isNft ? `${String(info?.total_supply ?? '--')} NFT` : `${fmtUnits(info?.total_supply, decimals)} ${symbol}`}</span>
            </KV>
            <KV label="Contract" copy={address}><span className="font-mono text-cyan break-all">{address}</span></KV>
          </div>
        </Card>
      ) : tab === 'holders' ? (
        <Card>
          <CardHead
            title="Holders"
            meta={holders == null ? 'loading…' : `${holders.length} on this page`}
            actions={
              <Pager
                canPrev={holdersPrevStack.length > 0}
                canNext={!!holdersNextParams}
                onPrev={() => {
                  if (!holdersPrevStack.length) return;
                  const copy = holdersPrevStack.slice();
                  const prev = copy.pop();
                  setHoldersPrevStack(copy);
                  setHoldersPageParams(prev || null);
                }}
                onNext={() => {
                  if (!holdersNextParams) return;
                  setHoldersPrevStack((s) => [...s, holdersPageParams]);
                  setHoldersPageParams(holdersNextParams);
                }}
              />
            }
          />
          <Table>
            <thead>
              <tr>
                <Th>Address</Th>
                <Th right>Amount</Th>
                <Th right>% of supply</Th>
              </tr>
            </thead>
            <tbody>
              {holders == null ? (
                <SkeletonRows rows={8} cols={3} />
              ) : holders.length === 0 ? (
                <tr><td colSpan={3}><Empty label="No holders." /></td></tr>
              ) : (
                holders.map((h: any, i: number) => {
                  const a = String(h?.address?.hash || h?.address || '').trim();
                  const v = h?.value;
                  let pct: string = '--';
                  try {
                    const tot = BigInt(String(info?.total_supply ?? '0'));
                    if (tot > 0n) pct = ((Number(BigInt(String(v ?? '0')) * 10000n / tot) / 100)).toFixed(2) + '%';
                  } catch {}
                  return (
                    <TRow key={a || i}>
                      <Td mono>
                        <LinkText tone="muted" onClick={() => a && onViewAddress(a)} title={a}>{short(a, 12, 8)}</LinkText>
                      </Td>
                      <Td right mono className="text-gold">
                        {isNft ? `${String(v ?? '--')} NFT` : fmtUnits(v, decimals)}
                      </Td>
                      <Td right mono className="text-txt-3">{pct}</Td>
                    </TRow>
                  );
                })
              )}
            </tbody>
          </Table>
        </Card>
      ) : tab === 'instances' ? (
        <Card>
          <CardHead title="NFT instances" meta={instancesLoading ? 'loading…' : `${(instances || []).length} shown`} />
          <div className="px-4 py-3 grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-3">
            {(instances || []).map((inst: any) => (
              <button
                type="button"
                key={String(inst?.id)}
                onClick={() => setSelectedInstance(inst)}
                className="rounded-lg border border-line bg-ink-900 overflow-hidden hover:border-line-2 transition-colors text-left"
              >
                <div className="aspect-square bg-ink-950/60">
                  {inst?.image_url ? (
                    <img src={String(inst.image_url)} alt={String(inst?.metadata?.name || inst?.id || 'NFT')} className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-[10px] font-mono text-txt-3">no image</div>
                  )}
                </div>
                <div className="p-2.5">
                  <div className="text-[12px] font-mono text-txt truncate">{String(inst?.metadata?.name || `NFT #${inst?.id || '--'}`)}</div>
                  <div className="mt-0.5 text-[10px] font-mono text-txt-3 truncate">#{String(inst?.id || '--')} · {shortAddr(String(inst?.owner?.hash || ''))}</div>
                </div>
              </button>
            ))}
            {!instancesLoading && (!instances || instances.length === 0) ? (
              <div className="col-span-full"><Empty label="No NFT instances." /></div>
            ) : null}
          </div>
        </Card>
      ) : (
        <Card>
          <CardHead
            title="Token transfers"
            meta={transfers == null ? 'loading…' : `${transfers.length} on this page`}
            actions={
              <Pager
                canPrev={transfersPrevStack.length > 0}
                canNext={!!transfersNextParams}
                onPrev={() => {
                  if (!transfersPrevStack.length) return;
                  const copy = transfersPrevStack.slice();
                  const prev = copy.pop();
                  setTransfersPrevStack(copy);
                  setTransfersPageParams(prev || null);
                }}
                onNext={() => {
                  if (!transfersNextParams) return;
                  setTransfersPrevStack((s) => [...s, transfersPageParams]);
                  setTransfersPageParams(transfersNextParams);
                }}
              />
            }
          />
          <Table>
            <thead>
              <tr>
                <Th>Method</Th>
                <Th>Tx</Th>
                <Th>Block</Th>
                <Th>From</Th>
                <Th>To</Th>
                <Th right>Amount</Th>
              </tr>
            </thead>
            <tbody>
              {transfers == null ? (
                <SkeletonRows rows={8} cols={6} />
              ) : transfers.length === 0 ? (
                <tr><td colSpan={6}><Empty label="No token transfers yet." /></td></tr>
              ) : (
                transfers.map((tr: any, i: number) => {
                  const txh = String(tr?.transaction_hash || tr?.tx_hash || '').trim();
                  const bn = Number(tr?.block_number);
                  const from = String(tr?.from?.hash || tr?.from || '').trim();
                  const to = String(tr?.to?.hash || tr?.to || '').trim();
                  const method = String(tr?.method || '').trim();
                  const amt = tr?.total?.value ?? tr?.value ?? tr?.amount ?? '0';
                  const tokenId = tr?.total?.token_id ?? tr?.token_id ?? null;
                  const z = '0x0000000000000000000000000000000000000000';
                  const label = String(from).toLowerCase() === z ? 'mint' : (method || 'transfer');
                  return (
                    <TRow key={(txh || i) + ':' + String(tr?.log_index ?? i)}>
                      <Td><Badge tone={label === 'mint' ? 'ok' : 'neutral'}>{label}</Badge></Td>
                      <Td mono>
                        {txh ? (
                          <LinkText onClick={() => onViewTx(txh)} title={txh}>{short(txh, 10, 6)}</LinkText>
                        ) : <span className="text-txt-3">--</span>}
                      </Td>
                      <Td mono>
                        {Number.isFinite(bn) ? (
                          <LinkText tone="muted" onClick={() => onViewBlock(bn)}>#{bn}</LinkText>
                        ) : <span className="text-txt-3">--</span>}
                      </Td>
                      <Td mono>
                        <LinkText tone="muted" onClick={() => from && onViewAddress(from)} title={from}>{shortAddr(from)}</LinkText>
                      </Td>
                      <Td mono>
                        <LinkText tone="muted" onClick={() => to && onViewAddress(to)} title={to}>{shortAddr(to)}</LinkText>
                      </Td>
                      <Td right mono className="text-gold">
                        {isNft ? (tokenId != null ? `NFT #${String(tokenId)}` : 'NFT') : `${fmtUnits(amt, decimals)} ${symbol}`}
                      </Td>
                    </TRow>
                  );
                })
              )}
            </tbody>
          </Table>
        </Card>
      )}
    </Page>
  );
};

/* ------------------------------------ App ------------------------------------ */

export default function App() {
  const [currentView, setCurrentView] = useState<ViewKey>('home');
  const [selectedBlock, setSelectedBlock] = useState<any>(null);
  const [selectedTxHash, setSelectedTxHash] = useState<string | null>(null);
  const [selectedAddress, setSelectedAddress] = useState<string | null>(null);
  const [selectedTokenAddress, setSelectedTokenAddress] = useState<string | null>(null);

  useEffect(() => {
    const applyRouteFromPath = () => {
      try {
        const path = window.location.pathname || '/';

        if (path === '/blocks' || path === '/blocks/') { setCurrentView('blocks'); return; }
        if (path === '/txs' || path === '/txs/') { setCurrentView('txs'); return; }
        if (path === '/tokens' || path === '/tokens/') { setCurrentView('tokens'); return; }
        if (path === '/dashboard' || path === '/dashboard/') { setCurrentView('dashboard'); return; }
        if (path === '/contributors' || path === '/contributors/' || path === '/nodes' || path === '/nodes/') { setCurrentView('contributors'); return; }

        const txm = path.match(/^\/tx\/(0x[0-9a-fA-F]{64})/);
        if (txm) { setSelectedTxHash(txm[1]); setCurrentView('tx'); return; }

        const bm = path.match(/^\/block\/(\d+)/);
        if (bm) {
          const h = parseInt(bm[1], 10);
          if (Number.isFinite(h)) { setSelectedBlock({ height: h }); setCurrentView('block'); return; }
        }

        const tokm = path.match(/^\/token\/(0x[0-9a-fA-F]{40})/);
        if (tokm) { setSelectedTokenAddress(tokm[1]); setCurrentView('token'); return; }

        const am = path.match(/^\/address\/(0x[0-9a-fA-F]{40})/);
        if (am) { setSelectedAddress(am[1]); setCurrentView('address'); return; }
      } catch {}
      setCurrentView('home');
    };

    applyRouteFromPath();
    window.addEventListener('popstate', applyRouteFromPath);
    return () => window.removeEventListener('popstate', applyRouteFromPath);
  }, []);

  const [blocks, setBlocks] = useState<any[]>([]);
  const [txs, setTxs] = useState<any[]>([]);

  const cliqueRecentsRef = useRef<Record<string, string>>({});
  const signerByHeightRef = useRef<Record<number, string>>({});
  const signerInflightRef = useRef<Set<number>>(new Set());
  const latestHeightRef = useRef<number | null>(null);
  const seenTxRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    let cancelled = false;

    const fetchBlocks = async () => {
      try {
        const data = await bs('/blocks?type=block&limit=15');
        if (!data) return;
        const apiItems = (data?.items || []).slice(0, 15);

        let recents: Record<string, string> = cliqueRecentsRef.current || {};
        try {
          const snap = await rpc('clique_getSnapshot', ['latest']);
          const next = snap?.recents;
          if (next && typeof next === 'object' && Object.keys(next).length) {
            cliqueRecentsRef.current = next as Record<string, string>;
            recents = next as Record<string, string>;
          }
        } catch {}

        const prevTop = latestHeightRef.current;

        const items = apiItems.map((b: any) => {
          const height = Number(b.height);
          const signer = (signerByHeightRef.current[height] || recents[String(height)] || '').toLowerCase();
          const rewardWei = b.transaction_fees ?? '0';
          return {
            height,
            hash: b.hash,
            miner: signer ? shortAddr(signer) : '--',
            validator: signer || '',
            txCount: Number(b.transaction_count ?? 0),
            timestamp: b.timestamp,
            reward: fmtWei(rewardWei, 4),
            gasUsed: b.gas_used,
            gasLimit: b.gas_limit,
            baseFeePerGas: b.base_fee_per_gas,
            _new: prevTop != null && height > prevTop,
          };
        });

        if (!cancelled) {
          const newest = items[0];
          if (newest && typeof newest.height === 'number') {
            if (latestHeightRef.current == null || newest.height > latestHeightRef.current) {
              latestHeightRef.current = newest.height;
            }
          }

          setBlocks(items);

          const missingHeights = Array.from(
            new Set<number>(
              items
                .map((x: any) => Number(x.height))
                .filter(
                  (h: number) =>
                    Number.isFinite(h) &&
                    !signerByHeightRef.current[h] &&
                    !(recents[String(h)] || '').toLowerCase()
                )
            )
          ).slice(0, 10);

          const toFetch = missingHeights.filter((h) => !signerInflightRef.current.has(h));
          toFetch.forEach((h) => signerInflightRef.current.add(h));

          if (toFetch.length) {
            (async () => {
              const updates: Record<number, string> = {};
              for (const h of toFetch) {
                try {
                  const hex = '0x' + h.toString(16);
                  const snap = await rpc('clique_getSnapshot', [hex]);
                  const signer = String(snap?.recents?.[String(h)] || '').toLowerCase();
                  if (signer) updates[h] = signer;
                } catch {
                } finally {
                  signerInflightRef.current.delete(h);
                }
              }
              const ks = Object.keys(updates);
              if (!ks.length) return;
              for (const k of ks) signerByHeightRef.current[Number(k)] = updates[Number(k)];
              if (!cancelled) {
                setBlocks((prev) =>
                  (prev || []).map((b: any) => {
                    const s = updates[Number(b.height)];
                    if (!s) return b;
                    return { ...b, validator: s, miner: shortAddr(s) };
                  })
                );
              }
            })();
          }
        }
      } catch {}
    };

    const fetchTxs = async () => {
      try {
        const data = await bs('/transactions?limit=15');
        if (!data) return;
        const items = (data?.items || []).slice(0, 15).map((tx: any) => ({
          hash: tx.hash,
          result: tx.result || tx.status || '--',
          method: methodLabel(tx),
          from: tx.from?.hash || tx.from || '--',
          to: tx.created_contract?.hash || tx.to?.hash || tx.to || '--',
          value: fmtWei(tx.value),
          fee: fmtWei(tx.fee?.value ?? tx.fee ?? '0'),
          timestamp: tx.timestamp,
          _new: seenTxRef.current.size > 0 && !seenTxRef.current.has(String(tx.hash)),
        }));
        items.forEach((t: any) => seenTxRef.current.add(String(t.hash)));
        if (!cancelled) setTxs(items);
      } catch {}
    };

    let lastBn: number | null = null;
    const pollBlockNumber = async () => {
      const bn = await rpcBlockNumber();
      if (bn != null) {
        if (lastBn == null) lastBn = bn;
        if (bn > (lastBn ?? 0)) {
          lastBn = bn;
          fetchBlocks();
        }
      }
    };

    pollBlockNumber();
    const bnInt = setInterval(pollBlockNumber, 1000);
    fetchBlocks();
    fetchTxs();
    const bInt = setInterval(fetchBlocks, 8000);
    const tInt = setInterval(fetchTxs, 3000);

    return () => {
      cancelled = true;
      clearInterval(bInt);
      clearInterval(tInt);
      clearInterval(bnInt);
    };
  }, []);

  const handleViewBlock = (block: any) => {
    setSelectedBlock(block);
    setCurrentView('block');
    try {
      if (block?.height != null) window.history.pushState({ view: 'block', height: block.height }, '', `/block/${block.height}`);
    } catch {}
  };

  const handleViewBlockH = (h: number) => {
    setSelectedBlock({ height: h });
    setCurrentView('block');
    try { window.history.pushState({ view: 'block', height: h }, '', `/block/${h}`); } catch {}
  };

  const handleViewTx = (hash: string) => {
    setSelectedTxHash(hash);
    setCurrentView('tx');
    try { window.history.pushState({ view: 'tx', hash }, '', `/tx/${hash}`); } catch {}
  };

  const handleViewAddress = (addr: string) => {
    setSelectedAddress(addr);
    setCurrentView('address');
    try { window.history.pushState({ view: 'address', address: addr }, '', `/address/${addr}`); } catch {}
  };

  const handleViewToken = (addr: string) => {
    setSelectedTokenAddress(addr);
    setCurrentView('token');
    try { window.history.pushState({ view: 'token', address: addr }, '', `/token/${addr}`); } catch {}
  };

  return (
    <div className="min-h-screen bg-ink-950 text-txt font-sans relative overflow-x-hidden">
      <div className="brand-wash" />

      <Header active={currentView} />
      <SearchBar />

      <>
        {currentView === 'home' ? (
          <HomeView key="home" blocks={blocks} txs={txs} onViewBlock={handleViewBlock} onViewTx={handleViewTx} />
        ) : currentView === 'blocks' ? (
          <BlocksListView key="blocks" onViewBlock={handleViewBlockH} />
        ) : currentView === 'txs' ? (
          <TxsListView key="txs" onViewTx={handleViewTx} onViewAddress={handleViewAddress} onViewBlock={handleViewBlockH} />
        ) : currentView === 'tokens' ? (
          <TokensView key="tokens" onViewToken={handleViewToken} onViewAddress={handleViewAddress} />
        ) : currentView === 'contributors' ? (
          <Suspense key="contributors" fallback={<ViewLoading />}>
            <ContributorProgram />
          </Suspense>
        ) : currentView === 'dashboard' ? (
          <Suspense key="dashboard" fallback={<ViewLoading />}>
            <DashboardView />
          </Suspense>
        ) : currentView === 'token' ? (
          <TokenView
            key="token"
            address={selectedTokenAddress || ''}
            onBack={() => { setCurrentView('tokens'); try { window.history.pushState({ view: 'tokens' }, '', '/tokens'); } catch {} }}
            onViewTx={handleViewTx}
            onViewBlock={handleViewBlockH}
            onViewAddress={handleViewAddress}
          />
        ) : currentView === 'tx' ? (
          <TxView
            key="tx"
            hash={selectedTxHash || ''}
            onBack={() => window.history.back()}
            onViewBlock={handleViewBlockH}
            onViewAddress={handleViewAddress}
          />
        ) : currentView === 'address' ? (
          <AddressView
            key="address"
            address={selectedAddress || ''}
            onBack={() => window.history.back()}
            onViewTx={handleViewTx}
            onViewAddress={handleViewAddress}
            onViewToken={handleViewToken}
          />
        ) : (
          <BlockView
            key="block"
            block={selectedBlock}
            onBack={() => window.history.back()}
            onViewTx={handleViewTx}
            onViewAddress={handleViewAddress}
            onViewBlock={handleViewBlockH}
          />
        )}
      </>

      <footer className="border-t border-line mt-14 relative z-10 bg-ink-900/60">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 grid grid-cols-1 md:grid-cols-3 gap-6">
          <div>
            <div className="flex items-center gap-2">
              <div className="w-6 h-6 rounded-md bg-gold flex items-center justify-center">
                <Cpu className="w-3.5 h-3.5 text-ink-950" />
              </div>
              <span className="font-bold text-[14px] text-txt">DCAI <span className="text-gold">L3</span></span>
              <Badge tone="cyan">testnet</Badge>
            </div>
            <div className="mt-2 text-[11px] font-mono text-txt-3 leading-5">
              AuraScan — the DCAI L3 explorer.<br />
              chainId {CHAIN_ID} · {NATIVE_SYMBOL} · Clique PoA · Geth v1.13.15
            </div>
          </div>

          <div>
            <div className="text-[10px] uppercase tracking-wider text-txt-3 mb-2">Explorer</div>
            <div className="flex flex-col gap-1.5 text-[12px]">
              <LinkText tone="muted" onClick={() => navigateTo('/blocks')}><span className="inline-flex items-center gap-1.5"><Box className="w-3 h-3" /> Blocks</span></LinkText>
              <LinkText tone="muted" onClick={() => navigateTo('/txs')}><span className="inline-flex items-center gap-1.5"><ArrowRightLeft className="w-3 h-3" /> Transactions</span></LinkText>
              <LinkText tone="muted" onClick={() => navigateTo('/tokens')}><span className="inline-flex items-center gap-1.5"><Database className="w-3 h-3" /> Tokens</span></LinkText>
            </div>
          </div>

          <div>
            <div className="text-[10px] uppercase tracking-wider text-txt-3 mb-2">Network</div>
            <div className="flex flex-col gap-1.5 text-[12px]">
              <LinkText tone="muted" onClick={() => navigateTo('/dashboard')}><span className="inline-flex items-center gap-1.5"><Code2 className="w-3 h-3" /> RPC API keys</span></LinkText>
              <LinkText tone="muted" onClick={() => navigateTo('/contributors')}><span className="inline-flex items-center gap-1.5"><ShieldCheck className="w-3 h-3" /> Contributor program</span></LinkText>
              <a className="font-mono text-txt-2 hover:text-cyan transition-colors" href={`${publicBase}/faucet/`} target="_blank" rel="noreferrer">Faucet ↗</a>
              <a className="font-mono text-txt-2 hover:text-cyan transition-colors" href={`${publicBase}/rewards/`} target="_blank" rel="noreferrer">Rewards ↗</a>
            </div>
          </div>
        </div>
        <div className="border-t border-line/60">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3 text-[10px] font-mono text-txt-3">
            © 2026 DCAI Foundation · All systems nominal
          </div>
        </div>
      </footer>
    </div>
  );
}
