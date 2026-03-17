import { motion } from 'motion/react';
import { useState, useEffect } from 'react';
import { ethers } from 'ethers';

import DashboardHeader from './dashboard/DashboardHeader';
import WalletPanel from './dashboard/WalletPanel';
import StakePanel from './dashboard/StakePanel';
import TierCards from './dashboard/TierCards';
import ApplyPanel from './dashboard/ApplyPanel';
import EndpointsPanel from './dashboard/EndpointsPanel';

const DashboardView = () => {
  const STAKE_CONTRACT = '0x54ff6c64f1f7915a3aD54743aDd92b32412B06BC';

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

  useEffect(() => {
    if (addr) refreshStake();
  }, [addr]);

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
      const c = new ethers.Contract(
        STAKE_CONTRACT,
        ['function stake(uint8 tier) payable'],
        signer
      );
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
      const c = new ethers.Contract(
        STAKE_CONTRACT,
        ['function requestUnstake()'],
        signer
      );
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
      const c = new ethers.Contract(
        STAKE_CONTRACT,
        ['function withdraw()'],
        signer
      );
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

      const nonceRes = await fetch(`${apiBase}/auth/nonce?address=${encodeURIComponent(addr)}`);
      const nonceJson = await nonceRes.json();
      const nonce = nonceJson?.nonce;
      if (!nonce) throw new Error('Failed to get nonce');

      const message = `DCAI API Key Request\nAddress: ${addr}\nTier: ${tier}\nNonce: ${nonce}`;
      const signature = await signer.signMessage(message);

      const res = await fetch(`${apiBase}/apikey/request`, {
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

  const endpointFor = (tierKey: string, key: string) => {
    return {
      http: `${publicBase}/rpc/${tierKey}/${key}/`,
      ws: `${publicBase.replace('http', 'ws')}/ws/${tierKey}/${key}/`,
    };
  };

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

  const cooldownEndsSec = requestedAtSec > 0 ? (requestedAtSec + 86400) : 0;
  const cooldownLeftSec = cooldownEndsSec > 0 ? (cooldownEndsSec - nowSec) : 0;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pb-20 pt-8 relative z-10"
    >
      <DashboardHeader />

      <WalletPanel
        addr={addr}
        chainId={chainId}
        stakeContract={STAKE_CONTRACT}
        err={err}
        busy={busy}
        onConnect={connect}
        onRefresh={refreshStake}
      />

      <StakePanel
        addr={addr}
        stakeTierLabel={stakeTierLabel}
        stakeAmount={stakeAmount}
        requestedAtSec={requestedAtSec}
        cooldownLeftSec={cooldownLeftSec}
        onRequestUnstake={requestUnstake}
        onWithdraw={withdrawStake}
      />

      <TierCards
        addr={addr}
        tiers={tiers}
        onStakeSelect={(tierKey) => {
          setTier(tierKey);
          doStake(tierKey);
        }}
      />

      <ApplyPanel
        tier={tier}
        note={note}
        addr={addr}
        lastReq={lastReq}
        setNote={setNote}
        onRequestApiKey={requestApiKey}
        onRevealMyKeys={revealMyKeys}
      />

      <EndpointsPanel
        docsTab={docsTab}
        revealedKeys={revealedKeys}
        setDocsTab={setDocsTab}
        endpointFor={endpointFor}
      />
    </motion.div>
  );
};

export default DashboardView;
