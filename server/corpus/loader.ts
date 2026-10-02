import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

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
  hadithnumber: number | string;
  arabicnumber?: number | string;
  text: string;
  grades: HadithGrade[];
  reference?: {
    book?: number;
    hadith?: number;
  };
}

export type CollectionKey =
  | 'bukhari'
  | 'muslim'
  | 'abudawud'
  | 'tirmidhi'
  | 'nasai'
  | 'ibnmajah'
  | 'nawawi';

export interface CorpusData {
  quran: {
    ar: QuranVerse[];
    en: QuranVerse[];
  };
  hadith: {
    ar: Record<CollectionKey, HadithRecord[]>;
    en: Record<CollectionKey, HadithRecord[]>;
  };
}

const DATA_DIR = path.resolve(__dirname, 'data');
const HADITH_KEYS: CollectionKey[] = [
  'bukhari',
  'muslim',
  'abudawud',
  'tirmidhi',
  'nasai',
  'ibnmajah',
  'nawawi',
];

let cachedCorpus: CorpusData | null = null;
let loadTimeMs = 0;

export function loadCorpus(): { corpus: CorpusData; loadTimeMs: number } {
  if (cachedCorpus) {
    return { corpus: cachedCorpus, loadTimeMs };
  }

  const start = Date.now();

  // Load Quran
  const quranArRaw = JSON.parse(
    fs.readFileSync(path.join(DATA_DIR, 'quran_ar.json'), 'utf8')
  );
  const quranEnRaw = JSON.parse(
    fs.readFileSync(path.join(DATA_DIR, 'quran_en.json'), 'utf8')
  );

  const quranAr: QuranVerse[] = quranArRaw.quran || quranArRaw[Object.keys(quranArRaw)[0]];
  const quranEn: QuranVerse[] = quranEnRaw.quran || quranEnRaw[Object.keys(quranEnRaw)[0]];

  // Load Hadith
  const hadithAr = {} as Record<CollectionKey, HadithRecord[]>;
  const hadithEn = {} as Record<CollectionKey, HadithRecord[]>;

  for (const key of HADITH_KEYS) {
    const arRaw = JSON.parse(
      fs.readFileSync(path.join(DATA_DIR, `hadith_${key}_ar.json`), 'utf8')
    );
    const enRaw = JSON.parse(
      fs.readFileSync(path.join(DATA_DIR, `hadith_${key}_en.json`), 'utf8')
    );

    // Note: Bukhari, Muslim, and Nawawi naturally have grades: [] in raw data.
    // We enforce empty array for them to strictly obey the instruction:
    // "Bukhari, Muslim and Nawawi-40 have no per-hadith grades in the data.
    // Store them with an empty grades array and show «لا تتوفر درجة موثقة».
    // Do not add any grade or consensus label yourself."
    const isUnratedCollection = key === 'bukhari' || key === 'muslim' || key === 'nawawi';

    hadithAr[key] = (arRaw.hadiths || []).map((h: any) => ({
      hadithnumber: h.hadithnumber,
      arabicnumber: h.arabicnumber,
      text: h.text,
      grades: isUnratedCollection ? [] : (h.grades || []),
      reference: h.reference,
    }));

    hadithEn[key] = (enRaw.hadiths || []).map((h: any) => ({
      hadithnumber: h.hadithnumber,
      arabicnumber: h.arabicnumber,
      text: h.text,
      grades: isUnratedCollection ? [] : (h.grades || []),
      reference: h.reference,
    }));
  }

  loadTimeMs = Date.now() - start;
  cachedCorpus = {
    quran: { ar: quranAr, en: quranEn },
    hadith: { ar: hadithAr, en: hadithEn },
  };

  return { corpus: cachedCorpus, loadTimeMs };
}
