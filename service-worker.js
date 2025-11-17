const STATE_KEY = 'signflow:state';
const defaultState = {
  isEnabled: false,
  status: 'idle',
  tabId: null,
  lastSequence: [],
  chunkCount: 0,
  lastUpdated: null
};

const DEMO_SIGN_SEQUENCES = [
  ['HELLO', 'TODAY', 'MEETING'],
  ['TODAY', 'MEETING'],
  ['HELLO', 'MEETING'],
  ['HELLO', 'TODAY'],
  ['MEETING']
];

chrome.runtime.onInstalled.addListener(async () => {
  await chrome.storage.local.set({ [STATE_KEY]: defaultState });
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
      lastUpdated: Date.now()
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
  const next = await setState(
    { ...defaultState, chunkCount: 0, lastSequence: [] },
    { broadcast: true }
  );
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

  const arrayBuffer = base64ToArrayBuffer(payload.base64);
  await simulateStream(arrayBuffer, payload.mimeType);

  const updatedState = await setState(
    {
      status: 'streaming',
      chunkCount: state.chunkCount + 1,
      lastUpdated: Date.now()
    },
    { broadcast: true }
  );

  const glosses = getDemoGlosses(updatedState.chunkCount);
  await setState({ lastSequence: glosses }, { broadcast: true });
  try {
    await sendToTab(state.tabId, {
      type: 'background:play-signs',
      glosses
    });
  } catch (error) {
    console.warn('[SignFlow] Unable to forward glosses', error);
  }
}

function base64ToArrayBuffer(base64) {
  const binary = atob(base64);
  const length = binary.length;
  const bytes = new Uint8Array(length);
  for (let i = 0; i < length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
}

async function simulateStream(buffer, mimeType) {
  console.debug('[SignFlow] Streaming chunk', { bytes: buffer.byteLength, mimeType });
  await new Promise((resolve) => setTimeout(resolve, 100));
}

function getDemoGlosses(chunkCount) {
  const index = chunkCount % DEMO_SIGN_SEQUENCES.length;
  return DEMO_SIGN_SEQUENCES[index];
}
