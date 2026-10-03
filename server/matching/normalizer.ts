import fs from 'fs';
import path from 'path';

// Clean whitespace before combining marks
export function cleanWhitespaceBeforeCombiningMarks(text: string): string {
  if (!text) return '';
  return text
    .replace(
      /[\s\u00A0\u200B\u200C\u200D\u2060\uFEFF]+(?=[\u064B-\u065F\u0670\u06D6-\u06ED\u08D3-\u08FF])/g,
      ''
    )
    .replace(/\u00A0/g, ' ');
}

// Fold silent carrier waw before ة or ا
export function foldSilentCarrierWaw(text: string): string {
  if (!text) return '';
  let s = text.replace(
    /و[\u064B-\u065F\u06E1\u06D6-\u06ED\u08D3-\u08FF]*\u0670(?=[\u064B-\u065F\u06D6-\u06ED\u08D3-\u08FF]*[ةا])/g,
    'ا'
  );
  s = s.replace(
    /([وفبلك]*(?:ال)?)(صل|زك|حي|مشك|نج|من|غد)و(ة)(?=[\s،.؛!؟()\[\]«»]|$)/gu,
    '$1$2ا$3'
  );
  s = s.replace(/(^|[\s،.؛!؟()\[\]«»])([وفبلك]*(?:ال)?)ربوا(?=[\s،.؛!؟()\[\]«»]|$)/gu, '$1$2ربا');
  return s;
}

/**
 * Arabic normalization with generic Uthmani dagger alef, Hamza, and demonstrative rules:
 * - Folds Farsi keyboard variants
 * - Folds silent carrier Waw before ة / ا
 * - Folds alef maqsura / ya followed by dagger alef:
 *   - Medial / connected (e.g. أَرۡسَىٰهَا -> ارساها) -> 'ا'
 *   - Final (e.g. عَلَىٰ -> علي, مُوسَىٰ -> موسي) -> 'ي'
 * - Folds standalone hamza + alef (ءا -> ا) (alef madda in standard modern Arabic)
 * - Converts remaining dagger alefs (\u0670) to standard alef 'ا'
 * - Strips Tashkeel, Tatweel, Quranic symbols, punctuation
 * - Folds Alef variants (آ, أ, إ, ٱ) -> ا
 * - Folds Ta Marbuta (ة) -> ه
 * - Folds Yeh variants (ى, ی) -> ي
 * - Folds Hamza seats uniformly (ؤ, ئ, ء) -> ء
 * - Normalizes demonstratives and classical single-lam spellings (اليل -> الليل)
 */
export function normalizeArabic(text: string): string {
  if (!text) return '';
  let s = cleanWhitespaceBeforeCombiningMarks(text);

  // Early folding of Farsi keyboard variants
  s = s.replace(/\u06A9/g, 'ك');
  s = s.replace(/[\u0649\u06CC]/g, 'ي');

  s = foldSilentCarrierWaw(s);

  // Fold alef maqsura / ya followed by dagger alef:
  // 1. Connected/medial followed by letters/suffixes -> standard Alef 'ا'
  s = s.replace(
    /([ىي\u0649\u06CC\u064A])[\u064B-\u065F\u06E1\u06D6-\u06ED\u08D3-\u08FF]*\u0670(?=[\u064B-\u065F\u06D6-\u06ED\u08D3-\u08FF]*[\u0621-\u064A\u0671-\u06D3\u06E5\u06E6])/gu,
    'ا'
  );

  // 2. Final alef maqsura followed by dagger alef at word end -> 'ي'
  s = s.replace(
    /([ىي\u0649\u06CC\u064A])[\u064B-\u065F\u06E1\u06D6-\u06ED\u08D3-\u08FF]*\u0670/gu,
    'ي'
  );

  // Convert all remaining dagger alefs to standard alef 'ا'
  s = s.replace(/\u0670/g, 'ا');

  // Strip invisible format characters
  s = s.replace(/[\u200B\u200C\u200D\u2060\uFEFF]/g, '');

  // Strip Tashkeel, Tatweel, Quranic pause marks, and Extended annotations
  s = s.replace(/[\u064B-\u065F\u06D6-\u06ED\u06DF-\u06E8\u08D3-\u08FF]/g, '');
  s = s.replace(/\u0640/g, '');

  // Fold standalone hamza + alef to alef (e.g. ءَامَنُوا -> امنوا, ءَالَاۤءِ -> الاء)
  s = s.replace(/ءا/g, 'ا');

  // Fold Alef variants
  s = s.replace(/[\u0622\u0623\u0625\u0671]/g, 'ا');

  // Fold Ta Marbuta
  s = s.replace(/\u0629/g, 'ه');

  // Fold Yeh variants
  s = s.replace(/[\u0649\u06CC]/g, 'ي');

  // Fold Hamza seats uniformly
  s = s.replace(/[\u0624\u0626\u0654\u0655\u0674]/g, 'ء');

  // Clean punctuation and non-letters
  s = s.replace(/[.,/#!$%^&*;:{}=\-_`~()؟،؛«»"'\d\u0660-\u0669\uFD3E\uFD3F\[\]<>ـ]/g, ' ');

  // Defective nouns and demonstratives normalization (words whose spoken alef is omitted in rasm)
  s = s.replace(/(^|[\s])الرحمان(?=[\s]|$)/g, '$1الرحمن');
  s = s.replace(/(^|[\s])هاذا(?=[\s]|$)/g, '$1هذا');
  s = s.replace(/(^|[\s])هاذه(?=[\s]|$)/g, '$1هذه');
  s = s.replace(/(^|[\s])هاؤلاء(?=[\s]|$)/g, '$1هؤلاء');
  s = s.replace(/(^|[\s])لاكن(?=[\s]|$)/g, '$1لكن');
  s = s.replace(/(^|[\s])ولاكن(?=[\s]|$)/g, '$1ولكن');
  s = s.replace(/(^|[\s])فلاكن(?=[\s]|$)/g, '$1فلكن');
  s = s.replace(/(^|[\s])ذالك(?=[\s]|$)/g, '$1ذلك');
  s = s.replace(/(^|[\s])كذالك(?=[\s]|$)/g, '$1كذلك');
  s = s.replace(/(^|[\s])الاه(?=[\s]|$)/g, '$1اله');
  s = s.replace(/(^|[\s])والاه(?=[\s]|$)/g, '$1واله');
  s = s.replace(/(^|[\s])فالاه(?=[\s]|$)/g, '$1فاله');
  s = s.replace(/(^|[\s])اليل(?=[\s]|$)/g, '$1الليل');
  s = s.replace(/(^|[\s])واليل(?=[\s]|$)/g, '$1والليل');
  s = s.replace(/(^|[\s])فاليل(?=[\s]|$)/g, '$1فالليل');
  s = s.replace(/(^|[\s])باليل(?=[\s]|$)/g, '$1بالليل');
  s = s.replace(/(^|[\s])كاليل(?=[\s]|$)/g, '$1كالليل');

  return s.replace(/\s+/g, ' ').trim();
}

/**
 * Alef-and-Hamza Invariant Form for candidate matching
 */
export function toAlefInvariant(normalizedText: string): string {
  if (!normalizedText) return '';
  return normalizedText
    .replace(/[ا\u0670ء]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export function levenshteinDistance(s1: string, s2: string): number {
  if (s1 === s2) return 0;
  const len1 = s1.length;
  const len2 = s2.length;
  if (len1 === 0) return len2;
  if (len2 === 0) return len1;

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

export function levenshteinSimilarity(s1: string, s2: string): number {
  const maxLen = Math.max(s1.length, s2.length);
  if (maxLen === 0) return 1;
  const dist = levenshteinDistance(s1, s2);
  return Math.max(0, 1 - dist / maxLen);
}

/**
 * Corpus-derived Word Matching Rule:
 * Returns { score: number, isExact: boolean }
 */
export function wordSimilarityCorpusDerived(
  qNorm: string,
  cNorm: string,
  cRawUthmani?: string
): { score: number; isExact: boolean } {
  if (!qNorm || !cNorm) return { score: 0, isExact: false };
  if (qNorm === cNorm) return { score: 1.0, isExact: true };

  // If the only difference is hamza/alef representation (e.g. ء vs ا, ءامنوا vs امنوا)
  if (qNorm.replace(/ء/g, 'ا') === cNorm.replace(/ء/g, 'ا')) {
    return { score: 1.0, isExact: true };
  }

  const qAlef = toAlefInvariant(qNorm);
  const cAlef = toAlefInvariant(cNorm);

  if (qAlef === cAlef) {
    if (cRawUthmani && (cRawUthmani.includes('\u0670') || cRawUthmani.includes('وٰ') || cRawUthmani.includes('و\u0670'))) {
      if (qNorm === 'الكتب' && cNorm === 'الكتاب') {
        return { score: 0.40, isExact: false }; // Lexical collision penalty
      }
      return { score: 0.96, isExact: false };
    }

    return { score: 0.40, isExact: false };
  }

  // Check Levenshtein similarity for typos
  const sim = levenshteinSimilarity(qNorm, cNorm);
  return { score: sim, isExact: sim === 1.0 };
}
