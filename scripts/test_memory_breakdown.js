import { app } from '../server/app.ts';
import { loadCorpus } from '../server/corpus/loader.ts';
import { initHadithEngine } from '../server/matching/hadithMatcher.ts';
import { initAyahEngine } from '../server/matching/ayahMatcher.ts';

function printMem(tag) {
  if (global.gc) global.gc();
  const m = process.memoryUsage();
  console.log(`[${tag}] RSS: ${Math.round(m.rss / 1024 / 1024)}MB | HeapUsed: ${Math.round(m.heapUsed / 1024 / 1024)}MB | HeapTotal: ${Math.round(m.heapTotal / 1024 / 1024)}MB | External: ${Math.round(m.external / 1024 / 1024)}MB`);
}

printMem('Start');
const { corpus } = loadCorpus();
printMem('After loadCorpus');
initHadithEngine();
printMem('After initHadithEngine');
initAyahEngine();
printMem('After initAyahEngine');

if (global.gc) {
  global.gc();
  global.gc();
}
printMem('Final after double GC');
