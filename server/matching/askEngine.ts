import fs from 'fs';
import path from 'path';
import { GoogleGenAI } from '@google/genai';
import { loadCorpus, lookupHadithAr, getQuranEn, getHadithEn } from '../corpus/loader.ts';
import { initHadithEngine, getIndexedCounts } from './hadithMatcher.ts';
import type { HadithGradeItem } from './hadithMatcher.ts';
import { initAyahEngine, getQuranEnText } from './ayahMatcher.ts';
import { normalizeArabic, toAlefInvariant } from './normalizer.ts';

// Model specifications per instructions:
// Default lite model: gemini-3.1-flash-lite, with failover
const LITE_MODEL = 'gemini-3.1-flash-lite';
const MAIN_MODEL = 'gemini-flash-latest';
const BACKUP_MODEL = 'gemini-3.1-flash-lite';

export interface AskRequest {
  question: string;
  language?: 'ar' | 'en';
}

export interface AskCitationItem {
  id: string;
  quote: string;
  role: 'supports' | 'refutes';
  sourceTitle: string;
  editionName?: string;
  fullText: string;
  grades?: HadithGradeItem[];
  hasNoGrading?: boolean;
  type: 'ayah' | 'hadith';
  chapter?: number;
  verse?: number;
  collection?: string;
  hadithnumber?: number;
}

export interface AskResponse {
  question: string;
  language: 'ar' | 'en';
  category: 'textual' | 'permissibility' | 'personal' | 'other';
  verdict: 'supported' | 'contradicted' | 'unclear' | 'permissibility';
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

// Clean matn text: remove isnad preamble if present and limit to max 120 words
export function extractCleanMatn(text: string, maxWords = 120): string {
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

// Select best relevant sentence for quote (never cut mid-word!)
export function selectBestRelevantQuote(fullText: string, terms: string[], isAr: boolean): string {
  if (!fullText) return '';
  const cleanFull = fullText.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
  
  // Split into sentences / clauses
  const rawSentences = cleanFull.split(/[.!?؟،؛\n]+/).map(s => s.trim()).filter(s => s.length >= 10);
  if (rawSentences.length === 0) {
    return cleanFull.length <= 150 ? cleanFull : '';
  }

  const cleanTerms = terms.map(t => isAr ? stripArabicPrefixes(t) : t.toLowerCase()).filter(t => t.length >= 2);

  let bestSentence = '';
  let bestScore = 0;

  for (const sentence of rawSentences) {
    const normSentence = isAr 
      ? stripArabicPrefixes(sentence) 
      : sentence.toLowerCase();
    
    let score = 0;
    for (const term of cleanTerms) {
      if (normSentence.includes(term)) {
        score += term.length >= 5 ? 2 : 1;
      }
    }

    if (score > bestScore) {
      bestScore = score;
      bestSentence = sentence;
    }
  }

  // Only return if at least 1 term matches with positive relevance score
  return bestScore >= 1 ? bestSentence.trim() : '';
}

export interface RetrievedDoc {
  id: string;
  sourceLabel: string;
  editionName?: string;
  fullText: string;
  matnText: string;
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

const AR_STOP_WORDS = new Set([
  'قال', 'النبي', 'رسول', 'الله', 'صلى', 'عليه', 'وسلم', 'عن', 'في', 'من', 'إلى', 'على',
  'ما', 'لا', 'أن', 'إن', 'كان', 'هو', 'هي', 'هل', 'كم', 'كل', 'ذلك', 'هذا', 'هذه', 'مع',
  'أو', 'ثم', 'قد', 'بين', 'عند', 'فإن', 'إذا', 'حيث', 'نحو', 'سنة', 'حديث', 'رواه',
  'نبي', 'أمر', 'ورد', 'حكم', 'شريعة', 'إسلام', 'صحيح', 'حسن', 'ضعيف'
]);

const EN_STOP_WORDS = new Set([
  'the', 'a', 'an', 'and', 'or', 'of', 'in', 'on', 'at', 'to', 'for', 'with', 'by', 'from',
  'is', 'was', 'are', 'were', 'it', 'its', 'he', 'she', 'they', 'prophet', 'said', 'messenger',
  'ordered', 'people', 'man', 'men', 'hadith', 'narrated', 'peace', 'be', 'upon', 'him',
  'about', 'did', 'does', 'that', 'this', 'these', 'those', 'who', 'whom', 'which', 'what',
  'sunnah', 'islamic', 'islam', 'ruling', 'order', 'sahih', 'hasan', 'daif', 'authentic'
]);

// Check if a term is rare (classical high-specificity term)
function isRareTerm(term: string, isAr: boolean): boolean {
  if (!term) return false;
  if (isAr && AR_STOP_WORDS.has(term)) return false;
  if (!isAr && EN_STOP_WORDS.has(term.toLowerCase())) return false;
  
  if (isAr && term.length >= 6) return true;
  if (!isAr && term.length >= 8) return true;

  const rareKeywords = [
    'شوال', 'تبسمك', 'صدقة', 'القبلة', 'قبلة', 'مثنى', 'ثلاث', 'رباع',
    'فانكحوا', 'اليتامى', 'استقبال', 'استدبار', 'غائط', 'بول', 'صيام'
  ];
  const norm = stripArabicPrefixes(term);
  return rareKeywords.some(k => norm.includes(k) || k.includes(norm));
}

export function searchCorpusKeywords(
  terms: string[],
  lang: 'ar' | 'en'
): { hadiths: RetrievedDoc[]; ayat: RetrievedDoc[]; passingSources: RetrievedDoc[] } {
  const { corpus } = loadCorpus();
  initHadithEngine();
  initAyahEngine();

  const isAr = lang !== 'en';
  
  // Collect both multi-word phrases and individual word tokens
  const rawTerms: string[] = [];
  for (const t of terms) {
    if (!t) continue;
    rawTerms.push(t);
    const splitWords = t.split(/\s+/).filter((w) => w.length >= 2);
    if (splitWords.length > 1) {
      rawTerms.push(...splitWords);
    }
  }

  const cleanTerms = Array.from(
    new Set(
      rawTerms
        .map((t) => (isAr ? stripArabicPrefixes(t) : t.toLowerCase().trim()))
        .filter((t) => {
          if (t.length < 2) return false;
          if (isAr && AR_STOP_WORDS.has(t)) return false;
          if (!isAr && EN_STOP_WORDS.has(t)) return false;
          return true;
        })
    )
  ).slice(0, 16);

  if (cleanTerms.length === 0) {
    return { hadiths: [], ayat: [], passingSources: [] };
  }

  // 1. Search Quran (Ayat)
  const matchedAyat: RetrievedDoc[] = [];
  const quranList = isAr ? corpus.quran.ar : getQuranEn();
  for (let i = 0; i < quranList.length; i++) {
    const item = quranList[i];
    const text = item.text || '';
    const norm = isAr 
      ? normalizeArabic(text).replace(/[\u064B-\u065F\u0670]/g, '')
      : text.toLowerCase();

    let matchCount = 0;
    let score = 0;
    let hasRare = false;

    for (const term of cleanTerms) {
      if (norm.includes(term)) {
        matchCount++;
        const weight = term.length > 5 ? 3.5 : 2.0;
        score += weight;
        if (isRareTerm(term, isAr)) {
          hasRare = true;
        }
      }
    }

    // Keep candidate in Ayat list
    if (matchCount >= 1) {
      matchedAyat.push({
        id: `ayah_${item.chapter}_${item.verse}`,
        sourceLabel: isAr
          ? `سورة ${item.chapter} - آية ${item.verse}`
          : `Surah ${item.chapter}:${item.verse}`,
        editionName: isAr ? 'القرآن الكريم' : 'Saheeh International (eng-ummmuhammad)',
        fullText: text,
        matnText: extractCleanMatn(text, 120),
        score,
        matchedTermsCount: matchCount,
        hasRareTerm: hasRare,
        type: 'ayah',
        chapter: item.chapter,
        verse: item.verse,
      });
    }
  }

  // 2. Search Hadiths across all 7 collections (MATN ONLY!)
  const matchedHadiths: RetrievedDoc[] = [];
  const collections = ['bukhari', 'muslim', 'tirmidhi', 'abudawud', 'nasai', 'ibnmajah', 'nawawi'] as const;

  for (const col of collections) {
    const list = corpus.hadith.ar[col] || [];
    const enList = !isAr ? getHadithEn(col) : [];
    const count = isAr ? list.length : enList.length;

    for (let i = 0; i < count; i++) {
      const h = isAr ? list[i] : enList[i];
      if (!h || !h.text) continue;
      const text = h.text;
      
      // Matn only to avoid isnad narrator noise
      const matn = isAr ? extractCleanMatn(text, 120) : text;
      const normMatn = isAr 
        ? normalizeArabic(matn).replace(/[\u064B-\u065F\u0670]/g, '')
        : matn.toLowerCase();

      let matchCount = 0;
      let score = 0;
      let hasRare = false;

      for (const term of cleanTerms) {
        if (normMatn.includes(term)) {
          matchCount++;
          const weight = term.length > 5 ? 3.5 : 2.0;
          score += weight;
          if (isRareTerm(term, isAr)) {
            hasRare = true;
          }
        }
      }

      if (matchCount >= 1) {
        const arHadith = isAr ? h : lookupHadithAr(col, h.hadithnumber || i + 1);
        const grades = arHadith?.grades || [];
        const hasNoGrading = col === 'bukhari' || col === 'muslim' || col === 'nawawi';

        matchedHadiths.push({
          id: `${col}_${h.hadithnumber || i + 1}`,
          sourceLabel: isAr
            ? `${getCollectionArabicName(col)} - حديث ${h.hadithnumber || i + 1}`
            : `${getCollectionEnglishName(col)} - Hadith ${h.hadithnumber || i + 1}`,
          editionName: isAr ? getCollectionArabicName(col) : `${getCollectionEnglishName(col)} (English translation)`,
          fullText: text,
          matnText: matn,
          score,
          matchedTermsCount: matchCount,
          hasRareTerm: hasRare,
          type: 'hadith',
          collection: col,
          hadithnumber: h.hadithnumber || i + 1,
          grades: parseGrades(grades),
          hasNoGrading,
        });
      }
    }
  }

  // Sort Hadiths and Ayat separately
  matchedHadiths.sort((a, b) => b.score - a.score);
  matchedAyat.sort((a, b) => b.score - a.score);

  const top8Hadiths = matchedHadiths.slice(0, 8);
  const top5Ayat = matchedAyat.slice(0, 5);

  // Apply Relevance Floor:
  // Show a source only if it matches at least 2 distinct expanded terms OR 1 rare term
  const passesFloor = (d: RetrievedDoc) => d.matchedTermsCount >= 2 || d.hasRareTerm;

  const filteredHadiths = top8Hadiths.filter(passesFloor);
  const filteredAyat = top5Ayat.filter(passesFloor);

  // Combine and sort by score, cap at max 5 sources
  const allFiltered = [...filteredHadiths, ...filteredAyat];
  allFiltered.sort((a, b) => b.score - a.score);
  const passingSources = allFiltered.slice(0, 5);

  return {
    hadiths: top8Hadiths,
    ayat: top5Ayat,
    passingSources,
  };
}

function getCollectionArabicName(col: string): string {
  switch (col) {
    case 'bukhari':
      return 'صحيح البخاري';
    case 'muslim':
      return 'صحيح مسلم';
    case 'abudawud':
      return 'سنن أبي داود';
    case 'tirmidhi':
      return 'جامع الترمذي';
    case 'nasai':
      return 'سنن النسائي';
    case 'ibnmajah':
      return 'سنن ابن ماجه';
    case 'nawawi':
      return 'الأربعون النووية';
    default:
      return col;
  }
}

function getCollectionEnglishName(col: string): string {
  switch (col) {
    case 'bukhari':
      return 'Sahih al-Bukhari';
    case 'muslim':
      return 'Sahih Muslim';
    case 'abudawud':
      return 'Sunan Abi Dawud';
    case 'tirmidhi':
      return 'Jami` at-Tirmidhi';
    case 'nasai':
      return "Sunan an-Nasa'i";
    case 'ibnmajah':
      return 'Sunan Ibn Majah';
    case 'nawawi':
      return "An-Nawawi's 40 Hadith";
    default:
      return col;
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

// Gemini Client initialization with server-side API Key
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

// Call 1: Intent classification & search term expansion
export async function executeCall1(
  question: string
): Promise<{
  category: 'textual' | 'permissibility' | 'personal' | 'other';
  language: 'ar' | 'en';
  claimed_text: string | null;
  terms: string[];
  is_ruling_question: boolean;
}> {
  const ai = getGeminiClient();

  const systemInstruction = `You are a scholarly search term expander for Quran and Hadith corpora. Analyze the user's question.
Do NOT answer the question; output JSON only.
1. Classify the intent into one of: "textual" (asking if a specific hadith/verse exists or what text says), "permissibility" (halal/haram/ruling question), "personal" (asking for personal fatwa/counsel), or "other".
2. Identify language ("ar" | "en").
3. If a specific saying or text is quoted or claimed, extract it in "claimed_text", else null.
4. Extract expanded search keywords and classical synonyms (maximum 12 terms total across all arrays). Arabic terms in classical forms as they appear in hadith texts; English terms as in the translations.
Output STRICT JSON:
{"category":"textual"|"permissibility"|"personal"|"other","language":"ar"|"en","claimed_text":string|null,"primary_ar":["term1"],"synonyms_ar":["syn1"],"terms_en":["term1"],"terms":["term1"],"is_ruling_question":boolean}`;

  const modelsToTry = [LITE_MODEL, MAIN_MODEL, BACKUP_MODEL];
  let lastError: Error | null = null;

  for (const model of modelsToTry) {
    try {
      const response = await ai.models.generateContent({
        model,
        contents: question,
        config: {
          systemInstruction,
          temperature: 0,
          responseMimeType: 'application/json',
        },
      });

      const text = response.text?.trim() || '{}';
      const parsed = JSON.parse(text);

      const combinedTerms: string[] = [];
      if (Array.isArray(parsed.terms)) combinedTerms.push(...parsed.terms);
      if (Array.isArray(parsed.primary_ar)) combinedTerms.push(...parsed.primary_ar);
      if (Array.isArray(parsed.synonyms_ar)) combinedTerms.push(...parsed.synonyms_ar);
      if (Array.isArray(parsed.terms_en)) combinedTerms.push(...parsed.terms_en);

      const uniqueTerms = Array.from(new Set(combinedTerms.filter(Boolean))).slice(0, 12);

      return {
        category: parsed.category || (parsed.is_ruling_question ? 'permissibility' : 'textual'),
        language: parsed.language === 'en' ? 'en' : 'ar',
        claimed_text: parsed.claimed_text || null,
        terms: uniqueTerms.length > 0 ? uniqueTerms : [question],
        is_ruling_question: Boolean(parsed.is_ruling_question || parsed.category === 'permissibility'),
      };
    } catch (err: any) {
      lastError = err;
      // Failover to next model
    }
  }

  throw lastError || new Error('Failed to generate call 1 expansion');
}

// Call 2: Grounded synthesis strictly from retrieved texts
export async function executeCall2(
  question: string,
  retrievedDocs: RetrievedDoc[]
): Promise<{
  verdict: 'supported' | 'contradicted' | 'unclear';
  summary: string;
  items: Array<{ id: string; quote: string; role: 'supports' | 'refutes' }>;
}> {
  const ai = getGeminiClient();

  const systemInstruction = `You are an evidence verifier for Islamic scripture. You MUST answer STRICTLY and ONLY using the provided retrieved texts. Never use external memory or extrapolate rulings.
- "supports" means the text itself states the claim. A text that only mentions the topic is NOT support.
- "refutes" means the text states the opposite.
- Otherwise verdict = "unclear".
- Quotes MUST be in the exact same language as the source text, copied verbatim from that source item.
- Do NOT include grades, narrators, or ruling words (حرام، حلال، يجوز، لا يجوز، واجب، مكروه) in the summary unless that exact word appears inside a quoted item. If the summary breaks this, output empty summary.
Output STRICT JSON:
{"verdict":"supported"|"contradicted"|"unclear","summary":"One factual sentence in Arabic summarizing what the texts say","items":[{"id":"string","quote":"string","role":"supports"|"refutes"}]}`;

  const promptItems = retrievedDocs.map((d) => `[Item id="${d.id}" source="${d.sourceLabel}"]\n${d.matnText}\n[/Item]`).join('\n\n');
  const userPrompt = `Question: ${question}\n\nRetrieved Texts:\n${promptItems}`;

  const modelsToTry = [LITE_MODEL, MAIN_MODEL, BACKUP_MODEL];
  let lastError: Error | null = null;

  for (const model of modelsToTry) {
    try {
      const response = await ai.models.generateContent({
        model,
        contents: userPrompt,
        config: {
          systemInstruction,
          temperature: 0,
          responseMimeType: 'application/json',
        },
      });

      const text = response.text?.trim() || '{}';
      const parsed = JSON.parse(text);

      return {
        verdict: parsed.verdict === 'supported' || parsed.verdict === 'contradicted' ? parsed.verdict : 'unclear',
        summary: typeof parsed.summary === 'string' ? parsed.summary.trim() : '',
        items: Array.isArray(parsed.items) ? parsed.items : [],
      };
    } catch (err: any) {
      lastError = err;
      // Failover to next model
    }
  }

  throw lastError || new Error('Failed to generate call 2 verification');
}

// Master Ask Function
export async function askQuestion(
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

  // Rate Limiting
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

  // Cache Check
  const normKey = normalizeArabic(rawQuestion).toLowerCase().replace(/\s+/g, ' ');
  const cached = askCache.get(normKey);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
    return {
      ...cached.data,
      cached: true,
      executionTimeMs: Math.round(performance.now() - startTime),
    };
  }

  // Check Curated Fabricated Sayings list first (Rule 7)
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

  // Check GEMINI_API_KEY
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

  // 1. Gemini Call 1: Expansion & Classification
  let call1Result;
  try {
    call1Result = await executeCall1(rawQuestion);
  } catch (err: any) {
    return {
      question: rawQuestion,
      language: 'ar',
      category: 'other',
      verdict: 'unclear',
      verdictBadgeLabel: 'حدث خطأ في الاتصال',
      summary: '',
      searchedTerms: [],
      items: [],
      retrievedCount: 0,
      droppedItemsCount: 0,
      topRetrievedIds: [],
      executionTimeMs: Math.round(performance.now() - startTime),
      error: 'تعذر الاتصال بنموذج التوسيع، يرجى المحاولة لاحقاً.',
    };
  }

  const { category, language, claimed_text, terms, is_ruling_question } = call1Result;

  // Check claimed_text against fabricated list if extracted
  if (claimed_text) {
    const normClaim = stripArabicPrefixes(claimed_text);
    const fakeClaim = CURATED_FABRICATED_SAYINGS.find(
      (f) =>
        normClaim.includes(normalizeArabic(f.matn)) ||
        f.keywords.some((k) => normClaim.includes(normalizeArabic(k)))
    );
    if (fakeClaim) {
      const res: AskResponse = {
        question: rawQuestion,
        language,
        category,
        verdict: 'contradicted',
        verdictBadgeLabel: 'حديث مكذوب / لا أصل له',
        verdictBadgeSubline: `حكم الحديث: «${fakeClaim.ruling}» موثق في الدرر السنية`,
        isFabricated: true,
        fakeHadith: {
          matn: fakeClaim.matn,
          ruling: fakeClaim.ruling,
          url: fakeClaim.url,
        },
        summary: `النص المذكور في السؤال («${fakeClaim.matn}») حكمه عند المحدثين «${fakeClaim.ruling}» وفق ما تم توثيقه في موقع الدرر السنية.`,
        searchedTerms: terms,
        items: [],
        retrievedCount: 0,
        droppedItemsCount: 0,
        topRetrievedIds: [],
        executionTimeMs: Math.round(performance.now() - startTime),
      };
      askCache.set(normKey, { data: res, timestamp: Date.now() });
      return res;
    }
  }

  // 2. Deterministic Retrieval with matn-only tokens & Relevance Floor
  const { passingSources } = searchCorpusKeywords(terms, language);
  const topRetrievedIds = passingSources.map((d) => d.id).slice(0, 3);

  // If NO sources pass the relevance floor:
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
    };
    askCache.set(normKey, { data: res, timestamp: Date.now() });
    return res;
  }

  // If permissibility question: SKIP CALL 2 per instructions!
  if (is_ruling_question || category === 'permissibility') {
    const verifiedItems: AskCitationItem[] = passingSources.map((d) => ({
      id: d.id,
      quote: selectBestRelevantQuote(d.matnText || d.fullText, terms, language !== 'en'),
      role: 'supports',
      sourceTitle: d.sourceLabel,
      editionName: d.editionName,
      fullText: d.fullText,
      grades: d.grades,
      hasNoGrading: d.hasNoGrading,
      type: d.type,
      chapter: d.chapter,
      verse: d.verse,
      collection: d.collection,
      hadithnumber: d.hadithnumber,
    }));

    const res: AskResponse = {
      question: rawQuestion,
      language,
      category: 'permissibility',
      verdict: 'permissibility',
      verdictBadgeLabel: language === 'en'
        ? 'This is a ruling question; we present texts only, fatwa is for qualified scholars'
        : 'هذا سؤال في الحكم الشرعي؛ نعرض النصوص فقط، والفتوى لأهل العلم',
      isPermissibility: true,
      summary: '',
      searchedTerms: terms,
      items: verifiedItems,
      retrievedCount: passingSources.length,
      droppedItemsCount: 0,
      topRetrievedIds,
      executionTimeMs: Math.round(performance.now() - startTime),
    };
    askCache.set(normKey, { data: res, timestamp: Date.now() });
    return res;
  }

  // 3. Gemini Call 2: Grounded Synthesis
  let call2Result;
  try {
    call2Result = await executeCall2(rawQuestion, passingSources);
  } catch (err) {
    call2Result = { verdict: 'unclear' as const, summary: '', items: [] };
  }

  // 4. Code-Side Grounding Checks (Strictly code, not the model!)
  const retrievedMap = new Map<string, RetrievedDoc>();
  for (const d of passingSources) {
    retrievedMap.set(d.id, d);
  }

  let droppedItemsCount = 0;
  const verifiedItems: AskCitationItem[] = [];

  for (const item of call2Result.items || []) {
    const sourceDoc = retrievedMap.get(item.id);
    if (!sourceDoc) {
      // Drop: ID not in retrieved set!
      droppedItemsCount++;
      continue;
    }

    // Quote must be an exact normalized substring of source text
    const normSource = normalizeArabic(sourceDoc.fullText).replace(/[\u064B-\u065F\u0670]/g, '');
    const normQuote = normalizeArabic(item.quote || '').replace(/[\u064B-\u065F\u0670]/g, '');

    if (!normQuote || !normSource.includes(normQuote)) {
      // Drop: Quote is not an exact substring!
      droppedItemsCount++;
      continue;
    }

    verifiedItems.push({
      id: sourceDoc.id,
      quote: item.quote.trim(),
      role: item.role === 'refutes' ? 'refutes' : 'supports',
      sourceTitle: sourceDoc.sourceLabel,
      editionName: sourceDoc.editionName,
      fullText: sourceDoc.fullText,
      grades: sourceDoc.grades,
      hasNoGrading: sourceDoc.hasNoGrading,
      type: sourceDoc.type,
      chapter: sourceDoc.chapter,
      verse: sourceDoc.verse,
      collection: sourceDoc.collection,
      hadithnumber: sourceDoc.hadithnumber,
    });
  }

  // Check remaining supporting items
  const supportingItems = verifiedItems.filter((i) => i.role === 'supports');
  let finalVerdict: 'supported' | 'contradicted' | 'unclear' = call2Result.verdict;

  if (supportingItems.length === 0 && finalVerdict === 'supported') {
    finalVerdict = 'unclear';
  }

  // Summary validation: check ruling words
  const forbiddenRulingWords = ['حرام', 'حلال', 'يجوز', 'لا يجوز', 'واجب', 'مكروه'];
  let finalSummary = call2Result.summary || '';
  const quotesCombined = verifiedItems.map((v) => v.quote).join(' ');

  for (const word of forbiddenRulingWords) {
    if (finalSummary.includes(word) && !quotesCombined.includes(word)) {
      finalSummary = 'الملخص غير متاح';
      break;
    }
  }

  // Grade check: If every supporting hadith has graders and NONE is in the sahih/hasan family
  let isWeakOnly = false;
  let verdictBadgeLabel = 'لم يتم العثور على تطابق موثوق، راجع أهل العلم';
  let verdictBadgeSubline: string | undefined = undefined;

  if (finalVerdict === 'supported') {
    const supportingHadiths = supportingItems.filter((i) => i.type === 'hadith');
    if (supportingHadiths.length > 0) {
      const allHadithsHaveGrades = supportingHadiths.every(
        (h) => !h.hasNoGrading && Array.isArray(h.grades) && h.grades.length > 0
      );
      const noneIsSahihOrHasan = supportingHadiths.every((h) =>
        (h.grades || []).every((g) => g.family !== 'صحيح' && g.family !== 'حسن')
      );

      if (allHadithsHaveGrades && noneIsSahihOrHasan) {
        isWeakOnly = true;
        verdictBadgeLabel = 'وُجد نص، لكن درجته ضعيفة عند المصدر';
        verdictBadgeSubline = 'النصوص المسترجعة مروية بأسانيد حكم المحدثون بضعفها';
      } else {
        verdictBadgeLabel = 'وُجد في المصادر';
        verdictBadgeSubline = 'هذا ليس حكماً بصحة النص';
      }
    } else {
      // Quran verses
      verdictBadgeLabel = 'وُجد في المصادر';
      verdictBadgeSubline = 'هذا ليس حكماً بصحة النص';
    }
  } else if (finalVerdict === 'contradicted') {
    verdictBadgeLabel = language === 'en' ? 'Contradicted by canonical texts' : 'معارض للنصوص المعتمدة';
  } else {
    verdictBadgeLabel = language === 'en' 
      ? 'No relevant text found in indexed sources; consult qualified scholars' 
      : 'لم نعثر على نصٍّ مرتبط بسؤالك في المصادر المفهرسة؛ راجع أهل العلم';
  }

  // If final verdict is unclear or supported with no verified items, do not show unverified cards
  const displayItems = finalVerdict === 'unclear' ? [] : verifiedItems;

  const res: AskResponse = {
    question: rawQuestion,
    language,
    category,
    verdict: finalVerdict,
    verdictBadgeLabel,
    verdictBadgeSubline,
    isWeakOnly,
    summary: finalSummary || (finalVerdict === 'supported' ? 'تم العثور على نص مسند في المصادر أدناه.' : ''),
    searchedTerms: terms,
    items: displayItems,
    retrievedCount: passingSources.length,
    droppedItemsCount,
    topRetrievedIds,
    executionTimeMs: Math.round(performance.now() - startTime),
  };

  askCache.set(normKey, { data: res, timestamp: Date.now() });
  return res;
}
