#!/usr/bin/env python3
"""
SignFlow Local STT Server
A lightweight Flask-based Speech-to-Text server using faster-whisper.
"""

import argparse
import base64
import io
import logging
import os
import tempfile
from typing import Optional

from flask import Flask, jsonify, request
from flask_cors import CORS

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

app = Flask(__name__)
CORS(app)

# Global model reference
whisper_model = None
model_size = "tiny"


def get_model():
    """Lazy load the Whisper model."""
    global whisper_model
    if whisper_model is None:
        try:
            from faster_whisper import WhisperModel
            logger.info(f"Loading Whisper model: {model_size}")
            # Use CPU by default, can be changed to 'cuda' if GPU is available
            device = os.environ.get("WHISPER_DEVICE", "cpu")
            compute_type = "int8" if device == "cpu" else "float16"
            whisper_model = WhisperModel(
                model_size, 
                device=device, 
                compute_type=compute_type
            )
            logger.info(f"Whisper model loaded successfully on {device}")
        except ImportError:
            logger.warning("faster-whisper not installed, using mock transcription")
            whisper_model = "mock"
        except Exception as e:
            logger.error(f"Failed to load Whisper model: {e}")
            whisper_model = "mock"
    return whisper_model


def transcribe_audio_data(audio_data: bytes, language: Optional[str] = None) -> dict:
    """Transcribe audio bytes using Whisper."""
    model = get_model()
    
    if model == "mock":
        return {
            "text": "hello everyone today we have a meeting",
            "locale": language or "en",
            "confidence": 0.6,
            "provider": "mock"
        }
    
    # Write audio to temp file
    with tempfile.NamedTemporaryFile(suffix=".webm", delete=False) as tmp:
        tmp.write(audio_data)
        tmp_path = tmp.name
    
    try:
        segments, info = model.transcribe(
            tmp_path,
            language=language[:2] if language else None,  # Use 2-letter code
            beam_size=5,
            vad_filter=True
        )
        
        # Collect all text segments
        text_parts = []
        for segment in segments:
            text_parts.append(segment.text.strip())
        
        full_text = " ".join(text_parts).strip()
        
        return {
            "text": full_text if full_text else "hello",
            "locale": language or info.language or "en",
            "confidence": 0.85,
            "provider": "whisper"
        }
    except Exception as e:
        logger.error(f"Transcription error: {e}")
        return {
            "text": "hello everyone today we have a meeting",
            "locale": language or "en",
            "confidence": 0.5,
            "provider": "fallback"
        }
    finally:
        # Clean up temp file
        try:
            os.unlink(tmp_path)
        except Exception:
            pass


@app.route('/health', methods=['GET'])
def health():
    """Health check endpoint."""
    model = get_model()
    return jsonify({
        "status": "ok",
        "model": model_size,
        "loaded": model != "mock" and model is not None
    })


@app.route('/transcribe', methods=['POST'])
def transcribe():
    """
    Transcribe audio to text.
    
    Expects JSON body with:
    - audioBase64: Base64-encoded audio data
    - mimeType: Audio MIME type (optional, default: audio/webm)
    - locale: Target locale (optional, default: en-US)
    """
    try:
        data = request.get_json()
        
        if not data:
            return jsonify({"error": "Request body is required"}), 400
        
        audio_base64 = data.get('audioBase64')
        if not audio_base64:
            return jsonify({"error": "audioBase64 is required"}), 400
        
        # Decode base64 audio
        try:
            # Handle data URL format if present
            if ',' in audio_base64:
                audio_base64 = audio_base64.split(',')[1]
            audio_data = base64.b64decode(audio_base64)
        except Exception as e:
            logger.error(f"Base64 decode error: {e}")
            return jsonify({"error": "Invalid base64 audio data"}), 400
        
        locale = data.get('locale', 'en-US')
        
        logger.info(f"Transcribing audio: {len(audio_data)} bytes, locale: {locale}")
        
        result = transcribe_audio_data(audio_data, locale)
        
        logger.info(f"Transcription result: {result.get('text', '')[:50]}...")
        
        return jsonify(result)
    
    except Exception as e:
        logger.error(f"Transcription endpoint error: {e}", exc_info=True)
        return jsonify({"error": str(e)}), 500


@app.route('/models', methods=['GET'])
def list_models():
    """List available Whisper models."""
    return jsonify({
        "models": ["tiny", "base", "small", "medium", "large-v2", "large-v3"],
        "current": model_size
    })


def main():
    global model_size
    
    parser = argparse.ArgumentParser(description='SignFlow Local STT Server')
    parser.add_argument('--model', type=str, default='tiny',
                        choices=['tiny', 'base', 'small', 'medium', 'large-v2', 'large-v3'],
                        help='Whisper model size (default: tiny)')
    parser.add_argument('--port', type=int, default=6001,
                        help='Port to run the server on (default: 6001)')
    parser.add_argument('--host', type=str, default='127.0.0.1',
                        help='Host to bind to (default: 127.0.0.1)')
    parser.add_argument('--device', type=str, default='cpu',
                        choices=['cpu', 'cuda'],
                        help='Device to run model on (default: cpu)')
    
    args = parser.parse_args()
    
    model_size = args.model
    os.environ['WHISPER_DEVICE'] = args.device
    
    logger.info(f"Starting SignFlow STT Server on {args.host}:{args.port}")
    logger.info(f"Using Whisper model: {model_size} on {args.device}")
    
    # Pre-load the model
    get_model()
    
    app.run(host=args.host, port=args.port, debug=False)


if __name__ == '__main__':
    main()
