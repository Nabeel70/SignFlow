(function initSignFlowContent() {
  if (window.__signflowInitialized) {
    return;
  }
  window.__signflowInitialized = true;

  const overlay = createOverlay();
  const animator = new SignAnimator(overlay.videoEl, overlay.captionEl);

  let mediaStream = null;
  let mediaRecorder = null;
  let audioContext = null;
  let analyserNode = null;
  let meterFrame = null;
  let chunkSequence = 0;
  let isCapturing = false;

  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    const handlers = {
      'signflow:ping': async () => ({ ok: true }),
      'background:start-capture': () => startCapture(),
      'background:stop-capture': () => stopCapture(),
      'background:play-signs': () => {
        overlay.show();
        overlay.setStatus('Streaming signs', 'streaming');
        animator.playSequence(message.glosses);
      },
      'background:show-overlay': () => {
        overlay.show();
        overlay.resetPosition();
        overlay.setStatus('Idle', 'idle');
      }
    };

    const handler = handlers[message?.type];
    if (!handler) {
      return false;
    }

    Promise.resolve(handler())
      .then((result) => sendResponse(result))
      .catch((error) => {
        console.error('[SignFlow] Content handler failed', error);
        sendResponse({ ok: false, error: error.message });
      });

    return true;
  });

  async function startCapture() {
    if (isCapturing) {
      overlay.show();
      return { ok: true };
    }

    try {
      overlay.show();
      overlay.setStatus('Waiting for microphone...', 'pending');
      chrome.runtime.sendMessage({ type: 'content:status', status: 'pending' });
      mediaStream = await navigator.mediaDevices.getUserMedia({ audio: true });
      audioContext = new AudioContext();
      const mimeType = getMimeType();

      const sourceNode = audioContext.createMediaStreamSource(mediaStream);
      analyserNode = audioContext.createAnalyser();
      analyserNode.fftSize = 512;
      sourceNode.connect(analyserNode);
      runLevelMeter();

      mediaRecorder = new MediaRecorder(mediaStream, { mimeType });
      mediaRecorder.addEventListener('dataavailable', async (event) => {
        if (!event.data || event.data.size === 0) {
          return;
        }
        try {
          await streamAudioChunk(event.data);
        } catch (error) {
          console.error('[SignFlow] Failed to stream chunk', error);
          overlay.setStatus('Streaming issue', 'error');
        }
      });

      mediaRecorder.start(750);
      isCapturing = true;
      overlay.setStatus('Listening...', 'listening');
      chrome.runtime.sendMessage({ type: 'content:status', status: 'listening' });
      return { ok: true };
    } catch (error) {
      await stopCapture();
      overlay.setStatus('Microphone blocked', 'error');
      chrome.runtime.sendMessage({ type: 'content:status', status: 'error' });
      throw error;
    }
  }

  async function stopCapture() {
    if (mediaRecorder && mediaRecorder.state !== 'inactive') {
      mediaRecorder.stop();
    }
    if (mediaStream) {
      mediaStream.getTracks().forEach((track) => track.stop());
    }
    if (audioContext) {
      await audioContext.close();
    }
    if (meterFrame) {
      cancelAnimationFrame(meterFrame);
      meterFrame = null;
    }
    analyserNode = null;
    mediaStream = null;
    mediaRecorder = null;
    audioContext = null;
    isCapturing = false;
    overlay.setLevel(0);
    overlay.setStatus('Idle', 'idle');
    chrome.runtime.sendMessage({ type: 'content:status', status: 'idle' });
    return { ok: true };
  }

  function runLevelMeter() {
    if (!analyserNode) {
      return;
    }
    const buffer = new Uint8Array(analyserNode.fftSize);
    const loop = () => {
      if (!analyserNode) {
        return;
      }
      analyserNode.getByteTimeDomainData(buffer);
      let sum = 0;
      for (let i = 0; i < buffer.length; i += 1) {
        const value = (buffer[i] - 128) / 128;
        sum += value * value;
      }
      const rms = Math.sqrt(sum / buffer.length);
      const normalized = Math.min(1, rms * 3);
      overlay.setLevel(normalized);
      meterFrame = requestAnimationFrame(loop);
    };
    loop();
  }

  function getMimeType() {
    const candidates = [
      'audio/webm;codecs=opus',
      'audio/ogg;codecs=opus',
      'audio/webm'
    ];
    return candidates.find((type) => MediaRecorder.isTypeSupported(type)) || '';
  }

  async function streamAudioChunk(blob) {
    const base64 = await blobToBase64(blob);
    chunkSequence += 1;
    return chrome.runtime.sendMessage({
      type: 'content:audio-chunk',
      payload: {
        base64,
        mimeType: blob.type || 'audio/webm',
        sequence: chunkSequence,
        timestamp: Date.now()
      }
    });
  }

  function createOverlay() {
    const root = document.createElement('section');
    root.className = 'signflow-overlay signflow-hidden';
    root.innerHTML = `
      <header class=\"signflow-header\" title=\"Drag to reposition\">
        <div>
          <p class=\"signflow-label\">SignFlow</p>
          <p class=\"signflow-status-text\">Idle</p>
        </div>
        <div class=\"signflow-header-actions\">
          <div class=\"signflow-level\">
            <div class=\"signflow-level-bar\"></div>
          </div>
          <button class=\"signflow-collapse\" aria-label=\"Collapse overlay\">-</button>
        </div>
      </header>
      <div class=\"signflow-body\">
        <video class=\"signflow-video\" autoplay muted playsinline></video>
        <div class=\"signflow-caption\">Awaiting speech...</div>
      </div>
    `;
    document.documentElement.appendChild(root);
    root.dataset.state = 'idle';

    const statusText = root.querySelector('.signflow-status-text');
    const levelBar = root.querySelector('.signflow-level-bar');
    const videoEl = root.querySelector('.signflow-video');
    const captionEl = root.querySelector('.signflow-caption');
    const collapseBtn = root.querySelector('.signflow-collapse');

    let collapsed = false;
      collapseBtn.addEventListener('click', () => {
        collapsed = !collapsed;
        root.classList.toggle('signflow-collapsed', collapsed);
        collapseBtn.textContent = collapsed ? '+' : '-';
      });

    enableDrag(root, root.querySelector('.signflow-header'));

    return {
      root,
      videoEl,
      captionEl,
      show() {
        root.classList.remove('signflow-hidden');
      },
      setStatus(text, mode) {
        statusText.textContent = text;
        root.dataset.state = mode;
      },
      setLevel(level) {
        levelBar.style.transform = `scaleX(${level.toFixed(2)})`;
      },
      resetPosition() {
        root.style.top = '96px';
        root.style.right = '32px';
        root.style.left = 'auto';
      }
    };
  }

  function enableDrag(target, handle) {
    let dragging = false;
    let startX = 0;
    let startY = 0;
    let initialTop = 0;
    let initialLeft = 0;

    const onPointerDown = (event) => {
      dragging = true;
      startX = event.clientX;
      startY = event.clientY;
      const rect = target.getBoundingClientRect();
      initialTop = rect.top;
      initialLeft = rect.left;
      handle.setPointerCapture(event.pointerId);
    };

    const onPointerMove = (event) => {
      if (!dragging) {
        return;
      }
      const deltaX = event.clientX - startX;
      const deltaY = event.clientY - startY;
      target.style.top = `${initialTop + deltaY}px`;
      target.style.left = `${initialLeft + deltaX}px`;
      target.style.right = 'auto';
    };

    const onPointerUp = (event) => {
      dragging = false;
      if (handle.hasPointerCapture(event.pointerId)) {
        handle.releasePointerCapture(event.pointerId);
      }
    };

    handle.addEventListener('pointerdown', onPointerDown);
    handle.addEventListener('pointermove', onPointerMove);
    handle.addEventListener('pointerup', onPointerUp);
    handle.addEventListener('pointerleave', () => {
      dragging = false;
    });
  }

  function blobToBase64(blob) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        const result = reader.result;
        if (typeof result === 'string') {
          resolve(result.split(',')[1]);
        } else {
          reject(new Error('Unexpected reader result'));
        }
      };
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  }

  function SignAnimator(videoEl, captionEl) {
    this.videoEl = videoEl;
    this.captionEl = captionEl;
    this.queue = [];
    this.isPlaying = false;
    this.signSources = new Map([
      ['HELLO', chrome.runtime.getURL('assets/signs/hello.webm')],
      ['TODAY', chrome.runtime.getURL('assets/signs/today.webm')],
      ['MEETING', chrome.runtime.getURL('assets/signs/meeting.webm')]
    ]);
    videoEl.loop = false;
    videoEl.addEventListener('ended', () => {
      this.playNext();
    });
  }

  SignAnimator.prototype.playSequence = function playSequence(glosses = []) {
    this.queue = glosses.map((gloss) => gloss.toUpperCase());
    this.isPlaying = true;
    this.playNext();
  };

  SignAnimator.prototype.playNext = function playNext() {
    if (!this.queue.length) {
      this.captionEl.textContent = 'Awaiting speech...';
      this.videoEl.pause();
      this.isPlaying = false;
      return;
    }
    const gloss = this.queue.shift();
    const src = this.signSources.get(gloss) || this.signSources.get('HELLO');
    this.captionEl.textContent = gloss;
    this.videoEl.src = src;
    this.videoEl.currentTime = 0;
    this.videoEl.play().catch(() => {
      this.captionEl.textContent = `${gloss} (video blocked)`;
    });
  };
})();
