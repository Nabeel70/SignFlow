#!/usr/bin/env python3
"""
SignFlow Local STT Server using Faster Whisper

This server provides speech-to-text transcription using the faster-whisper library.
It's designed to be a local alternative to cloud-based STT services.
"""

import argparse
import base64
import io
import sys
import traceback
from pathlib import Path

import numpy as np
import soundfile as sf
from faster_whisper import WhisperModel
from flask import Flask, jsonify, request

app = Flask(__name__)

# Global model instance
model = None
model_size = "tiny"


def init_model(size="tiny", device="cpu", compute_type="int8"):
    """Initialize the Whisper model with specified parameters."""
    global model, model_size
    model_size = size
    
    print(f"Loading faster-whisper model: {size} on {device} with {compute_type}")
    try:
        model = WhisperModel(size, device=device, compute_type=compute_type)
        print(f"Model loaded successfully: {size}")
    except Exception as e:
        print(f"Error loading model: {e}")
        traceback.print_exc()
        sys.exit(1)


def decode_audio_base64(audio_base64_str):
    """
    Decode base64 audio data and convert to numpy array.
    
    Args:
        audio_base64_str: Base64 encoded audio data
        
    Returns:
        tuple: (audio_array, sample_rate)
    """
    try:
        # Decode base64 to bytes
        audio_bytes = base64.b64decode(audio_base64_str)
        
        # Try to read audio using soundfile
        audio_data, sample_rate = sf.read(io.BytesIO(audio_bytes))
        
        # Convert to float32 numpy array if needed
        if audio_data.dtype != np.float32:
            audio_data = audio_data.astype(np.float32)
            
        # If stereo, convert to mono by averaging channels
        if len(audio_data.shape) > 1:
            audio_data = audio_data.mean(axis=1)
            
        return audio_data, sample_rate
        
    except Exception as e:
        print(f"Error decoding audio: {e}")
        traceback.print_exc()
        raise


@app.route("/health", methods=["GET"])
def health():
    """Health check endpoint."""
    return jsonify({
        "status": "ok",
        "model": model_size,
        "ready": model is not None
    })


@app.route("/transcribe", methods=["POST"])
def transcribe():
    """
    Transcribe audio from base64-encoded data.
    
    Expected JSON payload:
    {
        "audioBase64": "base64_encoded_audio_data",
        "locale": "en-US" (optional)
    }
    
    Returns:
    {
        "text": "transcribed text",
        "locale": "en-US",
        "confidence": 0.95,
        "provider": "faster-whisper"
    }
    """
    if model is None:
        return jsonify({"error": "Model not initialized"}), 500
    
    try:
        data = request.get_json()
        
        if not data:
            return jsonify({"error": "No JSON payload provided"}), 400
            
        audio_base64 = data.get("audioBase64")
        if not audio_base64:
            return jsonify({"error": "audioBase64 field is required"}), 400
        
        locale = data.get("locale", "en-US")
        
        # Decode audio
        try:
            audio_array, sample_rate = decode_audio_base64(audio_base64)
        except Exception as e:
            return jsonify({
                "error": f"Failed to decode audio: {str(e)}"
            }), 400
        
        # Transcribe using faster-whisper
        # Extract language code from locale (e.g., "en-US" -> "en")
        language = locale.split("-")[0] if locale else "en"
        
        segments, info = model.transcribe(
            audio_array,
            language=language,
            beam_size=5,
            vad_filter=True,
            vad_parameters=dict(min_silence_duration_ms=500)
        )
        
        # Collect all segments into a single transcript
        transcript_parts = []
        for segment in segments:
            transcript_parts.append(segment.text.strip())
        
        transcript = " ".join(transcript_parts).strip()
        
        # If no transcript was generated, return empty
        if not transcript:
            transcript = ""
        
        # Calculate average confidence (faster-whisper doesn't provide this directly)
        # We'll use the language probability as a proxy
        confidence = info.language_probability if hasattr(info, 'language_probability') else 0.85
        
        return jsonify({
            "text": transcript,
            "locale": locale,
            "confidence": float(confidence),
            "provider": "faster-whisper",
            "model": model_size,
            "detected_language": info.language if hasattr(info, 'language') else language
        })
        
    except Exception as e:
        print(f"Transcription error: {e}")
        traceback.print_exc()
        return jsonify({
            "error": f"Transcription failed: {str(e)}"
        }), 500


def main():
    parser = argparse.ArgumentParser(description="SignFlow Local STT Server")
    parser.add_argument(
        "--model",
        type=str,
        default="tiny",
        choices=["tiny", "base", "small", "medium", "large-v2", "large-v3"],
        help="Whisper model size to use (default: tiny)"
    )
    parser.add_argument(
        "--device",
        type=str,
        default="cpu",
        choices=["cpu", "cuda"],
        help="Device to run the model on (default: cpu)"
    )
    parser.add_argument(
        "--compute-type",
        type=str,
        default="int8",
        choices=["int8", "float16", "float32"],
        help="Compute type for the model (default: int8)"
    )
    parser.add_argument(
        "--port",
        type=int,
        default=6000,
        help="Port to run the server on (default: 6000)"
    )
    parser.add_argument(
        "--host",
        type=str,
        default="127.0.0.1",
        help="Host to bind the server to (default: 127.0.0.1)"
    )
    
    args = parser.parse_args()
    
    # Initialize model
    init_model(args.model, args.device, args.compute_type)
    
    # Run Flask server
    print(f"Starting STT server on {args.host}:{args.port}")
    app.run(host=args.host, port=args.port, debug=False)


if __name__ == "__main__":
    main()
