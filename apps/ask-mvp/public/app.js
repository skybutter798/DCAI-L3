const state = {
  config: null,
  wallet: null,
  chainId: null,
  surveys: [],
  activeSurvey: null,
  view: 'home',
};

const el = {
  experience: document.getElementById('experience'),
  connectBtn: document.getElementById('connectBtn'),
  switchBtn: document.getElementById('switchBtn'),
  statusText: document.getElementById('statusText'),
  walletAddress: document.getElementById('walletAddress'),
  walletStatus: document.getElementById('walletStatus'),
  mintPriceDisplay: document.getElementById('mintPriceDisplay'),
  mintHint: document.getElementById('mintHint'),
  mintBtn: document.getElementById('mintBtn'),
  startSurveyCard: document.getElementById('startSurveyCard'),
  startSurveyBtn: document.getElementById('startSurveyBtn'),
  backToDashboardBtn: document.getElementById('backToDashboardBtn'),
  backToHubBtn: document.getElementById('backToHubBtn'),
  passes: document.getElementById('passes'),
  surveySection: document.getElementById('surveySection'),
  surveyTitle: document.getElementById('surveyTitle'),
  surveyMeta: document.getElementById('surveyMeta'),
  questionCard: document.getElementById('questionCard'),
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

function pulseQuestionCard() {
  if (!el.questionCard) return;
  el.questionCard.classList.remove('question-reveal');
  void el.questionCard.offsetWidth;
  el.questionCard.classList.add('question-reveal');
}

function setView(view) {
  state.view = view;
  renderScene();
}

function renderScene() {
  el.experience.dataset.auth = state.wallet ? 'connected' : 'guest';
  el.experience.dataset.view = state.wallet ? state.view : 'home';

  const onRightChain = state.config && state.chainId === state.config.chain.chainIdHex;
  el.walletAddress.textContent = state.wallet || 'Not connected';
  el.walletStatus.textContent = !state.wallet
    ? 'Disconnected'
    : onRightChain
      ? 'Connected on DCAI L3'
      : 'Connected, wrong network';

  el.mintBtn.disabled = !state.wallet || !onRightChain || !state.config?.survey?.contractAddress;
  el.startSurveyCard.hidden = state.surveys.length === 0;
}

async function loadConfig() {
  const json = await api('config');
  state.config = json;
  el.mintPriceDisplay.textContent = json.survey.mintPriceDisplay;
  el.mintHint.textContent = json.survey.contractAddress
    ? `Live contract: ${json.survey.contractAddress}`
    : json.survey.demoModeLabel;
  renderScene();
  setStatus('Waiting for wallet.');
}

async function connectWallet() {
  if (!window.ethereum) {
    setStatus('No wallet detected. Please install MetaMask or another EVM wallet.');
    return;
  }
  const accounts = await window.ethereum.request({ method: 'eth_requestAccounts' });
  state.wallet = accounts[0] || null;
  state.chainId = await window.ethereum.request({ method: 'eth_chainId' });
  setStatus('Wallet connected. Loading passes…');
  setView('dashboard');
  renderScene();
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
  renderScene();
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
    renderScene();
    return;
  }

  let surveys = [];
  if (state.config.survey.contractAddress) {
    const tokenIds = await fetchOnchainTokenIds();
    surveys = await Promise.all(tokenIds.map(async (tokenId) => (await api('survey', { params: { tokenId } })).survey));
  }

  state.surveys = surveys.sort((a, b) => b.tokenId - a.tokenId);
  renderPasses(state.surveys);
  renderScene();
  setStatus(state.surveys.length ? 'Wallet ready. Survey passes detected.' : 'Wallet ready. No survey pass yet.');
}

function renderPasses(surveys) {
  if (!surveys.length) {
    el.passes.innerHTML = '<div class="empty-state card">No survey passes yet. Mint one first.</div>';
    return;
  }

  el.passes.innerHTML = surveys.map((survey) => `
    <article class="pass-tile card ${state.activeSurvey?.tokenId === survey.tokenId ? 'active' : ''}">
      <span class="card-kicker">NFT Pass</span>
      <h3>Survey Pass #${survey.tokenId}</h3>
      <p class="feature-copy">Answered ${survey.answeredCount}/${survey.totalQuestions} · ${survey.completedAt ? 'Completed' : 'In progress'}</p>
      <div class="tile-meta mono">${survey.payerAddress}</div>
      <button data-open="${survey.tokenId}" class="primary-cta alt">Open Survey</button>
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
  setView('survey');
  renderPasses(state.surveys);
  renderSurvey();
}

function renderSurvey() {
  const survey = state.activeSurvey;
  if (!survey) return;

  el.surveyTitle.textContent = `Survey Pass #${survey.tokenId}`;
  el.surveyMeta.textContent = `${survey.answeredCount}/${survey.totalQuestions}`;
  el.progressBar.style.width = `${survey.progressPercent}%`;
  el.progressText.textContent = `Progress ${survey.progressPercent}% · ${survey.completedAt ? 'Completed' : 'Resume anytime while this NFT stays in your wallet.'}`;

  const next = survey.questions.find((q) => q.question_no === survey.nextQuestionNo);
  if (!next) {
    el.questionLabel.textContent = 'Completed';
    el.questionTitle.textContent = 'Survey completed';
    el.questionText.textContent = 'You have answered all available questions.';
    pulseQuestionCard();
    return;
  }

  el.questionLabel.textContent = `Question ${String(next.question_no).padStart(3, '0')}`;
  el.questionTitle.textContent = next.question_title || `Question ${String(next.question_no).padStart(3, '0')}`;
  el.questionText.textContent = next.question_content || 'Lorem ipsum dolor sit amet.';
  pulseQuestionCard();
}

async function submitAnswer(answer) {
  const survey = state.activeSurvey;
  if (!survey || !survey.nextQuestionNo || !state.wallet) return;
  setStatus(`Saving ${answer.toUpperCase()}…`);
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
  setStatus('Answer saved.');
}

async function mintSurvey() {
  if (!state.config?.survey?.contractAddress) return;
  setStatus('Preparing mint transaction…');
  const provider = new ethers.BrowserProvider(window.ethereum);
  const signer = await provider.getSigner();
  const contract = new ethers.Contract(state.config.survey.contractAddress, NFT_ABI, signer);
  const tx = await contract.mintSurveyPass(1, { value: state.config.survey.mintPriceWei });
  setStatus('Waiting for confirmation…');
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

  await refreshPasses();
  setView('dashboard');
  setStatus(`Minted Survey Pass #${tokenId}`);
}

async function init() {
  await loadConfig();

  el.connectBtn.addEventListener('click', () => connectWallet().catch((err) => setStatus(err.message)));
  el.switchBtn.addEventListener('click', () => switchNetwork().catch((err) => setStatus(err.message)));
  el.mintBtn.addEventListener('click', () => mintSurvey().catch((err) => setStatus(err.message)));
  el.startSurveyBtn.addEventListener('click', () => setView('hub'));
  el.backToDashboardBtn.addEventListener('click', () => setView('dashboard'));
  el.backToHubBtn.addEventListener('click', () => setView('hub'));

  document.querySelectorAll('.answer').forEach((btn) => {
    btn.addEventListener('click', () => submitAnswer(btn.dataset.answer).catch((err) => setStatus(err.message)));
  });

  if (window.ethereum) {
    window.ethereum.on('accountsChanged', (accounts) => {
      state.wallet = accounts[0] || null;
      state.activeSurvey = null;
      if (!state.wallet) {
        state.surveys = [];
        setView('home');
        renderPasses([]);
        renderScene();
        setStatus('Wallet disconnected.');
        return;
      }
      connectWallet().catch((err) => setStatus(err.message));
    });

    window.ethereum.on('chainChanged', (chainId) => {
      state.chainId = chainId;
      renderScene();
    });
  }

  renderPasses([]);
  renderScene();
}

init().catch((err) => setStatus(err.message));
