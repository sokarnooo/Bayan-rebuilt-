/**
 * Arabic Text Normalization for Bayan Ayah Matcher per strict scholarly specifications.
 */

// 1. Whitespace cleanup: remove whitespace ONLY when directly preceding a combining mark.
// Normalize other NBSPs to standard space ' '.
export function cleanWhitespaceBeforeCombiningMarks(text: string): string {
  if (!text) return '';
  return text
    // Remove space / NBSP / zero-width spaces immediately preceding combining marks (Tashkeel, Dagger Alef, Quranic signs)
    .replace(/[\s\u00A0\u200B\u200C\u200D]+(?=[\u064B-\u065F\u0670\u06D6-\u06ED])/g, '')
    // Normalize remaining NBSPs to standard space
    .replace(/\u00A0/g, ' ');
}

/**
 * Handle silent spelling carrier Waw:
 * Waw followed by Dagger Alef is folded to standard Alef 'ا'
 * ONLY when directly followed by ة or ا at the end of the word
 * (e.g. الصلوة، الزكوة، الحيوة، مشكوة، الربوا).
 * In words like «السماوات»، «أفواههم»، «أواه», the Waw is followed by ت or other letters,
 * and in plural verbs like «كفروا»، «آمنوا», the Waw is a real letter and is strictly preserved.
 */
export function foldSilentCarrierWaw(text: string): string {
  if (!text) return '';
  // 1. Waw with dagger alef followed strictly by ة or ا in Uthmani script (e.g. ٱلصَّلَوٰةَ, ٱلزَّكَوٰةَ, ٱلۡحَیَوٰةَ, ٱلرِّبَوٰا۟)
  let s = text.replace(/و[\u064B-\u065F\u06E1]*\u0670(?=[\u064B-\u065F]*[ةا])/g, 'ا');

  // 2. Specific silent-carrier roots with any Arabic prefixes (و، ف، ب، ك، ل، ال) when typed by users without dagger alef
  s = s.replace(
    /([وفبلك]*(?:ال)?)(صل|زك|حي|مشك|نج|من|غد)و([ةه])(?=[\s،.؛!؟()\[\]«»]|$)/gu,
    '$1$2ا$3'
  );
  s = s.replace(/([وفبلك]*(?:ال)?)(رب)وا(?=[\s،.؛!؟()\[\]«»]|$)/gu, '$1$2ا');

  return s;
}

/**
 * Standard Arabic normalization:
 * - Cleans whitespace before combining marks
 * - Folds silent carrier Waw before ة / ا
 * - Strips Tashkeel, Tatweel, Quranic symbols, punctuation
 * - Folds Alef variants (أ, إ, آ, ٱ) -> ا
 * - Folds Ta Marbuta (ة) -> ه
 * - Folds Alef Maqsura (ى) and Farsi Yeh (ی) -> ي
 * - Folds Farsi Kaf (ک) -> Arabic Kaf (ك)
 * - Folds Hamza forms (ؤ -> و, ئ -> ي, ء -> removed)
 */
export function normalizeArabic(text: string): string {
  if (!text) return '';
  let s = cleanWhitespaceBeforeCombiningMarks(text);
  s = foldSilentCarrierWaw(s);

  return (
    s
      // Strip Tashkeel / Harakat and Quranic pause marks
      .replace(/[\u064B-\u065F\u0670\u06D6-\u06ED\u06DF-\u06E8]/g, '')
      // Strip Tatweel
      .replace(/\u0640/g, '')
      // Fold Alef variants
      .replace(/[\u0622\u0623\u0625\u0671]/g, 'ا')
      // Fold Ta Marbuta
      .replace(/\u0629/g, 'ه')
      // Fold Yeh variants (Alef Maqsura ى \u0649, Farsi Yeh ی \u06CC) -> standard Arabic ي \u064A
      .replace(/[\u0649\u06CC]/g, 'ي')
      // Fold Farsi Kaf ک \u06A9 -> Arabic Kaf ك \u0643
      .replace(/\u06A9/g, 'ك')
      // Fold Hamza on Waw -> و, Hamza on Ya -> ي, standalone Hamza -> stripped
      .replace(/\u0624/g, 'و')
      .replace(/\u0626/g, 'ي')
      .replace(/\u0621/g, '')
      // Remove non-letter symbols, punctuation, brackets, digits
      .replace(
        /[.,/#!$%^&*;:{}=\-_`~()؟،؛«»"'\d\u0660-\u0669\uFD3E\uFD3F\[\]<>ـ]/g,
        ' '
      )
      // Collapse whitespace
      .replace(/\s+/g, ' ')
      .trim()
  );
}

/**
 * Alef-Invariant Canonical Form:
 * Used for matching comparison on BOTH query and corpus.
 * Completely strips all Alef occurrences so that:
 * «السماوات» and «السموات» -> identical
 * «الكتاب» and «الكتب» -> identical
 * «العالمين» and «العلمين» -> identical
 * «الصالحات» and «الصلحت» -> identical
 * «الرحمن» and «الرحمان» -> identical
 * «إله» and «إلاه» -> identical
 */
export function toAlefInvariant(normalizedText: string): string {
  if (!normalizedText) return '';
  return normalizedText
    .replace(/[ا\u0670]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Fast Levenshtein distance using reusable scratch buffers.
 */
const ROW_SIZE = 1024;
const prevRow = new Int32Array(ROW_SIZE);
const currRow = new Int32Array(ROW_SIZE);

export function levenshteinDistance(s1: string, s2: string): number {
  if (s1 === s2) return 0;
  const len1 = s1.length;
  const len2 = s2.length;
  if (len1 === 0) return len2;
  if (len2 === 0) return len1;

  if (len2 >= ROW_SIZE) {
    const r1 = new Int32Array(len2 + 1);
    const r2 = new Int32Array(len2 + 1);
    for (let j = 0; j <= len2; j++) r1[j] = j;
    for (let i = 1; i <= len1; i++) {
      r2[0] = i;
      const c1 = s1.charCodeAt(i - 1);
      for (let j = 1; j <= len2; j++) {
        const cost = c1 === s2.charCodeAt(j - 1) ? 0 : 1;
        r2[j] = Math.min(r1[j] + 1, r2[j - 1] + 1, r1[j - 1] + cost);
      }
      for (let j = 0; j <= len2; j++) r1[j] = r2[j];
    }
    return r2[len2];
  }

  for (let j = 0; j <= len2; j++) {
    prevRow[j] = j;
  }

  for (let i = 1; i <= len1; i++) {
    currRow[0] = i;
    const c1 = s1.charCodeAt(i - 1);
    for (let j = 1; j <= len2; j++) {
      const cost = c1 === s2.charCodeAt(j - 1) ? 0 : 1;
      currRow[j] = Math.min(
        prevRow[j] + 1,
        currRow[j - 1] + 1,
        prevRow[j - 1] + cost
      );
    }
    for (let j = 0; j <= len2; j++) {
      prevRow[j] = currRow[j];
    }
  }

  return currRow[len2];
}

export function levenshteinSimilarity(s1: string, s2: string): number {
  const maxLen = Math.max(s1.length, s2.length);
  if (maxLen === 0) return 1;
  const dist = levenshteinDistance(s1, s2);
  return Math.max(0, 1 - dist / maxLen);
}

/**
 * Sliding window similarity on Alef-invariant text at word boundaries.
 */
export function slidingWindowSimilarity(
  query: string,
  target: string
): { similarity: number; bestSlice: string; start: number; end: number } {
  const qLen = query.length;
  const tLen = target.length;

  if (qLen === 0 || tLen === 0) {
    return { similarity: 0, bestSlice: '', start: 0, end: 0 };
  }

  const exactIdx = target.indexOf(query);
  if (exactIdx !== -1) {
    return {
      similarity: 1.0,
      bestSlice: target.substring(exactIdx, exactIdx + qLen),
      start: exactIdx,
      end: exactIdx + qLen,
    };
  }

  if (qLen >= tLen * 0.85) {
    const sim = levenshteinSimilarity(query, target);
    return { similarity: sim, bestSlice: target, start: 0, end: tLen };
  }

  let bestSim = 0;
  let bestSlice = '';
  let bestStart = 0;
  let bestEnd = 0;

  const boundaries = [0];
  for (let i = 0; i < tLen; i++) {
    if (target.charCodeAt(i) === 32 && i + 1 < tLen) {
      boundaries.push(i + 1);
    }
  }

  const minW = Math.max(2, qLen - 2);
  const maxW = Math.min(tLen, qLen + 2);

  for (let b = 0; b < boundaries.length; b++) {
    const start = boundaries[b];
    for (let w = minW; w <= maxW; w++) {
      if (start + w > tLen) break;
      const slice = target.substring(start, start + w);
      const sim = levenshteinSimilarity(query, slice);
      if (sim > bestSim) {
        bestSim = sim;
        bestSlice = slice;
        bestStart = start;
        bestEnd = start + w;
        if (bestSim >= 0.98) break;
      }
    }
    if (bestSim >= 0.98) break;
  }

  return { similarity: bestSim, bestSlice, start: bestStart, end: bestEnd };
}
