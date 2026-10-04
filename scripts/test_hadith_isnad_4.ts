import fs from 'fs';
import { searchHadith } from '../server/matching/hadithMatcher.ts';

const cases = JSON.parse(fs.readFileSync('eval/cases.json', 'utf8'));
const c4 = cases.find((c: any) => c.id === 'hadith_isnad_4');

console.log("=== hadith_isnad_4 Test ===");
console.log("Full Query:\n" + c4.input);
console.log("\nSearching...");

const res = searchHadith(c4.input);

console.log(`\nTotal results: ${res.results.length}`);
console.log("\nTop 3 Results:");
res.results.slice(0, 3).forEach((r, idx) => {
  const matchedCount = r.matchedTokens?.length || 0;
  const unmatchedCount = r.changedWords?.length || 0;
  console.log(`Rank ${idx + 1}: ${r.id}`);
  console.log(`  Score (confidence): ${r.confidence}%`);
  console.log(`  State: ${r.state}`);
  console.log(`  Matched words count: ${matchedCount}`);
  console.log(`  Unmatched words count: ${unmatchedCount}`);
});

const m535Idx = res.results.findIndex(r => r.id === 'muslim_535' || r.id === 'muslim_224.01');
if (m535Idx >= 0) {
  const r = res.results[m535Idx];
  console.log(`\nmuslim_535 Rank: ${m535Idx + 1}`);
  console.log(`muslim_535 Score: ${r.confidence}%`);
} else {
  console.log(`\nmuslim_535 was not in results (score < 70% threshold).`);
}
