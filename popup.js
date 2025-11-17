const STATUS_COPY = {
  idle: {
    title: 'Idle',
    hint: 'Flip the switch to begin streaming.'
  },
  pending: {
    title: 'Waiting for permission',
    hint: 'Approve the microphone prompt that Chrome shows.'
  },
  listening: {
    title: 'Listening',
    hint: 'Capturing microphone audio securely.'
  },
  streaming: {
    title: 'Streaming',
    hint: 'Sending gloss chunks + showing signs.'
  },
  error: {
    title: 'Needs attention',
    hint: 'Check microphone permissions or reload the tab.'
  }
};

const DEFAULT_API_BASE = 'http://localhost:5055/api/v1';

const elements = {
  toggle: document.getElementById('powerToggle'),
  statusCard: document.querySelector('.status-card'),
  statusTitle: document.getElementById('statusTitle'),
  statusSubtitle: document.getElementById('statusSubtitle'),
  lastSequence: document.getElementById('lastSequence'),
  chunkCount: document.getElementById('chunkCount'),
  overlayBtn: document.getElementById('overlayBtn'),
  toast: document.getElementById('toast'),
  refreshBtn: document.getElementById('refreshBtn'),
  lastError: document.getElementById('lastError'),
  apiInput: document.getElementById('apiBaseInput'),
  apiStatus: document.getElementById('apiStatus'),
  saveApiBtn: document.getElementById('saveApiBtn'),
  testApiBtn: document.getElementById('testApiBtn')
};

let currentState = null;
let loading = false;
let currentConfig = null;
let configBusy = false;

init();

function init() {
  elements.toggle.addEventListener('change', handleToggle);
  elements.overlayBtn.addEventListener('click', summonOverlay);
  elements.refreshBtn.addEventListener('click', () => refreshState(true));
  elements.saveApiBtn.addEventListener('click', saveApiConfig);
  elements.testApiBtn.addEventListener('click', testApiEndpoint);

  chrome.runtime.onMessage.addListener((message) => {
    if (message?.type === 'state:updated') {
      applyState(message.state);
    }
    if (message?.type === 'config:updated') {
      currentConfig = message.config;
      applyConfig();
    }
  });

  refreshState();
  loadConfig();
}

async function refreshState(showToastOnError = false) {
  try {
    const response = await chrome.runtime.sendMessage({ type: 'popup:get-state' });
    if (!response?.ok) {
      throw new Error(response?.error || 'Unable to read state.');
    }
    applyState(response.state);
  } catch (error) {
    console.error('[SignFlow] Failed to refresh state', error);
    if (showToastOnError) {
      showToast(error.message, true);
    }
  }
}

async function handleToggle(event) {
  const enable = event.target.checked;
  if (loading) {
    return;
  }
  setLoading(true);
  try {
    const tabId = await getActiveTabId();
    const response = await chrome.runtime.sendMessage({
      type: 'popup:toggle',
      enable,
      tabId
    });
    if (!response?.ok) {
      throw new Error(response?.error || 'Unable to update state.');
    }
    applyState(response.state);
  } catch (error) {
    console.error('[SignFlow] Toggle failed', error);
    showToast(error.message, true);
    elements.toggle.checked = !enable;
  } finally {
    setLoading(false);
  }
}

async function summonOverlay() {
  try {
    const tabId = await getActiveTabId();
    const response = await chrome.runtime.sendMessage({
      type: 'popup:recenter',
      tabId
    });
    if (!response?.ok) {
      throw new Error(response?.error || 'Unable to reach overlay.');
    }
    showToast('Overlay ready on this tab.');
  } catch (error) {
    console.error('[SignFlow] Overlay summon failed', error);
    showToast(error.message, true);
  }
}

function applyState(state = {}) {
  currentState = state;
  elements.toggle.checked = Boolean(state.isEnabled);
  const status = state.status || 'idle';
  elements.statusCard.dataset.state = status;
  const copy = STATUS_COPY[status] || STATUS_COPY.idle;
  elements.statusTitle.textContent = copy.title;
  elements.statusSubtitle.textContent = copy.hint;
  elements.lastSequence.textContent =
    state.lastSequence?.length ? state.lastSequence.join(' | ') : '--';
  elements.chunkCount.textContent = state.chunkCount ?? 0;
  const hasError = Boolean(state.lastError);
  elements.lastError.textContent = hasError
    ? `Backend issue: ${state.lastError}`
    : 'No backend issues reported.';
  elements.lastError.dataset.empty = hasError ? 'false' : 'true';
}

function setLoading(value) {
  loading = value;
  elements.toggle.disabled = value;
  elements.overlayBtn.disabled = value;
  elements.refreshBtn.disabled = value;
}

function showToast(message, isError = false) {
  elements.toast.textContent = message;
  elements.toast.classList.toggle('hidden', false);
  elements.toast.style.color = isError ? '#ffbaba' : '#a8ffcb';
  clearTimeout(showToast.timeoutId);
  showToast.timeoutId = setTimeout(() => {
    elements.toast.classList.add('hidden');
  }, 2500);
}

async function getActiveTabId() {
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  return tabs[0]?.id ?? null;
}

async function loadConfig() {
  try {
    const response = await chrome.runtime.sendMessage({ type: 'popup:get-config' });
    if (!response?.ok) {
      throw new Error(response?.error || 'Unable to read config.');
    }
    currentConfig = response.config;
    applyConfig();
  } catch (error) {
    console.error('[SignFlow] Failed to load config', error);
    showToast(error.message, true);
  }
}

function applyConfig() {
  if (!currentConfig) {
    return;
  }
  elements.apiInput.value = currentConfig.apiBaseUrl || '';
  renderApiStatus(`Current: ${describeApiBase(currentConfig.apiBaseUrl)}`, null);
}

async function saveApiConfig() {
  if (configBusy) {
    return;
  }
  const raw = elements.apiInput.value.trim();
  setConfigBusy(true);
  try {
    const response = await chrome.runtime.sendMessage({
      type: 'popup:set-config',
      apiBaseUrl: raw
    });
    if (!response?.ok) {
      throw new Error(response?.error || 'Unable to save endpoint.');
    }
    currentConfig = response.config;
    applyConfig();
    showToast('Endpoint saved.');
  } catch (error) {
    console.error('[SignFlow] Save config failed', error);
    showToast(error.message, true);
  } finally {
    setConfigBusy(false);
  }
}

async function testApiEndpoint() {
  if (configBusy) {
    return;
  }
  setConfigBusy(true);
  renderApiStatus('Testing connection...', null);
  try {
    const response = await chrome.runtime.sendMessage({ type: 'popup:test-api' });
    if (!response?.ok) {
      throw new Error(response?.error || 'Unable to test endpoint.');
    }
    if (response.alive) {
      renderApiStatus('API reachable.', true);
      showToast('Backend is reachable.');
    } else {
      renderApiStatus('No response from backend.', false);
      showToast('Backend did not respond.', true);
    }
  } catch (error) {
    console.error('[SignFlow] Test API failed', error);
    renderApiStatus(error.message, false);
    showToast(error.message, true);
  } finally {
    setConfigBusy(false);
  }
}

function setConfigBusy(value) {
  configBusy = value;
  elements.saveApiBtn.disabled = value;
  elements.testApiBtn.disabled = value;
}

function renderApiStatus(text, success) {
  elements.apiStatus.textContent = text;
  if (success === true) {
    elements.apiStatus.dataset.state = 'ok';
  } else if (success === false) {
    elements.apiStatus.dataset.state = 'error';
  } else {
    elements.apiStatus.dataset.state = 'neutral';
  }
}

function describeApiBase(url) {
  if (!url) {
    return 'not configured';
  }
  if (url === DEFAULT_API_BASE) {
    return 'default local server';
  }
  return url;
}
