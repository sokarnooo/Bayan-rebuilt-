import { loadCorpus } from '../server/corpus/loader.ts';
import { initHadithEngine } from '../server/matching/hadithMatcher.ts';
import { initAyahEngine } from '../server/matching/ayahMatcher.ts';

if (global.gc) global.gc();

console.log('--- Initial memory before init ---');
console.log('RSS:', Math.round(process.memoryUsage().rss / 1024 / 1024), 'MB');
console.log('HeapUsed:', Math.round(process.memoryUsage().heapUsed / 1024 / 1024), 'MB');

const { corpus } = loadCorpus();
if (global.gc) global.gc();
console.log('--- After loadCorpus ---');
console.log('RSS:', Math.round(process.memoryUsage().rss / 1024 / 1024), 'MB');
console.log('HeapUsed:', Math.round(process.memoryUsage().heapUsed / 1024 / 1024), 'MB');

initHadithEngine();
if (global.gc) global.gc();
console.log('--- After initHadithEngine ---');
console.log('RSS:', Math.round(process.memoryUsage().rss / 1024 / 1024), 'MB');
console.log('HeapUsed:', Math.round(process.memoryUsage().heapUsed / 1024 / 1024), 'MB');

initAyahEngine();
if (global.gc) global.gc();
console.log('--- After initAyahEngine ---');
console.log('RSS:', Math.round(process.memoryUsage().rss / 1024 / 1024), 'MB');
console.log('HeapUsed:', Math.round(process.memoryUsage().heapUsed / 1024 / 1024), 'MB');
