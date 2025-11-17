import { config } from '../config.js';
import { logger } from '../logger.js';
import { GeminiClient } from './geminiClient.js';
import { SignRepository } from './qdrantClient.js';

export class SignPipeline {
  constructor({ geminiClient = new GeminiClient(), signRepository = new SignRepository() } = {}) {
    this.gemini = geminiClient;
    this.signRepository = signRepository;
  }

  async interpretAudio({ audioBase64, mimeType, locale }) {
    const transcriptResult = await this.gemini.transcribeAudio({ audioBase64, mimeType, locale });
    const simplified = await this.gemini.simplifySentence(transcriptResult.text);
    const mapping = await this.buildSequence({
      glossSequence: simplified.glossSequence,
      keywords: simplified.keywords
    });
    return {
      transcript: transcriptResult.text,
      locale: transcriptResult.locale,
      normalizedText: simplified.normalizedText,
      keywords: simplified.keywords,
      glossSequence: mapping.sequence,
      videos: mapping.videos,
      providers: {
        transcription: transcriptResult.provider,
        translation: simplified.provider,
        mapping: mapping.provider
      }
    };
  }

  async interpretText(text) {
    const simplified = await this.gemini.simplifySentence(text);
    const mapping = await this.buildSequence({
      glossSequence: simplified.glossSequence,
      keywords: simplified.keywords
    });
    return {
      normalizedText: simplified.normalizedText,
      keywords: simplified.keywords,
      glossSequence: mapping.sequence,
      videos: mapping.videos,
      providers: {
        translation: simplified.provider,
        mapping: mapping.provider
      }
    };
  }

  async buildSequence({ glossSequence = [], keywords = [] }) {
    const matches = await this.signRepository.searchByKeywords(
      Array.from(new Set([...keywords, ...glossSequence.map((gloss) => gloss.toLowerCase())])),
      8
    );
    const lookup = new Map(matches.map((match) => [match.gloss, match]));
    const videos = glossSequence.map((gloss) => this.resolveVideo(gloss, lookup));
    const resolvedSequence = videos.map((video) => video.gloss);
    return {
      sequence: resolvedSequence,
      videos,
      provider: lookup.size ? 'qdrant' : 'fallback'
    };
  }

  resolveVideo(gloss, lookup) {
    const existing = lookup.get(gloss) || lookup.get(gloss.toUpperCase());
    if (existing) {
      return withAssetUrls(gloss, existing);
    }
    const fallbackSign = this.signRepository.getSignByGloss(gloss);
    if (fallbackSign) {
      return withAssetUrls(gloss, fallbackSign);
    }
    logger.warn({ gloss }, 'No sign asset found, defaulting to HELLO');
    const defaultSign = this.signRepository.getSignByGloss('HELLO');
    return withAssetUrls(gloss, defaultSign);
  }
}

function withAssetUrls(requestedGloss, sign) {
  return {
    gloss: sign?.gloss || requestedGloss,
    requestedGloss,
    score: sign?.score ?? 0.4,
    videoUrl: buildAssetUrl(sign?.videoFile),
    thumbnailUrl: buildAssetUrl(sign?.thumbnail),
    durationMs: sign?.durationMs || 2000
  };
}

function buildAssetUrl(fileName) {
  if (!fileName) {
    return '';
  }
  if (fileName.startsWith('http')) {
    return fileName;
  }
  return `${config.pipeline.cdnBaseUrl}${fileName}`;
}
