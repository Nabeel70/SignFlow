/* eslint-disable no-console */
import path from 'path';
import fs from 'fs';
import url from 'url';
import admin from 'firebase-admin';
import dotenv from 'dotenv';

dotenv.config();

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '..', '..');
const assetsDir = path.resolve(projectRoot, 'assets', 'signs');

if (!process.env.GOOGLE_APPLICATION_CREDENTIALS) {
  throw new Error('GOOGLE_APPLICATION_CREDENTIALS is not set.');
}
if (!process.env.SIGNFLOW_BUCKET) {
  throw new Error('SIGNFLOW_BUCKET is not set.');
}

const serviceAccountPath = path.resolve(__dirname, '..', 'firebase-service-account.json');
const serviceAccount = JSON.parse(fs.readFileSync(serviceAccountPath, 'utf-8'));

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    storageBucket: process.env.SIGNFLOW_BUCKET
  });
}

async function main() {
  const bucket = admin.storage().bucket();
  const files = fs.readdirSync(assetsDir).filter((file) => file.endsWith('.webm'));

  console.log(`Uploading ${files.length} assets to Firebase Storage...`);
  for (const fileName of files) {
    const localPath = path.join(assetsDir, fileName);
    const destination = `signs/${fileName}`;
    await bucket.upload(localPath, {
      destination,
      contentType: 'video/webm',
      gzip: true,
      metadata: {
        cacheControl: 'public, max-age=31536000'
      }
    });
    const remoteFile = bucket.file(destination);
    await remoteFile.makePublic();
    console.log(`✅ Uploaded ${fileName}`);
  }
  console.log('All assets uploaded and set to public.');
}

main().catch((error) => {
  console.error('Asset upload failed', error);
  process.exitCode = 1;
});
