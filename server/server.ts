import express from 'express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createServer as createViteServer } from 'vite';
import { app, REGISTERED_ROUTES } from './app.ts';
import { loadCorpus, DATA_DIR } from './corpus/loader.ts';
import { runPrebuild } from './corpus/prebuild.ts';
import { initHadithEngine, getIndexedCounts } from './matching/hadithMatcher.ts';
import { initAyahEngine } from './matching/ayahMatcher.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;

async function startServer() {
  const distPath = path.resolve(__dirname, '../dist');
  const hasDist = fs.existsSync(distPath);
  const isProd = process.env.NODE_ENV === 'production';

  if (!isProd) {
    const vite = await createViteServer({
      server: { middlewareMode: true, host: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else if (hasDist) {
    app.use(express.static(distPath));
    app.get('*', (req, res, next) => {
      if (req.path.startsWith('/api')) return next();
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  // Initialize Engines
  console.log('Initializing Search Engines...');
  const corpusDir = DATA_DIR;
  const quranArFile = path.join(corpusDir, 'quran_ar.json');
  if (!fs.existsSync(quranArFile)) {
    console.log('Corpus data missing, running prebuild data acquisition...');
    await runPrebuild();
  }
  const { corpus, loadTimeMs: corpusTime } = loadCorpus();
  const { totalIndexed: hadithCount, indexMemoryBytes: hadithMem } = initHadithEngine();
  const { totalIndexed: ayahCount } = initAyahEngine();
  const counts = getIndexedCounts();

  if (global.gc) {
    global.gc();
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`====================================================`);
    console.log(`Bayan Server listening on http://0.0.0.0:${PORT}`);
    console.log(`Environment: ${isProd ? 'PRODUCTION' : 'DEVELOPMENT'}`);
    console.log(`Corpus Loaded in ${corpusTime}ms`);
    console.log(`Hadith Engine: ${hadithCount} records indexed (${Math.round(hadithMem/1024)}KB memory map)`);
    console.log(`Ayah Engine: ${ayahCount} records indexed`);
    console.log(`Registered API Routes:`);
    REGISTERED_ROUTES.forEach((r) => console.log(`  [x] ${r}`));
    console.log(`====================================================`);
  });
}

startServer().catch((err) => {
  console.error('Fatal error starting server:', err);
  process.exit(1);
});
