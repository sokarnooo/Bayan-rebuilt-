import fs from 'fs';
import { normalizeArabic, cleanWhitespaceBeforeCombiningMarks, toAlefInvariant, wordSimilarityWithPenalty } from '../server/matching/normalizer.ts';

const arRaw = JSON.parse(fs.readFileSync('server/corpus/data/quran_ar.json', 'utf8'));
const verses = arRaw.quran || arRaw[Object.keys(arRaw)[0]];
const v255 = verses.find((v: any) => v.chapter === 2 && v.verse === 255);

const corpusText = cleanWhitespaceBeforeCombiningMarks(v255.text);
const queryText = v255.text; // Exact text with diacritics

console.log('--- Testing exact 2:255 token by token ---');
const corpusWords = corpusText.split(' ').filter(Boolean);
const queryWords = queryText.split(' ').filter(Boolean);

console.log(`Corpus words count: ${corpusWords.length}, Query words count: ${queryWords.length}`);

for (let i = 0; i < corpusWords.length; i++) {
  const cw = corpusWords[i];
  const qw = queryWords[i];
  const normCW = normalizeArabic(cw);
  const normQW = normalizeArabic(qw);
  const sim = wordSimilarityWithPenalty(normQW, normCW);
  if (sim < 1.0 || normCW !== normQW) {
    console.log(`\nMismatch at word index ${i}:`);
    console.log(`Corpus raw: "${cw}" -> norm: "${normCW}"`);
    console.log(`Query raw:  "${qw}" -> norm: "${normQW}"`);
    console.log(`Similarity: ${sim}`);
    console.log('Corpus codepoints:', [...cw].map(c => `U+${c.codePointAt(0)!.toString(16).toUpperCase().padStart(4, '0')}`).join(' '));
    console.log('Query codepoints: ', [...qw].map(c => `U+${c.codePointAt(0)!.toString(16).toUpperCase().padStart(4, '0')}`).join(' '));
  }
}
