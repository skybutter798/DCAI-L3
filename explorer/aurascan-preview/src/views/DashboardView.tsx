import { useState, useEffect } from 'react';
import { ethers } from 'ethers';
import { adminApiBase, publicBase, CHAIN_ID, NATIVE_SYMBOL } from '../lib/api';
import { fmtNum, shortAddr } from '../lib/format';
import { Card, CardHead, Page, PageTitle, Badge, Btn, CopyBtn, Notice } from '../components/ui';


const DashboardView = () => {
  const STAKE_CONTRACT = '0x54ff6c64f1f7915a3aD54743aDd92b32412B06BC';

  const [addr, setAddr] = useState<string | null>(null);
  const [chainId, setChainId] = useState<number | null>(null);
  const [stake, setStake] = useState<{ tier: number; stakeWei: string; requestedAt: string } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [note, setNote] = useState('');
  const [tier, setTier] = useState<'basic' | 'pro' | 'ultra'>('basic');
  const [docsTab, setDocsTab] = useState<'dapp' | 'ops'>('dapp');
  const [lastReq, setLastReq] = useState<any>(null);
  const [revealedKeys, setRevealedKeys] = useState<any[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [nowSec, setNowSec] = useState(() => Math.floor(Date.now() / 1000));

  const tiers = {
    basic: { label: 'Basic', enum: 1, stake: '1000', rate: '10 r/s', burst: '40' },
    pro: { label: 'Pro', enum: 2, stake: '5000', rate: '50 r/s', burst: '200' },
    ultra: { label: 'Ultra', enum: 3, stake: '10000', rate: '200 r/s', burst: '800' },
  } as const;

  const connect = async () => {
    setErr(null);
    const eth = (window as any).ethereum;
    if (!eth) {
      setErr('No wallet detected (install MetaMask).');
      return;
    }
    try {
      setBusy('Connecting wallet…');
      const provider = new ethers.BrowserProvider(eth);
      await provider.send('eth_requestAccounts', []);
      const signer = await provider.getSigner();
      const a = await signer.getAddress();
      const net = await provider.getNetwork();
      setAddr(a);
      setChainId(Number(net.chainId));
    } catch (e: any) {
      setErr(String(e?.message || e));
    } finally {
      setBusy(null);
    }
  };

  const refreshStake = async () => {
    if (!addr) return;
    setErr(null);
    try {
      setBusy('Loading stake status…');
      const eth = (window as any).ethereum;
      const provider = new ethers.BrowserProvider(eth);
      const c = new ethers.Contract(
        STAKE_CONTRACT,
        ['function getStake(address) view returns (uint8 tier, uint256 stakeWei, uint256 requestedAt)'],
        provider
      );
      const [t, s, r] = await c.getStake(addr);
      setStake({ tier: Number(t), stakeWei: String(s), requestedAt: String(r) });
    } catch (e: any) {
      setErr(String(e?.message || e));
    } finally {
      setBusy(null);
    }
  };

  useEffect(() => { if (addr) refreshStake(); }, [addr]);

  useEffect(() => {
    const t = setInterval(() => setNowSec(Math.floor(Date.now() / 1000)), 1000);
    return () => clearInterval(t);
  }, []);

  const doStake = async (tierKey: 'basic' | 'pro' | 'ultra') => {
    setErr(null);
    const eth = (window as any).ethereum;
    if (!eth) return;
    try {
      setBusy('Sending stake tx…');
      const provider = new ethers.BrowserProvider(eth);
      const signer = await provider.getSigner();
      const c = new ethers.Contract(STAKE_CONTRACT, ['function stake(uint8 tier) payable'], signer);
      const v = ethers.parseEther(tiers[tierKey].stake);
      const tx = await c.stake(tiers[tierKey].enum, { value: v });
      await tx.wait();
      await refreshStake();
    } catch (e: any) {
      setErr(String(e?.message || e));
    } finally {
      setBusy(null);
    }
  };

  const requestUnstake = async () => {
    if (!addr) return;
    setErr(null);
    const eth = (window as any).ethereum;
    if (!eth) return;
    try {
      setBusy('Requesting unstake (sign tx)…');
      const provider = new ethers.BrowserProvider(eth);
      const signer = await provider.getSigner();
      const c = new ethers.Contract(STAKE_CONTRACT, ['function requestUnstake()'], signer);
      const tx = await c.requestUnstake();
      await tx.wait();
      await refreshStake();
    } catch (e: any) {
      setErr(String(e?.message || e));
    } finally {
      setBusy(null);
    }
  };

  const withdrawStake = async () => {
    if (!addr) return;
    setErr(null);
    const eth = (window as any).ethereum;
    if (!eth) return;
    try {
      setBusy('Withdrawing stake (sign tx)…');
      const provider = new ethers.BrowserProvider(eth);
      const signer = await provider.getSigner();
      const c = new ethers.Contract(STAKE_CONTRACT, ['function withdraw()'], signer);
      const tx = await c.withdraw();
      await tx.wait();
      await refreshStake();
    } catch (e: any) {
      setErr(String(e?.message || e));
    } finally {
      setBusy(null);
    }
  };

  const requestApiKey = async () => {
    if (!addr) return;
    setErr(null);
    try {
      setBusy('Requesting API key (sign message)…');
      const eth = (window as any).ethereum;
      const provider = new ethers.BrowserProvider(eth);
      const signer = await provider.getSigner();

      const nonceRes = await fetch(`${adminApiBase}/auth/nonce?address=${encodeURIComponent(addr)}`);
      const nonceJson = await nonceRes.json();
      const nonce = nonceJson?.nonce;
      if (!nonce) throw new Error('Failed to get nonce');

      const message = `DCAI API Key Request\nAddress: ${addr}\nTier: ${tier}\nNonce: ${nonce}`;
      const signature = await signer.signMessage(message);

      const res = await fetch(`${adminApiBase}/apikey/request`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ address: addr, tier, note, signature }),
      });
      const j = await res.json();
      setLastReq(j);
      if (!j?.ok) setErr(j?.error || 'Request failed');
    } catch (e: any) {
      setErr(String(e?.message || e));
    } finally {
      setBusy(null);
    }
  };

  const revealMyKeys = async () => {
    if (!addr) return;
    setErr(null);
    try {
      setBusy('Revealing keys (sign message)…');
      const eth = (window as any).ethereum;
      const provider = new ethers.BrowserProvider(eth);
      const signer = await provider.getSigner();

      const nonceRes = await fetch(`${adminApiBase}/auth/nonce?address=${encodeURIComponent(addr)}`);
      const nonceJson = await nonceRes.json();
      const nonce = nonceJson?.nonce;
      if (!nonce) throw new Error('Failed to get nonce');

      const message = `DCAI API Key Reveal\nAddress: ${addr}\nNonce: ${nonce}`;
      const signature = await signer.signMessage(message);

      const res = await fetch(`${adminApiBase}/apikey/reveal`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ address: addr, signature }),
      });
      const j = await res.json();
      if (!j?.ok) throw new Error(j?.error || 'Reveal failed');
      setRevealedKeys(j?.keys || []);
    } catch (e: any) {
      setErr(String(e?.message || e));
    } finally {
      setBusy(null);
    }
  };

  const endpointFor = (tierKey: string, key: string) => ({
    http: `${publicBase}/rpc/${tierKey}/${key}/`,
    ws: `${publicBase.replace('http', 'ws')}/ws/${tierKey}/${key}/`,
  });

  const stakeTierLabel = (() => {
    const t = stake?.tier ?? 0;
    if (t === 1) return 'basic';
    if (t === 2) return 'pro';
    if (t === 3) return 'ultra';
    return 'none';
  })();

  const stakeAmount = (() => {
    try {
      if (!stake?.stakeWei) return '0';
      return ethers.formatEther(BigInt(stake.stakeWei));
    } catch {
      return stake?.stakeWei || '0';
    }
  })();

  const requestedAtSec = (() => {
    try { return Number(stake?.requestedAt || '0'); } catch { return 0; }
  })();

  const cooldownEndsSec = requestedAtSec > 0 ? (requestedAtSec + 86400) : 0;
  const cooldownLeftSec = cooldownEndsSec > 0 ? (cooldownEndsSec - nowSec) : 0;

  const METHOD_GROUPS: { title: string; items: string[] }[] = [
    { title: 'web3_*', items: ['web3_clientVersion', 'web3_sha3'] },
    { title: 'net_*', items: ['net_version', 'net_listening', 'net_peerCount'] },
    { title: 'eth_* (status / basics)', items: ['eth_protocolVersion', 'eth_syncing', 'eth_coinbase', 'eth_mining', 'eth_hashrate', 'eth_gasPrice', 'eth_feeHistory', 'eth_maxPriorityFeePerGas', 'eth_accounts', 'eth_chainId', 'eth_blockNumber'] },
    { title: 'eth_* (state / contract)', items: ['eth_getBalance', 'eth_getStorageAt', 'eth_getTransactionCount', 'eth_getCode', 'eth_call', 'eth_estimateGas', 'eth_createAccessList', 'eth_getProof'] },
    { title: 'eth_* (blocks / txs)', items: ['eth_getBlockByHash', 'eth_getBlockByNumber', 'eth_getTransactionByHash', 'eth_getTransactionReceipt', 'eth_getTransactionByBlockHashAndIndex', 'eth_getTransactionByBlockNumberAndIndex', 'eth_getBlockTransactionCountByHash', 'eth_getBlockTransactionCountByNumber'] },
    { title: 'eth_* (logs / filters)', items: ['eth_newFilter', 'eth_newBlockFilter', 'eth_newPendingTransactionFilter', 'eth_uninstallFilter', 'eth_getFilterChanges', 'eth_getFilterLogs', 'eth_getLogs'] },
    { title: 'eth_* (send / sign)', items: ['eth_sign', 'eth_signTransaction', 'eth_sendTransaction', 'eth_sendRawTransaction'] },
    { title: 'WebSocket only', items: ['eth_subscribe (newHeads / logs / newPendingTransactions)', 'eth_unsubscribe'] },
  ];

  return (
    <Page>
      <PageTitle
        title="API"
        accent="Dashboard"
        sub="Stake tDCAI → apply → admin approval → receive an API key for the gated RPC."
      />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4">
        <Card>
          <CardHead
            title="Wallet"
            actions={
              <div className="flex gap-1.5">
                <Btn tone="primary" onClick={connect}>{addr ? 'Reconnect' : 'Connect wallet'}</Btn>
                <Btn disabled={!addr} onClick={refreshStake}>Refresh</Btn>
              </div>
            }
          />
          <div className="px-4 py-3">
            <div className="text-[12px] font-mono text-txt break-all">{addr || 'Not connected'}</div>
            <div className="mt-1 text-[11px] font-mono text-txt-3">
              chainId {chainId ?? '--'} · stake contract {shortAddr(STAKE_CONTRACT)}
              <CopyBtn value={STAKE_CONTRACT} label="stake contract" />
            </div>
            {err ? <Notice tone="bad">{err}</Notice> : null}
            {busy ? <Notice tone="neutral">{busy}</Notice> : null}
          </div>
        </Card>

        <Card>
          <CardHead
            title="Current stake"
            actions={
              <div className="flex gap-1.5">
                <Btn tone="danger" disabled={!addr || stakeTierLabel === 'none' || requestedAtSec > 0} onClick={requestUnstake}>Request unstake</Btn>
                <Btn tone="ok" disabled={!addr || requestedAtSec <= 0 || cooldownLeftSec > 0} onClick={withdrawStake}>Withdraw</Btn>
              </div>
            }
          />
          <div className="px-4 py-3">
            <div className="text-[13px] font-mono">
              tier <span className="text-gold font-semibold">{stakeTierLabel}</span> · <span className="text-gold">{stakeAmount}</span> {NATIVE_SYMBOL}
            </div>
            <div className="mt-1 text-[11px] font-mono text-txt-3">
              {requestedAtSec > 0
                ? (cooldownLeftSec <= 0
                  ? 'Unstake requested — withdrawal available now.'
                  : `Unstake requested — withdrawal in ${Math.max(0, cooldownLeftSec)}s.`)
                : 'No unstake requested · cooldown 24h.'}
            </div>
            <div className="mt-1 text-[11px] text-txt-3">Keys stay valid while staked; revoke on withdraw is currently manual.</div>
          </div>
        </Card>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-4">
        {(['basic', 'pro', 'ultra'] as const).map((k) => (
          <div
            key={k}
            className={`rounded-xl border p-4 transition-colors ${tier === k ? 'border-gold/50 bg-gold/5' : 'border-line bg-ink-800'}`}
          >
            <div className="flex items-center justify-between">
              <div className="text-[11px] uppercase tracking-wider text-txt-3">{tiers[k].label}</div>
              {tier === k ? <Badge tone="gold">selected</Badge> : null}
            </div>
            <div className="mt-1.5 text-lg font-mono text-txt tnum">{fmtNum(tiers[k].stake)} <span className="text-[12px] text-txt-3">{NATIVE_SYMBOL}</span></div>
            <div className="mt-0.5 text-[11px] font-mono text-txt-3">{tiers[k].rate} · burst {tiers[k].burst}</div>
            <div className="mt-3 flex gap-1.5">
              <Btn tone={tier === k ? 'primary' : 'ghost'} className="flex-1" disabled={!addr} onClick={() => { setTier(k); doStake(k); }}>
                Stake & select
              </Btn>
              <Btn onClick={() => setTier(k)}>Select</Btn>
            </div>
          </div>
        ))}
      </div>

      <Card className="mb-4">
        <CardHead title="Apply for a key" meta={`selected tier: ${tier}`} />
        <div className="px-4 py-3">
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Tell us your intended usage (optional)…"
            className="w-full min-h-[80px] bg-ink-900 border border-line rounded-lg p-3 text-[12px] font-mono text-txt outline-none focus:border-gold/50 transition-colors"
          />
          <div className="mt-3 flex flex-wrap gap-2">
            <Btn tone="primary" disabled={!addr} onClick={requestApiKey}>Submit request</Btn>
            <Btn disabled={!addr} onClick={revealMyKeys}>Reveal my keys</Btn>
          </div>
          {lastReq ? (
            <pre className="mt-3 rounded-lg border border-line bg-ink-900 p-3 text-[10px] font-mono text-txt-2 whitespace-pre-wrap break-all max-h-40 overflow-auto">{JSON.stringify(lastReq, null, 2)}</pre>
          ) : null}
        </div>
      </Card>

      <Card>
        <CardHead
          title="Endpoints & docs"
          meta={`chainId ${CHAIN_ID} · ${NATIVE_SYMBOL}`}
          actions={
            <div className="flex items-center gap-1.5">
              <Btn tone={docsTab === 'dapp' ? 'primary' : 'ghost'} onClick={() => setDocsTab('dapp')}>dApp</Btn>
              <Btn tone={docsTab === 'ops' ? 'primary' : 'ghost'} onClick={() => setDocsTab('ops')}>Ops</Btn>
            </div>
          }
        />
        <div className="px-4 py-3">
          <details className="rounded-lg border border-line bg-ink-900 p-3">
            <summary className="cursor-pointer select-none text-[11px] font-mono text-txt-2 hover:text-txt">
              Supported Ethereum JSON-RPC methods
            </summary>
            <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-3 text-[11px] font-mono">
              {METHOD_GROUPS.map((g) => (
                <div key={g.title} className="rounded-lg border border-line/60 bg-ink-800 p-3">
                  <div className="text-txt-3">{g.title}</div>
                  <div className="mt-1.5 text-txt-2 space-y-0.5">
                    {g.items.map((m) => <div key={m}>{m}</div>)}
                  </div>
                </div>
              ))}
              <div className="md:col-span-2 text-[10px] text-txt-3">
                Not public by default: debug_*, admin_*, personal_*, txpool_*, trace_*
              </div>
            </div>
          </details>

          {revealedKeys && revealedKeys.length ? (
            <div className="mt-3 space-y-3">
              {revealedKeys.map((k, i) => {
                const e = endpointFor(String(k.tier), String(k.key));
                const u = k?.usage || {};
                return (
                  <div key={i} className="rounded-lg border border-line bg-ink-900 p-3">
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                      <div className="text-[12px] font-mono">
                        <Badge tone="gold">{String(k.tier)}</Badge>{' '}
                        <span className="text-txt break-all">{String(k.key)}</span>
                        <CopyBtn value={String(k.key)} label="API key" />
                      </div>
                      <div className="text-[10px] font-mono text-txt-3">
                        today {u?.today ?? '--'} · 5m {u?.last5m ?? '--'} · 60m {u?.last60m ?? '--'}
                      </div>
                    </div>

                    <div className="mt-2 grid grid-cols-1 sm:grid-cols-2 gap-2 text-[10px] font-mono text-txt-3">
                      <div>
                        status 60m: 2xx <span className="text-txt-2">{u?.statusLast60m?.['2xx'] ?? 0}</span> · 4xx <span className="text-txt-2">{u?.statusLast60m?.['4xx'] ?? 0}</span> · 5xx <span className="text-txt-2">{u?.statusLast60m?.['5xx'] ?? 0}</span> · 429 <span className="text-txt-2">{u?.statusLast60m?.['429'] ?? 0}</span>
                      </div>
                      <div>
                        latency 60m: p50 <span className="text-txt-2">{u?.latencyLast60m?.p50Ms ?? '--'}ms</span> · p95 <span className="text-txt-2">{u?.latencyLast60m?.p95Ms ?? '--'}ms</span>
                      </div>
                      {Array.isArray(u?.topMethodsLast60m) && u.topMethodsLast60m.length ? (
                        <div className="sm:col-span-2">
                          top: {u.topMethodsLast60m.slice(0, 6).map((m: any) => `${m.method}:${m.count}`).join(' · ')}
                        </div>
                      ) : null}
                    </div>

                    <div className="mt-3 grid grid-cols-1 gap-1.5 text-[11px] font-mono">
                      <div className="flex items-center gap-2">
                        <span className="text-txt-3 w-10">HTTP</span>
                        <span className="text-cyan break-all">{e.http}</span>
                        <CopyBtn value={e.http} label="HTTP endpoint" />
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-txt-3 w-10">WS</span>
                        <span className="text-cyan break-all">{e.ws}</span>
                        <CopyBtn value={e.ws} label="WS endpoint" />
                      </div>
                    </div>

                    <pre className="mt-3 rounded-lg border border-line/60 bg-ink-950 p-3 text-[10px] font-mono text-txt-2 whitespace-pre-wrap break-all overflow-auto max-h-64">
{docsTab === 'dapp'
? `// ethers v6\nimport { ethers } from "ethers";\n\nconst provider = new ethers.JsonRpcProvider("${e.http}", ${CHAIN_ID});\nconsole.log(await provider.getBlockNumber());\n\n// viem\nimport { createPublicClient, http } from "viem";\n\nconst client = createPublicClient({\n  chain: { id: ${CHAIN_ID}, name: "DCAI L3", nativeCurrency: { name: "${NATIVE_SYMBOL}", symbol: "${NATIVE_SYMBOL}", decimals: 18 }, rpcUrls: { default: { http: ["${e.http}"] } } },\n  transport: http("${e.http}"),\n});\nconsole.log(await client.getBlockNumber());`
: `# curl (eth_chainId)\ncurl -s "${e.http}" \\\n  -H 'content-type: application/json' \\\n  --data '{"jsonrpc":"2.0","id":1,"method":"eth_chainId","params":[]}'\n\n# Foundry cast\ncast chain-id --rpc-url "${e.http}"\ncast block-number --rpc-url "${e.http}"\n\n# web3.py\nfrom web3 import Web3\nw3 = Web3(Web3.HTTPProvider("${e.http}"))\nprint(w3.eth.chain_id)\nprint(w3.eth.block_number)`}
                    </pre>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="mt-3 text-[12px] text-txt-3">No active keys revealed yet — connect a wallet and use “Reveal my keys”.</div>
          )}
        </div>
      </Card>
    </Page>
  );
};

export default DashboardView;
