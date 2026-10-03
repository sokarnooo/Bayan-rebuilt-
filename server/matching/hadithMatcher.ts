import fs from 'fs';
import path from 'path';
import zlib from 'zlib';
import { fileURLToPath } from 'url';
import { loadCorpus } from '../corpus/loader.ts';
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
  c: string; // collection slug
  n: number; // hadithnumber
  m: number[]; // matn word token IDs
  f: number[]; // full word token IDs
  r: number; // isnadRemovedRatio
  o: number; // isnadWordOffset
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
let vocabulary: string[] = [];
let wordToIdMap = new Map<string, number>();
let twoGramIndex = new Map<number, Map<number, number[]>>(); // id1 -> id2 -> array of record indices
let isInitialized = false;
let sectionsCache = new Map<string, Record<string, string>>();

function getWordId(word: string, add = false): number {
  let id = wordToIdMap.get(word);
  if (id === undefined && add) {
    id = vocabulary.length;
    vocabulary.push(word);
    wordToIdMap.set(word, id);
  }
  return id ?? -1;
}

function addToIndex(id1: number, id2: number, recordIdx: number) {
  let m1 = twoGramIndex.get(id1);
  if (!m1) {
    m1 = new Map<number, number[]>();
    twoGramIndex.set(id1, m1);
  }
  let list = m1.get(id2);
  if (!list) {
    list = [];
    m1.set(id2, list);
  }
  if (list[list.length - 1] !== recordIdx) {
    list.push(recordIdx);
  }
}

function getIndexHits(id1: number, id2: number): number[] {
  return twoGramIndex.get(id1)?.get(id2) || [];
}

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
    if (counts[h.c] !== undefined) {
      counts[h.c]++;
      counts.totalIndexed++;
    }
  }
  return counts;
}

export function preprocessAllRawHadiths(): { records: HadithRecord[]; vocab: string[]; sections: Record<string, Record<string, string>>; emptyCount: number } {
  const collections = ['bukhari', 'muslim', 'abudawud', 'tirmidhi', 'nasai', 'ibnmajah', 'nawawi'];
  const records: HadithRecord[] = [];
  const sections: Record<string, Record<string, string>> = {};
  vocabulary = [];
  wordToIdMap.clear();
  let emptyCount = 0;

  for (const col of collections) {
    const arPath = path.join(DATA_DIR, `hadith_${col}_ar.json`);
    if (!fs.existsSync(arPath)) continue;

    const arData = JSON.parse(fs.readFileSync(arPath, 'utf8'));
    sections[col] = arData.metadata?.sections || {};
    const hadithList = arData.hadiths || [];

    for (const h of hadithList) {
      const rawText = (h.text || '').trim();
      if (!rawText) {
        emptyCount++;
        continue;
      }

      const norm = normalizeArabic(rawText);
      const cleanNorm = stripHonorificsAndFormulas(norm);
      const { matn, strippedRatio, isnadWordOffset } = stripIsnadFromNormalized(cleanNorm);

      const matnTokens = matn.split(/\s+/).filter(Boolean);
      const fullTokens = cleanNorm.split(/\s+/).filter(Boolean);

      records.push({
        c: col,
        n: h.hadithnumber,
        m: matnTokens.map(t => getWordId(t, true)),
        f: fullTokens.map(t => getWordId(t, true)),
        r: strippedRatio,
        o: isnadWordOffset ?? 0,
      });
    }
  }

  return { records, vocab: vocabulary, sections, emptyCount };
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

  const prebuiltPathGz = path.join(DATA_DIR, 'prebuilt_hadiths.json.gz');
  const prebuiltPathPlain = path.join(DATA_DIR, 'prebuilt_hadiths.json');

  corpusHadiths = [];
  twoGramIndex.clear();
  let emptyCount = 379;

  if (fs.existsSync(prebuiltPathGz)) {
    // Fast path: load gzipped prebuilt index
    const buffer = fs.readFileSync(prebuiltPathGz);
    const decompressed = zlib.gunzipSync(buffer).toString('utf8');
    const data = JSON.parse(decompressed);
    vocabulary = data.v || [];
    corpusHadiths = data.r || [];
    
    // Populate sections cache from prebuilt
    sectionsCache.clear();
    if (data.s) {
      for (const [col, sData] of Object.entries(data.s)) {
        sectionsCache.set(col, sData as Record<string, string>);
      }
    }
  } else if (fs.existsSync(prebuiltPathPlain)) {
    const data = JSON.parse(fs.readFileSync(prebuiltPathPlain, 'utf8'));
    vocabulary = data.v || [];
    corpusHadiths = data.r || [];
    if (data.s) {
      for (const [col, sData] of Object.entries(data.s)) {
        sectionsCache.set(col, sData as Record<string, string>);
      }
    }
  } else {
    // Slow path fallback: build dynamically
    const { records, vocab, sections, emptyCount: ec } = preprocessAllRawHadiths();
    corpusHadiths = records;
    vocabulary = vocab;
    emptyCount = ec;
    
    sectionsCache.clear();
    for (const [col, sData] of Object.entries(sections)) {
      sectionsCache.set(col, sData);
    }
  }

  // Rebuild wordToIdMap for runtime use (finding word IDs for query)
  wordToIdMap.clear();
  for (let i = 0; i < vocabulary.length; i++) {
    wordToIdMap.set(vocabulary[i], i);
  }

  // Populate twoGramIndex of matn
  twoGramIndex.clear();
  for (let recordIdx = 0; recordIdx < corpusHadiths.length; recordIdx++) {
    const record = corpusHadiths[recordIdx];
    const tokenIds = record.m;
    for (let i = 0; i < tokenIds.length - 1; i++) {
      addToIndex(tokenIds[i], tokenIds[i + 1], recordIdx);
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
  recordTokenIds: number[]
): {
  score: number;
  startWordIndex: number;
  endWordIndex: number;
  hasApproximateMatch: boolean;
  wordStatus: ('exact' | 'approximate' | 'none')[];
} {
  const qLen = queryTokens.length;
  const rLen = recordTokenIds.length;

  if (qLen === 0 || rLen === 0) {
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

  const qIds = queryTokens.map(t => getWordId(t));
  const maxStart = Math.max(0, rLen - qLen);

  for (let j = 0; j <= maxStart; j++) {
    let sum = 0;
    let anyApprox = false;
    let hasNone = false;
    const currentStatus: ('exact' | 'approximate' | 'none')[] = [];

    for (let i = 0; i < qLen; i++) {
      const rId = recordTokenIds[j + i];
      if (qIds[i] !== -1 && qIds[i] === rId) {
        sum += 1.0;
        currentStatus.push('exact');
      } else {
        const rToken = vocabulary[rId];
        const sim = wordSimilarityCorpusDerived(queryTokens[i], rToken);
        if (sim.score >= 0.70) {
          if (sim.score < 1.0) anyApprox = true;
          sum += sim.score;
          currentStatus.push(sim.score >= 0.90 ? 'exact' : 'approximate');
        } else {
          hasNone = true;
          currentStatus.push('none');
        }
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
  const targetTokenIds = targetRecord.m;
  if (targetTokenIds.length < 3) return [];

  const attestations: HadithAttestationItem[] = [];
  const { corpus } = loadCorpus();

  // Candidate set: find records sharing 2-grams
  const candidateIndices = new Set<number>();
  for (let i = 0; i < Math.min(targetTokenIds.length - 1, 8); i++) {
    const bg = `${targetTokenIds[i]} ${targetTokenIds[i + 1]}`;
    const hits = twoGramIndex.get(bg) || [];
    for (const h of hits) candidateIndices.add(h);
  }

  for (const cIdx of candidateIndices) {
    const candidate = corpusHadiths[cIdx];
    if (candidate.c === targetRecord.c && candidate.n === targetRecord.n) continue;

    const candTokenIds = candidate.m;
    if (candTokenIds.length < 3) continue;

    const shorter = targetTokenIds.length <= candTokenIds.length ? targetTokenIds : candTokenIds;
    const longer = targetTokenIds.length <= candTokenIds.length ? candTokenIds : targetTokenIds;

    // scoreContainment takes string[] as first arg. 
    // We need a variant or just convert shorter to strings for this call.
    const shorterStrings = shorter.map(id => vocabulary[id]);
    const res = scoreContainment(shorterStrings, longer);
    const containmentRatio = Math.round((res.score / 100) * 100) / 100;

    if (containmentRatio >= 0.80) {
      const arList = corpus.hadith.ar[candidate.c as keyof typeof corpus.hadith.ar] || [];
      const rawAr = arList.find(h => h.hadithnumber === candidate.n);
      const grades: HadithGradeItem[] = (rawAr?.grades || []).map(parseGrade);
      const hasNoGrading = grades.length === 0;

      const bookNum = rawAr?.reference?.book ?? 0;
      const hadithInBook = rawAr?.reference?.hadith ?? 0;
      const colMeta = COLLECTION_METADATA[candidate.c] || { arName: candidate.c, enName: candidate.c };

      attestations.push({
        id: `${candidate.c}_${candidate.n}`,
        collection: candidate.c,
        collectionArabic: colMeta.arName,
        hadithnumber: candidate.n,
        arabicnumber: rawAr?.arabicnumber ?? candidate.n,
        book: bookNum,
        hadithInBook,
        containmentRatio,
        grades,
        hasNoGrading,
        matnSnippet: vocabulary.slice(candidate.m[0], candidate.m[0] + 20).map(id => vocabulary[id] || '').join(' ').slice(0, 100) + '...',
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
      isCuratedMatched: true,
      curatedMatchedEntry: {
        saying: matchedFake.matn,
        ruling: matchedFake.ruling,
        url: matchedFake.url,
        source: matchedFake.source
      },
      notice: `حديث منتشر لا يصح\nالنص: «${matchedFake.matn}»\nالحكم في الدرر السنية: ${matchedFake.ruling}\nالمصدر: الدرر السنية — أحاديث منتشرة لا تصح\nرابط التحقق: ${matchedFake.url}`,
      executionTimeMs: elapsed,
    };
  }

  const { matn: strippedQueryMatn } = stripIsnadFromNormalized(cleanQuery);
  const qTokens = strippedQueryMatn.split(/\s+/).filter(Boolean);

  // Short-query rule: < 3 words
  if (qTokens.length < 3) {
    // Check if query exactly matches an entire matn
    // Since we don't have strings in records, we look for token ID array equality
    const qIds = qTokens.map(t => getWordId(t));
    const exactWholeMatn = (qIds.every(id => id !== -1)) ? corpusHadiths.find(h => {
      if (h.m.length !== qIds.length) return false;
      return h.m.every((id, idx) => id === qIds[idx]);
    }) : null;

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
  const qIds = qTokens.map(t => getWordId(t));

  for (let i = 0; i < qTokens.length - 1; i++) {
    const id1 = qIds[i];
    const id2 = qIds[i + 1];
    if (id1 === -1 || id2 === -1) continue;
    
    const hits = getIndexHits(id1, id2);
    for (const h of hits) candidateIndices.add(h);
  }

  // If no 2-gram matches, check 1-gram for first 50 candidates
  if (candidateIndices.size === 0 && qIds[0] !== -1) {
    for (let c = 0; c < corpusHadiths.length; c++) {
      if (corpusHadiths[c].m.includes(qIds[0])) {
        candidateIndices.add(c);
        if (candidateIndices.size >= 50) break;
      }
    }
  }

  const results: HadithMatchResult[] = [];

  for (const cIdx of candidateIndices) {
    const record = corpusHadiths[cIdx];

    // Try against stripped matn first
    let res = scoreContainment(qTokens, record.m);
    let usedMatn = true;

    // If matn score < 70, try against full normalized text
    if (res.score < 70) {
      const fullRes = scoreContainment(qTokens, record.f);
      if (fullRes.score > res.score) {
        res = fullRes;
        usedMatn = false;
      }
    }

    if (res.score >= 70) {
      // Reconstruct raw details from the LoadedCorpus on demand
      const { corpus } = loadCorpus();
      const arList = corpus.hadith.ar[record.c as keyof typeof corpus.hadith.ar] || [];
      const enList = corpus.hadith.en[record.c as keyof typeof corpus.hadith.en] || [];
      
      const rawAr = arList.find(h => h.hadithnumber === record.n);
      const rawEn = enList.find(h => h.hadithnumber === record.n);

      const rawArabicText = rawAr?.text || '';
      const rawEnglishText = rawEn?.text;
      const grades: HadithGradeItem[] = (rawAr?.grades || []).map(parseGrade);
      const hasNoGrading = grades.length === 0;

      const bookNum = rawAr?.reference?.book ?? 0;
      const hadithInBook = rawAr?.reference?.hadith ?? 0;
      
      const sections = sectionsCache.get(record.c) || {};
      const sectionName = sections[String(bookNum)] || (bookNum > 0 ? `Book ${bookNum}` : '');

      const colMeta = COLLECTION_METADATA[record.c] || { arName: record.c, enName: record.c };

      // Rule C: Cap approximate matches at 89 (close_match)
      const finalConf = res.hasApproximateMatch ? Math.min(89, res.score) : res.score;
      const state: 'matched' | 'close_match' = res.hasApproximateMatch
        ? 'close_match'
        : (finalConf >= 90 ? 'matched' : 'close_match');

      // Align highlight offsets directly against raw text words
      const rawWords = rawArabicText.split(/\s+/).filter(Boolean);
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
        id: `${record.c}_${record.n}`,
        collection: record.c,
        collectionArabic: colMeta.arName,
        hadithnumber: record.n,
        arabicnumber: rawAr?.arabicnumber ?? record.n,
        book: bookNum,
        hadithInBook,
        sectionName,
        text: rawArabicText,
        translation: rawEnglishText,
        confidence: finalConf,
        state,
        coverage: res.score === 100 && qTokens.length >= record.m.length ? 'full' : 'fragment',
        matchedStartWordIndex: rawStart,
        matchedEndWordIndex: rawEnd,
        matchedTokens: rawWords.slice(rawStart, rawEnd + 1),
        wordMatchStatus: res.wordStatus,
        hasApproximateMatch: res.hasApproximateMatch,
        grades,
        hasNoGrading,
        isnadStripped: usedMatn && record.r > 0,
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
    const topRecord = corpusHadiths.find((h) => `${h.c}_${h.n}` === results[0].id);
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
