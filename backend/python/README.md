# SignFlow Python STT Server

This is an optional local Speech-to-Text server using faster-whisper (OpenAI Whisper implementation).
It provides local transcription as an alternative to the Gemini API for privacy and reduced API costs.

## Setup

### Prerequisites

- Python 3.8 or higher
- Internet connection for first-time model download
- Windows PowerShell (for Windows users) or bash (for Linux/Mac)

### Installation Steps

1. **Navigate to the Python backend directory:**
```bash
cd backend/python
```

2. **Create a virtual environment:**
```bash
python -m venv venv
```

3. **Activate the virtual environment:**
   - **Windows PowerShell:** `.\venv\Scripts\Activate.ps1`
   - **Windows CMD:** `.\venv\Scripts\activate.bat`
   - **Linux/Mac:** `source venv/bin/activate`

4. **Install dependencies:**
```bash
pip install -r requirements.txt
```

**Note:** On first run, faster-whisper will automatically download the specified Whisper model from Hugging Face. The "tiny" model is ~75MB and is recommended for development.

## Running the Server

Start the server with:
```bash
python stt_server.py --model tiny --port 6000
```

### Command-Line Options:

- `--model`: Whisper model size. Options: `tiny` (fastest, least accurate), `base`, `small`, `medium`, `large` (slowest, most accurate). **Default: tiny**
- `--port`: Port to run the server on. **Default: 6000**
- `--host`: Host address to bind to. **Default: 127.0.0.1**
- `--device`: Device to run on. Options: `cpu`, `cuda` (requires NVIDIA GPU). **Default: cpu**
- `--compute-type`: Computation precision. Options: `int8` (fastest), `float16`, `float32` (most accurate). **Default: int8**

### Example Commands:

```bash
# Development (fast, less accurate)
python stt_server.py --model tiny --port 6000

# Production (slower, more accurate)
python stt_server.py --model base --port 6000 --device cpu

# With GPU acceleration (if available)
python stt_server.py --model small --port 6000 --device cuda --compute-type float16
```

## API Endpoints

### POST /transcribe

Transcribes audio from base64-encoded data.

**Request:**
```json
{
  "audioBase64": "SGVsbG8gd29ybGQ=...",
  "mimeType": "audio/webm",
  "locale": "en-US"
}
```

**Response (Success):**
```json
{
  "text": "hello everyone today we have a meeting",
  "locale": "en-US",
  "confidence": 0.85,
  "provider": "whisper"
}
```

**Response (Error - Model Not Loaded):**
```json
{
  "error": "Whisper model not initialized. Please check server logs and ensure the model can be downloaded."
}
```
Status Code: 503

### GET /health

Health check endpoint to verify server status.

**Response:**
```json
{
  "status": "healthy",
  "model": "tiny",
  "ready": true
}
```

- `status`: "healthy" if model is loaded, "degraded" if server is running but model failed to load
- `model`: The Whisper model size being used
- `ready`: `true` if the model is loaded and ready for transcription, `false` otherwise

## Integration with Node Backend

The Node backend in `backend/src` can optionally use this local STT server for transcription.

### Configuration

1. **Enable local STT in `.env`:**
```bash
LOCAL_STT_ENABLED=true
LOCAL_STT_URL=http://127.0.0.1:6000
LOCAL_STT_TIMEOUT_MS=5000
```

2. **Start both servers:**
   
   **Terminal 1 - Python STT Server:**
   ```bash
   cd backend/python
   .\venv\Scripts\Activate.ps1  # Windows
   python stt_server.py --model tiny --port 6000
   ```
   
   **Terminal 2 - Node Backend:**
   ```bash
   cd backend
   npm run dev
   ```

### Fallback Behavior

The integration is designed to be resilient:

1. **First attempt:** Node backend calls local STT server (`http://127.0.0.1:6000/transcribe`)
2. **If local STT fails:** Falls back to Gemini API (if `GEMINI_API_KEY` is configured)
3. **If Gemini fails:** Uses mock transcription for testing

This means:
- ✅ You can run without the Python server (uses Gemini/mock)
- ✅ You can run without Gemini API (uses local STT/mock)
- ✅ The system keeps working even if one component fails

## Troubleshooting

### "Model not initialized" or HTTP 503 errors

**Cause:** The Whisper model failed to download or load.

**Solutions:**
1. Ensure you have internet connectivity on first run
2. Check that you have enough disk space (~75MB for tiny model, ~1.5GB for large)
3. Try downloading the model manually:
   ```bash
   python -c "from faster_whisper import WhisperModel; WhisperModel('tiny')"
   ```
4. Check firewall/proxy settings if download is blocked

### Import errors or missing dependencies

**Solution:** Reinstall dependencies:
```bash
pip install --upgrade -r requirements.txt
```

### Server starts but transcription is very slow

**Solutions:**
- Use a smaller model (e.g., `tiny` instead of `base`)
- Reduce audio chunk size in the Chrome extension
- Consider using GPU acceleration if available (`--device cuda`)

### Port 6000 already in use

**Solution:** Either:
- Stop other process using port 6000
- Use a different port: `python stt_server.py --port 6001` and update `LOCAL_STT_URL` in `.env`

## Performance Notes

| Model | Size | Speed (CPU) | Accuracy |
|-------|------|-------------|----------|
| tiny  | ~75MB | ~1-2s per chunk | Good for demos |
| base  | ~140MB | ~2-4s per chunk | Better accuracy |
| small | ~460MB | ~4-8s per chunk | Production quality |
| medium | ~1.5GB | ~10-20s per chunk | High accuracy |
| large | ~2.9GB | ~20-40s per chunk | Best accuracy |

**Recommendation:** Use `tiny` for development/testing, `base` or `small` for production with CPU, `medium` or `large` only with GPU acceleration.

