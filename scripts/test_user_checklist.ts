import fs from 'fs';
import { initAyahEngine, searchAyah } from '../server/matching/ayahMatcher.ts';

initAyahEngine();

console.log('=== 1. TEST SIX 79 & 91 QUERIES ===\n');

const queries = [
  'والجبال ارساها',
  'والجبال ارسيها',
  'والشمس وضحاها',
  'والقمر اذا تلاها',
  'والارض وما طحاها',
  'ونفس وما سواها'
];

for (const q of queries) {
  const res = searchAyah(q);
  console.log(`--- Query: "${q}" ---`);
  console.log(JSON.stringify({
    query: res.query,
    normalizedQuery: res.normalizedQuery,
    state: res.state,
    topConfidence: res.topConfidence,
    totalMatches: res.totalMatches,
    results: res.results.map(r => ({
      chapter: r.chapter,
      verseRange: r.verseRange,
      surah: r.surah.arabic,
      confidence: r.confidence,
      state: r.state,
      coverage: r.coverage,
      wordCount: r.text.split(' ').length,
      matchedTokensCount: r.matchedTokens.length,
      hasApprox: r.hasApproximateMatch
    }))
  }, null, 2));
}

console.log('\n=== 2. TEST RANGE HIGHLIGHTING WORD COUNTS ===\n');

const rangeQueries = [
  { name: 'Al-Ikhlas (112:1–4)', query: 'قل هو الله أحد الله الصمد لم يلد ولم يولد ولم يكن له كفوا أحد' },
  { name: 'Al-Fatihah (1:1–7)', query: 'بسم الله الرحمن الرحيم الحمد لله رب العالمين الرحمن الرحيم مالك يوم الدين إياك نعبد وإياك نستعين اهدنا الصراط المستقيم صراط الذين أنعمت عليهم غير المغضوب عليهم ولا الضالين' },
  { name: 'Al-Baqarah 2:285–286', query: 'آمن الرسول بما أنزل إليه من ربه والمؤمنون كل آمن بالله وملائكته وكتبه ورسله لا نفرق بين أحد من رسله وقالوا سمعنا وأطعنا غفرانك ربنا وإليك المصير لا يكلف الله نفسا إلا وسعها لها ما كسبت وعليها ما اكتسبت ربنا لا تؤاخذنا إن نسينا أو أخطأنا ربنا ولا تحمل علينا إصرا كما حملته على الذين من قبلنا ربنا ولا تحملنا ما لا طاقة لنا به واعف عنا واغفر لنا وارحمنا أنت مولانا فانصرنا على القوم الكافرين' }
];

for (const rq of rangeQueries) {
  const res = searchAyah(rq.query);
  const r = res.results[0];
  const totalWords = r.text.split(' ').length;
  const highlightedExact = r.wordMatchStatus?.filter(s => s === 'exact').length || 0;
  const highlightedApprox = r.wordMatchStatus?.filter(s => s === 'approx').length || 0;
  const totalHighlighted = highlightedExact + highlightedApprox;

  console.log(`--- ${rq.name} ---`);
  console.log(`Verse range: ${r.verseRange}, Confidence: ${r.confidence}%, Coverage: ${r.coverage}`);
  console.log(`Total words: ${totalWords}`);
  console.log(`Highlighted words: ${totalHighlighted} (Exact: ${highlightedExact}, Approx: ${highlightedApprox})`);
  console.log(`English translation joined: "${r.translation.slice(0, 80)}..."`);
  console.log(`Breakdown:`, r.breakdown?.map(b => `Ayah ${b.verse}: ${b.matchedWordCount}/${b.totalWordCount} words`));
  console.log();
}

console.log('\n=== 3. TEST APPROXIMATE HIGHLIGHTING (ذلك الكتب) ===\n');
const approxRes = searchAyah('ذلك الكتب لا ريب فيه');
const rApp = approxRes.results[0];
console.log('ذلك الكتب -> confidence:', rApp.confidence, 'hasApproximateMatch:', rApp.hasApproximateMatch);
console.log('Words and statuses:');
rApp.text.split(' ').forEach((w, i) => {
  console.log(`  Word ${i} [${w}]: status = ${rApp.wordMatchStatus?.[i]}`);
});
