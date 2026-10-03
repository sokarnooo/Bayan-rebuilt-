import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  normalizeArabic,
  toAlefInvariant,
  cleanWhitespaceBeforeCombiningMarks,
  wordSimilarityCorpusDerived,
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
  rawWords: string[];
  normalizedWords: string[];
  alefInvariantWords: string[];
  surah: SurahMeta;
}

export interface StreamWord {
  chapter: number;
  verse: number;
  wordIndexInAyah: number;
  globalWordIndex: number;
  rawUthmani: string;
  normalized: string;
  alefInvariant: string;
}

export type AyahMatchState = 'matched' | 'close_match' | 'not_found' | 'too_short';
export type CoverageType = 'full' | 'fragment';
export type WordMatchState = 'exact' | 'approx' | 'none';

export interface AyahBreakdownItem {
  verse: number;
  text: string;
  translation: string;
  confidence: number;
  coverage: CoverageType;
  coverageRatio: number;
  matchedWordCount: number;
  totalWordCount: number;
  matchedStartWordIndex: number;
  matchedEndWordIndex: number;
  matchedSlice?: string;
  wordMatchStatus?: WordMatchState[];
}

export interface AyahMatchResult {
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
  translation: string;
  confidence: number;
  state: 'matched' | 'close_match';
  coverage: CoverageType;
  coverageRatio: number;
  matchedStartWordIndex: number;
  matchedEndWordIndex: number;
  matchedSlice?: string;
  matchedTokens: string[];
  wordMatchStatus?: WordMatchState[];
  hasApproximateMatch?: boolean;
  breakdown?: AyahBreakdownItem[];
  leadingBasmalaIgnored?: boolean;
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
let surahWordStreams: Map<number, StreamWord[]> = new Map();
let surahAyatMap: Map<number, IndexedAyah[]> = new Map();

// Map exact normalized string & alefInvariant string -> array of ayah indices
const exactNormalizedMap: Map<string, number[]> = new Map();
const exactAlefMap: Map<string, number[]> = new Map();

// Inverted index for word tokens -> { chapter, globalIndex }
const wordPositionIndex: Map<string, Array<{ chapter: number; globalIndex: number }>> = new Map();
const twoGramIndex: Map<string, Array<{ chapter: number; globalIndex: number }>> = new Map();

let isInitialized = false;

export function initAyahEngine(): { totalIndexed: number } {
  if (isInitialized) {
    return { totalIndexed: indexedAyat.length };
  }

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
    let cleanDisplay = cleanWhitespaceBeforeCombiningMarks(v.text);
    // Remove standalone decorative section markers from word tokenization
    cleanDisplay = cleanDisplay.replace(/[\u06DE\u06E9\u06DD\uFD3E\uFD3F]/g, ' ').replace(/\s+/g, ' ').trim();
    const norm = normalizeArabic(cleanDisplay);
    const alefInv = toAlefInvariant(norm);

    const rawWords = cleanDisplay.split(' ').filter(Boolean);
    const normWords = norm.split(' ').filter(Boolean);
    const alefWords = alefInv.split(' ').filter(Boolean);

    const surah = surahMetadata.get(v.chapter) || {
      chapter: v.chapter,
      arabicName: `سورة ${v.chapter}`,
      englishName: `Surah ${v.chapter}`,
      transliteration: `Surah ${v.chapter}`,
      revelation: 'Mecca',
      totalVerses: 0,
    };

    let normList = exactNormalizedMap.get(norm);
    if (!normList) {
      normList = [];
      exactNormalizedMap.set(norm, normList);
    }
    normList.push(idx);

    let exactList = exactAlefMap.get(alefInv);
    if (!exactList) {
      exactList = [];
      exactAlefMap.set(alefInv, exactList);
    }
    exactList.push(idx);

    return {
      index: idx,
      chapter: v.chapter,
      verse: v.verse,
      text: cleanDisplay,
      enText: enMap.get(`${v.chapter}:${v.verse}`) || '',
      normalizedText: norm,
      alefInvariant: alefInv,
      rawWords,
      normalizedWords: normWords,
      alefInvariantWords: alefWords,
      surah,
    };
  });

  // Build continuous word streams per Surah and position indices
  for (let c = 1; c <= 114; c++) {
    surahWordStreams.set(c, []);
    surahAyatMap.set(c, []);
  }

  for (let i = 0; i < indexedAyat.length; i++) {
    const ayah = indexedAyat[i];
    const stream = surahWordStreams.get(ayah.chapter)!;
    const surahAyat = surahAyatMap.get(ayah.chapter)!;
    surahAyat.push(ayah);

    for (let w = 0; w < ayah.normalizedWords.length; w++) {
      const globalIndex = stream.length;
      const rawUthmani = ayah.rawWords[w] || '';
      const normalized = ayah.normalizedWords[w] || '';
      const alefInvariant = ayah.alefInvariantWords[w] || '';

      const wordObj: StreamWord = {
        chapter: ayah.chapter,
        verse: ayah.verse,
        wordIndexInAyah: w,
        globalWordIndex: globalIndex,
        rawUthmani,
        normalized,
        alefInvariant,
      };

      stream.push(wordObj);

      if (alefInvariant) {
        let posList = wordPositionIndex.get(alefInvariant);
        if (!posList) {
          posList = [];
          wordPositionIndex.set(alefInvariant, posList);
        }
        posList.push({ chapter: ayah.chapter, globalIndex });
      }

      if (w > 0 && ayah.alefInvariantWords[w - 1]) {
        const prevAlef = ayah.alefInvariantWords[w - 1];
        const twoGram = `${prevAlef}_${alefInvariant}`;
        let twoList = twoGramIndex.get(twoGram);
        if (!twoList) {
          twoList = [];
          twoGramIndex.set(twoGram, twoList);
        }
        twoList.push({ chapter: ayah.chapter, globalIndex: globalIndex - 1 });
      }
    }
  }

  isInitialized = true;
  return { totalIndexed: indexedAyat.length };
}

const BASMALA_NORM = normalizeArabic('بسم الله الرحمن الرحيم');
const BASMALA_ALEF = toAlefInvariant(BASMALA_NORM);

export function searchAyah(rawQuery: string): AyahSearchResponse {
  if (!isInitialized) {
    initAyahEngine();
  }

  const startTime = performance.now();
  const trimmed = rawQuery.trim();
  const normalizedQuery = normalizeArabic(trimmed);
  const alefInvariantQuery = toAlefInvariant(normalizedQuery);

  const queryWords = normalizedQuery.split(' ').filter(Boolean);
  const queryAlefWords = alefInvariantQuery.split(' ').filter(Boolean);
  const qWordCount = queryWords.length;

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

  // Check for whole ayah match candidates
  const wholeAyahHits = new Set<number>();
  const exactNorm = exactNormalizedMap.get(normalizedQuery);
  if (exactNorm) exactNorm.forEach((idx) => wholeAyahHits.add(idx));
  const exactAlef = exactAlefMap.get(alefInvariantQuery);
  if (exactAlef) exactAlef.forEach((idx) => wholeAyahHits.add(idx));

  // Check for Leading Basmala
  let hasLeadingBasmala = false;
  if (
    queryWords.length >= 5 &&
    (normalizedQuery.startsWith(BASMALA_NORM) || alefInvariantQuery.startsWith(BASMALA_ALEF))
  ) {
    hasLeadingBasmala = true;
  }

  if (hasLeadingBasmala) {
    const strippedQueryWords = queryWords.slice(4);
    const strippedNorm = strippedQueryWords.join(' ');
    const strippedAlef = toAlefInvariant(strippedNorm);

    const sNorm = exactNormalizedMap.get(strippedNorm);
    if (sNorm) sNorm.forEach((idx) => { if (indexedAyat[idx].chapter !== 1) wholeAyahHits.add(idx); });
    const sAlef = exactAlefMap.get(strippedAlef);
    if (sAlef) sAlef.forEach((idx) => { if (indexedAyat[idx].chapter !== 1) wholeAyahHits.add(idx); });
  }

  // Proceed to candidate search for whole ayah matching even for short queries

  // Query variants for stream scanning
  const queryVariants = [
    { words: queryWords, alefWords: queryAlefWords, isBasmalaStripped: false },
  ];

  if (hasLeadingBasmala) {
    const strippedWords = queryWords.slice(4);
    const strippedAlef = queryAlefWords.slice(4);
    if (strippedWords.length >= 1) {
      queryVariants.push({
        words: strippedWords,
        alefWords: strippedAlef,
        isBasmalaStripped: true,
      });
    }
  }

  type CandidateMatch = {
    chapter: number;
    startVerse: number;
    endVerse: number;
    startGlobalWord: number;
    endGlobalWord: number;
    confidence: number;
    wordScores: number[];
    wordExactList: boolean[];
    matchedTokens: string[];
    isBasmalaStripped: boolean;
  };

  const rawCandidateMatches: CandidateMatch[] = [];

  for (const variant of queryVariants) {
    const vWords = variant.words;
    const vAlef = variant.alefWords;
    const vLen = vWords.length;
    if (vLen === 0) continue;

    const candidateStartsBySurah = new Map<number, Set<number>>();

    // 1. Check 2-grams
    for (let i = 0; i < Math.min(3, vLen - 1); i++) {
      const twoGram = `${vAlef[i]}_${vAlef[i + 1]}`;
      const hits = twoGramIndex.get(twoGram);
      if (hits) {
        for (const h of hits) {
          if (variant.isBasmalaStripped && h.chapter === 1) continue;
          let sSet = candidateStartsBySurah.get(h.chapter);
          if (!sSet) {
            sSet = new Set();
            candidateStartsBySurah.set(h.chapter, sSet);
          }
          sSet.add(Math.max(0, h.globalIndex - i));
        }
      }
    }

    // 2. Check 1-grams
    for (let i = 0; i < Math.min(2, vLen); i++) {
      const hits = wordPositionIndex.get(vAlef[i]);
      if (hits) {
        for (const h of hits) {
          if (variant.isBasmalaStripped && h.chapter === 1) continue;
          let sSet = candidateStartsBySurah.get(h.chapter);
          if (!sSet) {
            sSet = new Set();
            candidateStartsBySurah.set(h.chapter, sSet);
          }
          sSet.add(Math.max(0, h.globalIndex - i));
        }
      }
    }

    // Also include positions of any whole-ayah hits
    for (const hIdx of wholeAyahHits) {
      const ayah = indexedAyat[hIdx];
      const stream = surahWordStreams.get(ayah.chapter);
      if (stream) {
        const firstW = stream.find((w) => w.verse === ayah.verse && w.wordIndexInAyah === 0);
        if (firstW) {
          let sSet = candidateStartsBySurah.get(ayah.chapter);
          if (!sSet) {
            sSet = new Set();
            candidateStartsBySurah.set(ayah.chapter, sSet);
          }
          sSet.add(firstW.globalWordIndex);
        }
      }
    }

    for (const [ch, startIndices] of candidateStartsBySurah.entries()) {
      const stream = surahWordStreams.get(ch);
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

        for (let i = 0; i < vLen; i++) {
          if (startIdx + i < stream.length) {
            const streamWord = stream[startIdx + i];
            const qWord = vWords[i];
            const { score, isExact } = wordSimilarityCorpusDerived(
              qWord,
              streamWord.normalized,
              streamWord.rawUthmani
            );
            wordScores.push(score);
            wordExactList.push(isExact);
            totalScore += score;
            if (score >= 0.40) {
              matchedTokens.push(streamWord.rawUthmani);
            }
          } else {
            wordScores.push(0);
            wordExactList.push(false);
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
            isBasmalaStripped: variant.isBasmalaStripped,
          });
        }
      }
    }
  }

  // Deduplicate matches
  const bestMatchMap = new Map<string, CandidateMatch>();
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
      alefInvariantQuery,
      state: 'not_found',
      topConfidence: 0,
      totalMatches: 0,
      results: [],
      referralRequired: true,
      referralMessage: 'لم يتم العثور على تطابق موثوق، راجع أهل العلم',
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

  const threshold = Math.max(70, topConfidence - 3);
  const filteredCandidates = candidateList.filter((m) => m.confidence >= threshold);

  const formattedResults: AyahMatchResult[] = filteredCandidates.map((m) => {
    const surah = surahMetadata.get(m.chapter)!;
    const surahAyat = surahAyatMap.get(m.chapter)!;
    const stream = surahWordStreams.get(m.chapter)!;

    const matchedAyat = surahAyat.filter(
      (a) => a.verse >= m.startVerse && a.verse <= m.endVerse
    );

    const breakdown: AyahBreakdownItem[] = [];
    let totalAyatWords = 0;
    let totalMatchedWords = 0;

    let overallStartWordIndex = 0;
    let overallEndWordIndex = 0;

    const fullResultWordStatus: WordMatchState[] = [];
    let hasApproximateMatch = false;

    for (let aIdx = 0; aIdx < matchedAyat.length; aIdx++) {
      const ayah = matchedAyat[aIdx];
      const ayahWords = ayah.rawWords;
      const ayahWordStatus: WordMatchState[] = [];

      let ayahMatchedCount = 0;
      let ayahStartIdx = -1;
      let ayahEndIdx = -1;

      for (let w = 0; w < ayahWords.length; w++) {
        const globalIdx = stream.findIndex(
          (sw) => sw.chapter === ayah.chapter && sw.verse === ayah.verse && sw.wordIndexInAyah === w
        );

        let status: WordMatchState = 'none';

        if (globalIdx >= m.startGlobalWord && globalIdx <= m.endGlobalWord) {
          const matchOffset = globalIdx - m.startGlobalWord;
          const score = m.wordScores[matchOffset] ?? 1.0;
          const isExact = m.wordExactList[matchOffset] ?? true;

          if (isExact && score >= 0.99) {
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
      const cov: CoverageType = covRatio >= 0.85 ? 'full' : 'fragment';

      breakdown.push({
        verse: ayah.verse,
        text: ayah.text,
        translation: ayah.enText,
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

    const coverage: CoverageType = isSingleAyah
      ? overallCoverageRatio >= 0.85 || qWordCount >= totalAyatWords * 0.85
        ? 'full'
        : 'fragment'
      : allAyatFull
      ? 'full'
      : 'fragment';

    const fullRangeText = matchedAyat.map((a) => a.text).join(' ');
    // Join per-ayah translations with punctuation in display code
    let fullRangeTranslation = matchedAyat
      .map((a, idx) => {
        let t = a.enText.trim();
        if (!t) return '';
        if (matchedAyat.length > 1) {
          if (idx < matchedAyat.length - 1 && !/[.!?,:;\-—"'\)\]]$/.test(t)) {
            t += ',';
          } else if (idx === matchedAyat.length - 1 && !/[.!?,:;\-—"'\)\]]$/.test(t)) {
            t += '.';
          }
        }
        return t;
      })
      .filter(Boolean)
      .join(' ');

    if (fullRangeTranslation.includes('"') && (fullRangeTranslation.match(/"/g) || []).length % 2 !== 0) {
      fullRangeTranslation += '"';
    }

    const verseRange = isSingleAyah ? `${m.startVerse}` : `${m.startVerse}–${m.endVerse}`;

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
      translation: fullRangeTranslation,
      confidence: hasApproximateMatch ? Math.min(89, m.confidence) : m.confidence,
      state: hasApproximateMatch ? 'close_match' : (m.confidence >= 90 ? 'matched' : 'close_match'),
      coverage,
      coverageRatio: Math.round(overallCoverageRatio * 100) / 100,
      matchedStartWordIndex: overallStartWordIndex,
      matchedEndWordIndex: overallEndWordIndex,
      matchedSlice: fullRangeText,
      matchedTokens: m.matchedTokens,
      wordMatchStatus: fullResultWordStatus,
      hasApproximateMatch,
      breakdown,
      leadingBasmalaIgnored: m.isBasmalaStripped,
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
        alefInvariantQuery,
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

  const overallTopConfidence =
    formattedResults.length > 0 ? formattedResults[0].confidence : topConfidence;
  const overallState: AyahMatchState =
    formattedResults.some((r) => r.state === 'matched') ? 'matched' : 'close_match';
  const hasLeadingBasmalaIgnored = formattedResults.some((r) => r.leadingBasmalaIgnored);
  let notice: string | undefined = undefined;

  if (hasLeadingBasmalaIgnored) {
    notice = 'تم تجاهل البسملة في بداية السورة أثناء المطابقة لأنها ليست جزءاً من الآية الأولى في هذه السورة';
  }

  const elapsed = Math.round((performance.now() - startTime) * 100) / 100;

  return {
    query: rawQuery,
    normalizedQuery,
    alefInvariantQuery,
    state: overallState,
    topConfidence: overallTopConfidence,
    totalMatches: formattedResults.length,
    results: formattedResults,
    referralRequired: false,
    notice,
    executionTimeMs: elapsed,
  };
}
