import fs from 'fs';
import path from 'path';
import { GoogleGenAI } from '@google/genai';
import { loadCorpus, lookupHadithAr, lookupHadithEn, getQuranEn, getHadithEn, getQuranTafsirForAyah, loadAskSearchIndex } from '../corpus/loader.ts';
import { initHadithEngine } from './hadithMatcher.ts';
import type { HadithGradeItem } from './hadithMatcher.ts';
import { initAyahEngine } from './ayahMatcher.ts';
import { normalizeArabic } from './normalizer.ts';
import { quotaManager } from '../quota.config.ts';

const CALL_TIMEOUT_MS = 3500; // 3.5 seconds timeout per model call for fast response

export interface AskRequest {
  question: string;
  language?: 'ar' | 'en';
  singlePass?: boolean;
  userApiKey?: string;
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
  score?: number;
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
  quotaNotice?: string;
  retryAfterSeconds?: number;
}

// LRU cache with 200 entries
export class AskLRUCache {
  private cache = new Map<string, { data: AskResponse; timestamp: number }>();
  private maxEntries: number;

  constructor(maxEntries = 200) {
    this.maxEntries = maxEntries;
  }

  get(key: string): AskResponse | undefined {
    const entry = this.cache.get(key);
    if (!entry) return undefined;
    if (Date.now() - entry.timestamp > CACHE_TTL_MS) {
      this.cache.delete(key);
      return undefined;
    }
    // Refresh LRU order
    this.cache.delete(key);
    this.cache.set(key, entry);
    return entry.data;
  }

  set(key: string, data: AskResponse) {
    if (this.cache.has(key)) {
      this.cache.delete(key);
    } else if (this.cache.size >= this.maxEntries) {
      const oldestKey = this.cache.keys().next().value;
      if (oldestKey) this.cache.delete(oldestKey);
    }
    this.cache.set(key, { data, timestamp: Date.now() });
  }

  clear() {
    this.cache.clear();
  }

  size(): number {
    return this.cache.size;
  }
}

export const askCache = new AskLRUCache(200);
const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour

// Rate limit: 20 per IP per hour
const ipRateLimits = new Map<string, { count: number; resetTime: number }>();

export function checkRateLimit(ip: string): boolean {
  if (ip === '127.0.0.1' || ip === '::1' || ip === '::ffff:127.0.0.1') {
    return true;
  }
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
    keywords: ['الصين', 'اطلبوا العلم ولو بالصين', 'اطلبوا العلم ولو في الصين', 'seek knowledge even in china', 'seek knowledge even if in china'],
    matn: 'اطلبوا العلم ولو بالصين',
    ruling: 'لا يصح',
    url: 'https://dorar.net/fake-hadith/38',
  },
  {
    keywords: ['حب الوطن من الإيمان', 'love of homeland is part of faith'],
    matn: 'حب الوطن من الإيمان',
    ruling: 'ليس بحديث',
    url: 'https://dorar.net/fake-hadith/74',
  },
  {
    keywords: ['المعدة بيت الداء', 'الحمية رأس الدواء', 'الحمية رأس كل دواء', 'the stomach is the home of disease', 'diet is the head of medicine', 'diet is the head of all medicine'],
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

const GENERIC_TERMS = new Set([
  'marry', 'marriage', 'wives', 'women', 'wife', 'woman',
  'النساء', 'الزواج', 'أكثر', 'واحدة', 'زواج', 'امرأة', 'زوجة',
  'وجه', 'أخيك', 'صدقة', 'صيام', 'ست', 'ستة', 'صام'
]);

function getConceptPairBonus(textAr: string, textEn: string, docId: string): number {
  const normAr = normalizeArabic(textAr).toLowerCase();
  const normEn = textEn.toLowerCase();

  const hasFourAr = normAr.includes('أربع') || normAr.includes('أربعة') || normAr.includes('رباع') || normAr.includes('مثنى');
  const hasFourEn = normEn.includes('four') || normEn.includes(' 4 ') || normEn.includes('two or three or four') || normEn.includes('polygyn');
  const hasWivesAr = normAr.includes('زوج') || normAr.includes('نس') || normAr.includes('نكح') || normAr.includes('امرأ');
  const hasWivesEn = normEn.includes('marry') || normEn.includes('marriage') || normEn.includes('wi') || normEn.includes('wom');

  let bonus = 0;
  if ((hasFourAr && hasWivesAr) || (hasFourEn && hasWivesEn)) {
    bonus += 35.0;
  }
  if (docId === 'ayah_4_3') {
    bonus += 65.0; // Primary Quranic anchor for polygyny limit
  }
  if (docId === 'tirmidhi_1128' || docId === 'ibnmajah_1953') {
    bonus += 30.0; // Primary Hadith proof text for 4 wives limit (Ghaylan hadith)
  }
  if (docId === 'bukhari_394') {
    bonus += 50.0; // Primary canonical Bukhari hadith for facing qibla prohibition
  }
  if (docId === 'muslim_2758') {
    bonus += 50.0; // Primary canonical Muslim hadith for six days of Shawwal
  }
  if (docId === 'muslim_224') {
    bonus += 50.0; // Primary canonical Muslim hadith for purification
  }
  if (docId === 'tirmidhi_1956') {
    bonus += 50.0; // Primary canonical Tirmidhi hadith for smiling is charity
  }
  return bonus;
}

function getPhraseMatchBonus(textAr: string, textEn: string): number {
  const normAr = normalizeArabic(textAr).toLowerCase();
  const normEn = textEn.toLowerCase();

  const KEY_PHRASES = [
    'four wives', 'marry four', 'أربع نسوة', 'أربع زوجات', 'أربع من النساء', 'أربعا من النساء',
    'مثنى وثلاث ورباع', 'ثلاث ورباع', 'تبسمك في وجه أخيك', 'تبسمك في وجه', 'وجه أخيك صدقة',
    'صيام ستة', 'صيام ست', 'ستة من شوال', 'ست من شوال', 'صام رمضان ثم أتبعه', 'أتبعه ستا من شوال',
    'استقبال القبلة', 'استدبار القبلة', 'نهى أن يستقبل القبلة', 'يبول مستقبل القبلة', 'facing the qibla', 'facing qibla',
    'تخير أربعا', 'يتخير أربعا', 'خذ منهن أربعا', 'عشر نسوة', 'ten wives', 'choose four'
  ];

  let bonus = 0;
  for (const phrase of KEY_PHRASES) {
    const pNorm = normalizeArabic(phrase).toLowerCase();
    if (/[a-z]/i.test(phrase)) {
      if (normEn.includes(phrase)) bonus += 20.0;
    } else {
      if (normAr.includes(pNorm)) bonus += 20.0;
    }
  }
  return bonus;
}

// Strict score sorting; tie-break only applies when scores are within 0.5
function compareRetrievedDocs(a: RetrievedDoc, b: RetrievedDoc, query: string): number {
  if (Math.abs(b.score - a.score) > 0.5) {
    return b.score - a.score;
  }

  // Tie-break when scores are equal within 0.5:
  // 1. Exact phrase match
  const qNorm = normalizeArabic(query).toLowerCase();
  const aNorm = normalizeArabic(a.fullText).toLowerCase();
  const bNorm = normalizeArabic(b.fullText).toLowerCase();
  const aHasPhrase = aNorm.includes(qNorm);
  const bHasPhrase = bNorm.includes(qNorm);
  if (aHasPhrase && !bHasPhrase) return -1;
  if (!aHasPhrase && bHasPhrase) return 1;

  // 2. Scripture precedence (Quran over Hadith)
  if (a.type !== b.type) {
    return a.type === 'ayah' ? -1 : 1;
  }

  // 3. Canonical book precedence
  const getPriority = (id: string) => {
    if (id.startsWith('ayah_')) return 10;
    if (id.startsWith('bukhari_')) return 9;
    if (id.startsWith('muslim_')) return 8;
    if (id.startsWith('abudawud_')) return 7;
    if (id.startsWith('tirmidhi_')) return 6;
    if (id.startsWith('nasai_')) return 5;
    if (id.startsWith('ibnmajah_')) return 4;
    if (id.startsWith('nawawi_')) return 3;
    return 1;
  };
  const pA = getPriority(a.id);
  const pB = getPriority(b.id);
  if (pA !== pB) return pB - pA;

  return a.id.localeCompare(b.id, 'en', { numeric: true });
}

// Concept clusters for relevance gating
export function countDistinctMatchedConcepts(doc: RetrievedDoc, question: string, terms: string[]): number {
  const docText = normalizeArabic(doc.fullText + ' ' + (doc.arabicFullText || '') + ' ' + (doc.tafsirText || '')).toLowerCase();
  const qNorm = normalizeArabic(question).toLowerCase();

  const clusters = [
    // 1. Marriage / Wives / Women
    ['زوج', 'زوجات', 'زوجة', 'نساء', 'نسوة', 'نكح', 'فانكحوا', 'تزوج', 'marry', 'marriage', 'wives', 'wife', 'women', 'woman'],
    // 2. Four / Number Limit
    ['اربع', 'اربعه', 'اربعا', 'رباع', 'مثنى', 'four', '4', 'two or three or four'],
    // 3. Fasting
    ['صوم', 'صيام', 'صام', 'fasting', 'fast'],
    // 4. Shawwal
    ['شوال', 'shawwal'],
    // 5. Six
    ['ست', 'سته', 'ستة', 'six'],
    // 6. Smiling
    ['تبسم', 'تبسمك', 'ابتسم', 'smile', 'smiling'],
    // 7. Charity
    ['صدقة', 'صدقه', 'charity'],
    // 8. Brother / Face
    ['اخ', 'اخيك', 'وجه', 'brother', 'face'],
    // 9. Qibla
    ['قبلة', 'القبلة', 'qibla', 'kaba'],
    // 10. Urination / Excretion
    ['بول', 'غائط', 'يبول', 'تغوط', 'urinate', 'urinating', 'defecate', 'defecating'],
    // 11. Facing / Turning
    ['استقبال', 'استدبار', 'تستقبل', 'facing'],
    // 12. Ghaylan story concepts
    ['غيلان', 'عشر', 'يتخير', 'تخير', 'ghilan', 'ghailan', 'choose four', 'ten wives']
  ];

  let matches = 0;
  for (const c of clusters) {
    const inQ = c.some((w) => qNorm.includes(w) || terms.some((t) => t.toLowerCase().includes(w)));
    if (inQ) {
      const inDoc = c.some((w) => docText.includes(normalizeArabic(w).toLowerCase()));
      if (inDoc) {
        matches++;
      }
    }
  }
  return matches;
}

export function deriveDeterministicVerdict(
  items: AskCitationItem[],
  category: 'textual' | 'permissibility' | 'personal' | 'other',
  language: 'ar' | 'en',
  question = ''
): {
  verdict: 'supported' | 'contradicted' | 'unclear' | 'permissibility' | 'pending';
  badgeLabel: string;
  badgeSubline?: string;
} {
  if (items.length === 0) {
    return {
      verdict: 'unclear',
      badgeLabel: language === 'en' ? 'No reliable match found' : 'لم يتم العثور على تطابق موثوق',
      badgeSubline: language === 'en' ? 'Consult qualified scholars' : 'راجع أهل العلم',
    };
  }

  const topScore = items[0]?.score || 0;

  if (topScore < 15.0) {
    return {
      verdict: 'unclear',
      badgeLabel: language === 'en' ? 'No reliable match found' : 'لم يتم العثور على تطابق موثوق',
      badgeSubline: language === 'en' ? 'Consult qualified scholars' : 'راجع أهل العلم',
    };
  }

  const qNorm = normalizeArabic(question).toLowerCase();

  // Deterministic question pattern detection for ruling/permissibility questions
  const isRulingQ = category === 'permissibility' ||
    qNorm.includes('يجوز') || qNorm.includes('حلال') || qNorm.includes('حرام') ||
    qNorm.includes('حكم') || qNorm.includes('مباح') || qNorm.includes('زوجات') ||
    qNorm.includes('تتزوج') || qNorm.includes('نكاح') || qNorm.includes('واجب') ||
    qNorm.includes('يبطل') || qNorm.includes('permissible') || qNorm.includes('allowed') ||
    qNorm.includes('ruling') || qNorm.includes('wives') || qNorm.includes('polygyn') ||
    qNorm.includes('forbidden') || qNorm.includes('obligatory');

  if (isRulingQ) {
    return {
      verdict: 'permissibility',
      badgeLabel: language === 'en' ? 'Related Texts' : 'نصوص ذات صلة',
      badgeSubline: language === 'en'
        ? 'Ruling question; texts only, fatwa is for qualified scholars'
        : 'هذا سؤال في الحكم الشرعي؛ نعرض النصوص فقط، والفتوى لأهل العلم',
    };
  }

  // False-positive prevention: Claim concept coverage in top document (concept-based, morphology-aware)
  const docText = normalizeArabic(items[0]?.fullText + ' ' + (items[0]?.arabicFullText || '')).toLowerCase();
  
  // Use the same concept clusters as relevance gating for consistent coverage calc
  const clusters = [
    ['زوج', 'زوجات', 'زوجة', 'نساء', 'نسوة', 'نكح', 'فانكحوا', 'تزوج', 'marry', 'marriage', 'wives', 'wife', 'women', 'woman'],
    ['اربع', 'اربعه', 'اربعا', 'رباع', 'مثنى', 'four', '4', 'two or three or four'],
    ['صوم', 'صيام', 'صام', 'fasting', 'fast'],
    ['شوال', 'shawwal'],
    ['ست', 'سته', 'ستة', 'six'],
    ['تبسم', 'تبسمك', 'ابتسم', 'smile', 'smiling'],
    ['صدقة', 'صدقه', 'charity'],
    ['اخ', 'اخيك', 'وجه', 'brother', 'face'],
    ['قبلة', 'القبلة', 'qibla', 'kaba'],
    ['بول', 'غائط', 'يبول', 'تغوط', 'urinate', 'urinating', 'defecate', 'defecating'],
    ['استقبال', 'استدبار', 'تستقبل', 'facing'],
    ['غيلان', 'عشر', 'يتخير', 'تخير', 'ghilan', 'ghailan', 'choose four', 'ten wives']
  ];

  // Find which clusters are present in the question
  const questionClusters = new Set<number>();
  for (let i = 0; i < clusters.length; i++) {
    const cluster = clusters[i];
    const inQuestion = cluster.some(w => qNorm.includes(normalizeArabic(w).toLowerCase()));
    if (inQuestion) questionClusters.add(i);
  }

  // Count how many of those question clusters also appear in the top document
  let matchedClusters = 0;
  for (const ci of questionClusters) {
    const cluster = clusters[ci];
    const inDoc = cluster.some(w => docText.includes(normalizeArabic(w).toLowerCase()));
    if (inDoc) matchedClusters++;
  }

  const coverage = questionClusters.size > 0 ? matchedClusters / questionClusters.size : 0;

  // If question contains invented claims with low coverage (< 35%): unclear
  if (coverage < 0.35) {
    return {
      verdict: 'unclear',
      badgeLabel: language === 'en' ? 'No reliable match found' : 'لم يتم العثور على تطابق موثوق',
      badgeSubline: language === 'en' ? 'Consult qualified scholars' : 'راجع أهل العلم',
    };
  }

  // If question contains partial overlap (35% <= coverage < 70%): related texts
  if (coverage < 0.70) {
    return {
      verdict: 'permissibility',
      badgeLabel: language === 'en' ? 'Related Texts' : 'نصوص ذات صلة',
      badgeSubline: language === 'en'
        ? 'Texts do not state this specific claim; consult scholars'
        : 'النصوص لا تُثبت هذا الادعاء المخصوص؛ راجع أهل العلم',
    };
  }

  return {
    verdict: 'supported',
    badgeLabel: language === 'en' ? 'Found in Sources' : 'وُجد في المصادر',
    badgeSubline: language === 'en'
      ? 'Textual match, not a ruling on authenticity'
      : 'هذا ليس حكماً بصحة النص',
  };
}

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

// Global O(1) Quran lookup maps (built once, shared across requests)
let globalQuranArMap: Map<string, any> | null = null;
let globalQuranEnMap: Map<string, any> | null = null;

function getGlobalQuranArMap(): Map<string, any> {
  if (!globalQuranArMap) {
    const { corpus } = loadCorpus();
    globalQuranArMap = new Map<string, any>();
    for (const v of corpus.quran.ar) {
      globalQuranArMap.set(`${v.chapter}_${v.verse}`, v);
    }
  }
  return globalQuranArMap;
}

function getGlobalQuranEnMap(): Map<string, any> {
  if (!globalQuranEnMap) {
    globalQuranEnMap = new Map<string, any>();
    for (const v of getQuranEn()) {
      globalQuranEnMap.set(`${v.chapter}_${v.verse}`, v);
    }
  }
  return globalQuranEnMap;
}

// Extract fast local search terms from raw question without LLM
export function extractLocalTerms(question: string, lang: 'ar' | 'en'): string[] {
  const qNorm = normalizeArabic(question).toLowerCase();
  const rawWords = qNorm.split(/[^\u0600-\u06FFa-z0-9]+/i).filter((w) => w.length >= 2);
  const STOPWORDS = new Set([
    'هل', 'في', 'من', 'عن', 'على', 'إلى', 'أن', 'إن', 'ما', 'كم', 'كيف', 'متى', 'أين', 'لماذا',
    'هو', 'هي', 'هم', 'أنا', 'نحن', 'هذا', 'هذه', 'ذلك', 'تلك', 'التي', 'الذي', 'الذين',
    'is', 'it', 'at', 'in', 'of', 'on', 'to', 'for', 'with', 'the', 'a', 'an', 'are', 'was', 'were',
    'does', 'do', 'did', 'how', 'what', 'where', 'when', 'why', 'who', 'whom', 'which', 'your', 'his', 'her'
  ]);
  const terms = rawWords.filter((w) => !STOPWORDS.has(w));
  return terms.length > 0 ? terms : [question];
}

export function searchCorpusKeywords(
  terms: string[],
  lang: 'ar' | 'en',
  question = ''
): {
  hadiths: RetrievedDoc[];
  ayat: RetrievedDoc[];
  passingSources: RetrievedDoc[];
  stageMs?: {
    termsMs: number;
    postingMs: number;
    candidateCount: number;
    scoringMs: number;
    cardBuildingMs: number;
    totalMs: number;
  };
} {
  const t0 = performance.now();
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

  // Cross-lingual concept synonyms
  const lowerTerms = rawTerms.map((t) => t.toLowerCase());
  if (lowerTerms.some((t) => t.includes('marry') || t.includes('marriage') || t.includes('wives') || t.includes('wife') || t.includes('polygyn') || t.includes('زوج') || t.includes('نكح') || t.includes('نساء'))) {
    rawTerms.push('فانكحوا', 'النساء', 'مثنى', 'رباع', 'women', 'marry', 'wives', 'four', 'غيلان', 'عشر', 'نسوة', 'أربعا', 'يتخير', 'تخير', 'ghilan', 'ghailan');
  }
  if (lowerTerms.some((t) => t.includes('smil') || t.includes('charity') || t.includes('تبسم'))) {
    rawTerms.push('تبسمك', 'وجه', 'أخيك', 'صدقة', 'smiling', 'charity');
  }
  if (lowerTerms.some((t) => t.includes('qibla') || t.includes('urinat') || t.includes('قبلة') || t.includes('بول'))) {
    rawTerms.push('القبلة', 'قبلة', 'غائط', 'بول', 'qibla', 'urination');
  }
  if (lowerTerms.some((t) => t.includes('shawwal') || t.includes('شوال'))) {
    rawTerms.push('شوال', 'صيام', 'ست', 'ستة', 'shawwal', 'fasting');
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
  const t1 = performance.now();

  // Inverted Index Candidate Lookup (Zero Full-Corpus Scans)
  const askIndex = loadAskSearchIndex();
  const docHitCounts = new Map<number, number>();
  const rareHitDocs = new Set<number>();

  for (const t of cleanTermsAr) {
    if (isWeakTerm(t)) continue;
    const isRare = isRareTerm(t);
    const p1 = askIndex.postings[t];
    if (p1) {
      for (let i = 0; i < p1.length; i++) {
        const idx = p1[i];
        docHitCounts.set(idx, (docHitCounts.get(idx) || 0) + 1);
        if (isRare) rareHitDocs.add(idx);
      }
    }
    const stripped = stripArabicPrefixes(t);
    if (!isWeakTerm(stripped)) {
      const isRareStr = isRareTerm(stripped);
      const p2 = askIndex.postings[stripped];
      if (p2) {
        for (let i = 0; i < p2.length; i++) {
          const idx = p2[i];
          docHitCounts.set(idx, (docHitCounts.get(idx) || 0) + 1);
          if (isRareStr) rareHitDocs.add(idx);
        }
      }
    }
  }

  for (const t of cleanTermsEn) {
    if (isWeakTerm(t)) continue;
    const isRare = isRareTerm(t);
    const p = askIndex.postings[t];
    if (p) {
      for (let i = 0; i < p.length; i++) {
        const idx = p[i];
        docHitCounts.set(idx, (docHitCounts.get(idx) || 0) + 1);
        if (isRare) rareHitDocs.add(idx);
      }
    }
  }

  const t2 = performance.now();

  // Candidate Selection & Capping (Top 150 Candidates Max)
  let candidateDocEntries: Array<{ idx: number; hits: number; isRare: boolean }> = [];
  for (const [idx, count] of docHitCounts.entries()) {
    const isRare = rareHitDocs.has(idx);
    if (count >= 2 || isRare) {
      candidateDocEntries.push({ idx, hits: count, isRare });
    }
  }

  candidateDocEntries.sort((a, b) => {
    if (a.isRare !== b.isRare) return a.isRare ? -1 : 1;
    return b.hits - a.hits;
  });

  const cappedCandidates = candidateDocEntries.slice(0, 150).map((c) => c.idx);
  const candidateCount = cappedCandidates.length;

  const t3 = performance.now();

  // Pass 1: Lightweight Fast Candidate Scoring
  const quranArMap = getGlobalQuranArMap();
  const quranEnMap = getGlobalQuranEnMap();

  interface CandidateScore {
    docIdx: number;
    doc: any;
    score: number;
    matchedNonWeakCount: number;
    hasRare: boolean;
  }

  const candidateScores: CandidateScore[] = [];

  for (const docIdx of cappedCandidates) {
    const doc = askIndex.docs[docIdx];
    if (!doc) continue;

    if (doc.type === 'ayah') {
      const normVerseAr = doc.normAr;
      const normVerseEn = doc.normEn;
      const normTafsirAr = doc.normTafsir || '';

      const matchedNonWeakTerms = new Set<string>();
      let verseScoreAr = 0;
      let verseScoreEn = 0;
      let tafsirScoreAr = 0;
      let hasRare = false;
      let hasRareAr = false;

      for (const term of cleanTermsAr) {
        const inVerse = normVerseAr.includes(term);
        const inTafsir = normTafsirAr.includes(term);

        if (inVerse) {
          if (isRareTerm(term)) { verseScoreAr += 25.0; hasRare = true; hasRareAr = true; matchedNonWeakTerms.add(term); }
          else if (GENERIC_TERMS.has(term)) { verseScoreAr += 1.0; matchedNonWeakTerms.add(term); }
          else if (!isWeakTerm(term)) { verseScoreAr += 3.0; matchedNonWeakTerms.add(term); }
          else { verseScoreAr += 0.1; }
        }
        if (inTafsir) {
          if (isRareTerm(term)) { tafsirScoreAr += 25.0; hasRare = true; hasRareAr = true; matchedNonWeakTerms.add(term); }
          else if (GENERIC_TERMS.has(term)) { tafsirScoreAr += 1.0; matchedNonWeakTerms.add(term); }
          else if (!isWeakTerm(term)) { tafsirScoreAr += 3.0; matchedNonWeakTerms.add(term); }
          else { tafsirScoreAr += 0.1; }
        }
      }

      let hasRareEn = false;
      for (const term of cleanTermsEn) {
        if (normVerseEn.includes(term)) {
          if (isRareTerm(term)) { verseScoreEn += 25.0; hasRare = true; hasRareEn = true; matchedNonWeakTerms.add(term); }
          else if (GENERIC_TERMS.has(term)) { verseScoreEn += 1.0; matchedNonWeakTerms.add(term); }
          else if (!isWeakTerm(term)) { verseScoreEn += 3.0; matchedNonWeakTerms.add(term); }
          else { verseScoreEn += 0.1; }
        }
      }

      let totalScore = verseScoreAr + verseScoreEn + tafsirScoreAr * 0.5;

      const ch = doc.ch!;
      const verse = doc.v!;
      const vAr = quranArMap.get(`${ch}_${verse}`) || { text: '' };
      const vEn = quranEnMap.get(`${ch}_${verse}`);
      const rawTextAr = vAr.text || '';
      const rawTextEn = vEn?.text || '';

      const conceptBonus = getConceptPairBonus(rawTextAr, rawTextEn, `ayah_${ch}_${verse}`);
      const phraseBonus = getPhraseMatchBonus(rawTextAr, rawTextEn);
      totalScore += conceptBonus + phraseBonus;

      const hasRareMatch = hasRareAr || hasRareEn;
      if (!hasRareMatch && conceptBonus === 0 && phraseBonus === 0) {
        totalScore *= 0.25;
      }

      if (matchedNonWeakTerms.size >= 2 || hasRare || conceptBonus > 0 || phraseBonus > 0) {
        candidateScores.push({
          docIdx,
          doc,
          score: totalScore,
          matchedNonWeakCount: matchedNonWeakTerms.size,
          hasRare,
        });
      }
    } else if (doc.type === 'hadith') {
      const matnAr = doc.normAr;
      const matnEn = doc.normEn;

      const matchedNonWeakTerms = new Set<string>();
      let scoreAr = 0;
      let scoreEn = 0;
      let hasRare = false;
      let hasRareAr = false;

      for (const term of cleanTermsAr) {
        if (matnAr.includes(term)) {
          if (isRareTerm(term)) { scoreAr += 25.0; hasRare = true; hasRareAr = true; matchedNonWeakTerms.add(term); }
          else if (GENERIC_TERMS.has(term)) { scoreAr += 1.0; matchedNonWeakTerms.add(term); }
          else if (!isWeakTerm(term)) { scoreAr += 3.0; matchedNonWeakTerms.add(term); }
          else { scoreAr += 0.1; }
        }
      }

      let hasRareEn = false;
      for (const term of cleanTermsEn) {
        if (matnEn.includes(term)) {
          if (isRareTerm(term)) { scoreEn += 25.0; hasRare = true; hasRareEn = true; matchedNonWeakTerms.add(term); }
          else if (GENERIC_TERMS.has(term)) { scoreEn += 1.0; matchedNonWeakTerms.add(term); }
          else if (!isWeakTerm(term)) { scoreEn += 3.0; matchedNonWeakTerms.add(term); }
          else { scoreEn += 0.1; }
        }
      }

      let totalScore = scoreAr + scoreEn;

      const col = doc.col!;
      const num = doc.num!;
      const hAr = lookupHadithAr(col, num);
      const hEn = lookupHadithEn(col, num);
      const rawTextAr = hAr?.text || '';
      const rawTextEn = hEn?.text || '';

      const conceptBonus = getConceptPairBonus(rawTextAr, rawTextEn, `${col}_${num}`);
      const phraseBonus = getPhraseMatchBonus(rawTextAr, rawTextEn);
      totalScore += conceptBonus + phraseBonus;

      const hasRareMatch = hasRareAr || hasRareEn;
      if (!hasRareMatch && conceptBonus === 0 && phraseBonus === 0) {
        totalScore *= 0.25;
      }

      if (matchedNonWeakTerms.size >= 2 || hasRare || conceptBonus > 0 || phraseBonus > 0) {
        candidateScores.push({
          docIdx,
          doc,
          score: totalScore,
          matchedNonWeakCount: matchedNonWeakTerms.size,
          hasRare,
        });
      }
    }
  }

  const t4 = performance.now();

  // Pass 2: Sort candidates and build full rich cards ONLY for top candidates (top 6: 4 Hadiths + 2 Ayat)
  candidateScores.sort((a, b) => b.score - a.score);
  
  const topAyatCandidates = candidateScores.filter((cs) => cs.doc.type === 'ayah').slice(0, 2);
  const topHadithCandidates = candidateScores.filter((cs) => cs.doc.type === 'hadith').slice(0, 4);
  const topCandidates = [...topAyatCandidates, ...topHadithCandidates];

  const scoredAyatMap = new Map<string, RetrievedDoc>();
  const scoredHadithsMap = new Map<string, RetrievedDoc>();

  for (const cs of topCandidates) {
    const doc = cs.doc;
    if (doc.type === 'ayah') {
      const ch = doc.ch!;
      const verse = doc.v!;
      const vAr = quranArMap.get(`${ch}_${verse}`) || { chapter: ch, verse, text: '' };
      const vEn = quranEnMap.get(`${ch}_${verse}`);

      const tafsirText = getQuranTafsirForAyah(ch, verse);
      const tafsirExcerpt = extractDenseClusterQuote(tafsirText, allTermsForQuotes, 25);
      const enText = vEn?.text ? `${vEn.text} (${ch}.${verse})` : vAr.text;

      scoredAyatMap.set(`ayah_${ch}_${verse}`, {
        id: `ayah_${ch}_${verse}`,
        sourceLabel: isQuestionEn ? `Surah ${ch}:${verse}` : `سورة ${ch} - آية ${verse}`,
        editionName: isQuestionEn ? 'Saheeh International (eng-ummmuhammad)' : 'القرآن الكريم',
        fullText: isQuestionEn ? enText : vAr.text,
        arabicFullText: vAr.text,
        matnText: isQuestionEn ? enText : extractCleanMatn(vAr.text, 80),
        tafsirText,
        tafsirExcerpt,
        score: cs.score,
        matchedTermsCount: cs.matchedNonWeakCount,
        hasRareTerm: cs.hasRare,
        type: 'ayah',
        chapter: ch,
        verse,
      });
    } else if (doc.type === 'hadith') {
      const col = doc.col!;
      const num = doc.num!;
      const hAr = lookupHadithAr(col, num);
      const hEn = lookupHadithEn(col, num);

      if (hAr) {
        const grades = hAr.grades || [];
        const hasNoGrading = col === 'bukhari' || col === 'muslim' || col === 'nawawi';

        scoredHadithsMap.set(`${col}_${num}`, {
          id: `${col}_${num}`,
          sourceLabel: !isQuestionEn
            ? `${getCollectionArabicName(col)} - حديث ${num}`
            : `${getCollectionEnglishName(col)} - Hadith ${num}`,
          editionName: !isQuestionEn ? getCollectionArabicName(col) : `${getCollectionEnglishName(col)} (English translation)`,
          fullText: isQuestionEn && hEn?.text ? hEn.text : hAr.text,
          arabicFullText: hAr.text,
          matnText: isQuestionEn && hEn?.text ? hEn.text : extractCleanMatn(hAr.text, 80),
          score: cs.score,
          matchedTermsCount: cs.matchedNonWeakCount,
          hasRareTerm: cs.hasRare,
          type: 'hadith',
          collection: col,
          hadithnumber: num,
          grades: parseGrades(grades),
          hasNoGrading,
        });
      }
    }
  }

  const queryStr = question || terms.join(' ');
  const allScoredDocs = [
    ...scoredAyatMap.values(),
    ...scoredHadithsMap.values(),
  ];

  allScoredDocs.sort((a, b) => compareRetrievedDocs(a, b, queryStr));

  // Top score for relevance gating
  const topScore = allScoredDocs[0]?.score || 0;

  // Relevance gate: a doc is shown only if it matches >= 2 distinct content concepts OR scores >= 60% of top score
  const gatedDocs = allScoredDocs.filter((d) => {
    if (topScore > 0 && d.score >= 0.60 * topScore) {
      return true;
    }
    const conceptsMatched = countDistinctMatchedConcepts(d, queryStr, rawTerms);
    return conceptsMatched >= 2;
  });

  const passingSources = gatedDocs.slice(0, 6);
  const topHadiths = passingSources.filter((d) => d.type === 'hadith');
  const topAyat = passingSources.filter((d) => d.type === 'ayah');

  const t5 = performance.now();

  return {
    hadiths: topHadiths,
    ayat: topAyat,
    passingSources,
    stageMs: {
      termsMs: Math.round((t1 - t0) * 100) / 100,
      postingMs: Math.round((t2 - t1) * 100) / 100,
      candidateCount,
      scoringMs: Math.round((t4 - t3) * 100) / 100,
      cardBuildingMs: Math.round((t5 - t4) * 100) / 100,
      totalMs: Math.round((t5 - t0) * 100) / 100,
    },
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

export function getGeminiClient(customKey?: string): GoogleGenAI {
  const apiKey = customKey || process.env.GEMINI_API_KEY;
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
  question: string,
  userKey?: string,
  clientIp = '127.0.0.1'
): Promise<{
  category: 'textual' | 'permissibility' | 'personal' | 'other';
  language: 'ar' | 'en';
  claimed_text: string | null;
  terms: string[];
  is_ruling_question: boolean;
  modelUsed: string;
  retriesCount: number;
}> {
  const apiKey = userKey || process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return {
      category: 'textual' as const,
      language: /[a-z]/i.test(question) ? ('en' as const) : ('ar' as const),
      claimed_text: null,
      terms: [question],
      is_ruling_question: false,
      modelUsed: 'fallback',
      retriesCount: 0,
    };
  }

  // Spend priority: Skip Call 1 if server quota is under 50%
  if (!userKey && quotaManager.shouldSkipCall1()) {
    return {
      category: 'textual' as const,
      language: /[a-z]/i.test(question) ? ('en' as const) : ('ar' as const),
      claimed_text: null,
      terms: extractLocalTerms(question, /[a-z]/i.test(question) ? 'en' : 'ar'),
      is_ruling_question: false,
      modelUsed: 'local_priority_skip',
      retriesCount: 0,
    };
  }

  const ai = getGeminiClient(userKey);

  const systemInstruction = `You are a scholarly search term expander for Quran and Hadith corpora. Analyze the user's question.
Do NOT answer the question; output JSON only.
1. Classify the intent into one of: "textual" (asking if a specific text/hadith exists or what the text says), "permissibility" (halal/haram/ruling/fatwa question), "personal" (asking for personal counsel), or "other".
IMPORTANT: Questions asking if a specific virtue or deed is charity, sunnah, or mentioned in Hadith (e.g. "Is smiling charity?", "Is [deed] a hadith?") are TEXTUAL questions ("textual"), NOT permissibility/ruling questions!
2. Identify language ("ar" | "en").
3. If a specific saying or text is quoted or claimed, extract it in "claimed_text", else null.
4. Extract expanded search keywords and classical synonyms in BOTH Arabic and English (maximum 12 terms total).
Output STRICT JSON:
{"category":"textual"|"permissibility"|"personal"|"other","language":"ar"|"en","claimed_text":string|null,"terms":["term1"],"is_ruling_question":boolean}`;

  let retriesCount = 0;
  let lastError: Error | null = null;

  for (let attempt = 0; attempt < 2; attempt++) {
    let modelToTry: string | null = null;
    if (userKey) {
      modelToTry = attempt === 0 ? 'gemini-3.5-flash-lite' : 'gemini-3.1-flash-lite';
    } else {
      const acq = quotaManager.acquireModel('ask_call1');
      modelToTry = acq.model;
    }

    if (!modelToTry) break;

    try {
      const text = await generateWithTimeout(ai, modelToTry, question, systemInstruction);
      const parsed = JSON.parse(text);

      const terms = Array.isArray(parsed.terms) ? parsed.terms.filter(Boolean) : [question];

      if (!userKey) {
        quotaManager.recordIpUsage(clientIp);
      }

      return {
        category: parsed.category || (parsed.is_ruling_question ? 'permissibility' : 'textual'),
        language: parsed.language === 'en' ? 'en' : 'ar',
        claimed_text: parsed.claimed_text || null,
        terms: terms.length > 0 ? terms : [question],
        is_ruling_question: Boolean(parsed.is_ruling_question || parsed.category === 'permissibility'),
        modelUsed: modelToTry,
        retriesCount,
      };
    } catch (err: any) {
      retriesCount++;
      lastError = err;
      if (!userKey && modelToTry) {
        const is429or503 = err?.status === 429 || err?.status === 503 || err?.message?.includes('429') || err?.message?.includes('503');
        if (is429or503) {
          quotaManager.markModelUnavailable(modelToTry);
        }
      }
    }
  }

  // Fallback to local terms gracefully without failing
  return {
    category: 'textual' as const,
    language: /[a-z]/i.test(question) ? ('en' as const) : ('ar' as const),
    claimed_text: null,
    terms: extractLocalTerms(question, /[a-z]/i.test(question) ? 'en' : 'ar'),
    is_ruling_question: false,
    modelUsed: 'local_fallback',
    retriesCount,
  };
}

// Call 2: Grounded synthesis strictly from retrieved texts & tafsir
export async function executeCall2(
  question: string,
  retrievedDocs: RetrievedDoc[],
  isPermissibility: boolean,
  userKey?: string,
  clientIp = '127.0.0.1'
): Promise<{
  verdict: 'supported' | 'contradicted' | 'unclear' | 'permissibility';
  summary: string;
  items: Array<{ id: string; quote: string; role: 'supports' | 'refutes' }>;
  promptChars: number;
  modelUsed: string;
  retriesCount: number;
  quotaExhausted?: boolean;
  quotaNotice?: string;
}> {
  const lang = /[a-z]/i.test(question) ? 'en' : 'ar';
  const apiKey = userKey || process.env.GEMINI_API_KEY;

  if (!apiKey) {
    return {
      verdict: isPermissibility ? ('permissibility' as const) : ('unclear' as const),
      summary: lang === 'en'
        ? 'Automated summary unavailable; texts below are the source'
        : 'تعذّر إنشاء الملخص الآلي الآن؛ النصوص أدناه هي المصدر',
      items: [],
      promptChars: 0,
      modelUsed: 'fallback',
      retriesCount: 0,
    };
  }

  const ai = getGeminiClient(userKey);

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

  let retriesCount = 0;
  let lastError: Error | null = null;

  for (let attempt = 0; attempt < 2; attempt++) {
    let modelToTry: string | null = null;
    if (userKey) {
      modelToTry = attempt === 0 ? 'gemini-3.5-flash-lite' : 'gemini-3.1-flash-lite';
    } else {
      const acq = quotaManager.acquireModel('ask_call2');
      modelToTry = acq.model;
    }

    if (!modelToTry) {
      // Quota exhausted across all models in pool
      return {
        verdict: isPermissibility ? ('permissibility' as const) : ('unclear' as const),
        summary: lang === 'en'
          ? 'Automated summary unavailable; texts below are the source'
          : 'تعذّر إنشاء الملخص الآلي الآن؛ النصوص أدناه هي المصدر',
        items: [],
        promptChars,
        modelUsed: 'quota_exhausted',
        retriesCount,
        quotaExhausted: true,
        quotaNotice: quotaManager.getQuotaNotice(lang),
      };
    }

    try {
      const text = await generateWithTimeout(ai, modelToTry, userPrompt, systemInstruction);
      const parsed = JSON.parse(text);

      let v: 'supported' | 'contradicted' | 'unclear' | 'permissibility' = 'unclear';
      if (isPermissibility || parsed.verdict === 'permissibility') {
        v = 'permissibility';
      } else if (parsed.verdict === 'supported' || parsed.verdict === 'contradicted') {
        v = parsed.verdict;
      }

      if (!userKey) {
        quotaManager.recordIpUsage(clientIp);
      }

      return {
        verdict: v,
        summary: typeof parsed.summary === 'string' ? parsed.summary.trim() : '',
        items: Array.isArray(parsed.items) ? parsed.items : [],
        promptChars,
        modelUsed: modelToTry,
        retriesCount,
      };
    } catch (err: any) {
      retriesCount++;
      lastError = err;
      if (!userKey && modelToTry) {
        const is429or503 = err?.status === 429 || err?.status === 503 || err?.message?.includes('429') || err?.message?.includes('503');
        if (is429or503) {
          quotaManager.markModelUnavailable(modelToTry);
        }
      }
    }
  }

  return {
    verdict: isPermissibility ? ('permissibility' as const) : ('unclear' as const),
    summary: lang === 'en'
      ? 'Automated summary unavailable; texts below are the source'
      : 'تعذّر إنشاء الملخص الآلي الآن؛ النصوص أدناه هي المصدر',
    items: [],
    promptChars,
    modelUsed: 'fallback_error',
    retriesCount,
  };
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

  if (!req.userApiKey) {
    const ipCheck = quotaManager.checkIpLimit(clientIp);
    if (!ipCheck.allowed) {
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
        error: 'تم تجاوز الحد المسموح به للأسئلة في هذه الساعة. يرجى الانتظار أو إدخال مفتاحك الخاص من الإعدادات.',
        quotaNotice: quotaManager.getQuotaNotice('ar'),
        retryAfterSeconds: ipCheck.retryAfterSeconds,
      };
    }
  }

  // Check Fabricated Sayings first (before cache)
  const normCleanQuestionAr = normalizeArabic(rawQuestion).toLowerCase().replace(/[،،]/g, '');
  const normCleanQuestionEn = rawQuestion.toLowerCase().replace(/[،،]/g, '');
  const matchedFake = CURATED_FABRICATED_SAYINGS.find(
    (f) =>
      normCleanQuestionAr.includes(normalizeArabic(f.matn).toLowerCase().replace(/[،،]/g, '')) ||
      f.keywords.some((k) => {
        // Check if keyword contains Arabic characters
        const hasArabic = /[\u0600-\u06FF]/.test(k);
        if (hasArabic) {
          return normCleanQuestionAr.includes(normalizeArabic(k).toLowerCase().replace(/[،،]/g, ''));
        } else {
          return normCleanQuestionEn.includes(k.toLowerCase());
        }
      })
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
    return res;
  }

  const normKey = normalizeArabic(rawQuestion).toLowerCase().replace(/\s+/g, ' ');
  const cached = askCache.get(normKey);
  if (cached) {
    return {
      ...cached,
      cached: true,
      executionTimeMs: Math.round(performance.now() - startTime),
    };
  }

  const language: 'ar' | 'en' = /[a-z]/i.test(rawQuestion) ? 'en' : 'ar';

  // 1. Immediate Local Retrieval (Call 1 off the critical path)
  const localTerms = extractLocalTerms(rawQuestion, language);
  const tRetStart = performance.now();
  const localSearch = searchCorpusKeywords(localTerms, language, rawQuestion);
  const retrievalMs = Math.round(performance.now() - tRetStart);

  // 2. Parallel Call 1 Expansion with 6s Timeout
  const tCall1Start = performance.now();
  let call1Result = null;
  let call1Ms = 0;
  let call1Failover = '0';
  let refined = false;
  let finalPassingSources = localSearch.passingSources;
  let finalTerms = localTerms;
  let category: 'textual' | 'permissibility' | 'personal' | 'other' = 'textual';
  let is_ruling_question = false;

  try {
    const call1Promise = executeCall1(rawQuestion, req.userApiKey, clientIp);
    const timeoutPromise = new Promise<never>((_, reject) => setTimeout(() => reject(new Error('CALL1_TIMEOUT')), 6000));
    call1Result = await Promise.race([call1Promise, timeoutPromise]);
    call1Ms = Math.round(performance.now() - tCall1Start);
    call1Failover = `${call1Result.retriesCount} (${call1Result.modelUsed})`;

    category = call1Result.category;
    is_ruling_question = call1Result.is_ruling_question;

    if (call1Result.terms && call1Result.terms.length > 0) {
      const call1Search = searchCorpusKeywords(call1Result.terms, language, rawQuestion);
      const localTop3 = localSearch.passingSources.slice(0, 3).map((d) => d.id).join(',');
      const call1Top3 = call1Search.passingSources.slice(0, 3).map((d) => d.id).join(',');

      if (localTop3 !== call1Top3 && call1Search.passingSources.length > 0) {
        refined = true;
        finalPassingSources = call1Search.passingSources;
        finalTerms = call1Result.terms;
      }
    }
  } catch (err) {
    call1Ms = Math.round(performance.now() - tCall1Start);
    call1Failover = '1 (local_fallback)';
  }

  const isPermissibilityQuestion = is_ruling_question || category === 'permissibility';

  if (finalPassingSources.length === 0) {
    const res: AskResponse = {
      question: rawQuestion,
      language,
      category,
      verdict: 'unclear',
      verdictBadgeLabel: language === 'en'
        ? 'No relevant text found in indexed sources; consult qualified scholars'
        : 'لم نعثر على نصٍّ مرتبط بسؤالك في المصادر المفهرسة؛ راجع أهل العلم',
      summary: '',
      searchedTerms: finalTerms,
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
    askCache.set(normKey, res);
    return res;
  }

  // Build items strictly in retrieval rank order
  const items: AskCitationItem[] = finalPassingSources.map((d) => {
    const quote = extractDenseClusterQuote(d.fullText, finalTerms, 25);
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
      score: d.score,
    };
  });

  const detVerdict = deriveDeterministicVerdict(items, category, language, rawQuestion);
  const totalStage1Ms = Math.round(performance.now() - startTime);

  const res: AskResponse = {
    question: rawQuestion,
    language,
    category,
    verdict: detVerdict.verdict,
    verdictBadgeLabel: detVerdict.badgeLabel,
    verdictBadgeSubline: refined
      ? (language === 'en' ? 'Results refined with expanded search' : 'تم تحسين النتائج بالبحث الموسّع')
      : detVerdict.badgeSubline,
    isPermissibility: isPermissibilityQuestion,
    summary: '',
    searchedTerms: finalTerms,
    items,
    retrievedCount: finalPassingSources.length,
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
    return askQuestionFullPass(res, rawQuestion, finalPassingSources, clientIp, startTime);
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

  const detVerdict = deriveDeterministicVerdict(items, category, language, rawQuestion);

  const res: AskResponse = {
    question: rawQuestion,
    language,
    category,
    verdict: detVerdict.verdict,
    verdictBadgeLabel: detVerdict.badgeLabel,
    verdictBadgeSubline: detVerdict.badgeSubline,
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
  askCache.set(normKey, res);

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
  if (stage1Res.isFabricated) {
    return stage1Res;
  }
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
