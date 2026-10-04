import fs from 'fs';
import { initHadithEngine, searchHadith } from '../server/matching/hadithMatcher.ts';
import { normalizeArabic } from '../server/matching/normalizer.ts';

initHadithEngine();
const cases = JSON.parse(fs.readFileSync('eval/cases.json', 'utf8'));
const c4 = cases.find((c: any) => c.id === 'hadith_isnad_4');

const res = searchHadith(c4.input);
console.log("Status:", res.state);
console.log("Top Confidence:", res.topConfidence);
console.log("Total matches:", res.totalMatches);
console.log("Results count:", res.results.length);
if (res.results.length > 0) {
  console.log("Top 1 ID:", res.results[0].id, "conf:", res.results[0].confidence);
}
