import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const TARGET_DIR = path.resolve(__dirname, '../server/corpus/data');

// Pinned exact commit SHAs
const QURAN_COMMIT = '47ca096b0976443ba2eab2e45cdf0fb4096a2610';
const HADITH_COMMIT = 'df57907be35291c91ad6a6691180e22ca9920784';

const SOURCES = [
  // Quran metadata & text
  {
    key: 'quran_info',
    url: `https://cdn.jsdelivr.net/gh/fawazahmed0/quran-api@${QURAN_COMMIT}/info.json`,
    file: 'quran_info.json',
  },
  {
    key: 'quran_ar',
    url: `https://cdn.jsdelivr.net/gh/fawazahmed0/quran-api@${QURAN_COMMIT}/editions/ara-quranacademy.min.json`,
    file: 'quran_ar.json',
  },
  {
    key: 'quran_en',
    url: `https://cdn.jsdelivr.net/gh/fawazahmed0/quran-api@${QURAN_COMMIT}/editions/eng-ummmuhammad.min.json`,
    file: 'quran_en.json',
  },
  // Hadith Arabic
  {
    key: 'hadith_bukhari_ar',
    url: `https://cdn.jsdelivr.net/gh/fawazahmed0/hadith-api@${HADITH_COMMIT}/editions/ara-bukhari.min.json`,
    file: 'hadith_bukhari_ar.json',
  },
  {
    key: 'hadith_muslim_ar',
    url: `https://cdn.jsdelivr.net/gh/fawazahmed0/hadith-api@${HADITH_COMMIT}/editions/ara-muslim.min.json`,
    file: 'hadith_muslim_ar.json',
  },
  {
    key: 'hadith_abudawud_ar',
    url: `https://cdn.jsdelivr.net/gh/fawazahmed0/hadith-api@${HADITH_COMMIT}/editions/ara-abudawud.min.json`,
    file: 'hadith_abudawud_ar.json',
  },
  {
    key: 'hadith_tirmidhi_ar',
    url: `https://cdn.jsdelivr.net/gh/fawazahmed0/hadith-api@${HADITH_COMMIT}/editions/ara-tirmidhi.min.json`,
    file: 'hadith_tirmidhi_ar.json',
  },
  {
    key: 'hadith_nasai_ar',
    url: `https://cdn.jsdelivr.net/gh/fawazahmed0/hadith-api@${HADITH_COMMIT}/editions/ara-nasai.min.json`,
    file: 'hadith_nasai_ar.json',
  },
  {
    key: 'hadith_ibnmajah_ar',
    url: `https://cdn.jsdelivr.net/gh/fawazahmed0/hadith-api@${HADITH_COMMIT}/editions/ara-ibnmajah.min.json`,
    file: 'hadith_ibnmajah_ar.json',
  },
  {
    key: 'hadith_nawawi_ar',
    url: `https://cdn.jsdelivr.net/gh/fawazahmed0/hadith-api@${HADITH_COMMIT}/editions/ara-nawawi.min.json`,
    file: 'hadith_nawawi_ar.json',
  },
  // Hadith English
  {
    key: 'hadith_bukhari_en',
    url: `https://cdn.jsdelivr.net/gh/fawazahmed0/hadith-api@${HADITH_COMMIT}/editions/eng-bukhari.min.json`,
    file: 'hadith_bukhari_en.json',
  },
  {
    key: 'hadith_muslim_en',
    url: `https://cdn.jsdelivr.net/gh/fawazahmed0/hadith-api@${HADITH_COMMIT}/editions/eng-muslim.min.json`,
    file: 'hadith_muslim_en.json',
  },
  {
    key: 'hadith_abudawud_en',
    url: `https://cdn.jsdelivr.net/gh/fawazahmed0/hadith-api@${HADITH_COMMIT}/editions/eng-abudawud.min.json`,
    file: 'hadith_abudawud_en.json',
  },
  {
    key: 'hadith_tirmidhi_en',
    url: `https://cdn.jsdelivr.net/gh/fawazahmed0/hadith-api@${HADITH_COMMIT}/editions/eng-tirmidhi.min.json`,
    file: 'hadith_tirmidhi_en.json',
  },
  {
    key: 'hadith_nasai_en',
    url: `https://cdn.jsdelivr.net/gh/fawazahmed0/hadith-api@${HADITH_COMMIT}/editions/eng-nasai.min.json`,
    file: 'hadith_nasai_en.json',
  },
  {
    key: 'hadith_ibnmajah_en',
    url: `https://cdn.jsdelivr.net/gh/fawazahmed0/hadith-api@${HADITH_COMMIT}/editions/eng-ibnmajah.min.json`,
    file: 'hadith_ibnmajah_en.json',
  },
  {
    key: 'hadith_nawawi_en',
    url: `https://cdn.jsdelivr.net/gh/fawazahmed0/hadith-api@${HADITH_COMMIT}/editions/eng-nawawi.min.json`,
    file: 'hadith_nawawi_en.json',
  },
];

async function downloadFile(url: string, destPath: string): Promise<number> {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Failed to download ${url}: status ${res.status}`);
  }
  const arrayBuffer = await res.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);
  fs.writeFileSync(destPath, buffer);
  return buffer.byteLength;
}

async function main() {
  console.log(`Starting pinned corpus prebuild fetch into ${TARGET_DIR}...`);
  fs.mkdirSync(TARGET_DIR, { recursive: true });

  let totalBytes = 0;
  for (const src of SOURCES) {
    const dest = path.join(TARGET_DIR, src.file);
    process.stdout.write(`Fetching ${src.file}... `);
    const start = Date.now();
    const bytes = await downloadFile(src.url, dest);
    totalBytes += bytes;
    console.log(`done (${(bytes / 1024 / 1024).toFixed(2)} MB in ${Date.now() - start}ms)`);
  }

  console.log(`\nAll pinned corpus files successfully downloaded.`);
  console.log(`Total corpus size on disk: ${(totalBytes / 1024 / 1024).toFixed(2)} MB`);
}

main().catch(err => {
  console.error('Error downloading corpus:', err);
  process.exit(1);
});
