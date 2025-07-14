import fs from 'fs';
import pdfParse from 'pdf-parse/lib/pdf-parse.js';
import mammoth from 'mammoth';

export async function extractTextFromFile(filePath, ext) {
  ext = ext.toLowerCase();

  if (ext === 'pdf') {
    const buffer = fs.readFileSync(filePath);
    const data = await pdfParse(buffer);
    return data.text;
  }
  if (ext === 'docx') {
    const buffer = fs.readFileSync(filePath);
    const result = await mammoth.extractRawText({ buffer });
    return result.value;
  }
  if (ext === 'txt') {
    return fs.readFileSync(filePath, 'utf8');
  }

  throw new Error('Unsupported file type — only .pdf, .docx, .txt allowed');
}
