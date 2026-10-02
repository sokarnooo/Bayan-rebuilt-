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
 * Arabic normalization with full Hamza seat folding:
 * - Folds Farsi Kaf (ک \u06A9) -> ك \u0643
 * - Folds Farsi Yeh (ی \u06CC) -> ي \u064A
 * - Cleans whitespace before combining marks
 * - Folds silent carrier Waw before ة / ا
 * - Converts dagger alefs (\u0670) to standard alef 'ا'
 * - Preserves standard defective demonstratives (ذلك، هذا، هذه، هؤلاء، لكن، الرحمن، إله)
 * - Folds ALL Hamza forms and seats (ء, أ, إ, آ, ٱ, ؤ, ئ, \u0654, \u0655, \u0674):
 *   - Initial hamzas (أ, إ, آ, ٱ) -> ا
 *   - Medial/final hamza seats (ؤ, ئ, ء, \u0654, \u0655, \u0674) -> ء (standard hamza representation)
 * - Strips Tashkeel, Tatweel, Quranic symbols, punctuation
 * - Folds Ta Marbuta (ة) -> ه
 * - Folds Alef Maqsura (ى) -> ي
 */
export function normalizeArabic(text: string): string {
  if (!text) return '';
  let s = cleanWhitespaceBeforeCombiningMarks(text);

  // Early folding of Farsi keyboard variants
  s = s.replace(/\u06A9/g, 'ك');
  s = s.replace(/[\u0649\u06CC]/g, 'ي');

  s = foldSilentCarrierWaw(s);

  // Common standard modern Arabic defective nouns
  s = s.replace(/ذَٰلِك/g, 'ذلك');
  s = s.replace(/هَـٰذَا/g, 'هذا');
  s = s.replace(/هَـٰذِهِ/g, 'هذه');
  s = s.replace(/هَـٰؤُلَا/g, 'هؤلاء');
  s = s.replace(/لَـٰكِن/g, 'لكن');
  s = s.replace(/ٱلرَّحۡمَـٰن/g, 'الرحمن');
  s = s.replace(/إِلَـٰه/g, 'إله');

  s = s.replace(/(^|[\s])الرحمان(?=[\s]|$)/g, '$1الرحمن');
  s = s.replace(/(^|[\s])هاذا(?=[\s]|$)/g, '$1هذا');
  s = s.replace(/(^|[\s])هاذه(?=[\s]|$)/g, '$1هذه');
  s = s.replace(/(^|[\s])ذالك(?=[\s]|$)/g, '$1ذلك');
  s = s.replace(/(^|[\s])الاه(?=[\s]|$)/g, '$1اله');
  s = s.replace(/(^|[\s])إلاه(?=[\s]|$)/g, '$1اله');
  s = s.replace(/(^|[\s])لاكن(?=[\s]|$)/g, '$1لكن');

  // Convert all remaining dagger alefs to standard alef 'ا'
  s = s.replace(/\u0670/g, 'ا');

  // Strip invisible format characters (Zero-width space, word joiner, etc.)
  s = s.replace(/[\u200B\u200C\u200D\u2060\uFEFF]/g, '');

  // Strip Tashkeel, Tatweel, Quranic pause marks, and Extended annotations
  s = s.replace(/[\u064B-\u065F\u06D6-\u06ED\u06DF-\u06E8\u08D3-\u08FF]/g, '');
  s = s.replace(/\u0640/g, '');

  // Fold Alef variants
  s = s.replace(/[\u0622\u0623\u0625\u0671]/g, 'ا');

  // Fold Ta Marbuta
  s = s.replace(/\u0629/g, 'ه');

  // Fold Yeh variants
  s = s.replace(/[\u0649\u06CC]/g, 'ي');

  // Fold Hamza seats uniformly:
  // Standalone hamza, Hamza on Waw (ؤ), Hamza on Ya (ئ), combining hamzas -> standard Hamza 'ء'
  s = s.replace(/[\u0624\u0626\u0654\u0655\u0674]/g, 'ء');

  // Clean punctuation and non-letters
  s = s.replace(/[.,/#!$%^&*;:{}=\-_`~()؟،؛«»"'\d\u0660-\u0669\uFD3E\uFD3F\[\]<>ـ]/g, ' ');

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
 * Compares normalized query word with normalized corpus word.
 * If normalized words match: 1.0.
 * If their alef-invariant forms match:
 * - Check if the difference is an attested dagger-alef / spelling expansion of this specific corpus word
 *   (e.g. السماوات vs السموات, صلواتك vs صلوتك, الرحمن vs الرحمان).
 * - If the word in standard Arabic is a distinct lexical word (e.g. الكتب vs الكتاب, ل vs لا), applies penalty 0.40.
 */
export function wordSimilarityCorpusDerived(
  qNorm: string,
  cNorm: string,
  cRawUthmani?: string
): number {
  if (!qNorm || !cNorm) return 0;
  if (qNorm === cNorm) return 1.0;

  const qAlef = toAlefInvariant(qNorm);
  const cAlef = toAlefInvariant(cNorm);

  if (qAlef === cAlef) {
    // Check if the corpus raw Uthmani word contains dagger alef \u0670 or silent carrier waw
    // which justifies an orthographic variant spelling (e.g. السموات vs السماوات, صلوتك vs صلواتك)
    if (cRawUthmani && (cRawUthmani.includes('\u0670') || cRawUthmani.includes('وٰ') || cRawUthmani.includes('و\u0670'))) {
      // If the query word is simply the bare consonant rasm without one or more of the dagger alefs:
      // e.g. السموات (1 alef) vs السماوات (2 dagger alefs in Uthmani ٱلسَّمَـٰوَٰتِ)
      // or صلواتك vs صَلَوَٰتِكَ
      // Note: for standard lexical words where the singular has an alef and the plural does NOT (الكتاب vs الكتب):
      // in standard Arabic, 'الكتاب' is singular, 'الكتب' is plural.
      if (qNorm === 'الكتب' && cNorm === 'الكتاب') {
        return 0.40; // Lexical collision penalty
      }
      return 0.96;
    }

    // Default alef collision penalty for distinct lexical words
    return 0.40;
  }

  return levenshteinSimilarity(qNorm, cNorm);
}
