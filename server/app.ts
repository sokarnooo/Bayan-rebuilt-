import express from 'express';
import { loadCorpus } from './corpus/loader.ts';
import { initAyahEngine, searchAyah } from './matching/ayahMatcher.ts';
import { initHadithEngine, searchHadith, getIndexedCounts } from './matching/hadithMatcher.ts';
import { askQuestion, executeAskStage1, executeAskVerdict, getGeminiClient } from './matching/askEngine.ts';
import { quotaManager } from './quota.config.ts';

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
  'GET /api/quota',
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

app.post('/api/ocr', async (req, res) => {
  try {
    const { imageBase64, language = 'ar', userApiKey } = req.body || {};
    const clientIp =
      (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() ||
      req.socket.remoteAddress ||
      '127.0.0.1';

    if (!imageBase64) {
      res.status(400).json({ error: 'IMAGE_REQUIRED' });
      return;
    }

    const headerKey = req.headers['x-gemini-api-key'] as string;
    const userKey =
      (typeof userApiKey === 'string' && userApiKey.trim() ? userApiKey.trim() : undefined) ||
      (typeof headerKey === 'string' && headerKey.trim() ? headerKey.trim() : undefined);

    // IP Rate Limit check (skipped for user keys)
    if (!userKey) {
      const ipCheck = quotaManager.checkIpLimit(clientIp);
      if (!ipCheck.allowed) {
        res.status(429).json({
          error: 'IP_RATE_LIMIT_EXCEEDED',
          retryAfterSeconds: ipCheck.retryAfterSeconds,
          notice: quotaManager.getQuotaNotice(language === 'en' ? 'en' : 'ar'),
        });
        return;
      }
    }

    const apiKey = userKey || process.env.GEMINI_API_KEY;
    if (!apiKey) {
      res.status(503).json({
        error: 'NO_API_KEY',
        notice: quotaManager.getQuotaNotice(language === 'en' ? 'en' : 'ar'),
      });
      return;
    }

    let modelToUse: string | null = null;
    let retryAfter = 0;

    if (userKey) {
      modelToUse = 'gemini-2.5-flash';
    } else {
      const acq = quotaManager.acquireModel('ocr');
      modelToUse = acq.model;
      retryAfter = acq.retryAfterSeconds;
    }

    if (!modelToUse) {
      res.status(429).json({
        error: 'QUOTA_EXHAUSTED',
        retryAfterSeconds: retryAfter,
        notice: quotaManager.getQuotaNotice(language === 'en' ? 'en' : 'ar'),
      });
      return;
    }

    const ai = getGeminiClient(userKey);
    let mimeType = 'image/jpeg';
    let base64Data = imageBase64;
    const match = imageBase64.match(/^data:([^;]+);base64,(.+)$/);
    if (match) {
      mimeType = match[1];
      base64Data = match[2];
    }

    const prompt =
      language === 'en'
        ? 'Extract all readable scripture, verse, or hadith text from this image. Return ONLY the plain extracted text without commentary, markdown code blocks, or greetings.'
        : 'استخرج النص العربي المقروء من هذه الصورة (آية قرآنية أو حديث نبوي). أخرج فقط النص المستخرج نقياً دون مقدمات أو شروحات أو علامات كود.';

    try {
      const response = await ai.models.generateContent({
        model: modelToUse,
        contents: [
          {
            role: 'user',
            parts: [
              { text: prompt },
              {
                inlineData: {
                  mimeType,
                  data: base64Data,
                },
              },
            ],
          },
        ],
      });

      const extractedText = response.text?.trim() || '';
      if (!userKey) {
        quotaManager.recordIpUsage(clientIp);
      }
      res.json({ text: extractedText });
    } catch (err: any) {
      if (!userKey && modelToUse) {
        const is429or503 =
          err?.status === 429 ||
          err?.status === 503 ||
          err?.message?.includes('429') ||
          err?.message?.includes('503');
        if (is429or503) {
          quotaManager.markModelUnavailable(modelToUse);
        }
      }

      // Failover to secondary model in OCR chain
      if (!userKey) {
        const acq2 = quotaManager.acquireModel('ocr');
        if (acq2.model) {
          try {
            const res2 = await ai.models.generateContent({
              model: acq2.model,
              contents: [
                {
                  role: 'user',
                  parts: [
                    { text: prompt },
                    {
                      inlineData: {
                        mimeType,
                        data: base64Data,
                      },
                    },
                  ],
                },
              ],
            });
            quotaManager.recordIpUsage(clientIp);
            res.json({ text: res2.text?.trim() || '' });
            return;
          } catch {
            // failover failed
          }
        }
      }

      res.status(500).json({
        error: 'OCR_PROCESSING_FAILED',
        notice: quotaManager.getQuotaNotice(language === 'en' ? 'en' : 'ar'),
      });
    }
  } catch (outerErr: any) {
    res.status(500).json({ error: 'SERVER_ERROR' });
  }
});

app.get('/api/quota', (req, res) => {
  const stats = quotaManager.getReportStats();
  const remainingOcr = quotaManager.getTotalRemainingForAction('ocr');
  const remainingAsk = quotaManager.getTotalRemainingForAction('ask_call2');
  res.json({
    remainingOcr,
    remainingAsk,
    resetMinutes: stats.minutesRemainingInHour,
    retryAfterSeconds: stats.retryAfterSeconds,
    models: stats.models,
    actionCounters: stats.actionCounters,
  });
});

