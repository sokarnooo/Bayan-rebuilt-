import { loadCorpus } from '../server/corpus/loader.ts';
import { initHadithEngine } from '../server/matching/hadithMatcher.ts';
import { initAyahEngine } from '../server/matching/ayahMatcher.ts';

const { corpus } = loadCorpus();
initHadithEngine();
initAyahEngine();

if (global.gc) global.gc();

function approxStringBytes(str: string): number {
  return str ? str.length * 2 : 0;
}

// 1. Arabic hadith text
let arabicHadithTextBytes = 0;
let arabicHadithCount = 0;
for (const col of Object.keys(corpus.hadith.ar)) {
  const list = (corpus.hadith.ar as any)[col] || [];
  for (const h of list) {
    arabicHadithTextBytes += approxStringBytes(h.text);
    arabicHadithCount++;
  }
}

// 2. English text (check if loaded or proxy)
let englishTextBytes = 0;
// We check if English hadith is loaded
const englishCols = ['bukhari', 'muslim', 'abudawud', 'tirmidhi', 'nasai', 'ibnmajah', 'nawawi'];
// Note: corpus.hadith.en is a proxy; let's check its internal cache if any
for (const col of englishCols) {
  // If we don't access corpus.hadith.en[col], it's not loaded
}

// 3. Quran text & structures
let quranArabicTextBytes = 0;
for (const v of corpus.quran.ar) {
  quranArabicTextBytes += approxStringBytes(v.text);
}

const memory = process.memoryUsage();

console.log('====================================');
console.log('HEAP BREAKDOWN BY STRUCTURE:');
console.log('------------------------------------');
console.log('Arabic Hadith Raw Text (34,195 records):', (arabicHadithTextBytes / 1024 / 1024).toFixed(2), 'MB');
console.log('English Corpora Text (at startup):', (englishTextBytes / 1024 / 1024).toFixed(2), 'MB (lazy)');
console.log('Quran Arabic Text (6,236 ayat):', (quranArabicTextBytes / 1024 / 1024).toFixed(2), 'MB');
console.log('Heap Used Total:', (memory.heapUsed / 1024 / 1024).toFixed(2), 'MB');
console.log('Heap Total:', (memory.heapTotal / 1024 / 1024).toFixed(2), 'MB');
console.log('Process RSS:', (memory.rss / 1024 / 1024).toFixed(2), 'MB');
console.log('====================================');
