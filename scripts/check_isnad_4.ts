import fs from 'fs';
import { searchHadith } from '../server/matching/hadithMatcher.ts';

const cases = JSON.parse(fs.readFileSync('eval/cases.json', 'utf8'));
const c = cases.find((x: any) => x.id === 'hadith_isnad_4');

const res = searchHadith(c.input);

console.log('FULL_QUERY:', c.input);
console.log('TOTAL_RESULTS:', res.results.length);

const top3 = res.results.slice(0, 3).map(r => {
  const words = r.text.split(/\s+/).filter(Boolean);
  const matchedWordsCount = r.matchedWords?.length || 0;
  const unmatchedWordsCount = Math.max(0, words.length - matchedWordsCount);
  return {
    id: r.id,
    score: r.confidence,
    matchedCount: matchedWordsCount,
    unmatchedCount: unmatchedWordsCount,
    totalWordsInHadith: words.length
  };
});

console.log('TOP_3:', JSON.stringify(top3, null, 2));

const m535Idx = res.results.findIndex(r => r.id === 'muslim_535');
const m535 = m535Idx !== -1 ? res.results[m535Idx] : null;

console.log('MUSLIM_535_RANK:', m535Idx !== -1 ? m535Idx + 1 : 'Not in results');
console.log('MUSLIM_535_SCORE:', m535 ? m535.confidence : 'N/A');
