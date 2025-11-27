# SignFlow Python STT Server

A local Speech-to-Text server using faster-whisper for real-time audio transcription.

## Setup

1. Create a virtual environment:
```bash
python -m venv venv
```

2. Activate the virtual environment:
```bash
# Windows
.\venv\Scripts\Activate.ps1
# or
.\venv\Scripts\activate.bat

# Linux/Mac
source venv/bin/activate
```

3. Install dependencies:
```bash
pip install -r requirements.txt
```

## Running the Server

```bash
python stt_server.py --model tiny --port 6001
```

### Options

- `--model`: Whisper model size (tiny, base, small, medium, large-v2, large-v3). Default: tiny
- `--port`: Port to run the server on. Default: 6000
- `--host`: Host to bind to. Default: 127.0.0.1
- `--device`: Device to run model on (cpu, cuda). Default: cpu

## API Endpoints

### POST /transcribe

Transcribe audio to text.

**Request Body (JSON):**
```json
{
  "audioBase64": "base64-encoded-audio-data",
  "mimeType": "audio/webm",
  "locale": "en-US"
}
```

**Response:**
```json
{
  "text": "transcribed text",
  "locale": "en-US",
  "confidence": 0.85,
  "provider": "whisper"
}
```

### GET /health

Health check endpoint.

**Response:**
```json
{
  "status": "ok",
  "model": "tiny",
  "loaded": true
}
```

### GET /models

List available Whisper models.

**Response:**
```json
{
  "models": ["tiny", "base", "small", "medium", "large-v2", "large-v3"],
  "current": "tiny"
}
```

## Troubleshooting

If you encounter issues with faster-whisper, ensure you have the required dependencies:

```bash
# For CPU
pip install faster-whisper

# For GPU (CUDA)
pip install faster-whisper[cuda]
```

If faster-whisper is not available, the server will fall back to mock transcription.
