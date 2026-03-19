import { useEffect, useMemo, useState } from 'react';
import { motion } from 'motion/react';
import { ethers } from 'ethers';
import { CheckCircle2, Code2, Globe, ShieldCheck, Wallet } from 'lucide-react';

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

async function copyToClipboard(text: string) {
  try {
    if (navigator.clipboard && (window as any).isSecureContext) {
      await navigator.clipboard.writeText(text);
      return true;
    }
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.position = 'fixed';
    ta.style.left = '-9999px';
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand('copy');
    document.body.removeChild(ta);
    return ok;
  } catch {
    return false;
  }
}

export default function ContributorProgram() {
  const apiBase = (() => {
    try {
      return `${window.location.protocol}//${window.location.hostname}/admin/api`;
    } catch {
      return 'http://139.180.140.143/admin/api';
    }
  })();

  const publicBase = (() => {
    try {
      return `${window.location.protocol}//${window.location.hostname}`;
    } catch {
      return 'http://139.180.140.143';
    }
  })();

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
  const [copyToast, setCopyToast] = useState<string | null>(null);
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

  const showToast = (text: string) => {
    setCopyToast(text);
    window.setTimeout(() => setCopyToast(null), 1200);
  };

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
      const c = new ethers.Contract(
        STAKE_CONTRACT,
        ['function stake(uint8 tier) payable'],
        signer
      );
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

      const nonceRes = await fetch(`${apiBase}/auth/nonce?address=${encodeURIComponent(addr)}`);
      const nonceJson = await nonceRes.json();
      const nonce = nonceJson?.nonce;
      if (!nonce) throw new Error('Failed to get nonce');

      const internalTier = selectedTier.internalTier;
      const message = `DCAI API Key Request\nAddress: ${addr}\nTier: ${internalTier}\nNonce: ${nonce}`;
      const signature = await signer.signMessage(message);

      const res = await fetch(`${apiBase}/apikey/request`, {
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

      const nonceRes = await fetch(`${apiBase}/auth/nonce?address=${encodeURIComponent(addr)}`);
      const nonceJson = await nonceRes.json();
      const nonce = nonceJson?.nonce;
      if (!nonce) throw new Error('Failed to get nonce');

      const message = `DCAI API Key Reveal\nAddress: ${addr}\nNonce: ${nonce}`;
      const signature = await signer.signMessage(message);

      const res = await fetch(`${apiBase}/apikey/reveal`, {
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
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pb-20 pt-8 relative z-10"
    >
      {copyToast ? (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 10 }}
          className="fixed bottom-6 right-6 z-50 px-4 py-2 rounded-lg bg-dark-900/80 border border-cyan-500/30 backdrop-blur-md text-xs font-mono text-cyan-300 shadow-[0_0_20px_rgba(0,240,255,0.15)]"
        >
          {copyToast}
        </motion.div>
      ) : null}

      <div className="mb-6 flex items-center gap-4">
        <div className="p-4 bg-cyan-500/10 rounded-xl border border-cyan-500/20 shadow-[0_0_20px_rgba(0,240,255,0.10)]">
          <ShieldCheck className="w-8 h-8 text-cyan-400" />
        </div>
        <div className="min-w-0">
          <h1 className="text-3xl md:text-4xl font-black tracking-widest">ECOSYSTEM <span className="glow-text-cyan text-cyan-300">CONTRIBUTOR</span></h1>
          <div className="mt-2 text-xs font-mono text-gold-500/60">Apply as an official DCAI L3 contributor: stake → submit → admin approval → receive credentials → contribute → claim rewards</div>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[1.15fr_0.85fr] gap-6 mb-8">
        <div className="glow-box bg-dark-800/60 backdrop-blur-md rounded-2xl p-6 border-t-2 border-t-cyan-500/30">
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div className="min-w-0">
              <div className="text-xs font-mono text-gold-500/50">WALLET</div>
              <div className="mt-1 text-sm font-mono text-cyan-200/90 break-all">{addr || '-- not connected --'}</div>
              <div className="mt-1 text-[10px] font-mono text-gold-500/40">chainId {chainId ?? '--'} · stake contract {STAKE_CONTRACT}</div>
            </div>
            <div className="flex gap-2">
              <button onClick={connect} className="px-3 py-2 rounded-lg border border-cyan-500/20 text-cyan-300 text-xs font-mono hover:border-cyan-400/60">CONNECT</button>
              <button disabled={!addr} onClick={refreshStake} className={`px-3 py-2 rounded-lg border text-xs font-mono ${addr ? 'border-gold-500/20 text-gold-500/80 hover:border-cyan-500/40 hover:text-cyan-300' : 'border-gold-500/10 text-gold-500/30 cursor-not-allowed'}`}>REFRESH</button>
            </div>
          </div>

          {err ? <div className="mt-3 text-[11px] font-mono text-rose-300">{err}</div> : null}
          {busy ? <div className="mt-3 text-[11px] font-mono text-gold-500/60">{busy}</div> : null}

          <div className="mt-5 grid grid-cols-1 md:grid-cols-3 gap-3">
            <div className="rounded-xl border border-gold-500/10 bg-dark-900/40 p-4">
              <div className="text-[10px] font-mono text-gold-500/45">CURRENT STAKE</div>
              <div className="mt-1 text-sm font-mono text-cyan-300">{stakeAmount} tDCAI</div>
              <div className="mt-1 text-[10px] font-mono text-gold-500/45">internal tier {stakeTierLabel}</div>
            </div>
            <div className="rounded-xl border border-gold-500/10 bg-dark-900/40 p-4">
              <div className="text-[10px] font-mono text-gold-500/45">UNSTAKE STATUS</div>
              <div className="mt-1 text-sm font-mono text-cyan-300">{requestedAtSec > 0 ? 'requested' : 'idle'}</div>
              <div className="mt-1 text-[10px] font-mono text-gold-500/45">cooldown 24h</div>
            </div>
            <div className="rounded-xl border border-gold-500/10 bg-dark-900/40 p-4">
              <div className="text-[10px] font-mono text-gold-500/45">WITHDRAW</div>
              <div className="mt-1 text-sm font-mono text-cyan-300">{requestedAtSec > 0 ? (cooldownLeftSec <= 0 ? 'available now' : `in ${Math.max(0, cooldownLeftSec)}s`) : '--'}</div>
              <div className="mt-1 text-[10px] font-mono text-gold-500/45">revoke policy can be tied to stake</div>
            </div>
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            <button
              disabled={!addr}
              onClick={doStake}
              className={`px-3 py-2 rounded-lg border text-xs font-mono ${addr ? 'border-cyan-500/20 text-cyan-300 hover:border-cyan-400/60' : 'border-gold-500/10 text-gold-500/30 cursor-not-allowed'}`}
            >
              STAKE SELECTED CONTRIBUTOR TIER
            </button>
            <button
              disabled={!addr || stakeTierLabel === 'none' || requestedAtSec > 0}
              onClick={requestUnstake}
              className={`px-3 py-2 rounded-lg border text-xs font-mono ${(!addr || stakeTierLabel === 'none' || requestedAtSec > 0) ? 'border-gold-500/10 text-gold-500/30 cursor-not-allowed' : 'border-rose-500/30 text-rose-300 hover:border-rose-400/70'}`}
            >
              REQUEST UNSTAKE
            </button>
            <button
              disabled={!addr || requestedAtSec <= 0 || cooldownLeftSec > 0}
              onClick={withdrawStake}
              className={`px-3 py-2 rounded-lg border text-xs font-mono ${(!addr || requestedAtSec <= 0 || cooldownLeftSec > 0) ? 'border-gold-500/10 text-gold-500/30 cursor-not-allowed' : 'border-emerald-500/30 text-emerald-300 hover:border-emerald-400/70'}`}
            >
              WITHDRAW
            </button>
          </div>
        </div>

        <div className="glow-box bg-dark-800/60 backdrop-blur-md rounded-2xl p-6 border-t-2 border-t-gold-500/30">
          <div className="text-xs font-mono text-gold-500/50">PROGRAM FLOW</div>
          <div className="mt-4 space-y-3">
            {[
              'Connect wallet and choose a contributor role',
              'Stake tDCAI according to the contributor lane you want',
              'Submit infra details for review',
              'Receive approval and contributor credential',
              'Contribute uptime / RPC / indexing capacity',
              'Check published epochs and claim rewards',
            ].map((step) => (
              <div key={step} className="flex items-start gap-3 rounded-xl border border-gold-500/10 bg-dark-900/40 p-3">
                <CheckCircle2 className="w-4 h-4 mt-0.5 text-cyan-400 shrink-0" />
                <div className="text-xs font-mono text-gold-500/75">{step}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[0.95fr_1.05fr] gap-6 mb-8">
        <div className="glow-box bg-dark-800/60 backdrop-blur-md rounded-2xl p-6 border-t-2 border-t-gold-500/30">
          <div className="text-xs font-mono text-gold-500/50">CHOOSE ROLE</div>
          <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-3">
            {[
              { key: 'indexer', label: 'Indexer', desc: 'Index blocks, logs, contracts, and ecosystem data.' },
              { key: 'rpc-provider', label: 'RPC Provider', desc: 'Serve dependable RPC capacity to the network.' },
            ].map((item) => (
              <button
                key={item.key}
                onClick={() => setRole(item.key as ContributorRole)}
                className={`text-left rounded-xl border p-4 transition-colors ${role === item.key ? 'border-cyan-400/60 bg-cyan-500/10' : 'border-gold-500/10 bg-dark-900/40 hover:border-cyan-500/30'}`}
              >
                <div className="text-sm font-mono text-cyan-300">{item.label}</div>
                <div className="mt-2 text-[11px] font-mono text-gold-500/60">{item.desc}</div>
              </button>
            ))}
          </div>

          <div className="mt-6 text-xs font-mono text-gold-500/50">CHOOSE CONTRIBUTOR LANE</div>
          <div className="mt-4 grid grid-cols-1 md:grid-cols-3 gap-3">
            {(Object.keys(contributorTiers) as ContributorTierKey[]).map((key) => {
              const item = contributorTiers[key];
              return (
                <button
                  key={key}
                  onClick={() => setTier(key)}
                  className={`text-left rounded-2xl border p-4 transition-colors ${tier === key ? 'border-cyan-400/60 bg-cyan-500/10' : 'border-gold-500/10 bg-dark-900/40 hover:border-cyan-500/30'}`}
                >
                  <div className="text-xs font-mono text-gold-500/50">{item.label.toUpperCase()}</div>
                  <div className="mt-2 text-lg font-mono text-cyan-200/90">Stake {item.stake} tDCAI</div>
                  <div className="mt-2 text-[10px] font-mono text-gold-500/45">{item.roleHint}</div>
                  <div className="mt-2 text-[10px] font-mono text-gold-500/45">{item.throughput}</div>
                </button>
              );
            })}
          </div>
        </div>

        <div className="glow-box bg-dark-800/60 backdrop-blur-md rounded-2xl p-6 border-t-2 border-t-cyan-500/30">
          <div className="text-xs font-mono text-gold-500/50">SUBMIT CONTRIBUTOR APPLICATION</div>
          <div className="mt-2 text-xs font-mono text-gold-500/60">This is separate from the public app/developer API plans. It is for official ecosystem contributors.</div>

          <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <div className="text-[10px] font-mono text-gold-500/45 mb-2">ROLE</div>
              <div className="rounded-xl border border-gold-500/10 bg-dark-900/40 px-3 py-3 text-xs font-mono text-cyan-300">{roleLabel}</div>
            </div>
            <div>
              <div className="text-[10px] font-mono text-gold-500/45 mb-2">CONTRIBUTOR LANE</div>
              <div className="rounded-xl border border-gold-500/10 bg-dark-900/40 px-3 py-3 text-xs font-mono text-cyan-300">{selectedTier.label} · internal {selectedTier.internalTier}</div>
            </div>
          </div>

          <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-3">
            <input
              value={region}
              onChange={(e) => setRegion(e.target.value)}
              placeholder="Region / location (e.g. SG / MY / JP)"
              className="bg-dark-900/50 border border-gold-500/15 rounded-xl px-3 py-3 text-xs font-mono text-gold-500/80 outline-none"
            />
            <input
              value={endpoint}
              onChange={(e) => setEndpoint(e.target.value)}
              placeholder="Endpoint / IP / domain"
              className="bg-dark-900/50 border border-gold-500/15 rounded-xl px-3 py-3 text-xs font-mono text-gold-500/80 outline-none"
            />
          </div>

          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Short infra note: uptime target, region coverage, hardware, or operator intro…"
            className="mt-3 w-full min-h-[120px] bg-dark-900/50 border border-gold-500/15 rounded-xl p-3 text-xs font-mono text-gold-500/80 outline-none"
          />

          <div className="mt-4 flex flex-wrap gap-2">
            <button
              disabled={!addr}
              onClick={requestContributorKey}
              className={`px-4 py-2 rounded-lg border text-xs font-mono ${addr ? 'border-cyan-500/20 text-cyan-300 hover:border-cyan-400/60' : 'border-gold-500/10 text-gold-500/30 cursor-not-allowed'}`}
            >
              SUBMIT APPLICATION
            </button>
            <button
              disabled={!addr}
              onClick={revealMyKeys}
              className={`px-4 py-2 rounded-lg border text-xs font-mono ${addr ? 'border-gold-500/20 text-gold-500/80 hover:border-cyan-500/40 hover:text-cyan-300' : 'border-gold-500/10 text-gold-500/30 cursor-not-allowed'}`}
            >
              REVEAL MY CREDENTIALS
            </button>
          </div>

          {lastReq ? (
            <div className="mt-4 rounded-xl border border-gold-500/10 bg-dark-900/40 p-4">
              <div className="text-[10px] font-mono text-gold-500/45">LATEST APPLICATION STATUS</div>
              <pre className="mt-2 text-[10px] font-mono text-gold-500/70 whitespace-pre-wrap break-all">{JSON.stringify(lastReq, null, 2)}</pre>
            </div>
          ) : null}
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[1.15fr_0.85fr] gap-6 mb-8">
        <div className="glow-box bg-dark-800/60 backdrop-blur-md rounded-2xl p-6 border-t-2 border-t-cyan-500/30">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div>
              <div className="text-xs font-mono text-gold-500/50">CONTRIBUTOR CREDENTIALS</div>
              <div className="mt-1 text-[10px] font-mono text-gold-500/45">Once approved, contributors can use the shared RPC base with header auth.</div>
            </div>
            <div className="text-[10px] font-mono text-gold-500/45">Base RPC: {publicBase}/rpc/</div>
          </div>

          {revealedKeys && revealedKeys.length ? (
            <div className="mt-4 space-y-3">
              {revealedKeys.map((item, idx) => {
                const tierPath = `${publicBase}/rpc/${String(item.tier)}/${String(item.key)}/`;
                return (
                  <div key={`${item.key}-${idx}`} className="rounded-xl border border-cyan-500/15 bg-dark-900/40 p-4">
                    <div className="text-[10px] font-mono text-gold-500/45">active credential · internal tier {item.tier}</div>
                    <div className="mt-2 text-sm font-mono text-cyan-300 break-all">{item.key}</div>
                    <div className="mt-3 grid grid-cols-1 gap-3">
                      <div>
                        <div className="text-[10px] font-mono text-gold-500/45">HEADER AUTH</div>
                        <div className="mt-1 text-[11px] font-mono text-gold-500/75 break-all">X-API-Key: {item.key}</div>
                      </div>
                      <div>
                        <div className="text-[10px] font-mono text-gold-500/45">RPC BASE</div>
                        <div className="mt-1 text-[11px] font-mono text-cyan-200/90 break-all">{publicBase}/rpc/</div>
                      </div>
                      <div>
                        <div className="text-[10px] font-mono text-gold-500/45">DIRECT TIER PATH</div>
                        <div className="mt-1 text-[11px] font-mono text-cyan-200/90 break-all">{tierPath}</div>
                      </div>
                    </div>
                    <div className="mt-4 flex flex-wrap gap-2">
                      <button onClick={async () => { if (await copyToClipboard(item.key)) showToast('Copied API key'); }} className="px-3 py-2 rounded-lg border border-cyan-500/20 text-cyan-300 text-[10px] font-mono hover:border-cyan-400/60">COPY KEY</button>
                      <button onClick={async () => { if (await copyToClipboard(`${publicBase}/rpc/`)) showToast('Copied RPC base'); }} className="px-3 py-2 rounded-lg border border-gold-500/20 text-gold-500/80 text-[10px] font-mono hover:border-cyan-500/40 hover:text-cyan-300">COPY RPC BASE</button>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="mt-4 text-xs font-mono text-gold-500/60">No contributor credentials revealed yet.</div>
          )}
        </div>

        <div className="glow-box bg-dark-800/60 backdrop-blur-md rounded-2xl p-6 border-t-2 border-t-gold-500/30">
          <div className="text-xs font-mono text-gold-500/50">REWARDS & CLAIM</div>
          <div className="mt-4 space-y-4 text-[11px] font-mono text-gold-500/75">
            <div className="rounded-xl border border-gold-500/10 bg-dark-900/40 p-4">
              <div className="flex items-center gap-2 text-cyan-300"><Globe className="w-4 h-4" /> Reward endpoints</div>
              <div className="mt-2 break-all">{publicBase}/rewards/</div>
              <div className="mt-1 break-all">{publicBase}/rewards/latest.json</div>
            </div>

            <div className="rounded-xl border border-gold-500/10 bg-dark-900/40 p-4">
              <div className="flex items-center gap-2 text-cyan-300"><Wallet className="w-4 h-4" /> Reward identity</div>
              <div className="mt-2">Rewards should follow the contributor wallet / operator address, not the API key.</div>
            </div>

            <div className="rounded-xl border border-gold-500/10 bg-dark-900/40 p-4">
              <div className="flex items-center gap-2 text-cyan-300"><Code2 className="w-4 h-4" /> Contracts</div>
              <div className="mt-2 break-all">OperatorRegistry: {OPERATOR_REGISTRY}</div>
              <div className="mt-1 break-all">MerkleRewardDistributor: {DISTRIBUTOR}</div>
            </div>

            <div className="rounded-xl border border-gold-500/10 bg-dark-900/40 p-4">
              <div className="flex items-center gap-2 text-cyan-300"><CheckCircle2 className="w-4 h-4" /> Claim flow</div>
              <div className="mt-2">1. Get approved and contribute.</div>
              <div className="mt-1">2. Wait for your address to appear in the published epoch.</div>
              <div className="mt-1">3. Claim from the distributor once eligible.</div>
            </div>
          </div>
        </div>
      </div>

      <div className="glow-box bg-dark-800/60 backdrop-blur-md rounded-2xl p-6 border-t-2 border-t-cyan-500/30">
        <div className="flex items-center gap-2 text-cyan-300 text-sm font-mono"><Code2 className="w-4 h-4" /> Example setup</div>
        <pre className="mt-4 text-[11px] font-mono text-gold-500/75 whitespace-pre-wrap break-all">{`CHAIN_ID=18441
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
    </motion.div>
  );
}
