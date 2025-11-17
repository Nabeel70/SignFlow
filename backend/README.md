# SignFlow Backend

Gemini + Qdrant powered API that converts microphone audio into ASL gloss sequences and playable sign animations for the SignFlow Chrome extension.

## Requirements

- Node 18+
- (Optional) Google Gemini API key for transcription + text simplification
- (Optional) Qdrant cluster for vector based sign lookup

## Setup

```bash
cd backend
cp .env.example .env # add API keys
npm install
npm run dev
```

The server listens on `http://localhost:5055` by default and exposes the following endpoints under `/api/v1`.

| Endpoint | Description |
| --- | --- |
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

- If no Gemini key is provided the server returns deterministic demo transcripts and keyword extraction.
- When Qdrant is not configured, the service falls back to the bundled `data/signGlosses.json` catalogue and a keyword overlap heuristic.
- CDN/asset URLs default to `https://storage.googleapis.com/signflow-demo/signs/` but can be changed via `SIGNFLOW_CDN_BASE_URL`.

## Connecting The Extension

The Chrome extension service worker posts microphone chunks to `POST /api/v1/sign-sequence`. Update `API_BASE_URL` in `service-worker.js` if you deploy the backend to another host.
