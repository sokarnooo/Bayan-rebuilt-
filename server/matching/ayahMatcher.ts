import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  normalizeArabic,
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
  tokens: string[];
  tokenSet: Set<string>;
  surah: SurahMeta;
}

export type AyahMatchState = 'matched' | 'close_match' | 'not_found';

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
  matchedSlice?: string;
}

export interface AyahSearchResponse {
  query: string;
  normalizedQuery: string;
  state: AyahMatchState;
  topConfidence: number;
  totalMatches: number;
  results: AyahMatchResult[];
  referralRequired: boolean;
  referralMessage?: string;
  executionTimeMs: number;
}

const DATA_DIR = path.resolve(__dirname, '../corpus/data');

let indexedAyat: IndexedAyah[] = [];
let surahMetadata: Map<number, SurahMeta> = new Map();
const invertedIndex: Map<string, number[]> = new Map();
let isInitialized = false;

export function initAyahEngine(): void {
  if (isInitialized) return;

  // 1. Load Quran Info (Surah Metadata)
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

  // 2. Load Quran Arabic & English editions
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

  // 3. Pre-normalize all 6,236 ayat and populate inverted index
  indexedAyat = arVerses.map((v: { chapter: number; verse: number; text: string }, idx: number) => {
    const norm = normalizeArabic(v.text);
    const tokens = norm.split(' ').filter(Boolean);
    const surah = surahMetadata.get(v.chapter) || {
      chapter: v.chapter,
      arabicName: `سورة ${v.chapter}`,
      englishName: `Surah ${v.chapter}`,
      transliteration: `Surah ${v.chapter}`,
      revelation: 'Mecca',
      totalVerses: 0,
    };

    const tokenSet = new Set(tokens);

    for (const t of tokenSet) {
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
      tokens,
      tokenSet,
      surah,
    };
  });

  isInitialized = true;
}

/**
 * High Performance Ayah Matcher: Sub-5ms search with high precision and scholar referral.
 */
export function searchAyah(rawQuery: string): AyahSearchResponse {
  if (!isInitialized) {
    initAyahEngine();
  }

  const startTime = performance.now();
  const normalizedQuery = normalizeArabic(rawQuery);

  if (!normalizedQuery || normalizedQuery.length < 2) {
    return {
      query: rawQuery,
      normalizedQuery,
      state: 'not_found',
      topConfidence: 0,
      totalMatches: 0,
      results: [],
      referralRequired: true,
      referralMessage: 'لم يتم العثور على تطابق موثوق، راجع أهل العلم',
      executionTimeMs: Math.round((performance.now() - startTime) * 100) / 100,
    };
  }

  const queryTokens = normalizedQuery.split(' ').filter(Boolean);
  const qLen = normalizedQuery.length;

  // Step 1: Collect candidate ayat via Inverted Word Index
  const candidateScores = new Map<number, number>();

  for (let i = 0; i < queryTokens.length; i++) {
    const qt = queryTokens[i];
    const directHits = invertedIndex.get(qt);
    if (directHits) {
      // Weight non-stopwords higher
      const weight = (qt.length <= 2) ? 0.4 : 1.0;
      for (let j = 0; j < directHits.length; j++) {
        const aIdx = directHits[j];
        candidateScores.set(aIdx, (candidateScores.get(aIdx) || 0) + weight);
      }
    }
  }

  // Fast check for exact whole query substring containment across indexed ayat
  const exactSubstringAyat: number[] = [];
  for (let i = 0; i < indexedAyat.length; i++) {
    if (indexedAyat[i].normalizedText.includes(normalizedQuery)) {
      exactSubstringAyat.push(i);
      candidateScores.set(i, (candidateScores.get(i) || 0) + 10);
    }
  }

  // Sort candidate pool and select top 60 candidates for intensive scoring
  const topCandidateEntries = Array.from(candidateScores.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 75);

  type Evaluated = {
    ayah: IndexedAyah;
    confidence: number;
    rawScore: number;
    matchedSlice: string;
  };

  const evaluated: Evaluated[] = [];

  // Step 2: Score top candidates
  for (let i = 0; i < topCandidateEntries.length; i++) {
    const [aIdx, tokenHitScore] = topCandidateEntries[i];
    const ayah = indexedAyat[aIdx];
    const normAyah = ayah.normalizedText;
    const aLen = normAyah.length;

    // Exact whole ayah match
    if (normAyah === normalizedQuery) {
      evaluated.push({
        ayah,
        confidence: 100,
        rawScore: 1.0,
        matchedSlice: ayah.text,
      });
      continue;
    }

    // Exact substring match
    const exactSubIdx = normAyah.indexOf(normalizedQuery);
    if (exactSubIdx !== -1) {
      const ratio = qLen / aLen;
      const confidence = Math.min(100, Math.round(95 + ratio * 5));
      evaluated.push({
        ayah,
        confidence,
        rawScore: confidence / 100,
        matchedSlice: normalizedQuery,
      });
      continue;
    }

    // Measure exact token intersection
    let matchingTokens = 0;
    for (let t = 0; t < queryTokens.length; t++) {
      if (ayah.tokenSet.has(queryTokens[t])) {
        matchingTokens++;
      }
    }

    const tokenOverlap = queryTokens.length > 0 ? matchingTokens / queryTokens.length : 0;

    // Full similarity if lengths are close
    let sFull = 0;
    if (Math.abs(qLen - aLen) <= Math.max(8, Math.round(qLen * 0.15))) {
      sFull = levenshteinSimilarity(normalizedQuery, normAyah);
      if (sFull >= 0.90) {
        const conf = Math.round(sFull * 100);
        evaluated.push({
          ayah,
          confidence: conf,
          rawScore: sFull,
          matchedSlice: ayah.text,
        });
        continue;
      }
    }

    // Sliding window check on candidates with meaningful token overlap
    let sw = { similarity: 0, bestSlice: '' };
    if (tokenOverlap >= 0.20 || queryTokens.length <= 2) {
      sw = slidingWindowSimilarity(normalizedQuery, normAyah);
    }

    const combined = Math.max(sFull, 0.70 * sw.similarity + 0.30 * tokenOverlap);
    let finalScore = combined;

    if (queryTokens.length >= 3 && tokenOverlap < 0.30 && sw.similarity < 0.75) {
      finalScore *= 0.4; // Dampen proverbs / non-Quranic text
    }

    const confidence = Math.round(finalScore * 100);

    if (confidence >= 65) {
      evaluated.push({
        ayah,
        confidence,
        rawScore: finalScore,
        matchedSlice: sw.bestSlice || ayah.text,
      });
    }
  }

  // Find top confidence
  let topConfidence = 0;
  for (let i = 0; i < evaluated.length; i++) {
    if (evaluated[i].confidence > topConfidence) {
      topConfidence = evaluated[i].confidence;
    }
  }

  // Below 70% -> scholar referral
  if (topConfidence < 70) {
    const elapsed = Math.round((performance.now() - startTime) * 100) / 100;
    return {
      query: rawQuery,
      normalizedQuery,
      state: 'not_found',
      topConfidence,
      totalMatches: 0,
      results: [],
      referralRequired: true,
      referralMessage: 'لم يتم العثور على تطابق موثوق، راجع أهل العلم',
      executionTimeMs: elapsed,
    };
  }

  // Multi-occurrence: within 0.02 of top score
  const threshold = Math.max(70, topConfidence - 2);
  const filtered = evaluated.filter((e) => e.confidence >= threshold);

  // Sort by confidence descending, then by chapter & verse ascending
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
    matchedSlice: c.matchedSlice,
  }));

  const elapsed = Math.round((performance.now() - startTime) * 100) / 100;

  return {
    query: rawQuery,
    normalizedQuery,
    state: overallState,
    topConfidence,
    totalMatches: results.length,
    results,
    referralRequired: false,
    executionTimeMs: elapsed,
  };
}
