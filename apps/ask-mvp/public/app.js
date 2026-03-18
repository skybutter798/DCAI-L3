const state = {
  config: null,
  wallet: null,
  chainId: null,
  surveys: [],
  activeSurvey: null,
};

const el = {
  walletAddress: document.getElementById('walletAddress'),
  networkName: document.getElementById('networkName'),
  statusText: document.getElementById('statusText'),
  mintPriceDisplay: document.getElementById('mintPriceDisplay'),
  mintHint: document.getElementById('mintHint'),
  flowStage: document.getElementById('flowStage'),
  connectBtn: document.getElementById('connectBtn'),
  switchBtn: document.getElementById('switchBtn'),
  mintBtn: document.getElementById('mintBtn'),
  demoMintBtn: document.getElementById('demoMintBtn'),
  refreshBtn: document.getElementById('refreshBtn'),
  passes: document.getElementById('passes'),
  surveySection: document.getElementById('surveySection'),
  surveyTitle: document.getElementById('surveyTitle'),
  surveyMeta: document.getElementById('surveyMeta'),
  progressBar: document.getElementById('progressBar'),
  progressText: document.getElementById('progressText'),
  questionLabel: document.getElementById('questionLabel'),
  questionTitle: document.getElementById('questionTitle'),
  questionText: document.getElementById('questionText'),
};

const NFT_ABI = [
  'function balanceOf(address owner) view returns (uint256)',
  'function tokenOfOwnerByIndex(address owner, uint256 index) view returns (uint256)',
  'function mintSurveyPass(uint256 surveyId) payable returns (uint256)',
  'event SurveyPassMinted(address indexed to, uint256 indexed tokenId, uint256 indexed surveyId, uint256 paidAmount)'
];

async function api(action, options = {}) {
  const method = options.method || 'GET';
  let url = `./api.php?action=${encodeURIComponent(action)}`;
  const fetchOptions = { method, headers: {} };

  if (method === 'GET' && options.params) {
    const q = new URLSearchParams(options.params);
    url += `&${q.toString()}`;
  } else if (options.body) {
    fetchOptions.headers['Content-Type'] = 'application/json';
    fetchOptions.body = JSON.stringify(options.body);
  }

  const res = await fetch(url, fetchOptions);
  const json = await res.json();
  if (!json.ok) throw new Error(json.error || 'Request failed');
  return json;
}

function short(addr) {
  return addr ? `${addr.slice(0, 6)}...${addr.slice(-4)}` : 'Not connected';
}

function setStatus(text) {
  el.statusText.textContent = text;
}

function updateFlowStage() {
  const steps = document.querySelectorAll('[data-flow-step]');
  let active = 'connect';
  if (state.wallet) active = 'sign';
  if (state.surveys.length > 0) active = 'survey';
  steps.forEach((node) => node.classList.toggle('active', node.dataset.flowStep === active));
}

async function loadConfig() {
  const json = await api('config');
  state.config = json;
  el.mintPriceDisplay.textContent = json.survey.mintPriceDisplay;
  el.mintHint.textContent = json.survey.contractAddress
    ? `Contract ready: ${json.survey.contractAddress}`
    : json.survey.demoModeLabel;
  if (!json.survey.contractAddress && json.survey.allowDemoMint) {
    el.demoMintBtn.hidden = false;
  }
  setStatus('Config loaded');
}

async function connectWallet() {
  if (!window.ethereum) {
    setStatus('No wallet detected. Please install MetaMask or another EVM wallet.');
    return;
  }
  const accounts = await window.ethereum.request({ method: 'eth_requestAccounts' });
  state.wallet = accounts[0];
  state.chainId = await window.ethereum.request({ method: 'eth_chainId' });
  renderWallet();
  await refreshPasses();
}

async function switchNetwork() {
  if (!window.ethereum || !state.config) return;
  const chain = state.config.chain;
  try {
    await window.ethereum.request({
      method: 'wallet_switchEthereumChain',
      params: [{ chainId: chain.chainIdHex }],
    });
  } catch (err) {
    if (err.code === 4902) {
      await window.ethereum.request({
        method: 'wallet_addEthereumChain',
        params: [{
          chainId: chain.chainIdHex,
          chainName: chain.chainName,
          nativeCurrency: chain.nativeCurrency,
          rpcUrls: chain.rpcUrls,
          blockExplorerUrls: chain.blockExplorerUrls,
        }],
      });
    } else {
      throw err;
    }
  }
  state.chainId = await window.ethereum.request({ method: 'eth_chainId' });
  renderWallet();
}

function renderWallet() {
  el.walletAddress.textContent = short(state.wallet);
  el.networkName.textContent = state.chainId || 'Unknown';
  const rightChain = state.chainId === state.config.chain.chainIdHex;
  el.mintBtn.disabled = !state.wallet || !rightChain || !state.config.survey.contractAddress;
  el.switchBtn.disabled = !window.ethereum;
  if (!state.wallet) {
    setStatus('Wallet not connected');
  } else if (!rightChain) {
    setStatus('Connected, but not on DCAI L3 yet');
  } else {
    setStatus('Wallet connected on DCAI L3');
  }
  updateFlowStage();
}

async function fetchOnchainTokenIds() {
  const provider = new ethers.BrowserProvider(window.ethereum);
  const signer = await provider.getSigner();
  const contract = new ethers.Contract(state.config.survey.contractAddress, NFT_ABI, signer);
  const balance = Number(await contract.balanceOf(state.wallet));
  const tokenIds = [];
  for (let i = 0; i < balance; i++) {
    tokenIds.push(Number(await contract.tokenOfOwnerByIndex(state.wallet, i)));
  }
  return tokenIds;
}

async function refreshPasses() {
  if (!state.wallet || !state.config) {
    state.surveys = [];
    renderPasses([]);
    updateFlowStage();
    return;
  }

  let surveys = [];
  if (state.config.survey.contractAddress) {
    const tokenIds = await fetchOnchainTokenIds();
    surveys = await Promise.all(tokenIds.map(async (tokenId) => (await api('survey', { params: { tokenId } })).survey));
  } else {
    surveys = (await api('my-surveys', { params: { wallet: state.wallet } })).surveys;
  }

  state.surveys = surveys.sort((a, b) => b.tokenId - a.tokenId);
  updateFlowStage();
  renderPasses(state.surveys);

  const tokenParam = new URLSearchParams(window.location.search).get('tokenId');
  if (tokenParam) {
    const found = state.surveys.find((item) => item.tokenId === Number(tokenParam));
    if (found) selectSurvey(found.tokenId);
  }
}

function renderPasses(surveys) {
  if (!surveys.length) {
    el.passes.className = 'passes empty';
    el.passes.textContent = state.wallet
      ? 'No survey passes found yet.'
      : 'Connect wallet to load your survey NFTs.';
    return;
  }

  el.passes.className = 'passes';
  el.passes.innerHTML = surveys.map((survey) => `
    <article class="pass-card ${state.activeSurvey?.tokenId === survey.tokenId ? 'active' : ''}">
      <h3>Survey Pass #${survey.tokenId}</h3>
      <div class="pass-meta">
        <div>Mode: ${survey.mode}</div>
        <div>Answered: ${survey.answeredCount} / ${survey.totalQuestions}</div>
        <div>Score: ${survey.score}</div>
        <div>Status: ${survey.completedAt ? 'Completed' : 'In Progress'}</div>
      </div>
      <p class="note">Mint tx: ${survey.mintTxHash || 'Pending'}</p>
      <button data-open="${survey.tokenId}" class="ghost">Open Survey</button>
    </article>
  `).join('');

  el.passes.querySelectorAll('[data-open]').forEach((btn) => {
    btn.addEventListener('click', () => selectSurvey(Number(btn.dataset.open)));
  });
}

function selectSurvey(tokenId) {
  const survey = state.surveys.find((item) => item.tokenId === tokenId);
  if (!survey) return;
  state.activeSurvey = survey;
  renderPasses(state.surveys);
  renderSurvey();
}

function renderSurvey() {
  const survey = state.activeSurvey;
  if (!survey) {
    el.surveySection.classList.add('hidden');
    return;
  }

  el.surveySection.classList.remove('hidden');
  el.surveyTitle.textContent = `Survey Pass #${survey.tokenId}`;
  el.surveyMeta.textContent = `${survey.answeredCount}/${survey.totalQuestions} answered`;
  el.progressBar.style.width = `${survey.progressPercent}%`;
  el.progressText.textContent = `Score ${survey.score} • Progress ${survey.progressPercent}% • ${survey.completedAt ? 'Completed' : 'Continue anytime as long as this NFT is held.'}`;

  const next = survey.questions.find((q) => q.question_no === survey.nextQuestionNo);
  if (!next) {
    el.questionLabel.textContent = 'Completed';
    el.questionTitle.textContent = 'Survey completed';
    el.questionText.textContent = 'You have answered all 100 questions.';
    return;
  }

  el.questionLabel.textContent = `Question ${String(next.question_no).padStart(3, '0')}`;
  el.questionTitle.textContent = next.question_title || `Question ${String(next.question_no).padStart(3, '0')}`;
  el.questionText.textContent = next.question_content || 'Lorem ipsum dolor sit amet.';
}

async function submitAnswer(answer) {
  const survey = state.activeSurvey;
  if (!survey || !survey.nextQuestionNo || !state.wallet) return;
  setStatus(`Saving answer ${answer.toUpperCase()} for question ${survey.nextQuestionNo}…`);
  await api('answer', {
    method: 'POST',
    body: {
      tokenId: survey.tokenId,
      questionNo: survey.nextQuestionNo,
      answer,
      walletAddress: state.wallet,
    },
  });
  const fresh = await api('survey', { params: { tokenId: survey.tokenId } });
  const idx = state.surveys.findIndex((item) => item.tokenId === survey.tokenId);
  state.surveys[idx] = fresh.survey;
  state.activeSurvey = fresh.survey;
  renderPasses(state.surveys);
  renderSurvey();
  setStatus('Answer saved');
}

async function mintSurvey() {
  if (!state.config.survey.contractAddress) return;
  setStatus('Preparing mint transaction…');
  const provider = new ethers.BrowserProvider(window.ethereum);
  const signer = await provider.getSigner();
  const contract = new ethers.Contract(state.config.survey.contractAddress, NFT_ABI, signer);
  const tx = await contract.mintSurveyPass(1, { value: state.config.survey.mintPriceWei });
  setStatus('Waiting for transaction confirmation…');
  const receipt = await tx.wait();
  const iface = new ethers.Interface(NFT_ABI);
  let tokenId = null;
  for (const log of receipt.logs) {
    try {
      const parsed = iface.parseLog(log);
      if (parsed?.name === 'SurveyPassMinted') {
        tokenId = Number(parsed.args.tokenId);
        break;
      }
    } catch (_) {}
  }
  if (!tokenId) throw new Error('Mint succeeded but tokenId was not found in logs');
  await api('register-mint', {
    method: 'POST',
    body: {
      tokenId,
      walletAddress: state.wallet,
      mintTxHash: receipt.hash,
      surveyId: 1,
    },
  });
  setStatus(`Minted Survey Pass #${tokenId}`);
  await refreshPasses();
}

async function demoMint() {
  if (!state.wallet) {
    setStatus('Connect wallet first');
    return;
  }
  setStatus('Creating demo survey pass…');
  const json = await api('demo-mint', {
    method: 'POST',
    body: { walletAddress: state.wallet },
  });
  await refreshPasses();
  selectSurvey(json.tokenId);
  setStatus(`Demo Survey Pass #${json.tokenId} created`);
}

async function init() {
  await loadConfig();
  renderWallet();

  el.connectBtn.addEventListener('click', connectWallet);
  el.switchBtn.addEventListener('click', async () => {
    try { await switchNetwork(); } catch (err) { setStatus(err.message); }
  });
  el.refreshBtn.addEventListener('click', () => refreshPasses().catch((err) => setStatus(err.message)));
  el.mintBtn.addEventListener('click', () => mintSurvey().catch((err) => setStatus(err.message)));
  el.demoMintBtn.addEventListener('click', () => demoMint().catch((err) => setStatus(err.message)));
  document.querySelectorAll('.answer').forEach((btn) => {
    btn.addEventListener('click', () => submitAnswer(btn.dataset.answer).catch((err) => setStatus(err.message)));
  });

  if (el.flowStage) {
    el.flowStage.addEventListener('mousemove', (event) => {
      const rect = el.flowStage.getBoundingClientRect();
      const px = ((event.clientX - rect.left) / rect.width - 0.5) * 24;
      const py = ((event.clientY - rect.top) / rect.height - 0.5) * 24;
      el.flowStage.style.setProperty('--px', `${px.toFixed(2)}px`);
      el.flowStage.style.setProperty('--py', `${py.toFixed(2)}px`);
    });
    el.flowStage.addEventListener('mouseleave', () => {
      el.flowStage.style.setProperty('--px', '0px');
      el.flowStage.style.setProperty('--py', '0px');
    });
  }

  updateFlowStage();

  if (window.ethereum) {
    window.ethereum.on('accountsChanged', (accounts) => {
      state.wallet = accounts[0] || null;
      renderWallet();
      refreshPasses().catch((err) => setStatus(err.message));
    });
    window.ethereum.on('chainChanged', (chainId) => {
      state.chainId = chainId;
      renderWallet();
    });
  }
}

init().catch((err) => setStatus(err.message));
