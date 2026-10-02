import express from 'express';
import { loadCorpus } from './corpus/loader.ts';
import { initAyahEngine, searchAyah } from './matching/ayahMatcher.ts';

export const app = express();

app.use(express.json({ limit: '10mb' }));

// Warm up Ayah Engine
initAyahEngine();

export const REGISTERED_ROUTES = [
  'GET /api/health',
  'GET /api/corpus/stats',
  'POST /api/ayah/search',
  'POST /api/ayah/match',
  'POST /api/hadith/match',
  'POST /api/ask',
  'POST /api/ocr',
];

app.get('/api/health', (req, res) => {
  const { corpus, loadTimeMs } = loadCorpus();
  res.json({
    status: 'ok',
    app: 'Bayan',
    timestamp: new Date().toISOString(),
    corpusLoaded: {
      quranAyatCount: corpus.quran.ar.length,
      quranEnglishAyatCount: corpus.quran.en.length,
      hadithCollectionsCount: 7,
      loadTimeMs,
    },
    registeredRoutes: REGISTERED_ROUTES,
  });
});

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

// Ayah matching endpoint
app.post('/api/ayah/search', (req, res) => {
  const query = req.body?.query || req.body?.text || '';
  const result = searchAyah(query);
  res.json(result);
});

app.post('/api/ayah/match', (req, res) => {
  const query = req.body?.query || req.body?.text || '';
  const result = searchAyah(query);
  res.json(result);
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
