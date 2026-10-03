import fs from 'fs';
import { normalizeArabic, cleanWhitespaceBeforeCombiningMarks, toAlefInvariant, wordSimilarityCorpusDerived } from '../server/matching/normalizer.ts';

const query = 'السموات والارض ولا يئوده حفظهما';
const qWords = query.split(' ');

const arRaw = JSON.parse(fs.readFileSync('server/corpus/data/quran_ar.json', 'utf8'));
const verses = arRaw.quran || arRaw[Object.keys(arRaw)[0]];
const v255 = verses.find((v: any) => v.chapter === 2 && v.verse === 255);
const cWords = cleanWhitespaceBeforeCombiningMarks(v255.text).split(' ');

// Target slice is words 41 to 45 (or 42 to 46):
// 41: وَسِعَ كُرۡسِیُّهُ (40, 41)
// 42: ٱلسَّمَـٰوَٰتِ
// 43: وَٱلۡأَرۡضَۖ
// 44: وَلَا
// 45: یَءُودُهُۥ
// 46: حِفۡظُهُمَاۚ

const targetSlice = cWords.slice(42, 47);
console.log('Query words: ', qWords);
console.log('Target words:', targetSlice);

let totalScore = 0;
for (let i = 0; i < qWords.length; i++) {
  const qw = qWords[i];
  const cw = targetSlice[i];
  const normQW = normalizeArabic(qw);
  const normCW = normalizeArabic(cw);
  const sim = wordSimilarityCorpusDerived(normQW, normCW).score;
  totalScore += sim;
  console.log(`\nWord ${i}:`);
  console.log(`  Query:  "${qw}" -> norm: "${normQW}"`);
  console.log(`  Corpus: "${cw}" -> norm: "${normCW}"`);
  console.log(`  Similarity: ${sim}`);
  console.log(`  Query codepoints: `, [...qw].map(c => `U+${c.codePointAt(0)!.toString(16).toUpperCase().padStart(4, '0')}`).join(' '));
  console.log(`  Corpus codepoints:`, [...cw].map(c => `U+${c.codePointAt(0)!.toString(16).toUpperCase().padStart(4, '0')}`).join(' '));
}

console.log(`\nAverage score: ${totalScore / qWords.length} (${Math.round(totalScore / qWords.length * 100)}%)`);
