import { QdrantClient } from '@qdrant/js-client-rest';
import { createRequire } from 'module';
import { config } from '../config.js';
import { logger } from '../logger.js';

const require = createRequire(import.meta.url);
const signs = require('../../data/signGlosses.json');

const hasQdrant = Boolean(config.qdrant.url);
const qdrant =
  hasQdrant &&
  new QdrantClient({
    url: config.qdrant.url,
    apiKey: config.qdrant.apiKey || undefined
  });

function cosineSimilarity(vecA = [], vecB = []) {
  const length = Math.min(vecA.length, vecB.length);
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < length; i += 1) {
    dot += vecA[i] * vecB[i];
    normA += vecA[i] ** 2;
    normB += vecB[i] ** 2;
  }
  if (!normA || !normB) {
    return 0;
  }
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

export class SignRepository {
  constructor() {
    this.dataset = signs;
  }

  async searchByKeywords(keywords = [], topK = 5) {
    if (!keywords.length) {
      return [];
    }
    if (hasQdrant) {
      try {
        const payloads = await Promise.all(
          keywords.map((keyword) =>
            qdrant.search(config.qdrant.collection, {
              vector: keywordToVector(keyword),
              limit: topK,
              with_payload: true
            })
          )
        );
        return mergeQdrantResponses(payloads, topK);
      } catch (error) {
        logger.warn({ err: error }, 'Qdrant search failed; falling back to local dataset');
      }
    }
    return this.fallbackSearch(keywords, topK);
  }

  fallbackSearch(keywords, topK) {
    const keywordSet = new Set(keywords.map((kw) => kw.toLowerCase()));
    const scored = this.dataset.map((sign) => {
      const overlap = sign.keywords.filter((kw) => keywordSet.has(kw)).length;
      const topicBoost = sign.topics.some((topic) => keywordSet.has(topic)) ? 0.15 : 0;
      const vectorScore = cosineSimilarity(
        keywordToVector([...keywordSet][0] || ''),
        sign.embedding || []
      );
      const totalScore = overlap * 0.7 + topicBoost + vectorScore * 0.3;
      return { sign, score: totalScore };
    });
    return scored
      .filter((entry) => entry.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, topK)
      .map((entry) => ({
        id: entry.sign.id,
        gloss: entry.sign.gloss,
        videoFile: entry.sign.videoFile,
        thumbnail: entry.sign.thumbnail,
        durationMs: entry.sign.durationMs,
        score: entry.score
      }));
  }

  getSignByGloss(gloss = '') {
    const normalized = gloss.toUpperCase();
    return (
      this.dataset.find(
        (sign) => sign.gloss === normalized || sign.id === normalized.toLowerCase()
      ) || null
    );
  }
}

function keywordToVector(keyword = '') {
  const normalized = keyword.toLowerCase();
  return [normalized.length / 10, normalized.charCodeAt(0) / 255, normalized.includes('ing') ? 1 : 0];
}

function mergeQdrantResponses(responses, topK) {
  const aggregated = new Map();
  responses.forEach((entries) => {
    entries.forEach((entry) => {
      const id = entry.payload?.id || entry.id;
      const current = aggregated.get(id) || { ...entry.payload, score: 0 };
      current.score = Math.max(current.score, entry.score ?? 0);
      aggregated.set(id, current);
    });
  });
  return Array.from(aggregated.values())
    .sort((a, b) => (b.score ?? 0) - (a.score ?? 0))
    .slice(0, topK)
    .map((item) => ({
      id: item.id,
      gloss: item.gloss,
      videoFile: item.videoFile,
      thumbnail: item.thumbnail,
      durationMs: item.durationMs,
      score: item.score ?? 0.5
    }));
}
