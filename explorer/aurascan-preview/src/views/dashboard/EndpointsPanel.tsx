import { Code2 } from 'lucide-react';

type DocsTab = 'dapp' | 'ops';

type EndpointItem = {
  tier: string;
  key: string;
  usage?: any;
};

type EndpointsPanelProps = {
  docsTab: DocsTab;
  revealedKeys: EndpointItem[] | null;
  setDocsTab: (tab: DocsTab) => void;
  endpointFor: (tierKey: string, key: string) => { http: string; ws: string };
};

const EndpointsPanel = ({ docsTab, revealedKeys, setDocsTab, endpointFor }: EndpointsPanelProps) => {
  return (
    <div className="glow-box bg-dark-800/60 backdrop-blur-md rounded-2xl p-6 border-t-2 border-t-cyan-500/30">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <h2 className="text-lg font-bold tracking-widest flex items-center gap-2 text-cyan-400">
          <Code2 className="w-5 h-5" /> ENDPOINTS
        </h2>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setDocsTab('dapp')}
            className={`px-3 py-1.5 rounded-lg border text-[10px] font-mono ${docsTab === 'dapp' ? 'border-cyan-400/60 text-cyan-200 bg-cyan-500/10' : 'border-gold-500/15 text-gold-500/60 hover:border-cyan-500/30 hover:text-cyan-300'}`}
          >
            DAPP (ethers/viem)
          </button>
          <button
            onClick={() => setDocsTab('ops')}
            className={`px-3 py-1.5 rounded-lg border text-[10px] font-mono ${docsTab === 'ops' ? 'border-cyan-400/60 text-cyan-200 bg-cyan-500/10' : 'border-gold-500/15 text-gold-500/60 hover:border-cyan-500/30 hover:text-cyan-300'}`}
          >
            OPS (curl/cast/web3.py)
          </button>
        </div>
      </div>
      <div className="mt-2 text-[10px] font-mono text-gold-500/50">chainId <span className="text-cyan-300">18441</span> · native <span className="text-cyan-300">tDCAI</span></div>

      <details className="mt-4 rounded-xl border border-gold-500/10 bg-dark-950/30 p-4">
        <summary className="cursor-pointer select-none text-[10px] font-mono text-gold-500/60 hover:text-cyan-300">
          Supported Ethereum JSON-RPC methods
        </summary>
        <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-4 text-[11px] font-mono">
          <div className="rounded-xl border border-gold-500/10 bg-dark-900/30 p-3">
            <div className="text-gold-500/50">web3_*</div>
            <div className="mt-2 text-gold-500/70 space-y-1">
              <div>web3_clientVersion</div>
              <div>web3_sha3</div>
            </div>
          </div>

          <div className="rounded-xl border border-gold-500/10 bg-dark-900/30 p-3">
            <div className="text-gold-500/50">net_*</div>
            <div className="mt-2 text-gold-500/70 space-y-1">
              <div>net_version</div>
              <div>net_listening</div>
              <div>net_peerCount</div>
            </div>
          </div>

          <div className="rounded-xl border border-gold-500/10 bg-dark-900/30 p-3">
            <div className="text-gold-500/50">eth_* (node status / basics)</div>
            <div className="mt-2 text-gold-500/70 space-y-1">
              <div>eth_protocolVersion</div>
              <div>eth_syncing</div>
              <div>eth_coinbase</div>
              <div>eth_mining</div>
              <div>eth_hashrate</div>
              <div>eth_gasPrice</div>
              <div>eth_feeHistory</div>
              <div>eth_maxPriorityFeePerGas</div>
              <div>eth_accounts</div>
              <div>eth_chainId</div>
              <div>eth_blockNumber</div>
            </div>
          </div>

          <div className="rounded-xl border border-gold-500/10 bg-dark-900/30 p-3">
            <div className="text-gold-500/50">eth_* (state / account / contract)</div>
            <div className="mt-2 text-gold-500/70 space-y-1">
              <div>eth_getBalance</div>
              <div>eth_getStorageAt</div>
              <div>eth_getTransactionCount</div>
              <div>eth_getCode</div>
              <div>eth_call</div>
              <div>eth_estimateGas</div>
              <div>eth_createAccessList</div>
              <div>eth_getProof</div>
            </div>
          </div>

          <div className="rounded-xl border border-gold-500/10 bg-dark-900/30 p-3">
            <div className="text-gold-500/50">eth_* (blocks / tx lookup)</div>
            <div className="mt-2 text-gold-500/70 space-y-1">
              <div>eth_getBlockByHash</div>
              <div>eth_getBlockByNumber</div>
              <div>eth_getTransactionByHash</div>
              <div>eth_getTransactionReceipt</div>
              <div>eth_getTransactionByBlockHashAndIndex</div>
              <div>eth_getTransactionByBlockNumberAndIndex</div>
              <div>eth_getBlockTransactionCountByHash</div>
              <div>eth_getBlockTransactionCountByNumber</div>
              <div>eth_getUncleCountByBlockHash</div>
              <div>eth_getUncleCountByBlockNumber</div>
              <div>eth_getUncleByBlockHashAndIndex</div>
              <div>eth_getUncleByBlockNumberAndIndex</div>
            </div>
          </div>

          <div className="rounded-xl border border-gold-500/10 bg-dark-900/30 p-3">
            <div className="text-gold-500/50">eth_* (logs / filters)</div>
            <div className="mt-2 text-gold-500/70 space-y-1">
              <div>eth_newFilter</div>
              <div>eth_newBlockFilter</div>
              <div>eth_newPendingTransactionFilter</div>
              <div>eth_uninstallFilter</div>
              <div>eth_getFilterChanges</div>
              <div>eth_getFilterLogs</div>
              <div>eth_getLogs</div>
            </div>
          </div>

          <div className="rounded-xl border border-gold-500/10 bg-dark-900/30 p-3">
            <div className="text-gold-500/50">eth_* (send / sign / mining work)</div>
            <div className="mt-2 text-gold-500/70 space-y-1">
              <div>eth_sign</div>
              <div>eth_signTransaction</div>
              <div>eth_sendTransaction</div>
              <div>eth_sendRawTransaction</div>
              <div>eth_getWork</div>
              <div>eth_submitWork</div>
              <div>eth_submitHashrate</div>
            </div>
          </div>

          <div className="rounded-xl border border-gold-500/10 bg-dark-900/30 p-3 md:col-span-2">
            <div className="text-gold-500/50">WS only (PubSub)</div>
            <div className="mt-2 text-gold-500/70 space-y-1">
              <div>eth_subscribe (newHeads / logs / newPendingTransactions)</div>
              <div>eth_unsubscribe</div>
            </div>
            <div className="mt-3 text-[10px] text-gold-500/40">
              Not public by default: <span className="text-gold-500/50">debug_*, admin_*, personal_*, txpool_*, trace_*</span>
            </div>
          </div>
        </div>
      </details>

      {revealedKeys && revealedKeys.length ? (
        <div className="mt-4 space-y-3">
          {revealedKeys.map((k, i) => {
            const e = endpointFor(String(k.tier), String(k.key));
            return (
              <div key={i} className="rounded-xl border border-cyan-500/15 bg-dark-900/40 p-4">
                <div className="text-xs font-mono text-gold-500/60">tier <span className="text-cyan-300">{k.tier}</span></div>
                <div className="mt-1 text-[11px] font-mono text-gold-500/70 break-all">key {k.key}</div>
                <div className="mt-2 text-[10px] font-mono text-gold-500/50">
                  usage today <span className="text-cyan-200/90">{k?.usage?.today ?? '--'}</span> · last 5m <span className="text-cyan-200/90">{k?.usage?.last5m ?? '--'}</span> · last 60m <span className="text-cyan-200/90">{k?.usage?.last60m ?? '--'}</span>
                  <div className="mt-1 text-gold-500/50">
                    status (60m)
                    {' '}2xx <span className="text-cyan-200/90">{k?.usage?.statusLast60m?.['2xx'] ?? 0}</span>
                    {' '}· 4xx <span className="text-cyan-200/90">{k?.usage?.statusLast60m?.['4xx'] ?? 0}</span>
                    {' '}· 5xx <span className="text-cyan-200/90">{k?.usage?.statusLast60m?.['5xx'] ?? 0}</span>
                    {' '}· 401 <span className="text-cyan-200/90">{k?.usage?.statusLast60m?.['401'] ?? 0}</span>
                    {' '}· 429 <span className="text-cyan-200/90">{k?.usage?.statusLast60m?.['429'] ?? 0}</span>
                  </div>
                  <div className="mt-1 text-gold-500/50">
                    latency (60m)
                    {' '}p50 <span className="text-cyan-200/90">{k?.usage?.latencyLast60m?.p50Ms ?? '--'}</span>ms
                    {' '}· p95 <span className="text-cyan-200/90">{k?.usage?.latencyLast60m?.p95Ms ?? '--'}</span>ms
                  </div>
                  <div className="mt-1 text-gold-500/50">
                    top methods (60m)
                    {Array.isArray(k?.usage?.topMethodsLast60m) && k.usage.topMethodsLast60m.length ? (
                      <span className="text-cyan-200/90">{' '}{k.usage.topMethodsLast60m.slice(0, 6).map((m: any) => `${m.method}:${m.count}`).join(' · ')}</span>
                    ) : (
                      <span className="text-cyan-200/90"> --</span>
                    )}
                  </div>
                </div>
                <div className="mt-3 text-[11px] font-mono text-gold-500/60">HTTP</div>
                <div className="text-[11px] font-mono text-cyan-200/90 break-all">{e.http}</div>
                <div className="mt-2 text-[11px] font-mono text-gold-500/60">WS</div>
                <div className="text-[11px] font-mono text-cyan-200/90 break-all">{e.ws}</div>

                <div className="mt-4 rounded-xl border border-gold-500/10 bg-dark-950/30 p-3">
                  <div className="text-[10px] font-mono text-gold-500/50">Quickstart ({docsTab})</div>
                  <pre className="mt-2 text-[10px] font-mono text-gold-500/70 whitespace-pre-wrap break-all">
{docsTab === 'dapp'
? `// ethers v6\nimport { ethers } from \"ethers\";\n\nconst provider = new ethers.JsonRpcProvider(\"${e.http}\", 18441);\nconsole.log(await provider.getBlockNumber());\n\n// viem\nimport { createPublicClient, http } from \"viem\";\n\nconst client = createPublicClient({\n  chain: { id: 18441, name: \"DCAI L3\", nativeCurrency: { name: \"tDCAI\", symbol: \"tDCAI\", decimals: 18 }, rpcUrls: { default: { http: [\"${e.http}\"] } } },\n  transport: http(\"${e.http}\"),\n});\nconsole.log(await client.getBlockNumber());`
: `# curl (eth_chainId)\ncurl -s \"${e.http}\" \\\n  -H 'content-type: application/json' \\\n  --data '{\"jsonrpc\":\"2.0\",\"id\":1,\"method\":\"eth_chainId\",\"params\":[]}'\n\n# Foundry cast\ncast chain-id --rpc-url \"${e.http}\"\ncast block-number --rpc-url \"${e.http}\"\n\n# web3.py\nfrom web3 import Web3\nw3 = Web3(Web3.HTTPProvider(\"${e.http}\"))\nprint(w3.eth.chain_id)\nprint(w3.eth.block_number)`}
                  </pre>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="mt-4 text-xs font-mono text-gold-500/60">No active keys revealed yet.</div>
      )}
    </div>
  );
};

export default EndpointsPanel;
