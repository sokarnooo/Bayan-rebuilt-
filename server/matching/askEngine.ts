import fs from 'fs';
import path from 'path';
import { GoogleGenAI } from '@google/genai';
import { loadCorpus, lookupHadithAr, getQuranEn, getHadithEn, getQuranTafsirForAyah } from '../corpus/loader.ts';
import { initHadithEngine } from './hadithMatcher.ts';
import type { HadithGradeItem } from './hadithMatcher.ts';
import { initAyahEngine } from './ayahMatcher.ts';
import { normalizeArabic } from './normalizer.ts';

// Fast model chain: gemini-3.1-flash-lite -> gemini-flash-latest (max 2 models)
const LITE_MODEL = 'gemini-3.1-flash-lite';
const MAIN_MODEL = 'gemini-flash-latest';
const CALL_TIMEOUT_MS = 12000; // 12 seconds per call

export interface AskRequest {
  question: string;
  language?: 'ar' | 'en';
  singlePass?: boolean;
}

export interface AskCitationItem {
  id: string;
  quote?: string;
  role: 'supports' | 'refutes';
  sourceTitle: string;
  editionName?: string;
  fullText: string;
  arabicFullText?: string;
  tafsirText?: string;
  tafsirExcerpt?: string;
  isTafsirQuote?: boolean;
  grades?: HadithGradeItem[];
  hasNoGrading?: boolean;
  type: 'ayah' | 'hadith';
  chapter?: number;
  verse?: number;
  collection?: string;
  hadithnumber?: number;
}

export interface AskTimingInfo {
  call1Ms: number;
  retrievalMs: number;
  call2Ms: number;
  promptChars: number;
  retriesFailover: string;
  totalMs: number;
}

export interface AskResponse {
  question: string;
  language: 'ar' | 'en';
  category: 'textual' | 'permissibility' | 'personal' | 'other';
  verdict: 'supported' | 'contradicted' | 'unclear' | 'permissibility' | 'pending';
  verdictBadgeLabel: string;
  verdictBadgeSubline?: string;
  isWeakOnly?: boolean;
  isPermissibility?: boolean;
  isFabricated?: boolean;
  fakeHadith?: {
    matn: string;
    ruling: string;
    url: string;
  };
  summary: string;
  searchedTerms: string[];
  items: AskCitationItem[];
  retrievedCount: number;
  droppedItemsCount: number;
  topRetrievedIds: string[];
  executionTimeMs: number;
  timing?: AskTimingInfo;
  verdictPending?: boolean;
  cached?: boolean;
  error?: string;
}

// In-memory cache by normalized question
const askCache = new Map<string, { data: AskResponse; timestamp: number }>();
const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour

// Rate limit: 20 per IP per hour
const ipRateLimits = new Map<string, { count: number; resetTime: number }>();

export function checkRateLimit(ip: string): boolean {
  const now = Date.now();
  const record = ipRateLimits.get(ip);
  if (!record || now > record.resetTime) {
    ipRateLimits.set(ip, { count: 1, resetTime: now + 60 * 60 * 1000 });
    return true;
  }
  if (record.count >= 20) {
    return false;
  }
  record.count++;
  return true;
}

// Fabricated sayings verified on dorar.net/fake-hadith
export const CURATED_FABRICATED_SAYINGS = [
  {
    keywords: ['الصين', 'اطلبوا العلم ولو بالصين', 'اطلبوا العلم ولو في الصين'],
    matn: 'اطلبوا العلم ولو بالصين',
    ruling: 'لا يصح',
    url: 'https://dorar.net/fake-hadith/38',
  },
  {
    keywords: ['حب الوطن من الإيمان'],
    matn: 'حب الوطن من الإيمان',
    ruling: 'ليس بحديث',
    url: 'https://dorar.net/fake-hadith/74',
  },
  {
    keywords: ['المعدة بيت الداء', 'الحمية رأس الدواء', 'الحمية رأس كل دواء'],
    matn: 'المعِدة بيت الداء، والحمية رأس الدواء',
    ruling: 'لا أصل له',
    url: 'https://dorar.net/fake-hadith/557',
  },
];

// Helper: Strip Arabic light prefixes (ال، و، ب، ل، ف، ك)
export function stripArabicPrefixes(word: string): string {
  let w = normalizeArabic(word).replace(/[\u064B-\u065F\u0670]/g, '');
  if (w.startsWith('وال') && w.length > 4) w = w.slice(3);
  else if (w.startsWith('فال') && w.length > 4) w = w.slice(3);
  else if (w.startsWith('بال') && w.length > 4) w = w.slice(3);
  else if (w.startsWith('لل') && w.length > 3) w = w.slice(2);
  else if (w.startsWith('ال') && w.length > 3) w = w.slice(2);
  else if (
    (w.startsWith('و') ||
      w.startsWith('ف') ||
      w.startsWith('ب') ||
      w.startsWith('ل') ||
      w.startsWith('ك')) &&
    w.length > 3
  ) {
    w = w.slice(1);
  }
  return w;
}

// Clean matn text: strip isnad preamble if present and limit to max 80 words
export function extractCleanMatn(text: string, maxWords = 80): string {
  if (!text) return '';
  let s = text.replace(/<[^>]*>/g, ' ');
  const isnadMarkers = [
    'قال رسول الله صلى الله عليه وسلم',
    'أن رسول الله صلى الله عليه وسلم قال',
    'عن النبي صلى الله عليه وسلم قال',
    'سمعت رسول الله صلى الله عليه وسلم يقول',
    'أن النبي صلى الله عليه وسلم قال',
    'قَالَ رَسُولُ اللَّهِ صلى الله عليه وسلم',
    'قَالَ رَسُولُ اللَّهِ صلى الله عليه وسلم',
    'قَالَ النَّبِيُّ صلى الله عليه وسلم',
  ];
  for (const m of isnadMarkers) {
    const idx = s.indexOf(m);
    if (idx !== -1 && idx < s.length * 0.65) {
      s = s.slice(idx + m.length);
      break;
    }
  }
  const words = s.trim().split(/\s+/).filter(Boolean);
  return words.slice(0, maxWords).join(' ');
}

// Extract up to maxWords (default 25) around the densest cluster of matched terms, cut cleanly at clause/word boundaries
export function extractDenseClusterQuote(fullText: string, terms: string[], maxWords = 25): string {
  if (!fullText) return '';
  const matn = extractCleanMatn(fullText, 120);
  const cleanText = (matn || fullText).replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
  const words = cleanText.split(/\s+/).filter(Boolean);
  if (words.length <= maxWords) return cleanText;

  const normTerms = terms.map(t => stripArabicPrefixes(normalizeArabic(t)).toLowerCase()).filter(Boolean);

  let bestStart = 0;
  let maxMatchedCount = -1;

  for (let i = 0; i <= words.length - maxWords; i++) {
    const windowWords = words.slice(i, i + maxWords);
    const windowNorm = windowWords.map(w => stripArabicPrefixes(normalizeArabic(w)).toLowerCase());

    const matchedSet = new Set<string>();
    for (const w of windowNorm) {
      for (const t of normTerms) {
        if (w.includes(t) || t.includes(w)) {
          matchedSet.add(t);
        }
      }
    }

    if (matchedSet.size > maxMatchedCount) {
      maxMatchedCount = matchedSet.size;
      bestStart = i;
    }
  }

  // Look for a clause start at or slightly before bestStart
  let clauseStart = bestStart;
  const clauseMarkers = ['،', '.', ':', '؟', '!', '«', '"', 'قَالَ', 'أنَّ', 'إنَّ', 'إِذَا', 'مَنْ', 'فَإِذَا', 'فَإِنَّ', 'لاَ', 'مَا', 'وَمَنْ', 'إِنَّمَا', 'that', 'when', 'whoever', 'if'];
  for (let k = Math.max(0, bestStart - 3); k <= bestStart; k++) {
    const word = words[k] || '';
    if (clauseMarkers.some(m => word.startsWith(m) || word.endsWith(m) || word.includes(m))) {
      clauseStart = k;
      break;
    }
  }

  return words.slice(clauseStart, clauseStart + maxWords).join(' ').trim();
}

export interface RetrievedDoc {
  id: string;
  sourceLabel: string;
  editionName?: string;
  fullText: string;
  arabicFullText?: string;
  matnText: string;
  tafsirText?: string;
  tafsirExcerpt?: string;
  score: number;
  matchedTermsCount: number;
  hasRareTerm: boolean;
  type: 'ayah' | 'hadith';
  chapter?: number;
  verse?: number;
  collection?: string;
  hadithnumber?: number;
  grades?: HadithGradeItem[];
  hasNoGrading?: boolean;
}

const WEAK_TERMS = new Set([
  'الله', 'النبي', 'الناس', 'قال', 'رسول', 'عن', 'في', 'من', 'إلى', 'على', 'ما', 'لا', 'أن', 'إن',
  'كان', 'هو', 'هي', 'هل', 'كم', 'كل', 'ذلك', 'هذا', 'هذه', 'مع', 'أو', 'ثم', 'قد', 'بين', 'عند',
  'فإن', 'إذا', 'حيث', 'نحو', 'سنة', 'حديث', 'رواه', 'نبي', 'أمر', 'ورد', 'حكم', 'شريعة', 'إسلام',
  'واحد', 'اثنان', 'اثنتين', 'ثلاث', 'ثلاثة', 'أربع', 'أربعة', 'خمس', 'خمسة', 'ست', 'ستة', 'سبع', 'سبعة', 'ثمان', 'ثمانية',
  'تسع', 'تسعة', 'عشر', 'عشرة', 'اثنتان',
  'allah', 'prophet', 'people', 'say', 'said', 'says', 'messenger', 'man', 'men', 'hadith', 'sunnah',
  'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', '1', '2', '3', '4', '5', '6', '7', '8', '9', '10',
  'order', 'ruling', 'islamic', 'permissible', 'allowed', 'forbid'
]);

const RARE_TERMS = new Set([
  'شوال', 'القبلة', 'قبلة', 'تبسمك', 'فانكحوا', 'اليتامى', 'استقبال', 'استدبار', 'غائط', 'بول',
  'تعدد', 'زوجات', 'زوجة', 'مثنى', 'رباع', 'أجنبية', 'مصافحة',
  'qibla', 'shawwal', 'polygyny', 'wives', 'urination', 'defecation', 'smiling', 'marry'
]);

function isWeakTerm(term: string): boolean {
  if (!term) return true;
  const norm = stripArabicPrefixes(normalizeArabic(term)).toLowerCase();
  return WEAK_TERMS.has(term) || WEAK_TERMS.has(norm);
}

function isRareTerm(term: string): boolean {
  if (!term) return false;
  const norm = stripArabicPrefixes(normalizeArabic(term)).toLowerCase();
  if (RARE_TERMS.has(term) || RARE_TERMS.has(norm)) return true;
  if (norm.length >= 6 && !isWeakTerm(norm)) return true;
  return false;
}

export function searchCorpusKeywords(
  terms: string[],
  lang: 'ar' | 'en'
): { hadiths: RetrievedDoc[]; ayat: RetrievedDoc[]; passingSources: RetrievedDoc[] } {
  const { corpus } = loadCorpus();
  initHadithEngine();
  initAyahEngine();

  const isQuestionEn = lang === 'en';

  const rawTerms: string[] = [];
  for (const t of terms) {
    if (!t) continue;
    rawTerms.push(t);
    const splitWords = t.split(/\s+/).filter((w) => w.length >= 2);
    if (splitWords.length > 1) {
      rawTerms.push(...splitWords);
    }
  }

  const cleanTermsAr = Array.from(
    new Set(
      rawTerms
        .map((t) => stripArabicPrefixes(normalizeArabic(t)))
        .filter((t) => t.length >= 2 && !/^[a-z]/i.test(t))
    )
  );

  const cleanTermsEn = Array.from(
    new Set(
      rawTerms
        .map((t) => t.toLowerCase().trim())
        .filter((t) => t.length >= 2 && /^[a-z]/i.test(t))
    )
  );

  const allTermsForQuotes = [...cleanTermsAr, ...cleanTermsEn];

  // 1. Search Quran (Ayat)
  const scoredAyatMap = new Map<string, RetrievedDoc>();
  const quranAr = corpus.quran.ar;
  const quranEn = getQuranEn();

  for (let i = 0; i < quranAr.length; i++) {
    const vAr = quranAr[i];
    const vEn = quranEn[i];
    const tafsirText = getQuranTafsirForAyah(vAr.chapter, vAr.verse);

    const normVerseAr = normalizeArabic(vAr.text || '').replace(/[\u064B-\u065F\u0670]/g, '');
    const normVerseEn = (vEn?.text || '').toLowerCase();
    const normTafsirAr = normalizeArabic(tafsirText || '').replace(/[\u064B-\u065F\u0670]/g, '');

    const matchedNonWeakTerms = new Set<string>();
    let verseScoreAr = 0;
    let verseScoreEn = 0;
    let tafsirScoreAr = 0;
    let hasRare = false;

    // Arabic matching
    for (const term of cleanTermsAr) {
      const inVerse = normVerseAr.includes(term);
      const inTafsir = normTafsirAr.includes(term);

      if (inVerse) {
        if (isRareTerm(term)) { verseScoreAr += 25.0; hasRare = true; matchedNonWeakTerms.add(term); }
        else if (!isWeakTerm(term)) { verseScoreAr += 3.0; matchedNonWeakTerms.add(term); }
        else { verseScoreAr += 0.1; }
      }
      if (inTafsir) {
        if (isRareTerm(term)) { tafsirScoreAr += 25.0; hasRare = true; matchedNonWeakTerms.add(term); }
        else if (!isWeakTerm(term)) { tafsirScoreAr += 3.0; matchedNonWeakTerms.add(term); }
        else { tafsirScoreAr += 0.1; }
      }
    }

    // English matching
    for (const term of cleanTermsEn) {
      if (normVerseEn.includes(term)) {
        if (isRareTerm(term)) { verseScoreEn += 25.0; hasRare = true; matchedNonWeakTerms.add(term); }
        else if (!isWeakTerm(term)) { verseScoreEn += 3.0; matchedNonWeakTerms.add(term); }
        else { verseScoreEn += 0.1; }
      }
    }

    const totalScore = verseScoreAr + verseScoreEn + (tafsirScoreAr * 0.5);

    if (matchedNonWeakTerms.size >= 2 || hasRare) {
      const tafsirExcerpt = extractDenseClusterQuote(tafsirText, allTermsForQuotes, 25);
      const enText = vEn?.text ? `${vEn.text} (${vAr.chapter}.${vAr.verse})` : vAr.text;

      scoredAyatMap.set(`ayah_${vAr.chapter}_${vAr.verse}`, {
        id: `ayah_${vAr.chapter}_${vAr.verse}`,
        sourceLabel: isQuestionEn
          ? `Surah ${vAr.chapter}:${vAr.verse}`
          : `سورة ${vAr.chapter} - آية ${vAr.verse}`,
        editionName: isQuestionEn ? 'Saheeh International (eng-ummmuhammad)' : 'القرآن الكريم',
        fullText: isQuestionEn ? enText : vAr.text,
        arabicFullText: vAr.text,
        matnText: isQuestionEn ? enText : extractCleanMatn(vAr.text, 80),
        tafsirText,
        tafsirExcerpt,
        score: totalScore,
        matchedTermsCount: matchedNonWeakTerms.size,
        hasRareTerm: hasRare,
        type: 'ayah',
        chapter: vAr.chapter,
        verse: vAr.verse,
      });
    }
  }

  // 2. Search Hadiths across all 7 collections (MATN ONLY!)
  const scoredHadithsMap = new Map<string, RetrievedDoc>();
  const collections = ['bukhari', 'muslim', 'tirmidhi', 'abudawud', 'nasai', 'ibnmajah', 'nawawi'] as const;

  for (const col of collections) {
    const listAr = corpus.hadith.ar[col] || [];
    const listEn = getHadithEn(col);
    const count = listAr.length;

    for (let i = 0; i < count; i++) {
      const hAr = listAr[i];
      const hEn = listEn[i];
      if (!hAr || !hAr.text) continue;

      const matnAr = normalizeArabic(extractCleanMatn(hAr.text, 80)).replace(/[\u064B-\u065F\u0670]/g, '');
      const matnEn = (hEn?.text || '').toLowerCase();

      const matchedNonWeakTerms = new Set<string>();
      let scoreAr = 0;
      let scoreEn = 0;
      let hasRare = false;

      // Arabic matn matching
      for (const term of cleanTermsAr) {
        if (matnAr.includes(term)) {
          if (isRareTerm(term)) { scoreAr += 25.0; hasRare = true; matchedNonWeakTerms.add(term); }
          else if (!isWeakTerm(term)) { scoreAr += 3.0; matchedNonWeakTerms.add(term); }
          else { scoreAr += 0.1; }
        }
      }

      // English matn matching
      for (const term of cleanTermsEn) {
        if (matnEn.includes(term)) {
          if (isRareTerm(term)) { scoreEn += 25.0; hasRare = true; matchedNonWeakTerms.add(term); }
          else if (!isWeakTerm(term)) { scoreEn += 3.0; matchedNonWeakTerms.add(term); }
          else { scoreEn += 0.1; }
        }
      }

      const totalScore = scoreAr + scoreEn;

      if (matchedNonWeakTerms.size >= 2 || hasRare) {
        const arHadith = hAr;
        const grades = arHadith?.grades || [];
        const hasNoGrading = col === 'bukhari' || col === 'muslim' || col === 'nawawi';
        const num = hAr.hadithnumber || i + 1;

        scoredHadithsMap.set(`${col}_${num}`, {
          id: `${col}_${num}`,
          sourceLabel: !isQuestionEn
            ? `${getCollectionArabicName(col)} - حديث ${num}`
            : `${getCollectionEnglishName(col)} - Hadith ${num}`,
          editionName: !isQuestionEn ? getCollectionArabicName(col) : `${getCollectionEnglishName(col)} (English translation)`,
          fullText: isQuestionEn && hEn?.text ? hEn.text : hAr.text,
          arabicFullText: hAr.text,
          matnText: isQuestionEn && hEn?.text ? hEn.text : extractCleanMatn(hAr.text, 80),
          score: totalScore,
          matchedTermsCount: matchedNonWeakTerms.size,
          hasRareTerm: hasRare,
          type: 'hadith',
          collection: col,
          hadithnumber: num,
          grades: parseGrades(grades),
          hasNoGrading,
        });
      }
    }
  }

  const sortedHadiths = Array.from(scoredHadithsMap.values()).sort((a, b) => b.score - a.score);
  const sortedAyat = Array.from(scoredAyatMap.values()).sort((a, b) => b.score - a.score);

  const topHadiths = sortedHadiths.slice(0, 4);
  const topAyat = sortedAyat.slice(0, 2);

  const topHScore = topHadiths[0]?.score || 0;
  const topAScore = topAyat[0]?.score || 0;

  let passingSources: RetrievedDoc[] = [];
  if (topHScore > topAScore) {
    passingSources = [...topHadiths, ...topAyat].slice(0, 6);
  } else {
    passingSources = [...topAyat, ...topHadiths].slice(0, 6);
  }

  return {
    hadiths: topHadiths,
    ayat: topAyat,
    passingSources,
  };
}

function getCollectionArabicName(col: string): string {
  switch (col) {
    case 'bukhari': return 'صحيح البخاري';
    case 'muslim': return 'صحيح مسلم';
    case 'abudawud': return 'سنن أبي داود';
    case 'tirmidhi': return 'جامع الترمذي';
    case 'nasai': return 'سنن النسائي';
    case 'ibnmajah': return 'سنن ابن ماجه';
    case 'nawawi': return 'الأربعون النووية';
    default: return col;
  }
}

function getCollectionEnglishName(col: string): string {
  switch (col) {
    case 'bukhari': return 'Sahih al-Bukhari';
    case 'muslim': return 'Sahih Muslim';
    case 'abudawud': return 'Sunan Abi Dawud';
    case 'tirmidhi': return 'Jami` at-Tirmidhi';
    case 'nasai': return "Sunan an-Nasa'i";
    case 'ibnmajah': return 'Sunan Ibn Majah';
    case 'nawawi': return "An-Nawawi's 40 Hadith";
    default: return col;
  }
}

function parseGrades(rawGrades: Array<{ name?: string; grade?: string }>): HadithGradeItem[] {
  return rawGrades.map((g) => {
    const raw = (g.grade || '').trim();
    const name = (g.name || 'مُخرِّج غير مسمى').trim();
    let family: 'صحيح' | 'حسن' | 'ضعيف' | 'موضوع' | 'neutral' = 'neutral';
    if (/sahih|صحيح/i.test(raw)) family = 'صحيح';
    else if (/hasan|حسن/i.test(raw)) family = 'حسن';
    else if (/da'?if|ضعيف/i.test(raw)) family = 'ضعيف';
    else if (/maudu|موضوع/i.test(raw)) family = 'موضوع';

    return {
      name,
      originalGrade: raw,
      arabicLabel: raw,
      family,
      isIsnadJudgment: /isnaad/i.test(raw),
      isCitation: false,
    };
  });
}

function getGeminiClient(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY_MISSING');
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

// Call API with strict timeout & retry limit
async function generateWithTimeout(
  ai: GoogleGenAI,
  model: string,
  contents: string,
  systemInstruction: string
): Promise<string> {
  const callPromise = ai.models.generateContent({
    model,
    contents,
    config: {
      systemInstruction,
      temperature: 0,
      responseMimeType: 'application/json',
    },
  });

  const timeoutPromise = new Promise<never>((_, reject) => {
    setTimeout(() => reject(new Error('CALL_TIMEOUT')), CALL_TIMEOUT_MS);
  });

  const response = await Promise.race([callPromise, timeoutPromise]);
  return response.text?.trim() || '{}';
}

// Call 1: Intent classification & search term expansion
export async function executeCall1(
  question: string
): Promise<{
  category: 'textual' | 'permissibility' | 'personal' | 'other';
  language: 'ar' | 'en';
  claimed_text: string | null;
  terms: string[];
  is_ruling_question: boolean;
  modelUsed: string;
  retriesCount: number;
}> {
  const ai = getGeminiClient();

  const systemInstruction = `You are a scholarly search term expander for Quran and Hadith corpora. Analyze the user's question.
Do NOT answer the question; output JSON only.
1. Classify the intent into one of: "textual" (asking if a specific text/hadith exists or what the text says), "permissibility" (halal/haram/ruling/fatwa question), "personal" (asking for personal counsel), or "other".
IMPORTANT: Questions asking if a specific virtue or deed is charity, sunnah, or mentioned in Hadith (e.g. "Is smiling charity?", "Is [deed] a hadith?") are TEXTUAL questions ("textual"), NOT permissibility/ruling questions!
2. Identify language ("ar" | "en").
3. If a specific saying or text is quoted or claimed, extract it in "claimed_text", else null.
4. Extract expanded search keywords and classical synonyms in BOTH Arabic and English (maximum 12 terms total).
Output STRICT JSON:
{"category":"textual"|"permissibility"|"personal"|"other","language":"ar"|"en","claimed_text":string|null,"terms":["term1"],"is_ruling_question":boolean}`;

  const modelsToTry = [LITE_MODEL, MAIN_MODEL];
  let retriesCount = 0;
  let lastError: Error | null = null;

  for (const model of modelsToTry) {
    try {
      const text = await generateWithTimeout(ai, model, question, systemInstruction);
      const parsed = JSON.parse(text);

      const terms = Array.isArray(parsed.terms) ? parsed.terms.filter(Boolean) : [question];

      return {
        category: parsed.category || (parsed.is_ruling_question ? 'permissibility' : 'textual'),
        language: parsed.language === 'en' ? 'en' : 'ar',
        claimed_text: parsed.claimed_text || null,
        terms: terms.length > 0 ? terms : [question],
        is_ruling_question: Boolean(parsed.is_ruling_question || parsed.category === 'permissibility'),
        modelUsed: model,
        retriesCount,
      };
    } catch (err: any) {
      retriesCount++;
      lastError = err;
    }
  }

  throw lastError || new Error('Failed Call 1');
}

// Call 2: Grounded synthesis strictly from retrieved texts & tafsir
export async function executeCall2(
  question: string,
  retrievedDocs: RetrievedDoc[],
  isPermissibility: boolean
): Promise<{
  verdict: 'supported' | 'contradicted' | 'unclear' | 'permissibility';
  summary: string;
  items: Array<{ id: string; quote: string; role: 'supports' | 'refutes' }>;
  promptChars: number;
  modelUsed: string;
  retriesCount: number;
}> {
  const ai = getGeminiClient();

  const systemInstruction = isPermissibility
    ? `You are an evidence extractor for Islamic scripture. This is a permissibility/ruling question.
Output ONLY factual verbatim quotes from the retrieved verse, tafsir, or hadith texts.
Do NOT give a fatwa or issue a ruling (no حرام، حلال، يجوز، لا يجوز، واجب، مكروه in the summary unless inside an exact quote).
Output STRICT JSON:
{"verdict":"permissibility","summary":"Concise neutral summary stating what the texts mention","items":[{"id":"string","quote":"string","role":"supports"}]}`
    : `You are an evidence verifier for Islamic scripture. Answer STRICTLY using the provided retrieved texts.
- "supports" means the text itself states the claim.
- "refutes" means the text states the opposite.
- Otherwise verdict = "unclear".
- Quotes MUST be copied verbatim from source items or tafsir.
- Do NOT include grades or ruling words in the summary unless inside a quote.
Output STRICT JSON:
{"verdict":"supported"|"contradicted"|"unclear","summary":"One factual sentence summarizing what the texts say","items":[{"id":"string","quote":"string","role":"supports"|"refutes"}]}`;

  const promptItems = retrievedDocs.slice(0, 6).map((d) => {
    if (d.type === 'ayah' && d.tafsirText) {
      const tafsirSnippet = extractDenseClusterQuote(d.tafsirText, [], 60);
      return `[Item id="${d.id}" source="${d.sourceLabel}"]\n[Verse Text]\n${d.fullText}\n[/Verse Text]\n[Tafsir]\n${tafsirSnippet}\n[/Tafsir]\n[/Item]`;
    }
    return `[Item id="${d.id}" source="${d.sourceLabel}"]\n${d.matnText}\n[/Item]`;
  }).join('\n\n');

  const userPrompt = `Question: ${question}\n\nRetrieved Texts:\n${promptItems}`;
  const promptChars = userPrompt.length;

  const modelsToTry = [LITE_MODEL, MAIN_MODEL];
  let retriesCount = 0;
  let lastError: Error | null = null;

  for (const model of modelsToTry) {
    try {
      const text = await generateWithTimeout(ai, model, userPrompt, systemInstruction);
      const parsed = JSON.parse(text);

      let v: 'supported' | 'contradicted' | 'unclear' | 'permissibility' = 'unclear';
      if (isPermissibility || parsed.verdict === 'permissibility') {
        v = 'permissibility';
      } else if (parsed.verdict === 'supported' || parsed.verdict === 'contradicted') {
        v = parsed.verdict;
      }

      return {
        verdict: v,
        summary: typeof parsed.summary === 'string' ? parsed.summary.trim() : '',
        items: Array.isArray(parsed.items) ? parsed.items : [],
        promptChars,
        modelUsed: model,
        retriesCount,
      };
    } catch (err: any) {
      retriesCount++;
      lastError = err;
    }
  }

  throw lastError || new Error('Failed Call 2');
}

// Master Stage 1 Function: Fast Cards & Retrieval (< 2-3s)
export async function executeAskStage1(
  req: AskRequest,
  clientIp = '127.0.0.1'
): Promise<AskResponse> {
  const startTime = performance.now();
  const rawQuestion = (req.question || '').trim();

  if (!rawQuestion) {
    return {
      question: rawQuestion,
      language: 'ar',
      category: 'other',
      verdict: 'unclear',
      verdictBadgeLabel: 'لم نعثر على نصٍّ مرتبط بسؤالك في المصادر المفهرسة؛ راجع أهل العلم',
      summary: '',
      searchedTerms: [],
      items: [],
      retrievedCount: 0,
      droppedItemsCount: 0,
      topRetrievedIds: [],
      executionTimeMs: 0,
      error: 'يرجى كتابة السؤال الشرعي للبحث.',
    };
  }

  if (!checkRateLimit(clientIp)) {
    return {
      question: rawQuestion,
      language: 'ar',
      category: 'other',
      verdict: 'unclear',
      verdictBadgeLabel: 'تم تجاوز الحد المسموح به',
      summary: '',
      searchedTerms: [],
      items: [],
      retrievedCount: 0,
      droppedItemsCount: 0,
      topRetrievedIds: [],
      executionTimeMs: Math.round(performance.now() - startTime),
      error: 'تم تجاوز الحد المسموح به للأسئلة (20 سؤالاً في الساعة). يرجى الانتظار والمحاولة لاحقاً.',
    };
  }

  const normKey = normalizeArabic(rawQuestion).toLowerCase().replace(/\s+/g, ' ');
  const cached = askCache.get(normKey);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
    return {
      ...cached.data,
      cached: true,
      executionTimeMs: Math.round(performance.now() - startTime),
    };
  }

  // Check Fabricated Sayings first
  const normCleanQuestion = stripArabicPrefixes(rawQuestion);
  const matchedFake = CURATED_FABRICATED_SAYINGS.find(
    (f) =>
      normCleanQuestion.includes(normalizeArabic(f.matn)) ||
      f.keywords.some((k) => normCleanQuestion.includes(normalizeArabic(k)))
  );

  if (matchedFake) {
    const res: AskResponse = {
      question: rawQuestion,
      language: 'ar',
      category: 'textual',
      verdict: 'contradicted',
      verdictBadgeLabel: 'حديث مكذوب / لا أصل له',
      verdictBadgeSubline: `حكم الحديث: «${matchedFake.ruling}» موثق في الدرر السنية`,
      isFabricated: true,
      fakeHadith: {
        matn: matchedFake.matn,
        ruling: matchedFake.ruling,
        url: matchedFake.url,
      },
      summary: `هذا القول («${matchedFake.matn}») لا أصل له أو حكمه «${matchedFake.ruling}» وفق التوثيق المعتمد في موقع الدرر السنية.`,
      searchedTerms: matchedFake.keywords,
      items: [],
      retrievedCount: 0,
      droppedItemsCount: 0,
      topRetrievedIds: [],
      executionTimeMs: Math.round(performance.now() - startTime),
    };
    askCache.set(normKey, { data: res, timestamp: Date.now() });
    return res;
  }

  if (!process.env.GEMINI_API_KEY) {
    return {
      question: rawQuestion,
      language: 'ar',
      category: 'other',
      verdict: 'unclear',
      verdictBadgeLabel: 'غير متاح',
      summary: '',
      searchedTerms: [],
      items: [],
      retrievedCount: 0,
      droppedItemsCount: 0,
      topRetrievedIds: [],
      executionTimeMs: Math.round(performance.now() - startTime),
      error: 'خدمة "اسأل" تتطلب ضبط مفتاح GEMINI_API_KEY في إعدادات الخادم.',
    };
  }

  // 1. Call 1 Timing
  const tCall1Start = performance.now();
  let call1Result;
  let call1Ms = 0;
  let call1Failover = '0';

  try {
    call1Result = await executeCall1(rawQuestion);
    call1Ms = Math.round(performance.now() - tCall1Start);
    call1Failover = `${call1Result.retriesCount} (${call1Result.modelUsed})`;
  } catch (err) {
    call1Ms = Math.round(performance.now() - tCall1Start);
    call1Result = {
      category: 'textual' as const,
      language: /[a-z]/i.test(rawQuestion) ? ('en' as const) : ('ar' as const),
      claimed_text: null,
      terms: [rawQuestion],
      is_ruling_question: false,
      modelUsed: 'fallback',
      retriesCount: 1,
    };
    call1Failover = '1 (fallback)';
  }

  const { category, language, terms, is_ruling_question } = call1Result;
  const isPermissibilityQuestion = is_ruling_question || category === 'permissibility';

  // 2. Retrieval Timing
  const tRetStart = performance.now();
  const { passingSources } = searchCorpusKeywords(terms, language);
  const retrievalMs = Math.round(performance.now() - tRetStart);

  if (passingSources.length === 0) {
    const res: AskResponse = {
      question: rawQuestion,
      language,
      category,
      verdict: 'unclear',
      verdictBadgeLabel: language === 'en'
        ? 'No relevant text found in indexed sources; consult qualified scholars'
        : 'لم نعثر على نصٍّ مرتبط بسؤالك في المصادر المفهرسة؛ راجع أهل العلم',
      summary: '',
      searchedTerms: terms,
      items: [],
      retrievedCount: 0,
      droppedItemsCount: 0,
      topRetrievedIds: [],
      executionTimeMs: Math.round(performance.now() - startTime),
      timing: {
        call1Ms,
        retrievalMs,
        call2Ms: 0,
        promptChars: 0,
        retriesFailover: call1Failover,
        totalMs: Math.round(performance.now() - startTime),
      },
    };
    askCache.set(normKey, { data: res, timestamp: Date.now() });
    return res;
  }

  // Build items strictly in retrieval rank order!
  const items: AskCitationItem[] = passingSources.map((d) => {
    const quote = extractDenseClusterQuote(d.fullText, terms, 25);
    return {
      id: d.id,
      quote,
      role: 'supports' as const,
      sourceTitle: d.sourceLabel,
      editionName: d.editionName,
      fullText: d.fullText,
      arabicFullText: d.arabicFullText,
      tafsirText: d.tafsirText,
      tafsirExcerpt: d.tafsirExcerpt,
      grades: d.grades,
      hasNoGrading: d.hasNoGrading,
      type: d.type,
      chapter: d.chapter,
      verse: d.verse,
      collection: d.collection,
      hadithnumber: d.hadithnumber,
    };
  });

  const defaultBadge = isPermissibilityQuestion
    ? (language === 'en' ? 'Related Texts' : 'نصوص ذات صلة')
    : (language === 'en' ? 'Found in Sources' : 'وُجد في المصادر');

  const defaultSubline = isPermissibilityQuestion
    ? (language === 'en' ? 'This is a ruling question; we present texts only, fatwa is for qualified scholars' : 'هذا سؤال في الحكم الشرعي؛ نعرض النصوص فقط، والفتوى لأهل العلم')
    : (language === 'en' ? 'This is a textual match, not a ruling on authenticity' : 'هذا ليس حكماً بصحة النص');

  const totalStage1Ms = Math.round(performance.now() - startTime);

  const res: AskResponse = {
    question: rawQuestion,
    language,
    category,
    verdict: isPermissibilityQuestion ? 'permissibility' : 'supported',
    verdictBadgeLabel: defaultBadge,
    verdictBadgeSubline: defaultSubline,
    isPermissibility: isPermissibilityQuestion,
    summary: '',
    searchedTerms: terms,
    items,
    retrievedCount: passingSources.length,
    droppedItemsCount: 0,
    topRetrievedIds: items.slice(0, 3).map((i) => i.id),
    executionTimeMs: totalStage1Ms,
    timing: {
      call1Ms,
      retrievalMs,
      call2Ms: 0,
      promptChars: 0,
      retriesFailover: call1Failover,
      totalMs: totalStage1Ms,
    },
    verdictPending: true,
  };

  if (req.singlePass) {
    return askQuestionFullPass(res, rawQuestion, passingSources, clientIp, startTime);
  }

  return res;
}

// Master Stage 2 Function: Call 2 Verdict & Synthesis
export async function executeAskVerdict(
  body: {
    question: string;
    language?: 'ar' | 'en';
    category?: 'textual' | 'permissibility' | 'personal' | 'other';
    searchedTerms?: string[];
    items?: AskCitationItem[];
  }
): Promise<AskResponse> {
  const t0 = performance.now();
  const rawQuestion = (body.question || '').trim();
  const language = body.language || 'ar';
  const category = body.category || 'textual';
  const terms = body.searchedTerms || [];
  const items = body.items || [];
  const isPermissibility = category === 'permissibility';

  if (items.length === 0) {
    return {
      question: rawQuestion,
      language,
      category,
      verdict: 'unclear',
      verdictBadgeLabel: language === 'en'
        ? 'No relevant text found in indexed sources; consult qualified scholars'
        : 'لم نعثر على نصٍّ مرتبط بسؤالك في المصادر المفهرسة؛ راجع أهل العلم',
      summary: '',
      searchedTerms: terms,
      items: [],
      retrievedCount: 0,
      droppedItemsCount: 0,
      topRetrievedIds: [],
      executionTimeMs: 0,
    };
  }

  // Re-map items to RetrievedDoc structure for Call 2
  const retrievedDocs: RetrievedDoc[] = items.map((i) => ({
    id: i.id,
    sourceLabel: i.sourceTitle,
    editionName: i.editionName,
    fullText: i.fullText,
    arabicFullText: i.arabicFullText,
    matnText: extractCleanMatn(i.fullText, 80),
    tafsirText: i.tafsirText,
    tafsirExcerpt: i.tafsirExcerpt,
    score: 10,
    matchedTermsCount: 2,
    hasRareTerm: true,
    type: i.type,
    chapter: i.chapter,
    verse: i.verse,
    collection: i.collection,
    hadithnumber: i.hadithnumber,
    grades: i.grades,
    hasNoGrading: i.hasNoGrading,
  }));

  let call2Result;
  let call2Ms = 0;
  let promptChars = 0;
  let call2Failover = '0';

  try {
    const tCall2Start = performance.now();
    call2Result = await executeCall2(rawQuestion, retrievedDocs, isPermissibility);
    call2Ms = Math.round(performance.now() - tCall2Start);
    promptChars = call2Result.promptChars;
    call2Failover = `${call2Result.retriesCount} (${call2Result.modelUsed})`;
  } catch (err) {
    call2Ms = Math.round(performance.now() - t0);
    call2Result = {
      verdict: isPermissibility ? ('permissibility' as const) : ('unclear' as const),
      summary: language === 'en'
        ? 'Automated summary unavailable; texts below are the source'
        : 'تعذّر إنشاء الملخص الآلي الآن؛ النصوص أدناه هي المصدر',
      items: [],
      promptChars: 0,
      modelUsed: 'failed',
      retriesCount: 1,
    };
    call2Failover = '1 (failed)';
  }

  // Update item quotes if Call 2 returned verified quotes
  const itemMap = new Map<string, AskCitationItem>();
  for (const i of items) itemMap.set(i.id, i);

  for (const call2Item of call2Result.items || []) {
    const existing = itemMap.get(call2Item.id);
    if (existing && call2Item.quote) {
      existing.quote = extractDenseClusterQuote(existing.fullText, terms, 25) || call2Item.quote;
      existing.role = call2Item.role === 'refutes' ? 'refutes' : 'supports';
    }
  }

  let finalSummary = call2Result.summary;
  if (!finalSummary) {
    if (isPermissibility) {
      const quotes = items.map((i) => i.quote).filter(Boolean);
      const prefix = language === 'en' ? 'The texts state: ' : 'تذكر النصوص: ';
      finalSummary = quotes.length > 0 ? `${prefix}${quotes.join('؛ ')}` : '';
    } else {
      finalSummary = language === 'en' ? 'Found matching texts in canonical sources below.' : 'تم العثور على نص مسند في المصادر أدناه.';
    }
  }

  const badgeLabel = isPermissibility
    ? (language === 'en' ? 'Related Texts' : 'نصوص ذات صلة')
    : (language === 'en' ? 'Found in Sources' : 'وُجد في المصادر');

  const badgeSubline = isPermissibility
    ? (language === 'en' ? 'This is a ruling question; we present texts only, fatwa is for qualified scholars' : 'هذا سؤال في الحكم الشرعي؛ نعرض النصوص فقط، والفتوى لأهل العلم')
    : (language === 'en' ? 'This is a textual match, not a ruling on authenticity' : 'هذا ليس حكماً بصحة النص');

  const res: AskResponse = {
    question: rawQuestion,
    language,
    category,
    verdict: isPermissibility ? 'permissibility' : 'supported',
    verdictBadgeLabel: badgeLabel,
    verdictBadgeSubline: badgeSubline,
    isPermissibility,
    summary: finalSummary,
    searchedTerms: terms,
    items,
    retrievedCount: items.length,
    droppedItemsCount: 0,
    topRetrievedIds: items.slice(0, 3).map((i) => i.id),
    executionTimeMs: Math.round(performance.now() - t0),
    timing: {
      call1Ms: 0,
      retrievalMs: 0,
      call2Ms,
      promptChars,
      retriesFailover: call2Failover,
      totalMs: Math.round(performance.now() - t0),
    },
    verdictPending: false,
  };

  const normKey = normalizeArabic(rawQuestion).toLowerCase().replace(/\s+/g, ' ');
  askCache.set(normKey, { data: res, timestamp: Date.now() });

  return res;
}

// Single-pass helper for benchmark & eval
async function askQuestionFullPass(
  stage1Res: AskResponse,
  rawQuestion: string,
  passingSources: RetrievedDoc[],
  clientIp: string,
  startTime: number
): Promise<AskResponse> {
  const verdictRes = await executeAskVerdict({
    question: rawQuestion,
    language: stage1Res.language,
    category: stage1Res.category,
    searchedTerms: stage1Res.searchedTerms,
    items: stage1Res.items,
  });

  return {
    ...verdictRes,
    executionTimeMs: Math.round(performance.now() - startTime),
    timing: {
      call1Ms: stage1Res.timing?.call1Ms || 0,
      retrievalMs: stage1Res.timing?.retrievalMs || 0,
      call2Ms: verdictRes.timing?.call2Ms || 0,
      promptChars: verdictRes.timing?.promptChars || 0,
      retriesFailover: `${stage1Res.timing?.retriesFailover || '0'} / ${verdictRes.timing?.retriesFailover || '0'}`,
      totalMs: Math.round(performance.now() - startTime),
    },
  };
}

// Master askQuestion entry point
export async function askQuestion(
  req: AskRequest,
  clientIp = '127.0.0.1'
): Promise<AskResponse> {
  const stage1 = await executeAskStage1(req, clientIp);
  if (req.singlePass || !stage1.verdictPending) {
    return stage1;
  }
  // If not singlePass, return Stage 1 immediately!
  return stage1;
}
