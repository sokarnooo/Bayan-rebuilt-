import fs from 'fs';
import { searchHadith, initHadithEngine } from '../server/matching/hadithMatcher.ts';
import { loadCorpus } from '../server/corpus/loader.ts';
import { normalizeArabic } from '../server/matching/normalizer.ts';

initHadithEngine();
const { corpus } = loadCorpus();

const cases = JSON.parse(fs.readFileSync('eval/cases.json', 'utf8'));
const c4 = cases.find((c: any) => c.id === 'hadith_isnad_4');

console.log("Input:", c4.input.slice(0, 100) + "...");
const t2 = corpus.hadith.ar.tirmidhi.find(h => h.hadithnumber === 2);
console.log("Tirmidhi 2 text length:", t2?.text.length);

const res = searchHadith(c4.input);
console.log("Results count:", res.results.length);
if (res.results.length > 0) {
  res.results.slice(0, 5).forEach((r, idx) => {
    console.log(`Rank ${idx + 1}: ${r.id}, conf: ${r.confidence}`);
  });
}
