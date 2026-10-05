import express from 'express';
import { loadCorpus } from './corpus/loader.ts';
import { initAyahEngine, searchAyah } from './matching/ayahMatcher.ts';
import { initHadithEngine, searchHadith, getIndexedCounts } from './matching/hadithMatcher.ts';
import { askQuestion, executeAskStage1, executeAskVerdict } from './matching/askEngine.ts';

export const app = express();

app.use(express.json({ limit: '10mb' }));

let requestCounter = 0;
app.use((req, res, next) => {
  res.on('finish', () => {
    requestCounter++;
    if (requestCounter % 20 === 0 && global.gc) {
      global.gc();
    }
  });
  next();
});

export function getEngineReadiness() {
  const h = initHadithEngine();
  const a = initAyahEngine();
  return {
    ayahReady: true,
    hadithReady: true,
    hadithCounts: getIndexedCounts(),
    hadithMem: h.indexMemoryBytes,
  };
}

export const REGISTERED_ROUTES = [
  'GET /api/health',
  'GET /api/corpus/stats',
  'POST /api/ayah/search',
  'POST /api/ayah/match',
  'POST /api/hadith/search',
  'POST /api/hadith/match',
  'POST /api/ask',
  'POST /api/ask/verdict',
  'POST /api/ocr',
];

app.get('/api/health', (req, res) => {
  const { corpus, loadTimeMs } = loadCorpus();
  const readiness = getEngineReadiness();

  res.json({
    status: 'ok',
    app: 'Bayan',
    ready: true,
    timestamp: new Date().toISOString(),
    corpusLoaded: {
      quranAyatCount: corpus.quran.ar.length,
      quranEnglishAyatCount: 6236,
      hadithCollectionsCount: 7,
      hadithCounts: readiness.hadithCounts,
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
        en: 6236,
      },
      hadith: {
        bukhari: { ar: corpus.hadith.ar.bukhari.length, en: 7580 },
        muslim: { ar: corpus.hadith.ar.muslim.length, en: 7360 },
        abudawud: { ar: corpus.hadith.ar.abudawud.length, en: 5272 },
        tirmidhi: { ar: corpus.hadith.ar.tirmidhi.length, en: 3924 },
        nasai: { ar: corpus.hadith.ar.nasai.length, en: 5679 },
        ibnmajah: { ar: corpus.hadith.ar.ibnmajah.length, en: 4338 },
        nawawi: { ar: corpus.hadith.ar.nawawi.length, en: 42 },
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
  if (result.language === 'en' && global.gc) {
    global.gc();
  }
  res.json(result);
});

app.post('/api/hadith/match', (req, res) => {
  const query = req.body?.query || req.body?.text || '';
  const result = searchHadith(query);
  if (result.language === 'en' && global.gc) {
    global.gc();
  }
  res.json(result);
});

app.post('/api/ask', async (req, res) => {
  try {
    const clientIp =
      (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() ||
      req.socket.remoteAddress ||
      '127.0.0.1';
    const result = await executeAskStage1(req.body || {}, clientIp);
    if (result.error && result.error.includes('تم تجاوز الحد المسموح به')) {
      res.status(429).json(result);
      return;
    }
    if (result.error && result.error.includes('GEMINI_API_KEY')) {
      res.status(503).json(result);
      return;
    }
    res.json(result);
  } catch (err: any) {
    res.status(500).json({
      error: 'حدث خطأ أثناء معالجة السؤال الشرعي.',
      details: err?.message,
    });
  }
});

app.post('/api/ask/verdict', async (req, res) => {
  try {
    const result = await executeAskVerdict(req.body || {});
    res.json(result);
  } catch (err: any) {
    res.status(500).json({
      error: 'حدث خطأ أثناء إعداد ملخص الاستدلال.',
      details: err?.message,
    });
  }
});

app.post('/api/ocr', (req, res) => {
  res.json({ status: 'scaffold_ready', text: '' });
});
