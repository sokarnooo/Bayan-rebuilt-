import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DATA_DIR = path.resolve(__dirname, './data');

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
  arabicnumber: number;
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
  const content = fs.readFileSync(filePath, 'utf8');
  return JSON.parse(content);
}

export function loadCorpus(): { corpus: LoadedCorpus; loadTimeMs: number } {
  if (cachedCorpus) {
    return { corpus: cachedCorpus, loadTimeMs: loadDurationMs };
  }

  const start = performance.now();

  const quranArRaw = readJsonFile('quran_ar.json');
  const quranEnRaw = readJsonFile('quran_en.json');

  const corpus: LoadedCorpus = {
    quran: {
      ar: quranArRaw.quran || quranArRaw[Object.keys(quranArRaw)[0]],
      en: quranEnRaw.quran || quranEnRaw[Object.keys(quranEnRaw)[0]],
    },
    hadith: {
      ar: {
        bukhari: readJsonFile('hadith_bukhari_ar.json').hadiths || [],
        muslim: readJsonFile('hadith_muslim_ar.json').hadiths || [],
        abudawud: readJsonFile('hadith_abudawud_ar.json').hadiths || [],
        tirmidhi: readJsonFile('hadith_tirmidhi_ar.json').hadiths || [],
        nasai: readJsonFile('hadith_nasai_ar.json').hadiths || [],
        ibnmajah: readJsonFile('hadith_ibnmajah_ar.json').hadiths || [],
        nawawi: readJsonFile('hadith_nawawi_ar.json').hadiths || [],
      },
      en: {
        bukhari: readJsonFile('hadith_bukhari_en.json').hadiths || [],
        muslim: readJsonFile('hadith_muslim_en.json').hadiths || [],
        abudawud: readJsonFile('hadith_abudawud_en.json').hadiths || [],
        tirmidhi: readJsonFile('hadith_tirmidhi_en.json').hadiths || [],
        nasai: readJsonFile('hadith_nasai_en.json').hadiths || [],
        ibnmajah: readJsonFile('hadith_ibnmajah_en.json').hadiths || [],
        nawawi: readJsonFile('hadith_nawawi_en.json').hadiths || [],
      },
    },
  };

  loadDurationMs = Math.round(performance.now() - start);
  cachedCorpus = corpus;

  return { corpus: cachedCorpus, loadTimeMs: loadDurationMs };
}
