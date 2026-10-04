import fs from 'fs';
import { initHadithEngine } from '../server/matching/hadithMatcher.ts';
import { normalizeArabic } from '../server/matching/normalizer.ts';

const cases = JSON.parse(fs.readFileSync('eval/cases.json', 'utf8'));
const c4 = cases.find((c: any) => c.id === 'hadith_isnad_4');

const res = initHadithEngine();
// Let us inspect what candidateScores has
console.log("Indexed:", res.totalIndexed);
