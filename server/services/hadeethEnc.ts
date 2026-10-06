/**
 * HadeethEnc.com API Client & Integration Service
 * 
 * Official API Documentation: https://hadeethenc.com/en/api
 * Endpoints used:
 * - Search: https://hadeethenc.com/api/v1/hadeeths/search/?language={lang}&phrase={phrase}
 * - Single Hadith: https://hadeethenc.com/api/v1/hadeeths/one/?language={lang}&id={id}
 * - Categories: https://hadeethenc.com/api/v1/categories/list/?language={lang}
 * - Languages: https://hadeethenc.com/api/v1/languages
 *
 * Terms of use respected:
 * - No modification to source text or meaning
 * - Clear attribution to HadeethEnc.com with direct canonical URL
 * - Strictly deterministic: grades and attributions are read directly from API fields,
 *   never hallucinated, guessed, or retrieved from model memory.
 */

import { normalizeArabic, levenshteinSimilarity } from '../matching/normalizer.ts';
import type { HadithGradeItem, HadithMatchResult } from '../matching/hadithMatcher.ts';
import type { AskCitationItem } from '../matching/askEngine.ts';

const HADEETHENC_API_BASE = 'https://hadeethenc.com/api/v1';
const REQUEST_TIMEOUT_MS = 3000; // 3.0s timeout to never block user or break other sources

export interface HadeethEncSearchResultItem {
  id: string;
  title: string;
  hadith_text: string;
  hadith_text_highlights?: string;
}

export interface HadeethEncWordMeaning {
  word: string;
  meaning: string;
}

export interface HadeethEncHadithDetails {
  id: string;
  title: string;
  hadeeth: string;
  attribution: string;
  grade: string;
  explanation: string;
  hints: string[];
  categories?: string[];
  translations?: string[];
  hadeeth_intro?: string;
  reference?: string;
  words_meanings?: HadeethEncWordMeaning[];
  hadeeth_ar?: string;
  hadeeth_intro_ar?: string;
  explanation_ar?: string;
  hints_ar?: string[];
  words_meanings_ar?: HadeethEncWordMeaning[];
  attribution_ar?: string;
  grade_ar?: string;
  url: string;
}

// In-memory Cache with TTL (2 hours)
interface CacheEntry<T> {
  data: T;
  timestamp: number;
}

const CACHE_TTL_MS = 2 * 60 * 60 * 1000;
const searchCache = new Map<string, CacheEntry<HadeethEncSearchResultItem[]>>();
const detailsCache = new Map<string, CacheEntry<HadeethEncHadithDetails | null>>();

function getCached<T>(map: Map<string, CacheEntry<T>>, key: string): T | undefined {
  const entry = map.get(key);
  if (!entry) return undefined;
  if (Date.now() - entry.timestamp > CACHE_TTL_MS) {
    map.delete(key);
    return undefined;
  }
  return entry.data;
}

function setCache<T>(map: Map<string, CacheEntry<T>>, key: string, data: T, maxEntries = 500): void {
  if (map.size >= maxEntries) {
    const oldestKey = map.keys().next().value;
    if (oldestKey) map.delete(oldestKey);
  }
  map.set(key, { data, timestamp: Date.now() });
}

/**
 * Safe fetch with strict timeout and error capture.
 * Never throws an uncaught exception to caller.
 */
async function safeFetchJson<T>(url: string): Promise<T | null> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'Bayan-Quran-Hadith-Verifier/1.0',
      },
    });
    clearTimeout(timer);

    if (!res.ok) {
      return null;
    }

    const text = await res.text();
    if (!text || text.trim() === '""' || text.trim() === '') {
      return null;
    }

    const data = JSON.parse(text);
    return data as T;
  } catch (_err) {
    // Graceful degradation on network timeout, abort, or JSON error
    return null;
  }
}

/**
 * Search HadeethEnc by phrase and language
 */
export async function searchHadeethEnc(
  phrase: string,
  language: 'ar' | 'en' = 'ar'
): Promise<HadeethEncSearchResultItem[]> {
  const clean = phrase.trim();
  if (!clean || clean.length < 2) return [];

  const cacheKey = `${language}:${clean.toLowerCase()}`;
  const cached = getCached(searchCache, cacheKey);
  if (cached) return cached;

  const url = `${HADEETHENC_API_BASE}/hadeeths/search/?language=${language}&phrase=${encodeURIComponent(clean)}`;
  const data = await safeFetchJson<any>(url);

  let results: HadeethEncSearchResultItem[] = [];
  if (Array.isArray(data)) {
    results = data.map((item) => ({
      id: String(item.id || ''),
      title: String(item.title || ''),
      hadith_text: String(item.hadith_text || ''),
      hadith_text_highlights: item.hadith_text_highlights,
    })).filter((item) => item.id && item.hadith_text);
  }

  setCache(searchCache, cacheKey, results);
  return results;
}

/**
 * Fetch a single Hadith with complete details (grade, attribution, explanation, fawaed, reference)
 */
export async function getHadeethEncById(
  id: string,
  language: 'ar' | 'en' = 'ar'
): Promise<HadeethEncHadithDetails | null> {
  const cleanId = String(id).trim();
  if (!cleanId) return null;

  const cacheKey = `${language}:${cleanId}`;
  const cached = getCached(detailsCache, cacheKey);
  if (cached !== undefined) return cached;

  const url = `${HADEETHENC_API_BASE}/hadeeths/one/?language=${language}&id=${encodeURIComponent(cleanId)}`;
  const data = await safeFetchJson<any>(url);

  if (!data || typeof data !== 'object' || !data.id) {
    setCache(detailsCache, cacheKey, null);
    return null;
  }

  const result: HadeethEncHadithDetails = {
    id: String(data.id),
    title: String(data.title || ''),
    hadeeth: String(data.hadeeth || ''),
    attribution: String(data.attribution || '').trim(),
    grade: String(data.grade || '').trim(),
    explanation: String(data.explanation || '').trim(),
    hints: Array.isArray(data.hints) ? data.hints.map((h: any) => String(h).trim()).filter(Boolean) : [],
    categories: Array.isArray(data.categories) ? data.categories : undefined,
    translations: Array.isArray(data.translations) ? data.translations : undefined,
    hadeeth_intro: data.hadeeth_intro ? String(data.hadeeth_intro) : undefined,
    reference: data.reference ? String(data.reference).trim() : undefined,
    words_meanings: Array.isArray(data.words_meanings) ? data.words_meanings : undefined,
    hadeeth_ar: data.hadeeth_ar ? String(data.hadeeth_ar) : undefined,
    hadeeth_intro_ar: data.hadeeth_intro_ar ? String(data.hadeeth_intro_ar) : undefined,
    explanation_ar: data.explanation_ar ? String(data.explanation_ar) : undefined,
    hints_ar: Array.isArray(data.hints_ar) ? data.hints_ar.map((h: any) => String(h).trim()).filter(Boolean) : undefined,
    words_meanings_ar: Array.isArray(data.words_meanings_ar) ? data.words_meanings_ar : undefined,
    attribution_ar: data.attribution_ar ? String(data.attribution_ar).trim() : undefined,
    grade_ar: data.grade_ar ? String(data.grade_ar).trim() : undefined,
    url: `https://hadeethenc.com/${language}/browse/hadith/${data.id}`,
  };

  setCache(detailsCache, cacheKey, result);
  return result;
}

/**
 * Searches and fetches top N full hadith details in parallel
 */
export async function searchAndGetHadeethEnc(
  phrase: string,
  language: 'ar' | 'en' = 'ar',
  limit = 3
): Promise<HadeethEncHadithDetails[]> {
  const searchItems = await searchHadeethEnc(phrase, language);
  if (!searchItems.length) return [];

  const topItems = searchItems.slice(0, limit);
  const detailsList = await Promise.all(
    topItems.map((item) => getHadeethEncById(item.id, language))
  );

  return detailsList.filter((item): item is HadeethEncHadithDetails => item !== null);
}

/**
 * Maps raw grade text from HadeethEnc to family category
 */
export function mapHadeethEncGradeFamily(grade: string): 'صحيح' | 'حسن' | 'ضعيف' | 'موضوع' | 'neutral' {
  if (!grade) return 'neutral';
  const norm = normalizeArabic(grade).toLowerCase();
  if (norm.includes('صحيح') || /sahih|authentic/i.test(grade)) return 'صحيح';
  if (norm.includes('حسن') || /hasan|good/i.test(grade)) return 'حسن';
  if (norm.includes('ضعيف') || /da'?if|weak/i.test(grade)) return 'ضعيف';
  if (norm.includes('موضوع') || /maudu|fabricated/i.test(grade)) return 'موضوع';
  return 'neutral';
}

/**
 * Converts a HadeethEnc Hadith to a HadithGradeItem
 */
export function toHadeethEncGradeItem(
  details: HadeethEncHadithDetails,
  language: 'ar' | 'en' = 'ar'
): HadithGradeItem {
  const rawGrade = (language === 'en' ? details.grade : (details.grade_ar || details.grade)) || '';
  const arabicLabel = details.grade_ar || details.grade || (language === 'ar' ? 'لا تتوفر درجة موثقة' : 'No documented grade');
  const family = mapHadeethEncGradeFamily(rawGrade || arabicLabel);

  return {
    name: language === 'en' ? 'Encyclopedia of Prophetic Hadiths (HadeethEnc)' : 'موسوعة الأحاديث النبوية (HadeethEnc)',
    originalGrade: rawGrade || (language === 'en' ? 'No documented grade' : 'لا تتوفر درجة موثقة'),
    arabicLabel: arabicLabel || 'لا تتوفر درجة موثقة',
    family,
    isIsnadJudgment: false,
    isCitation: true,
    note: details.attribution || (language === 'en' ? 'Source: HadeethEnc.com' : 'المصدر: HadeethEnc.com'),
  };
}

/**
 * Converts a HadeethEnc Hadith into a Bayan HadithMatchResult
 */
export function toHadithMatchResult(
  details: HadeethEncHadithDetails,
  query: string,
  language: 'ar' | 'en' = 'ar'
): HadithMatchResult {
  const matn = details.hadeeth_ar || details.hadeeth || '';
  const translation = language === 'en' ? details.hadeeth : undefined;

  const matnWords = matn.split(/\s+/).filter(Boolean);
  const qWords = query.trim().split(/\s+/).filter(Boolean);

  // Compute confidence using similarity
  const cleanQ = normalizeArabic(query);
  const cleanMatn = normalizeArabic(matn);
  let confidence = 75;

  if (cleanMatn.includes(cleanQ)) {
    confidence = 100;
  } else {
    const sim = levenshteinSimilarity(cleanQ, cleanMatn.slice(0, Math.min(cleanMatn.length, cleanQ.length * 2)));
    confidence = Math.min(89, Math.max(70, Math.round(sim * 100)));
  }

  const gradeItem = toHadeethEncGradeItem(details, language);
  const hasNoGrading = !details.grade && !details.grade_ar;

  return {
    id: `hadeethenc_${details.id}`,
    collection: 'hadeethenc',
    collectionArabic: 'موسوعة الأحاديث النبوية (HadeethEnc)',
    hadithnumber: parseInt(details.id, 10) || 0,
    arabicnumber: details.id,
    book: 0,
    hadithInBook: parseInt(details.id, 10) || 0,
    sectionName: details.attribution || 'تخريج الموسوعة',
    text: matn,
    translation,
    confidence,
    state: confidence === 100 ? 'matched' : 'close_match',
    coverage: 'full',
    matchedStartWordIndex: 0,
    matchedEndWordIndex: matnWords.length,
    matchedTokens: qWords,
    wordMatchStatus: qWords.map(() => 'exact'),
    hasApproximateMatch: confidence < 100,
    grades: [gradeItem],
    hasNoGrading,
    isnadStripped: false,
    isnadChecked: true,
  };
}

/**
 * Converts a HadeethEnc Hadith into a Bayan AskCitationItem
 */
export function toAskCitationItem(
  details: HadeethEncHadithDetails,
  language: 'ar' | 'en' = 'ar',
  score = 30.0
): AskCitationItem {
  const isEn = language === 'en';
  const gradeItem = toHadeethEncGradeItem(details, language);
  const hasNoGrading = !details.grade && !details.grade_ar;

  return {
    id: `hadeethenc_${details.id}`,
    role: 'supports',
    sourceTitle: isEn ? 'Encyclopedia of Prophetic Hadiths (HadeethEnc)' : 'موسوعة الأحاديث النبوية (HadeethEnc)',
    editionName: `HadeethEnc #${details.id} — ${details.attribution || 'HadeethEnc'}`,
    fullText: isEn ? details.hadeeth : (details.hadeeth_ar || details.hadeeth),
    arabicFullText: details.hadeeth_ar || details.hadeeth,
    tafsirText: isEn ? details.explanation : (details.explanation_ar || details.explanation),
    tafsirExcerpt: details.hints?.length ? (isEn ? details.hints[0] : (details.hints_ar?.[0] || details.hints[0])) : undefined,
    grades: [gradeItem],
    hasNoGrading,
    type: 'hadith',
    hadithnumber: parseInt(details.id, 10) || 0,
    collection: 'hadeethenc',
    score,
  };
}
