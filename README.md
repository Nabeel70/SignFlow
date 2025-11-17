# SignFlow – Real-Time Sign Language Bridge

SignFlow is a Chrome extension + API stack that listens to web-conference audio, streams it to an AI-driven backend, and overlays sign-language animations on top of any tab so Deaf or hard-of-hearing participants can follow the conversation in real time.

The project currently contains:

- **Extension frontend** (manifest v3) – `manifest.json`, `popup.*`, `contentScript.js`, `overlay.css`, `service-worker.js`, and assets under `assets/`.
- **Backend service** – `backend/` Node 18+ app powered by Express, Gemini APIs, and Qdrant-compatible sign lookup logic.
- **Demo assets** – placeholder icon PNGs and WebM sign clips for HELLO/TODAY/MEETING to visualize the experience before the AI pipeline is fully integrated.

Use this README as the canonical reference for architecture, file locations, and remaining work for future contributors.

---

## Repository Structure

```
SignFlow Browser extension/
├── assets/
│   ├── icons/icon-{16,48,128}.png      # Extension action icons
│   └── signs/*.webm                    # Demo sign animations
├── backend/
│   ├── data/signGlosses.json           # Local fallback catalogue of gloss metadata
│   ├── src/
│   │   ├── config.js                   # Env + port + external service config
│   │   ├── logger.js                   # Pino with pretty logging in dev
│   │   ├── routes/signflowRoutes.js    # /transcribe, /translate, /sign-sequence endpoints
│   │   └── services/                   # Gemini + Qdrant clients and sequencing pipeline
│   ├── .env.example                    # Reference environment variables
│   └── README.md                       # Backend-specific setup docs
├── contentScript.js                    # Injected overlay + Web Audio capture
├── overlay.css                         # Styling for floating video box
├── manifest.json                       # MV3 definition
├── popup.html / popup.css / popup.js   # Control UI for enabling/disabling SignFlow
└── service-worker.js                   # Extension background logic + backend bridge
```

---

## Frontend (Chrome Extension)

### Features Implemented

| Area | Details | Files |
| --- | --- | --- |
| MV3 wiring | manifest, action icons, popup, content script, background worker, CSP-safe assets | `manifest.json`, `assets/` |
| Popup UI | Toggle switch, status indicators (idle/pending/listening/streaming/error), chunk counter, last gloss list, overlay reset, toast messaging | `popup.html`, `popup.css`, `popup.js` |
| Audio capture | Web Audio microphone capture, MediaRecorder chunking, analyser-based level meter, permission handling | `contentScript.js` |
| Streaming | Each audio chunk is encoded to base64 and posted to `/api/v1/sign-sequence` (configurable API base), with automatic fallback to deterministic demo glosses if the backend errors | `contentScript.js`, `service-worker.js` |
| Overlay | Draggable floating video card with live captions, status header, mic level visual, and per-gloss video playback sourcing either bundled assets or backend URLs | `contentScript.js`, `overlay.css`, `assets/signs/` |

### How The Extension Communicates

1. Popup toggle (`popup.js`) sends `popup:toggle` messages to `service-worker.js`.
2. Service worker injects `contentScript.js` if absent, updates state in `chrome.storage`, and instructs the content script to start or stop capturing.
3. Content script uses `MediaRecorder` to emit ~750 ms chunks -> base64 -> `content:audio-chunk` to the service worker.
4. Service worker posts each chunk to `POST {API_BASE_URL}/sign-sequence` (`API_BASE_URL` defaults to `http://localhost:5055/api/v1`) and receives:
   ```json
   {
     "transcript": "...",
     "glossSequence": ["HELLO","TODAY","MEETING"],
     "videos": [
       {"gloss":"HELLO","videoUrl":"https://.../hello.webm", ...}
     ]
   }
   ```
5. The content script receives `background:play-signs` with either `videos` (preferred) or `glosses` and plays the clips inside the overlay.

### Remaining Frontend Tasks

- **Dynamic API target** – expose `API_BASE_URL` as an options page or environment-driven config so QA can switch between staging/production without editing `service-worker.js`.
- **Graceful reconnection UI** – show toast/badge when backend requests fail repeatedly (currently only logs and falls back to demo glosses).
- **Extended sign media** – add the AI-generated catalogue (40–50 clips) to the extension bundle or host on a CDN once the backend exposes them.
- **Permissions polishing** – consider microphone capture persistence (offscreen document) to survive tab refreshes without requiring the popup toggle each time.

---

## Backend (Node + Gemini + Qdrant)

See `backend/README.md` for setup, but here is the quick summary.

### Technologies

- Express 5 for HTTP routing (`src/index.js`).
- Pino for structured logging with `pino-pretty` in development.
- Google Generative AI client for:
  - `transcribeAudio` – speech-to-text with `gemini-1.5-flash`.
  - `simplifySentence` – prompts for ASL-friendly keywords/gloss sequences as JSON.
  Both methods include deterministic fallbacks when `GEMINI_API_KEY` is not set.
- Qdrant (optional) for vector search over gloss embeddings. When absent, the `SignRepository` falls back to `data/signGlosses.json` and a keyword-overlap heuristic.
- CDN abstraction via `SIGNFLOW_CDN_BASE_URL` so video URLs can be served from Firebase Storage, CloudFront, etc.

### Key Endpoints

| Endpoint | Body | Response | Purpose |
| --- | --- | --- | --- |
| `POST /api/v1/transcribe` | `{ audioBase64, mimeType, locale }` | `{ text, locale, confidence, provider }` | Direct transcription (used if another client wants STT only). |
| `POST /api/v1/translate` | `{ text }` | `{ normalizedText, keywords, glossSequence, provider }` | Text-only simplification/gloss extraction. |
| `POST /api/v1/sign-sequence` | `{ audioBase64?, transcript?, mimeType?, locale? }` | `{ transcript?, normalizedText, keywords, glossSequence, videos[], providers }` | Full pipeline – if `audioBase64` exists it calls STT first, otherwise uses the provided transcript. |

### Running Locally

```bash
cd backend
cp .env.example .env   # add keys
npm install
npm run dev            # starts on http://localhost:5055
```

`service-worker.js` expects the base URL `http://localhost:5055/api/v1`; change it if you deploy elsewhere.

### Remaining Backend / AI Tasks

- **Real Gemini integration** – update `.env` with valid keys. The code is production-ready but currently works through mock transcripts/glosses until keys are provided.
- **Qdrant collection** – create the `signflow_signs` collection (or update `QDRANT_COLLECTION`), ingest embeddings for the 40–50 AI-generated sign clips, and verify the `SignRepository` returns robust matches. Ingestion scripts are not yet included.
- **Video CDN** – populate `SIGNFLOW_CDN_BASE_URL` with the actual storage path for the MP4/WebM assets generated by the AI/ML phase. The frontend will automatically load those URLs when they are returned by the API.
- **Security tightening** – add API authentication (e.g., bearer token) once the service is exposed beyond localhost.
- **Latency tuning** – consider batching audio chunks (WebSocket streaming) once backend infrastructure is ready; the current REST call per chunk is acceptable for the MVP but not optimal for production.

---

## Testing & Verification

- run `npm run lint` inside `backend/` for syntax errors.
- Load the extension as an unpacked Chrome extension:
  1. `chrome://extensions` → enable Developer Mode → “Load unpacked” → select this folder.
  2. Open the popup, toggle ON, allow microphone access.
  3. With the backend running, observe requests to `/api/v1/sign-sequence` in DevTools → Network.
  4. Use the “Show overlay again” button if the draggable card is lost.

---

## Documentation for Future Contributors

1. **Frontend** – start from `manifest.json` to understand file wiring. UI code is vanilla JS/HTML/CSS to keep hackathon setup simple; swapping to a framework is possible but not planned for the MVP.
2. **Backend** – `SignPipeline` orchestrates transcription → simplification → video mapping; improve each layer independently (e.g., plug in better translation prompts, add caching, etc.).
3. **AI/ML Workstream** – use `backend/data/signGlosses.json` as a schema reference for the Grok-generated dataset. Embeddings should flow into Qdrant and the CDN should match `videoFile` names.
4. **Open Issues**
   - Multi-language support: add locale detection and translation to/from ASL gloss.
   - Bi-directional signing: plan a webcam-to-text pipeline (see proposal’s future scope).
   - Monitoring: add observability (trace IDs, metrics) once deployed.

Feel free to open an issue or create a PR when picking up any of the above tasks so the team can coordinate work across Frontend, Backend, and AI tracks.
