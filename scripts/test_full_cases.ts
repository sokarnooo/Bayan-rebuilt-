import fs from 'fs';
import { loadCorpus } from '../server/corpus/loader.ts';
import { initHadithEngine } from '../server/matching/hadithMatcher.ts';
import { initAyahEngine, searchAyah } from '../server/matching/ayahMatcher.ts';
import { normalizeArabic, levenshteinDistance } from '../server/matching/normalizer.ts';

initHadithEngine();
initAyahEngine();
const { corpus } = loadCorpus();

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

export function alignWithDP(
  queryTokens: { word: string; normalized: string }[],
  sourceTokens: { word: string; normalized: string; originalIndex: number }[]
) {
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
    back[i][0] = 2; // query word deleted
  }
  for (let j = 1; j <= n; j++) {
    dp[0][j] = j * 1.0;
    back[0][j] = 3; // source word inserted
  }

  for (let i = 1; i <= m; i++) {
    const qw = queryTokens[i - 1].normalized;
    for (let j = 1; j <= n; j++) {
      const sw = sourceTokens[j - 1].normalized;

      let subCost = 3.0;
      if (qw === sw || qw.replace(/ء/g, 'ا') === sw.replace(/ء/g, 'ا')) {
        subCost = 0;
      } else {
        const dist = levenshteinDistance(qw, sw);
        if (dist <= 1) {
          subCost = 0.5; // approximate
        } else {
          subCost = 2.5; // mismatch
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
  for (let j = Math.max(1, m - 3); j <= n; j++) {
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

  while (currI > 0 || currJ > 0) {
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
    } else if (currI > 0 && (currJ === 0 || back[currI][currJ] === 2)) {
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
  const changedWords: any[] = [];
  let hasApproximateMatch = false;

  for (const step of steps) {
    if (step.type === 'exact') {
      if (step.sourceOriginalIndex !== undefined) {
        matchedOriginalIndices.push(step.sourceOriginalIndex);
        matchedWords.push(step.sourceWord!);
        matchedTokens.push(normalizeArabic(step.sourceWord!));
      }
      wordStatus.push('exact');
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
      if (step.sourceOriginalIndex !== undefined) {
        matchedOriginalIndices.push(step.sourceOriginalIndex);
        matchedWords.push(step.sourceWord!);
        matchedTokens.push(normalizeArabic(step.sourceWord!));
      }
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
    steps,
    matchedTokens,
    matchedWords,
    matchedOriginalIndices,
    wordStatus,
    changedWords,
    hasApproximateMatch,
  };
}

console.log("Ready to test!");
