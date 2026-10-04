import fs from 'fs';
import { loadCorpus } from '../server/corpus/loader.ts';
import { normalizeArabic } from '../server/matching/normalizer.ts';
import { tokenizeDisplayWords } from './test_tokenization_and_highlights.ts';

const { corpus } = loadCorpus();
const cases = JSON.parse(fs.readFileSync('eval/cases.json', 'utf8'));
const c4 = cases.find((c: any) => c.id === 'hadith_isnad_4');

const qTokens = tokenizeDisplayWords(c4.input).nonSkipped.map(t => t.normalized);
console.log("Query non-skipped tokens count:", qTokens.length);

// Compare against Tirmidhi 2
const t2 = corpus.hadith.ar.tirmidhi.find(h => h.hadithnumber === 2);
const t2Tokens = tokenizeDisplayWords(t2!.text).nonSkipped.map(t => t.normalized);
console.log("Tirmidhi 2 non-skipped tokens count:", t2Tokens.length);

// Find match of t2Tokens in qTokens
let matchCount = 0;
let qIdx = 0;
for (let i = 0; i < t2Tokens.length; i++) {
  const found = qTokens.indexOf(t2Tokens[i], qIdx);
  if (found >= 0) {
    matchCount++;
    qIdx = found + 1;
  }
}
console.log("Matching words between Q and Tirmidhi 2:", matchCount, "out of", t2Tokens.length, `(${Math.round(matchCount / t2Tokens.length * 100)}%)`);

// Compare against Muslim 535
const m535 = corpus.hadith.ar.muslim.find(h => h.hadithnumber === 535);
const m535Tokens = tokenizeDisplayWords(m535!.text).nonSkipped.map(t => t.normalized);
console.log("Muslim 535 non-skipped tokens count:", m535Tokens.length);
let m535Match = 0;
let mqIdx = 0;
for (let i = 0; i < m535Tokens.length; i++) {
  const found = qTokens.indexOf(m535Tokens[i], mqIdx);
  if (found >= 0) {
    m535Match++;
    mqIdx = found + 1;
  }
}
console.log("Matching words between Q and Muslim 535:", m535Match, "out of", m535Tokens.length, `(${Math.round(m535Match / m535Tokens.length * 100)}%)`);
