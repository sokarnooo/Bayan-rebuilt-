import fs from 'fs';
import path from 'path';
import zlib from 'zlib';
import { fileURLToPath } from 'url';
import { loadCorpus } from '../corpus/loader.ts';
import {
  normalizeArabic,
  toAlefInvariant,
  levenshteinDistance,
  levenshteinSimilarity,
  wordSimilarityCorpusDerived,
} from './normalizer.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DATA_DIR = path.resolve(__dirname, '../corpus/data');

export interface HadithGradeItem {
  name: string;
  originalGrade: string;
  arabicLabel: string;
  family: 'صحيح' | 'حسن' | 'ضعيف' | 'موضوع' | 'neutral';
  isIsnadJudgment: boolean;
  isCitation: boolean;
  note?: string;
}

export interface ChangedWordItem {
  queryWord: string | null;
  sourceWord: string | null;
  position: number;
  type?: 'exact' | 'approximate' | 'inserted' | 'deleted';
}

export interface HadithRecord {
  c: string; // collection slug
  n: number; // hadithnumber
  m: number[]; // matn word token IDs
  f: number[]; // full word token IDs
  r: number; // isnadRemovedRatio
  o: number; // isnadWordOffset
}

export interface HadithMatchResult {
  id: string;
  collection: string;
  collectionArabic: string;
  hadithnumber: number;
  arabicnumber: string | number;
  book: number;
  hadithInBook: number;
  sectionName: string;
  text: string;
  translation?: string;
  confidence: number;
  state: 'matched' | 'close_match';
  coverage: 'full' | 'fragment';
  matchedStartWordIndex: number;
  matchedEndWordIndex: number;
  matchedTokens: string[];
  matchedWords?: string[];
  matchedOriginalIndices?: number[];
  wordMatchStatus: ('exact' | 'approximate' | 'none')[];
  hasApproximateMatch: boolean;
  changedWords?: ChangedWordItem[];
  grades: HadithGradeItem[];
  hasNoGrading: boolean;
  isnadStripped: boolean;
  attestations?: HadithAttestationItem[];
}

export interface HadithAttestationItem {
  id: string;
  collection: string;
  collectionArabic: string;
  hadithnumber: number;
  arabicnumber: string | number;
  book: number;
  hadithInBook: number;
  containmentRatio: number;
  grades: HadithGradeItem[];
  hasNoGrading: boolean;
  matnSnippet: string;
}

export interface HadithSearchResponse {
  query: string;
  normalizedQuery: string;
  query_mode: 'hadith';
  language: 'ar' | 'en';
  state: 'matched' | 'close_match' | 'not_found' | 'too_short';
  topConfidence: number;
  totalMatches: number;
  results: HadithMatchResult[];
  referralRequired: boolean;
  isCuratedMatched?: boolean;
  curatedMatchedEntry?: any;
  notice?: string;
  executionTimeMs: number;
}

const COLLECTION_METADATA: Record<string, { arName: string; enName: string }> = {
  bukhari: { arName: 'صحيح البخاري', enName: 'Sahih al-Bukhari' },
  muslim: { arName: 'صحيح مسلم', enName: 'Sahih Muslim' },
  abudawud: { arName: 'سنن أبي داود', enName: 'Sunan Abi Dawud' },
  tirmidhi: { arName: 'جامع الترمذي', enName: 'Jami` at-Tirmidhi' },
  nasai: { arName: 'سنن النسائي', enName: 'Sunan an-Nasa`i' },
  ibnmajah: { arName: 'سنن ابن ماجه', enName: 'Sunan Ibn Majah' },
  nawawi: { arName: 'الأربعون النووية', enName: 'Forty Hadith of an-Nawawi' },
};

function parseGrade(g: { name?: string; grade?: string }): HadithGradeItem {
  const name = (g.name || 'مُخرِّج غير مسمى').trim();
  const raw = (g.grade || '').trim();

  // Isnad judgments
  if (/^(Isnaad Hasan|Hasan Isnaad)$/i.test(raw)) {
    return {
      name,
      originalGrade: raw,
      arabicLabel: 'إسناده حسن',
      family: 'حسن',
      isIsnadJudgment: true,
      isCitation: false,
      note: 'حكم على الإسناد',
    };
  }
  if (/^(Isnaad Sahih|Sahih Isnaad)$/i.test(raw)) {
    return {
      name,
      originalGrade: raw,
      arabicLabel: 'إسناده صحيح',
      family: 'صحيح',
      isIsnadJudgment: true,
      isCitation: false,
      note: 'حكم على الإسناد',
    };
  }
  if (/^Daif Isnaad$/i.test(raw)) {
    return {
      name,
      originalGrade: raw,
      arabicLabel: 'ضعيف الإسناد',
      family: 'ضعيف',
      isIsnadJudgment: true,
      isCitation: false,
      note: 'حكم على الإسناد',
    };
  }
  if (/^Daif Isnaad Maqtu$/i.test(raw)) {
    return {
      name,
      originalGrade: raw,
      arabicLabel: 'ضعيف الإسناد مقطوعاً',
      family: 'neutral',
      isIsnadJudgment: true,
      isCitation: false,
      note: 'حكم على الإسناد (على التابعي)',
    };
  }
  if (/^Sahih Isnaad Maqtu$/i.test(raw)) {
    return {
      name,
      originalGrade: raw,
      arabicLabel: 'صحيح الإسناد مقطوعاً',
      family: 'neutral',
      isIsnadJudgment: true,
      isCitation: false,
      note: 'حكم على الإسناد (على التابعي)',
    };
  }
  if (/^Sahih Isnaad Mauquf$/i.test(raw)) {
    return {
      name,
      originalGrade: raw,
      arabicLabel: 'صحيح الإسناد موقوفاً',
      family: 'neutral',
      isIsnadJudgment: true,
      isCitation: false,
      note: 'حكم على الإسناد (على الصحابي)',
    };
  }

  // Citations
  if (/^Sahih - Agreed Upon$/i.test(raw)) {
    return {
      name,
      originalGrade: raw,
      arabicLabel: 'ذُكر في: متفق عليه',
      family: 'neutral',
      isIsnadJudgment: false,
      isCitation: true,
    };
  }
  if (/^Sahih - Bukhari And Muslim$/i.test(raw)) {
    return {
      name,
      originalGrade: raw,
      arabicLabel: 'ذُكر في: البخاري ومسلم',
      family: 'neutral',
      isIsnadJudgment: false,
      isCitation: true,
    };
  }
  if (/^Sahih Muslim/i.test(raw)) {
    return {
      name,
      originalGrade: raw,
      arabicLabel: `ذُكر في: صحيح مسلم (${raw})`,
      family: 'neutral',
      isIsnadJudgment: false,
      isCitation: true,
    };
  }
  if (/^Sahih Bukhari/i.test(raw)) {
    return {
      name,
      originalGrade: raw,
      arabicLabel: `ذُكر في: صحيح البخاري (${raw})`,
      family: 'neutral',
      isIsnadJudgment: false,
      isCitation: true,
    };
  }

  // Neutral specific hadith terms
  if (/^Sahih Mauquf$/i.test(raw)) {
    return {
      name,
      originalGrade: raw,
      arabicLabel: 'صحيح موقوفاً',
      family: 'neutral',
      isIsnadJudgment: false,
      isCitation: false,
      note: 'على الصحابي',
    };
  }
  if (/^Sahih Maqtu$/i.test(raw)) {
    return {
      name,
      originalGrade: raw,
      arabicLabel: 'صحيح مقطوعاً',
      family: 'neutral',
      isIsnadJudgment: false,
      isCitation: false,
      note: 'على التابعي',
    };
  }
  if (/^Batil$/i.test(raw)) {
    return {
      name,
      originalGrade: raw,
      arabicLabel: 'باطل',
      family: 'neutral',
      isIsnadJudgment: false,
      isCitation: false,
      note: 'حكم مستقل',
    };
  }
  if (/^Shadh$/i.test(raw)) {
    return {
      name,
      originalGrade: raw,
      arabicLabel: 'شاذ',
      family: 'neutral',
      isIsnadJudgment: false,
      isCitation: false,
      note: 'حكم إسنادي خاص',
    };
  }
  if (/^Munkar$/i.test(raw)) {
    return {
      name,
      originalGrade: raw,
      arabicLabel: 'منكر',
      family: 'neutral',
      isIsnadJudgment: false,
      isCitation: false,
      note: 'حكم إسنادي خاص',
    };
  }
  if (/^Matruk$/i.test(raw)) {
    return {
      name,
      originalGrade: raw,
      arabicLabel: 'متروك',
      family: 'neutral',
      isIsnadJudgment: false,
      isCitation: false,
      note: 'حكم على الراوي',
    };
  }
  if (/^Munqati$/i.test(raw)) {
    return {
      name,
      originalGrade: raw,
      arabicLabel: 'منقطع',
      family: 'neutral',
      isIsnadJudgment: false,
      isCitation: false,
      note: 'انقطاع في السند',
    };
  }
  if (/^Mursal$/i.test(raw)) {
    return {
      name,
      originalGrade: raw,
      arabicLabel: 'مرسل',
      family: 'neutral',
      isIsnadJudgment: false,
      isCitation: false,
      note: 'سقط الصحابي من السند',
    };
  }
  if (/^Mudallas$/i.test(raw)) {
    return {
      name,
      originalGrade: raw,
      arabicLabel: 'مدلس',
      family: 'neutral',
      isIsnadJudgment: false,
      isCitation: false,
      note: 'تدليس في الإسناد',
    };
  }
  if (/^Maqtu$/i.test(raw)) {
    return {
      name,
      originalGrade: raw,
      arabicLabel: 'مقطوع',
      family: 'neutral',
      isIsnadJudgment: false,
      isCitation: false,
      note: 'على التابعي',
    };
  }

  // Standard family grades
  if (/^Sahih$/i.test(raw) || /^Sahih Hadith$/i.test(raw)) {
    return { name, originalGrade: raw, arabicLabel: 'صحيح', family: 'صحيح', isIsnadJudgment: false, isCitation: false };
  }
  if (/^Hasan Sahih$/i.test(raw) || /^Hasan Sahih Isnaad$/i.test(raw)) {
    return { name, originalGrade: raw, arabicLabel: 'حسن صحيح', family: 'حسن', isIsnadJudgment: false, isCitation: false };
  }
  if (/^Hasan$/i.test(raw)) {
    return { name, originalGrade: raw, arabicLabel: 'حسن', family: 'حسن', isIsnadJudgment: false, isCitation: false };
  }
  if (/^Sahih Lighairihi$/i.test(raw)) {
    return { name, originalGrade: raw, arabicLabel: 'صحيح لغيره', family: 'صحيح', isIsnadJudgment: false, isCitation: false };
  }
  if (/^Hasan Lighairihi$/i.test(raw)) {
    return { name, originalGrade: raw, arabicLabel: 'حسن لغيره', family: 'حسن', isIsnadJudgment: false, isCitation: false };
  }
  if (/^Sahih Mutawatir$/i.test(raw)) {
    return { name, originalGrade: raw, arabicLabel: 'صحيح متواتر', family: 'صحيح', isIsnadJudgment: false, isCitation: false };
  }
  if (/^(Very Daif|Daif Jiddan)$/i.test(raw)) {
    return { name, originalGrade: raw, arabicLabel: 'ضعيف جداً', family: 'ضعيف', isIsnadJudgment: false, isCitation: false };
  }
  if (/^Daif$/i.test(raw) || /^Sanad Daif$/i.test(raw)) {
    return { name, originalGrade: raw, arabicLabel: 'ضعيف', family: 'ضعيف', isIsnadJudgment: false, isCitation: false };
  }
  if (/^Mawdu$/i.test(raw)) {
    return { name, originalGrade: raw, arabicLabel: 'موضوع', family: 'موضوع', isIsnadJudgment: false, isCitation: false };
  }

  return {
    name,
    originalGrade: raw,
    arabicLabel: raw,
    family: 'neutral',
    isIsnadJudgment: false,
    isCitation: false,
  };
}

export function normalizeEnglish(text: string): string {
  return text
    .toLowerCase()
    .replace(/\([^)]*\)/g, ' ')
    .replace(/[()]/g, ' ')
    .replace(/['"’`\-–]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function stripHonorificsAndFormulas(text: string): string {
  if (!text) return '';
  let s = text;
  s = s.replace(/صلى الله عليه وسلم/g, ' ');
  s = s.replace(/صلي الله عليه وسلم/g, ' ');
  s = s.replace(/رضي الله عنهما/g, ' ');
  s = s.replace(/رضي الله عنهم/g, ' ');
  s = s.replace(/رضي الله عنها/g, ' ');
  s = s.replace(/رضي الله عنه/g, ' ');
  s = s.replace(/عليه الصلاة والسلام/g, ' ');
  s = s.replace(/عليه السلام/g, ' ');
  s = s.replace(/رحمه الله/g, ' ');
  s = s.replace(/عز وجل/g, ' ');
  s = s.replace(/سبحانه وتعالى/g, ' ');
  s = s.replace(/سبحانه وتعالي/g, ' ');
  s = s.replace(/(رواه|أخرجه) (مسلم|البخاري|الترمذي|أبو داود|النسائي|ابن ماجه|أحمد)/g, ' ');
  s = s.replace(/متفق عليه/g, ' ');
  return s.replace(/\s+/g, ' ').trim();
}

export const SKIP_WORDS = new Set([
  'صلى', 'صلي', 'الله', 'عليه', 'وسلم', 
  'رضي', 'عنه', 'عنها', 'عنهم', 'عنهما', 'عنهن',
  'رحمه', 'سبحانه', 'وتعالى', 'وتعالي', 'عز', 'وجل', 
  'عليهما', 'السلام'
]);

export interface DisplayToken {
  word: string;
  normalized: string;
  originalIndex: number;
  skip: boolean;
}

export function isPunctuationWord(word: string): boolean {
  const norm = normalizeArabic(word).replace(/[\u200E\u200F]/g, '');
  if (!norm) return true;
  return /^[.,/#!$%^&*;:{}=\-_`~()؟،؛«»"'\d\u0660-\u0669\uFD3E\uFD3F\[\]<>ـ\s\u200B-\u200F\uFEFF]*$/.test(norm);
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

  const norms = tokens.map(t => t.normalized);
  for (let i = 0; i < tokens.length; i++) {
    if (
      (norms[i] === 'صلي' || norms[i] === 'صلى') &&
      norms[i + 1] === 'الله' &&
      norms[i + 2] === 'عليه' &&
      norms[i + 3] === 'وسلم'
    ) {
      tokens[i].skip = true;
      tokens[i + 1].skip = true;
      tokens[i + 2].skip = true;
      tokens[i + 3].skip = true;
    }
    if (
      norms[i] === 'رضي' &&
      norms[i + 1] === 'الله' &&
      (norms[i + 2] === 'عنه' || norms[i + 2] === 'عنها' || norms[i + 2] === 'عنهم' || norms[i + 2] === 'عنهما' || norms[i + 2] === 'عنهن')
    ) {
      tokens[i].skip = true;
      tokens[i + 1].skip = true;
      tokens[i + 2].skip = true;
      tokens[i + 3].skip = true;
    }
    if (norms[i] === 'عليه' && norms[i + 1] === 'السلام') {
      tokens[i].skip = true;
      tokens[i + 1].skip = true;
    }
    if (norms[i] === 'عليه' && norms[i + 1] === 'الصلاه' && norms[i + 2] === 'والسلام') {
      tokens[i].skip = true;
      tokens[i + 1].skip = true;
      tokens[i + 2].skip = true;
    }
    if (norms[i] === 'رحمه' && norms[i + 1] === 'الله') {
      tokens[i].skip = true;
      tokens[i + 1].skip = true;
    }
    if (norms[i] === 'عز' && norms[i + 1] === 'وجل') {
      tokens[i].skip = true;
      tokens[i + 1].skip = true;
    }
    if (norms[i] === 'سبحانه' && (norms[i + 1] === 'وتعالي' || norms[i + 1] === 'وتعالى')) {
      tokens[i].skip = true;
      tokens[i + 1].skip = true;
    }
  }

  const nonSkipped = tokens.filter(t => !t.skip);
  return { displayWords, tokens, nonSkipped };
}

export function stripIsnadTokens(tokens: DisplayToken[]): { matnTokens: DisplayToken[]; isnadStripped: boolean } {
  if (tokens.length <= 4) {
    return { matnTokens: tokens, isnadStripped: false };
  }

  const maxIdx = Math.max(Math.floor(tokens.length * 0.90), tokens.length - 2);
  const attributionMarkers = [
    ['قال', 'رسول', 'الله'],
    ['سمعت', 'رسول', 'الله'],
    ['ان', 'رسول', 'الله'],
    ['عن', 'رسول', 'الله'],
    ['ان', 'النبي'],
    ['عن', 'النبي'],
    ['يقول', 'رسول', 'الله'],
    ['سمعت', 'النبي'],
  ];

  for (let i = 0; i <= maxIdx; i++) {
    for (const m of attributionMarkers) {
      if (i + m.length <= tokens.length) {
        let match = true;
        for (let j = 0; j < m.length; j++) {
          if (tokens[i + j].normalized !== m[j]) {
            match = false;
            break;
          }
        }
        if (match) {
          let after = i + m.length;
          if (after < tokens.length && (tokens[after].normalized === 'قال' || tokens[after].normalized === 'يقول')) {
            after++;
          }
          if (after < tokens.length) {
            return { matnTokens: tokens.slice(after), isnadStripped: true };
          }
        }
      }
    }
  }

  return { matnTokens: tokens, isnadStripped: false };
}

export interface AlignedDPResult {
  confidence: number;
  matchedTokens: string[];
  matchedWords: string[];
  matchedOriginalIndices: number[];
  wordStatus: ('exact' | 'approximate' | 'none')[];
  changedWords: ChangedWordItem[];
  hasApproximateMatch: boolean;
}

export function alignWordsDP(
  queryTokens: { word: string; normalized: string }[],
  sourceTokens: { word: string; normalized: string; originalIndex: number }[]
): AlignedDPResult {
  const m = queryTokens.length;
  const n = sourceTokens.length;

  if (m === 0 || n === 0) {
    return {
      confidence: 0,
      matchedTokens: [],
      matchedWords: [],
      matchedOriginalIndices: [],
      wordStatus: [],
      changedWords: [],
      hasApproximateMatch: false,
    };
  }

  const dp: number[][] = Array.from({ length: m + 1 }, () => new Float64Array(n + 1) as any);
  const back: number[][] = Array.from({ length: m + 1 }, () => new Int32Array(n + 1) as any);

  dp[0][0] = 0;
  for (let i = 1; i <= m; i++) {
    dp[i][0] = i * 1.5;
    back[i][0] = 2;
  }
  for (let j = 1; j <= n; j++) {
    dp[0][j] = 0;
    back[0][j] = 3;
  }

  for (let i = 1; i <= m; i++) {
    const qw = queryTokens[i - 1].normalized;
    for (let j = 1; j <= n; j++) {
      const sw = sourceTokens[j - 1].normalized;

      let subCost = 3.0;
      if (qw === sw || qw.replace(/ء/g, 'ا') === sw.replace(/ء/g, 'ا')) {
        subCost = 0;
      } else {
        const lenDiff = Math.abs(qw.length - sw.length);
        if (lenDiff <= 1) {
          const dist = levenshteinDistance(qw, sw);
          if (dist <= 1) {
            subCost = 0.5;
          } else {
            subCost = 2.5;
          }
        } else {
          subCost = 2.5;
        }
      }

      const costDiag = dp[i - 1][j - 1] + subCost;
      const costUp = dp[i - 1][j] + 1.5;
      const costLeft = dp[i][j - 1] + 1.0;

      if (costDiag <= costUp && costDiag <= costLeft) {
        dp[i][j] = costDiag;
        back[i][j] = 1;
      } else if (costUp <= costLeft) {
        dp[i][j] = costUp;
        back[i][j] = 2;
      } else {
        dp[i][j] = costLeft;
        back[i][j] = 3;
      }
    }
  }

  let bestJ = n;
  let minCost = dp[m][n];
  const searchStart = Math.min(n, Math.max(1, m - 4));
  for (let j = searchStart; j <= n; j++) {
    if (dp[m][j] < minCost) {
      minCost = dp[m][j];
      bestJ = j;
    }
  }

  interface AlignedStep {
    queryWord: string | null;
    sourceWord: string | null;
    type: 'exact' | 'approximate' | 'inserted' | 'deleted';
    qIdx: number;
    sIdx: number;
    sourceOriginalIndex?: number;
  }

  const rev: AlignedStep[] = [];
  let currI = m;
  let currJ = bestJ;

  while (currI > 0) {
    if (currI > 0 && currJ > 0 && back[currI][currJ] === 1) {
      const qw = queryTokens[currI - 1];
      const sw = sourceTokens[currJ - 1];
      const isExact = (qw.normalized === sw.normalized || qw.normalized.replace(/ء/g, 'ا') === sw.normalized.replace(/ء/g, 'ا'));
      const dist = isExact ? 0 : levenshteinDistance(qw.normalized, sw.normalized);
      const type = isExact ? 'exact' : (dist <= 1 ? 'approximate' : 'deleted');

      rev.push({
        queryWord: qw.word,
        sourceWord: sw.word,
        type,
        qIdx: currI - 1,
        sIdx: currJ - 1,
        sourceOriginalIndex: sw.originalIndex,
      });
      currI--;
      currJ--;
    } else if (currJ <= 0 || back[currI][currJ] === 2) {
      rev.push({
        queryWord: queryTokens[currI - 1].word,
        sourceWord: null,
        type: 'deleted',
        qIdx: currI - 1,
        sIdx: -1,
      });
      currI--;
    } else {
      rev.push({
        queryWord: null,
        sourceWord: sourceTokens[currJ - 1].word,
        type: 'inserted',
        qIdx: currI,
        sIdx: currJ - 1,
        sourceOriginalIndex: sourceTokens[currJ - 1].originalIndex,
      });
      currJ--;
    }
  }

  const steps = rev.reverse();
  const matchedTokens: string[] = [];
  const matchedWords: string[] = [];
  const matchedOriginalIndices: number[] = [];
  const wordStatus: ('exact' | 'approximate' | 'none')[] = [];
  const changedWords: ChangedWordItem[] = [];
  let hasApproximateMatch = false;

  for (const step of steps) {
    if (step.type === 'exact') {
      if (step.sourceOriginalIndex !== undefined) {
        matchedOriginalIndices.push(step.sourceOriginalIndex);
        matchedWords.push(step.sourceWord!);
        matchedTokens.push(normalizeArabic(step.sourceWord!));
      }
      wordStatus.push('exact');
      changedWords.push({
        queryWord: step.queryWord,
        sourceWord: step.sourceWord,
        position: step.qIdx,
        type: 'exact',
      });
    } else if (step.type === 'approximate') {
      hasApproximateMatch = true;
      if (step.sourceOriginalIndex !== undefined) {
        matchedOriginalIndices.push(step.sourceOriginalIndex);
        matchedWords.push(step.sourceWord!);
        matchedTokens.push(normalizeArabic(step.sourceWord!));
      }
      wordStatus.push('approximate');
      changedWords.push({
        queryWord: step.queryWord,
        sourceWord: step.sourceWord,
        position: step.qIdx,
        type: 'approximate',
      });
    } else if (step.type === 'inserted') {
      changedWords.push({
        queryWord: null,
        sourceWord: step.sourceWord,
        position: step.qIdx,
        type: 'inserted',
      });
    } else if (step.type === 'deleted') {
      wordStatus.push('none');
      changedWords.push({
        queryWord: step.queryWord,
        sourceWord: null,
        position: step.qIdx,
        type: 'deleted',
      });
    }
  }

  let exactCount = steps.filter(s => s.type === 'exact').length;
  let approxCount = steps.filter(s => s.type === 'approximate').length;
  let rawScore = (exactCount * 1.0 + approxCount * 0.85) / m;
  let confidence = Math.round(rawScore * 100);

  return {
    confidence,
    matchedTokens,
    matchedWords,
    matchedOriginalIndices,
    wordStatus,
    changedWords,
    hasApproximateMatch,
  };
}

export function findBestWindow<T extends { word: string; normalized: string; originalIndex: number }>(query: { normalized: string }[], source: T[]): T[] {
  if (source.length <= query.length + 8) return source;
  const qWords = new Set(query.map(t => t.normalized));
  let bestStart = 0;
  let maxHits = -1;
  const winLen = query.length;
  for (let i = 0; i <= source.length - winLen; i++) {
    let hits = 0;
    for (let j = 0; j < winLen; j++) {
      if (qWords.has(source[i + j].normalized)) hits++;
    }
    if (hits > maxHits) {
      maxHits = hits;
      bestStart = i;
    }
  }
  const start = Math.max(0, bestStart - 4);
  const end = Math.min(source.length, bestStart + winLen + 6);
  return source.slice(start, end);
}

export function findBestQueryWindow(query: { word: string; normalized: string }[], source: { normalized: string }[]) {
  if (query.length <= source.length + 8) return query;
  const sWords = new Set(source.map(t => t.normalized));
  let bestStart = 0;
  let maxHits = -1;
  const winLen = Math.min(query.length, source.length + 6);
  for (let i = 0; i <= query.length - winLen; i++) {
    let hits = 0;
    for (let j = 0; j < winLen; j++) {
      if (sWords.has(query[i + j].normalized)) hits++;
    }
    if (hits > maxHits) {
      maxHits = hits;
      bestStart = i;
    }
  }
  const start = Math.max(0, bestStart - 2);
  const end = Math.min(query.length, bestStart + winLen + 4);
  return query.slice(start, end);
}

/**
 * Isnad stripping on normalized text:
 * Searches across attribution markers up to 90% of tokens to support long isnad + short matn hadiths
 */
export function stripIsnadFromNormalized(normalizedText: string): {
  matn: string;
  isnadStripped: boolean;
  strippedRatio: number;
  isnadWordOffset: number;
} {
  const words = normalizedText.split(/\s+/).filter(Boolean);
  if (words.length <= 4) {
    return { matn: normalizedText, isnadStripped: false, strippedRatio: 0, isnadWordOffset: 0 };
  }

  const maxIdx = Math.max(Math.floor(words.length * 0.90), words.length - 2);

  const attributionMarkers = [
    'قال رسول الله',
    'سمعت رسول الله',
    'ان رسول الله',
    'عن رسول الله',
    'ان النبي',
    'عن النبي',
    'يقول رسول الله',
    'سمعت النبي',
  ];

  for (let i = 0; i <= maxIdx; i++) {
    for (const m of attributionMarkers) {
      const mTokens = m.split(' ');
      const sub = words.slice(i, i + mTokens.length).join(' ');
      if (sub === m) {
        let afterIdx = i + mTokens.length;
        // Skip honorific (صلى الله عليه وسلم / صلي الله عليه وسلم) if present
        const next4 = words.slice(afterIdx, afterIdx + 4).join(' ');
        if (next4 === 'صلي الله عليه وسلم' || next4 === 'صلى الله عليه وسلم') {
          afterIdx += 4;
        }
        if (words[afterIdx] === 'قال' || words[afterIdx] === 'يقول' || words[afterIdx] === 'انه قال') {
          afterIdx++;
        }
        const matnTokens = words.slice(afterIdx);
        if (matnTokens.length > 0) {
          const strippedRatio = Math.round((afterIdx / words.length) * 100) / 100;
          return {
            matn: matnTokens.join(' '),
            isnadStripped: true,
            strippedRatio,
            isnadWordOffset: afterIdx,
          };
        }
      }
    }
  }

  return { matn: normalizedText, isnadStripped: false, strippedRatio: 0, isnadWordOffset: 0 };
}

// In-Memory Engine State
let corpusHadiths: HadithRecord[] = [];
let vocabulary: string[] = [];
let wordToIdMap = new Map<string, number>();
let twoGramIndex = new Map<number, Map<number, number[]>>(); // id1 -> id2 -> array of record indices
let isInitialized = false;
let sectionsCache = new Map<string, Record<string, string>>();

export function getWordId(word: string, add = false): number {
  let id = wordToIdMap.get(word);
  if (id === undefined && add) {
    id = vocabulary.length;
    vocabulary.push(word);
    wordToIdMap.set(word, id);
  }
  return id ?? -1;
}

function addToIndex(id1: number, id2: number, recordIdx: number) {
  let m1 = twoGramIndex.get(id1);
  if (!m1) {
    m1 = new Map<number, number[]>();
    twoGramIndex.set(id1, m1);
  }
  let list = m1.get(id2);
  if (!list) {
    list = [];
    m1.set(id2, list);
  }
  if (list[list.length - 1] !== recordIdx) {
    list.push(recordIdx);
  }
}

function getIndexHits(id1: number, id2: number): number[] {
  return twoGramIndex.get(id1)?.get(id2) || [];
}

export function getIndexedCounts() {
  const counts: Record<string, number> = {
    bukhari: 0,
    muslim: 0,
    abudawud: 0,
    tirmidhi: 0,
    nasai: 0,
    ibnmajah: 0,
    nawawi: 0,
    totalIndexed: 0,
  };
  for (const h of corpusHadiths) {
    if (counts[h.c] !== undefined) {
      counts[h.c]++;
      counts.totalIndexed++;
    }
  }
  return counts;
}

export function preprocessAllRawHadiths(): { records: HadithRecord[]; vocab: string[]; sections: Record<string, Record<string, string>>; emptyCount: number } {
  const collections = ['bukhari', 'muslim', 'abudawud', 'tirmidhi', 'nasai', 'ibnmajah', 'nawawi'];
  const records: HadithRecord[] = [];
  const sections: Record<string, Record<string, string>> = {};
  vocabulary = [];
  wordToIdMap.clear();
  let emptyCount = 0;

  for (const col of collections) {
    const arPath = path.join(DATA_DIR, `hadith_${col}_ar.json`);
    if (!fs.existsSync(arPath)) continue;

    const arData = JSON.parse(fs.readFileSync(arPath, 'utf8'));
    sections[col] = arData.metadata?.sections || {};
    const hadithList = arData.hadiths || [];

    for (const h of hadithList) {
      const rawText = (h.text || '').trim();
      if (!rawText) {
        emptyCount++;
        continue;
      }

      const norm = normalizeArabic(rawText);
      const cleanNorm = stripHonorificsAndFormulas(norm);
      const { matn, strippedRatio, isnadWordOffset } = stripIsnadFromNormalized(cleanNorm);

      const matnTokens = matn.split(/\s+/).filter(Boolean);
      const fullTokens = cleanNorm.split(/\s+/).filter(Boolean);

      records.push({
        c: col,
        n: h.hadithnumber,
        m: matnTokens.map(t => getWordId(t, true)),
        f: fullTokens.map(t => getWordId(t, true)),
        r: strippedRatio,
        o: isnadWordOffset ?? 0,
      });
    }
  }

  return { records, vocab: vocabulary, sections, emptyCount };
}

export function initHadithEngine(): { totalIndexed: number; emptyExcluded: number; indexMemoryBytes: number } {
  if (isInitialized) {
    return {
      totalIndexed: corpusHadiths.length,
      emptyExcluded: 379,
      indexMemoryBytes: twoGramIndex.size * 64,
    };
  }

  const startTime = performance.now();

  const prebuiltPathGz = path.join(DATA_DIR, 'prebuilt_hadiths.json.gz');
  const prebuiltPathPlain = path.join(DATA_DIR, 'prebuilt_hadiths.json');

  corpusHadiths = [];
  twoGramIndex.clear();
  let emptyCount = 379;

  if (fs.existsSync(prebuiltPathGz)) {
    // Fast path: load gzipped prebuilt index
    const buffer = fs.readFileSync(prebuiltPathGz);
    const decompressed = zlib.gunzipSync(buffer).toString('utf8');
    const data = JSON.parse(decompressed);
    vocabulary = data.v || [];
    corpusHadiths = data.r || [];
    
    // Populate sections cache from prebuilt
    sectionsCache.clear();
    if (data.s) {
      for (const [col, sData] of Object.entries(data.s)) {
        sectionsCache.set(col, sData as Record<string, string>);
      }
    }
  } else if (fs.existsSync(prebuiltPathPlain)) {
    const data = JSON.parse(fs.readFileSync(prebuiltPathPlain, 'utf8'));
    vocabulary = data.v || [];
    corpusHadiths = data.r || [];
    if (data.s) {
      for (const [col, sData] of Object.entries(data.s)) {
        sectionsCache.set(col, sData as Record<string, string>);
      }
    }
  } else {
    // Slow path fallback: build dynamically
    const { records, vocab, sections, emptyCount: ec } = preprocessAllRawHadiths();
    corpusHadiths = records;
    vocabulary = vocab;
    emptyCount = ec;
    
    sectionsCache.clear();
    for (const [col, sData] of Object.entries(sections)) {
      sectionsCache.set(col, sData);
    }
  }

  // Rebuild wordToIdMap for runtime use (finding word IDs for query)
  wordToIdMap.clear();
  for (let i = 0; i < vocabulary.length; i++) {
    wordToIdMap.set(vocabulary[i], i);
  }

  // Populate twoGramIndex of full text (covering both isnad and matn)
  twoGramIndex.clear();
  for (let recordIdx = 0; recordIdx < corpusHadiths.length; recordIdx++) {
    const record = corpusHadiths[recordIdx];
    const tokenIds = record.f;
    for (let i = 0; i < tokenIds.length - 1; i++) {
      addToIndex(tokenIds[i], tokenIds[i + 1], recordIdx);
    }
  }

  isInitialized = true;
  const loadTime = Math.round(performance.now() - startTime);
  console.log(`Hadith Engine Initialized in ${loadTime}ms: ${corpusHadiths.length} non-empty records indexed (${emptyCount} empty records excluded).`);

  return {
    totalIndexed: corpusHadiths.length,
    emptyExcluded: emptyCount,
    indexMemoryBytes: twoGramIndex.size * 64,
  };
}

/**
 * Containment score of query in hadith words:
 * Plain text definition:
 * For each starting position in the hadith, we compute the sum of word similarity scores
 * between the query word i and the hadith word.
 * Tracks changedWords when a query word has no match.
 */
export function scoreContainment(
  queryTokens: string[],
  recordTokenIds: number[]
): {
  score: number;
  startWordIndex: number;
  endWordIndex: number;
  hasApproximateMatch: boolean;
  wordStatus: ('exact' | 'approximate' | 'none')[];
  changedWords: ChangedWordItem[];
  matchedTokens: string[];
} {
  const qLen = queryTokens.length;
  const rLen = recordTokenIds.length;

  if (qLen === 0 || rLen === 0) {
    return {
      score: 0,
      startWordIndex: 0,
      endWordIndex: 0,
      hasApproximateMatch: false,
      wordStatus: [],
      changedWords: [],
      matchedTokens: [],
    };
  }

  let bestScore = 0;
  let bestStart = 0;
  let bestEnd = 0;
  let bestApprox = false;
  let bestStatus: ('exact' | 'approximate' | 'none')[] = [];
  let bestChanged: ChangedWordItem[] = [];
  let bestMatchedTokens: string[] = [];

  const qIds = queryTokens.map((t) => getWordId(t));

  if (qLen <= rLen) {
    const maxStart = rLen - qLen;
    for (let j = 0; j <= maxStart; j++) {
      let sum = 0;
      let anyApprox = false;
      const currentStatus: ('exact' | 'approximate' | 'none')[] = [];
      const currentChanged: ChangedWordItem[] = [];
      const currentMatched: string[] = [];

      for (let i = 0; i < qLen; i++) {
        const rId = recordTokenIds[j + i];
        const rToken = vocabulary[rId];
        const qToken = queryTokens[i];

        if (rId !== undefined && qIds[i] !== -1 && qIds[i] === rId) {
          sum += 1.0;
          currentStatus.push('exact');
          currentMatched.push(rToken);
        } else if (rId !== undefined) {
          const sim = wordSimilarityCorpusDerived(qToken, rToken);
          if (sim.score >= 0.95 && sim.isExact) {
            sum += 1.0;
            currentStatus.push('exact');
            currentMatched.push(rToken);
          } else if (sim.score >= 0.70) {
            anyApprox = true;
            sum += sim.score;
            currentStatus.push('approximate');
            currentMatched.push(rToken);
          } else {
            currentStatus.push('none');
            currentChanged.push({
              queryWord: qToken,
              sourceWord: rToken || null,
              position: i,
            });
          }
        } else {
          currentStatus.push('none');
          currentChanged.push({
            queryWord: qToken,
            sourceWord: null,
            position: i,
          });
        }
      }

      let avg = Math.round((sum / qLen) * 100);
      if (avg > bestScore) {
        bestScore = avg;
        bestStart = j;
        bestEnd = j + qLen - 1;
        bestApprox = anyApprox;
        bestStatus = currentStatus;
        bestChanged = currentChanged;
        bestMatchedTokens = currentMatched;
      }
    }
  } else {
    // qLen > rLen: Query is longer than the record.
    // If maximum possible score cannot reach threshold (70%), skip immediately
    if (rLen / qLen < 0.65) {
      return {
        score: 0,
        startWordIndex: 0,
        endWordIndex: 0,
        hasApproximateMatch: false,
        wordStatus: [],
        changedWords: [],
        matchedTokens: [],
      };
    }

    const maxStart = qLen - rLen;
    for (let k = 0; k <= maxStart; k++) {
      let sum = 0;
      let anyApprox = false;
      const currentStatus: ('exact' | 'approximate' | 'none')[] = [];
      const currentChanged: ChangedWordItem[] = [];
      const currentMatched: string[] = [];

      for (let i = 0; i < qLen; i++) {
        const qToken = queryTokens[i];
        if (i >= k && i < k + rLen) {
          const rIdx = i - k;
          const rId = recordTokenIds[rIdx];
          const rToken = vocabulary[rId];

          if (rId !== undefined && qIds[i] !== -1 && qIds[i] === rId) {
            sum += 1.0;
            currentStatus.push('exact');
            currentMatched.push(rToken);
          } else if (rId !== undefined) {
            const sim = wordSimilarityCorpusDerived(qToken, rToken);
            if (sim.score >= 0.95 && sim.isExact) {
              sum += 1.0;
              currentStatus.push('exact');
              currentMatched.push(rToken);
            } else if (sim.score >= 0.70) {
              anyApprox = true;
              sum += sim.score;
              currentStatus.push('approximate');
              currentMatched.push(rToken);
            } else {
              currentStatus.push('none');
              currentChanged.push({
                queryWord: qToken,
                sourceWord: rToken,
                position: i,
              });
            }
          }
        } else {
          currentStatus.push('none');
          currentChanged.push({
            queryWord: qToken,
            sourceWord: null,
            position: i,
          });
        }
      }

      let avg = Math.round((sum / qLen) * 100);
      if (avg > bestScore) {
        bestScore = avg;
        bestStart = 0;
        bestEnd = rLen - 1;
        bestApprox = anyApprox;
        bestStatus = currentStatus;
        bestChanged = currentChanged;
        bestMatchedTokens = currentMatched;
      }
    }
  }

  return {
    score: bestScore,
    startWordIndex: bestStart,
    endWordIndex: bestEnd,
    hasApproximateMatch: bestApprox,
    wordStatus: bestStatus,
    changedWords: bestChanged,
    matchedTokens: bestMatchedTokens,
  };
}

/**
 * Attestation clustering:
 * Use containment of shorter matn in longer (>= 0.80), not symmetric similarity.
 */
function findAttestationCluster(targetRecord: HadithRecord): HadithAttestationItem[] {
  const targetTokenIds = targetRecord.m;
  if (targetTokenIds.length < 3) return [];

  const attestations: HadithAttestationItem[] = [];
  const { corpus } = loadCorpus();

  // Candidate set: find records sharing 2-grams
  const candHits = new Map<number, number>();
  for (let i = 0; i < Math.min(targetTokenIds.length - 1, 8); i++) {
    const hits = getIndexHits(targetTokenIds[i], targetTokenIds[i + 1]);
    for (const h of hits) {
      candHits.set(h, (candHits.get(h) || 0) + 1);
    }
  }

  const candidateIndices = Array.from(candHits.entries())
    .filter(([_, count]) => count >= 2 || targetTokenIds.length <= 4)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 20)
    .map(([cIdx]) => cIdx);

  for (const cIdx of candidateIndices) {
    const candidate = corpusHadiths[cIdx];
    if (candidate.c === targetRecord.c && candidate.n === targetRecord.n) continue;

    const candTokenIds = candidate.m;
    if (candTokenIds.length < 3) continue;

    const shorter = targetTokenIds.length <= candTokenIds.length ? targetTokenIds : candTokenIds;
    const longer = targetTokenIds.length <= candTokenIds.length ? candTokenIds : targetTokenIds;

    // scoreContainment takes string[] as first arg. 
    // We need a variant or just convert shorter to strings for this call.
    const shorterStrings = shorter.map(id => vocabulary[id]);
    const res = scoreContainment(shorterStrings, longer);
    const containmentRatio = Math.round((res.score / 100) * 100) / 100;

    if (containmentRatio >= 0.80) {
      const arList = corpus.hadith.ar[candidate.c as keyof typeof corpus.hadith.ar] || [];
      const rawAr = arList.find(h => h.hadithnumber === candidate.n);
      const grades: HadithGradeItem[] = (rawAr?.grades || []).map(parseGrade);
      const hasNoGrading = grades.length === 0;

      const bookNum = rawAr?.reference?.book ?? 0;
      const hadithInBook = rawAr?.reference?.hadith ?? 0;
      const colMeta = COLLECTION_METADATA[candidate.c] || { arName: candidate.c, enName: candidate.c };

      attestations.push({
        id: `${candidate.c}_${candidate.n}`,
        collection: candidate.c,
        collectionArabic: colMeta.arName,
        hadithnumber: candidate.n,
        arabicnumber: rawAr?.arabicnumber ?? candidate.n,
        book: bookNum,
        hadithInBook,
        containmentRatio,
        grades,
        hasNoGrading,
        matnSnippet: candidate.m.slice(0, 20).map(id => vocabulary[id] || '').join(' ').slice(0, 100) + '...',
      });
    }
  }

  attestations.sort((a, b) => b.containmentRatio - a.containmentRatio);
  return attestations;
}

export function searchHadith(rawQuery: string): HadithSearchResponse {
  if (!isInitialized) initHadithEngine();

  const startTime = performance.now();
  const trimmed = (rawQuery || '').trim();

  if (!trimmed) {
    return {
      query: rawQuery,
      normalizedQuery: '',
      query_mode: 'hadith',
      language: 'ar',
      state: 'not_found',
      topConfidence: 0,
      totalMatches: 0,
      results: [],
      referralRequired: true,
      executionTimeMs: 0,
    };
  }

  // Detect language
  const isEnglish = /[a-zA-Z]/.test(trimmed) && !/[\u0600-\u06FF]/.test(trimmed);

  if (isEnglish) {
    const normQ = normalizeEnglish(trimmed);
    const qTokens = normQ.split(/\s+/).filter(Boolean);
    const stopWords = new Set(['are', 'to', 'be', 'only', 'by', 'the', 'a', 'of', 'and', 'in', 'for', 'that']);
    const qContent = qTokens.filter((t) => !stopWords.has(t));

    const matches: HadithMatchResult[] = [];
    const { corpus } = loadCorpus();
    const cols = ['bukhari', 'muslim', 'abudawud', 'tirmidhi', 'nasai', 'ibnmajah', 'nawawi'] as const;

    for (const col of cols) {
      const enList = corpus.hadith.en[col] || [];
      const arList = corpus.hadith.ar[col] || [];
      const colMeta = COLLECTION_METADATA[col] || { arName: col, enName: col };

      for (const enH of enList) {
        if (!enH.text) continue;
        const normEn = normalizeEnglish(enH.text);

        let score = 0;
        if (normEn.includes(normQ)) {
          score = 100;
        } else if (qContent.length > 0) {
          let lastIndex = -1;
          let matchCount = 0;
          for (const t of qContent) {
            const foundIndex = normEn.indexOf(t, lastIndex + 1);
            if (foundIndex !== -1) {
              matchCount++;
              lastIndex = foundIndex;
            }
          }
          if (matchCount >= 2 && matchCount / qContent.length >= 0.5) {
            score = Math.round((matchCount / qContent.length) * 100);
            score = Math.min(89, score);
          }
        }

        if (score >= 70) {
          const rawAr = arList.find((x) => x.hadithnumber === enH.hadithnumber);
          const grades: HadithGradeItem[] = (rawAr?.grades || []).map(parseGrade);
          const bookNum = rawAr?.reference?.book ?? 0;
          const hadithInBook = rawAr?.reference?.hadith ?? 0;
          const sections = sectionsCache.get(col) || {};
          const sectionName = sections[String(bookNum)] || (bookNum > 0 ? `Book ${bookNum}` : '');

          matches.push({
            id: `${col}_${enH.hadithnumber}`,
            collection: col,
            collectionArabic: colMeta.arName,
            hadithnumber: enH.hadithnumber,
            arabicnumber: rawAr?.arabicnumber ?? enH.hadithnumber,
            book: bookNum,
            hadithInBook,
            sectionName,
            text: rawAr?.text || '',
            translation: enH.text,
            confidence: score,
            state: score >= 90 ? 'matched' : 'close_match',
            coverage: score === 100 ? 'full' : 'fragment',
            matchedStartWordIndex: 0,
            matchedEndWordIndex: Math.min(15, qTokens.length),
            matchedTokens: qTokens,
            wordMatchStatus: qTokens.map(() => 'exact'),
            hasApproximateMatch: score < 90,
            grades,
            hasNoGrading: grades.length === 0,
            isnadStripped: false,
          });
        }
      }
    }

    const authorityMap: Record<string, number> = {
      bukhari: 1, muslim: 2, abudawud: 3, tirmidhi: 4, nasai: 5, ibnmajah: 6, nawawi: 7
    };
    matches.sort((a, b) => {
      if (b.confidence !== a.confidence) return b.confidence - a.confidence;
      const orderA = authorityMap[a.collection] || 99;
      const orderB = authorityMap[b.collection] || 99;
      if (orderA !== orderB) return orderA - orderB;
      return a.hadithnumber - b.hadithnumber;
    });

    const topConf = matches.length > 0 ? matches[0].confidence : 0;
    const state = topConf >= 90 ? 'matched' : (topConf >= 70 ? 'close_match' : 'not_found');
    const elapsed = Math.round((performance.now() - startTime) * 100) / 100;

    return {
      query: rawQuery,
      normalizedQuery: trimmed,
      query_mode: 'hadith',
      language: 'en',
      state,
      topConfidence: topConf,
      totalMatches: matches.length,
      results: matches.slice(0, 10),
      referralRequired: state === 'not_found' || topConf < 70,
      executionTimeMs: elapsed,
    };
  }

  // Arabic Search
  const normQuery = normalizeArabic(trimmed);
  const cleanQuery = stripHonorificsAndFormulas(normQuery);

  // Fabricated sayings checklist check
  const normalizedQueryClean = cleanQuery.replace(/\s+/g, ' ');
  const fabricatedSayings = [
    {
      keywords: ['الصين', 'اطلبوا العلم ولو بالصين', 'اطلبوا العلم ولو في الصين'],
      matn: 'اطلبوا العلم ولو بالصين',
      ruling: 'لا يصح',
      url: 'https://dorar.net/fake-hadith/38',
      source: 'user-verified on dorar.net'
    },
    {
      keywords: ['حب الوطن من الإيمان'],
      matn: 'حب الوطن من الإيمان',
      ruling: 'ليس بحديث',
      url: 'https://dorar.net/fake-hadith/74',
      source: 'user-verified on dorar.net'
    },
    {
      keywords: ['المعدة بيت الداء', 'الحمية رأس الدواء', 'الحمية رأس كل دواء'],
      matn: 'المعِدة بيت الداء، والحمية رأس الدواء',
      ruling: 'لا أصل له',
      url: 'https://dorar.net/fake-hadith/557',
      source: 'user-verified on dorar.net'
    }
  ];

  const matchedFake = fabricatedSayings.find(f => 
    normalizedQueryClean.includes(normalizeArabic(f.matn)) || 
    f.keywords.some(k => normalizedQueryClean.includes(normalizeArabic(k)))
  );

  if (matchedFake) {
    const elapsed = Math.round((performance.now() - startTime) * 100) / 100;
    return {
      query: rawQuery,
      normalizedQuery: cleanQuery,
      query_mode: 'hadith',
      language: 'ar',
      state: 'not_found',
      topConfidence: 0,
      totalMatches: 0,
      results: [],
      referralRequired: true,
      isCuratedMatched: true,
      curatedMatchedEntry: {
        saying: matchedFake.matn,
        ruling: matchedFake.ruling,
        url: matchedFake.url,
        source: matchedFake.source
      },
      notice: `حديث منتشر لا يصح\nالنص: «${matchedFake.matn}»\nالحكم في الدرر السنية: ${matchedFake.ruling}\nالمصدر: الدرر السنية — أحاديث منتشرة لا تصح\nرابط التحقق: ${matchedFake.url}`,
      executionTimeMs: elapsed,
    };
  }

  const fullQTokens = cleanQuery.split(/\s+/).filter(Boolean);
  const queryNormSet = new Set(fullQTokens);
  const { matn: strippedQueryMatn } = stripIsnadFromNormalized(cleanQuery);
  const qTokens = strippedQueryMatn.split(/\s+/).filter(Boolean);

  // Short-query rule: < 3 words
  if (fullQTokens.length < 3 && qTokens.length < 3) {
    // Check if query exactly matches an entire matn
    // Since we don't have strings in records, we look for token ID array equality
    const qIds = qTokens.map(t => getWordId(t));
    const exactWholeMatn = (qIds.every(id => id !== -1)) ? corpusHadiths.find(h => {
      if (h.m.length !== qIds.length) return false;
      return h.m.every((id, idx) => id === qIds[idx]);
    }) : null;

    if (!exactWholeMatn) {
      const elapsed = Math.round((performance.now() - startTime) * 100) / 100;
      return {
        query: rawQuery,
        normalizedQuery: cleanQuery,
        query_mode: 'hadith',
        language: 'ar',
        state: 'too_short',
        topConfidence: 0,
        totalMatches: 0,
        results: [],
        referralRequired: false,
        notice: 'المدخل قصير جداً للتحقق، يرجى كتابة 3 كلمات أو أكثر',
        executionTimeMs: elapsed,
      };
    }
  }

  // Candidate generation via 2-grams across both full query and stripped matn
  const candidateScores = new Map<number, number>();
  const fullQIds = fullQTokens.map((t) => getWordId(t));
  const qIds = qTokens.map((t) => getWordId(t));

  for (let i = 0; i < fullQTokens.length - 1; i++) {
    const id1 = fullQIds[i];
    const id2 = fullQIds[i + 1];
    if (id1 === -1 || id2 === -1) continue;
    const hits = getIndexHits(id1, id2);
    for (const h of hits) {
      candidateScores.set(h, (candidateScores.get(h) || 0) + 1);
    }
  }

  for (let i = 0; i < qTokens.length - 1; i++) {
    const id1 = qIds[i];
    const id2 = qIds[i + 1];
    if (id1 === -1 || id2 === -1) continue;
    const hits = getIndexHits(id1, id2);
    for (const h of hits) {
      candidateScores.set(h, (candidateScores.get(h) || 0) + 8);
    }
  }

  let candidateIndices: number[] = [];
  if (candidateScores.size > 0) {
    candidateIndices = Array.from(candidateScores.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 25)
      .map((entry) => entry[0]);
  } else if (qIds[0] !== -1 || fullQIds[0] !== -1) {
    const targetId = qIds[0] !== -1 ? qIds[0] : fullQIds[0];
    for (let c = 0; c < corpusHadiths.length; c++) {
      if (corpusHadiths[c].f.includes(targetId)) {
        candidateIndices.push(c);
        if (candidateIndices.length >= 25) break;
      }
    }
  }

  const results: HadithMatchResult[] = [];

  const qTokenize = tokenizeDisplayWords(trimmed);
  const qNonSkipped = qTokenize.nonSkipped;
  const qStripped = stripIsnadTokens(qNonSkipped);
  const matnQTokens = qStripped.matnTokens;

  for (const cIdx of candidateIndices) {
    const record = corpusHadiths[cIdx];

    // Reconstruct raw details from the LoadedCorpus on demand
    const { corpus } = loadCorpus();
    const arList = corpus.hadith.ar[record.c as keyof typeof corpus.hadith.ar] || [];
    const rawAr = arList.find(h => h.hadithnumber === record.n);
    const rawArabicText = rawAr?.text || '';

    // Tokenize the ORIGINAL text once into display words
    const { displayWords, nonSkipped } = tokenizeDisplayWords(rawArabicText);
    if (nonSkipped.length === 0) continue;

    // Fast window extraction
    const windowFull = findBestWindow(qNonSkipped, nonSkipped);
    const qWinFull = findBestQueryWindow(qNonSkipped, windowFull);
    const resFull = alignWordsDP(qWinFull, windowFull);
    let res = resFull;
    let usedMatn = false;

    if (qStripped.isnadStripped && matnQTokens.length >= 3) {
      const windowMatn = findBestWindow(matnQTokens, nonSkipped);
      const qWinMatn = findBestQueryWindow(matnQTokens, windowMatn);
      const resMatn = alignWordsDP(qWinMatn, windowMatn);
      if (resMatn.confidence > resFull.confidence) {
        res = resMatn;
        usedMatn = true;
      }
    }

    if (res.confidence >= 70) {
      const enList = corpus.hadith.en[record.c as keyof typeof corpus.hadith.en] || [];
      const rawEn = enList.find(h => h.hadithnumber === record.n);
      const rawEnglishText = rawEn?.text;
      const grades: HadithGradeItem[] = (rawAr?.grades || []).map(parseGrade);
      const hasNoGrading = grades.length === 0;

      const bookNum = rawAr?.reference?.book ?? 0;
      const hadithInBook = rawAr?.reference?.hadith ?? 0;
      
      const sections = sectionsCache.get(record.c) || {};
      const sectionName = sections[String(bookNum)] || (bookNum > 0 ? `Book ${bookNum}` : '');

      const colMeta = COLLECTION_METADATA[record.c] || { arName: record.c, enName: record.c };

      const hasUnmatchedWord = res.changedWords && res.changedWords.some((w) => w.type !== 'exact');
      const isFullyMatched = !hasUnmatchedWord && !res.hasApproximateMatch && res.confidence >= 90;

      const finalConf = isFullyMatched ? res.confidence : Math.min(89, res.confidence);
      const state: 'matched' | 'close_match' = isFullyMatched ? 'matched' : 'close_match';

      const finalMatchedOriginalIndices = res.matchedOriginalIndices;
      const finalMatchedWords = res.matchedWords;
      const rawStart = finalMatchedOriginalIndices[0] ?? 0;
      const rawEnd = finalMatchedOriginalIndices[finalMatchedOriginalIndices.length - 1] ?? 0;

      results.push({
        id: `${record.c}_${record.n}`,
        collection: record.c,
        collectionArabic: colMeta.arName,
        hadithnumber: record.n,
        arabicnumber: rawAr?.arabicnumber ?? record.n,
        book: bookNum,
        hadithInBook,
        sectionName,
        text: rawArabicText,
        translation: rawEnglishText,
        confidence: finalConf,
        state,
        coverage: finalConf === 100 ? 'full' : 'fragment',
        matchedStartWordIndex: rawStart,
        matchedEndWordIndex: rawEnd,
        matchedTokens: res.matchedTokens && res.matchedTokens.length > 0 ? res.matchedTokens : finalMatchedWords,
        matchedWords: finalMatchedWords,
        matchedOriginalIndices: finalMatchedOriginalIndices,
        wordMatchStatus: res.wordStatus,
        hasApproximateMatch: res.hasApproximateMatch,
        changedWords: res.changedWords,
        grades,
        hasNoGrading,
        isnadStripped: usedMatn && record.r > 0,
      });
    }
  }

  const authorityMap: Record<string, number> = {
    bukhari: 1, muslim: 2, abudawud: 3, tirmidhi: 4, nasai: 5, ibnmajah: 6, nawawi: 7
  };

  results.sort((a, b) => {
    // 1. Contiguous whole query slice match must rank first
    const aWhole = a.state === 'matched' && a.confidence === 100 && (!a.changedWords || a.changedWords.filter(w => w.type !== 'exact').length === 0) && !a.hasApproximateMatch;
    const bWhole = b.state === 'matched' && b.confidence === 100 && (!b.changedWords || b.changedWords.filter(w => w.type !== 'exact').length === 0) && !b.hasApproximateMatch;
    if (aWhole && !bWhole) return -1;
    if (bWhole && !aWhole) return 1;

    // 2. State: matched before close_match
    if (a.state === 'matched' && b.state !== 'matched') return -1;
    if (b.state === 'matched' && a.state !== 'matched') return 1;

    // 3. Score / confidence
    if (b.confidence !== a.confidence) return b.confidence - a.confidence;

    // 4. Matched tokens count (more query words matched beats chain-only overlap)
    const aMatched = a.matchedTokens?.length || 0;
    const bMatched = b.matchedTokens?.length || 0;
    if (bMatched !== aMatched) return bMatched - aMatched;

    // 5. Fixed display ordering by collection name (tie-breaker)
    const orderA = authorityMap[a.collection] || 99;
    const orderB = authorityMap[b.collection] || 99;
    if (orderA !== orderB) return orderA - orderB;

    return a.hadithnumber - b.hadithnumber;
  });

  // Attach attestation cluster to top result
  if (results.length > 0) {
    const topRecord = corpusHadiths.find((h) => `${h.c}_${h.n}` === results[0].id);
    if (topRecord) {
      results[0].attestations = findAttestationCluster(topRecord);
    }
  }

  const topConfidence = results.length > 0 ? results[0].confidence : 0;
  const overallState = results.length === 0 || topConfidence < 70
    ? 'not_found'
    : (results.some((r) => r.state === 'matched') ? 'matched' : 'close_match');

  const elapsed = Math.round((performance.now() - startTime) * 100) / 100;

  return {
    query: rawQuery,
    normalizedQuery: cleanQuery,
    query_mode: 'hadith',
    language: 'ar',
    state: overallState,
    topConfidence,
    totalMatches: results.length,
    results: results.slice(0, 15),
    referralRequired: overallState === 'not_found' || topConfidence < 70,
    executionTimeMs: elapsed,
  };
}
