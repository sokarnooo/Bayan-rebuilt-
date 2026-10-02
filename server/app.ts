import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { loadCorpus } from './corpus/loader.ts';

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

// Corpus status & statistics
app.get('/api/corpus/stats', (req, res) => {
  const { corpus, loadTimeMs } = loadCorpus();
  res.json({
    status: 'ready',
    loadTimeMs,
    counts: {
      quran: {
        ar: corpus.quran.ar.length,
        en: corpus.quran.en.length,
      },
      hadith: {
        bukhari: { ar: corpus.hadith.ar.bukhari.length, en: corpus.hadith.en.bukhari.length },
        muslim: { ar: corpus.hadith.ar.muslim.length, en: corpus.hadith.en.muslim.length },
        abudawud: { ar: corpus.hadith.ar.abudawud.length, en: corpus.hadith.en.abudawud.length },
        tirmidhi: { ar: corpus.hadith.ar.tirmidhi.length, en: corpus.hadith.en.tirmidhi.length },
        nasai: { ar: corpus.hadith.ar.nasai.length, en: corpus.hadith.en.nasai.length },
        ibnmajah: { ar: corpus.hadith.ar.ibnmajah.length, en: corpus.hadith.en.ibnmajah.length },
        nawawi: { ar: corpus.hadith.ar.nawawi.length, en: corpus.hadith.en.nawawi.length },
      },
    },
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
