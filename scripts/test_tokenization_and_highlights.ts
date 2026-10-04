import fs from 'fs';
import { normalizeArabic } from '../server/matching/normalizer.ts';

const load = (book: string) => JSON.parse(fs.readFileSync(`server/corpus/data/hadith_${book}_ar.json`, 'utf8')).hadiths;

export function isPunctuationWord(word: string): boolean {
  const norm = normalizeArabic(word).replace(/[\u200E\u200F]/g, '');
  if (!norm) return true;
  return /^[.,/#!$%^&*;:{}=\-_`~()؟،؛«»"'\d\u0660-\u0669\uFD3E\uFD3F\[\]<>ـ\s\u200B-\u200F\uFEFF]*$/.test(norm);
}

export interface DisplayToken {
  word: string;
  normalized: string;
  originalIndex: number;
  skip: boolean;
}

export function tokenizeDisplayWords(rawText: string): { displayWords: string[]; tokens: DisplayToken[]; nonSkipped: DisplayToken[] } {
  const displayWords = rawText.split(/\s+/).filter(Boolean);
  const tokens: DisplayToken[] = displayWords.map((word, originalIndex) => {
    const norm = normalizeArabic(word).replace(/[\u200E\u200F]/g, '');
    const skip = isPunctuationWord(word) || !norm;
    return {
      word,
      normalized: norm,
      originalIndex,
      skip,
    };
  });

  // Flag honorific phrases
  const norms = tokens.map(t => t.normalized);
  for (let i = 0; i < tokens.length; i++) {
    // صلى الله عليه وسلم / صلي الله عليه وسلم
    if (
      (norms[i] === 'صلي' || norms[i] === 'صلي' || norms[i] === 'صلى') &&
      norms[i + 1] === 'الله' &&
      norms[i + 2] === 'عليه' &&
      norms[i + 3] === 'وسلم'
    ) {
      tokens[i].skip = true;
      tokens[i + 1].skip = true;
      tokens[i + 2].skip = true;
      tokens[i + 3].skip = true;
    }
    // رضي الله عنه / عنها / عنهم / عنهما
    if (
      norms[i] === 'رضي' &&
      norms[i + 1] === 'الله' &&
      (norms[i + 2] === 'عنه' || norms[i + 2] === 'عنها' || norms[i + 2] === 'عنهم' || norms[i + 2] === 'عنهما' || norms[i + 2] === 'عنهن')
    ) {
      tokens[i].skip = true;
      tokens[i + 1].skip = true;
      tokens[i + 2].skip = true;
    }
    // عليه السلام / عليه الصلاة والسلام
    if (norms[i] === 'عليه' && norms[i + 1] === 'السلام') {
      tokens[i].skip = true;
      tokens[i + 1].skip = true;
    }
    if (norms[i] === 'عليه' && norms[i + 1] === 'الصلاه' && norms[i + 2] === 'والسلام') {
      tokens[i].skip = true;
      tokens[i + 1].skip = true;
      tokens[i + 2].skip = true;
    }
    // رحمه الله
    if (norms[i] === 'رحمه' && norms[i + 1] === 'الله') {
      tokens[i].skip = true;
      tokens[i + 1].skip = true;
    }
  }

  const nonSkipped = tokens.filter(t => !t.skip);
  return { displayWords, tokens, nonSkipped };
}

// Test on the requested hadiths
function testHighlight(book: string, num: number, query: string) {
  const hadiths = load(book);
  const h = hadiths.find((x: any) => x.hadithnumber === num);
  if (!h) {
    console.log(`Hadith ${book} ${num} not found`);
    return;
  }
  const { displayWords, nonSkipped } = tokenizeDisplayWords(h.text);
  const qNormWords = normalizeArabic(query).split(/\s+/).filter(Boolean);

  // Find where qNormWords match in nonSkipped
  let bestStart = -1;
  let bestScore = 0;
  for (let i = 0; i <= nonSkipped.length - qNormWords.length; i++) {
    let matchCount = 0;
    for (let j = 0; j < qNormWords.length; j++) {
      if (nonSkipped[i + j].normalized === qNormWords[j]) {
        matchCount++;
      }
    }
    if (matchCount > bestScore) {
      bestScore = matchCount;
      bestStart = i;
    }
  }

  if (bestStart >= 0) {
    const matchedTokens = nonSkipped.slice(bestStart, bestStart + qNormWords.length);
    const matchedOriginalIndices = matchedTokens.map(t => t.originalIndex);
    const matchedWords = matchedOriginalIndices.map(idx => displayWords[idx]);
    console.log(`[${book}_${num}] Highlighted words:`);
    console.log(`"${matchedWords.join(' ')}"`);
  }
}

console.log("=== Highlight Tests ===");
testHighlight('bukhari', 13, 'لا يؤمن أحدكم حتى يحب لأخيه ما يحب لنفسه');
testHighlight('tirmidhi', 2515, 'لا يؤمن أحدكم حتى يحب لأخيه ما يحب لنفسه');
testHighlight('bukhari', 1, 'إنما الأعمال بالنيات');
testHighlight('abudawud', 2201, 'إنما الأعمال بالنيات');
testHighlight('ibnmajah', 4227, 'إنما الأعمال بالنيات');
