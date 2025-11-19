# SignFlow Setup Guide

This guide walks you through setting up the complete SignFlow system with both the Python STT server and Node backend.

## Prerequisites

- **Node.js** 18 or higher
- **Python** 3.8 or higher
- **npm** (comes with Node.js)
- **Git** (optional, for cloning)
- **Internet connection** (for first-time setup to download dependencies and Whisper model)

## Architecture Overview

SignFlow consists of three main components:

1. **Chrome Extension** (Frontend) - Captures audio and displays sign language overlays
2. **Node.js Backend** (Port 5055) - Orchestrates transcription, translation, and sign language mapping
3. **Python STT Server** (Port 6000, Optional) - Local speech-to-text using Whisper

```
Chrome Extension → Node Backend (5055) → Python STT (6000)
                         ↓                      ↓
                   Gemini API           Whisper Model
                   (Fallback)             (Local)
```

## Quick Start

### Step 1: Set Up the Python STT Server

1. **Open a terminal/PowerShell window** and navigate to the Python backend:
   ```bash
   cd "path/to/SignFlow Browser extension/backend/python"
   ```

2. **Create a virtual environment:**
   ```bash
   python -m venv venv
   ```

3. **Activate the virtual environment:**
   - **Windows PowerShell:**
     ```powershell
     .\venv\Scripts\Activate.ps1
     ```
   - **Windows CMD:**
     ```cmd
     .\venv\Scripts\activate.bat
     ```
   - **Linux/Mac:**
     ```bash
     source venv/bin/activate
     ```

4. **Install dependencies:**
   ```bash
   pip install -r requirements.txt
   ```
   
   This may take a few minutes as it installs Flask, faster-whisper, and dependencies.

5. **Start the STT server:**
   ```bash
   python stt_server.py --model tiny --port 6000
   ```
   
   **First-time run:** The server will download the Whisper "tiny" model (~75MB) from Hugging Face. This is a one-time download.
   
   **Expected output:**
   ```
   Loading Whisper model: tiny
   Model loaded successfully
   Starting STT server on 127.0.0.1:6000
    * Serving Flask app 'stt_server'
    * Running on http://127.0.0.1:6000
   ```

6. **Verify the server is running:**
   Open a new terminal and run:
   ```bash
   curl http://127.0.0.1:6000/health
   ```
   
   Expected response:
   ```json
   {"status":"healthy","model":"tiny","ready":true}
   ```

### Step 2: Set Up the Node.js Backend

1. **Open a NEW terminal/PowerShell window** (keep the Python server running in the first one)

2. **Navigate to the Node backend:**
   ```bash
   cd "path/to/SignFlow Browser extension/backend"
   ```

3. **Install dependencies:**
   ```bash
   npm install
   ```

4. **Configure environment variables:**
   
   The `.env` file should already be configured. Verify it contains:
   ```env
   LOCAL_STT_ENABLED=true
   LOCAL_STT_URL=http://127.0.0.1:6000
   GEMINI_API_KEY=your-key-here
   ```

5. **Start the Node backend:**
   ```bash
   npm run dev
   ```
   
   **Expected output:**
   ```
   [dotenv] injecting env from .env
   SignFlow backend listening on port 5055
   ```

6. **Verify the backend is running:**
   Open a new terminal and run:
   ```bash
   curl http://localhost:5055/api/v1/health
   ```
   
   Expected response:
   ```json
   {"status":"ok","env":"development","qdrant":true,"gemini":true}
   ```

### Step 3: Load the Chrome Extension

1. **Open Chrome** and navigate to `chrome://extensions/`

2. **Enable "Developer mode"** (toggle in the top-right corner)

3. **Click "Load unpacked"**

4. **Select the root folder** of the SignFlow project (the folder containing `manifest.json`)

5. **Pin the extension** (click the puzzle icon in Chrome toolbar, then pin SignFlow)

6. **Click the SignFlow icon** and you should see the popup

7. **Configure the backend endpoint** in the popup:
   - Default: `http://localhost:5055/api/v1`
   - Click "Test" to verify connectivity

8. **Toggle ON** to start capturing audio and showing sign language overlays

## Troubleshooting

### Python STT Server Issues

#### Problem: "Model not initialized" or HTTP 503 errors

**Cause:** The Whisper model failed to download or load.

**Solutions:**
1. Check internet connectivity
2. Ensure you have ~200MB free disk space
3. Manually download the model:
   ```bash
   python -c "from faster_whisper import WhisperModel; WhisperModel('tiny')"
   ```
4. Check firewall/proxy settings

#### Problem: Port 6000 already in use

**Solution:**
- Find and stop the process using port 6000, OR
- Use a different port:
  ```bash
  python stt_server.py --port 6001
  ```
  Then update `LOCAL_STT_URL=http://127.0.0.1:6001` in `backend/.env`

#### Problem: "ModuleNotFoundError" or import errors

**Solution:**
```bash
# Make sure virtual environment is activated (you should see (venv) in your prompt)
pip install --upgrade -r requirements.txt
```

### Node Backend Issues

#### Problem: Node backend won't start or shows "EADDRINUSE" error

**Cause:** Port 5055 is already in use.

**Solution:**
- Find and stop the process using port 5055, OR
- Change the port in `backend/.env`:
  ```env
  PORT=5056
  ```
  And update the extension popup settings accordingly.

#### Problem: "Local STT failed" warnings in logs

**This is normal!** The system is designed with fallback behavior:

1. First, it tries the local STT server (Python)
2. If that fails, it tries Gemini API
3. If that fails, it uses mock transcription

As long as one method works, the extension will function. The warnings just inform you which method succeeded.

### Extension Issues

#### Problem: No sign language videos appearing

**Causes and Solutions:**

1. **Backend not running:** Check that Node backend is running on port 5055
2. **No audio detected:** Check browser microphone permissions
3. **Toggle not enabled:** Make sure the toggle in the popup is ON
4. **Overlay hidden:** Click "Show overlay again" button in popup

#### Problem: Microphone permission denied

**Solution:**
1. Click the lock icon in Chrome's address bar
2. Set Microphone to "Allow"
3. Refresh the page
4. Toggle the extension ON again

#### Problem: "Failed to connect" when testing backend endpoint

**Solutions:**
1. Verify Node backend is running: `curl http://localhost:5055/api/v1/health`
2. Check that the endpoint URL in popup settings matches your backend
3. Ensure no firewall is blocking localhost connections

## Configuration Options

### Python STT Server

Command-line options for `stt_server.py`:

```bash
python stt_server.py [OPTIONS]

Options:
  --model {tiny,base,small,medium,large}  Whisper model size (default: tiny)
  --port PORT                             Server port (default: 6000)
  --host HOST                             Bind address (default: 127.0.0.1)
  --device {cpu,cuda}                     Device to use (default: cpu)
  --compute-type {int8,float16,float32}   Precision (default: int8)
```

**Model comparison:**
- `tiny` (75MB): Fast, good for development
- `base` (140MB): Better accuracy, still fast
- `small` (460MB): Production quality
- `medium` (1.5GB): High accuracy, requires good CPU/GPU
- `large` (2.9GB): Best accuracy, GPU recommended

### Node Backend

Edit `backend/.env`:

```env
# Server
PORT=5055
NODE_ENV=development

# Local STT (Python server)
LOCAL_STT_ENABLED=true              # Enable local STT
LOCAL_STT_URL=http://127.0.0.1:6000 # Python server URL
LOCAL_STT_TIMEOUT_MS=5000           # Request timeout

# Gemini API (fallback)
GEMINI_API_KEY=your-key-here        # Get from Google AI Studio
GEMINI_SPEECH_MODEL=gemini-2.0-flash
GEMINI_TEXT_MODEL=gemini-2.0-flash

# Qdrant (vector database for sign lookup)
QDRANT_URL=https://your-qdrant-instance
QDRANT_API_KEY=your-qdrant-key
QDRANT_COLLECTION=signflow_signs

# Firebase Storage (CDN for sign videos)
SIGNFLOW_CDN_BASE_URL=https://storage.googleapis.com/pak-drive.appspot.com/signs/
SIGNFLOW_BUCKET=pak-drive.appspot.com
GOOGLE_APPLICATION_CREDENTIALS=./firebase-service-account.json
```

## Testing the Integration

Run this command to test all components:

```bash
# Test Python STT server
curl http://127.0.0.1:6000/health

# Test Node backend
curl http://localhost:5055/api/v1/health

# Test transcription (with mock data)
curl -X POST http://localhost:5055/api/v1/transcribe \
  -H "Content-Type: application/json" \
  -d '{"audioBase64":"UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQAAAAA=","mimeType":"audio/webm"}'
```

## Running Without Python STT Server

The system is designed to work without the Python STT server. If you skip Step 1:

1. Set `LOCAL_STT_ENABLED=false` in `backend/.env`, OR
2. Simply don't start the Python server

The Node backend will automatically fall back to:
- Gemini API (if `GEMINI_API_KEY` is set)
- Mock transcription (for testing)

## Development Workflow

**Typical development session:**

1. **Terminal 1:** Start Python STT server
   ```bash
   cd backend/python
   .\venv\Scripts\Activate.ps1
   python stt_server.py --model tiny --port 6000
   ```

2. **Terminal 2:** Start Node backend
   ```bash
   cd backend
   npm run dev
   ```

3. **Chrome:** Load/reload the extension and test

4. **Make changes** to code

5. **Terminal 2:** Node backend auto-restarts (using nodemon)

6. **Terminal 1:** Restart Python server if you modified it

7. **Chrome:** Reload extension if you modified extension files

## Production Deployment

For production deployment:

1. **Python STT Server:**
   - Use a larger model (`base` or `small`)
   - Deploy with a production WSGI server (gunicorn, uwsgi)
   - Use GPU acceleration if available (`--device cuda`)
   - Secure with authentication/firewall rules

2. **Node Backend:**
   - Use `npm start` instead of `npm run dev`
   - Deploy to a cloud platform (Render, Railway, Cloud Run, etc.)
   - Enable HTTPS
   - Set `NODE_ENV=production` in environment

3. **Chrome Extension:**
   - Update backend endpoint URL in popup to production URL
   - Package and publish to Chrome Web Store

## Support

For issues or questions:
1. Check the troubleshooting section above
2. Review server logs for error messages
3. Test each component individually using curl commands
4. Check firewall and network settings

## Architecture Notes

### Fallback Hierarchy

The system is resilient with multiple fallbacks:

```
Audio Capture
    ↓
Try Local STT (Python/Whisper)
    ↓ (if fails)
Try Gemini API
    ↓ (if fails)
Use Mock Transcription
    ↓
Translate to ASL Gloss
    ↓
Map to Sign Videos
    ↓
Display in Overlay
```

This ensures the extension keeps working even if components fail.

### Why Two Servers?

- **Python STT (Port 6000):** Specialized for speech-to-text using Whisper. Python has better ML library support.
- **Node Backend (Port 5055):** Handles business logic, API orchestration, and serves the Chrome extension. Node.js is better for async I/O and API servers.

This separation allows:
- Independent scaling and deployment
- Optional local STT (privacy-focused users)
- Fallback to cloud services (Gemini API)
- Better resource management
