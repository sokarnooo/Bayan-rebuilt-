import express from 'express';
import { loadCorpus } from './corpus/loader.ts';
import { initAyahEngine, searchAyah } from './matching/ayahMatcher.ts';
import { initHadithEngine, searchHadith, getIndexedCounts } from './matching/hadithMatcher.ts';

export const app = express();

app.use(express.json({ limit: '10mb' }));

// Warm up Engines asynchronously to ensure instant startup
let isAyahReady = false;
let isHadithReady = false;

Promise.resolve().then(() => {
  try {
    initAyahEngine();
    isAyahReady = true;
  } catch (err) {
    console.error('Failed to init Ayah Engine:', err);
  }
});

Promise.resolve().then(() => {
  try {
    initHadithEngine();
    isHadithReady = true;
  } catch (err) {
    console.error('Failed to init Hadith Engine:', err);
  }
});

export const REGISTERED_ROUTES = [
  'GET /api/health',
  'GET /api/corpus/stats',
  'POST /api/ayah/search',
  'POST /api/ayah/match',
  'POST /api/hadith/search',
  'POST /api/hadith/match',
  'POST /api/ask',
  'POST /api/ocr',
];

app.get('/api/health', (req, res) => {
  const { corpus, loadTimeMs } = loadCorpus();
  const ready = isAyahReady && isHadithReady;
  const indexedCounts = isHadithReady ? getIndexedCounts() : {
    bukhari: 0, muslim: 0, abudawud: 0, tirmidhi: 0, nasai: 0, ibnmajah: 0, nawawi: 0, totalIndexed: 0
  };

  res.json({
    status: 'ok',
    app: 'Bayan',
    ready,
    timestamp: new Date().toISOString(),
    corpusLoaded: {
      quranAyatCount: corpus.quran.ar.length,
      quranEnglishAyatCount: corpus.quran.en.length,
      hadithCollectionsCount: 7,
      hadithCounts: indexedCounts,
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

app.post('/api/hadith/search', (req, res) => {
  const query = req.body?.query || req.body?.text || '';
  const result = searchHadith(query);
  res.json(result);
});

app.post('/api/hadith/match', (req, res) => {
  const query = req.body?.query || req.body?.text || '';
  const result = searchHadith(query);
  res.json(result);
});

app.post('/api/ask', (req, res) => {
  res.json({ status: 'scaffold_ready', mode: 'ask', verdict: 'unclear' });
});

app.post('/api/ocr', (req, res) => {
  res.json({ status: 'scaffold_ready', text: '' });
});
