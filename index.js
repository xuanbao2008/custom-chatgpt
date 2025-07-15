import dotenv from "dotenv";
dotenv.config();

import express from "express";
import multer from "multer";
import fs from "fs";
import path from "path";
import bodyParser from "body-parser";
import { v4 as uuidv4 } from "uuid";

import {
  ensureCollection,
  embedAndStoreChunks,
  answerWithRagAndFallback
} from "./embedder.js";
import { extractTextFromFile } from "./extractors.js";
import { chunkText } from "./chunker.js";

const app = express();
const docsDir = "./docs";
if (!fs.existsSync(docsDir)) fs.mkdirSync(docsDir);

await ensureCollection();

app.use(express.static("public"));
app.use(bodyParser.json());

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, docsDir),
  filename: (_req, file, cb) => cb(null, file.originalname)
});

const upload = multer({
  storage,
  limits: { fileSize: 50 * 1024 * 1024 } // 50 MB
});

app.post("/upload-multiple", (req, res) => {
  req.setTimeout(0);
  upload.array("files")(req, res, async err => {
    if (err) return res.status(400).json({ error: err.message });
    if (!req.files?.length) return res.status(400).json({ error: "No files uploaded" });

    let totalChunks = 0;
    for (const file of req.files) {
      const ext = path.extname(file.originalname).slice(1);
      try {
        const text = await extractTextFromFile(
          path.join(docsDir, file.originalname),
          ext
        );
        const chunks = chunkText(text);
        await embedAndStoreChunks(chunks, { source: file.originalname });
        totalChunks += chunks.length;
      } catch (e) {
        console.error(`Error processing ${file.originalname}:`, e);
      }
    }

    res.json({
      message: `Uploaded and embedded ${req.files.length} files (~${totalChunks} chunks).`
    });
  });
});

app.post("/chat", async (req, res) => {
  const { question, sessionId } = req.body;
  if (!question?.trim()) return res.status(400).json({ error: "Question is required." });

  try {
    const sid = sessionId || uuidv4();
    const { answer, source } = await answerWithRagAndFallback(sid, question);
    res.json({ answer, source, sessionId: sid });
  } catch (e) {
    console.error("Chat Error:", e);
    res.status(500).json({ error: "Internal error: " + e.message });
  }
});

app.listen(3000, () => console.log("Chatbot server running at http://localhost:3000"));
