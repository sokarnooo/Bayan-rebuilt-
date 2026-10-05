import fs from 'fs';
import path from 'path';
import zlib from 'zlib';
import { fileURLToPath } from 'url';
import { preprocessAllRawHadiths } from '../matching/hadithMatcher.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DATA_DIR = path.resolve(__dirname, './data');

const EXPECTED_COUNTS: Record<string, number> = {
  bukhari: 7580,
  muslim: 7360,
  abudawud: 5272,
  tirmidhi: 3924,
  nasai: 5679,
  ibnmajah: 4338,
  nawawi: 42,
};

const QURAN_EXPECTED = 6236;

const COLLECTIONS = Object.keys(EXPECTED_COUNTS);
const QURAN_EDITIONS = ['ara-quranacademy', 'eng-ummmuhammad'];

async function downloadFile(url: string, dest: string) {
  console.log(`Downloading ${url} ...`);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to download ${url}: ${res.statusText}`);
  const text = await res.text();
  fs.writeFileSync(dest, text);
}

export async function runPrebuild() {
  console.log('====================================================');
  console.log('Starting Prebuild: Data Acquisition & Index Generation');
  const startTime = performance.now();

  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }

  // 1. Download Corpus if missing
  try {
    for (const col of COLLECTIONS) {
      const arPath = path.join(DATA_DIR, `hadith_${col}_ar.json`);
      const enPath = path.join(DATA_DIR, `hadith_${col}_en.json`);
      
      if (!fs.existsSync(arPath)) {
        await downloadFile(`https://cdn.jsdelivr.net/gh/fawazahmed0/hadith-api@df57907be35291c91ad6a6691180e22ca9920784/editions/ara-${col}.json`, arPath);
      }
      if (!fs.existsSync(enPath)) {
        await downloadFile(`https://cdn.jsdelivr.net/gh/fawazahmed0/hadith-api@df57907be35291c91ad6a6691180e22ca9920784/editions/eng-${col}.json`, enPath);
      }
    }

    if (!fs.existsSync(path.join(DATA_DIR, 'quran_info.json'))) {
      await downloadFile(`https://cdn.jsdelivr.net/gh/fawazahmed0/quran-api@47ca096b0976443ba2eab2e45cdf0fb4096a2610/info.json`, path.join(DATA_DIR, 'quran_info.json'));
    }
    if (!fs.existsSync(path.join(DATA_DIR, 'quran_ar.json'))) {
      await downloadFile(`https://cdn.jsdelivr.net/gh/fawazahmed0/quran-api@47ca096b0976443ba2eab2e45cdf0fb4096a2610/editions/ara-quranacademy.json`, path.join(DATA_DIR, 'quran_ar.json'));
    }
    await downloadFile(`https://cdn.jsdelivr.net/gh/fawazahmed0/quran-api@47ca096b0976443ba2eab2e45cdf0fb4096a2610/editions/eng-ummmuhammad.json`, path.join(DATA_DIR, 'quran_en.json'));

    // Download Muyassar Tafsir from QuranEnc (per sura) if missing or incomplete
    const tafsirPath = path.join(DATA_DIR, 'quran_tafsir_moyassar.json');
    if (!fs.existsSync(tafsirPath)) {
      console.log('Fetching Muyassar Tafsir from QuranEnc (arabic_moyassar)...');
      const tafsirList: Array<{ chapter: number; verse: number; tafsir: string }> = [];
      const BATCH_SIZE = 15;
      for (let i = 1; i <= 114; i += BATCH_SIZE) {
        const batch = [];
        for (let s = i; s < i + BATCH_SIZE && s <= 114; s++) {
          batch.push(
            fetch(`https://quranenc.com/api/v1/translation/sura/arabic_moyassar/${s}`)
              .then((r) => r.json())
              .catch((err) => {
                console.error(`Failed to fetch tafsir for sura ${s}:`, err);
                return null;
              })
          );
        }
        const results = await Promise.all(batch);
        for (const res of results) {
          if (res && res.result) {
            for (const v of res.result) {
              tafsirList.push({
                chapter: Number(v.sura),
                verse: Number(v.aya),
                tafsir: (v.translation || '').trim(),
              });
            }
          }
        }
      }

      if (tafsirList.length !== QURAN_EXPECTED) {
        console.error(`CRITICAL ERROR: Muyassar Tafsir count mismatch! Expected ${QURAN_EXPECTED}, got ${tafsirList.length}`);
        process.exit(1);
      }

      fs.writeFileSync(tafsirPath, JSON.stringify(tafsirList, null, 2));
      console.log(`Saved ${tafsirList.length} Muyassar Tafsir entries to ${tafsirPath}`);
    }
  } catch (err) {
    console.error('CRITICAL: Download failed. Prebuild aborted.');
    console.error(err);
    process.exit(1); // Fail build
  }

  // 2. Preprocess & Verify Counts
  console.log('Preprocessing records and verifying counts...');
  const { records, vocab, sections, emptyCount } = preprocessAllRawHadiths();

  // Verification
  const actualCounts: Record<string, number> = {};
  for (const r of records) {
    actualCounts[r.c] = (actualCounts[r.c] || 0) + 1;
  }

  let mismatch = false;
  for (const col of COLLECTIONS) {
    if (actualCounts[col] !== EXPECTED_COUNTS[col]) {
      console.error(`ERROR: ${col} count mismatch! Expected ${EXPECTED_COUNTS[col]}, got ${actualCounts[col]}`);
      mismatch = true;
    }
  }

  // Check Quran (simple read check)
  const quranAr = JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'quran_ar.json'), 'utf8'));
  const quranList = quranAr.quran || quranAr[Object.keys(quranAr)[0]];
  if (quranList.length !== QURAN_EXPECTED) {
    console.error(`ERROR: Quran count mismatch! Expected ${QURAN_EXPECTED}, got ${quranList.length}`);
    mismatch = true;
  }

  if (mismatch) {
    console.error('CRITICAL: Data verification failed. Build aborted.');
    process.exit(1);
  }

  console.log('Verification PASSED.');

  // 3. Save Gzipped Hadith Matcher Index
  const outPathGz = path.join(DATA_DIR, 'prebuilt_hadiths.json.gz');
  const serializedRecords = records.map(r => ({
    c: r.c,
    n: r.n,
    m: Array.from(r.m),
    f: Array.from(r.f),
    r: r.r,
    o: r.o,
  }));
  const jsonStr = JSON.stringify({ v: vocab, r: serializedRecords, s: sections });
  const compressed = zlib.gzipSync(Buffer.from(jsonStr, 'utf8'));
  fs.writeFileSync(outPathGz, compressed);

  // 4. Generate Precomputed Inverted Ask Index (Zero Per-Request Normalization)
  console.log('Building Precomputed Inverted Ask Index...');
  const askIndexStart = performance.now();

  const quranEn = JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'quran_en.json'), 'utf8'));
  const quranEnList = quranEn.quran || quranEn[Object.keys(quranEn)[0]] || [];
  const quranEnMap = new Map<string, string>();
  for (const v of quranEnList) {
    quranEnMap.set(`${v.chapter}_${v.verse}`, v.text || '');
  }

  const tafsirListRaw = JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'quran_tafsir_moyassar.json'), 'utf8'));
  const tafsirMap = new Map<string, string>();
  for (const t of tafsirListRaw) {
    tafsirMap.set(`${t.chapter}_${t.verse}`, t.tafsir || '');
  }

  function cleanAr(text: string): string {
    return (text || '').replace(/[\u064B-\u065F\u0670]/g, '').replace(/[\u0622\u0623\u0625\u0671]/g, 'ا').replace(/\u0649/g, 'ي').replace(/\u0629/g, 'ه');
  }

  function stripPref(w: string): string {
    let s = cleanAr(w);
    if (s.startsWith('وال') && s.length > 4) s = s.slice(3);
    else if (s.startsWith('فال') && s.length > 4) s = s.slice(3);
    else if (s.startsWith('بال') && s.length > 4) s = s.slice(3);
    else if (s.startsWith('لل') && s.length > 3) s = s.slice(2);
    else if (s.startsWith('ال') && s.length > 3) s = s.slice(2);
    else if ((s.startsWith('و') || s.startsWith('ف') || s.startsWith('ب') || s.startsWith('ل') || s.startsWith('ك')) && s.length > 3) {
      s = s.slice(1);
    }
    return s;
  }

  function extractMatn(text: string, maxWords = 80): string {
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
    return s.trim().split(/\s+/).filter(Boolean).slice(0, maxWords).join(' ');
  }

  const askDocs: Array<{
    id: string;
    type: 'ayah' | 'hadith';
    ch?: number;
    v?: number;
    col?: string;
    num?: number;
    normAr: string;
    normEn: string;
    normTafsir?: string;
  }> = [];

  const postings: Record<string, number[]> = {};

  function addDocTokens(docIdx: number, arText: string, enText: string, tafsirText?: string) {
    const tokenSet = new Set<string>();
    
    // Arabic tokens
    const arWords = cleanAr(arText).split(/[^\u0621-\u064A]+/).filter(w => w.length >= 2);
    for (const w of arWords) {
      tokenSet.add(w);
      const str = stripPref(w);
      if (str.length >= 2) tokenSet.add(str);
    }

    // Tafsir tokens
    if (tafsirText) {
      const tafsirWords = cleanAr(tafsirText).split(/[^\u0621-\u064A]+/).filter(w => w.length >= 2);
      for (const w of tafsirWords) {
        tokenSet.add(w);
        const str = stripPref(w);
        if (str.length >= 2) tokenSet.add(str);
      }
    }

    // English tokens
    if (enText) {
      const enWords = enText.toLowerCase().split(/[^a-z0-9]+/).filter(w => w.length >= 3);
      for (const w of enWords) {
        tokenSet.add(w);
      }
    }

    for (const tok of tokenSet) {
      if (!postings[tok]) postings[tok] = [];
      postings[tok].push(docIdx);
    }
  }

  // Index Ayat
  for (const v of quranList) {
    const ch = Number(v.chapter);
    const verse = Number(v.verse);
    const ar = cleanAr(v.text || '');
    const en = (quranEnMap.get(`${ch}_${verse}`) || '').toLowerCase();
    const tafsir = cleanAr(tafsirMap.get(`${ch}_${verse}`) || '');

    const docIdx = askDocs.length;
    askDocs.push({
      id: `ayah_${ch}_${verse}`,
      type: 'ayah',
      ch,
      v: verse,
      normAr: ar,
      normEn: en,
      normTafsir: tafsir,
    });

    addDocTokens(docIdx, ar, en, tafsir);
  }

  // Index Hadiths
  for (const col of COLLECTIONS) {
    const rawAr = JSON.parse(fs.readFileSync(path.join(DATA_DIR, `hadith_${col}_ar.json`), 'utf8'));
    const rawEn = JSON.parse(fs.readFileSync(path.join(DATA_DIR, `hadith_${col}_en.json`), 'utf8'));
    const listAr = rawAr.hadiths || [];
    const listEn = rawEn.hadiths || [];

    for (let i = 0; i < listAr.length; i++) {
      const hAr = listAr[i];
      const hEn = listEn[i];
      if (!hAr || !hAr.text) continue;

      const num = hAr.hadithnumber || i + 1;
      const matnAr = cleanAr(extractMatn(hAr.text, 80));
      const matnEn = (hEn?.text || '').toLowerCase();

      const docIdx = askDocs.length;
      askDocs.push({
        id: `${col}_${num}`,
        type: 'hadith',
        col,
        num,
        normAr: matnAr,
        normEn: matnEn,
      });

      addDocTokens(docIdx, matnAr, matnEn);
    }
  }

  const askIndexFile = path.join(DATA_DIR, 'ask_search_index.json.gz');
  const askIndexPayload = JSON.stringify({ docs: askDocs, postings });
  const askCompressed = zlib.gzipSync(Buffer.from(askIndexPayload, 'utf8'));
  fs.writeFileSync(askIndexFile, askCompressed);

  const askElapsed = Math.round(performance.now() - askIndexStart);
  console.log(`Precomputed Inverted Ask Index generated in ${askElapsed}ms!`);
  console.log(`Indexed ${askDocs.length} documents (${Object.keys(postings).length} unique tokens). Saved to ${askIndexFile} (${askCompressed.length} bytes).`);

  const elapsed = Math.round(performance.now() - startTime);
  console.log(`Prebuild Completed successfully in ${elapsed}ms!`);
  console.log(`Saved ${records.length} records to ${outPathGz} (${compressed.length} bytes).`);
  console.log('====================================================');
}

if (process.argv[1]?.includes('prebuild')) {
  runPrebuild().catch(err => {
    console.error('Prebuild failed:', err);
    process.exit(1);
  });
}
