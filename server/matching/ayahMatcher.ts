import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  normalizeArabic,
  toAlefInvariant,
  levenshteinSimilarity,
  slidingWindowSimilarity,
} from './normalizer.ts';

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

export interface IndexedAyah {
  index: number;
  chapter: number;
  verse: number;
  text: string;
  enText: string;
  normalizedText: string;
  alefInvariant: string;
  tokens: string[];
  alefInvariantTokens: string[];
  alefTokenSet: Set<string>;
  surah: SurahMeta;
}

export type AyahMatchState = 'matched' | 'close_match' | 'not_found' | 'too_short';
export type CoverageType = 'full' | 'fragment';

export interface AyahMatchResult {
  chapter: number;
  verse: number;
  surah: {
    arabic: string;
    english: string;
    revelation: string;
  };
  text: string;
  translation: string;
  confidence: number;
  state: 'matched' | 'close_match';
  coverage: CoverageType;
  coverageRatio: number;
  matchedSlice?: string;
  matchedTokens: string[];
}

export interface AyahSearchResponse {
  query: string;
  normalizedQuery: string;
  alefInvariantQuery: string;
  state: AyahMatchState;
  topConfidence: number;
  totalMatches: number;
  results: AyahMatchResult[];
  referralRequired: boolean;
  referralMessage?: string;
  notice?: string;
  executionTimeMs: number;
}

const DATA_DIR = path.resolve(__dirname, '../corpus/data');

let indexedAyat: IndexedAyah[] = [];
let surahMetadata: Map<number, SurahMeta> = new Map();
// Map exact alefInvariant string -> array of ayah indices (for O(1) exact matching & duplicates)
const exactAlefMap: Map<string, number[]> = new Map();
// Inverted index for words
const invertedIndex: Map<string, number[]> = new Map();
let isInitialized = false;

export function initAyahEngine(): void {
  if (isInitialized) return;

  const infoRaw = JSON.parse(
    fs.readFileSync(path.join(DATA_DIR, 'quran_info.json'), 'utf8')
  );
  for (const c of infoRaw.chapters || []) {
    surahMetadata.set(c.chapter, {
      chapter: c.chapter,
      arabicName: c.arabicname || `سورة ${c.chapter}`,
      englishName: c.englishname || `Chapter ${c.chapter}`,
      transliteration: c.name || `Surah ${c.chapter}`,
      revelation: c.revelation || 'Mecca',
      totalVerses: c.verses ? c.verses.length : 0,
    });
  }

  const arRaw = JSON.parse(
    fs.readFileSync(path.join(DATA_DIR, 'quran_ar.json'), 'utf8')
  );
  const enRaw = JSON.parse(
    fs.readFileSync(path.join(DATA_DIR, 'quran_en.json'), 'utf8')
  );

  const arVerses = arRaw.quran || arRaw[Object.keys(arRaw)[0]];
  const enVerses = enRaw.quran || enRaw[Object.keys(enRaw)[0]];

  const enMap = new Map<string, string>();
  for (const v of enVerses) {
    enMap.set(`${v.chapter}:${v.verse}`, v.text);
  }

  indexedAyat = arVerses.map((v: { chapter: number; verse: number; text: string }, idx: number) => {
    const norm = normalizeArabic(v.text);
    const alefInv = toAlefInvariant(norm);
    const tokens = norm.split(' ').filter(Boolean);
    const alefTokens = alefInv.split(' ').filter(Boolean);
    const alefTokenSet = new Set(alefTokens);

    const surah = surahMetadata.get(v.chapter) || {
      chapter: v.chapter,
      arabicName: `سورة ${v.chapter}`,
      englishName: `Surah ${v.chapter}`,
      transliteration: `Surah ${v.chapter}`,
      revelation: 'Mecca',
      totalVerses: 0,
    };

    let exactList = exactAlefMap.get(alefInv);
    if (!exactList) {
      exactList = [];
      exactAlefMap.set(alefInv, exactList);
    }
    exactList.push(idx);

    for (const t of alefTokenSet) {
      let list = invertedIndex.get(t);
      if (!list) {
        list = [];
        invertedIndex.set(t, list);
      }
      list.push(idx);
    }

    return {
      index: idx,
      chapter: v.chapter,
      verse: v.verse,
      text: v.text,
      enText: enMap.get(`${v.chapter}:${v.verse}`) || '',
      normalizedText: norm,
      alefInvariant: alefInv,
      tokens,
      alefInvariantTokens: alefTokens,
      alefTokenSet,
      surah,
    };
  });

  isInitialized = true;
}

export function searchAyah(rawQuery: string): AyahSearchResponse {
  if (!isInitialized) {
    initAyahEngine();
  }

  const startTime = performance.now();
  const normalizedQuery = normalizeArabic(rawQuery);
  const alefInvariantQuery = toAlefInvariant(normalizedQuery);

  const queryTokens = normalizedQuery.split(' ').filter(Boolean);
  const queryAlefTokens = alefInvariantQuery.split(' ').filter(Boolean);
  const qWordCount = queryTokens.length;

  if (qWordCount === 0 || alefInvariantQuery.length < 1) {
    return {
      query: rawQuery,
      normalizedQuery,
      alefInvariantQuery,
      state: 'not_found',
      topConfidence: 0,
      totalMatches: 0,
      results: [],
      referralRequired: true,
      referralMessage: 'لم يتم العثور على تطابق موثوق، راجع أهل العلم',
      executionTimeMs: Math.round((performance.now() - startTime) * 100) / 100,
    };
  }

  // --- RULE 4: Short-query guard (< 3 normalized words) ---
  if (qWordCount < 3) {
    const exactMatchIndices = exactAlefMap.get(alefInvariantQuery);
    if (exactMatchIndices && exactMatchIndices.length > 0) {
      const results: AyahMatchResult[] = exactMatchIndices.map((idx) => {
        const a = indexedAyat[idx];
        return {
          chapter: a.chapter,
          verse: a.verse,
          surah: {
            arabic: a.surah.arabicName,
            english: a.surah.englishName,
            revelation: a.surah.revelation,
          },
          text: a.text,
          translation: a.enText,
          confidence: 100,
          state: 'matched',
          coverage: 'full',
          coverageRatio: 1.0,
          matchedSlice: a.text,
          matchedTokens: queryTokens,
        };
      });

      return {
        query: rawQuery,
        normalizedQuery,
        alefInvariantQuery,
        state: 'matched',
        topConfidence: 100,
        totalMatches: results.length,
        results,
        referralRequired: false,
        executionTimeMs: Math.round((performance.now() - startTime) * 100) / 100,
      };
    }

    return {
      query: rawQuery,
      normalizedQuery,
      alefInvariantQuery,
      state: 'too_short',
      topConfidence: 0,
      totalMatches: 0,
      results: [],
      referralRequired: false,
      notice: 'المدخل قصير جداً للتحقق، يرجى كتابة 3 كلمات أو أكثر',
      executionTimeMs: Math.round((performance.now() - startTime) * 100) / 100,
    };
  }

  // --- FAST PATH 1: O(1) Exact whole ayah match ---
  const exactHits = exactAlefMap.get(alefInvariantQuery);
  if (exactHits && exactHits.length > 0) {
    const results: AyahMatchResult[] = exactHits.map((idx) => {
      const a = indexedAyat[idx];
      return {
        chapter: a.chapter,
        verse: a.verse,
        surah: {
          arabic: a.surah.arabicName,
          english: a.surah.englishName,
          revelation: a.surah.revelation,
        },
        text: a.text,
        translation: a.enText,
        confidence: 100,
        state: 'matched',
        coverage: 'full',
        coverageRatio: 1.0,
        matchedSlice: a.text,
        matchedTokens: queryTokens,
      };
    });

    return {
      query: rawQuery,
      normalizedQuery,
      alefInvariantQuery,
      state: 'matched',
      topConfidence: 100,
      totalMatches: results.length,
      results,
      referralRequired: false,
      executionTimeMs: Math.round((performance.now() - startTime) * 100) / 100,
    };
  }

  // --- NORMAL MATCHING FOR >= 3 WORDS ---
  const candidateScores = new Map<number, number>();

  for (let i = 0; i < queryAlefTokens.length; i++) {
    const qt = queryAlefTokens[i];
    const directHits = invertedIndex.get(qt);
    if (directHits) {
      const weight = qt.length <= 2 ? 0.3 : 1.0;
      for (let j = 0; j < directHits.length; j++) {
        const aIdx = directHits[j];
        candidateScores.set(aIdx, (candidateScores.get(aIdx) || 0) + weight);
      }
    }
  }

  const topCandidates = Array.from(candidateScores.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 60);

  type Evaluated = {
    ayah: IndexedAyah;
    confidence: number;
    rawScore: number;
    coverage: CoverageType;
    coverageRatio: number;
    matchedSlice: string;
    matchedTokens: string[];
  };

  const evaluated: Evaluated[] = [];
  const qLen = alefInvariantQuery.length;

  for (let i = 0; i < topCandidates.length; i++) {
    const [aIdx] = topCandidates[i];
    const ayah = indexedAyat[aIdx];
    const target = ayah.alefInvariant;
    const tLen = target.length;

    let matchingTokenCount = 0;
    const matchedTokens: string[] = [];
    for (let t = 0; t < queryAlefTokens.length; t++) {
      if (ayah.alefTokenSet.has(queryAlefTokens[t])) {
        matchingTokenCount++;
        matchedTokens.push(queryTokens[t] || queryAlefTokens[t]);
      }
    }

    const tokenOverlap =
      queryAlefTokens.length > 0 ? matchingTokenCount / queryAlefTokens.length : 0;
    const ayahWordCount = ayah.alefInvariantTokens.length;
    const coverageRatio =
      ayahWordCount > 0 ? Math.min(1, matchingTokenCount / ayahWordCount) : 0;
    const coverage: CoverageType =
      coverageRatio >= 0.85 || qWordCount >= ayahWordCount * 0.85
        ? 'full'
        : 'fragment';

    // 1. Exact whole ayah match
    if (target === alefInvariantQuery) {
      evaluated.push({
        ayah,
        confidence: 100,
        rawScore: 1.0,
        coverage: 'full',
        coverageRatio: 1.0,
        matchedSlice: ayah.text,
        matchedTokens: queryTokens,
      });
      continue;
    }

    // 2. Exact substring match
    if (target.includes(alefInvariantQuery)) {
      const isFull = qWordCount >= ayahWordCount * 0.85;
      evaluated.push({
        ayah,
        confidence: 100,
        rawScore: 1.0,
        coverage: isFull ? 'full' : 'fragment',
        coverageRatio: isFull ? 1.0 : coverageRatio,
        matchedSlice: alefInvariantQuery,
        matchedTokens,
      });
      continue;
    }

    // 3. Full sequence Levenshtein if lengths are close
    let sFull = 0;
    if (Math.abs(qLen - tLen) <= Math.max(8, Math.round(qLen * 0.15))) {
      sFull = levenshteinSimilarity(alefInvariantQuery, target);
      if (sFull >= 0.90) {
        const conf = Math.round(sFull * 100);
        evaluated.push({
          ayah,
          confidence: conf,
          rawScore: sFull,
          coverage: 'full',
          coverageRatio: 1.0,
          matchedSlice: ayah.text,
          matchedTokens,
        });
        continue;
      }
    }

    // 4. Sliding window Levenshtein on Alef-invariant string
    let sw = { similarity: 0, bestSlice: '' };
    if (tokenOverlap >= 0.20) {
      sw = slidingWindowSimilarity(alefInvariantQuery, target);
    }

    const combined = Math.max(sFull, 0.70 * sw.similarity + 0.30 * tokenOverlap);
    let finalScore = combined;

    if (queryAlefTokens.length >= 3 && tokenOverlap < 0.30 && sw.similarity < 0.75) {
      finalScore *= 0.3;
    }

    const confidence = Math.round(finalScore * 100);

    if (confidence >= 65) {
      evaluated.push({
        ayah,
        confidence,
        rawScore: finalScore,
        coverage,
        coverageRatio,
        matchedSlice: sw.bestSlice || ayah.text,
        matchedTokens,
      });
    }
  }

  let topConfidence = 0;
  for (let i = 0; i < evaluated.length; i++) {
    if (evaluated[i].confidence > topConfidence) {
      topConfidence = evaluated[i].confidence;
    }
  }

  if (topConfidence < 70) {
    const elapsed = Math.round((performance.now() - startTime) * 100) / 100;
    return {
      query: rawQuery,
      normalizedQuery,
      alefInvariantQuery,
      state: 'not_found',
      topConfidence,
      totalMatches: 0,
      results: [],
      referralRequired: true,
      referralMessage: 'لم يتم العثور على تطابق موثوق، راجع أهل العلم',
      executionTimeMs: elapsed,
    };
  }

  const threshold = Math.max(70, topConfidence - 2);
  const filtered = evaluated.filter((e) => e.confidence >= threshold);

  filtered.sort((a, b) => {
    if (b.confidence !== a.confidence) {
      return b.confidence - a.confidence;
    }
    if (a.ayah.chapter !== b.ayah.chapter) {
      return a.ayah.chapter - b.ayah.chapter;
    }
    return a.ayah.verse - b.ayah.verse;
  });

  const overallState: AyahMatchState = topConfidence >= 90 ? 'matched' : 'close_match';

  const results: AyahMatchResult[] = filtered.map((c) => ({
    chapter: c.ayah.chapter,
    verse: c.ayah.verse,
    surah: {
      arabic: c.ayah.surah.arabicName,
      english: c.ayah.surah.englishName,
      revelation: c.ayah.surah.revelation,
    },
    text: c.ayah.text,
    translation: c.ayah.enText,
    confidence: c.confidence,
    state: c.confidence >= 90 ? 'matched' : 'close_match',
    coverage: c.coverage,
    coverageRatio: Math.round(c.coverageRatio * 100) / 100,
    matchedSlice: c.matchedSlice,
    matchedTokens: c.matchedTokens,
  }));

  const elapsed = Math.round((performance.now() - startTime) * 100) / 100;

  return {
    query: rawQuery,
    normalizedQuery,
    alefInvariantQuery,
    state: overallState,
    topConfidence,
    totalMatches: results.length,
    results,
    referralRequired: false,
    executionTimeMs: elapsed,
  };
}
