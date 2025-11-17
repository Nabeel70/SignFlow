import { Router } from 'express';
import { SignPipeline } from '../services/pipeline.js';
import { GeminiClient } from '../services/geminiClient.js';

const router = Router();
const pipeline = new SignPipeline();
const geminiClient = new GeminiClient();

router.post('/transcribe', async (req, res, next) => {
  try {
    const { audioBase64, mimeType, locale } = req.body || {};
    const result = await geminiClient.transcribeAudio({ audioBase64, mimeType, locale });
    res.json(result);
  } catch (error) {
    next(error);
  }
});

router.post('/translate', async (req, res, next) => {
  try {
    const { text } = req.body || {};
    const result = await geminiClient.simplifySentence(text);
    res.json(result);
  } catch (error) {
    next(error);
  }
});

router.post('/sign-sequence', async (req, res, next) => {
  try {
    const { audioBase64, mimeType, locale, transcript } = req.body || {};
    if (audioBase64) {
      const response = await pipeline.interpretAudio({ audioBase64, mimeType, locale });
      res.json(response);
      return;
    }
    if (transcript) {
      const response = await pipeline.interpretText(transcript);
      res.json(response);
      return;
    }
    res.status(400).json({
      error: 'Provide either audioBase64 or transcript'
    });
  } catch (error) {
    next(error);
  }
});

export default router;
