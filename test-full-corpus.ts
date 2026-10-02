import fs from 'fs';
import { cleanWhitespaceBeforeCombiningMarks } from './server/matching/normalizer.ts';
import { initAyahEngine, searchAyah } from './server/matching/ayahMatcher.ts';

initAyahEngine();

const rawQuran = JSON.parse(fs.readFileSync('server/corpus/data/quran_ar.json', 'utf8')).quran;

function generateTestQuery(text: string): string {
  // Step 1: Rule 2 - Remove whitespace only when it sits directly before a combining mark
  const cleaned = cleanWhitespaceBeforeCombiningMarks(text);
  // Step 2: Strip diacritics and fold Farsi Yeh/Kaf to standard Arabic ي/ك
  return cleaned
    .replace(/[\u064B-\u065F\u0670\u06D6-\u06ED\u06DF-\u06E8]/g, '')
    .replace(/\u0640/g, '')
    .replace(/\u06CC/g, 'ي')
    .replace(/\u06A9/g, 'ك')
    .replace(/\u0671/g, 'ا')
    .replace(/\u00A0/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

console.log(`Starting Full-Corpus Self-Test over all ${rawQuran.length} ayat...`);

let passed = 0;
const failures: any[] = [];
const startTotal = performance.now();

for (let i = 0; i < rawQuran.length; i++) {
  const item = rawQuran[i];
  const query = generateTestQuery(item.text);
  const res = searchAyah(query);

  const matchedSelf = res.results.find(
    (r) => r.chapter === item.chapter && r.verse === item.verse
  );

  if (matchedSelf && matchedSelf.confidence >= 99 && matchedSelf.coverage === 'full') {
    passed++;
  } else {
    failures.push({
      ref: `${item.chapter}:${item.verse}`,
      query: query.substring(0, 50),
      topConfidence: res.topConfidence,
      state: res.state,
      foundSelf: !!matchedSelf,
      selfConfidence: matchedSelf ? matchedSelf.confidence : 0,
      selfCoverage: matchedSelf ? matchedSelf.coverage : 'none',
      totalMatches: res.totalMatches,
      reason: !matchedSelf
        ? 'Ayah not found in results'
        : matchedSelf.confidence < 99
        ? `Confidence ${matchedSelf.confidence} < 99`
        : `Coverage ${matchedSelf.coverage} !== full`,
    });
  }

  if ((i + 1) % 1000 === 0 || i === rawQuran.length - 1) {
    console.log(`Processed ${i + 1}/${rawQuran.length} ayat | Passed: ${passed} | Failures: ${failures.length}`);
  }
}

const totalTime = Math.round(performance.now() - startTotal);
console.log(`\n========================================`);
console.log(`FULL-CORPUS SELF-TEST RESULTS`);
console.log(`========================================`);
console.log(`Total Ayat Tested: ${rawQuran.length}`);
console.log(`Passed (Confidence >= 99 & Coverage 'full'): ${passed} (${((passed / rawQuran.length) * 100).toFixed(2)}%)`);
console.log(`Failures: ${failures.length}`);
console.log(`Total Execution Time: ${totalTime} ms (avg ${(totalTime / rawQuran.length).toFixed(2)} ms/ayah)`);

if (failures.length > 0) {
  console.log(`\nAll Failures (${failures.length}):`);
  console.log(JSON.stringify(failures, null, 2));
}
