import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { loadCorpus, getQuranEn, DATA_DIR } from '../corpus/loader.ts';
import { normalizeEnglish } from './hadithMatcher.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export interface SurahMeta {
  chapter: number;
  arabicName: string;
  englishName: string;
  transliteration: string;
  revelation: string;
  totalVerses: number;
}

export interface IndexedAyahEn {
  index: number;
  chapter: number;
  verse: number;
  text: string;
  normalizedText: string;
  words: string[];
  normalizedWords: string[];
  surah: SurahMeta;
}

export interface StreamWordEn {
  chapter: number;
  verse: number;
  wordIndexInAyah: number;
  globalWordIndex: number;
  raw: string;
  normalized: string;
}

export type AyahMatchStateEn = 'matched' | 'close_match' | 'not_found' | 'too_short';
export type CoverageTypeEn = 'full' | 'fragment';
export type WordMatchStateEn = 'exact' | 'approx' | 'none';

export interface ChangedWordItemEn {
  queryWord: string;
  sourceWord: string | null;
  position: number;
}

export interface AyahBreakdownItemEn {
  verse: number;
  text: string;
  confidence: number;
  coverage: CoverageTypeEn;
  coverageRatio: number;
  matchedWordCount: number;
  totalWordCount: number;
  matchedStartWordIndex: number;
  matchedEndWordIndex: number;
  matchedSlice?: string;
  wordMatchStatus?: WordMatchStateEn[];
}

export interface AyahMatchResultEn {
  chapter: number;
  verse: number;
  startVerse?: number;
  endVerse?: number;
  verseRange?: string;
  isRange?: boolean;
  surah: {
    arabic: string;
    english: string;
    revelation: string;
  };
  text: string;
  confidence: number;
  state: 'matched' | 'close_match';
  coverage: CoverageTypeEn;
  coverageRatio: number;
  matchedStartWordIndex: number;
  matchedEndWordIndex: number;
  matchedSlice?: string;
  matchedTokens: string[];
  wordMatchStatus?: WordMatchStateEn[];
  hasApproximateMatch?: boolean;
  changedWords?: ChangedWordItemEn[];
  breakdown?: AyahBreakdownItemEn[];
}

export interface AyahSearchResponseEn {
  query: string;
  normalizedQuery: string;
  query_mode: 'ayah_en';
  state: AyahMatchStateEn;
  topConfidence: number;
  totalMatches: number;
  results: AyahMatchResultEn[];
  referralRequired: boolean;
  referralMessage?: string;
  notice?: string;
  executionTimeMs: number;
}

let indexedAyatEn: IndexedAyahEn[] = [];
let surahMetadataEn: Map<number, SurahMeta> = new Map();
let surahWordStreamsEn: Map<number, StreamWordEn[]> = new Map();
let surahAyatMapEn: Map<number, IndexedAyahEn[]> = new Map();

const exactNormalizedMapEn: Map<string, number[]> = new Map();
const wordPositionIndexEn: Map<string, number[]> = new Map();
const twoGramIndexEn: Map<string, number[]> = new Map();

let isInitializedEn = false;

export function initAyahEngineEn(): { totalIndexed: number } {
  if (isInitializedEn) {
    return { totalIndexed: indexedAyatEn.length };
  }

  const infoRaw = JSON.parse(
    fs.readFileSync(path.join(DATA_DIR, 'quran_info.json'), 'utf8')
  );
  for (const c of infoRaw.chapters || []) {
    surahMetadataEn.set(c.chapter, {
      chapter: c.chapter,
      arabicName: c.arabicname || `سورة ${c.chapter}`,
      englishName: c.englishname || `Chapter ${c.chapter}`,
      transliteration: c.name || `Surah ${c.chapter}`,
      revelation: c.revelation || 'Mecca',
      totalVerses: c.verses ? c.verses.length : 0,
    });
  }

  const enVerses = getQuranEn();

  indexedAyatEn = enVerses.map((v: { chapter: number; verse: number; text: string }, idx: number) => {
    const cleanDisplay = v.text.trim();
    const norm = normalizeEnglish(cleanDisplay);
    const words = cleanDisplay.split(' ').filter(Boolean);
    const normWords = norm.split(' ').filter(Boolean);

    const surah = surahMetadataEn.get(v.chapter) || {
      chapter: v.chapter,
      arabicName: `سورة ${v.chapter}`,
      englishName: `Surah ${v.chapter}`,
      transliteration: `Surah ${v.chapter}`,
      revelation: 'Mecca',
      totalVerses: 0,
    };

    let normList = exactNormalizedMapEn.get(norm);
    if (!normList) {
      normList = [];
      exactNormalizedMapEn.set(norm, normList);
    }
    normList.push(idx);

    return {
      index: idx,
      chapter: v.chapter,
      verse: v.verse,
      text: cleanDisplay,
      normalizedText: norm,
      words,
      normalizedWords: normWords,
      surah,
    };
  });

  // Build continuous word streams per Surah and position indices
  for (let c = 1; c <= 114; c++) {
    surahWordStreamsEn.set(c, []);
    surahAyatMapEn.set(c, []);
  }

  for (let i = 0; i < indexedAyatEn.length; i++) {
    const ayah = indexedAyatEn[i];
    const stream = surahWordStreamsEn.get(ayah.chapter)!;
    const surahAyat = surahAyatMapEn.get(ayah.chapter)!;
    surahAyat.push(ayah);

    for (let w = 0; w < ayah.normalizedWords.length; w++) {
      const globalIndex = stream.length;
      const raw = ayah.words[w] || '';
      const normalized = ayah.normalizedWords[w] || '';

      const wordObj: StreamWordEn = {
        chapter: ayah.chapter,
        verse: ayah.verse,
        wordIndexInAyah: w,
        globalWordIndex: globalIndex,
        raw,
        normalized,
      };

      stream.push(wordObj);

      if (normalized) {
        let posList = wordPositionIndexEn.get(normalized);
        if (!posList) {
          posList = [];
          wordPositionIndexEn.set(normalized, posList);
        }
        posList.push((ayah.chapter << 16) | globalIndex);
      }

      if (w > 0 && ayah.normalizedWords[w - 1]) {
        const prevNorm = ayah.normalizedWords[w - 1];
        const twoGram = `${prevNorm}_${normalized}`;
        let twoList = twoGramIndexEn.get(twoGram);
        if (!twoList) {
          twoList = [];
          twoGramIndexEn.set(twoGram, twoList);
        }
        twoList.push((ayah.chapter << 16) | (globalIndex - 1));
      }
    }
  }

  // Convert inverted index arrays to compact Int32Array
  for (const [k, list] of wordPositionIndexEn) {
    wordPositionIndexEn.set(k, new Int32Array(list) as any);
  }
  for (const [k, list] of twoGramIndexEn) {
    twoGramIndexEn.set(k, new Int32Array(list) as any);
  }
  for (const [k, list] of exactNormalizedMapEn) {
    exactNormalizedMapEn.set(k, new Int32Array(list) as any);
  }

  isInitializedEn = true;
  return { totalIndexed: indexedAyatEn.length };
}

function wordSimilarityEn(qWord: string, sWord: string): { score: number; isExact: boolean } {
  if (qWord === sWord) return { score: 1.0, isExact: true };
  
  // Simple Levenshtein for typo tolerance
  const len1 = qWord.length;
  const len2 = sWord.length;
  if (Math.abs(len1 - len2) > 2) return { score: 0, isExact: false };
  
  const dp = new Array(len2 + 1).fill(0).map((_, i) => i);
  for (let i = 1; i <= len1; i++) {
    let prev = dp[0];
    dp[0] = i;
    for (let j = 1; j <= len2; j++) {
      const cost = qWord[i - 1] === sWord[j - 1] ? 0 : 1;
      const temp = dp[j];
      dp[j] = Math.min(dp[j] + 1, dp[j - 1] + 1, prev + cost);
      prev = temp;
    }
  }
  const dist = dp[len2];
  const maxLen = Math.max(len1, len2);
  const sim = maxLen === 0 ? 1 : 1 - dist / maxLen;
  
  if (sim >= 0.85) return { score: 0.9, isExact: false };
  if (sim >= 0.7) return { score: 0.7, isExact: false };
  return { score: 0, isExact: false };
}

export function searchAyahEn(rawQuery: string): AyahSearchResponseEn {
  if (!isInitializedEn) {
    initAyahEngineEn();
  }

  const startTime = performance.now();
  const trimmed = rawQuery.trim();
  const normalizedQuery = normalizeEnglish(trimmed);
  const queryWords = normalizedQuery.split(' ').filter(Boolean);
  const qWordCount = queryWords.length;

  if (qWordCount === 0) {
    return {
      query: rawQuery,
      normalizedQuery,
      query_mode: 'ayah_en',
      state: 'not_found',
      topConfidence: 0,
      totalMatches: 0,
      results: [],
      referralRequired: true,
      referralMessage: 'No reliable match found, consult scholars',
      executionTimeMs: Math.round((performance.now() - startTime) * 100) / 100,
    };
  }

  // Check for whole ayah match candidates
  const wholeAyahHits = new Set<number>();
  const exactNorm = exactNormalizedMapEn.get(normalizedQuery);
  if (exactNorm) exactNorm.forEach((idx) => wholeAyahHits.add(idx));

  // Query variants for stream scanning
  const queryVariants = [
    { words: queryWords, isBasmalaStripped: false },
  ];

  type CandidateMatchEn = {
    chapter: number;
    startVerse: number;
    endVerse: number;
    startGlobalWord: number;
    endGlobalWord: number;
    confidence: number;
    wordScores: number[];
    wordExactList: boolean[];
    matchedTokens: string[];
    changedWords: ChangedWordItemEn[];
    isBasmalaStripped: boolean;
  };

  const rawCandidateMatches: CandidateMatchEn[] = [];

  for (const variant of queryVariants) {
    const vWords = variant.words;
    const vLen = vWords.length;
    if (vLen === 0) continue;

    const candidateStartsBySurah = new Map<number, Set<number>>();

    // 1. Check 2-grams
    for (let i = 0; i < Math.min(3, vLen - 1); i++) {
      const twoGram = `${vWords[i]}_${vWords[i + 1]}`;
      const hits = twoGramIndexEn.get(twoGram);
      if (hits) {
        for (let j = 0; j < hits.length; j++) {
          const hit = hits[j];
          const ch = hit >> 16;
          const gIdx = hit & 0xFFFF;
          let sSet = candidateStartsBySurah.get(ch);
          if (!sSet) {
            sSet = new Set();
            candidateStartsBySurah.set(ch, sSet);
          }
          sSet.add(Math.max(0, gIdx - i));
        }
      }
    }

    // 2. Check 1-grams
    for (let i = 0; i < Math.min(2, vLen); i++) {
      const hits = wordPositionIndexEn.get(vWords[i]);
      if (hits) {
        for (let j = 0; j < hits.length; j++) {
          const hit = hits[j];
          const ch = hit >> 16;
          const gIdx = hit & 0xFFFF;
          let sSet = candidateStartsBySurah.get(ch);
          if (!sSet) {
            sSet = new Set();
            candidateStartsBySurah.set(ch, sSet);
          }
          sSet.add(Math.max(0, gIdx - i));
        }
      }
    }

    // Also include positions of any whole-ayah hits
    for (const hIdx of wholeAyahHits) {
      const ayah = indexedAyatEn[hIdx];
      const stream = surahWordStreamsEn.get(ayah.chapter);
      if (stream) {
        const firstWIdx = stream.findIndex((w) => w.verse === ayah.verse && w.wordIndexInAyah === 0);
        if (firstWIdx !== -1) {
          let sSet = candidateStartsBySurah.get(ayah.chapter);
          if (!sSet) {
            sSet = new Set();
            candidateStartsBySurah.set(ayah.chapter, sSet);
          }
          sSet.add(firstWIdx);
        }
      }
    }

    for (const [ch, startIndices] of candidateStartsBySurah.entries()) {
      const stream = surahWordStreamsEn.get(ch);
      if (!stream || stream.length === 0) continue;

      for (const startIdx of startIndices) {
        if (startIdx >= stream.length) continue;
        const availableWords = stream.length - startIdx;
        const compareLen = Math.min(vLen, availableWords);
        if (compareLen < Math.min(1, vLen)) continue;

        let totalScore = 0;
        const wordScores: number[] = [];
        const wordExactList: boolean[] = [];
        const matchedTokens: string[] = [];
        const changedWords: ChangedWordItemEn[] = [];

        for (let i = 0; i < vLen; i++) {
          if (startIdx + i < stream.length) {
            const streamWord = stream[startIdx + i];
            const qWord = vWords[i];
            const { score, isExact } = wordSimilarityEn(qWord, streamWord.normalized);
            wordScores.push(score);
            wordExactList.push(isExact);
            totalScore += score;
            if (score >= 0.40) {
              matchedTokens.push(streamWord.raw);
            } else {
              changedWords.push({
                queryWord: qWord,
                sourceWord: streamWord.raw,
                position: i,
              });
            }
          } else {
            wordScores.push(0);
            wordExactList.push(false);
            changedWords.push({
              queryWord: vWords[i],
              sourceWord: null,
              position: i,
            });
          }
        }

        const avgScore = totalScore / vLen;
        const confidence = Math.round(avgScore * 100);

        if (confidence >= 65) {
          const startVerse = stream[startIdx].verse;
          const endGlobal = Math.min(stream.length - 1, startIdx + vLen - 1);
          const endVerse = stream[endGlobal].verse;

          rawCandidateMatches.push({
            chapter: ch,
            startVerse,
            endVerse,
            startGlobalWord: startIdx,
            endGlobalWord: endGlobal,
            confidence,
            wordScores,
            wordExactList,
            matchedTokens,
            changedWords,
            isBasmalaStripped: variant.isBasmalaStripped,
          });
        }
      }
    }
  }

  // Deduplicate matches
  const bestMatchMap = new Map<string, CandidateMatchEn>();
  for (const m of rawCandidateMatches) {
    const key = `${m.chapter}:${m.startVerse}-${m.endVerse}`;
    const existing = bestMatchMap.get(key);
    if (!existing || m.confidence > existing.confidence) {
      bestMatchMap.set(key, m);
    }
  }

  const candidateList = Array.from(bestMatchMap.values());

  if (candidateList.length === 0) {
    const elapsed = Math.round((performance.now() - startTime) * 100) / 100;
    return {
      query: rawQuery,
      normalizedQuery,
      query_mode: 'ayah_en',
      state: 'not_found',
      topConfidence: 0,
      totalMatches: 0,
      results: [],
      referralRequired: true,
      referralMessage: 'No reliable match found, consult scholars',
      executionTimeMs: elapsed,
    };
  }

  let topConfidence = 0;
  for (const m of candidateList) {
    if (m.confidence > topConfidence) {
      topConfidence = m.confidence;
    }
  }

  if (topConfidence < 70) {
    const elapsed = Math.round((performance.now() - startTime) * 100) / 100;
    return {
      query: rawQuery,
      normalizedQuery,
      query_mode: 'ayah_en',
      state: 'not_found',
      topConfidence,
      totalMatches: 0,
      results: [],
      referralRequired: true,
      referralMessage: 'No reliable match found, consult scholars',
      executionTimeMs: elapsed,
    };
  }

  const threshold = Math.max(70, topConfidence - 3);
  const filteredCandidates = candidateList.filter((m) => m.confidence >= threshold);

  const formattedResults: AyahMatchResultEn[] = filteredCandidates.map((m) => {
    const surah = surahMetadataEn.get(m.chapter)!;
    const surahAyat = surahAyatMapEn.get(m.chapter)!;
    const stream = surahWordStreamsEn.get(m.chapter)!;

    const matchedAyat = surahAyat.filter(
      (a) => a.verse >= m.startVerse && a.verse <= m.endVerse
    );

    const breakdown: AyahBreakdownItemEn[] = [];
    let totalAyatWords = 0;
    let totalMatchedWords = 0;

    let overallStartWordIndex = 0;
    let overallEndWordIndex = 0;

    const fullResultWordStatus: WordMatchStateEn[] = [];
    let hasApproximateMatch = false;

    for (let aIdx = 0; aIdx < matchedAyat.length; aIdx++) {
      const ayah = matchedAyat[aIdx];
      const ayahWords = ayah.words;
      const ayahWordStatus: WordMatchStateEn[] = [];

      let ayahMatchedCount = 0;
      let ayahStartIdx = -1;
      let ayahEndIdx = -1;

      for (let w = 0; w < ayahWords.length; w++) {
        const globalIdx = stream.findIndex(
          (sw) => sw.chapter === ayah.chapter && sw.verse === ayah.verse && sw.wordIndexInAyah === w
        );

        let status: WordMatchStateEn = 'none';

        if (globalIdx >= m.startGlobalWord && globalIdx <= m.endGlobalWord) {
          const matchOffset = globalIdx - m.startGlobalWord;
          const score = m.wordScores[matchOffset] ?? 1.0;
          const isExact = m.wordExactList[matchOffset] ?? true;

          if (isExact && score >= 0.95) {
            status = 'exact';
          } else if (score >= 0.40) {
            status = 'approx';
            hasApproximateMatch = true;
          }

          if (status !== 'none') {
            ayahMatchedCount++;
            if (ayahStartIdx === -1) ayahStartIdx = w;
            ayahEndIdx = w;
          }
        }

        ayahWordStatus.push(status);
        fullResultWordStatus.push(status);
      }

      if (ayahStartIdx === -1) ayahStartIdx = 0;
      if (ayahEndIdx === -1) ayahEndIdx = ayahWords.length - 1;

      if (aIdx === 0) overallStartWordIndex = ayahStartIdx;
      if (aIdx === matchedAyat.length - 1) overallEndWordIndex = ayahEndIdx;

      totalAyatWords += ayahWords.length;
      totalMatchedWords += ayahMatchedCount;

      const covRatio = ayahWords.length > 0 ? ayahMatchedCount / ayahWords.length : 0;
      const cov: CoverageTypeEn = covRatio >= 0.85 ? 'full' : 'fragment';

      breakdown.push({
        verse: ayah.verse,
        text: ayah.text,
        confidence: m.confidence,
        coverage: cov,
        coverageRatio: Math.round(covRatio * 100) / 100,
        matchedWordCount: ayahMatchedCount,
        totalWordCount: ayahWords.length,
        matchedStartWordIndex: ayahStartIdx,
        matchedEndWordIndex: ayahEndIdx,
        matchedSlice: ayahWords.slice(ayahStartIdx, ayahEndIdx + 1).join(' '),
        wordMatchStatus: ayahWordStatus,
      });
    }

    const overallCoverageRatio =
      totalAyatWords > 0 ? Math.min(1.0, totalMatchedWords / totalAyatWords) : 0;
    const allAyatFull = breakdown.every((b) => b.coverage === 'full');
    const isSingleAyah = m.startVerse === m.endVerse;

    const coverage: CoverageTypeEn = isSingleAyah
      ? overallCoverageRatio >= 0.85 || qWordCount >= totalAyatWords * 0.85
        ? 'full'
        : 'fragment'
      : allAyatFull
      ? 'full'
      : 'fragment';

    const fullRangeText = matchedAyat.map((a) => a.text).join(' ');

    const verseRange = isSingleAyah ? `${m.startVerse}` : `${m.startVerse}–${m.endVerse}`;

    const hasUnmatchedWord = m.changedWords && m.changedWords.length > 0;
    const isFullyMatched = !hasUnmatchedWord && !hasApproximateMatch && coverage === 'full' && m.confidence >= 90;

    const displayWords: string[] = [];
    const wordGlobalToFullRangeIndex = new Map<number, number>();
    let fullRangeIdx = 0;
    for (const ayah of matchedAyat) {
      for (let w = 0; w < ayah.words.length; w++) {
        const swIdx = stream.findIndex(
          (sw) => sw.chapter === ayah.chapter && sw.verse === ayah.verse && sw.wordIndexInAyah === w
        );
        if (swIdx !== -1) {
          wordGlobalToFullRangeIndex.set(swIdx, fullRangeIdx);
        }
        displayWords.push(ayah.words[w]);
        fullRangeIdx++;
      }
    }

    const matchedOriginalIndices: number[] = [];
    const matchedWords: string[] = [];
    for (let swIdx = m.startGlobalWord; swIdx <= m.endGlobalWord; swIdx++) {
      const frIdx = wordGlobalToFullRangeIndex.get(swIdx);
      if (frIdx !== undefined) {
        matchedOriginalIndices.push(frIdx);
        matchedWords.push(displayWords[frIdx]);
      }
    }

    return {
      chapter: m.chapter,
      verse: m.startVerse,
      startVerse: m.startVerse,
      endVerse: m.endVerse,
      verseRange,
      isRange: !isSingleAyah,
      surah: {
        arabic: surah.arabicName,
        english: surah.englishName,
        revelation: surah.revelation,
      },
      text: fullRangeText,
      confidence: isFullyMatched ? m.confidence : Math.min(89, m.confidence),
      state: isFullyMatched ? 'matched' : 'close_match',
      changedWords: m.changedWords || [],
      coverage,
      coverageRatio: Math.round(overallCoverageRatio * 100) / 100,
      matchedStartWordIndex: matchedOriginalIndices[0] ?? 0,
      matchedEndWordIndex: matchedOriginalIndices[matchedOriginalIndices.length - 1] ?? 0,
      matchedSlice: fullRangeText,
      matchedTokens: m.matchedTokens,
      matchedWords,
      matchedOriginalIndices,
      wordMatchStatus: fullResultWordStatus,
      hasApproximateMatch,
      breakdown,
    };
  });

  formattedResults.sort((a, b) => {
    if (a.coverage === 'full' && b.coverage !== 'full') return -1;
    if (b.coverage === 'full' && a.coverage !== 'full') return 1;
    if (b.confidence !== a.confidence) return b.confidence - a.confidence;
    if (a.chapter !== b.chapter) return a.chapter - b.chapter;
    return (a.startVerse || a.verse) - (b.startVerse || b.verse);
  });

  if (qWordCount < 3) {
    const fullMatches = formattedResults.filter((r) => r.coverage === 'full');
    if (fullMatches.length === 0) {
      const elapsed = Math.round((performance.now() - startTime) * 100) / 100;
      return {
        query: rawQuery,
        normalizedQuery,
        query_mode: 'ayah_en',
        state: 'too_short',
        topConfidence: 0,
        totalMatches: 0,
        results: [],
        referralRequired: false,
        notice: 'Input too short for verification, please enter 3 or more words',
        executionTimeMs: elapsed,
      };
    }
  }

  const overallTopConfidence =
    formattedResults.length > 0 ? formattedResults[0].confidence : topConfidence;
  const overallState: AyahMatchStateEn =
    formattedResults.some((r) => r.state === 'matched') ? 'matched' : 'close_match';

  const elapsed = Math.round((performance.now() - startTime) * 100) / 100;

  return {
    query: rawQuery,
    normalizedQuery,
    query_mode: 'ayah_en',
    state: overallState,
    topConfidence: overallTopConfidence,
    totalMatches: formattedResults.length,
    results: formattedResults,
    referralRequired: false,
    executionTimeMs: elapsed,
  };
}