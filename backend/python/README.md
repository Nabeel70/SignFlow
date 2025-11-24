# SignFlow Local STT Server

This is a local Speech-To-Text (STT) server for SignFlow that uses the `faster-whisper` library to provide fast, offline transcription capabilities.

## Features

- Fast transcription using the faster-whisper library (optimized Whisper implementation)
- Support for multiple model sizes (tiny, base, small, medium, large)
- CPU and CUDA (GPU) support
- REST API compatible with SignFlow backend

## Prerequisites

- Python 3.8 or higher
- pip (Python package installer)

## Setup

### 1. Create a virtual environment (recommended)

```bash
cd backend/python
python -m venv venv
```

### 2. Activate the virtual environment

**Windows:**
```bash
venv\Scripts\activate
```

**macOS/Linux:**
```bash
source venv/bin/activate
```

### 3. Install dependencies

```bash
pip install -r requirements.txt
```

## Running the Server

### Basic usage with tiny model (fastest, least accurate)

```bash
python stt_server.py --model tiny --port 6000
```

### With better accuracy (base model)

```bash
python stt_server.py --model base --port 6000
```

### Available options

```
--model       Whisper model size: tiny, base, small, medium, large-v2, large-v3 (default: tiny)
--device      Device to run on: cpu, cuda (default: cpu)
--compute-type Compute precision: int8, float16, float32 (default: int8)
--port        Port to run server on (default: 6000)
--host        Host to bind to (default: 127.0.0.1)
```

### Examples

```bash
# Tiny model on CPU (fastest, good for testing)
python stt_server.py --model tiny --port 6000

# Base model on CPU (better accuracy)
python stt_server.py --model base --port 6000

# Small model on GPU (requires CUDA)
python stt_server.py --model small --device cuda --compute-type float16 --port 6000
```

## Configuring SignFlow Backend

To enable the local STT server in the SignFlow backend, update your `.env` file:

```env
LOCAL_STT_ENABLED=true
LOCAL_STT_URL=http://127.0.0.1:6000
```

## API Endpoints

### `GET /health`

Health check endpoint to verify the server is running.

**Response:**
```json
{
  "status": "ok",
  "model": "tiny",
  "ready": true
}
```

### `POST /transcribe`

Transcribe audio from base64-encoded data.

**Request:**
```json
{
  "audioBase64": "base64_encoded_audio_data",
  "locale": "en-US"
}
```

**Response:**
```json
{
  "text": "transcribed text",
  "locale": "en-US",
  "confidence": 0.95,
  "provider": "faster-whisper",
  "model": "tiny",
  "detected_language": "en"
}
```

## Model Comparison

| Model | Size | Speed | Accuracy | Use Case |
|-------|------|-------|----------|----------|
| tiny | ~75MB | Very Fast | Basic | Development/Testing |
| base | ~145MB | Fast | Good | General use |
| small | ~466MB | Medium | Better | Production |
| medium | ~1.5GB | Slow | Great | High accuracy needed |
| large-v3 | ~3GB | Very Slow | Best | Maximum accuracy |

## Troubleshooting

### Model not loading

- Ensure you have enough disk space for the model
- Check your internet connection (models are downloaded on first use)
- Try a smaller model size

### Slow transcription

- Use a smaller model (e.g., `tiny` or `base`)
- If you have a NVIDIA GPU, use `--device cuda` with `--compute-type float16`
- Ensure no other heavy processes are running

### Audio decoding errors

- Ensure the audio is properly base64 encoded
- Check that the audio format is supported by soundfile (WAV, FLAC, OGG, etc.)
- Try re-encoding the audio in a standard format

## Development

The server uses:
- **Flask** for the HTTP server
- **faster-whisper** for transcription
- **soundfile** for audio processing
- **numpy** for numerical operations

## License

Part of the SignFlow project.
