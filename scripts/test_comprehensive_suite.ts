import fs from 'fs';
import { initAyahEngine, searchAyah } from '../server/matching/ayahMatcher.ts';

initAyahEngine();

console.log('=== RUNNING COMPREHENSIVE SUITE ===\n');

// 1. Positional Highlighting check for 2:255
console.log('--- 1. Query: الله لا اله الا هو الحي القيوم ---');
const r1 = searchAyah('الله لا اله الا هو الحي القيوم');
const match255 = r1.results.find(r => r.chapter === 2 && r.verse === 255);
console.log('2:255 match position:', {
  confidence: match255?.confidence,
  coverage: match255?.coverage,
  matchedStartWordIndex: match255?.matchedStartWordIndex,
  matchedEndWordIndex: match255?.matchedEndWordIndex,
  totalWordsInAyah: match255?.breakdown?.[0]?.totalWordCount,
});

// 2. 2:255 exact with diacritics
const arRaw = JSON.parse(fs.readFileSync('server/corpus/data/quran_ar.json', 'utf8'));
const verses = arRaw.quran || arRaw[Object.keys(arRaw)[0]];
const v255 = verses.find((v: any) => v.chapter === 2 && v.verse === 255);

console.log('\n--- 2. Query: Exact 2:255 with diacritics ---');
const r2 = searchAyah(v255.text);
console.log('2:255 exact score:', r2.topConfidence, 'state:', r2.state, 'matchedSelf:', r2.results[0]?.verse === 255);

// 3. Query: السموات والارض ولا يئوده حفظهما
console.log('\n--- 3. Query: السموات والارض ولا يئوده حفظهما ---');
const r3 = searchAyah('السموات والارض ولا يئوده حفظهما');
console.log('Score:', r3.topConfidence, 'state:', r3.state, 'results:', r3.results.map(r => `${r.chapter}:${r.verseRange} (${r.confidence}%)`));

// 4. Precision test: ذلك الكتب vs ذلك الكتاب vs صلواتك
console.log('\n--- 4. Precision check ---');
const r4a = searchAyah('ذلك الكتب لا ريب فيه');
console.log('ذلك الكتب لا ريب فيه -> confidence:', r4a.topConfidence, 'state:', r4a.state);

const r4b = searchAyah('ذلك الكتاب لا ريب فيه');
console.log('ذلك الكتاب لا ريب فيه -> confidence:', r4b.topConfidence, 'state:', r4b.state);

const r4c = searchAyah('خذ من اموالهم صدقة تطهرهم وتزكيهم بها وصل عليهم ان صلواتك سكن لهم');
console.log('صلواتك (9:103) -> confidence:', r4c.topConfidence, 'state:', r4c.state);
