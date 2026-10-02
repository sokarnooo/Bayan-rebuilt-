import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const app = express();

app.use(express.json({ limit: '10mb' }));

// Health check endpoint for Cloud Run
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    app: 'Bayan',
    timestamp: new Date().toISOString(),
  });
});

// Stubs for the 3 core modes + OCR
app.post('/api/ayah/match', (req, res) => {
  res.json({ status: 'scaffold_ready', mode: 'ayah', results: [] });
});

app.post('/api/hadith/match', (req, res) => {
  res.json({ status: 'scaffold_ready', mode: 'hadith', results: [] });
});

app.post('/api/ask', (req, res) => {
  res.json({ status: 'scaffold_ready', mode: 'ask', verdict: 'unclear' });
});

app.post('/api/ocr', (req, res) => {
  res.json({ status: 'scaffold_ready', text: '' });
});
