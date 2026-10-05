import fs from 'fs';
import path from 'path';
import zlib from 'zlib';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const candidateDirs = [
  path.resolve(process.cwd(), 'server/corpus/data'),
  path.resolve(__dirname, '../server/corpus/data'),
  path.resolve(__dirname, './data'),
  path.resolve(process.cwd(), 'dist-server/data'),
];
export const DATA_DIR = candidateDirs.find((d) => fs.existsSync(path.join(d, 'quran_ar.json'))) || path.resolve(process.cwd(), 'server/corpus/data');

export interface QuranVerse {
  chapter: number;
  verse: number;
  text: string;
}

export interface HadithGrade {
  name: string;
  grade: string;
}

export interface HadithRecord {
  hadithnumber: number;
  arabicnumber: number | string;
  text: string;
  grades: HadithGrade[];
  reference: {
    book: number;
    hadith: number;
  };
}

export interface LoadedCorpus {
  quran: {
    ar: QuranVerse[];
    en: QuranVerse[];
  };
  hadith: {
    ar: {
      bukhari: HadithRecord[];
      muslim: HadithRecord[];
      abudawud: HadithRecord[];
      tirmidhi: HadithRecord[];
      nasai: HadithRecord[];
      ibnmajah: HadithRecord[];
      nawawi: HadithRecord[];
    };
    en: {
      bukhari: HadithRecord[];
      muslim: HadithRecord[];
      abudawud: HadithRecord[];
      tirmidhi: HadithRecord[];
      nasai: HadithRecord[];
      ibnmajah: HadithRecord[];
      nawawi: HadithRecord[];
    };
  };
}

let cachedCorpus: LoadedCorpus | null = null;
let loadDurationMs = 0;
const hadithLookupMap = new Map<string, HadithRecord>();

function readJsonFile(filename: string): any {
  const filePath = path.join(DATA_DIR, filename);
  if (!fs.existsSync(filePath)) return {};
  const content = fs.readFileSync(filePath, 'utf8');
  return JSON.parse(content);
}

// Lazy English loaders
let cachedQuranEn: QuranVerse[] | null = null;
export function getQuranEn(): QuranVerse[] {
  if (!cachedQuranEn) {
    const raw = readJsonFile('quran_en.json');
    const list = raw.quran || raw[Object.keys(raw)[0]] || [];
    cachedQuranEn = list.map((v: any) => ({
      chapter: v.chapter,
      verse: v.verse,
      text: v.text || '',
    }));
  }
  return cachedQuranEn!;
}

let cachedTafsirMap: Map<string, string> | null = null;
export function getQuranTafsirMap(): Map<string, string> {
  if (!cachedTafsirMap) {
    cachedTafsirMap = new Map();
    const list = readJsonFile('quran_tafsir_moyassar.json');
    if (Array.isArray(list)) {
      for (const item of list) {
        cachedTafsirMap.set(`${item.chapter}:${item.verse}`, item.tafsir || '');
      }
    }
  }
  return cachedTafsirMap!;
}

export function getQuranTafsirForAyah(chapter: number, verse: number): string {
  return getQuranTafsirMap().get(`${chapter}:${verse}`) || '';
}

const EMPTY_GRADES: any[] = Object.freeze([]) as unknown as any[];

const cachedHadithEn: Partial<Record<string, HadithRecord[]>> = {};
const hadithEnLookupMap = new Map<string, HadithRecord>();

export function getHadithEn(col: string): HadithRecord[] {
  if (!cachedHadithEn[col]) {
    const raw = readJsonFile(`hadith_${col}_en.json`);
    const list = raw.hadiths || [];
    cachedHadithEn[col] = list.map((h: any) => {
      const item = {
        hadithnumber: h.hadithnumber,
        arabicnumber: h.hadithnumber,
        text: h.text || '',
        grades: EMPTY_GRADES,
        reference: {
          book: h.reference?.book || 0,
          hadith: h.reference?.hadith || 0,
        },
      };
      hadithEnLookupMap.set(`${col}_${h.hadithnumber}`, item);
      return item;
    });
  }
  return cachedHadithEn[col]!;
}

export function lookupHadithEn(collection: string, hadithnumber: number): HadithRecord | undefined {
  if (!cachedHadithEn[collection]) getHadithEn(collection);
  return hadithEnLookupMap.get(`${collection}_${hadithnumber}`);
}

export function loadCorpus(): { corpus: LoadedCorpus; loadTimeMs: number } {
  if (cachedCorpus) {
    return { corpus: cachedCorpus, loadTimeMs: loadDurationMs };
  }

  const start = performance.now();

  const quranArRaw = readJsonFile('quran_ar.json');
  const quranArVerses: QuranVerse[] = quranArRaw.quran || quranArRaw[Object.keys(quranArRaw)[0]] || [];

  const collections = ['bukhari', 'muslim', 'abudawud', 'tirmidhi', 'nasai', 'ibnmajah', 'nawawi'] as const;
  const hadithAr: any = {};

  for (const col of collections) {
    const raw = readJsonFile(`hadith_${col}_ar.json`);
    const list = raw.hadiths || [];
    hadithAr[col] = list.map((h: any) => {
      const item = {
        hadithnumber: h.hadithnumber,
        arabicnumber: h.arabicnumber ?? h.hadithnumber,
        text: h.text || '',
        grades: (!h.grades || h.grades.length === 0) ? EMPTY_GRADES : h.grades,
        reference: {
          book: h.reference?.book || 0,
          hadith: h.reference?.hadith || 0,
        },
      };
      hadithLookupMap.set(`${col}_${h.hadithnumber}`, item);
      return item;
    });
  }

  const corpus: LoadedCorpus = {
    quran: {
      ar: quranArVerses,
      get en() {
        return getQuranEn();
      },
    } as any,
    hadith: {
      ar: hadithAr,
      en: new Proxy({} as any, {
        get(_target, prop: string) {
          return getHadithEn(prop);
        },
      }),
    },
  };

  loadDurationMs = Math.round(performance.now() - start);
  cachedCorpus = corpus;

  return { corpus: cachedCorpus, loadTimeMs: loadDurationMs };
}

export function lookupHadithAr(collection: string, hadithnumber: number): HadithRecord | undefined {
  if (!cachedCorpus) loadCorpus();
  return hadithLookupMap.get(`${collection}_${hadithnumber}`);
}

export interface AskSearchDoc {
  id: string;
  type: 'ayah' | 'hadith';
  ch?: number;
  v?: number;
  col?: string;
  num?: number;
  normAr: string;
  normEn: string;
  normTafsir?: string;
}

export interface AskSearchIndexData {
  docs: AskSearchDoc[];
  postings: Record<string, number[]>;
  loadTimeMs: number;
  fileSizeBytes: number;
}

let cachedAskIndex: AskSearchIndexData | null = null;

export function loadAskSearchIndex(): AskSearchIndexData {
  if (cachedAskIndex) return cachedAskIndex;

  const start = performance.now();
  const gzPath = path.join(DATA_DIR, 'ask_search_index.json.gz');

  if (!fs.existsSync(gzPath)) {
    console.warn(`[AskSearchIndex] ${gzPath} not found!`);
    return { docs: [], postings: {}, loadTimeMs: 0, fileSizeBytes: 0 };
  }

  const stat = fs.statSync(gzPath);
  const compressed = fs.readFileSync(gzPath);
  const decompressed = zlib.gunzipSync(compressed);
  const parsed = JSON.parse(decompressed.toString('utf8'));

  const elapsed = Math.round(performance.now() - start);
  console.log(`[AskSearchIndex] Loaded ${parsed.docs.length} docs & ${Object.keys(parsed.postings).length} tokens in ${elapsed}ms (${stat.size} bytes).`);

  cachedAskIndex = {
    docs: parsed.docs,
    postings: parsed.postings,
    loadTimeMs: elapsed,
    fileSizeBytes: stat.size,
  };

  return cachedAskIndex;
}

