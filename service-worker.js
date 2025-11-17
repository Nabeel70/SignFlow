const STATE_KEY = 'signflow:state';
const CONFIG_KEY = 'signflow:config';
const defaultState = {
  isEnabled: false,
  status: 'idle',
  tabId: null,
  lastSequence: [],
  chunkCount: 0,
  lastUpdated: null,
  lastError: null
};
const defaultConfig = {
  apiBaseUrl: 'http://localhost:5055/api/v1'
};

const DEMO_SIGN_SEQUENCES = [
  ['HELLO', 'TODAY', 'MEETING'],
  ['TODAY', 'MEETING'],
  ['HELLO', 'MEETING'],
  ['HELLO', 'TODAY'],
  ['MEETING']
];

chrome.runtime.onInstalled.addListener(async () => {
  await chrome.storage.local.set({
    [STATE_KEY]: defaultState,
    [CONFIG_KEY]: defaultConfig
  });
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  const handler = {
    'popup:get-state': async () => {
      const state = await getState();
      return { ok: true, state };
    },
    'popup:toggle': async () => {
      if (message.enable) {
        const tabId = message.tabId;
        if (!tabId) {
          throw new Error('Please focus a tab with a web page before enabling SignFlow.');
        }
        return { ok: true, state: await startFlow(tabId) };
      }
      return { ok: true, state: await stopFlow() };
    },
    'popup:get-config': async () => {
      const config = await getConfig();
      return { ok: true, config };
    },
    'popup:set-config': async () => {
      const config = await setConfig({ apiBaseUrl: sanitizeApiBase(message.apiBaseUrl) });
      return { ok: true, config };
    },
    'popup:test-api': async () => {
      const config = await getConfig();
      const alive = await pingApi(config.apiBaseUrl);
      return { ok: true, alive };
    },
    'popup:recenter': async () => {
      const tabId = message.tabId;
      if (!tabId) {
        throw new Error('No active tab selected.');
      }
      await ensureContentReady(tabId);
      await sendToTab(tabId, { type: 'background:show-overlay' });
      return { ok: true };
    },
    'content:status': async () => {
      const next = await setState({ status: message.status }, { broadcast: true });
      return { ok: true, state: next };
    },
    'content:audio-chunk': async () => {
      await handleAudioChunk(message.payload, sender);
      return { ok: true };
    }
  }[message?.type];

  if (!handler) {
    return false;
  }

  handler()
    .then((payload) => sendResponse(payload))
    .catch((error) => {
      console.error('[SignFlow] Message handling failed', error);
      sendResponse({ ok: false, error: error.message });
    });

  return true;
});

async function getState() {
  const stored = await chrome.storage.local.get(STATE_KEY);
  return { ...defaultState, ...(stored?.[STATE_KEY] ?? {}) };
}

async function setState(patch, { broadcast = false } = {}) {
  const next = { ...(await getState()), ...patch };
  await chrome.storage.local.set({ [STATE_KEY]: next });
  if (broadcast) {
    await broadcastState(next);
  }
  return next;
}

async function broadcastState(state) {
  try {
    await chrome.runtime.sendMessage({ type: 'state:updated', state });
  } catch (error) {
    if (error?.message?.includes('Receiving end does not exist')) {
      return;
    }
    console.warn('[SignFlow] Failed to broadcast state', error);
  }
}

async function startFlow(tabId) {
  await ensureContentReady(tabId);
  const state = await setState(
    {
      isEnabled: true,
      status: 'listening',
      tabId,
      lastUpdated: Date.now(),
      lastError: null
    },
    { broadcast: true }
  );
  await sendToTab(tabId, { type: 'background:start-capture' });
  return state;
}

async function stopFlow() {
  const state = await getState();
  if (state.tabId) {
    await sendToTab(state.tabId, { type: 'background:stop-capture' }).catch(() => {});
  }
  const next = await setState({ ...defaultState }, { broadcast: true });
  return next;
}

async function ensureContentReady(tabId) {
  try {
    await chrome.tabs.sendMessage(tabId, { type: 'signflow:ping' });
  } catch (error) {
    try {
      await chrome.scripting.executeScript({
        target: { tabId },
        files: ['contentScript.js']
      });
    } catch (scriptError) {
      console.error('[SignFlow] Unable to inject content script', scriptError);
      throw new Error('SignFlow cannot run on this page. Try another tab.');
    }
  }
}

async function sendToTab(tabId, payload) {
  return chrome.tabs.sendMessage(tabId, payload);
}

async function handleAudioChunk(payload, sender) {
  const state = await getState();
  if (!state.isEnabled || state.tabId !== sender?.tab?.id) {
    return;
  }

  let backendResponse = null;
  let backendError = null;
  try {
    backendResponse = await sendChunkToBackend(payload);
  } catch (error) {
    backendError = error;
    console.error('[SignFlow] Backend request failed', error);
  }

  const updatedState = await setState(
    {
      status: backendResponse ? 'streaming' : 'error',
      chunkCount: state.chunkCount + 1,
      lastUpdated: Date.now(),
      lastError: backendError ? backendError.message : null
    },
    { broadcast: true }
  );

  const glosses =
    backendResponse?.glossSequence?.length > 0
      ? backendResponse.glossSequence
      : getDemoGlosses(updatedState.chunkCount);
  await setState({ lastSequence: glosses }, { broadcast: true });
  try {
    await sendToTab(state.tabId, {
      type: 'background:play-signs',
      glosses,
      videos: backendResponse?.videos,
      transcript: backendResponse?.transcript,
      keywords: backendResponse?.keywords
    });
  } catch (error) {
    console.warn('[SignFlow] Unable to forward glosses', error);
  }
}

function getDemoGlosses(chunkCount) {
  const index = chunkCount % DEMO_SIGN_SEQUENCES.length;
  return DEMO_SIGN_SEQUENCES[index];
}

async function sendChunkToBackend(payload) {
  const { apiBaseUrl } = await getConfig();
  if (!apiBaseUrl) {
    throw new Error('API base URL is not configured.');
  }
  const endpoint = `${apiBaseUrl.replace(/\/$/, '')}/sign-sequence`;
  const body = {
    audioBase64: payload.base64,
    mimeType: payload.mimeType,
    locale: payload.locale || 'en-US'
  };
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(body)
  });
  if (!response.ok) {
    throw new Error(`Backend responded with ${response.status}`);
  }
  return response.json();
}

async function getConfig() {
  const stored = await chrome.storage.local.get(CONFIG_KEY);
  return { ...defaultConfig, ...(stored?.[CONFIG_KEY] ?? {}) };
}

async function setConfig(patch) {
  const next = { ...(await getConfig()), ...patch };
  await chrome.storage.local.set({ [CONFIG_KEY]: next });
  await broadcastConfig(next);
  return next;
}

async function broadcastConfig(config) {
  try {
    await chrome.runtime.sendMessage({ type: 'config:updated', config });
  } catch (error) {
    if (!error?.message?.includes('Receiving end does not exist')) {
      console.warn('[SignFlow] Failed to broadcast config', error);
    }
  }
}

function sanitizeApiBase(value) {
  if (!value) {
    return defaultConfig.apiBaseUrl;
  }
  return value.trim().replace(/\s+/g, '');
}

async function pingApi(apiBaseUrl) {
  if (!apiBaseUrl) {
    return false;
  }
  try {
    const response = await fetch(`${apiBaseUrl.replace(/\/$/, '')}/health`, {
      method: 'GET'
    });
    return response.ok;
  } catch (error) {
    return false;
  }
}
