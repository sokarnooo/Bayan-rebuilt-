import express from 'express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createServer as createViteServer } from 'vite';
import { app, REGISTERED_ROUTES } from './app.ts';
import { loadCorpus } from './corpus/loader.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PORT = parseInt(process.env.PORT || '3000', 10);

async function startServer() {
  const distPath = path.resolve(__dirname, '../dist');
  const hasDist = fs.existsSync(distPath);
  const isProd = process.env.NODE_ENV === 'production' || hasDist;

  if (!isProd) {
    const vite = await createViteServer({
      server: { middlewareMode: true, host: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(distPath));
    app.get('*', (req, res, next) => {
      if (req.path.startsWith('/api')) return next();
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  const { corpus, loadTimeMs } = loadCorpus();

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`====================================================`);
    console.log(`Bayan Server listening on http://0.0.0.0:${PORT}`);
    console.log(`Environment: ${isProd ? 'PRODUCTION (Static + API)' : 'DEVELOPMENT (Vite Middleware + API)'}`);
    console.log(`Corpus Loaded in ${loadTimeMs}ms:`);
    console.log(`  - Quran Arabic Ayat: ${corpus.quran.ar.length}`);
    console.log(`  - Quran English Ayat: ${corpus.quran.en.length}`);
    console.log(`  - Hadith Bukhari (AR/EN): ${corpus.hadith.ar.bukhari.length} / ${corpus.hadith.en.bukhari.length}`);
    console.log(`Registered API Routes:`);
    REGISTERED_ROUTES.forEach((r) => console.log(`  [x] ${r}`));
    console.log(`====================================================`);
  });
}

startServer().catch((err) => {
  console.error('Fatal error starting server:', err);
  process.exit(1);
});
