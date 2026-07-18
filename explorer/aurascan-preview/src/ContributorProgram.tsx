import { useEffect, useMemo, useState } from 'react';
import { ethers } from 'ethers';
import { CheckCircle2 } from 'lucide-react';
import { adminApiBase, publicBase, NATIVE_SYMBOL } from './lib/api';
import { fmtNum, shortAddr } from './lib/format';
import { Card, CardHead, Page, PageTitle, Badge, Btn, CopyBtn, Notice } from './components/ui';

const STAKE_CONTRACT = '0x54ff6c64f1f7915a3aD54743aDd92b32412B06BC';
const OPERATOR_REGISTRY = '0xb37c81eBC4b1B4bdD5476fe182D6C72133F41db9';
const DISTRIBUTOR = '0x728f2C63b9A0ff0918F5ffB3D4C2d004107476B7';

const contributorTiers = {
  observer: {
    label: 'Observer',
    internalTier: 'basic',
    stake: '1000',
    roleHint: 'Single-region contributor or early-stage indexer',
    throughput: 'entry contributor lane',
  },
  core: {
    label: 'Core',
    internalTier: 'pro',
    stake: '5000',
    roleHint: 'Reliable ecosystem operator with steady uptime',
    throughput: 'core contributor lane',
  },
  backbone: {
    label: 'Backbone',
    internalTier: 'ultra',
    stake: '10000',
    roleHint: 'High-availability infra / backbone partner',
    throughput: 'high-capacity contributor lane',
  },
} as const;

type ContributorTierKey = keyof typeof contributorTiers;
type ContributorRole = 'indexer' | 'rpc-provider';

type StakeState = {
  tier: number;
  stakeWei: string;
  requestedAt: string;
} | null;

type RevealedKey = {
  key: string;
  tier: string;
  createdAt: string;
  usage?: any;
};

const PROGRAM_STEPS = [
  'Connect wallet and choose a contributor role',
  'Stake tDCAI according to the contributor lane you want',
  'Submit infra details for review',
  'Receive approval and contributor credential',
  'Contribute uptime / RPC / indexing capacity',
  'Check published epochs and claim rewards',
];

export default function ContributorProgram() {
  const [addr, setAddr] = useState<string | null>(null);
  const [chainId, setChainId] = useState<number | null>(null);
  const [stake, setStake] = useState<StakeState>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [role, setRole] = useState<ContributorRole>('indexer');
  const [tier, setTier] = useState<ContributorTierKey>('observer');
  const [region, setRegion] = useState('');
  const [endpoint, setEndpoint] = useState('');
  const [note, setNote] = useState('');
  const [lastReq, setLastReq] = useState<any>(null);
  const [revealedKeys, setRevealedKeys] = useState<RevealedKey[] | null>(null);
  const [nowSec, setNowSec] = useState(() => Math.floor(Date.now() / 1000));

  const selectedTier = contributorTiers[tier];

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
    try {
      return Number(stake?.requestedAt || '0');
    } catch {
      return 0;
    }
  })();

  const cooldownEndsSec = requestedAtSec > 0 ? requestedAtSec + 86400 : 0;
  const cooldownLeftSec = cooldownEndsSec > 0 ? cooldownEndsSec - nowSec : 0;

  const appNote = useMemo(() => {
    const lines = [
      'Contributor Program Application',
      `Role: ${role}`,
      `Program Tier: ${tier}`,
      `Internal Tier: ${selectedTier.internalTier}`,
      `Region: ${region || '-'}`,
      `Endpoint: ${endpoint || '-'}`,
      `Note: ${note || '-'}`,
    ];
    return lines.join('\n');
  }, [role, tier, selectedTier.internalTier, region, endpoint, note]);

  const roleLabel = role === 'indexer' ? 'Indexer' : 'RPC Provider';

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
      setBusy('Loading contributor stake…');
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

  useEffect(() => {
    if (addr) refreshStake();
  }, [addr]);

  useEffect(() => {
    const t = setInterval(() => setNowSec(Math.floor(Date.now() / 1000)), 1000);
    return () => clearInterval(t);
  }, []);

  const doStake = async () => {
    setErr(null);
    const eth = (window as any).ethereum;
    if (!eth) return;
    try {
      setBusy('Sending contributor stake tx…');
      const provider = new ethers.BrowserProvider(eth);
      const signer = await provider.getSigner();
      const c = new ethers.Contract(STAKE_CONTRACT, ['function stake(uint8 tier) payable'], signer);
      const tierEnum = selectedTier.internalTier === 'basic' ? 1 : selectedTier.internalTier === 'pro' ? 2 : 3;
      const value = ethers.parseEther(selectedTier.stake);
      const tx = await c.stake(tierEnum, { value });
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
      setBusy('Requesting unstake…');
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
      setBusy('Withdrawing stake…');
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

  const requestContributorKey = async () => {
    if (!addr) return;
    setErr(null);
    try {
      setBusy('Submitting contributor application…');
      const eth = (window as any).ethereum;
      const provider = new ethers.BrowserProvider(eth);
      const signer = await provider.getSigner();

      const nonceRes = await fetch(`${adminApiBase}/auth/nonce?address=${encodeURIComponent(addr)}`);
      const nonceJson = await nonceRes.json();
      const nonce = nonceJson?.nonce;
      if (!nonce) throw new Error('Failed to get nonce');

      const internalTier = selectedTier.internalTier;
      const message = `DCAI API Key Request\nAddress: ${addr}\nTier: ${internalTier}\nNonce: ${nonce}`;
      const signature = await signer.signMessage(message);

      const res = await fetch(`${adminApiBase}/apikey/request`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          address: addr,
          tier: internalTier,
          note: appNote,
          signature,
        }),
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
      setBusy('Revealing contributor credentials…');
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

  return (
    <Page>
      <PageTitle
        title="Contributor"
        accent="Program"
        sub="Run infrastructure for DCAI L3 as an official contributor: stake → apply → approval → credentials → contribute → claim rewards."
      />

      <div className="grid grid-cols-1 xl:grid-cols-[1.2fr_0.8fr] gap-4 mb-4">
        <Card>
          <CardHead
            title="Wallet & stake"
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

            <div className="mt-4 grid grid-cols-1 md:grid-cols-3 gap-3">
              <div className="rounded-lg border border-line bg-ink-900 p-3">
                <div className="text-[10px] uppercase tracking-wider text-txt-3">Current stake</div>
                <div className="mt-1 text-[14px] font-mono text-gold tnum">{stakeAmount} {NATIVE_SYMBOL}</div>
                <div className="mt-0.5 text-[10px] font-mono text-txt-3">internal tier {stakeTierLabel}</div>
              </div>
              <div className="rounded-lg border border-line bg-ink-900 p-3">
                <div className="text-[10px] uppercase tracking-wider text-txt-3">Unstake status</div>
                <div className="mt-1 text-[14px] font-mono text-txt">{requestedAtSec > 0 ? 'requested' : 'idle'}</div>
                <div className="mt-0.5 text-[10px] font-mono text-txt-3">cooldown 24h</div>
              </div>
              <div className="rounded-lg border border-line bg-ink-900 p-3">
                <div className="text-[10px] uppercase tracking-wider text-txt-3">Withdraw</div>
                <div className="mt-1 text-[14px] font-mono text-txt">
                  {requestedAtSec > 0 ? (cooldownLeftSec <= 0 ? 'available now' : `in ${Math.max(0, cooldownLeftSec)}s`) : '--'}
                </div>
                <div className="mt-0.5 text-[10px] font-mono text-txt-3">credential tied to stake</div>
              </div>
            </div>

            <div className="mt-3 flex flex-wrap gap-2">
              <Btn tone="primary" disabled={!addr} onClick={doStake}>Stake {fmtNum(selectedTier.stake)} {NATIVE_SYMBOL} ({selectedTier.label})</Btn>
              <Btn tone="danger" disabled={!addr || stakeTierLabel === 'none' || requestedAtSec > 0} onClick={requestUnstake}>Request unstake</Btn>
              <Btn tone="ok" disabled={!addr || requestedAtSec <= 0 || cooldownLeftSec > 0} onClick={withdrawStake}>Withdraw</Btn>
            </div>
          </div>
        </Card>

        <Card>
          <CardHead title="Program flow" />
          <div className="px-4 py-3 space-y-2">
            {PROGRAM_STEPS.map((step, i) => (
              <div key={step} className="flex items-start gap-2.5">
                <span className="shrink-0 w-5 h-5 rounded-full border border-gold/40 text-gold text-[10px] font-mono inline-flex items-center justify-center mt-0.5">{i + 1}</span>
                <div className="text-[12px] text-txt-2 leading-5">{step}</div>
              </div>
            ))}
          </div>
        </Card>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4 mb-4">
        <Card>
          <CardHead title="Choose role & lane" />
          <div className="px-4 py-3">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
              {[
                { key: 'indexer', label: 'Indexer', desc: 'Index blocks, logs, contracts, and ecosystem data.' },
                { key: 'rpc-provider', label: 'RPC Provider', desc: 'Serve dependable RPC capacity to the network.' },
              ].map((item) => (
                <button
                  key={item.key}
                  onClick={() => setRole(item.key as ContributorRole)}
                  className={`text-left rounded-lg border p-3 transition-colors ${
                    role === item.key ? 'border-gold/50 bg-gold/5' : 'border-line bg-ink-900 hover:border-line-2'
                  }`}
                >
                  <div className="text-[13px] font-semibold text-txt flex items-center gap-2">
                    {item.label}
                    {role === item.key ? <Badge tone="gold">selected</Badge> : null}
                  </div>
                  <div className="mt-1 text-[11px] text-txt-3 leading-4">{item.desc}</div>
                </button>
              ))}
            </div>

            <div className="mt-3 grid grid-cols-1 md:grid-cols-3 gap-2.5">
              {(Object.keys(contributorTiers) as ContributorTierKey[]).map((key) => {
                const item = contributorTiers[key];
                return (
                  <button
                    key={key}
                    onClick={() => setTier(key)}
                    className={`text-left rounded-lg border p-3 transition-colors ${
                      tier === key ? 'border-gold/50 bg-gold/5' : 'border-line bg-ink-900 hover:border-line-2'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="text-[11px] uppercase tracking-wider text-txt-3">{item.label}</div>
                      {tier === key ? <Badge tone="gold">✓</Badge> : null}
                    </div>
                    <div className="mt-1 text-[15px] font-mono text-txt tnum">{fmtNum(item.stake)} <span className="text-[11px] text-txt-3">{NATIVE_SYMBOL}</span></div>
                    <div className="mt-1 text-[10px] text-txt-3 leading-4">{item.roleHint}</div>
                  </button>
                );
              })}
            </div>
          </div>
        </Card>

        <Card>
          <CardHead title="Submit application" meta="separate from public developer API plans" />
          <div className="px-4 py-3">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
              <div className="rounded-lg border border-line bg-ink-900 px-3 py-2.5 text-[12px] font-mono">
                <span className="text-txt-3">role</span> <span className="text-txt">{roleLabel}</span>
              </div>
              <div className="rounded-lg border border-line bg-ink-900 px-3 py-2.5 text-[12px] font-mono">
                <span className="text-txt-3">lane</span> <span className="text-txt">{selectedTier.label}</span>
                <span className="text-txt-3"> · internal {selectedTier.internalTier}</span>
              </div>
            </div>

            <div className="mt-2.5 grid grid-cols-1 md:grid-cols-2 gap-2.5">
              <input
                value={region}
                onChange={(e) => setRegion(e.target.value)}
                placeholder="Region (e.g. SG / MY / JP)"
                className="bg-ink-900 border border-line rounded-lg px-3 py-2.5 text-[12px] font-mono text-txt outline-none focus:border-gold/50 transition-colors"
              />
              <input
                value={endpoint}
                onChange={(e) => setEndpoint(e.target.value)}
                placeholder="Endpoint / IP / domain"
                className="bg-ink-900 border border-line rounded-lg px-3 py-2.5 text-[12px] font-mono text-txt outline-none focus:border-gold/50 transition-colors"
              />
            </div>

            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Short infra note: uptime target, region coverage, hardware, or operator intro…"
              className="mt-2.5 w-full min-h-[96px] bg-ink-900 border border-line rounded-lg p-3 text-[12px] font-mono text-txt outline-none focus:border-gold/50 transition-colors"
            />

            <div className="mt-3 flex flex-wrap gap-2">
              <Btn tone="primary" disabled={!addr} onClick={requestContributorKey}>Submit application</Btn>
              <Btn disabled={!addr} onClick={revealMyKeys}>Reveal my credentials</Btn>
            </div>

            {lastReq ? (
              <pre className="mt-3 rounded-lg border border-line bg-ink-900 p-3 text-[10px] font-mono text-txt-2 whitespace-pre-wrap break-all max-h-40 overflow-auto">{JSON.stringify(lastReq, null, 2)}</pre>
            ) : null}
          </div>
        </Card>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[1.2fr_0.8fr] gap-4 mb-4">
        <Card>
          <CardHead title="Contributor credentials" meta={`RPC base ${publicBase}/rpc/`} />
          <div className="px-4 py-3">
            {revealedKeys && revealedKeys.length ? (
              <div className="space-y-2.5">
                {revealedKeys.map((item, idx) => {
                  const tierPath = `${publicBase}/rpc/${String(item.tier)}/${String(item.key)}/`;
                  return (
                    <div key={`${item.key}-${idx}`} className="rounded-lg border border-line bg-ink-900 p-3">
                      <div className="flex items-center gap-2 flex-wrap">
                        <Badge tone="gold">{String(item.tier)}</Badge>
                        <span className="text-[12px] font-mono text-txt break-all">{item.key}</span>
                        <CopyBtn value={String(item.key)} label="API key" />
                      </div>
                      <div className="mt-2 grid grid-cols-1 gap-1 text-[11px] font-mono">
                        <div><span className="text-txt-3">header</span> <span className="text-txt-2">X-API-Key: {item.key}</span></div>
                        <div className="flex items-center gap-1.5">
                          <span className="text-txt-3">path</span>
                          <span className="text-cyan break-all">{tierPath}</span>
                          <CopyBtn value={tierPath} label="tier path" />
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="text-[12px] text-txt-3">No contributor credentials revealed yet — connect a wallet and use “Reveal my credentials”.</div>
            )}
          </div>
        </Card>

        <Card>
          <CardHead title="Rewards & claim" />
          <div className="px-4 py-3 space-y-2.5 text-[12px]">
            <div className="rounded-lg border border-line bg-ink-900 p-3">
              <div className="text-[10px] uppercase tracking-wider text-txt-3">Published epochs</div>
              <div className="mt-1 font-mono text-cyan break-all">{publicBase}/rewards/latest.json</div>
            </div>
            <div className="rounded-lg border border-line bg-ink-900 p-3">
              <div className="text-[10px] uppercase tracking-wider text-txt-3">Contracts</div>
              <div className="mt-1 font-mono text-[11px] text-txt-2 break-all">Registry {OPERATOR_REGISTRY}</div>
              <div className="mt-0.5 font-mono text-[11px] text-txt-2 break-all">Distributor {DISTRIBUTOR}</div>
            </div>
            <div className="rounded-lg border border-line bg-ink-900 p-3">
              <div className="text-[10px] uppercase tracking-wider text-txt-3">Claim flow</div>
              <div className="mt-1 space-y-1 text-[11px] text-txt-2 leading-4">
                <div className="flex items-start gap-1.5"><CheckCircle2 className="w-3 h-3 mt-0.5 text-ok shrink-0" /> Get approved and contribute.</div>
                <div className="flex items-start gap-1.5"><CheckCircle2 className="w-3 h-3 mt-0.5 text-ok shrink-0" /> Wait for your address in a published epoch.</div>
                <div className="flex items-start gap-1.5"><CheckCircle2 className="w-3 h-3 mt-0.5 text-ok shrink-0" /> Claim from the distributor once eligible.</div>
              </div>
            </div>
          </div>
        </Card>
      </div>

      <Card>
        <CardHead title="Example setup" />
        <div className="px-4 py-3">
          <pre className="rounded-lg border border-line bg-ink-900 p-3 text-[11px] font-mono text-txt-2 whitespace-pre-wrap break-all">{`CHAIN_ID=18441
RPC_URL=${publicBase}/rpc/
RPC_API_KEY=<your contributor key>
ROLE=${role}
REGION=${region || '<your region>'}
ENDPOINT=${endpoint || '<your endpoint>'}

# Reward monitoring
REWARDS_URL=${publicBase}/rewards/latest.json
OPERATOR_ADDRESS=<your wallet>
DISTRIBUTOR_ADDRESS=${DISTRIBUTOR}`}</pre>
        </div>
      </Card>
    </Page>
  );
}
