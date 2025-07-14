import dotenv from 'dotenv';
dotenv.config();

import express from 'express';
import multer from 'multer';
import fs from 'fs';
import path from 'path';
import bodyParser from 'body-parser';
import { extractTextFromFile } from './extractors.js';
import { chunkText } from './chunker.js';
import { embedAndStoreChunks, embedQueryAndSearch, answerWithGPT } from './embedder.js';

const app = express();
const docsDir = './docs';
if (!fs.existsSync(docsDir)) fs.mkdirSync(docsDir);

app.use(express.static('public'));

// Multer storage: keeps original name & extension
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, docsDir),
  filename: (req, file, cb) => {
    const original = file.originalname;
    cb(null, original);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 50 * 1024 * 1024 } // 50 MB limit
});

app.post('/upload', (req, res) => {
  req.setTimeout(0);
  upload.single('file')(req, res, async err => {
    if (err instanceof multer.MulterError) {
      return res.status(400).json({ error: 'Multer error: ' + err.message });
    }
    if (err) {
      return res.status(500).json({ error: 'Upload failed: ' + err.message });
    }
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const { path: filePath, originalname } = req.file;
    console.log('Saved file as:', originalname);

    const ext = path.extname(originalname).slice(1); // e.g. "pdf"

    try {
      const text = await extractTextFromFile(filePath, ext);
      const chunks = chunkText(text);
      await embedAndStoreChunks(chunks, { source: originalname });
      return res.json({ message: `${originalname} uploaded & embedded.` });
    } catch (e) {
      console.error('Processing error:', e);
      return res.status(500).json({ error: 'Processing error: ' + e.message });
    }
  });
});

app.use(bodyParser.json());

app.post('/chat', async (req, res) => {
  try {
    const { question } = req.body;
    if (!question) return res.status(400).json({ error: 'Question is required' });
    const context = await embedQueryAndSearch(question);
    const answer = await answerWithGPT(question, context);
    return res.json({ answer });
  } catch (e) {
    console.error('Chat error:', e);
    return res.status(500).json({ error: 'Chat error: ' + e.message });
  }
});

app.listen(3000, () => console.log('Server running on http://localhost:3000'));
