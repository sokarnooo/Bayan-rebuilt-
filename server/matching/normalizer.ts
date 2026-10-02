/**
 * Ultra-fast Arabic Normalizer and Zero-Allocation Levenshtein / Sliding-Window Matcher.
 */

export function normalizeArabic(text: string): string {
  if (!text) return '';
  return text
    // 1. Remove Tashkeel / Harakat
    .replace(/[\u064B-\u065F\u0670\u06D6-\u06ED\u06DF-\u06E8]/g, '')
    // 2. Remove Tatweel / Kashida
    .replace(/\u0640/g, '')
    // 3. Fold Alef variants (أ, إ, آ, ٱ) -> standard ا
    .replace(/[\u0622\u0623\u0625\u0671]/g, 'ا')
    // 4. Fold Ta Marbuta (ة) -> ه
    .replace(/\u0629/g, 'ه')
    // 5. Fold Alef Maqsura (ى) and Farsi Yeh (ی) -> ي
    .replace(/[\u0649\u06CC]/g, 'ي')
    // 6. Fold Farsi Kaf (ک) -> Arabic Kaf (ك)
    .replace(/\u06A9/g, 'ك')
    // 7. Fold Hamza on Waw (ؤ) -> و, Hamza on Ya (ئ) -> ي, standalone Hamza (ء) -> remove
    .replace(/\u0624/g, 'و')
    .replace(/\u0626/g, 'ي')
    .replace(/\u0621/g, '')
    // 8. Remove non-letter symbols, punctuation, brackets, digits, and decorative marks
    .replace(/[.,/#!$%^&*;:{}=\-_`~()؟،؛«»"'\d\u0660-\u0669\uFD3E\uFD3F\[\]<>ـ]/g, ' ')
    // 9. Collapse multiple whitespaces and trim
    .replace(/\s+/g, ' ')
    .trim();
}

// Reusable scratch buffers for Levenshtein calculations (up to 1024 chars without reallocation)
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
    // Fallback for unusually long strings
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
 * Word-boundary anchored sliding window for lightning-fast matching.
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

  // Exact substring shortcut
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

  // Find all word boundary start indices in target
  const boundaries = [0];
  for (let i = 0; i < tLen; i++) {
    if (target.charCodeAt(i) === 32 && i + 1 < tLen) {
      boundaries.push(i + 1);
    }
  }

  const minW = Math.max(3, qLen - 2);
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
        if (bestSim >= 0.95) break;
      }
    }
    if (bestSim >= 0.95) break;
  }

  return { similarity: bestSim, bestSlice, start: bestStart, end: bestEnd };
}
