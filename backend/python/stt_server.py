#!/usr/bin/env python3
"""
Flask-based Speech-to-Text server using faster-whisper.
Accepts audio data (base64 encoded) and returns transcription.

Note: This server requires the Whisper model to be pre-downloaded.
On first run, it will attempt to download the model from Hugging Face.
"""

import argparse
import base64
import io
import os
import tempfile
from flask import Flask, request, jsonify
from flask_cors import CORS

app = Flask(__name__)
CORS(app)

# Global model instance
model = None
model_size = "tiny"
model_initialized = False


def init_model(size="tiny", device="cpu", compute_type="int8"):
    """Initialize the Whisper model."""
    global model, model_size, model_initialized
    model_size = size
    print(f"Loading Whisper model: {size}")
    
    try:
        from faster_whisper import WhisperModel
        model = WhisperModel(size, device=device, compute_type=compute_type)
        model_initialized = True
        print(f"Model loaded successfully")
    except Exception as e:
        print(f"WARNING: Failed to load Whisper model: {e}")
        print("The server will run but transcription will not work.")
        print("Please ensure you have internet connectivity for the first run to download the model.")
        model_initialized = False


@app.route("/health", methods=["GET"])
def health():
    """Health check endpoint."""
    return jsonify({
        "status": "healthy" if model_initialized else "degraded",
        "model": model_size,
        "ready": model_initialized
    })


@app.route("/transcribe", methods=["POST"])
def transcribe():
    """
    Transcribe audio from base64-encoded data.
    
    Expected JSON payload:
    {
        "audioBase64": "base64_encoded_audio_data",
        "mimeType": "audio/webm" (optional),
        "locale": "en-US" (optional)
    }
    
    Returns:
    {
        "text": "transcribed text",
        "locale": "en-US",
        "confidence": 0.85,
        "provider": "whisper"
    }
    """
    try:
        if not model_initialized or not model:
            return jsonify({
                "error": "Whisper model not initialized. Please check server logs and ensure the model can be downloaded."
            }), 503
        
        data = request.get_json()
        
        if not data:
            return jsonify({
                "error": "No JSON payload provided"
            }), 400
        
        audio_base64 = data.get("audioBase64")
        if not audio_base64:
            return jsonify({
                "error": "audioBase64 field is required"
            }), 400
        
        locale = data.get("locale", "en-US")
        
        # Decode base64 audio
        try:
            audio_bytes = base64.b64decode(audio_base64)
        except Exception as e:
            return jsonify({
                "error": f"Failed to decode base64 audio: {str(e)}"
            }), 400
        
        # Save to temporary file (Whisper requires a file path)
        with tempfile.NamedTemporaryFile(suffix=".webm", delete=False) as tmp_file:
            tmp_file.write(audio_bytes)
            tmp_path = tmp_file.name
        
        try:
            # Transcribe
            segments, info = model.transcribe(
                tmp_path,
                language="en",
                beam_size=5,
                vad_filter=True,
                vad_parameters=dict(min_silence_duration_ms=500)
            )
            
            # Collect all segments
            transcript_parts = []
            for segment in segments:
                transcript_parts.append(segment.text.strip())
            
            transcript = " ".join(transcript_parts).strip()
            
            # Calculate average confidence if available
            confidence = 0.85  # Default confidence
            
            return jsonify({
                "text": transcript,
                "locale": locale,
                "confidence": confidence,
                "provider": "whisper"
            })
        
        finally:
            # Clean up temporary file
            try:
                os.unlink(tmp_path)
            except:
                pass
    
    except Exception as e:
        print(f"Error in transcribe endpoint: {str(e)}")
        import traceback
        traceback.print_exc()
        return jsonify({
            "error": f"Transcription failed: {str(e)}"
        }), 500


def main():
    parser = argparse.ArgumentParser(description="Whisper STT Server")
    parser.add_argument(
        "--model",
        type=str,
        default="tiny",
        choices=["tiny", "base", "small", "medium", "large"],
        help="Whisper model size"
    )
    parser.add_argument(
        "--port",
        type=int,
        default=6000,
        help="Port to run the server on"
    )
    parser.add_argument(
        "--host",
        type=str,
        default="127.0.0.1",
        help="Host to bind to"
    )
    parser.add_argument(
        "--device",
        type=str,
        default="cpu",
        choices=["cpu", "cuda"],
        help="Device to run model on"
    )
    parser.add_argument(
        "--compute-type",
        type=str,
        default="int8",
        choices=["int8", "float16", "float32"],
        help="Compute type for the model"
    )
    
    args = parser.parse_args()
    
    # Initialize model
    init_model(
        size=args.model,
        device=args.device,
        compute_type=args.compute_type
    )
    
    # Run server even if model failed to load (for debugging)
    print(f"Starting STT server on {args.host}:{args.port}")
    if not model_initialized:
        print("WARNING: Server is running but model is not loaded!")
        print("Transcription requests will fail until the model is properly initialized.")
    
    app.run(host=args.host, port=args.port, debug=False)


if __name__ == "__main__":
    main()
