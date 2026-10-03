import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  normalizeArabic,
  toAlefInvariant,
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

export interface HadithRecord {
  id: string; // collection_hadithnumber
  collection: string;
  collectionArabic: string;
  hadithnumber: number;
  arabicnumber: string | number;
  book: number;
  hadithInBook: number;
  sectionName: string;
  rawArabicText: string;
  rawEnglishText?: string;
  normalizedArabicText: string;
  strippedMatn: string;
  matnWordTokens: string[];
  fullWordTokens: string[];
  grades: HadithGradeItem[];
  hasNoGrading: boolean;
  isnadRemovedRatio: number;
  isnadWordOffset: number;
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
  wordMatchStatus: ('exact' | 'approximate' | 'none')[];
  hasApproximateMatch: boolean;
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
  language: 'ar' | 'en';
  state: 'matched' | 'close_match' | 'not_found' | 'too_short';
  topConfidence: number;
  totalMatches: number;
  results: HadithMatchResult[];
  referralRequired: boolean;
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

export function stripHonorificsAndFormulas(text: string): string {
  if (!text) return '';
  let s = text;
  s = s.replace(/صلى الله عليه وسلم/g, ' ');
  s = s.replace(/صلي الله عليه وسلم/g, ' ');
  s = s.replace(/رضي الله عنه[ما]?/g, ' ');
  s = s.replace(/رضي الله عنهم/g, ' ');
  s = s.replace(/رضي الله عنها/g, ' ');
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

/**
 * Isnad stripping on normalized text:
 * Only looks within first 60% of tokens for Prophet or Companion attribution
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

  const maxIdx = Math.floor(words.length * 0.6);

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
let twoGramIndex = new Map<string, number[]>(); // 2gram -> array of corpusIndices
let isInitialized = false;

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
    if (counts[h.collection] !== undefined) {
      counts[h.collection]++;
      counts.totalIndexed++;
    }
  }
  return counts;
}

export function preprocessAllRawHadiths(): { records: HadithRecord[]; emptyCount: number } {
  const collections = ['bukhari', 'muslim', 'abudawud', 'tirmidhi', 'nasai', 'ibnmajah', 'nawawi'];
  const records: HadithRecord[] = [];
  let emptyCount = 0;

  for (const col of collections) {
    const arPath = path.join(DATA_DIR, `hadith_${col}_ar.json`);
    const enPath = path.join(DATA_DIR, `hadith_${col}_en.json`);

    if (!fs.existsSync(arPath)) continue;

    const arData = JSON.parse(fs.readFileSync(arPath, 'utf8'));
    let enMap = new Map<number, string>();
    if (fs.existsSync(enPath)) {
      const enData = JSON.parse(fs.readFileSync(enPath, 'utf8'));
      (enData.hadiths || []).forEach((eh: any) => {
        if (eh.hadithnumber != null && eh.text) {
          enMap.set(eh.hadithnumber, eh.text);
        }
      });
    }

    const sections = arData.metadata?.sections || {};

    const hadithList = arData.hadiths || [];
    for (const h of hadithList) {
      const rawText = (h.text || '').trim();
      if (!rawText) {
        emptyCount++;
        continue;
      }

      const colMeta = COLLECTION_METADATA[col] || { arName: col, enName: col };
      const bookNum = h.reference?.book ?? 0;
      const hadithInBook = h.reference?.hadith ?? 0;
      const sectionName = sections[String(bookNum)] || (bookNum > 0 ? `Book ${bookNum}` : '');

      const norm = normalizeArabic(rawText);
      const cleanNorm = stripHonorificsAndFormulas(norm);
      const { matn, isnadStripped, strippedRatio, isnadWordOffset } = stripIsnadFromNormalized(cleanNorm);

      const grades: HadithGradeItem[] = (h.grades || []).map(parseGrade);
      const hasNoGrading = grades.length === 0;

      records.push({
        id: `${col}_${h.hadithnumber}`,
        collection: col,
        collectionArabic: colMeta.arName,
        hadithnumber: h.hadithnumber,
        arabicnumber: h.arabicnumber ?? h.hadithnumber,
        book: bookNum,
        hadithInBook,
        sectionName,
        rawArabicText: rawText,
        rawEnglishText: enMap.get(h.hadithnumber),
        normalizedArabicText: cleanNorm,
        strippedMatn: matn,
        matnWordTokens: matn.split(/\s+/).filter(Boolean),
        fullWordTokens: cleanNorm.split(/\s+/).filter(Boolean),
        grades,
        hasNoGrading,
        isnadRemovedRatio: strippedRatio,
        isnadWordOffset: isnadWordOffset ?? 0,
      });
    }
  }

  return { records, emptyCount };
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
  const prebuiltPath = path.join(DATA_DIR, 'prebuilt_hadiths.json');

  corpusHadiths = [];
  twoGramIndex.clear();
  let emptyCount = 379;

  if (fs.existsSync(prebuiltPath)) {
    // Fast path: load prebuilt index
    corpusHadiths = JSON.parse(fs.readFileSync(prebuiltPath, 'utf8'));
  } else {
    // Slow path fallback: build dynamically
    const { records, emptyCount: ec } = preprocessAllRawHadiths();
    corpusHadiths = records;
    emptyCount = ec;
  }

  // Populate twoGramIndex of matn
  for (let recordIdx = 0; recordIdx < corpusHadiths.length; recordIdx++) {
    const record = corpusHadiths[recordIdx];
    const tokens = record.matnWordTokens;
    for (let i = 0; i < tokens.length - 1; i++) {
      const bigram = `${tokens[i]} ${tokens[i + 1]}`;
      let list = twoGramIndex.get(bigram);
      if (!list) {
        list = [];
        twoGramIndex.set(bigram, list);
      }
      if (list[list.length - 1] !== recordIdx) {
        list.push(recordIdx);
      }
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
 * For each starting position j in the hadith, we compute the sum of word similarity scores
 * between the query word i and the hadith word (j + i).
 * The containment score is the maximum sum across all starting positions, divided by the number
 * of query words, multiplied by 100.
 */
function scoreContainment(
  queryTokens: string[],
  hadithTokens: string[]
): {
  score: number;
  startWordIndex: number;
  endWordIndex: number;
  hasApproximateMatch: boolean;
  wordStatus: ('exact' | 'approximate' | 'none')[];
} {
  const qLen = queryTokens.length;
  const hLen = hadithTokens.length;

  if (qLen === 0 || hLen === 0) {
    return {
      score: 0,
      startWordIndex: 0,
      endWordIndex: 0,
      hasApproximateMatch: false,
      wordStatus: [],
    };
  }

  let bestScore = 0;
  let bestStart = 0;
  let bestEnd = 0;
  let bestApprox = false;
  let bestStatus: ('exact' | 'approximate' | 'none')[] = [];

  const maxStart = Math.max(0, hLen - qLen);

  for (let j = 0; j <= maxStart; j++) {
    let sum = 0;
    let anyApprox = false;
    let hasNone = false;
    const currentStatus: ('exact' | 'approximate' | 'none')[] = [];

    for (let i = 0; i < qLen; i++) {
      const qw = queryTokens[i];
      const hw = hadithTokens[j + i];
      const sim = wordSimilarityCorpusDerived(qw, hw);

      if (!sim.isExact && sim.score >= 0.70) {
        anyApprox = true;
        sum += sim.score;
        currentStatus.push('approximate');
      } else if (sim.score >= 0.90) {
        sum += sim.score;
        currentStatus.push('exact');
      } else {
        hasNone = true;
        currentStatus.push('none');
      }
    }

    let avg = Math.round((sum / qLen) * 100);
    if (qLen <= 3 && hasNone) {
      avg = 0;
    }

    if (avg > bestScore) {
      bestScore = avg;
      bestStart = j;
      bestEnd = j + qLen - 1;
      bestApprox = anyApprox;
      bestStatus = currentStatus;
    }
  }

  return {
    score: bestScore,
    startWordIndex: bestStart,
    endWordIndex: bestEnd,
    hasApproximateMatch: bestApprox,
    wordStatus: bestStatus,
  };
}

/**
 * Attestation clustering:
 * Use containment of shorter matn in longer (>= 0.80), not symmetric similarity.
 */
function findAttestationCluster(targetRecord: HadithRecord): HadithAttestationItem[] {
  const targetTokens = targetRecord.matnWordTokens;
  if (targetTokens.length < 3) return [];

  const attestations: HadithAttestationItem[] = [];

  // Candidate set: find records sharing 2-grams
  const candidateIndices = new Set<number>();
  for (let i = 0; i < Math.min(targetTokens.length - 1, 8); i++) {
    const bg = `${targetTokens[i]} ${targetTokens[i + 1]}`;
    const hits = twoGramIndex.get(bg) || [];
    for (const h of hits) candidateIndices.add(h);
  }

  for (const cIdx of candidateIndices) {
    const candidate = corpusHadiths[cIdx];
    if (candidate.id === targetRecord.id) continue;

    const candTokens = candidate.matnWordTokens;
    if (candTokens.length < 3) continue;

    const shorter = targetTokens.length <= candTokens.length ? targetTokens : candTokens;
    const longer = targetTokens.length <= candTokens.length ? candTokens : targetTokens;

    const res = scoreContainment(shorter, longer);
    const containmentRatio = Math.round((res.score / 100) * 100) / 100;

    if (containmentRatio >= 0.80) {
      attestations.push({
        id: candidate.id,
        collection: candidate.collection,
        collectionArabic: candidate.collectionArabic,
        hadithnumber: candidate.hadithnumber,
        arabicnumber: candidate.arabicnumber,
        book: candidate.book,
        hadithInBook: candidate.hadithInBook,
        containmentRatio,
        grades: candidate.grades,
        hasNoGrading: candidate.hasNoGrading,
        matnSnippet: candidate.strippedMatn.slice(0, 100) + '...',
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
    // English query: strict keyword and phrase containment matching against hadith_*_en.json
    const qLower = trimmed.toLowerCase();
    const qTokens = qLower.split(/\s+/).filter(Boolean);

    const stopWords = new Set(['are', 'to', 'be', 'only', 'by', 'the', 'a', 'of', 'and', 'in', 'for', 'that']);
    const qContent = qTokens.filter((t) => !stopWords.has(t));

    const matches: HadithMatchResult[] = [];

    for (const h of corpusHadiths) {
      if (!h.rawEnglishText) continue;
      const enLower = h.rawEnglishText.toLowerCase();

      let score = 0;
      if (enLower.includes(qLower)) {
        score = 100;
      } else {
        // Find fraction of content query words found in relative sequence order
        let lastIndex = -1;
        let matchCount = 0;
        for (const t of qContent) {
          const foundIndex = enLower.indexOf(t, lastIndex + 1);
          if (foundIndex !== -1 && foundIndex > lastIndex) {
            matchCount++;
            lastIndex = foundIndex;
          }
        }
        
        // Require at least 3 matched content words in the right order
        if (matchCount >= 3) {
          score = Math.round((matchCount / qContent.length) * 100);
          score = Math.min(89, score);
        } else {
          score = 0;
        }
      }

      if (score >= 70) {
        matches.push({
          id: h.id,
          collection: h.collection,
          collectionArabic: h.collectionArabic,
          hadithnumber: h.hadithnumber,
          arabicnumber: h.arabicnumber,
          book: h.book,
          hadithInBook: h.hadithInBook,
          sectionName: h.sectionName,
          text: h.rawArabicText,
          translation: h.rawEnglishText,
          confidence: score,
          state: score >= 90 ? 'matched' : 'close_match',
          coverage: score === 100 ? 'full' : 'fragment',
          matchedStartWordIndex: 0,
          matchedEndWordIndex: Math.min(h.fullWordTokens.length - 1, 15),
          matchedTokens: qTokens,
          wordMatchStatus: qTokens.map(() => 'exact'),
          hasApproximateMatch: false,
          grades: h.grades,
          hasNoGrading: h.hasNoGrading,
          isnadStripped: false,
        });
      }
    }

    matches.sort((a, b) => b.confidence - a.confidence);
    const topConf = matches.length > 0 ? matches[0].confidence : 0;
    const state = topConf >= 90 ? 'matched' : (topConf >= 70 ? 'close_match' : 'not_found');
    const elapsed = Math.round((performance.now() - startTime) * 100) / 100;

    return {
      query: rawQuery,
      normalizedQuery: trimmed,
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
      language: 'ar',
      state: 'not_found',
      topConfidence: 0,
      totalMatches: 0,
      results: [],
      referralRequired: true,
      notice: `تحذير: هذا القول منتشر بين الناس ولكنه غير ثابت أو موضوع.\nالنص: «${matchedFake.matn}»\nالحكم: منتشر خطأً (${matchedFake.ruling})\nالمصدر: ${matchedFake.source}\nرابط التحقق: ${matchedFake.url}`,
      executionTimeMs: elapsed,
    };
  }

  const { matn: strippedQueryMatn } = stripIsnadFromNormalized(cleanQuery);
  const qTokens = strippedQueryMatn.split(/\s+/).filter(Boolean);

  // Short-query rule: < 3 words
  if (qTokens.length < 3) {
    // Check if query exactly matches an entire matn
    const exactWholeMatn = corpusHadiths.find(
      (h) => h.strippedMatn === strippedQueryMatn || h.normalizedArabicText === strippedQueryMatn
    );
    if (!exactWholeMatn) {
      const elapsed = Math.round((performance.now() - startTime) * 100) / 100;
      return {
        query: rawQuery,
        normalizedQuery: cleanQuery,
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

  // Candidate generation via 2-grams
  const candidateIndices = new Set<number>();
  for (let i = 0; i < qTokens.length - 1; i++) {
    const bg = `${qTokens[i]} ${qTokens[i + 1]}`;
    const hits = twoGramIndex.get(bg) || [];
    for (const h of hits) candidateIndices.add(h);
  }

  // If no 2-gram matches, check 1-gram for first 50 candidates
  if (candidateIndices.size === 0) {
    for (let c = 0; c < corpusHadiths.length; c++) {
      if (corpusHadiths[c].strippedMatn.includes(qTokens[0])) {
        candidateIndices.add(c);
        if (candidateIndices.size >= 50) break;
      }
    }
  }

  const results: HadithMatchResult[] = [];

  for (const cIdx of candidateIndices) {
    const record = corpusHadiths[cIdx];

    // Try against stripped matn first
    let res = scoreContainment(qTokens, record.matnWordTokens);
    let usedMatn = true;

    // If matn score < 70, try against full normalized text
    if (res.score < 70) {
      const fullRes = scoreContainment(qTokens, record.fullWordTokens);
      if (fullRes.score > res.score) {
        res = fullRes;
        usedMatn = false;
      }
    }

    if (res.score >= 70) {
      // Rule C: Cap approximate matches at 89 (close_match)
      const finalConf = res.hasApproximateMatch ? Math.min(89, res.score) : res.score;
      const state: 'matched' | 'close_match' = res.hasApproximateMatch
        ? 'close_match'
        : (finalConf >= 90 ? 'matched' : 'close_match');

      // Align highlight offsets directly against raw text words
      const rawWords = record.rawArabicText.split(/\s+/).filter(Boolean);
      const normWords = rawWords.map((w) => normalizeArabic(w));
      let rawStart = 0;
      let rawEnd = Math.min(rawWords.length - 1, qTokens.length - 1);
      let rawBestSum = -1;

      for (let j = 0; j <= normWords.length - qTokens.length; j++) {
        let sum = 0;
        for (let i = 0; i < qTokens.length; i++) {
          const sim = wordSimilarityCorpusDerived(qTokens[i], normWords[j + i]);
          if (sim.score >= 0.70) sum += sim.score;
        }
        if (sum > rawBestSum) {
          rawBestSum = sum;
          rawStart = j;
          rawEnd = j + qTokens.length - 1;
        }
      }

      results.push({
        id: record.id,
        collection: record.collection,
        collectionArabic: record.collectionArabic,
        hadithnumber: record.hadithnumber,
        arabicnumber: record.arabicnumber,
        book: record.book,
        hadithInBook: record.hadithInBook,
        sectionName: record.sectionName,
        text: record.rawArabicText,
        translation: record.rawEnglishText,
        confidence: finalConf,
        state,
        coverage: res.score === 100 && qTokens.length >= record.matnWordTokens.length ? 'full' : 'fragment',
        matchedStartWordIndex: rawStart,
        matchedEndWordIndex: rawEnd,
        matchedTokens: rawWords.slice(rawStart, rawEnd + 1),
        wordMatchStatus: res.wordStatus,
        hasApproximateMatch: res.hasApproximateMatch,
        grades: record.grades,
        hasNoGrading: record.hasNoGrading,
        isnadStripped: usedMatn && record.isnadRemovedRatio > 0,
      });
    }
  }

  results.sort((a, b) => {
    if (a.state === 'matched' && b.state !== 'matched') return -1;
    if (b.state === 'matched' && a.state !== 'matched') return 1;
    if (b.confidence !== a.confidence) return b.confidence - a.confidence;
    return a.hadithnumber - b.hadithnumber;
  });

  // Attach attestation cluster to top result
  if (results.length > 0) {
    const topRecord = corpusHadiths.find((h) => h.id === results[0].id);
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
    language: 'ar',
    state: overallState,
    topConfidence,
    totalMatches: results.length,
    results: results.slice(0, 15),
    referralRequired: overallState === 'not_found' || topConfidence < 70,
    executionTimeMs: elapsed,
  };
}
