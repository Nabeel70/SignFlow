/* eslint-disable no-console */
import path from 'path';
import url from 'url';
import fs from 'fs';
import dotenv from 'dotenv';
import { QdrantClient } from '@qdrant/js-client-rest';

dotenv.config();

if (!process.env.QDRANT_URL || !process.env.QDRANT_API_KEY) {
    throw new Error('QDRANT_URL and QDRANT_API_KEY must be set.');
}

const collectionName = process.env.QDRANT_COLLECTION || 'signflow_signs';
const __dirname = path.dirname(url.fileURLToPath(
    import.meta.url));
const datasetPath = path.resolve(__dirname, '..', 'data', 'signGlosses.json');
const dataset = JSON.parse(fs.readFileSync(datasetPath, 'utf-8'));
const vectorSize = dataset[0] ? .embedding ? .length || 3;

const client = new QdrantClient({
    url: process.env.QDRANT_URL,
    apiKey: process.env.QDRANT_API_KEY
});

async function ensureCollection() {
    try {
        await client.getCollection(collectionName);
        console.log(`Collection ${collectionName} already exists.`);
        return;
    } catch (error) {
        const status = error ? .status || error ? .response ? .status;
        if (status !== 404) {
            throw error;
        }
    }

    console.log(`Creating collection ${collectionName} (vector size ${vectorSize})...`);
    await client.createCollection(collectionName, {
        vectors: {
            size: vectorSize,
            distance: 'Cosine'
        }
    });
}

async function importDataset() {
    const points = dataset.map((sign, idx) => ({
        id: idx + 1,
        vector: sign.embedding,
        payload: {
            id: sign.id,
            gloss: sign.gloss,
            keywords: sign.keywords,
            topics: sign.topics,
            videoFile: sign.videoFile,
            thumbnail: sign.thumbnail,
            durationMs: sign.durationMs
        }
    }));
    console.log(`Upserting ${points.length} sign payloads...`);
    await client.upsert(collectionName, { wait: true, points });
    console.log('Qdrant sync complete.');
}

ensureCollection()
    .then(importDataset)
    .catch((error) => {
        console.error('Failed to sync Qdrant', error);
        process.exitCode = 1;
    });