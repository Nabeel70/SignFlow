# SignFlow Backend

Gemini + Qdrant powered API that converts microphone audio into ASL gloss sequences and playable sign animations for the SignFlow Chrome extension.

## Requirements

- Node 18+
- (Optional) Google Gemini API key for transcription + text simplification
- (Optional) Qdrant cluster for vector based sign lookup
- (Optional) Python 3.8+ for local STT server (faster-whisper)

## Setup

1. `cd backend && npm install`
2. Copy `.env.example` → `.env` and fill in:
   - `GEMINI_API_KEY` (provided)
   - `QDRANT_URL`, `QDRANT_API_KEY`, `QDRANT_COLLECTION`
   - `SIGNFLOW_BUCKET` (e.g., `pak-drive.appspot.com`)
   - `SIGNFLOW_CDN_BASE_URL` (e.g., `https://storage.googleapis.com/pak-drive.appspot.com/signs/`)
   - `GOOGLE_APPLICATION_CREDENTIALS=./firebase-service-account.json`
   - (Optional) `LOCAL_STT_ENABLED=true` and `LOCAL_STT_URL=http://127.0.0.1:6000` to use the local STT server
3. Place your Firebase Admin SDK JSON as `firebase-service-account.json` (already provided for SignFlow).
4. (Optional) Set up the local STT server for faster, offline transcription:
   ```bash
   cd python
   python -m venv venv
   # On Windows: venv\Scripts\activate
   # On macOS/Linux: source venv/bin/activate
   pip install -r requirements.txt
   python stt_server.py --model tiny --port 6000
   ```
   See `python/README.md` for detailed setup instructions.
5. Upload the local demo assets to Firebase Storage:
   ```bash
   npm run sync:assets
   ```
   This uploads `assets/signs/*.webm` to `gs://<bucket>/signs/*` and makes them public.
6. Seed Qdrant with the gloss metadata:
   ```bash
   npm run sync:qdrant
   ```
   The script creates (if needed) and upserts into `signflow_signs`.
7. Start the backend:
   ```bash
   npm run dev
   ```

The server listens on `http://localhost:5055` by default and exposes the following endpoints under `/api/v1`.

| Endpoint | Description |
| --- | --- |
| `GET /health` | Lightweight status check (used by the extension's "Test" button) |
| `POST /transcribe` | Runs Gemini STT on `audioBase64` blobs (WebM/Opus) |
| `POST /translate` | Simplifies natural language into ASL-friendly keywords + gloss sequence |
| `POST /sign-sequence` | End-to-end pipeline: transcribe (optional), translate, lookup matching sign videos |

Example payload for `/sign-sequence`:

```json
{
  "audioBase64": "AAA...BBB",
  "mimeType": "audio/webm",
  "locale": "en-US"
}
```

When audio is omitted you can pass an existing transcript:

```json
{
  "transcript": "Hello everyone, let's start the meeting."
}
```

## Fallback Behaviour

- If `LOCAL_STT_ENABLED=true`, the backend will try the local Python STT server first. If it fails, it falls back to Gemini.
- If no Gemini key is provided the server returns deterministic demo transcripts and keyword extraction.
- When Qdrant is not configured, the service falls back to the bundled `data/signGlosses.json` catalogue and a keyword overlap heuristic.
- CDN/asset URLs default to `https://storage.googleapis.com/signflow-demo/signs/` but can be changed via `SIGNFLOW_CDN_BASE_URL`.

## Connecting The Extension

The Chrome extension service worker posts microphone chunks to `POST /api/v1/sign-sequence`. Set the desired endpoint inside the extension popup (Backend endpoint section) if you deploy the backend to another host.

## Deployment Notes

- The backend is a standard Node app and runs on Render, Railway, Fly, Cloud Run, etc. Provide the same environment variables from `.env` when deploying.
- Ensure the production deployment runs behind HTTPS so the Chrome extension can reach it without mixed-content warnings.
- `/health` is a lightweight GET endpoint used by the popup “Test” button; make sure it is exposed publicly.
