import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DATA_DIR = fs.existsSync(path.resolve(__dirname, './data'))
  ? path.resolve(__dirname, './data')
  : path.resolve(process.cwd(), 'server/corpus/data');

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

const cachedHadithEn: Partial<Record<string, HadithRecord[]>> = {};
export function getHadithEn(col: string): HadithRecord[] {
  if (!cachedHadithEn[col]) {
    const raw = readJsonFile(`hadith_${col}_en.json`);
    const list = raw.hadiths || [];
    cachedHadithEn[col] = list.map((h: any) => ({
      hadithnumber: h.hadithnumber,
      arabicnumber: h.arabicnumber ?? h.hadithnumber,
      text: h.text || '',
      grades: [],
      reference: {
        book: h.reference?.book || 0,
        hadith: h.reference?.hadith || 0,
      },
    }));
  }
  return cachedHadithEn[col]!;
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
    hadithAr[col] = list.map((h: any) => ({
      hadithnumber: h.hadithnumber,
      arabicnumber: h.arabicnumber ?? h.hadithnumber,
      text: h.text || '',
      grades: h.grades || [],
      reference: {
        book: h.reference?.book || 0,
        hadith: h.reference?.hadith || 0,
      },
    }));
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

