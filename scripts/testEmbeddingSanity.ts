import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { GoogleGenAI } from '@google/genai';
import crypto from 'crypto';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DATA_DIR = path.resolve(__dirname, '../server/corpus/data');

const apiKey = process.env.GEMINI_API_KEY;
if (!apiKey) {
  console.error('GEMINI_API_KEY is not set');
  process.exit(1);
}

const ai = new GoogleGenAI({
  apiKey,
  httpOptions: { headers: { 'User-Agent': 'aistudio-build' } },
});

interface CorpusItem {
  id: string; // e.g. quran:55:13 or bukhari:5590
  lang: 'ar' | 'en';
  text: string;
  hash: string;
}

function computeHash(text: string): string {
  return crypto.createHash('sha256').update(text).digest('hex').slice(0, 16);
}

function l2Normalize(vec: number[]): number[] {
  let sumSq = 0;
  for (let i = 0; i < vec.length; i++) sumSq += vec[i] * vec[i];
  const norm = Math.sqrt(sumSq) || 1;
  return vec.map(v => v / norm);
}

function quantizeToInt8(vec: number[]): Int8Array {
  const int8 = new Int8Array(vec.length);
  for (let i = 0; i < vec.length; i++) {
    const val = Math.round(vec[i] * 127);
    int8[i] = Math.max(-127, Math.min(127, val));
  }
  return int8;
}

function cosineSimilarityInt8(a: Int8Array, b: Int8Array): number {
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  if (normA === 0 || normB === 0) return 0;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function embedTextsWithRetry(texts: string[], dim: number): Promise<number[][]> {
  const results: number[][] = [];
  const BATCH_SIZE = 100;

  for (let i = 0; i < texts.length; i += BATCH_SIZE) {
    const batch = texts.slice(i, i + BATCH_SIZE);
    let attempts = 0;
    let success = false;

    while (!success && attempts < 5) {
      try {
        attempts++;
        const res = await ai.models.embedContent({
          model: 'gemini-embedding-001',
          contents: batch,
          config: { outputDimensionality: dim },
        });

        if (!res.embeddings) throw new Error('No embeddings returned');
        for (const e of res.embeddings) {
          if (e.values) results.push(e.values);
        }
        success = true;
        await sleep(600); // polite rate spacing
      } catch (err: any) {
        if (err?.status === 429 || err?.message?.includes('429') || err?.message?.includes('RESOURCE_EXHAUSTED')) {
          console.log(`Rate limit reached, pausing 10s before retry (attempt ${attempts})...`);
          await sleep(10000);
        } else {
          throw err;
        }
      }
    }
  }
  return results;
}

async function main() {
  console.log('Building 2,000-record sample corpus with target records...');

  const quranAr = JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'quran_ar.json'), 'utf8')).quran;
  const bukhariAr = JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'hadith_bukhari_ar.json'), 'utf8')).hadiths;
  const bukhariEn = JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'hadith_bukhari_en.json'), 'utf8')).hadiths;
  const nawawiAr = JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'hadith_nawawi_ar.json'), 'utf8')).hadiths;

  const sampleItems: CorpusItem[] = [];
  const targetIds = new Set<string>();

  // 1. Bukhari 5590 (Ma'azif / Musical instruments)
  const b5590 = bukhariAr.find((h: any) => h.hadithnumber === 5590 || h.hadithnumber === '5590');
  if (b5590) {
    sampleItems.push({ id: 'bukhari:5590', lang: 'ar', text: b5590.text, hash: computeHash(b5590.text) });
    targetIds.add('bukhari:5590');
  }

  // 2. Surah Luqman 31:6 (Lahw al-Hadith)
  const luqman6 = quranAr.find((v: any) => v.chapter === 31 && v.verse === 6);
  if (luqman6) {
    sampleItems.push({ id: 'quran:31:6', lang: 'ar', text: luqman6.text, hash: computeHash(luqman6.text) });
    targetIds.add('quran:31:6');
  }

  // 3. Bukhari 1 (Innama al-a'mal bi-n-niyyat)
  const b1 = bukhariAr.find((h: any) => h.hadithnumber === 1 || h.hadithnumber === '1');
  if (b1) {
    sampleItems.push({ id: 'bukhari:1', lang: 'ar', text: b1.text, hash: computeHash(b1.text) });
    targetIds.add('bukhari:1');
  }

  // 4. Nawawi 1 (Nawawi 40 Hadith 1)
  const n1 = nawawiAr.find((h: any) => h.hadithnumber === 1 || h.hadithnumber === '1');
  if (n1) {
    sampleItems.push({ id: 'nawawi:1', lang: 'ar', text: n1.text, hash: computeHash(n1.text) });
    targetIds.add('nawawi:1');
  }

  // 5. Surah Ar-Rahman 55:13 (Fabi-ayyi ala'i rabbikuma tukadhdhiban)
  const rahman13 = quranAr.find((v: any) => v.chapter === 55 && v.verse === 13);
  if (rahman13) {
    sampleItems.push({ id: 'quran:55:13', lang: 'ar', text: rahman13.text, hash: computeHash(rahman13.text) });
    targetIds.add('quran:55:13');
  }

  // 6. English Bukhari 1
  const b1En = bukhariEn.find((h: any) => h.hadithnumber === 1 || h.hadithnumber === '1');
  if (b1En) {
    sampleItems.push({ id: 'bukhari:1:en', lang: 'en', text: b1En.text, hash: computeHash(b1En.text) });
    targetIds.add('bukhari:1:en');
  }

  // Add surrounding records from Quran and Hadith to make total ~2,000 records
  for (let i = 0; i < 1000 && sampleItems.length < 1000; i++) {
    const q = quranAr[i];
    const id = `quran:${q.chapter}:${q.verse}`;
    if (!targetIds.has(id)) {
      sampleItems.push({ id, lang: 'ar', text: q.text, hash: computeHash(q.text) });
    }
  }

  for (let i = 0; i < 1000 && sampleItems.length < 2000; i++) {
    const h = bukhariAr[i];
    const id = `bukhari:${h.hadithnumber}`;
    if (!targetIds.has(id)) {
      sampleItems.push({ id, lang: 'ar', text: h.text, hash: computeHash(h.text) });
    }
  }

  console.log(`Sample set prepared with ${sampleItems.length} records.`);

  const SANITY_QUERIES = [
    {
      label: '1. Synonym/Paraphrase: حكم الموسيقى والمعازف (Musical instruments)',
      query: 'ما حكم الموسيقى والغناء واستماع المعازف في الإسلام؟',
      expectedTargets: ['bukhari:5590', 'quran:31:6'],
    },
    {
      label: '2. Famous Hadith: إنما الأعمال بالنيات (Actions are by intentions)',
      query: 'إنما الأعمال بالنيات وإنما لكل امرئ ما نوى',
      expectedTargets: ['bukhari:1', 'nawawi:1'],
    },
    {
      label: '3. Quranic Verse: فبأي آلاء ربكما تكذبان (Surah Ar-Rahman)',
      query: 'فبأي آلاء ربكما تكذبان',
      expectedTargets: ['quran:55:13'],
    },
    {
      label: '4. Fabricated Saying: اطلبوا العلم ولو في الصين (Seek knowledge even in China)',
      query: 'هل ورد حديث اطلبوا العلم ولو في الصين؟',
      expectedTargets: [], // Should not match canonical hadiths
    },
    {
      label: '5. English Query: Actions are judged by intentions',
      query: 'Is there a hadith stating that actions are judged by intention?',
      expectedTargets: ['bukhari:1:en', 'bukhari:1'],
    },
  ];

  for (const dim of [256, 512]) {
    console.log(`\n============================================================`);
    console.log(`Running Sanity Benchmark at ${dim} Dimensions (L2-Normalized + Int8)`);
    console.log(`============================================================`);

    const startEmbed = Date.now();
    const texts = sampleItems.map(s => s.text);
    const rawVectors = await embedTextsWithRetry(texts, dim);
    console.log(`Successfully embedded ${rawVectors.length} records in ${Date.now() - startEmbed}ms.`);

    const int8Vectors: Int8Array[] = rawVectors.map(v => quantizeToInt8(l2Normalize(v)));

    // Embed queries
    const queryTexts = SANITY_QUERIES.map(q => q.query);
    const rawQueryVectors = await embedTextsWithRetry(queryTexts, dim);
    const queryInt8Vectors = rawQueryVectors.map(v => quantizeToInt8(l2Normalize(v)));

    // Evaluate each query
    for (let qIdx = 0; qIdx < SANITY_QUERIES.length; qIdx++) {
      const q = SANITY_QUERIES[qIdx];
      const qVec = queryInt8Vectors[qIdx];

      const scored = sampleItems.map((item, idx) => ({
        item,
        score: cosineSimilarityInt8(qVec, int8Vectors[idx]),
      }));

      scored.sort((a, b) => b.score - a.score);
      const topMatches = scored.slice(0, 3);

      console.log(`\nQuery: ${q.label}`);
      console.log(`Input: "${q.query}"`);
      console.log(`Expected Targets: ${q.expectedTargets.join(', ') || 'None (Fabricated claim)'}`);
      console.log(`Top 3 Results (Int8 Cosine Similarity):`);
      topMatches.forEach((m, rank) => {
        const isTarget = q.expectedTargets.includes(m.item.id);
        const marker = isTarget ? '🎯 [MATCH]' : '  ';
        console.log(
          `  #${rank + 1} ${marker} ID: ${m.item.id.padEnd(15)} Similarity: ${(m.score * 100).toFixed(1)}% | Text: ${m.item.text.slice(0, 80)}...`
        );
      });
    }
  }
}

main().catch(err => {
  console.error('Error during sanity benchmark:', err);
  process.exit(1);
});
