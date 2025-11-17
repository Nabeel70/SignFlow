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

const elements = {
  toggle: document.getElementById('powerToggle'),
  statusCard: document.querySelector('.status-card'),
  statusTitle: document.getElementById('statusTitle'),
  statusSubtitle: document.getElementById('statusSubtitle'),
  lastSequence: document.getElementById('lastSequence'),
  chunkCount: document.getElementById('chunkCount'),
  overlayBtn: document.getElementById('overlayBtn'),
  toast: document.getElementById('toast'),
  refreshBtn: document.getElementById('refreshBtn')
};

let currentState = null;
let loading = false;

init();

function init() {
  elements.toggle.addEventListener('change', handleToggle);
  elements.overlayBtn.addEventListener('click', summonOverlay);
  elements.refreshBtn.addEventListener('click', () => refreshState(true));

  chrome.runtime.onMessage.addListener((message) => {
    if (message?.type === 'state:updated') {
      applyState(message.state);
    }
  });

  refreshState();
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
