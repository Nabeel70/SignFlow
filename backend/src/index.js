import express from 'express';
import cors from 'cors';
import { config } from './config.js';
import { logger } from './logger.js';
import signflowRoutes from './routes/signflowRoutes.js';

const app = express();

app.use(
  cors({
    origin: config.frontendOrigin === '*' ? '*' : config.frontendOrigin.split(','),
    methods: ['GET', 'POST', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    maxAge: 86400
  })
);
app.use(express.json({ limit: '15mb' }));
app.use(express.urlencoded({ extended: false }));

app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    env: config.env,
    qdrant: Boolean(config.qdrant.url),
    gemini: Boolean(config.gemini.apiKey)
  });
});

app.use('/api/v1', signflowRoutes);

// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  logger.error({ err, path: req.path }, 'API error');
  res.status(err.status || 500).json({
    error: err.message || 'Internal Server Error'
  });
});

app.listen(config.port, () => {
  logger.info(`SignFlow backend listening on port ${config.port}`);
});
