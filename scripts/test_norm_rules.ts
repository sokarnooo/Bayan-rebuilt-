import fs from 'fs';
import { normalizeArabic, cleanWhitespaceBeforeCombiningMarks, toAlefInvariant, wordSimilarityCorpusDerived } from '../server/matching/normalizer.ts';

const arRaw = JSON.parse(fs.readFileSync('server/corpus/data/quran_ar.json', 'utf8'));
const verses = arRaw.quran || arRaw[Object.keys(arRaw)[0]];

console.log('--- Checking normalization of test words ---');
const testWords = [
  'أَرۡسَىٰهَا',
  'وَضُحَىٰهَا',
  'تَلَىٰهَا',
  'طَحَىٰهَا',
  'سَوَّىٰهَا',
  'ٱلَّذِی',
  'عَلَىٰ',
  'إِلَىٰ',
  'حَتَّىٰ',
  'مُوسَىٰ',
  'عِيسَىٰ'
];

testWords.forEach(w => {
  console.log(`${w} -> normalized: "${normalizeArabic(w)}"`);
});
