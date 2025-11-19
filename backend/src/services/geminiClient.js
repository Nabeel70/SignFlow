import { GoogleGenerativeAI } from '@google/generative-ai';
import { config } from '../config.js';
import { logger } from '../logger.js';
import { extractKeywords, normalizeSentence } from '../utils/text.js';

const hasApiKey = Boolean(config.gemini.apiKey);
const genAI = hasApiKey ? new GoogleGenerativeAI(config.gemini.apiKey) : null;

export class GeminiClient {
  async transcribeAudio({ audioBase64, mimeType, locale }) {
    if (!audioBase64) {
      throw new Error('audioBase64 payload missing');
    }
    
    // Try local STT first if enabled
    if (config.localSTT.enabled) {
      try {
        const localResult = await this.transcribeWithLocalSTT({ audioBase64, locale });
        return localResult;
      } catch (error) {
        logger.warn({ err: error }, 'Local STT failed, using fallback transcript');
        // Fall through to Gemini or mock
      }
    }
    
    if (!hasApiKey) {
      return this.mockTranscription(locale);
    }
    try {
      const model = genAI.getGenerativeModel({ model: config.gemini.speechModel });
      const result = await model.generateContent([
        {
          inlineData: {
            data: audioBase64,
            mimeType: mimeType || 'audio/webm'
          }
        },
        {
          text:
            'Please provide only the transcript of this meeting audio. Keep punctuation minimal.'
        }
      ]);
      const response = await result.response;
      const transcript = response.text().trim();
      return {
        text: transcript,
        locale: locale || config.pipeline.fallbackLocale,
        confidence: 0.82,
        provider: 'gemini'
      };
    } catch (error) {
      logger.warn({ err: error }, 'Gemini transcription failed, falling back to heuristic');
      return this.mockTranscription(locale);
    }
  }

  async transcribeWithLocalSTT({ audioBase64, locale }) {
    const url = `${config.localSTT.url}/transcribe`;
    
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          audioBase64,
          locale: locale || config.pipeline.fallbackLocale
        })
      });

      if (!response.ok) {
        throw new Error(`Local STT HTTP ${response.status}`);
      }

      const result = await response.json();
      return {
        text: result.text || '',
        locale: result.locale || locale || config.pipeline.fallbackLocale,
        confidence: result.confidence || 0.85,
        provider: result.provider || 'local-stt'
      };
    } catch (error) {
      logger.error({ err: error }, `Local STT request failed: ${error.message}`);
      throw error;
    }
  }

  async simplifySentence(text) {
    if (!text) {
      throw new Error('Text is required for translation');
    }
    if (!hasApiKey) {
      return this.mockSimplification(text);
    }
    try {
      const model = genAI.getGenerativeModel({ model: config.gemini.textModel });
      const prompt = `
You are preparing American Sign Language (ASL) gloss instructions.
Return a strict JSON object with keys:
{
  "normalizedText": "string",
  "keywords": ["word", "..."],
  "glossSequence": ["GLOSS", "GLOSS2"]
}
Text: """${text}"""
Keep keywords lowercase, gloss uppercase (ASL style).`;
      const result = await model.generateContent(prompt);
      const response = await result.response;
      const raw = response.text().trim();
      const parsed = parseJsonFromText(raw);
      return {
        normalizedText: parsed.normalizedText || normalizeSentence(text),
        keywords: parsed.keywords?.length ? parsed.keywords : extractKeywords(text),
        glossSequence: parsed.glossSequence?.length
          ? parsed.glossSequence
          : parsed.keywords?.map((kw) => kw.toUpperCase()) ||
            extractKeywords(text).map((kw) => kw.toUpperCase()),
        provider: 'gemini'
      };
    } catch (error) {
      logger.warn({ err: error }, 'Gemini simplify failed, using heuristic');
      return this.mockSimplification(text);
    }
  }

  mockTranscription(locale) {
    return {
      text: 'hello everyone today we have a meeting',
      locale: locale || config.pipeline.fallbackLocale,
      confidence: 0.6,
      provider: 'mock'
    };
  }

  mockSimplification(text) {
    const keywords = extractKeywords(text);
    return {
      normalizedText: normalizeSentence(text),
      keywords,
      glossSequence: keywords.map((kw) => kw.toUpperCase()),
      provider: 'fallback'
    };
  }
}

function parseJsonFromText(rawText) {
  const start = rawText.indexOf('{');
  const end = rawText.lastIndexOf('}');
  if (start === -1 || end === -1) {
    throw new Error('No JSON object found in model response');
  }
  const sliced = rawText.slice(start, end + 1);
  return JSON.parse(sliced);
}
