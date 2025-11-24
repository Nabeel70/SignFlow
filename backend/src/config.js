import dotenv from 'dotenv';

dotenv.config();

export const config = {
  env: process.env.NODE_ENV || 'development',
  port: Number(process.env.PORT) || 5055,
  frontendOrigin: process.env.FRONTEND_ORIGIN || '*',
  localStt: {
    enabled: process.env.LOCAL_STT_ENABLED === 'true',
    url: process.env.LOCAL_STT_URL || 'http://127.0.0.1:6000',
    timeoutMs: Number(process.env.LOCAL_STT_TIMEOUT_MS) || 5000
  },
  gemini: {
    apiKey: process.env.GEMINI_API_KEY || '',
    speechModel: process.env.GEMINI_SPEECH_MODEL || 'gemini-2.0-flash',
    textModel: process.env.GEMINI_TEXT_MODEL || 'gemini-2.0-flash'
  },
  qdrant: {
    url: process.env.QDRANT_URL || '',
    apiKey: process.env.QDRANT_API_KEY || '',
    collection: process.env.QDRANT_COLLECTION || 'signflow_signs'
  },
  pipeline: {
    fallbackLocale: process.env.SIGNFLOW_LOCALE || 'en-US',
    cdnBaseUrl:
      process.env.SIGNFLOW_CDN_BASE_URL ||
      'https://storage.googleapis.com/signflow-demo/signs/'
  }
};
