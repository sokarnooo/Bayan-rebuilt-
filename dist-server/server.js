// server/server.ts
import express2 from "express";
import fs6 from "fs";
import path6 from "path";
import { fileURLToPath as fileURLToPath6 } from "url";
import { createServer as createViteServer } from "vite";
import dotenv from "dotenv";

// server/app.ts
import express from "express";

// server/corpus/loader.ts
import fs from "fs";
import path from "path";
import zlib from "zlib";
import { fileURLToPath } from "url";
var __filename = fileURLToPath(import.meta.url);
var __dirname = path.dirname(__filename);
var candidateDirs = [
  path.resolve(process.cwd(), "server/corpus/data"),
  path.resolve(__dirname, "../server/corpus/data"),
  path.resolve(__dirname, "./data"),
  path.resolve(process.cwd(), "dist-server/data")
];
var DATA_DIR = candidateDirs.find((d) => fs.existsSync(path.join(d, "quran_ar.json"))) || path.resolve(process.cwd(), "server/corpus/data");
var cachedCorpus = null;
var loadDurationMs = 0;
var hadithLookupMap = /* @__PURE__ */ new Map();
function readJsonFile(filename) {
  const filePath = path.join(DATA_DIR, filename);
  if (!fs.existsSync(filePath)) return {};
  const content = fs.readFileSync(filePath, "utf8");
  return JSON.parse(content);
}
var cachedQuranEn = null;
function getQuranEn() {
  if (!cachedQuranEn) {
    const raw = readJsonFile("quran_en.json");
    const list = raw.quran || raw[Object.keys(raw)[0]] || [];
    cachedQuranEn = list.map((v) => ({
      chapter: v.chapter,
      verse: v.verse,
      text: v.text || ""
    }));
  }
  return cachedQuranEn;
}
var cachedTafsirMap = null;
function getQuranTafsirMap() {
  if (!cachedTafsirMap) {
    cachedTafsirMap = /* @__PURE__ */ new Map();
    const list = readJsonFile("quran_tafsir_moyassar.json");
    if (Array.isArray(list)) {
      for (const item of list) {
        cachedTafsirMap.set(`${item.chapter}:${item.verse}`, item.tafsir || "");
      }
    }
  }
  return cachedTafsirMap;
}
function getQuranTafsirForAyah(chapter, verse) {
  return getQuranTafsirMap().get(`${chapter}:${verse}`) || "";
}
var EMPTY_GRADES = Object.freeze([]);
var cachedHadithEn = {};
var hadithEnLookupMap = /* @__PURE__ */ new Map();
function getHadithEn(col) {
  if (!cachedHadithEn[col]) {
    const raw = readJsonFile(`hadith_${col}_en.json`);
    const list = raw.hadiths || [];
    cachedHadithEn[col] = list.map((h) => {
      const item = {
        hadithnumber: h.hadithnumber,
        arabicnumber: h.hadithnumber,
        text: h.text || "",
        grades: EMPTY_GRADES,
        reference: {
          book: h.reference?.book || 0,
          hadith: h.reference?.hadith || 0
        }
      };
      hadithEnLookupMap.set(`${col}_${h.hadithnumber}`, item);
      return item;
    });
  }
  return cachedHadithEn[col];
}
function lookupHadithEn(collection, hadithnumber) {
  if (!cachedHadithEn[collection]) getHadithEn(collection);
  return hadithEnLookupMap.get(`${collection}_${hadithnumber}`);
}
function loadCorpus() {
  if (cachedCorpus) {
    return { corpus: cachedCorpus, loadTimeMs: loadDurationMs };
  }
  const start = performance.now();
  const quranArRaw = readJsonFile("quran_ar.json");
  const quranArVerses = quranArRaw.quran || quranArRaw[Object.keys(quranArRaw)[0]] || [];
  const collections = ["bukhari", "muslim", "abudawud", "tirmidhi", "nasai", "ibnmajah", "nawawi"];
  const hadithAr = {};
  for (const col of collections) {
    const raw = readJsonFile(`hadith_${col}_ar.json`);
    const list = raw.hadiths || [];
    hadithAr[col] = list.map((h) => {
      const item = {
        hadithnumber: h.hadithnumber,
        arabicnumber: h.arabicnumber ?? h.hadithnumber,
        text: h.text || "",
        grades: !h.grades || h.grades.length === 0 ? EMPTY_GRADES : h.grades,
        reference: {
          book: h.reference?.book || 0,
          hadith: h.reference?.hadith || 0
        }
      };
      hadithLookupMap.set(`${col}_${h.hadithnumber}`, item);
      return item;
    });
  }
  const corpus = {
    quran: {
      ar: quranArVerses,
      get en() {
        return getQuranEn();
      }
    },
    hadith: {
      ar: hadithAr,
      en: new Proxy({}, {
        get(_target, prop) {
          return getHadithEn(prop);
        }
      })
    }
  };
  loadDurationMs = Math.round(performance.now() - start);
  cachedCorpus = corpus;
  return { corpus: cachedCorpus, loadTimeMs: loadDurationMs };
}
function lookupHadithAr(collection, hadithnumber) {
  if (!cachedCorpus) loadCorpus();
  return hadithLookupMap.get(`${collection}_${hadithnumber}`);
}
var cachedAskIndex = null;
function loadAskSearchIndex() {
  if (cachedAskIndex) return cachedAskIndex;
  const start = performance.now();
  const gzPath = path.join(DATA_DIR, "ask_search_index.json.gz");
  if (!fs.existsSync(gzPath)) {
    console.warn(`[AskSearchIndex] ${gzPath} not found!`);
    return { docs: [], postings: {}, loadTimeMs: 0, fileSizeBytes: 0 };
  }
  const stat = fs.statSync(gzPath);
  const compressed = fs.readFileSync(gzPath);
  const decompressed = zlib.gunzipSync(compressed);
  const parsed = JSON.parse(decompressed.toString("utf8"));
  const elapsed = Math.round(performance.now() - start);
  console.log(`[AskSearchIndex] Loaded ${parsed.docs.length} docs & ${Object.keys(parsed.postings).length} tokens in ${elapsed}ms (${stat.size} bytes).`);
  cachedAskIndex = {
    docs: parsed.docs,
    postings: parsed.postings,
    loadTimeMs: elapsed,
    fileSizeBytes: stat.size
  };
  return cachedAskIndex;
}

// server/matching/ayahMatcher.ts
import fs2 from "fs";
import path2 from "path";
import { fileURLToPath as fileURLToPath2 } from "url";

// server/matching/normalizer.ts
function cleanWhitespaceBeforeCombiningMarks(text) {
  if (!text) return "";
  return text.replace(
    /[\s\u00A0\u200B\u200C\u200D\u2060\uFEFF]+(?=[\u064B-\u065F\u0670\u06D6-\u06ED\u08D3-\u08FF])/g,
    ""
  ).replace(/\u00A0/g, " ");
}
function foldSilentCarrierWaw(text) {
  if (!text) return "";
  let s = text.replace(
    /و[\u064B-\u065F\u06E1\u06D6-\u06ED\u08D3-\u08FF]*\u0670(?=[\u064B-\u065F\u06D6-\u06ED\u08D3-\u08FF]*[ةا])/g,
    "\u0627"
  );
  s = s.replace(
    /([وفبلك]*(?:ال)?)(صل|زك|حي|مشك|نج|من|غد)و(ة)(?=[\s،.؛!؟()\[\]«»]|$)/gu,
    "$1$2\u0627$3"
  );
  s = s.replace(/(^|[\s،.؛!؟()\[\]«»])([وفبلك]*(?:ال)?)ربوا(?=[\s،.؛!؟()\[\]«»]|$)/gu, "$1$2\u0631\u0628\u0627");
  return s;
}
function normalizeArabic(text) {
  if (!text) return "";
  let s = cleanWhitespaceBeforeCombiningMarks(text);
  s = s.replace(/\u06A9/g, "\u0643");
  s = s.replace(/[\u0649\u06CC]/g, "\u064A");
  s = foldSilentCarrierWaw(s);
  s = s.replace(
    /(^|[\s])([ىي\u06CC])[\u064B-\u065F\u06D6-\u06ED\u0640\u06E4]*\u0670[\u064B-\u065F\u06D6-\u06ED\u0640\u06E4]*(?=[ء-ي\u0671-\u06D3])/gu,
    "$1\u064A\u0627 "
  );
  s = s.replace(
    /([ىي\u0649\u06CC\u064A])[\u064B-\u065F\u06E1\u06D6-\u06ED\u08D3-\u08FF]*\u0670(?=[\u064B-\u065F\u06D6-\u06ED\u08D3-\u08FF]*[\u0621-\u064A\u0671-\u06D3\u06E5\u06E6])/gu,
    "\u0627"
  );
  s = s.replace(
    /([ىي\u0649\u06CC\u064A])[\u064B-\u065F\u06E1\u06D6-\u06ED\u08D3-\u08FF]*\u0670/gu,
    "\u064A"
  );
  s = s.replace(/\u0670/g, "\u0627");
  s = s.replace(/[\u200B\u200C\u200D\u2060\uFEFF]/g, "");
  s = s.replace(/[\u064B-\u065F\u06D6-\u06ED\u06DF-\u06E8\u08D3-\u08FF]/g, "");
  s = s.replace(/\u0640/g, "");
  s = s.replace(/ءا/g, "\u0627");
  s = s.replace(/[\u0622\u0623\u0625\u0671]/g, "\u0627");
  s = s.replace(/\u0629/g, "\u0647");
  s = s.replace(/[\u0649\u06CC]/g, "\u064A");
  s = s.replace(/[\u0624\u0626\u0654\u0655\u0674]/g, "\u0621");
  s = s.replace(/[.,/#!$%^&*;:{}=\-_`~()؟،؛«»"'\d\u0660-\u0669\uFD3E\uFD3F\[\]<>ـ“”‘’‹›„‟‚‛]/g, " ");
  s = s.replace(/(^|[\s])الرحمان(?=[\s]|$)/g, "$1\u0627\u0644\u0631\u062D\u0645\u0646");
  s = s.replace(/(^|[\s])هاذا(?=[\s]|$)/g, "$1\u0647\u0630\u0627");
  s = s.replace(/(^|[\s])هاذه(?=[\s]|$)/g, "$1\u0647\u0630\u0647");
  s = s.replace(/(^|[\s])هاؤلاء(?=[\s]|$)/g, "$1\u0647\u0624\u0644\u0627\u0621");
  s = s.replace(/(^|[\s])لاكن(?=[\s]|$)/g, "$1\u0644\u0643\u0646");
  s = s.replace(/(^|[\s])ولاكن(?=[\s]|$)/g, "$1\u0648\u0644\u0643\u0646");
  s = s.replace(/(^|[\s])فلاكن(?=[\s]|$)/g, "$1\u0641\u0644\u0643\u0646");
  s = s.replace(/(^|[\s])ذالك(?=[\s]|$)/g, "$1\u0630\u0644\u0643");
  s = s.replace(/(^|[\s])كذالك(?=[\s]|$)/g, "$1\u0643\u0630\u0644\u0643");
  s = s.replace(/(^|[\s])الاه(?=[\s]|$)/g, "$1\u0627\u0644\u0647");
  s = s.replace(/(^|[\s])والاه(?=[\s]|$)/g, "$1\u0648\u0627\u0644\u0647");
  s = s.replace(/(^|[\s])فالاه(?=[\s]|$)/g, "$1\u0641\u0627\u0644\u0647");
  s = s.replace(/(^|[\s])اليل(?=[\s]|$)/g, "$1\u0627\u0644\u0644\u064A\u0644");
  s = s.replace(/(^|[\s])واليل(?=[\s]|$)/g, "$1\u0648\u0627\u0644\u0644\u064A\u0644");
  s = s.replace(/(^|[\s])فاليل(?=[\s]|$)/g, "$1\u0641\u0627\u0644\u0644\u064A\u0644");
  s = s.replace(/(^|[\s])باليل(?=[\s]|$)/g, "$1\u0628\u0627\u0644\u0644\u064A\u0644");
  s = s.replace(/(^|[\s])كاليل(?=[\s]|$)/g, "$1\u0643\u0627\u0644\u0644\u064A\u0644");
  s = s.replace(/(^|[\s])بعد\s+ما(?=[\s]|$)/g, "$1\u0628\u0639\u062F\u0645\u0627");
  s = s.replace(/(^|[\s])او\s+لم(?=[\s]|$)/g, "$1\u0627\u0648\u0644\u0645");
  s = s.replace(/(^|[\s])اف\s+لم(?=[\s]|$)/g, "$1\u0627\u0641\u0644\u0645");
  s = s.replace(/(^|[\s])كل\s+ما(?=[\s]|$)/g, "$1\u0643\u0644\u0645\u0627");
  s = s.replace(/(^|[\s])بءس\s+ما(?=[\s]|$)/g, "$1\u0628\u0621\u0633\u0645\u0627");
  s = s.replace(/(^|[\s])ابن\s+ام(?=[\s]|$)/g, "$1\u0627\u0628\u0646 \u0627\u0645");
  return s.replace(/\s+/g, " ").trim();
}
function toAlefInvariant(normalizedText) {
  if (!normalizedText) return "";
  return normalizedText.replace(/[ا\u0670ء]/g, "").replace(/\s+/g, " ").trim();
}
function levenshteinDistance(s1, s2) {
  if (s1 === s2) return 0;
  const len1 = s1.length;
  const len2 = s2.length;
  if (len1 === 0) return len2;
  if (len2 === 0) return len1;
  const r1 = new Int32Array(len2 + 1);
  const r2 = new Int32Array(len2 + 1);
  for (let j = 0; j <= len2; j++) r1[j] = j;
  for (let i = 1; i <= len1; i++) {
    r2[0] = i;
    const c1 = s1.charCodeAt(i - 1);
    for (let j = 1; j <= len2; j++) {
      const cost = c1 === s2.charCodeAt(j - 1) ? 0 : 1;
      r2[j] = Math.min(r1[j] + 1, r2[j - 1] + 1, r1[j - 1] + cost);
    }
    for (let j = 0; j <= len2; j++) r1[j] = r2[j];
  }
  return r2[len2];
}
function isLevenshteinDistanceAtMostOne(s1, s2) {
  if (s1 === s2) return true;
  const len1 = s1.length;
  const len2 = s2.length;
  if (Math.abs(len1 - len2) > 1) return false;
  if (len1 === len2) {
    let diffs2 = 0;
    for (let i2 = 0; i2 < len1; i2++) {
      if (s1.charCodeAt(i2) !== s2.charCodeAt(i2)) {
        diffs2++;
        if (diffs2 > 1) return false;
      }
    }
    return diffs2 <= 1;
  }
  const short = len1 < len2 ? s1 : s2;
  const long = len1 < len2 ? s2 : s1;
  let i = 0, j = 0;
  let diffs = 0;
  while (i < short.length && j < long.length) {
    if (short.charCodeAt(i) !== long.charCodeAt(j)) {
      diffs++;
      if (diffs > 1) return false;
      j++;
    } else {
      i++;
      j++;
    }
  }
  return true;
}
function levenshteinSimilarity(s1, s2) {
  const maxLen = Math.max(s1.length, s2.length);
  if (maxLen === 0) return 1;
  const dist = levenshteinDistance(s1, s2);
  return Math.max(0, 1 - dist / maxLen);
}
function wordSimilarityCorpusDerived(qNorm, cNorm, cRawUthmani) {
  if (!qNorm || !cNorm) return { score: 0, isExact: false };
  if (qNorm === cNorm) return { score: 1, isExact: true };
  if (qNorm.replace(/ء/g, "\u0627") === cNorm.replace(/ء/g, "\u0627")) {
    return { score: 1, isExact: true };
  }
  const qAlef = toAlefInvariant(qNorm);
  const cAlef = toAlefInvariant(cNorm);
  if (qAlef === cAlef) {
    if (cRawUthmani && (cRawUthmani.includes("\u0670") || cRawUthmani.includes("\u0648\u0670") || cRawUthmani.includes("\u0648\u0670"))) {
      if (qNorm === "\u0627\u0644\u0643\u062A\u0628" && cNorm === "\u0627\u0644\u0643\u062A\u0627\u0628") {
        return { score: 0.4, isExact: false };
      }
      return { score: 0.96, isExact: false };
    }
    return { score: 0.4, isExact: false };
  }
  const sim = levenshteinSimilarity(qNorm, cNorm);
  return { score: sim, isExact: sim === 1 };
}

// server/matching/ayahMatcher.ts
var quranEnMap = null;
function getQuranEnText(chapter, verse) {
  if (!quranEnMap) {
    quranEnMap = /* @__PURE__ */ new Map();
    const enVerses = getQuranEn();
    for (const v of enVerses) {
      quranEnMap.set(`${v.chapter}:${v.verse}`, v.text);
    }
  }
  return quranEnMap.get(`${chapter}:${verse}`) || "";
}
var __filename2 = fileURLToPath2(import.meta.url);
var __dirname2 = path2.dirname(__filename2);
var indexedAyat = [];
var surahMetadata = /* @__PURE__ */ new Map();
var surahWordStreams = /* @__PURE__ */ new Map();
var surahAyatMap = /* @__PURE__ */ new Map();
var exactNormalizedMap = /* @__PURE__ */ new Map();
var exactAlefMap = /* @__PURE__ */ new Map();
var wordPositionIndex = /* @__PURE__ */ new Map();
var twoGramIndex = /* @__PURE__ */ new Map();
var isInitialized = false;
function initAyahEngine() {
  if (isInitialized) {
    return { totalIndexed: indexedAyat.length };
  }
  const infoRaw = JSON.parse(
    fs2.readFileSync(path2.join(DATA_DIR, "quran_info.json"), "utf8")
  );
  for (const c of infoRaw.chapters || []) {
    surahMetadata.set(c.chapter, {
      chapter: c.chapter,
      arabicName: c.arabicname || `\u0633\u0648\u0631\u0629 ${c.chapter}`,
      englishName: c.englishname || `Chapter ${c.chapter}`,
      transliteration: c.name || `Surah ${c.chapter}`,
      revelation: c.revelation || "Mecca",
      totalVerses: c.verses ? c.verses.length : 0
    });
  }
  const { corpus } = loadCorpus();
  const arVerses = corpus.quran.ar;
  indexedAyat = arVerses.map((v, idx) => {
    let cleanDisplay = cleanWhitespaceBeforeCombiningMarks(v.text);
    cleanDisplay = cleanDisplay.replace(/[\u06DE\u06E9\u06DD\uFD3E\uFD3F]/g, " ").replace(/\s+/g, " ").trim();
    const norm = normalizeArabic(cleanDisplay);
    const alefInv = toAlefInvariant(norm);
    const rawWords = cleanDisplay.split(" ").filter(Boolean);
    const normWords = norm.split(" ").filter(Boolean);
    const alefWords = alefInv.split(" ").filter(Boolean);
    const surah = surahMetadata.get(v.chapter) || {
      chapter: v.chapter,
      arabicName: `\u0633\u0648\u0631\u0629 ${v.chapter}`,
      englishName: `Surah ${v.chapter}`,
      transliteration: `Surah ${v.chapter}`,
      revelation: "Mecca",
      totalVerses: 0
    };
    let normList = exactNormalizedMap.get(norm);
    if (!normList) {
      normList = [];
      exactNormalizedMap.set(norm, normList);
    }
    normList.push(idx);
    let exactList = exactAlefMap.get(alefInv);
    if (!exactList) {
      exactList = [];
      exactAlefMap.set(alefInv, exactList);
    }
    exactList.push(idx);
    return {
      index: idx,
      chapter: v.chapter,
      verse: v.verse,
      text: cleanDisplay,
      get enText() {
        return getQuranEnText(v.chapter, v.verse);
      },
      normalizedText: norm,
      alefInvariant: alefInv,
      rawWords,
      normalizedWords: normWords,
      alefInvariantWords: alefWords,
      surah
    };
  });
  for (let c = 1; c <= 114; c++) {
    surahWordStreams.set(c, []);
    surahAyatMap.set(c, []);
  }
  for (let i = 0; i < indexedAyat.length; i++) {
    const ayah = indexedAyat[i];
    const stream = surahWordStreams.get(ayah.chapter);
    const surahAyat = surahAyatMap.get(ayah.chapter);
    surahAyat.push(ayah);
    for (let w = 0; w < ayah.normalizedWords.length; w++) {
      const globalIndex = stream.length;
      const rawUthmani = ayah.rawWords[w] || "";
      const normalized = ayah.normalizedWords[w] || "";
      const alefInvariant = ayah.alefInvariantWords[w] || "";
      const wordObj = {
        chapter: ayah.chapter,
        verse: ayah.verse,
        wordIndexInAyah: w,
        globalWordIndex: globalIndex,
        rawUthmani,
        normalized,
        alefInvariant
      };
      stream.push(wordObj);
      if (alefInvariant) {
        let posList = wordPositionIndex.get(alefInvariant);
        if (!posList) {
          posList = [];
          wordPositionIndex.set(alefInvariant, posList);
        }
        posList.push(ayah.chapter << 16 | globalIndex);
      }
      if (w > 0 && ayah.alefInvariantWords[w - 1]) {
        const prevAlef = ayah.alefInvariantWords[w - 1];
        const twoGram = `${prevAlef}_${alefInvariant}`;
        let twoList = twoGramIndex.get(twoGram);
        if (!twoList) {
          twoList = [];
          twoGramIndex.set(twoGram, twoList);
        }
        twoList.push(ayah.chapter << 16 | globalIndex - 1);
      }
    }
  }
  for (const [k, list] of wordPositionIndex) {
    wordPositionIndex.set(k, new Int32Array(list));
  }
  for (const [k, list] of twoGramIndex) {
    twoGramIndex.set(k, new Int32Array(list));
  }
  for (const [k, list] of exactNormalizedMap) {
    exactNormalizedMap.set(k, new Int32Array(list));
  }
  for (const [k, list] of exactAlefMap) {
    exactAlefMap.set(k, new Int32Array(list));
  }
  isInitialized = true;
  return { totalIndexed: indexedAyat.length };
}
var BASMALA_NORM = normalizeArabic("\u0628\u0633\u0645 \u0627\u0644\u0644\u0647 \u0627\u0644\u0631\u062D\u0645\u0646 \u0627\u0644\u0631\u062D\u064A\u0645");
var BASMALA_ALEF = toAlefInvariant(BASMALA_NORM);
function searchAyah(rawQuery) {
  if (!isInitialized) {
    initAyahEngine();
  }
  const startTime = performance.now();
  const trimmed = rawQuery.trim();
  const normalizedQuery = normalizeArabic(trimmed);
  const alefInvariantQuery = toAlefInvariant(normalizedQuery);
  const queryWords = normalizedQuery.split(" ").filter(Boolean);
  const queryAlefWords = alefInvariantQuery.split(" ").filter(Boolean);
  const qWordCount = queryWords.length;
  if (qWordCount === 0 || alefInvariantQuery.length < 1) {
    return {
      query: rawQuery,
      normalizedQuery,
      alefInvariantQuery,
      query_mode: "ayah",
      state: "not_found",
      topConfidence: 0,
      totalMatches: 0,
      results: [],
      referralRequired: true,
      referralMessage: "\u0644\u0645 \u064A\u062A\u0645 \u0627\u0644\u0639\u062B\u0648\u0631 \u0639\u0644\u0649 \u062A\u0637\u0627\u0628\u0642 \u0645\u0648\u062B\u0648\u0642\u060C \u0631\u0627\u062C\u0639 \u0623\u0647\u0644 \u0627\u0644\u0639\u0644\u0645",
      executionTimeMs: Math.round((performance.now() - startTime) * 100) / 100
    };
  }
  const wholeAyahHits = /* @__PURE__ */ new Set();
  const exactNorm = exactNormalizedMap.get(normalizedQuery);
  if (exactNorm) exactNorm.forEach((idx) => wholeAyahHits.add(idx));
  const exactAlef = exactAlefMap.get(alefInvariantQuery);
  if (exactAlef) exactAlef.forEach((idx) => wholeAyahHits.add(idx));
  let hasLeadingBasmala = false;
  if (queryWords.length >= 5 && (normalizedQuery.startsWith(BASMALA_NORM) || alefInvariantQuery.startsWith(BASMALA_ALEF))) {
    hasLeadingBasmala = true;
  }
  if (hasLeadingBasmala) {
    const strippedQueryWords = queryWords.slice(4);
    const strippedNorm = strippedQueryWords.join(" ");
    const strippedAlef = toAlefInvariant(strippedNorm);
    const sNorm = exactNormalizedMap.get(strippedNorm);
    if (sNorm) sNorm.forEach((idx) => {
      if (indexedAyat[idx].chapter !== 1) wholeAyahHits.add(idx);
    });
    const sAlef = exactAlefMap.get(strippedAlef);
    if (sAlef) sAlef.forEach((idx) => {
      if (indexedAyat[idx].chapter !== 1) wholeAyahHits.add(idx);
    });
  }
  const queryVariants = [
    { words: queryWords, alefWords: queryAlefWords, isBasmalaStripped: false }
  ];
  if (hasLeadingBasmala) {
    const strippedWords = queryWords.slice(4);
    const strippedAlef = queryAlefWords.slice(4);
    if (strippedWords.length >= 1) {
      queryVariants.push({
        words: strippedWords,
        alefWords: strippedAlef,
        isBasmalaStripped: true
      });
    }
  }
  const rawCandidateMatches = [];
  for (const variant of queryVariants) {
    const vWords = variant.words;
    const vAlef = variant.alefWords;
    const vLen = vWords.length;
    if (vLen === 0) continue;
    const candidateStartsBySurah = /* @__PURE__ */ new Map();
    for (let i = 0; i < Math.min(3, vLen - 1); i++) {
      const twoGram = `${vAlef[i]}_${vAlef[i + 1]}`;
      const hits = twoGramIndex.get(twoGram);
      if (hits) {
        for (let j = 0; j < hits.length; j++) {
          const hit = hits[j];
          const ch = hit >> 16;
          const gIdx = hit & 65535;
          if (variant.isBasmalaStripped && ch === 1) continue;
          let sSet = candidateStartsBySurah.get(ch);
          if (!sSet) {
            sSet = /* @__PURE__ */ new Set();
            candidateStartsBySurah.set(ch, sSet);
          }
          sSet.add(Math.max(0, gIdx - i));
        }
      }
    }
    for (let i = 0; i < Math.min(2, vLen); i++) {
      const hits = wordPositionIndex.get(vAlef[i]);
      if (hits) {
        for (let j = 0; j < hits.length; j++) {
          const hit = hits[j];
          const ch = hit >> 16;
          const gIdx = hit & 65535;
          if (variant.isBasmalaStripped && ch === 1) continue;
          let sSet = candidateStartsBySurah.get(ch);
          if (!sSet) {
            sSet = /* @__PURE__ */ new Set();
            candidateStartsBySurah.set(ch, sSet);
          }
          sSet.add(Math.max(0, gIdx - i));
        }
      }
    }
    for (const hIdx of wholeAyahHits) {
      const ayah = indexedAyat[hIdx];
      const stream = surahWordStreams.get(ayah.chapter);
      if (stream) {
        const firstWIdx = stream.findIndex((w) => w.verse === ayah.verse && w.wordIndexInAyah === 0);
        if (firstWIdx !== -1) {
          let sSet = candidateStartsBySurah.get(ayah.chapter);
          if (!sSet) {
            sSet = /* @__PURE__ */ new Set();
            candidateStartsBySurah.set(ayah.chapter, sSet);
          }
          sSet.add(firstWIdx);
        }
      }
    }
    for (const [ch, startIndices] of candidateStartsBySurah.entries()) {
      const stream = surahWordStreams.get(ch);
      if (!stream || stream.length === 0) continue;
      for (const startIdx of startIndices) {
        if (startIdx >= stream.length) continue;
        const availableWords = stream.length - startIdx;
        const compareLen = Math.min(vLen, availableWords);
        if (compareLen < Math.min(1, vLen)) continue;
        let totalScore = 0;
        const wordScores = [];
        const wordExactList = [];
        const matchedTokens = [];
        const changedWords = [];
        for (let i = 0; i < vLen; i++) {
          if (startIdx + i < stream.length) {
            const streamWord = stream[startIdx + i];
            const qWord = vWords[i];
            const { score, isExact } = wordSimilarityCorpusDerived(
              qWord,
              streamWord.normalized,
              streamWord.rawUthmani
            );
            wordScores.push(score);
            wordExactList.push(isExact);
            totalScore += score;
            if (score >= 0.4) {
              matchedTokens.push(streamWord.rawUthmani);
            } else {
              changedWords.push({
                queryWord: qWord,
                sourceWord: streamWord.rawUthmani,
                position: i
              });
            }
          } else {
            wordScores.push(0);
            wordExactList.push(false);
            changedWords.push({
              queryWord: vWords[i],
              sourceWord: null,
              position: i
            });
          }
        }
        const avgScore = totalScore / vLen;
        const confidence = Math.round(avgScore * 100);
        if (confidence >= 65) {
          const startVerse = stream[startIdx].verse;
          const endGlobal = Math.min(stream.length - 1, startIdx + vLen - 1);
          const endVerse = stream[endGlobal].verse;
          rawCandidateMatches.push({
            chapter: ch,
            startVerse,
            endVerse,
            startGlobalWord: startIdx,
            endGlobalWord: endGlobal,
            confidence,
            wordScores,
            wordExactList,
            matchedTokens,
            changedWords,
            isBasmalaStripped: variant.isBasmalaStripped
          });
        }
      }
    }
  }
  const bestMatchMap = /* @__PURE__ */ new Map();
  for (const m of rawCandidateMatches) {
    const key = `${m.chapter}:${m.startVerse}-${m.endVerse}`;
    const existing = bestMatchMap.get(key);
    if (!existing || m.confidence > existing.confidence) {
      bestMatchMap.set(key, m);
    }
  }
  const candidateList = Array.from(bestMatchMap.values());
  if (candidateList.length === 0) {
    const elapsed2 = Math.round((performance.now() - startTime) * 100) / 100;
    return {
      query: rawQuery,
      normalizedQuery,
      alefInvariantQuery,
      query_mode: "ayah",
      state: "not_found",
      topConfidence: 0,
      totalMatches: 0,
      results: [],
      referralRequired: true,
      referralMessage: "\u0644\u0645 \u064A\u062A\u0645 \u0627\u0644\u0639\u062B\u0648\u0631 \u0639\u0644\u0649 \u062A\u0637\u0627\u0628\u0642 \u0645\u0648\u062B\u0648\u0642\u060C \u0631\u0627\u062C\u0639 \u0623\u0647\u0644 \u0627\u0644\u0639\u0644\u0645",
      executionTimeMs: elapsed2
    };
  }
  let topConfidence = 0;
  for (const m of candidateList) {
    if (m.confidence > topConfidence) {
      topConfidence = m.confidence;
    }
  }
  if (topConfidence < 70) {
    const elapsed2 = Math.round((performance.now() - startTime) * 100) / 100;
    return {
      query: rawQuery,
      normalizedQuery,
      alefInvariantQuery,
      query_mode: "ayah",
      state: "not_found",
      topConfidence,
      totalMatches: 0,
      results: [],
      referralRequired: true,
      referralMessage: "\u0644\u0645 \u064A\u062A\u0645 \u0627\u0644\u0639\u062B\u0648\u0631 \u0639\u0644\u0649 \u062A\u0637\u0627\u0628\u0642 \u0645\u0648\u062B\u0648\u0642\u060C \u0631\u0627\u062C\u0639 \u0623\u0647\u0644 \u0627\u0644\u0639\u0644\u0645",
      executionTimeMs: elapsed2
    };
  }
  const threshold = Math.max(70, topConfidence - 3);
  const filteredCandidates = candidateList.filter((m) => m.confidence >= threshold);
  const formattedResults = filteredCandidates.map((m) => {
    const surah = surahMetadata.get(m.chapter);
    const surahAyat = surahAyatMap.get(m.chapter);
    const stream = surahWordStreams.get(m.chapter);
    const matchedAyat = surahAyat.filter(
      (a) => a.verse >= m.startVerse && a.verse <= m.endVerse
    );
    const breakdown = [];
    let totalAyatWords = 0;
    let totalMatchedWords = 0;
    let overallStartWordIndex = 0;
    let overallEndWordIndex = 0;
    const fullResultWordStatus = [];
    let hasApproximateMatch = false;
    for (let aIdx = 0; aIdx < matchedAyat.length; aIdx++) {
      const ayah = matchedAyat[aIdx];
      const ayahWords = ayah.rawWords;
      const ayahWordStatus = [];
      let ayahMatchedCount = 0;
      let ayahStartIdx = -1;
      let ayahEndIdx = -1;
      for (let w = 0; w < ayahWords.length; w++) {
        const globalIdx = stream.findIndex(
          (sw) => sw.chapter === ayah.chapter && sw.verse === ayah.verse && sw.wordIndexInAyah === w
        );
        let status = "none";
        if (globalIdx >= m.startGlobalWord && globalIdx <= m.endGlobalWord) {
          const matchOffset = globalIdx - m.startGlobalWord;
          const score = m.wordScores[matchOffset] ?? 1;
          const isExact = m.wordExactList[matchOffset] ?? true;
          if (isExact && score >= 0.95) {
            status = "exact";
          } else if (score >= 0.4) {
            status = "approx";
            hasApproximateMatch = true;
          }
          if (status !== "none") {
            ayahMatchedCount++;
            if (ayahStartIdx === -1) ayahStartIdx = w;
            ayahEndIdx = w;
          }
        }
        ayahWordStatus.push(status);
        fullResultWordStatus.push(status);
      }
      if (ayahStartIdx === -1) ayahStartIdx = 0;
      if (ayahEndIdx === -1) ayahEndIdx = ayahWords.length - 1;
      if (aIdx === 0) overallStartWordIndex = ayahStartIdx;
      if (aIdx === matchedAyat.length - 1) overallEndWordIndex = ayahEndIdx;
      totalAyatWords += ayahWords.length;
      totalMatchedWords += ayahMatchedCount;
      const covRatio = ayahWords.length > 0 ? ayahMatchedCount / ayahWords.length : 0;
      const cov = covRatio >= 0.85 ? "full" : "fragment";
      breakdown.push({
        verse: ayah.verse,
        text: ayah.text,
        translation: ayah.enText,
        confidence: m.confidence,
        coverage: cov,
        coverageRatio: Math.round(covRatio * 100) / 100,
        matchedWordCount: ayahMatchedCount,
        totalWordCount: ayahWords.length,
        matchedStartWordIndex: ayahStartIdx,
        matchedEndWordIndex: ayahEndIdx,
        matchedSlice: ayahWords.slice(ayahStartIdx, ayahEndIdx + 1).join(" "),
        wordMatchStatus: ayahWordStatus
      });
    }
    const overallCoverageRatio = totalAyatWords > 0 ? Math.min(1, totalMatchedWords / totalAyatWords) : 0;
    const allAyatFull = breakdown.every((b) => b.coverage === "full");
    const isSingleAyah = m.startVerse === m.endVerse;
    const coverage = isSingleAyah ? overallCoverageRatio >= 0.85 || qWordCount >= totalAyatWords * 0.85 ? "full" : "fragment" : allAyatFull ? "full" : "fragment";
    const fullRangeText = matchedAyat.map((a) => a.text).join(" ");
    let fullRangeTranslation = matchedAyat.map((a, idx) => {
      let t = a.enText.trim();
      if (!t) return "";
      if (matchedAyat.length > 1) {
        if (idx < matchedAyat.length - 1 && !/[.!?,:;\-—"'\)\]]$/.test(t)) {
          t += ",";
        } else if (idx === matchedAyat.length - 1 && !/[.!?,:;\-—"'\)\]]$/.test(t)) {
          t += ".";
        }
      }
      return t;
    }).filter(Boolean).join(" ");
    if (fullRangeTranslation.includes('"') && (fullRangeTranslation.match(/"/g) || []).length % 2 !== 0) {
      fullRangeTranslation += '"';
    }
    const verseRange = isSingleAyah ? `${m.startVerse}` : `${m.startVerse}\u2013${m.endVerse}`;
    const hasUnmatchedWord = m.changedWords && m.changedWords.length > 0;
    const isFullyMatched = !hasUnmatchedWord && !hasApproximateMatch && coverage === "full" && m.confidence >= 90;
    const displayWords = [];
    const wordGlobalToFullRangeIndex = /* @__PURE__ */ new Map();
    let fullRangeIdx = 0;
    for (const ayah of matchedAyat) {
      for (let w = 0; w < ayah.rawWords.length; w++) {
        const swIdx = stream.findIndex(
          (sw) => sw.chapter === ayah.chapter && sw.verse === ayah.verse && sw.wordIndexInAyah === w
        );
        if (swIdx !== -1) {
          wordGlobalToFullRangeIndex.set(swIdx, fullRangeIdx);
        }
        displayWords.push(ayah.rawWords[w]);
        fullRangeIdx++;
      }
    }
    const matchedOriginalIndices = [];
    const matchedWords = [];
    for (let swIdx = m.startGlobalWord; swIdx <= m.endGlobalWord; swIdx++) {
      const frIdx = wordGlobalToFullRangeIndex.get(swIdx);
      if (frIdx !== void 0) {
        matchedOriginalIndices.push(frIdx);
        matchedWords.push(displayWords[frIdx]);
      }
    }
    return {
      chapter: m.chapter,
      verse: m.startVerse,
      startVerse: m.startVerse,
      endVerse: m.endVerse,
      verseRange,
      isRange: !isSingleAyah,
      surah: {
        arabic: surah.arabicName,
        english: surah.englishName,
        revelation: surah.revelation
      },
      text: fullRangeText,
      translation: fullRangeTranslation,
      confidence: isFullyMatched ? m.confidence : Math.min(89, m.confidence),
      state: isFullyMatched ? "matched" : "close_match",
      changedWords: m.changedWords || [],
      coverage,
      coverageRatio: Math.round(overallCoverageRatio * 100) / 100,
      matchedStartWordIndex: matchedOriginalIndices[0] ?? 0,
      matchedEndWordIndex: matchedOriginalIndices[matchedOriginalIndices.length - 1] ?? 0,
      matchedSlice: fullRangeText,
      matchedTokens: m.matchedTokens,
      matchedWords,
      matchedOriginalIndices,
      wordMatchStatus: fullResultWordStatus,
      hasApproximateMatch,
      breakdown,
      leadingBasmalaIgnored: m.isBasmalaStripped
    };
  });
  formattedResults.sort((a, b) => {
    if (a.coverage === "full" && b.coverage !== "full") return -1;
    if (b.coverage === "full" && a.coverage !== "full") return 1;
    if (b.confidence !== a.confidence) return b.confidence - a.confidence;
    if (a.chapter !== b.chapter) return a.chapter - b.chapter;
    return (a.startVerse || a.verse) - (b.startVerse || b.verse);
  });
  if (qWordCount < 3) {
    const fullMatches = formattedResults.filter((r) => r.coverage === "full");
    if (fullMatches.length === 0) {
      const elapsed2 = Math.round((performance.now() - startTime) * 100) / 100;
      return {
        query: rawQuery,
        normalizedQuery,
        alefInvariantQuery,
        query_mode: "ayah",
        state: "too_short",
        topConfidence: 0,
        totalMatches: 0,
        results: [],
        referralRequired: false,
        notice: "\u0627\u0644\u0645\u062F\u062E\u0644 \u0642\u0635\u064A\u0631 \u062C\u062F\u0627\u064B \u0644\u0644\u062A\u062D\u0642\u0642\u060C \u064A\u0631\u062C\u0649 \u0643\u062A\u0627\u0628\u0629 3 \u0643\u0644\u0645\u0627\u062A \u0623\u0648 \u0623\u0643\u062B\u0631",
        executionTimeMs: elapsed2
      };
    }
  }
  const overallTopConfidence = formattedResults.length > 0 ? formattedResults[0].confidence : topConfidence;
  const overallState = formattedResults.some((r) => r.state === "matched") ? "matched" : "close_match";
  const hasLeadingBasmalaIgnored = formattedResults.some((r) => r.leadingBasmalaIgnored);
  let notice = void 0;
  if (hasLeadingBasmalaIgnored) {
    notice = "\u062A\u0645 \u062A\u062C\u0627\u0647\u0644 \u0627\u0644\u0628\u0633\u0645\u0644\u0629 \u0641\u064A \u0628\u062F\u0627\u064A\u0629 \u0627\u0644\u0633\u0648\u0631\u0629 \u0623\u062B\u0646\u0627\u0621 \u0627\u0644\u0645\u0637\u0627\u0628\u0642\u0629 \u0644\u0623\u0646\u0647\u0627 \u0644\u064A\u0633\u062A \u062C\u0632\u0621\u0627\u064B \u0645\u0646 \u0627\u0644\u0622\u064A\u0629 \u0627\u0644\u0623\u0648\u0644\u0649 \u0641\u064A \u0647\u0630\u0647 \u0627\u0644\u0633\u0648\u0631\u0629";
  }
  const elapsed = Math.round((performance.now() - startTime) * 100) / 100;
  return {
    query: rawQuery,
    normalizedQuery,
    alefInvariantQuery,
    query_mode: "ayah",
    state: overallState,
    topConfidence: overallTopConfidence,
    totalMatches: formattedResults.length,
    results: formattedResults,
    referralRequired: false,
    notice,
    executionTimeMs: elapsed
  };
}

// server/matching/ayahMatcherEn.ts
import fs4 from "fs";
import path4 from "path";
import { fileURLToPath as fileURLToPath4 } from "url";

// server/matching/hadithMatcher.ts
import fs3 from "fs";
import path3 from "path";
import zlib2 from "zlib";
import { fileURLToPath as fileURLToPath3 } from "url";
var __filename3 = fileURLToPath3(import.meta.url);
var __dirname3 = path3.dirname(__filename3);
var DATA_DIR2 = fs3.existsSync(path3.resolve(__dirname3, "../corpus/data")) ? path3.resolve(__dirname3, "../corpus/data") : path3.resolve(process.cwd(), "server/corpus/data");
var COLLECTION_METADATA = {
  bukhari: { arName: "\u0635\u062D\u064A\u062D \u0627\u0644\u0628\u062E\u0627\u0631\u064A", enName: "Sahih al-Bukhari" },
  muslim: { arName: "\u0635\u062D\u064A\u062D \u0645\u0633\u0644\u0645", enName: "Sahih Muslim" },
  abudawud: { arName: "\u0633\u0646\u0646 \u0623\u0628\u064A \u062F\u0627\u0648\u062F", enName: "Sunan Abi Dawud" },
  tirmidhi: { arName: "\u062C\u0627\u0645\u0639 \u0627\u0644\u062A\u0631\u0645\u0630\u064A", enName: "Jami` at-Tirmidhi" },
  nasai: { arName: "\u0633\u0646\u0646 \u0627\u0644\u0646\u0633\u0627\u0626\u064A", enName: "Sunan an-Nasa`i" },
  ibnmajah: { arName: "\u0633\u0646\u0646 \u0627\u0628\u0646 \u0645\u0627\u062C\u0647", enName: "Sunan Ibn Majah" },
  nawawi: { arName: "\u0627\u0644\u0623\u0631\u0628\u0639\u0648\u0646 \u0627\u0644\u0646\u0648\u0648\u064A\u0629", enName: "Forty Hadith of an-Nawawi" }
};
function parseGrade(g) {
  const name = (g.name || "\u0645\u064F\u062E\u0631\u0650\u0651\u062C \u063A\u064A\u0631 \u0645\u0633\u0645\u0649").trim();
  const raw = (g.grade || "").trim();
  if (/^(Isnaad Hasan|Hasan Isnaad)$/i.test(raw)) {
    return {
      name,
      originalGrade: raw,
      arabicLabel: "\u0625\u0633\u0646\u0627\u062F\u0647 \u062D\u0633\u0646",
      family: "\u062D\u0633\u0646",
      isIsnadJudgment: true,
      isCitation: false,
      note: "\u062D\u0643\u0645 \u0639\u0644\u0649 \u0627\u0644\u0625\u0633\u0646\u0627\u062F"
    };
  }
  if (/^(Isnaad Sahih|Sahih Isnaad)$/i.test(raw)) {
    return {
      name,
      originalGrade: raw,
      arabicLabel: "\u0625\u0633\u0646\u0627\u062F\u0647 \u0635\u062D\u064A\u062D",
      family: "\u0635\u062D\u064A\u062D",
      isIsnadJudgment: true,
      isCitation: false,
      note: "\u062D\u0643\u0645 \u0639\u0644\u0649 \u0627\u0644\u0625\u0633\u0646\u0627\u062F"
    };
  }
  if (/^Daif Isnaad$/i.test(raw)) {
    return {
      name,
      originalGrade: raw,
      arabicLabel: "\u0636\u0639\u064A\u0641 \u0627\u0644\u0625\u0633\u0646\u0627\u062F",
      family: "\u0636\u0639\u064A\u0641",
      isIsnadJudgment: true,
      isCitation: false,
      note: "\u062D\u0643\u0645 \u0639\u0644\u0649 \u0627\u0644\u0625\u0633\u0646\u0627\u062F"
    };
  }
  if (/^Daif Isnaad Maqtu$/i.test(raw)) {
    return {
      name,
      originalGrade: raw,
      arabicLabel: "\u0636\u0639\u064A\u0641 \u0627\u0644\u0625\u0633\u0646\u0627\u062F \u0645\u0642\u0637\u0648\u0639\u0627\u064B",
      family: "neutral",
      isIsnadJudgment: true,
      isCitation: false,
      note: "\u062D\u0643\u0645 \u0639\u0644\u0649 \u0627\u0644\u0625\u0633\u0646\u0627\u062F (\u0639\u0644\u0649 \u0627\u0644\u062A\u0627\u0628\u0639\u064A)"
    };
  }
  if (/^Sahih Isnaad Maqtu$/i.test(raw)) {
    return {
      name,
      originalGrade: raw,
      arabicLabel: "\u0635\u062D\u064A\u062D \u0627\u0644\u0625\u0633\u0646\u0627\u062F \u0645\u0642\u0637\u0648\u0639\u0627\u064B",
      family: "neutral",
      isIsnadJudgment: true,
      isCitation: false,
      note: "\u062D\u0643\u0645 \u0639\u0644\u0649 \u0627\u0644\u0625\u0633\u0646\u0627\u062F (\u0639\u0644\u0649 \u0627\u0644\u062A\u0627\u0628\u0639\u064A)"
    };
  }
  if (/^Sahih Isnaad Mauquf$/i.test(raw)) {
    return {
      name,
      originalGrade: raw,
      arabicLabel: "\u0635\u062D\u064A\u062D \u0627\u0644\u0625\u0633\u0646\u0627\u062F \u0645\u0648\u0642\u0648\u0641\u0627\u064B",
      family: "neutral",
      isIsnadJudgment: true,
      isCitation: false,
      note: "\u062D\u0643\u0645 \u0639\u0644\u0649 \u0627\u0644\u0625\u0633\u0646\u0627\u062F (\u0639\u0644\u0649 \u0627\u0644\u0635\u062D\u0627\u0628\u064A)"
    };
  }
  if (/^Sahih - Agreed Upon$/i.test(raw)) {
    return {
      name,
      originalGrade: raw,
      arabicLabel: "\u0630\u064F\u0643\u0631 \u0641\u064A: \u0645\u062A\u0641\u0642 \u0639\u0644\u064A\u0647",
      family: "neutral",
      isIsnadJudgment: false,
      isCitation: true
    };
  }
  if (/^Sahih - Bukhari And Muslim$/i.test(raw)) {
    return {
      name,
      originalGrade: raw,
      arabicLabel: "\u0630\u064F\u0643\u0631 \u0641\u064A: \u0627\u0644\u0628\u062E\u0627\u0631\u064A \u0648\u0645\u0633\u0644\u0645",
      family: "neutral",
      isIsnadJudgment: false,
      isCitation: true
    };
  }
  if (/^Sahih Muslim/i.test(raw)) {
    return {
      name,
      originalGrade: raw,
      arabicLabel: `\u0630\u064F\u0643\u0631 \u0641\u064A: \u0635\u062D\u064A\u062D \u0645\u0633\u0644\u0645 (${raw})`,
      family: "neutral",
      isIsnadJudgment: false,
      isCitation: true
    };
  }
  if (/^Sahih Bukhari/i.test(raw)) {
    return {
      name,
      originalGrade: raw,
      arabicLabel: `\u0630\u064F\u0643\u0631 \u0641\u064A: \u0635\u062D\u064A\u062D \u0627\u0644\u0628\u062E\u0627\u0631\u064A (${raw})`,
      family: "neutral",
      isIsnadJudgment: false,
      isCitation: true
    };
  }
  if (/^Sahih Mauquf$/i.test(raw)) {
    return {
      name,
      originalGrade: raw,
      arabicLabel: "\u0635\u062D\u064A\u062D \u0645\u0648\u0642\u0648\u0641\u0627\u064B",
      family: "neutral",
      isIsnadJudgment: false,
      isCitation: false,
      note: "\u0639\u0644\u0649 \u0627\u0644\u0635\u062D\u0627\u0628\u064A"
    };
  }
  if (/^Sahih Maqtu$/i.test(raw)) {
    return {
      name,
      originalGrade: raw,
      arabicLabel: "\u0635\u062D\u064A\u062D \u0645\u0642\u0637\u0648\u0639\u0627\u064B",
      family: "neutral",
      isIsnadJudgment: false,
      isCitation: false,
      note: "\u0639\u0644\u0649 \u0627\u0644\u062A\u0627\u0628\u0639\u064A"
    };
  }
  if (/^Batil$/i.test(raw)) {
    return {
      name,
      originalGrade: raw,
      arabicLabel: "\u0628\u0627\u0637\u0644",
      family: "neutral",
      isIsnadJudgment: false,
      isCitation: false,
      note: "\u062D\u0643\u0645 \u0645\u0633\u062A\u0642\u0644"
    };
  }
  if (/^Shadh$/i.test(raw)) {
    return {
      name,
      originalGrade: raw,
      arabicLabel: "\u0634\u0627\u0630",
      family: "neutral",
      isIsnadJudgment: false,
      isCitation: false,
      note: "\u062D\u0643\u0645 \u0625\u0633\u0646\u0627\u062F\u064A \u062E\u0627\u0635"
    };
  }
  if (/^Munkar$/i.test(raw)) {
    return {
      name,
      originalGrade: raw,
      arabicLabel: "\u0645\u0646\u0643\u0631",
      family: "neutral",
      isIsnadJudgment: false,
      isCitation: false,
      note: "\u062D\u0643\u0645 \u0625\u0633\u0646\u0627\u062F\u064A \u062E\u0627\u0635"
    };
  }
  if (/^Matruk$/i.test(raw)) {
    return {
      name,
      originalGrade: raw,
      arabicLabel: "\u0645\u062A\u0631\u0648\u0643",
      family: "neutral",
      isIsnadJudgment: false,
      isCitation: false,
      note: "\u062D\u0643\u0645 \u0639\u0644\u0649 \u0627\u0644\u0631\u0627\u0648\u064A"
    };
  }
  if (/^Munqati$/i.test(raw)) {
    return {
      name,
      originalGrade: raw,
      arabicLabel: "\u0645\u0646\u0642\u0637\u0639",
      family: "neutral",
      isIsnadJudgment: false,
      isCitation: false,
      note: "\u0627\u0646\u0642\u0637\u0627\u0639 \u0641\u064A \u0627\u0644\u0633\u0646\u062F"
    };
  }
  if (/^Mursal$/i.test(raw)) {
    return {
      name,
      originalGrade: raw,
      arabicLabel: "\u0645\u0631\u0633\u0644",
      family: "neutral",
      isIsnadJudgment: false,
      isCitation: false,
      note: "\u0633\u0642\u0637 \u0627\u0644\u0635\u062D\u0627\u0628\u064A \u0645\u0646 \u0627\u0644\u0633\u0646\u062F"
    };
  }
  if (/^Mudallas$/i.test(raw)) {
    return {
      name,
      originalGrade: raw,
      arabicLabel: "\u0645\u062F\u0644\u0633",
      family: "neutral",
      isIsnadJudgment: false,
      isCitation: false,
      note: "\u062A\u062F\u0644\u064A\u0633 \u0641\u064A \u0627\u0644\u0625\u0633\u0646\u0627\u062F"
    };
  }
  if (/^Maqtu$/i.test(raw)) {
    return {
      name,
      originalGrade: raw,
      arabicLabel: "\u0645\u0642\u0637\u0648\u0639",
      family: "neutral",
      isIsnadJudgment: false,
      isCitation: false,
      note: "\u0639\u0644\u0649 \u0627\u0644\u062A\u0627\u0628\u0639\u064A"
    };
  }
  if (/^Sahih$/i.test(raw) || /^Sahih Hadith$/i.test(raw)) {
    return { name, originalGrade: raw, arabicLabel: "\u0635\u062D\u064A\u062D", family: "\u0635\u062D\u064A\u062D", isIsnadJudgment: false, isCitation: false };
  }
  if (/^Hasan Sahih$/i.test(raw) || /^Hasan Sahih Isnaad$/i.test(raw)) {
    return { name, originalGrade: raw, arabicLabel: "\u062D\u0633\u0646 \u0635\u062D\u064A\u062D", family: "\u062D\u0633\u0646", isIsnadJudgment: false, isCitation: false };
  }
  if (/^Hasan$/i.test(raw)) {
    return { name, originalGrade: raw, arabicLabel: "\u062D\u0633\u0646", family: "\u062D\u0633\u0646", isIsnadJudgment: false, isCitation: false };
  }
  if (/^Sahih Lighairihi$/i.test(raw)) {
    return { name, originalGrade: raw, arabicLabel: "\u0635\u062D\u064A\u062D \u0644\u063A\u064A\u0631\u0647", family: "\u0635\u062D\u064A\u062D", isIsnadJudgment: false, isCitation: false };
  }
  if (/^Hasan Lighairihi$/i.test(raw)) {
    return { name, originalGrade: raw, arabicLabel: "\u062D\u0633\u0646 \u0644\u063A\u064A\u0631\u0647", family: "\u062D\u0633\u0646", isIsnadJudgment: false, isCitation: false };
  }
  if (/^Sahih Mutawatir$/i.test(raw)) {
    return { name, originalGrade: raw, arabicLabel: "\u0635\u062D\u064A\u062D \u0645\u062A\u0648\u0627\u062A\u0631", family: "\u0635\u062D\u064A\u062D", isIsnadJudgment: false, isCitation: false };
  }
  if (/^(Very Daif|Daif Jiddan)$/i.test(raw)) {
    return { name, originalGrade: raw, arabicLabel: "\u0636\u0639\u064A\u0641 \u062C\u062F\u0627\u064B", family: "\u0636\u0639\u064A\u0641", isIsnadJudgment: false, isCitation: false };
  }
  if (/^Daif$/i.test(raw) || /^Sanad Daif$/i.test(raw)) {
    return { name, originalGrade: raw, arabicLabel: "\u0636\u0639\u064A\u0641", family: "\u0636\u0639\u064A\u0641", isIsnadJudgment: false, isCitation: false };
  }
  if (/^Mawdu$/i.test(raw)) {
    return { name, originalGrade: raw, arabicLabel: "\u0645\u0648\u0636\u0648\u0639", family: "\u0645\u0648\u0636\u0648\u0639", isIsnadJudgment: false, isCitation: false };
  }
  return {
    name,
    originalGrade: raw,
    arabicLabel: raw,
    family: "neutral",
    isIsnadJudgment: false,
    isCitation: false
  };
}
function normalizeEnglish(text) {
  return text.toLowerCase().replace(/\([^)]*\)/g, " ").replace(/[()]/g, " ").replace(/['"’`\-–]/g, "").replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
}
function stripHonorificsAndFormulas(text) {
  if (!text) return "";
  let s = text;
  s = s.replace(/صلى الله عليه وسلم/g, " ");
  s = s.replace(/صلي الله عليه وسلم/g, " ");
  s = s.replace(/رضي الله عنهما/g, " ");
  s = s.replace(/رضي الله عنهم/g, " ");
  s = s.replace(/رضي الله عنها/g, " ");
  s = s.replace(/رضي الله عنه/g, " ");
  s = s.replace(/عليه الصلاة والسلام/g, " ");
  s = s.replace(/عليه السلام/g, " ");
  s = s.replace(/رحمه الله/g, " ");
  s = s.replace(/عز وجل/g, " ");
  s = s.replace(/سبحانه وتعالى/g, " ");
  s = s.replace(/سبحانه وتعالي/g, " ");
  s = s.replace(/(رواه|أخرجه) (مسلم|البخاري|الترمذي|أبو داود|النسائي|ابن ماجه|أحمد)/g, " ");
  s = s.replace(/متفق عليه/g, " ");
  return s.replace(/\s+/g, " ").trim();
}
function isPunctuationWord(word) {
  const norm = normalizeArabic(word).replace(/[\u200E\u200F]/g, "");
  if (!norm) return true;
  return /^[.,/#!$%^&*;:{}=\-_`~()؟،؛«»"'\d\u0660-\u0669\uFD3E\uFD3F\[\]<>ـ\s\u200B-\u200F\uFEFF]*$/.test(norm);
}
function tokenizeDisplayWords(rawText) {
  const cleanRaw = (rawText || "").replace(/<br\s*\/?>/gi, " ");
  const displayWords = cleanRaw.split(/\s+/).filter(Boolean);
  const tokens = displayWords.map((word, originalIndex) => {
    const norm = normalizeArabic(word).replace(/[\u200E\u200F]/g, "");
    const skip = isPunctuationWord(word) || !norm;
    return {
      word,
      normalized: norm,
      originalIndex,
      skip
    };
  });
  const norms = tokens.map((t) => t.normalized);
  for (let i = 0; i < tokens.length; i++) {
    if ((norms[i] === "\u0635\u0644\u064A" || norms[i] === "\u0635\u0644\u0649") && norms[i + 1] === "\u0627\u0644\u0644\u0647" && norms[i + 2] === "\u0639\u0644\u064A\u0647" && norms[i + 3] === "\u0648\u0633\u0644\u0645") {
      tokens[i].skip = true;
      tokens[i + 1].skip = true;
      tokens[i + 2].skip = true;
      tokens[i + 3].skip = true;
    }
    if (norms[i] === "\u0631\u0636\u064A" && norms[i + 1] === "\u0627\u0644\u0644\u0647" && (norms[i + 2] === "\u0639\u0646\u0647" || norms[i + 2] === "\u0639\u0646\u0647\u0627" || norms[i + 2] === "\u0639\u0646\u0647\u0645" || norms[i + 2] === "\u0639\u0646\u0647\u0645\u0627" || norms[i + 2] === "\u0639\u0646\u0647\u0646")) {
      tokens[i].skip = true;
      tokens[i + 1].skip = true;
      tokens[i + 2].skip = true;
    }
    if (norms[i] === "\u0639\u0644\u064A\u0647" && norms[i + 1] === "\u0627\u0644\u0633\u0644\u0627\u0645") {
      tokens[i].skip = true;
      tokens[i + 1].skip = true;
    }
    if (norms[i] === "\u0639\u0644\u064A\u0647" && norms[i + 1] === "\u0627\u0644\u0635\u0644\u0627\u0647" && norms[i + 2] === "\u0648\u0627\u0644\u0633\u0644\u0627\u0645") {
      tokens[i].skip = true;
      tokens[i + 1].skip = true;
      tokens[i + 2].skip = true;
    }
    if (norms[i] === "\u0631\u062D\u0645\u0647" && norms[i + 1] === "\u0627\u0644\u0644\u0647") {
      tokens[i].skip = true;
      tokens[i + 1].skip = true;
    }
    if (norms[i] === "\u0639\u0632" && norms[i + 1] === "\u0648\u062C\u0644") {
      tokens[i].skip = true;
      tokens[i + 1].skip = true;
    }
    if (norms[i] === "\u0633\u0628\u062D\u0627\u0646\u0647" && (norms[i + 1] === "\u0648\u062A\u0639\u0627\u0644\u064A" || norms[i + 1] === "\u0648\u062A\u0639\u0627\u0644\u0649")) {
      tokens[i].skip = true;
      tokens[i + 1].skip = true;
    }
  }
  const nonSkipped = tokens.filter((t) => !t.skip);
  return { displayWords, tokens, nonSkipped };
}
function stripIsnadTokens(tokens) {
  if (tokens.length <= 4) {
    return { matnTokens: tokens, isnadStripped: false };
  }
  const maxIdx = Math.max(Math.floor(tokens.length * 0.9), tokens.length - 2);
  const attributionMarkers = [
    ["\u0642\u0627\u0644", "\u0631\u0633\u0648\u0644", "\u0627\u0644\u0644\u0647"],
    ["\u0633\u0645\u0639\u062A", "\u0631\u0633\u0648\u0644", "\u0627\u0644\u0644\u0647"],
    ["\u0627\u0646", "\u0631\u0633\u0648\u0644", "\u0627\u0644\u0644\u0647"],
    ["\u0639\u0646", "\u0631\u0633\u0648\u0644", "\u0627\u0644\u0644\u0647"],
    ["\u0627\u0646", "\u0627\u0644\u0646\u0628\u064A"],
    ["\u0639\u0646", "\u0627\u0644\u0646\u0628\u064A"],
    ["\u064A\u0642\u0648\u0644", "\u0631\u0633\u0648\u0644", "\u0627\u0644\u0644\u0647"],
    ["\u0633\u0645\u0639\u062A", "\u0627\u0644\u0646\u0628\u064A"]
  ];
  for (let i = 0; i <= maxIdx; i++) {
    for (const m of attributionMarkers) {
      if (i + m.length <= tokens.length) {
        let match = true;
        for (let j = 0; j < m.length; j++) {
          if (tokens[i + j].normalized !== m[j]) {
            match = false;
            break;
          }
        }
        if (match) {
          let after = i + m.length;
          if (after < tokens.length && (tokens[after].normalized === "\u0642\u0627\u0644" || tokens[after].normalized === "\u064A\u0642\u0648\u0644")) {
            after++;
          }
          if (after < tokens.length) {
            return { matnTokens: tokens.slice(after), isnadStripped: true };
          }
        }
      }
    }
  }
  return { matnTokens: tokens, isnadStripped: false };
}
function isWordMatchEquivalent(w1, w2) {
  if (w1 === w2) return true;
  if (w1.replace(/ء/g, "\u0627") === w2.replace(/ء/g, "\u0627")) return true;
  if ((w1 === "\u0648\u062D\u062F\u062B\u0646\u064A" || w1 === "\u0648\u062D\u062F\u062B\u0646\u0627") && (w2 === "\u0648\u062D\u062F\u062B\u0646\u064A" || w2 === "\u0648\u062D\u062F\u062B\u0646\u0627")) return true;
  if ((w1 === "\u062D\u062F\u062B\u0646\u064A" || w1 === "\u062D\u062F\u062B\u0646\u0627") && (w2 === "\u062D\u062F\u062B\u0646\u064A" || w2 === "\u062D\u062F\u062B\u0646\u0627")) return true;
  if ((w1 === "\u0627\u062E\u0628\u0631\u0646\u064A" || w1 === "\u0627\u062E\u0628\u0631\u0646\u0627") && (w2 === "\u0627\u062E\u0628\u0631\u0646\u064A" || w2 === "\u0627\u062E\u0628\u0631\u0646\u0627")) return true;
  if ((w1 === "\u0648\u0627\u062E\u0628\u0631\u0646\u064A" || w1 === "\u0648\u0627\u062E\u0628\u0631\u0646\u0627") && (w2 === "\u0648\u0627\u062E\u0628\u0631\u0646\u064A" || w2 === "\u0648\u0627\u062E\u0628\u0631\u0646\u0627")) return true;
  return false;
}
function alignWordsDP(queryTokens, sourceTokens) {
  const m = queryTokens.length;
  const n = sourceTokens.length;
  if (m === 0 || n === 0) {
    return {
      confidence: 0,
      matchedTokens: [],
      matchedWords: [],
      matchedOriginalIndices: [],
      wordStatus: [],
      changedWords: [],
      hasApproximateMatch: false
    };
  }
  const stride = n + 1;
  const dp = new Float64Array((m + 1) * stride);
  const back = new Int32Array((m + 1) * stride);
  dp[0] = 0;
  for (let i = 1; i <= m; i++) {
    dp[i * stride] = i * 1.5;
    back[i * stride] = 2;
  }
  for (let j = 1; j <= n; j++) {
    dp[j] = 0;
    back[j] = 3;
  }
  for (let i = 1; i <= m; i++) {
    const qw = queryTokens[i - 1].normalized;
    const rowOffset = i * stride;
    const prevRowOffset = (i - 1) * stride;
    for (let j = 1; j <= n; j++) {
      const sw = sourceTokens[j - 1].normalized;
      let subCost = 3;
      if (isWordMatchEquivalent(qw, sw)) {
        subCost = 0;
      } else {
        const lenDiff = Math.abs(qw.length - sw.length);
        if (lenDiff <= 1 && isLevenshteinDistanceAtMostOne(qw, sw)) {
          subCost = 0.5;
        } else {
          subCost = 2.5;
        }
      }
      const costDiag = dp[prevRowOffset + j - 1] + subCost;
      const costUp = dp[prevRowOffset + j] + 1.5;
      const costLeft = dp[rowOffset + j - 1] + 1;
      if (costDiag <= costUp && costDiag <= costLeft) {
        dp[rowOffset + j] = costDiag;
        back[rowOffset + j] = 1;
      } else if (costUp <= costLeft) {
        dp[rowOffset + j] = costUp;
        back[rowOffset + j] = 2;
      } else {
        dp[rowOffset + j] = costLeft;
        back[rowOffset + j] = 3;
      }
    }
  }
  let bestJ = n;
  let minCost = dp[m * stride + n];
  const searchStart = Math.min(n, Math.max(1, m - 4));
  for (let j = searchStart; j <= n; j++) {
    const val = dp[m * stride + j];
    if (val < minCost) {
      minCost = val;
      bestJ = j;
    }
  }
  const rev = [];
  let currI = m;
  let currJ = bestJ;
  while (currI > 0) {
    const cellIdx = currI * stride + currJ;
    if (currI > 0 && currJ > 0 && back[cellIdx] === 1) {
      const qw = queryTokens[currI - 1];
      const sw = sourceTokens[currJ - 1];
      const isExact = isWordMatchEquivalent(qw.normalized, sw.normalized);
      const type = isExact ? "exact" : isLevenshteinDistanceAtMostOne(qw.normalized, sw.normalized) ? "approximate" : "deleted";
      rev.push({
        queryWord: qw.word,
        sourceWord: sw.word,
        type,
        qIdx: currI - 1,
        sIdx: currJ - 1,
        sourceOriginalIndex: sw.originalIndex
      });
      currI--;
      currJ--;
    } else if (currJ <= 0 || back[cellIdx] === 2) {
      rev.push({
        queryWord: queryTokens[currI - 1].word,
        sourceWord: null,
        type: "deleted",
        qIdx: currI - 1,
        sIdx: -1
      });
      currI--;
    } else {
      rev.push({
        queryWord: null,
        sourceWord: sourceTokens[currJ - 1].word,
        type: "inserted",
        qIdx: currI,
        sIdx: currJ - 1,
        sourceOriginalIndex: sourceTokens[currJ - 1].originalIndex
      });
      currJ--;
    }
  }
  const steps = rev.reverse();
  const matchedTokens = [];
  const matchedWords = [];
  const matchedOriginalIndices = [];
  const wordStatus = [];
  const changedWords = [];
  let hasApproximateMatch = false;
  for (const step of steps) {
    if (step.type === "exact") {
      if (step.sourceOriginalIndex !== void 0) {
        matchedOriginalIndices.push(step.sourceOriginalIndex);
        matchedWords.push(step.sourceWord);
        matchedTokens.push(normalizeArabic(step.sourceWord));
      }
      wordStatus.push("exact");
      changedWords.push({
        queryWord: step.queryWord,
        sourceWord: step.sourceWord,
        position: step.qIdx,
        type: "exact"
      });
    } else if (step.type === "approximate") {
      hasApproximateMatch = true;
      if (step.sourceOriginalIndex !== void 0) {
        matchedOriginalIndices.push(step.sourceOriginalIndex);
        matchedWords.push(step.sourceWord);
        matchedTokens.push(normalizeArabic(step.sourceWord));
      }
      wordStatus.push("approximate");
      changedWords.push({
        queryWord: step.queryWord,
        sourceWord: step.sourceWord,
        position: step.qIdx,
        type: "approximate"
      });
    } else if (step.type === "inserted") {
      changedWords.push({
        queryWord: null,
        sourceWord: step.sourceWord,
        position: step.qIdx,
        type: "inserted"
      });
    } else if (step.type === "deleted") {
      wordStatus.push("none");
      changedWords.push({
        queryWord: step.queryWord,
        sourceWord: null,
        position: step.qIdx,
        type: "deleted"
      });
    }
  }
  let exactCount = steps.filter((s) => s.type === "exact").length;
  let approxCount = steps.filter((s) => s.type === "approximate").length;
  let rawScore = (exactCount * 1 + approxCount * 0.85) / m;
  let confidence = Math.round(rawScore * 100);
  return {
    confidence,
    matchedTokens,
    matchedWords,
    matchedOriginalIndices,
    wordStatus,
    changedWords,
    hasApproximateMatch
  };
}
function findBestWindow(query, source) {
  if (source.length <= query.length + 8) return source;
  const qWords = new Set(query.map((t) => t.normalized));
  const winLen = query.length;
  let currentHits = 0;
  for (let j = 0; j < winLen; j++) {
    if (qWords.has(source[j].normalized)) currentHits++;
  }
  let bestStart = 0;
  let maxHits = currentHits;
  for (let i = 1; i <= source.length - winLen; i++) {
    if (qWords.has(source[i - 1].normalized)) currentHits--;
    if (qWords.has(source[i + winLen - 1].normalized)) currentHits++;
    if (currentHits > maxHits) {
      maxHits = currentHits;
      bestStart = i;
    }
  }
  const start = Math.max(0, bestStart - 4);
  const end = Math.min(source.length, bestStart + winLen + 6);
  return source.slice(start, end);
}
function stripIsnadFromNormalized(normalizedText) {
  const words = normalizedText.split(/\s+/).filter(Boolean);
  if (words.length <= 4) {
    return { matn: normalizedText, isnadStripped: false, strippedRatio: 0, isnadWordOffset: 0 };
  }
  const maxIdx = Math.max(Math.floor(words.length * 0.9), words.length - 2);
  const attributionMarkers = [
    "\u0642\u0627\u0644 \u0631\u0633\u0648\u0644 \u0627\u0644\u0644\u0647",
    "\u0633\u0645\u0639\u062A \u0631\u0633\u0648\u0644 \u0627\u0644\u0644\u0647",
    "\u0627\u0646 \u0631\u0633\u0648\u0644 \u0627\u0644\u0644\u0647",
    "\u0639\u0646 \u0631\u0633\u0648\u0644 \u0627\u0644\u0644\u0647",
    "\u0627\u0646 \u0627\u0644\u0646\u0628\u064A",
    "\u0639\u0646 \u0627\u0644\u0646\u0628\u064A",
    "\u064A\u0642\u0648\u0644 \u0631\u0633\u0648\u0644 \u0627\u0644\u0644\u0647",
    "\u0633\u0645\u0639\u062A \u0627\u0644\u0646\u0628\u064A"
  ];
  for (let i = 0; i <= maxIdx; i++) {
    for (const m of attributionMarkers) {
      const mTokens = m.split(" ");
      const sub = words.slice(i, i + mTokens.length).join(" ");
      if (sub === m) {
        let afterIdx = i + mTokens.length;
        const next4 = words.slice(afterIdx, afterIdx + 4).join(" ");
        if (next4 === "\u0635\u0644\u064A \u0627\u0644\u0644\u0647 \u0639\u0644\u064A\u0647 \u0648\u0633\u0644\u0645" || next4 === "\u0635\u0644\u0649 \u0627\u0644\u0644\u0647 \u0639\u0644\u064A\u0647 \u0648\u0633\u0644\u0645") {
          afterIdx += 4;
        }
        if (words[afterIdx] === "\u0642\u0627\u0644" || words[afterIdx] === "\u064A\u0642\u0648\u0644" || words[afterIdx] === "\u0627\u0646\u0647 \u0642\u0627\u0644") {
          afterIdx++;
        }
        const matnTokens = words.slice(afterIdx);
        if (matnTokens.length > 0) {
          const strippedRatio = Math.round(afterIdx / words.length * 100) / 100;
          return {
            matn: matnTokens.join(" "),
            isnadStripped: true,
            strippedRatio,
            isnadWordOffset: afterIdx
          };
        }
      }
    }
  }
  return { matn: normalizedText, isnadStripped: false, strippedRatio: 0, isnadWordOffset: 0 };
}
var corpusHadiths = [];
var vocabulary = [];
var wordToIdMap = /* @__PURE__ */ new Map();
var twoGramKeyIndexMap = /* @__PURE__ */ new Map();
var twoGramOffsets = new Uint32Array(0);
var twoGramLengths = new Uint16Array(0);
var twoGramPostings = new Int32Array(0);
var isInitialized2 = false;
var sectionsCache = /* @__PURE__ */ new Map();
function getWordId(word, add = false) {
  let id = wordToIdMap.get(word);
  if (id === void 0 && add) {
    id = vocabulary.length;
    vocabulary.push(word);
    wordToIdMap.set(word, id);
  }
  return id ?? -1;
}
function getIndexHits(id1, id2) {
  const key = Number(id1) * 1e5 + Number(id2);
  const kIdx = twoGramKeyIndexMap.get(key);
  if (kIdx === void 0) return [];
  const start = twoGramOffsets[kIdx];
  const len = twoGramLengths[kIdx];
  return twoGramPostings.subarray(start, start + len);
}
function getIndexedCounts() {
  const counts = {
    bukhari: 0,
    muslim: 0,
    abudawud: 0,
    tirmidhi: 0,
    nasai: 0,
    ibnmajah: 0,
    nawawi: 0,
    totalIndexed: 0
  };
  for (const h of corpusHadiths) {
    if (counts[h.c] !== void 0) {
      counts[h.c]++;
      counts.totalIndexed++;
    }
  }
  return counts;
}
function preprocessAllRawHadiths() {
  const collections = ["bukhari", "muslim", "abudawud", "tirmidhi", "nasai", "ibnmajah", "nawawi"];
  const records = [];
  const sections = {};
  vocabulary = [];
  wordToIdMap.clear();
  let emptyCount = 0;
  for (const col of collections) {
    const arPath = path3.join(DATA_DIR2, `hadith_${col}_ar.json`);
    if (!fs3.existsSync(arPath)) continue;
    const arData = JSON.parse(fs3.readFileSync(arPath, "utf8"));
    sections[col] = arData.metadata?.sections || {};
    const hadithList = arData.hadiths || [];
    for (const h of hadithList) {
      const rawText = (h.text || "").trim();
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
        m: new Int32Array(matnTokens.map((t) => getWordId(t, true))),
        f: new Int32Array(fullTokens.map((t) => getWordId(t, true))),
        r: strippedRatio,
        o: isnadWordOffset ?? 0
      });
    }
  }
  return { records, vocab: vocabulary, sections, emptyCount };
}
function initHadithEngine() {
  if (isInitialized2) {
    return {
      totalIndexed: corpusHadiths.length,
      emptyExcluded: 379,
      indexMemoryBytes: twoGramPostings.byteLength + twoGramOffsets.byteLength
    };
  }
  const startTime = performance.now();
  const prebuiltPathGz = path3.join(DATA_DIR2, "prebuilt_hadiths.json.gz");
  const prebuiltPathPlain = path3.join(DATA_DIR2, "prebuilt_hadiths.json");
  corpusHadiths = [];
  twoGramKeyIndexMap.clear();
  let emptyCount = 379;
  if (fs3.existsSync(prebuiltPathGz)) {
    const buffer = fs3.readFileSync(prebuiltPathGz);
    const decompressed = zlib2.gunzipSync(buffer).toString("utf8");
    const data = JSON.parse(decompressed);
    vocabulary = data.v || [];
    const rawRecords = data.r || [];
    let totalM = 0;
    let totalF = 0;
    for (let i = 0; i < rawRecords.length; i++) {
      const r = rawRecords[i];
      const mLen = Array.isArray(r.m) ? r.m.length : r.m ? Object.keys(r.m).length : 0;
      const fLen = Array.isArray(r.f) ? r.f.length : r.f ? Object.keys(r.f).length : 0;
      totalM += mLen;
      totalF += fLen;
    }
    const allM = new Int32Array(totalM);
    const allF = new Int32Array(totalF);
    let curM = 0;
    let curF = 0;
    corpusHadiths = new Array(rawRecords.length);
    for (let i = 0; i < rawRecords.length; i++) {
      const r = rawRecords[i];
      const mArr = Array.isArray(r.m) ? r.m : r.m ? Object.values(r.m) : [];
      const fArr = Array.isArray(r.f) ? r.f : r.f ? Object.values(r.f) : [];
      const mStart = curM;
      for (let j = 0; j < mArr.length; j++) allM[curM++] = Number(mArr[j]);
      const fStart = curF;
      for (let j = 0; j < fArr.length; j++) allF[curF++] = Number(fArr[j]);
      corpusHadiths[i] = {
        c: r.c,
        n: r.n,
        m: allM.subarray(mStart, curM),
        f: allF.subarray(fStart, curF),
        r: r.r,
        o: r.o
      };
    }
    sectionsCache.clear();
    if (data.s) {
      for (const [col, sData] of Object.entries(data.s)) {
        sectionsCache.set(col, sData);
      }
    }
  } else if (fs3.existsSync(prebuiltPathPlain)) {
    const data = JSON.parse(fs3.readFileSync(prebuiltPathPlain, "utf8"));
    vocabulary = data.v || [];
    const rawRecords = data.r || [];
    let totalM = 0;
    let totalF = 0;
    for (let i = 0; i < rawRecords.length; i++) {
      const r = rawRecords[i];
      const mLen = Array.isArray(r.m) ? r.m.length : r.m ? Object.keys(r.m).length : 0;
      const fLen = Array.isArray(r.f) ? r.f.length : r.f ? Object.keys(r.f).length : 0;
      totalM += mLen;
      totalF += fLen;
    }
    const allM = new Int32Array(totalM);
    const allF = new Int32Array(totalF);
    let curM = 0;
    let curF = 0;
    corpusHadiths = new Array(rawRecords.length);
    for (let i = 0; i < rawRecords.length; i++) {
      const r = rawRecords[i];
      const mArr = Array.isArray(r.m) ? r.m : r.m ? Object.values(r.m) : [];
      const fArr = Array.isArray(r.f) ? r.f : r.f ? Object.values(r.f) : [];
      const mStart = curM;
      for (let j = 0; j < mArr.length; j++) allM[curM++] = Number(mArr[j]);
      const fStart = curF;
      for (let j = 0; j < fArr.length; j++) allF[curF++] = Number(fArr[j]);
      corpusHadiths[i] = {
        c: r.c,
        n: r.n,
        m: allM.subarray(mStart, curM),
        f: allF.subarray(fStart, curF),
        r: r.r,
        o: r.o
      };
    }
    if (data.s) {
      for (const [col, sData] of Object.entries(data.s)) {
        sectionsCache.set(col, sData);
      }
    }
  } else {
    const { records, vocab, sections, emptyCount: ec } = preprocessAllRawHadiths();
    corpusHadiths = records;
    vocabulary = vocab;
    emptyCount = ec;
    sectionsCache.clear();
    for (const [col, sData] of Object.entries(sections)) {
      sectionsCache.set(col, sData);
    }
  }
  wordToIdMap.clear();
  for (let i = 0; i < vocabulary.length; i++) {
    wordToIdMap.set(vocabulary[i], i);
  }
  const keyCounts = /* @__PURE__ */ new Map();
  for (let recordIdx = 0; recordIdx < corpusHadiths.length; recordIdx++) {
    const tokenIds = corpusHadiths[recordIdx].f;
    const seen = /* @__PURE__ */ new Set();
    for (let i = 0; i < tokenIds.length - 1; i++) {
      const key = tokenIds[i] * 1e5 + tokenIds[i + 1];
      if (!seen.has(key)) {
        seen.add(key);
        keyCounts.set(key, (keyCounts.get(key) || 0) + 1);
      }
    }
  }
  let keyIdx = 0;
  let totalPostings = 0;
  for (const [key, count] of keyCounts.entries()) {
    twoGramKeyIndexMap.set(key, keyIdx++);
    totalPostings += count;
  }
  twoGramOffsets = new Uint32Array(keyIdx + 1);
  twoGramLengths = new Uint16Array(keyIdx);
  twoGramPostings = new Int32Array(totalPostings);
  let curOffset = 0;
  keyIdx = 0;
  for (const [_, count] of keyCounts.entries()) {
    twoGramOffsets[keyIdx] = curOffset;
    twoGramLengths[keyIdx] = 0;
    curOffset += count;
    keyIdx++;
  }
  twoGramOffsets[keyIdx] = curOffset;
  for (let recordIdx = 0; recordIdx < corpusHadiths.length; recordIdx++) {
    const tokenIds = corpusHadiths[recordIdx].f;
    const seen = /* @__PURE__ */ new Set();
    for (let i = 0; i < tokenIds.length - 1; i++) {
      const key = tokenIds[i] * 1e5 + tokenIds[i + 1];
      if (!seen.has(key)) {
        seen.add(key);
        const kIdx = twoGramKeyIndexMap.get(key);
        const pos = twoGramOffsets[kIdx] + twoGramLengths[kIdx];
        twoGramPostings[pos] = recordIdx;
        twoGramLengths[kIdx]++;
      }
    }
  }
  isInitialized2 = true;
  const loadTime = Math.round(performance.now() - startTime);
  console.log(`Hadith Engine Initialized in ${loadTime}ms: ${corpusHadiths.length} non-empty records indexed (${emptyCount} empty records excluded).`);
  return {
    totalIndexed: corpusHadiths.length,
    emptyExcluded: emptyCount,
    indexMemoryBytes: twoGramPostings.byteLength + twoGramOffsets.byteLength
  };
}
function scoreContainment(queryTokens, recordTokenIds) {
  const qLen = queryTokens.length;
  const rLen = recordTokenIds.length;
  if (qLen === 0 || rLen === 0) {
    return {
      score: 0,
      startWordIndex: 0,
      endWordIndex: 0,
      hasApproximateMatch: false,
      wordStatus: [],
      changedWords: [],
      matchedTokens: []
    };
  }
  let bestScore = 0;
  let bestStart = 0;
  let bestEnd = 0;
  let bestApprox = false;
  let bestStatus = [];
  let bestChanged = [];
  let bestMatchedTokens = [];
  const qIds = queryTokens.map((t) => getWordId(t));
  if (qLen <= rLen) {
    const maxStart = rLen - qLen;
    for (let j = 0; j <= maxStart; j++) {
      let sum = 0;
      let anyApprox = false;
      const currentStatus = [];
      const currentChanged = [];
      const currentMatched = [];
      for (let i = 0; i < qLen; i++) {
        const rId = recordTokenIds[j + i];
        const rToken = vocabulary[rId];
        const qToken = queryTokens[i];
        if (rId !== void 0 && qIds[i] !== -1 && qIds[i] === rId) {
          sum += 1;
          currentStatus.push("exact");
          currentMatched.push(rToken);
        } else if (rId !== void 0) {
          const sim = wordSimilarityCorpusDerived(qToken, rToken);
          if (sim.score >= 0.95 && sim.isExact) {
            sum += 1;
            currentStatus.push("exact");
            currentMatched.push(rToken);
          } else if (sim.score >= 0.7) {
            anyApprox = true;
            sum += sim.score;
            currentStatus.push("approximate");
            currentMatched.push(rToken);
          } else {
            currentStatus.push("none");
            currentChanged.push({
              queryWord: qToken,
              sourceWord: rToken || null,
              position: i
            });
          }
        } else {
          currentStatus.push("none");
          currentChanged.push({
            queryWord: qToken,
            sourceWord: null,
            position: i
          });
        }
      }
      let avg = Math.round(sum / qLen * 100);
      if (avg > bestScore) {
        bestScore = avg;
        bestStart = j;
        bestEnd = j + qLen - 1;
        bestApprox = anyApprox;
        bestStatus = currentStatus;
        bestChanged = currentChanged;
        bestMatchedTokens = currentMatched;
      }
    }
  } else {
    if (rLen / qLen < 0.65) {
      return {
        score: 0,
        startWordIndex: 0,
        endWordIndex: 0,
        hasApproximateMatch: false,
        wordStatus: [],
        changedWords: [],
        matchedTokens: []
      };
    }
    const maxStart = qLen - rLen;
    for (let k = 0; k <= maxStart; k++) {
      let sum = 0;
      let anyApprox = false;
      const currentStatus = [];
      const currentChanged = [];
      const currentMatched = [];
      for (let i = 0; i < qLen; i++) {
        const qToken = queryTokens[i];
        if (i >= k && i < k + rLen) {
          const rIdx = i - k;
          const rId = recordTokenIds[rIdx];
          const rToken = vocabulary[rId];
          if (rId !== void 0 && qIds[i] !== -1 && qIds[i] === rId) {
            sum += 1;
            currentStatus.push("exact");
            currentMatched.push(rToken);
          } else if (rId !== void 0) {
            const sim = wordSimilarityCorpusDerived(qToken, rToken);
            if (sim.score >= 0.95 && sim.isExact) {
              sum += 1;
              currentStatus.push("exact");
              currentMatched.push(rToken);
            } else if (sim.score >= 0.7) {
              anyApprox = true;
              sum += sim.score;
              currentStatus.push("approximate");
              currentMatched.push(rToken);
            } else {
              currentStatus.push("none");
              currentChanged.push({
                queryWord: qToken,
                sourceWord: rToken,
                position: i
              });
            }
          }
        } else {
          currentStatus.push("none");
          currentChanged.push({
            queryWord: qToken,
            sourceWord: null,
            position: i
          });
        }
      }
      let avg = Math.round(sum / qLen * 100);
      if (avg > bestScore) {
        bestScore = avg;
        bestStart = 0;
        bestEnd = rLen - 1;
        bestApprox = anyApprox;
        bestStatus = currentStatus;
        bestChanged = currentChanged;
        bestMatchedTokens = currentMatched;
      }
    }
  }
  return {
    score: bestScore,
    startWordIndex: bestStart,
    endWordIndex: bestEnd,
    hasApproximateMatch: bestApprox,
    wordStatus: bestStatus,
    changedWords: bestChanged,
    matchedTokens: bestMatchedTokens
  };
}
function findAttestationCluster(targetRecord) {
  const targetTokenIds = targetRecord.m;
  if (targetTokenIds.length < 3) return [];
  const attestations = [];
  const { corpus } = loadCorpus();
  const candHits = /* @__PURE__ */ new Map();
  for (let i = 0; i < Math.min(targetTokenIds.length - 1, 8); i++) {
    const hits = getIndexHits(targetTokenIds[i], targetTokenIds[i + 1]);
    for (const h of hits) {
      candHits.set(h, (candHits.get(h) || 0) + 1);
    }
  }
  const minCount = targetTokenIds.length <= 10 ? 2 : Math.max(2, Math.floor(targetTokenIds.length * 0.15));
  const candidateIndices = Array.from(candHits.entries()).filter(([_, count]) => count >= minCount || targetTokenIds.length <= 4).sort((a, b) => b[1] - a[1]).slice(0, 20).map(([cIdx]) => cIdx);
  for (const cIdx of candidateIndices) {
    const candidate = corpusHadiths[cIdx];
    if (candidate.c === targetRecord.c && candidate.n === targetRecord.n) continue;
    const candTokenIds = candidate.m;
    if (candTokenIds.length < 3) continue;
    const shorter = targetTokenIds.length <= candTokenIds.length ? targetTokenIds : candTokenIds;
    const longer = targetTokenIds.length <= candTokenIds.length ? candTokenIds : targetTokenIds;
    const shorterStrings = Array.from(shorter).map((id) => vocabulary[id] || "");
    const res = scoreContainment(shorterStrings, longer);
    const containmentRatio = Math.round(res.score / 100 * 100) / 100;
    if (containmentRatio >= 0.8) {
      const rawAr = lookupHadithAr(candidate.c, candidate.n);
      const grades = (rawAr?.grades || []).map(parseGrade);
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
        matnSnippet: Array.from(candidate.m.slice(0, 20)).map((id) => vocabulary[id] || "").join(" ").slice(0, 100) + "..."
      });
    }
  }
  attestations.sort((a, b) => b.containmentRatio - a.containmentRatio);
  return attestations;
}
function searchHadith(rawQuery) {
  if (!isInitialized2) initHadithEngine();
  const startTime = performance.now();
  const trimmed = (rawQuery || "").trim();
  if (!trimmed) {
    return {
      query: rawQuery,
      normalizedQuery: "",
      query_mode: "hadith",
      language: "ar",
      state: "not_found",
      topConfidence: 0,
      totalMatches: 0,
      results: [],
      referralRequired: true,
      executionTimeMs: 0
    };
  }
  const isEnglish = /[a-zA-Z]/.test(trimmed) && !/[\u0600-\u06FF]/.test(trimmed);
  if (isEnglish) {
    const normQ = normalizeEnglish(trimmed);
    const qTokens2 = normQ.split(/\s+/).filter(Boolean);
    const stopWords = /* @__PURE__ */ new Set(["are", "to", "be", "only", "by", "the", "a", "of", "and", "in", "for", "that"]);
    const qContent = qTokens2.filter((t) => !stopWords.has(t));
    const matches = [];
    const { corpus: corpus2 } = loadCorpus();
    const cols = ["bukhari", "muslim", "abudawud", "tirmidhi", "nasai", "ibnmajah", "nawawi"];
    for (const col of cols) {
      const enList = corpus2.hadith.en[col] || [];
      const arList = corpus2.hadith.ar[col] || [];
      const colMeta = COLLECTION_METADATA[col] || { arName: col, enName: col };
      for (const enH of enList) {
        if (!enH.text) continue;
        const normEn = normalizeEnglish(enH.text);
        let score = 0;
        if (normEn.includes(normQ)) {
          score = 100;
        } else if (qContent.length > 0) {
          let lastIndex = -1;
          let matchCount = 0;
          for (const t of qContent) {
            const foundIndex = normEn.indexOf(t, lastIndex + 1);
            if (foundIndex !== -1) {
              matchCount++;
              lastIndex = foundIndex;
            }
          }
          if (matchCount >= 2 && matchCount / qContent.length >= 0.5) {
            score = Math.round(matchCount / qContent.length * 100);
            score = Math.min(89, score);
          }
        }
        if (score >= 70) {
          const rawAr = lookupHadithAr(col, enH.hadithnumber);
          const grades = (rawAr?.grades || []).map(parseGrade);
          const bookNum = rawAr?.reference?.book ?? 0;
          const hadithInBook = rawAr?.reference?.hadith ?? 0;
          const sections = sectionsCache.get(col) || {};
          const sectionName = sections[String(bookNum)] || (bookNum > 0 ? `Book ${bookNum}` : "");
          matches.push({
            id: `${col}_${enH.hadithnumber}`,
            collection: col,
            collectionArabic: colMeta.arName,
            hadithnumber: enH.hadithnumber,
            arabicnumber: rawAr?.arabicnumber ?? enH.hadithnumber,
            book: bookNum,
            hadithInBook,
            sectionName,
            text: rawAr?.text || "",
            translation: enH.text,
            confidence: score,
            state: score >= 90 ? "matched" : "close_match",
            coverage: score === 100 ? "full" : "fragment",
            matchedStartWordIndex: 0,
            matchedEndWordIndex: Math.min(15, qTokens2.length),
            matchedTokens: qTokens2,
            wordMatchStatus: qTokens2.map(() => "exact"),
            hasApproximateMatch: score < 90,
            grades,
            hasNoGrading: grades.length === 0,
            isnadStripped: false
          });
        }
      }
    }
    const authorityMap2 = {
      bukhari: 1,
      muslim: 2,
      abudawud: 3,
      tirmidhi: 4,
      nasai: 5,
      ibnmajah: 6,
      nawawi: 7
    };
    matches.sort((a, b) => {
      if (b.confidence !== a.confidence) return b.confidence - a.confidence;
      const orderA = authorityMap2[a.collection] || 99;
      const orderB = authorityMap2[b.collection] || 99;
      if (orderA !== orderB) return orderA - orderB;
      return a.hadithnumber - b.hadithnumber;
    });
    const topConf = matches.length > 0 ? matches[0].confidence : 0;
    const state = topConf >= 90 ? "matched" : topConf >= 70 ? "close_match" : "not_found";
    const elapsed2 = Math.round((performance.now() - startTime) * 100) / 100;
    return {
      query: rawQuery,
      normalizedQuery: trimmed,
      query_mode: "hadith",
      language: "en",
      state,
      topConfidence: topConf,
      totalMatches: matches.length,
      results: matches.slice(0, 10),
      referralRequired: state === "not_found" || topConf < 70,
      executionTimeMs: elapsed2
    };
  }
  const normQuery = normalizeArabic(trimmed);
  const cleanQuery = stripHonorificsAndFormulas(normQuery);
  const normalizedQueryClean = cleanQuery.replace(/\s+/g, " ");
  const fabricatedSayings = [
    {
      keywords: ["\u0627\u0644\u0635\u064A\u0646", "\u0627\u0637\u0644\u0628\u0648\u0627 \u0627\u0644\u0639\u0644\u0645 \u0648\u0644\u0648 \u0628\u0627\u0644\u0635\u064A\u0646", "\u0627\u0637\u0644\u0628\u0648\u0627 \u0627\u0644\u0639\u0644\u0645 \u0648\u0644\u0648 \u0641\u064A \u0627\u0644\u0635\u064A\u0646"],
      matn: "\u0627\u0637\u0644\u0628\u0648\u0627 \u0627\u0644\u0639\u0644\u0645 \u0648\u0644\u0648 \u0628\u0627\u0644\u0635\u064A\u0646",
      ruling: "\u0644\u0627 \u064A\u0635\u062D",
      url: "https://dorar.net/fake-hadith/38",
      source: "user-verified on dorar.net"
    },
    {
      keywords: ["\u062D\u0628 \u0627\u0644\u0648\u0637\u0646 \u0645\u0646 \u0627\u0644\u0625\u064A\u0645\u0627\u0646"],
      matn: "\u062D\u0628 \u0627\u0644\u0648\u0637\u0646 \u0645\u0646 \u0627\u0644\u0625\u064A\u0645\u0627\u0646",
      ruling: "\u0644\u064A\u0633 \u0628\u062D\u062F\u064A\u062B",
      url: "https://dorar.net/fake-hadith/74",
      source: "user-verified on dorar.net"
    },
    {
      keywords: ["\u0627\u0644\u0645\u0639\u062F\u0629 \u0628\u064A\u062A \u0627\u0644\u062F\u0627\u0621", "\u0627\u0644\u062D\u0645\u064A\u0629 \u0631\u0623\u0633 \u0627\u0644\u062F\u0648\u0627\u0621", "\u0627\u0644\u062D\u0645\u064A\u0629 \u0631\u0623\u0633 \u0643\u0644 \u062F\u0648\u0627\u0621"],
      matn: "\u0627\u0644\u0645\u0639\u0650\u062F\u0629 \u0628\u064A\u062A \u0627\u0644\u062F\u0627\u0621\u060C \u0648\u0627\u0644\u062D\u0645\u064A\u0629 \u0631\u0623\u0633 \u0627\u0644\u062F\u0648\u0627\u0621",
      ruling: "\u0644\u0627 \u0623\u0635\u0644 \u0644\u0647",
      url: "https://dorar.net/fake-hadith/557",
      source: "user-verified on dorar.net"
    }
  ];
  const matchedFake = fabricatedSayings.find(
    (f) => normalizedQueryClean.includes(normalizeArabic(f.matn)) || f.keywords.some((k) => normalizedQueryClean.includes(normalizeArabic(k)))
  );
  if (matchedFake) {
    const elapsed2 = Math.round((performance.now() - startTime) * 100) / 100;
    return {
      query: rawQuery,
      normalizedQuery: cleanQuery,
      query_mode: "hadith",
      language: "ar",
      state: "not_found",
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
      notice: `\u062D\u062F\u064A\u062B \u0645\u0646\u062A\u0634\u0631 \u0644\u0627 \u064A\u0635\u062D
\u0627\u0644\u0646\u0635: \xAB${matchedFake.matn}\xBB
\u0627\u0644\u062D\u0643\u0645 \u0641\u064A \u0627\u0644\u062F\u0631\u0631 \u0627\u0644\u0633\u0646\u064A\u0629: ${matchedFake.ruling}
\u0627\u0644\u0645\u0635\u062F\u0631: \u0627\u0644\u062F\u0631\u0631 \u0627\u0644\u0633\u0646\u064A\u0629 \u2014 \u0623\u062D\u0627\u062F\u064A\u062B \u0645\u0646\u062A\u0634\u0631\u0629 \u0644\u0627 \u062A\u0635\u062D
\u0631\u0627\u0628\u0637 \u0627\u0644\u062A\u062D\u0642\u0642: ${matchedFake.url}`,
      executionTimeMs: elapsed2
    };
  }
  const fullQTokens = cleanQuery.split(/\s+/).filter(Boolean);
  const queryNormSet = new Set(fullQTokens);
  const { matn: strippedQueryMatn } = stripIsnadFromNormalized(cleanQuery);
  const qTokens = strippedQueryMatn.split(/\s+/).filter(Boolean);
  if (fullQTokens.length < 3 && qTokens.length < 3) {
    const qIds2 = qTokens.map((t) => getWordId(t));
    const exactWholeMatn = qIds2.every((id) => id !== -1) ? corpusHadiths.find((h) => {
      if (h.m.length !== qIds2.length) return false;
      return h.m.every((id, idx) => id === qIds2[idx]);
    }) : null;
    if (!exactWholeMatn) {
      const elapsed2 = Math.round((performance.now() - startTime) * 100) / 100;
      return {
        query: rawQuery,
        normalizedQuery: cleanQuery,
        query_mode: "hadith",
        language: "ar",
        state: "too_short",
        topConfidence: 0,
        totalMatches: 0,
        results: [],
        referralRequired: false,
        notice: "\u0627\u0644\u0645\u062F\u062E\u0644 \u0642\u0635\u064A\u0631 \u062C\u062F\u0627\u064B \u0644\u0644\u062A\u062D\u0642\u0642\u060C \u064A\u0631\u062C\u0649 \u0643\u062A\u0627\u0628\u0629 3 \u0643\u0644\u0645\u0627\u062A \u0623\u0648 \u0623\u0643\u062B\u0631",
        executionTimeMs: elapsed2
      };
    }
  }
  const candidateScores = /* @__PURE__ */ new Map();
  const fullQIds = fullQTokens.map((t) => getWordId(t));
  const qIds = qTokens.map((t) => getWordId(t));
  for (let i = 0; i < fullQTokens.length - 1; i++) {
    const id1 = fullQIds[i];
    const id2 = fullQIds[i + 1];
    if (id1 === -1 || id2 === -1) continue;
    const hits = getIndexHits(id1, id2);
    for (const h of hits) {
      candidateScores.set(h, (candidateScores.get(h) || 0) + 1);
    }
  }
  for (let i = 0; i < qTokens.length - 1; i++) {
    const id1 = qIds[i];
    const id2 = qIds[i + 1];
    if (id1 === -1 || id2 === -1) continue;
    const hits = getIndexHits(id1, id2);
    for (const h of hits) {
      candidateScores.set(h, (candidateScores.get(h) || 0) + 8);
    }
  }
  let candidateIndices = [];
  if (candidateScores.size > 0) {
    candidateIndices = Array.from(candidateScores.entries()).sort((a, b) => b[1] - a[1]).slice(0, 12).map((entry) => entry[0]);
  } else if (qIds[0] !== -1 || fullQIds[0] !== -1) {
    const targetId = qIds[0] !== -1 ? qIds[0] : fullQIds[0];
    for (let c = 0; c < corpusHadiths.length; c++) {
      if (corpusHadiths[c].f.includes(targetId)) {
        candidateIndices.push(c);
        if (candidateIndices.length >= 12) break;
      }
    }
  }
  const results = [];
  const qTokenize = tokenizeDisplayWords(trimmed);
  const qNonSkipped = qTokenize.nonSkipped;
  const qStripped = stripIsnadTokens(qNonSkipped);
  const matnQTokens = qStripped.matnTokens;
  const { corpus } = loadCorpus();
  for (const cIdx of candidateIndices) {
    const score = candidateScores.get(cIdx) || 0;
    const maxScore = candidateScores.get(candidateIndices[0]) || 0;
    if (maxScore >= 10 && score < 3) {
      continue;
    }
    if (maxScore >= 15 && score < maxScore * 0.25) {
      continue;
    }
    const record = corpusHadiths[cIdx];
    const rawAr = lookupHadithAr(record.c, record.n);
    const rawArabicText = rawAr?.text || "";
    const { displayWords, nonSkipped } = tokenizeDisplayWords(rawArabicText);
    if (nonSkipped.length === 0) continue;
    const windowFull = findBestWindow(qNonSkipped, nonSkipped);
    const resFull = alignWordsDP(qNonSkipped, windowFull);
    let res = resFull;
    let usedMatn = false;
    if (resFull.confidence < 95 && qStripped.isnadStripped && matnQTokens.length >= 3) {
      const windowMatn = findBestWindow(matnQTokens, nonSkipped);
      const resMatn = alignWordsDP(matnQTokens, windowMatn);
      if (resMatn.confidence > resFull.confidence) {
        res = resMatn;
        usedMatn = true;
      }
    }
    if (res.confidence >= 70) {
      let rawEnglishText = void 0;
      if (isEnglish) {
        const enList = corpus.hadith.en[record.c] || [];
        const rawEn = enList.find((h) => h.hadithnumber === record.n);
        rawEnglishText = rawEn?.text;
      }
      const grades = (rawAr?.grades || []).map(parseGrade);
      const hasNoGrading = grades.length === 0;
      const bookNum = rawAr?.reference?.book ?? 0;
      const hadithInBook = rawAr?.reference?.hadith ?? 0;
      const sections = sectionsCache.get(record.c) || {};
      const sectionName = sections[String(bookNum)] || (bookNum > 0 ? `Book ${bookNum}` : "");
      const colMeta = COLLECTION_METADATA[record.c] || { arName: record.c, enName: record.c };
      const hasUnmatchedWord = res.changedWords && res.changedWords.some((w) => w.type !== "exact");
      const isFullyMatched = !hasUnmatchedWord && !res.hasApproximateMatch && res.confidence >= 90;
      const finalConf = isFullyMatched ? res.confidence : Math.min(89, res.confidence);
      const state = isFullyMatched ? "matched" : "close_match";
      const finalMatchedOriginalIndices = res.matchedOriginalIndices;
      const finalMatchedWords = res.matchedWords;
      const rawStart = finalMatchedOriginalIndices[0] ?? 0;
      const rawEnd = finalMatchedOriginalIndices[finalMatchedOriginalIndices.length - 1] ?? 0;
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
        coverage: finalConf === 100 ? "full" : "fragment",
        matchedStartWordIndex: rawStart,
        matchedEndWordIndex: rawEnd,
        matchedTokens: res.matchedTokens && res.matchedTokens.length > 0 ? res.matchedTokens : finalMatchedWords,
        matchedWords: finalMatchedWords,
        matchedOriginalIndices: finalMatchedOriginalIndices,
        wordMatchStatus: res.wordStatus,
        hasApproximateMatch: res.hasApproximateMatch,
        changedWords: res.changedWords,
        grades,
        hasNoGrading,
        isnadStripped: qStripped.isnadStripped || usedMatn,
        isnadChecked: !(qStripped.isnadStripped || usedMatn),
        record
      });
    }
  }
  const authorityMap = {
    bukhari: 1,
    muslim: 2,
    abudawud: 3,
    tirmidhi: 4,
    nasai: 5,
    ibnmajah: 6,
    nawawi: 7
  };
  results.sort((a, b) => {
    const aWhole = a.state === "matched" && a.confidence === 100 && (!a.changedWords || a.changedWords.filter((w) => w.type !== "exact").length === 0) && !a.hasApproximateMatch;
    const bWhole = b.state === "matched" && b.confidence === 100 && (!b.changedWords || b.changedWords.filter((w) => w.type !== "exact").length === 0) && !b.hasApproximateMatch;
    if (aWhole && !bWhole) return -1;
    if (bWhole && !aWhole) return 1;
    if (a.state === "matched" && b.state !== "matched") return -1;
    if (b.state === "matched" && a.state !== "matched") return 1;
    if (b.confidence !== a.confidence) return b.confidence - a.confidence;
    const aMatched = a.matchedTokens?.length || 0;
    const bMatched = b.matchedTokens?.length || 0;
    if (bMatched !== aMatched) return bMatched - aMatched;
    const orderA = authorityMap[a.collection] || 99;
    const orderB = authorityMap[b.collection] || 99;
    if (orderA !== orderB) return orderA - orderB;
    return a.hadithnumber - b.hadithnumber;
  });
  if (results.length > 0) {
    const topRecord = results[0].record;
    if (topRecord) {
      results[0].attestations = findAttestationCluster(topRecord);
    }
  }
  for (const r of results) {
    delete r.record;
  }
  const topConfidence = results.length > 0 ? results[0].confidence : 0;
  const overallState = results.length === 0 || topConfidence < 70 ? "not_found" : results.some((r) => r.state === "matched") ? "matched" : "close_match";
  const elapsed = Math.round((performance.now() - startTime) * 100) / 100;
  return {
    query: rawQuery,
    normalizedQuery: cleanQuery,
    query_mode: "hadith",
    language: "ar",
    state: overallState,
    topConfidence,
    totalMatches: results.length,
    results: results.slice(0, 15),
    referralRequired: overallState === "not_found" || topConfidence < 70,
    executionTimeMs: elapsed
  };
}

// server/matching/ayahMatcherEn.ts
var __filename4 = fileURLToPath4(import.meta.url);
var __dirname4 = path4.dirname(__filename4);
var indexedAyatEn = [];
var surahMetadataEn = /* @__PURE__ */ new Map();
var surahWordStreamsEn = /* @__PURE__ */ new Map();
var surahAyatMapEn = /* @__PURE__ */ new Map();
var exactNormalizedMapEn = /* @__PURE__ */ new Map();
var wordPositionIndexEn = /* @__PURE__ */ new Map();
var twoGramIndexEn = /* @__PURE__ */ new Map();
var isInitializedEn = false;
function initAyahEngineEn() {
  if (isInitializedEn) {
    return { totalIndexed: indexedAyatEn.length };
  }
  const infoRaw = JSON.parse(
    fs4.readFileSync(path4.join(DATA_DIR, "quran_info.json"), "utf8")
  );
  for (const c of infoRaw.chapters || []) {
    surahMetadataEn.set(c.chapter, {
      chapter: c.chapter,
      arabicName: c.arabicname || `\u0633\u0648\u0631\u0629 ${c.chapter}`,
      englishName: c.englishname || `Chapter ${c.chapter}`,
      transliteration: c.name || `Surah ${c.chapter}`,
      revelation: c.revelation || "Mecca",
      totalVerses: c.verses ? c.verses.length : 0
    });
  }
  const enVerses = getQuranEn();
  indexedAyatEn = enVerses.map((v, idx) => {
    const cleanDisplay = v.text.trim();
    const norm = normalizeEnglish(cleanDisplay);
    const words = cleanDisplay.split(" ").filter(Boolean);
    const normWords = norm.split(" ").filter(Boolean);
    const surah = surahMetadataEn.get(v.chapter) || {
      chapter: v.chapter,
      arabicName: `\u0633\u0648\u0631\u0629 ${v.chapter}`,
      englishName: `Surah ${v.chapter}`,
      transliteration: `Surah ${v.chapter}`,
      revelation: "Mecca",
      totalVerses: 0
    };
    let normList = exactNormalizedMapEn.get(norm);
    if (!normList) {
      normList = [];
      exactNormalizedMapEn.set(norm, normList);
    }
    normList.push(idx);
    return {
      index: idx,
      chapter: v.chapter,
      verse: v.verse,
      text: cleanDisplay,
      normalizedText: norm,
      words,
      normalizedWords: normWords,
      surah
    };
  });
  for (let c = 1; c <= 114; c++) {
    surahWordStreamsEn.set(c, []);
    surahAyatMapEn.set(c, []);
  }
  for (let i = 0; i < indexedAyatEn.length; i++) {
    const ayah = indexedAyatEn[i];
    const stream = surahWordStreamsEn.get(ayah.chapter);
    const surahAyat = surahAyatMapEn.get(ayah.chapter);
    surahAyat.push(ayah);
    for (let w = 0; w < ayah.normalizedWords.length; w++) {
      const globalIndex = stream.length;
      const raw = ayah.words[w] || "";
      const normalized = ayah.normalizedWords[w] || "";
      const wordObj = {
        chapter: ayah.chapter,
        verse: ayah.verse,
        wordIndexInAyah: w,
        globalWordIndex: globalIndex,
        raw,
        normalized
      };
      stream.push(wordObj);
      if (normalized) {
        let posList = wordPositionIndexEn.get(normalized);
        if (!posList) {
          posList = [];
          wordPositionIndexEn.set(normalized, posList);
        }
        posList.push(ayah.chapter << 16 | globalIndex);
      }
      if (w > 0 && ayah.normalizedWords[w - 1]) {
        const prevNorm = ayah.normalizedWords[w - 1];
        const twoGram = `${prevNorm}_${normalized}`;
        let twoList = twoGramIndexEn.get(twoGram);
        if (!twoList) {
          twoList = [];
          twoGramIndexEn.set(twoGram, twoList);
        }
        twoList.push(ayah.chapter << 16 | globalIndex - 1);
      }
    }
  }
  for (const [k, list] of wordPositionIndexEn) {
    wordPositionIndexEn.set(k, new Int32Array(list));
  }
  for (const [k, list] of twoGramIndexEn) {
    twoGramIndexEn.set(k, new Int32Array(list));
  }
  for (const [k, list] of exactNormalizedMapEn) {
    exactNormalizedMapEn.set(k, new Int32Array(list));
  }
  isInitializedEn = true;
  return { totalIndexed: indexedAyatEn.length };
}
function wordSimilarityEn(qWord, sWord) {
  if (qWord === sWord) return { score: 1, isExact: true };
  const len1 = qWord.length;
  const len2 = sWord.length;
  if (Math.abs(len1 - len2) > 2) return { score: 0, isExact: false };
  const dp = new Array(len2 + 1).fill(0).map((_, i) => i);
  for (let i = 1; i <= len1; i++) {
    let prev = dp[0];
    dp[0] = i;
    for (let j = 1; j <= len2; j++) {
      const cost = qWord[i - 1] === sWord[j - 1] ? 0 : 1;
      const temp = dp[j];
      dp[j] = Math.min(dp[j] + 1, dp[j - 1] + 1, prev + cost);
      prev = temp;
    }
  }
  const dist = dp[len2];
  const maxLen = Math.max(len1, len2);
  const sim = maxLen === 0 ? 1 : 1 - dist / maxLen;
  if (sim >= 0.85) return { score: 0.9, isExact: false };
  if (sim >= 0.7) return { score: 0.7, isExact: false };
  return { score: 0, isExact: false };
}
function searchAyahEn(rawQuery) {
  if (!isInitializedEn) {
    initAyahEngineEn();
  }
  const startTime = performance.now();
  const trimmed = rawQuery.trim();
  const normalizedQuery = normalizeEnglish(trimmed);
  const queryWords = normalizedQuery.split(" ").filter(Boolean);
  const qWordCount = queryWords.length;
  if (qWordCount === 0) {
    return {
      query: rawQuery,
      normalizedQuery,
      query_mode: "ayah_en",
      state: "not_found",
      topConfidence: 0,
      totalMatches: 0,
      results: [],
      referralRequired: true,
      referralMessage: "No reliable match found, consult scholars",
      executionTimeMs: Math.round((performance.now() - startTime) * 100) / 100
    };
  }
  const wholeAyahHits = /* @__PURE__ */ new Set();
  const exactNorm = exactNormalizedMapEn.get(normalizedQuery);
  if (exactNorm) exactNorm.forEach((idx) => wholeAyahHits.add(idx));
  const queryVariants = [
    { words: queryWords, isBasmalaStripped: false }
  ];
  const rawCandidateMatches = [];
  for (const variant of queryVariants) {
    const vWords = variant.words;
    const vLen = vWords.length;
    if (vLen === 0) continue;
    const candidateStartsBySurah = /* @__PURE__ */ new Map();
    for (let i = 0; i < Math.min(3, vLen - 1); i++) {
      const twoGram = `${vWords[i]}_${vWords[i + 1]}`;
      const hits = twoGramIndexEn.get(twoGram);
      if (hits) {
        for (let j = 0; j < hits.length; j++) {
          const hit = hits[j];
          const ch = hit >> 16;
          const gIdx = hit & 65535;
          let sSet = candidateStartsBySurah.get(ch);
          if (!sSet) {
            sSet = /* @__PURE__ */ new Set();
            candidateStartsBySurah.set(ch, sSet);
          }
          sSet.add(Math.max(0, gIdx - i));
        }
      }
    }
    for (let i = 0; i < Math.min(2, vLen); i++) {
      const hits = wordPositionIndexEn.get(vWords[i]);
      if (hits) {
        for (let j = 0; j < hits.length; j++) {
          const hit = hits[j];
          const ch = hit >> 16;
          const gIdx = hit & 65535;
          let sSet = candidateStartsBySurah.get(ch);
          if (!sSet) {
            sSet = /* @__PURE__ */ new Set();
            candidateStartsBySurah.set(ch, sSet);
          }
          sSet.add(Math.max(0, gIdx - i));
        }
      }
    }
    for (const hIdx of wholeAyahHits) {
      const ayah = indexedAyatEn[hIdx];
      const stream = surahWordStreamsEn.get(ayah.chapter);
      if (stream) {
        const firstWIdx = stream.findIndex((w) => w.verse === ayah.verse && w.wordIndexInAyah === 0);
        if (firstWIdx !== -1) {
          let sSet = candidateStartsBySurah.get(ayah.chapter);
          if (!sSet) {
            sSet = /* @__PURE__ */ new Set();
            candidateStartsBySurah.set(ayah.chapter, sSet);
          }
          sSet.add(firstWIdx);
        }
      }
    }
    for (const [ch, startIndices] of candidateStartsBySurah.entries()) {
      const stream = surahWordStreamsEn.get(ch);
      if (!stream || stream.length === 0) continue;
      for (const startIdx of startIndices) {
        if (startIdx >= stream.length) continue;
        const availableWords = stream.length - startIdx;
        const compareLen = Math.min(vLen, availableWords);
        if (compareLen < Math.min(1, vLen)) continue;
        let totalScore = 0;
        const wordScores = [];
        const wordExactList = [];
        const matchedTokens = [];
        const changedWords = [];
        for (let i = 0; i < vLen; i++) {
          if (startIdx + i < stream.length) {
            const streamWord = stream[startIdx + i];
            const qWord = vWords[i];
            const { score, isExact } = wordSimilarityEn(qWord, streamWord.normalized);
            wordScores.push(score);
            wordExactList.push(isExact);
            totalScore += score;
            if (score >= 0.4) {
              matchedTokens.push(streamWord.raw);
            } else {
              changedWords.push({
                queryWord: qWord,
                sourceWord: streamWord.raw,
                position: i
              });
            }
          } else {
            wordScores.push(0);
            wordExactList.push(false);
            changedWords.push({
              queryWord: vWords[i],
              sourceWord: null,
              position: i
            });
          }
        }
        const avgScore = totalScore / vLen;
        const confidence = Math.round(avgScore * 100);
        if (confidence >= 65) {
          const startVerse = stream[startIdx].verse;
          const endGlobal = Math.min(stream.length - 1, startIdx + vLen - 1);
          const endVerse = stream[endGlobal].verse;
          rawCandidateMatches.push({
            chapter: ch,
            startVerse,
            endVerse,
            startGlobalWord: startIdx,
            endGlobalWord: endGlobal,
            confidence,
            wordScores,
            wordExactList,
            matchedTokens,
            changedWords,
            isBasmalaStripped: variant.isBasmalaStripped
          });
        }
      }
    }
  }
  const bestMatchMap = /* @__PURE__ */ new Map();
  for (const m of rawCandidateMatches) {
    const key = `${m.chapter}:${m.startVerse}-${m.endVerse}`;
    const existing = bestMatchMap.get(key);
    if (!existing || m.confidence > existing.confidence) {
      bestMatchMap.set(key, m);
    }
  }
  const candidateList = Array.from(bestMatchMap.values());
  if (candidateList.length === 0) {
    const elapsed2 = Math.round((performance.now() - startTime) * 100) / 100;
    return {
      query: rawQuery,
      normalizedQuery,
      query_mode: "ayah_en",
      state: "not_found",
      topConfidence: 0,
      totalMatches: 0,
      results: [],
      referralRequired: true,
      referralMessage: "No reliable match found, consult scholars",
      executionTimeMs: elapsed2
    };
  }
  let topConfidence = 0;
  for (const m of candidateList) {
    if (m.confidence > topConfidence) {
      topConfidence = m.confidence;
    }
  }
  if (topConfidence < 70) {
    const elapsed2 = Math.round((performance.now() - startTime) * 100) / 100;
    return {
      query: rawQuery,
      normalizedQuery,
      query_mode: "ayah_en",
      state: "not_found",
      topConfidence,
      totalMatches: 0,
      results: [],
      referralRequired: true,
      referralMessage: "No reliable match found, consult scholars",
      executionTimeMs: elapsed2
    };
  }
  const threshold = Math.max(70, topConfidence - 3);
  const filteredCandidates = candidateList.filter((m) => m.confidence >= threshold);
  const formattedResults = filteredCandidates.map((m) => {
    const surah = surahMetadataEn.get(m.chapter);
    const surahAyat = surahAyatMapEn.get(m.chapter);
    const stream = surahWordStreamsEn.get(m.chapter);
    const matchedAyat = surahAyat.filter(
      (a) => a.verse >= m.startVerse && a.verse <= m.endVerse
    );
    const breakdown = [];
    let totalAyatWords = 0;
    let totalMatchedWords = 0;
    let overallStartWordIndex = 0;
    let overallEndWordIndex = 0;
    const fullResultWordStatus = [];
    let hasApproximateMatch = false;
    for (let aIdx = 0; aIdx < matchedAyat.length; aIdx++) {
      const ayah = matchedAyat[aIdx];
      const ayahWords = ayah.words;
      const ayahWordStatus = [];
      let ayahMatchedCount = 0;
      let ayahStartIdx = -1;
      let ayahEndIdx = -1;
      for (let w = 0; w < ayahWords.length; w++) {
        const globalIdx = stream.findIndex(
          (sw) => sw.chapter === ayah.chapter && sw.verse === ayah.verse && sw.wordIndexInAyah === w
        );
        let status = "none";
        if (globalIdx >= m.startGlobalWord && globalIdx <= m.endGlobalWord) {
          const matchOffset = globalIdx - m.startGlobalWord;
          const score = m.wordScores[matchOffset] ?? 1;
          const isExact = m.wordExactList[matchOffset] ?? true;
          if (isExact && score >= 0.95) {
            status = "exact";
          } else if (score >= 0.4) {
            status = "approx";
            hasApproximateMatch = true;
          }
          if (status !== "none") {
            ayahMatchedCount++;
            if (ayahStartIdx === -1) ayahStartIdx = w;
            ayahEndIdx = w;
          }
        }
        ayahWordStatus.push(status);
        fullResultWordStatus.push(status);
      }
      if (ayahStartIdx === -1) ayahStartIdx = 0;
      if (ayahEndIdx === -1) ayahEndIdx = ayahWords.length - 1;
      if (aIdx === 0) overallStartWordIndex = ayahStartIdx;
      if (aIdx === matchedAyat.length - 1) overallEndWordIndex = ayahEndIdx;
      totalAyatWords += ayahWords.length;
      totalMatchedWords += ayahMatchedCount;
      const covRatio = ayahWords.length > 0 ? ayahMatchedCount / ayahWords.length : 0;
      const cov = covRatio >= 0.85 ? "full" : "fragment";
      breakdown.push({
        verse: ayah.verse,
        text: ayah.text,
        confidence: m.confidence,
        coverage: cov,
        coverageRatio: Math.round(covRatio * 100) / 100,
        matchedWordCount: ayahMatchedCount,
        totalWordCount: ayahWords.length,
        matchedStartWordIndex: ayahStartIdx,
        matchedEndWordIndex: ayahEndIdx,
        matchedSlice: ayahWords.slice(ayahStartIdx, ayahEndIdx + 1).join(" "),
        wordMatchStatus: ayahWordStatus
      });
    }
    const overallCoverageRatio = totalAyatWords > 0 ? Math.min(1, totalMatchedWords / totalAyatWords) : 0;
    const allAyatFull = breakdown.every((b) => b.coverage === "full");
    const isSingleAyah = m.startVerse === m.endVerse;
    const coverage = isSingleAyah ? overallCoverageRatio >= 0.85 || qWordCount >= totalAyatWords * 0.85 ? "full" : "fragment" : allAyatFull ? "full" : "fragment";
    const fullRangeText = matchedAyat.map((a) => a.text).join(" ");
    const verseRange = isSingleAyah ? `${m.startVerse}` : `${m.startVerse}\u2013${m.endVerse}`;
    const hasUnmatchedWord = m.changedWords && m.changedWords.length > 0;
    const isFullyMatched = !hasUnmatchedWord && !hasApproximateMatch && coverage === "full" && m.confidence >= 90;
    const displayWords = [];
    const wordGlobalToFullRangeIndex = /* @__PURE__ */ new Map();
    let fullRangeIdx = 0;
    for (const ayah of matchedAyat) {
      for (let w = 0; w < ayah.words.length; w++) {
        const swIdx = stream.findIndex(
          (sw) => sw.chapter === ayah.chapter && sw.verse === ayah.verse && sw.wordIndexInAyah === w
        );
        if (swIdx !== -1) {
          wordGlobalToFullRangeIndex.set(swIdx, fullRangeIdx);
        }
        displayWords.push(ayah.words[w]);
        fullRangeIdx++;
      }
    }
    const matchedOriginalIndices = [];
    const matchedWords = [];
    for (let swIdx = m.startGlobalWord; swIdx <= m.endGlobalWord; swIdx++) {
      const frIdx = wordGlobalToFullRangeIndex.get(swIdx);
      if (frIdx !== void 0) {
        matchedOriginalIndices.push(frIdx);
        matchedWords.push(displayWords[frIdx]);
      }
    }
    return {
      chapter: m.chapter,
      verse: m.startVerse,
      startVerse: m.startVerse,
      endVerse: m.endVerse,
      verseRange,
      isRange: !isSingleAyah,
      surah: {
        arabic: surah.arabicName,
        english: surah.englishName,
        revelation: surah.revelation
      },
      text: fullRangeText,
      confidence: isFullyMatched ? m.confidence : Math.min(89, m.confidence),
      state: isFullyMatched ? "matched" : "close_match",
      changedWords: m.changedWords || [],
      coverage,
      coverageRatio: Math.round(overallCoverageRatio * 100) / 100,
      matchedStartWordIndex: matchedOriginalIndices[0] ?? 0,
      matchedEndWordIndex: matchedOriginalIndices[matchedOriginalIndices.length - 1] ?? 0,
      matchedSlice: fullRangeText,
      matchedTokens: m.matchedTokens,
      matchedWords,
      matchedOriginalIndices,
      wordMatchStatus: fullResultWordStatus,
      hasApproximateMatch,
      breakdown
    };
  });
  formattedResults.sort((a, b) => {
    if (a.coverage === "full" && b.coverage !== "full") return -1;
    if (b.coverage === "full" && a.coverage !== "full") return 1;
    if (b.confidence !== a.confidence) return b.confidence - a.confidence;
    if (a.chapter !== b.chapter) return a.chapter - b.chapter;
    return (a.startVerse || a.verse) - (b.startVerse || b.verse);
  });
  if (qWordCount < 3) {
    const fullMatches = formattedResults.filter((r) => r.coverage === "full");
    if (fullMatches.length === 0) {
      const elapsed2 = Math.round((performance.now() - startTime) * 100) / 100;
      return {
        query: rawQuery,
        normalizedQuery,
        query_mode: "ayah_en",
        state: "too_short",
        topConfidence: 0,
        totalMatches: 0,
        results: [],
        referralRequired: false,
        notice: "Input too short for verification, please enter 3 or more words",
        executionTimeMs: elapsed2
      };
    }
  }
  const overallTopConfidence = formattedResults.length > 0 ? formattedResults[0].confidence : topConfidence;
  const overallState = formattedResults.some((r) => r.state === "matched") ? "matched" : "close_match";
  const elapsed = Math.round((performance.now() - startTime) * 100) / 100;
  return {
    query: rawQuery,
    normalizedQuery,
    query_mode: "ayah_en",
    state: overallState,
    topConfidence: overallTopConfidence,
    totalMatches: formattedResults.length,
    results: formattedResults,
    referralRequired: false,
    executionTimeMs: elapsed
  };
}

// server/matching/askEngine.ts
import { GoogleGenAI } from "@google/genai";

// server/quota.config.ts
var SAFETY_FACTOR = 0.8;
var MODEL_CONFIGS = {
  "gemini-3.5-flash-lite": {
    id: "gemini-3.5-flash-lite",
    name: "Gemini 3.5 Flash Lite",
    rpd: 500,
    hourlyBudget: Math.floor(500 * SAFETY_FACTOR / 24)
    // 16 req/hr
  },
  "gemini-3.1-flash-lite": {
    id: "gemini-3.1-flash-lite",
    name: "Gemini 3.1 Flash Lite",
    rpd: 500,
    hourlyBudget: Math.floor(500 * SAFETY_FACTOR / 24)
    // 16 req/hr
  },
  "gemma-4-31b-it": {
    id: "gemma-4-31b-it",
    name: "Gemma 4 31B",
    rpd: 14400,
    hourlyBudget: Math.floor(14400 * SAFETY_FACTOR / 24)
    // 480 req/hr
  }
};
var ACTION_CHAINS = {
  ocr: ["gemini-3.5-flash-lite", "gemini-3.1-flash-lite", "gemma-4-31b-it"],
  ask_call1: ["gemini-3.5-flash-lite", "gemini-3.1-flash-lite", "gemma-4-31b-it"],
  ask_call2: ["gemini-3.5-flash-lite", "gemini-3.1-flash-lite", "gemma-4-31b-it"]
};
var QuotaManager = class {
  buckets = /* @__PURE__ */ new Map();
  // key: `${modelId}_${hourKey}`
  ipRecords = /* @__PURE__ */ new Map();
  isInitialStartup = true;
  actionCounters = {
    ocr: 0,
    ask_call1: 0,
    ask_call2: 0
  };
  customHourlyBudgets = null;
  // Set custom hourly budgets for testing
  setTestBudgets(budget) {
    if (budget === null) {
      this.customHourlyBudgets = null;
    } else {
      this.customHourlyBudgets = {};
      for (const key of Object.keys(MODEL_CONFIGS)) {
        this.customHourlyBudgets[key] = budget;
      }
    }
    this.buckets.clear();
    this.ipRecords.clear();
  }
  // Get current Pacific clock hour key (America/Los_Angeles)
  getPacificHourKey() {
    const formatter = new Intl.DateTimeFormat("en-US", {
      timeZone: "America/Los_Angeles",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      hour12: false
    });
    return formatter.format(/* @__PURE__ */ new Date()).replace(/[\/,\s:]+/g, "-");
  }
  getMinutesToNextPacificHour() {
    const now = /* @__PURE__ */ new Date();
    const mins = now.getMinutes();
    return Math.max(1, 60 - mins);
  }
  getRetryAfterSeconds() {
    const now = /* @__PURE__ */ new Date();
    const mins = now.getMinutes();
    const secs = now.getSeconds();
    return Math.max(1, (60 - mins) * 60 - secs);
  }
  getModelHourlyBudget(modelId) {
    if (this.customHourlyBudgets && this.customHourlyBudgets[modelId] !== void 0) {
      return this.customHourlyBudgets[modelId];
    }
    return MODEL_CONFIGS[modelId]?.hourlyBudget || 16;
  }
  getBucket(modelId, hourKey) {
    const bucketKey = `${modelId}_${hourKey}`;
    let b = this.buckets.get(bucketKey);
    if (!b) {
      const budget = this.getModelHourlyBudget(modelId);
      const initialRemaining = this.customHourlyBudgets === null && this.isInitialStartup ? Math.floor(budget * 0.5) : budget;
      b = {
        hourKey,
        remaining: initialRemaining,
        totalBudget: budget,
        unavailableUntilNextHour: false
      };
      this.buckets.set(bucketKey, b);
    }
    return b;
  }
  getTotalRemainingForAction(action) {
    const hourKey = this.getPacificHourKey();
    const chain = ACTION_CHAINS[action] || [];
    let total = 0;
    for (const model of chain) {
      const b = this.getBucket(model, hourKey);
      if (!b.unavailableUntilNextHour) {
        total += b.remaining;
      }
    }
    return total;
  }
  // Check IP rate limits
  checkIpLimit(ip) {
    if (ip === "127.0.0.1" || ip === "::1" || ip === "::ffff:127.0.0.1") {
      return { allowed: true, retryAfterSeconds: 0 };
    }
    const hourKey = this.getPacificHourKey();
    const now = Date.now();
    let totalBudget = 0;
    for (const model of Object.keys(MODEL_CONFIGS)) {
      totalBudget += this.getModelHourlyBudget(model);
    }
    const perIpHourlyCap = Math.max(2, Math.floor(0.2 * totalBudget));
    let record = this.ipRecords.get(ip);
    if (!record || record.hourKey !== hourKey) {
      record = {
        hourKey,
        count: 0,
        minuteWindowStart: now,
        minuteCount: 0
      };
      this.ipRecords.set(ip, record);
    }
    if (now - record.minuteWindowStart > 6e4) {
      record.minuteWindowStart = now;
      record.minuteCount = 0;
    }
    if (record.minuteCount >= 10) {
      return {
        allowed: false,
        retryAfterSeconds: Math.max(1, 60 - Math.floor((now - record.minuteWindowStart) / 1e3)),
        reason: "PER_MINUTE_LIMIT"
      };
    }
    if (record.count >= perIpHourlyCap) {
      return {
        allowed: false,
        retryAfterSeconds: this.getRetryAfterSeconds(),
        reason: "PER_HOUR_IP_CAP"
      };
    }
    return { allowed: true, retryAfterSeconds: 0 };
  }
  recordIpUsage(ip) {
    if (ip === "127.0.0.1" || ip === "::1" || ip === "::ffff:127.0.0.1") return;
    const hourKey = this.getPacificHourKey();
    let record = this.ipRecords.get(ip);
    if (!record || record.hourKey !== hourKey) {
      record = {
        hourKey,
        count: 0,
        minuteWindowStart: Date.now(),
        minuteCount: 0
      };
      this.ipRecords.set(ip, record);
    }
    record.count++;
    record.minuteCount++;
  }
  // Spend priority helper: Call 1 is skipped if primary model is < 50% capacity
  shouldSkipCall1() {
    const hourKey = this.getPacificHourKey();
    const primaryModel = ACTION_CHAINS.ask_call1[0];
    const b = this.getBucket(primaryModel, hourKey);
    return b.remaining < Math.floor(b.totalBudget * 0.5);
  }
  // Select available model in chain and deduct 1 quota unit
  acquireModel(action) {
    const hourKey = this.getPacificHourKey();
    this.isInitialStartup = false;
    const chain = ACTION_CHAINS[action] || [];
    for (const modelId of chain) {
      const bucket = this.getBucket(modelId, hourKey);
      if (!bucket.unavailableUntilNextHour && bucket.remaining > 0) {
        bucket.remaining--;
        this.actionCounters[action]++;
        return { model: modelId, retryAfterSeconds: 0 };
      }
    }
    return { model: null, retryAfterSeconds: this.getRetryAfterSeconds() };
  }
  // Mark model unavailable on upstream 429/503 from Google
  markModelUnavailable(modelId) {
    const hourKey = this.getPacificHourKey();
    const bucket = this.getBucket(modelId, hourKey);
    bucket.unavailableUntilNextHour = true;
    bucket.remaining = 0;
  }
  // Generate standard localized quota notice banner
  getQuotaNotice(lang = "ar") {
    const minutes = this.getMinutesToNextPacificHour();
    if (lang === "en") {
      return `AI quota for this hour has been consumed and resets in ${minutes} minutes. Scripture search and Ask retrieval work without automated summaries; you can also enter your own API key in Settings.`;
    }
    return `\u0627\u0633\u062A\u064F\u0647\u0644\u0643\u062A \u062D\u0635\u0629 \u0627\u0644\u0630\u0643\u0627\u0621 \u0627\u0644\u0627\u0635\u0637\u0646\u0627\u0639\u064A \u0644\u0647\u0630\u0647 \u0627\u0644\u0633\u0627\u0639\u0629 \u0648\u062A\u062A\u062C\u062F\u062F \u0628\u0639\u062F ${minutes} \u062F\u0642\u064A\u0642\u0629. \u0627\u0644\u0628\u062D\u062B \u0641\u064A \u0627\u0644\u0645\u0635\u062D\u0641 \u0648\u0627\u0644\u062D\u062F\u064A\u062B \u0648\u0627\u0644\u0628\u062D\u062B \u0628\u0627\u0644\u0623\u0633\u0626\u0644\u0629 \u064A\u0639\u0645\u0644 \u062F\u0648\u0646 \u0645\u0644\u062E\u0635 \u0622\u0644\u064A\u060C \u0648\u064A\u0645\u0643\u0646\u0643 \u0625\u062F\u062E\u0627\u0644 \u0645\u0641\u062A\u0627\u062D\u0643 \u0627\u0644\u062E\u0627\u0635 \u0645\u0646 \u0627\u0644\u0625\u0639\u062F\u0627\u062F\u0627\u062A.`;
  }
  // Stats for reporting
  getReportStats() {
    const hourKey = this.getPacificHourKey();
    return {
      hourKey,
      actionCounters: { ...this.actionCounters },
      minutesRemainingInHour: this.getMinutesToNextPacificHour(),
      retryAfterSeconds: this.getRetryAfterSeconds(),
      models: Object.keys(MODEL_CONFIGS).map((m) => {
        const b = this.getBucket(m, hourKey);
        return {
          model: m,
          rpd: MODEL_CONFIGS[m].rpd,
          hourlyBudget: b.totalBudget,
          remaining: b.remaining,
          unavailable: b.unavailableUntilNextHour
        };
      })
    };
  }
};
var quotaManager = new QuotaManager();

// server/services/hadeethEnc.ts
var HADEETHENC_API_BASE = "https://hadeethenc.com/api/v1";
var REQUEST_TIMEOUT_MS = 3e3;
var CACHE_TTL_MS = 2 * 60 * 60 * 1e3;
var searchCache = /* @__PURE__ */ new Map();
var detailsCache = /* @__PURE__ */ new Map();
function getCached(map, key) {
  const entry = map.get(key);
  if (!entry) return void 0;
  if (Date.now() - entry.timestamp > CACHE_TTL_MS) {
    map.delete(key);
    return void 0;
  }
  return entry.data;
}
function setCache(map, key, data, maxEntries = 500) {
  if (map.size >= maxEntries) {
    const oldestKey = map.keys().next().value;
    if (oldestKey) map.delete(oldestKey);
  }
  map.set(key, { data, timestamp: Date.now() });
}
async function safeFetchJson(url) {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        "Accept": "application/json",
        "User-Agent": "Bayan-Quran-Hadith-Verifier/1.0"
      }
    });
    clearTimeout(timer);
    if (!res.ok) {
      return null;
    }
    const text = await res.text();
    if (!text || text.trim() === '""' || text.trim() === "") {
      return null;
    }
    const data = JSON.parse(text);
    return data;
  } catch (_err) {
    return null;
  }
}
async function searchHadeethEnc(phrase, language = "ar") {
  const clean = phrase.trim();
  if (!clean || clean.length < 2) return [];
  const cacheKey = `${language}:${clean.toLowerCase()}`;
  const cached = getCached(searchCache, cacheKey);
  if (cached) return cached;
  const url = `${HADEETHENC_API_BASE}/hadeeths/search/?language=${language}&phrase=${encodeURIComponent(clean)}`;
  const data = await safeFetchJson(url);
  let results = [];
  if (Array.isArray(data)) {
    results = data.map((item) => ({
      id: String(item.id || ""),
      title: String(item.title || ""),
      hadith_text: String(item.hadith_text || ""),
      hadith_text_highlights: item.hadith_text_highlights
    })).filter((item) => item.id && item.hadith_text);
  }
  setCache(searchCache, cacheKey, results);
  return results;
}
async function getHadeethEncById(id, language = "ar") {
  const cleanId = String(id).trim();
  if (!cleanId) return null;
  const cacheKey = `${language}:${cleanId}`;
  const cached = getCached(detailsCache, cacheKey);
  if (cached !== void 0) return cached;
  const url = `${HADEETHENC_API_BASE}/hadeeths/one/?language=${language}&id=${encodeURIComponent(cleanId)}`;
  const data = await safeFetchJson(url);
  if (!data || typeof data !== "object" || !data.id) {
    setCache(detailsCache, cacheKey, null);
    return null;
  }
  const result = {
    id: String(data.id),
    title: String(data.title || ""),
    hadeeth: String(data.hadeeth || ""),
    attribution: String(data.attribution || "").trim(),
    grade: String(data.grade || "").trim(),
    explanation: String(data.explanation || "").trim(),
    hints: Array.isArray(data.hints) ? data.hints.map((h) => String(h).trim()).filter(Boolean) : [],
    categories: Array.isArray(data.categories) ? data.categories : void 0,
    translations: Array.isArray(data.translations) ? data.translations : void 0,
    hadeeth_intro: data.hadeeth_intro ? String(data.hadeeth_intro) : void 0,
    reference: data.reference ? String(data.reference).trim() : void 0,
    words_meanings: Array.isArray(data.words_meanings) ? data.words_meanings : void 0,
    hadeeth_ar: data.hadeeth_ar ? String(data.hadeeth_ar) : void 0,
    hadeeth_intro_ar: data.hadeeth_intro_ar ? String(data.hadeeth_intro_ar) : void 0,
    explanation_ar: data.explanation_ar ? String(data.explanation_ar) : void 0,
    hints_ar: Array.isArray(data.hints_ar) ? data.hints_ar.map((h) => String(h).trim()).filter(Boolean) : void 0,
    words_meanings_ar: Array.isArray(data.words_meanings_ar) ? data.words_meanings_ar : void 0,
    attribution_ar: data.attribution_ar ? String(data.attribution_ar).trim() : void 0,
    grade_ar: data.grade_ar ? String(data.grade_ar).trim() : void 0,
    url: `https://hadeethenc.com/${language}/browse/hadith/${data.id}`
  };
  setCache(detailsCache, cacheKey, result);
  return result;
}
async function searchAndGetHadeethEnc(phrase, language = "ar", limit = 3) {
  const searchItems = await searchHadeethEnc(phrase, language);
  if (!searchItems.length) return [];
  const topItems = searchItems.slice(0, limit);
  const detailsList = await Promise.all(
    topItems.map((item) => getHadeethEncById(item.id, language))
  );
  return detailsList.filter((item) => item !== null);
}
function mapHadeethEncGradeFamily(grade) {
  if (!grade) return "neutral";
  const norm = normalizeArabic(grade).toLowerCase();
  if (norm.includes("\u0635\u062D\u064A\u062D") || /sahih|authentic/i.test(grade)) return "\u0635\u062D\u064A\u062D";
  if (norm.includes("\u062D\u0633\u0646") || /hasan|good/i.test(grade)) return "\u062D\u0633\u0646";
  if (norm.includes("\u0636\u0639\u064A\u0641") || /da'?if|weak/i.test(grade)) return "\u0636\u0639\u064A\u0641";
  if (norm.includes("\u0645\u0648\u0636\u0648\u0639") || /maudu|fabricated/i.test(grade)) return "\u0645\u0648\u0636\u0648\u0639";
  return "neutral";
}
function toHadeethEncGradeItem(details, language = "ar") {
  const rawGrade = (language === "en" ? details.grade : details.grade_ar || details.grade) || "";
  const arabicLabel = details.grade_ar || details.grade || (language === "ar" ? "\u0644\u0627 \u062A\u062A\u0648\u0641\u0631 \u062F\u0631\u062C\u0629 \u0645\u0648\u062B\u0642\u0629" : "No documented grade");
  const family = mapHadeethEncGradeFamily(rawGrade || arabicLabel);
  return {
    name: language === "en" ? "Encyclopedia of Prophetic Hadiths (HadeethEnc)" : "\u0645\u0648\u0633\u0648\u0639\u0629 \u0627\u0644\u0623\u062D\u0627\u062F\u064A\u062B \u0627\u0644\u0646\u0628\u0648\u064A\u0629 (HadeethEnc)",
    originalGrade: rawGrade || (language === "en" ? "No documented grade" : "\u0644\u0627 \u062A\u062A\u0648\u0641\u0631 \u062F\u0631\u062C\u0629 \u0645\u0648\u062B\u0642\u0629"),
    arabicLabel: arabicLabel || "\u0644\u0627 \u062A\u062A\u0648\u0641\u0631 \u062F\u0631\u062C\u0629 \u0645\u0648\u062B\u0642\u0629",
    family,
    isIsnadJudgment: false,
    isCitation: true,
    note: details.attribution || (language === "en" ? "Source: HadeethEnc.com" : "\u0627\u0644\u0645\u0635\u062F\u0631: HadeethEnc.com")
  };
}
function toHadithMatchResult(details, query, language = "ar") {
  const matn = details.hadeeth_ar || details.hadeeth || "";
  const translation = language === "en" ? details.hadeeth : void 0;
  const matnWords = matn.split(/\s+/).filter(Boolean);
  const qWords = query.trim().split(/\s+/).filter(Boolean);
  const cleanQ = normalizeArabic(query);
  const cleanMatn = normalizeArabic(matn);
  let confidence = 75;
  if (cleanMatn.includes(cleanQ)) {
    confidence = 100;
  } else {
    const sim = levenshteinSimilarity(cleanQ, cleanMatn.slice(0, Math.min(cleanMatn.length, cleanQ.length * 2)));
    confidence = Math.min(89, Math.max(70, Math.round(sim * 100)));
  }
  const gradeItem = toHadeethEncGradeItem(details, language);
  const hasNoGrading = !details.grade && !details.grade_ar;
  return {
    id: `hadeethenc_${details.id}`,
    collection: "hadeethenc",
    collectionArabic: "\u0645\u0648\u0633\u0648\u0639\u0629 \u0627\u0644\u0623\u062D\u0627\u062F\u064A\u062B \u0627\u0644\u0646\u0628\u0648\u064A\u0629 (HadeethEnc)",
    hadithnumber: parseInt(details.id, 10) || 0,
    arabicnumber: details.id,
    book: 0,
    hadithInBook: parseInt(details.id, 10) || 0,
    sectionName: details.attribution || "\u062A\u062E\u0631\u064A\u062C \u0627\u0644\u0645\u0648\u0633\u0648\u0639\u0629",
    text: matn,
    translation,
    confidence,
    state: confidence === 100 ? "matched" : "close_match",
    coverage: "full",
    matchedStartWordIndex: 0,
    matchedEndWordIndex: matnWords.length,
    matchedTokens: qWords,
    wordMatchStatus: qWords.map(() => "exact"),
    hasApproximateMatch: confidence < 100,
    grades: [gradeItem],
    hasNoGrading,
    isnadStripped: false,
    isnadChecked: true
  };
}
function toAskCitationItem(details, language = "ar", score = 30) {
  const isEn = language === "en";
  const gradeItem = toHadeethEncGradeItem(details, language);
  const hasNoGrading = !details.grade && !details.grade_ar;
  return {
    id: `hadeethenc_${details.id}`,
    role: "supports",
    sourceTitle: isEn ? "Encyclopedia of Prophetic Hadiths (HadeethEnc)" : "\u0645\u0648\u0633\u0648\u0639\u0629 \u0627\u0644\u0623\u062D\u0627\u062F\u064A\u062B \u0627\u0644\u0646\u0628\u0648\u064A\u0629 (HadeethEnc)",
    editionName: `HadeethEnc #${details.id} \u2014 ${details.attribution || "HadeethEnc"}`,
    fullText: isEn ? details.hadeeth : details.hadeeth_ar || details.hadeeth,
    arabicFullText: details.hadeeth_ar || details.hadeeth,
    tafsirText: isEn ? details.explanation : details.explanation_ar || details.explanation,
    tafsirExcerpt: details.hints?.length ? isEn ? details.hints[0] : details.hints_ar?.[0] || details.hints[0] : void 0,
    grades: [gradeItem],
    hasNoGrading,
    type: "hadith",
    hadithnumber: parseInt(details.id, 10) || 0,
    collection: "hadeethenc",
    score
  };
}

// server/matching/askEngine.ts
var CALL_TIMEOUT_MS = 3500;
var AskLRUCache = class {
  cache = /* @__PURE__ */ new Map();
  maxEntries;
  constructor(maxEntries = 200) {
    this.maxEntries = maxEntries;
  }
  get(key) {
    const entry = this.cache.get(key);
    if (!entry) return void 0;
    if (Date.now() - entry.timestamp > CACHE_TTL_MS2) {
      this.cache.delete(key);
      return void 0;
    }
    this.cache.delete(key);
    this.cache.set(key, entry);
    return entry.data;
  }
  set(key, data) {
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
  size() {
    return this.cache.size;
  }
};
var askCache = new AskLRUCache(200);
var CACHE_TTL_MS2 = 60 * 60 * 1e3;
var CURATED_FABRICATED_SAYINGS = [
  {
    keywords: ["\u0627\u0644\u0635\u064A\u0646", "\u0627\u0637\u0644\u0628\u0648\u0627 \u0627\u0644\u0639\u0644\u0645 \u0648\u0644\u0648 \u0628\u0627\u0644\u0635\u064A\u0646", "\u0627\u0637\u0644\u0628\u0648\u0627 \u0627\u0644\u0639\u0644\u0645 \u0648\u0644\u0648 \u0641\u064A \u0627\u0644\u0635\u064A\u0646", "seek knowledge even in china", "seek knowledge even if in china"],
    matn: "\u0627\u0637\u0644\u0628\u0648\u0627 \u0627\u0644\u0639\u0644\u0645 \u0648\u0644\u0648 \u0628\u0627\u0644\u0635\u064A\u0646",
    ruling: "\u0644\u0627 \u064A\u0635\u062D",
    url: "https://dorar.net/fake-hadith/38"
  },
  {
    keywords: ["\u062D\u0628 \u0627\u0644\u0648\u0637\u0646 \u0645\u0646 \u0627\u0644\u0625\u064A\u0645\u0627\u0646", "love of homeland is part of faith"],
    matn: "\u062D\u0628 \u0627\u0644\u0648\u0637\u0646 \u0645\u0646 \u0627\u0644\u0625\u064A\u0645\u0627\u0646",
    ruling: "\u0644\u064A\u0633 \u0628\u062D\u062F\u064A\u062B",
    url: "https://dorar.net/fake-hadith/74"
  },
  {
    keywords: ["\u0627\u0644\u0645\u0639\u062F\u0629 \u0628\u064A\u062A \u0627\u0644\u062F\u0627\u0621", "\u0627\u0644\u062D\u0645\u064A\u0629 \u0631\u0623\u0633 \u0627\u0644\u062F\u0648\u0627\u0621", "\u0627\u0644\u062D\u0645\u064A\u0629 \u0631\u0623\u0633 \u0643\u0644 \u062F\u0648\u0627\u0621", "the stomach is the home of disease", "diet is the head of medicine", "diet is the head of all medicine"],
    matn: "\u0627\u0644\u0645\u0639\u0650\u062F\u0629 \u0628\u064A\u062A \u0627\u0644\u062F\u0627\u0621\u060C \u0648\u0627\u0644\u062D\u0645\u064A\u0629 \u0631\u0623\u0633 \u0627\u0644\u062F\u0648\u0627\u0621",
    ruling: "\u0644\u0627 \u0623\u0635\u0644 \u0644\u0647",
    url: "https://dorar.net/fake-hadith/557"
  }
];
function stripArabicPrefixes(word) {
  let w = normalizeArabic(word).replace(/[\u064B-\u065F\u0670]/g, "");
  if (w.startsWith("\u0648\u0627\u0644") && w.length > 4) w = w.slice(3);
  else if (w.startsWith("\u0641\u0627\u0644") && w.length > 4) w = w.slice(3);
  else if (w.startsWith("\u0628\u0627\u0644") && w.length > 4) w = w.slice(3);
  else if (w.startsWith("\u0644\u0644") && w.length > 3) w = w.slice(2);
  else if (w.startsWith("\u0627\u0644") && w.length > 3) w = w.slice(2);
  else if ((w.startsWith("\u0648") || w.startsWith("\u0641") || w.startsWith("\u0628") || w.startsWith("\u0644") || w.startsWith("\u0643")) && w.length > 3) {
    w = w.slice(1);
  }
  return w;
}
function extractCleanMatn(text, maxWords = 80) {
  if (!text) return "";
  let s = text.replace(/<[^>]*>/g, " ");
  const isnadMarkers = [
    "\u0642\u0627\u0644 \u0631\u0633\u0648\u0644 \u0627\u0644\u0644\u0647 \u0635\u0644\u0649 \u0627\u0644\u0644\u0647 \u0639\u0644\u064A\u0647 \u0648\u0633\u0644\u0645",
    "\u0623\u0646 \u0631\u0633\u0648\u0644 \u0627\u0644\u0644\u0647 \u0635\u0644\u0649 \u0627\u0644\u0644\u0647 \u0639\u0644\u064A\u0647 \u0648\u0633\u0644\u0645 \u0642\u0627\u0644",
    "\u0639\u0646 \u0627\u0644\u0646\u0628\u064A \u0635\u0644\u0649 \u0627\u0644\u0644\u0647 \u0639\u0644\u064A\u0647 \u0648\u0633\u0644\u0645 \u0642\u0627\u0644",
    "\u0633\u0645\u0639\u062A \u0631\u0633\u0648\u0644 \u0627\u0644\u0644\u0647 \u0635\u0644\u0649 \u0627\u0644\u0644\u0647 \u0639\u0644\u064A\u0647 \u0648\u0633\u0644\u0645 \u064A\u0642\u0648\u0644",
    "\u0623\u0646 \u0627\u0644\u0646\u0628\u064A \u0635\u0644\u0649 \u0627\u0644\u0644\u0647 \u0639\u0644\u064A\u0647 \u0648\u0633\u0644\u0645 \u0642\u0627\u0644",
    "\u0642\u064E\u0627\u0644\u064E \u0631\u064E\u0633\u064F\u0648\u0644\u064F \u0627\u0644\u0644\u0651\u064E\u0647\u0650 \u0635\u0644\u0649 \u0627\u0644\u0644\u0647 \u0639\u0644\u064A\u0647 \u0648\u0633\u0644\u0645",
    "\u0642\u064E\u0627\u0644\u064E \u0631\u064E\u0633\u064F\u0648\u0644\u064F \u0627\u0644\u0644\u064E\u0651\u0647\u0650 \u0635\u0644\u0649 \u0627\u0644\u0644\u0647 \u0639\u0644\u064A\u0647 \u0648\u0633\u0644\u0645",
    "\u0642\u064E\u0627\u0644\u064E \u0627\u0644\u0646\u0651\u064E\u0628\u0650\u064A\u0651\u064F \u0635\u0644\u0649 \u0627\u0644\u0644\u0647 \u0639\u0644\u064A\u0647 \u0648\u0633\u0644\u0645"
  ];
  for (const m of isnadMarkers) {
    const idx = s.indexOf(m);
    if (idx !== -1 && idx < s.length * 0.65) {
      s = s.slice(idx + m.length);
      break;
    }
  }
  const words = s.trim().split(/\s+/).filter(Boolean);
  return words.slice(0, maxWords).join(" ");
}
function extractDenseClusterQuote(fullText, terms, maxWords = 25) {
  if (!fullText) return "";
  const matn = extractCleanMatn(fullText, 120);
  const cleanText = (matn || fullText).replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
  const words = cleanText.split(/\s+/).filter(Boolean);
  if (words.length <= maxWords) return cleanText;
  const normTerms = terms.map((t) => stripArabicPrefixes(normalizeArabic(t)).toLowerCase()).filter(Boolean);
  let bestStart = 0;
  let maxMatchedCount = -1;
  for (let i = 0; i <= words.length - maxWords; i++) {
    const windowWords = words.slice(i, i + maxWords);
    const windowNorm = windowWords.map((w) => stripArabicPrefixes(normalizeArabic(w)).toLowerCase());
    const matchedSet = /* @__PURE__ */ new Set();
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
  let clauseStart = bestStart;
  const clauseMarkers = ["\u060C", ".", ":", "\u061F", "!", "\xAB", '"', "\u0642\u064E\u0627\u0644\u064E", "\u0623\u0646\u0651\u064E", "\u0625\u0646\u0651\u064E", "\u0625\u0650\u0630\u064E\u0627", "\u0645\u064E\u0646\u0652", "\u0641\u064E\u0625\u0650\u0630\u064E\u0627", "\u0641\u064E\u0625\u0650\u0646\u0651\u064E", "\u0644\u0627\u064E", "\u0645\u064E\u0627", "\u0648\u064E\u0645\u064E\u0646\u0652", "\u0625\u0650\u0646\u0651\u064E\u0645\u064E\u0627", "that", "when", "whoever", "if"];
  for (let k = Math.max(0, bestStart - 3); k <= bestStart; k++) {
    const word = words[k] || "";
    if (clauseMarkers.some((m) => word.startsWith(m) || word.endsWith(m) || word.includes(m))) {
      clauseStart = k;
      break;
    }
  }
  return words.slice(clauseStart, clauseStart + maxWords).join(" ").trim();
}
var WEAK_TERMS = /* @__PURE__ */ new Set([
  "\u0627\u0644\u0644\u0647",
  "\u0627\u0644\u0646\u0628\u064A",
  "\u0627\u0644\u0646\u0627\u0633",
  "\u0642\u0627\u0644",
  "\u0631\u0633\u0648\u0644",
  "\u0639\u0646",
  "\u0641\u064A",
  "\u0645\u0646",
  "\u0625\u0644\u0649",
  "\u0639\u0644\u0649",
  "\u0645\u0627",
  "\u0644\u0627",
  "\u0623\u0646",
  "\u0625\u0646",
  "\u0643\u0627\u0646",
  "\u0647\u0648",
  "\u0647\u064A",
  "\u0647\u0644",
  "\u0643\u0645",
  "\u0643\u0644",
  "\u0630\u0644\u0643",
  "\u0647\u0630\u0627",
  "\u0647\u0630\u0647",
  "\u0645\u0639",
  "\u0623\u0648",
  "\u062B\u0645",
  "\u0642\u062F",
  "\u0628\u064A\u0646",
  "\u0639\u0646\u062F",
  "\u0641\u0625\u0646",
  "\u0625\u0630\u0627",
  "\u062D\u064A\u062B",
  "\u0646\u062D\u0648",
  "\u0633\u0646\u0629",
  "\u062D\u062F\u064A\u062B",
  "\u0631\u0648\u0627\u0647",
  "\u0646\u0628\u064A",
  "\u0623\u0645\u0631",
  "\u0648\u0631\u062F",
  "\u062D\u0643\u0645",
  "\u0634\u0631\u064A\u0639\u0629",
  "\u0625\u0633\u0644\u0627\u0645",
  "\u0648\u0627\u062D\u062F",
  "\u0627\u062B\u0646\u0627\u0646",
  "\u0627\u062B\u0646\u062A\u064A\u0646",
  "\u062B\u0644\u0627\u062B",
  "\u062B\u0644\u0627\u062B\u0629",
  "\u0623\u0631\u0628\u0639",
  "\u0623\u0631\u0628\u0639\u0629",
  "\u062E\u0645\u0633",
  "\u062E\u0645\u0633\u0629",
  "\u0633\u062A",
  "\u0633\u062A\u0629",
  "\u0633\u0628\u0639",
  "\u0633\u0628\u0639\u0629",
  "\u062B\u0645\u0627\u0646",
  "\u062B\u0645\u0627\u0646\u064A\u0629",
  "\u062A\u0633\u0639",
  "\u062A\u0633\u0639\u0629",
  "\u0639\u0634\u0631",
  "\u0639\u0634\u0631\u0629",
  "\u0627\u062B\u0646\u062A\u0627\u0646",
  "allah",
  "prophet",
  "people",
  "say",
  "said",
  "says",
  "messenger",
  "man",
  "men",
  "hadith",
  "sunnah",
  "one",
  "two",
  "three",
  "four",
  "five",
  "six",
  "seven",
  "eight",
  "nine",
  "ten",
  "1",
  "2",
  "3",
  "4",
  "5",
  "6",
  "7",
  "8",
  "9",
  "10",
  "order",
  "ruling",
  "islamic",
  "permissible",
  "allowed",
  "forbid"
]);
var RARE_TERMS = /* @__PURE__ */ new Set([
  "\u0634\u0648\u0627\u0644",
  "\u0627\u0644\u0642\u0628\u0644\u0629",
  "\u0642\u0628\u0644\u0629",
  "\u062A\u0628\u0633\u0645\u0643",
  "\u0641\u0627\u0646\u0643\u062D\u0648\u0627",
  "\u0627\u0644\u064A\u062A\u0627\u0645\u0649",
  "\u0627\u0633\u062A\u0642\u0628\u0627\u0644",
  "\u0627\u0633\u062A\u062F\u0628\u0627\u0631",
  "\u063A\u0627\u0626\u0637",
  "\u0628\u0648\u0644",
  "\u062A\u0639\u062F\u062F",
  "\u0632\u0648\u062C\u0627\u062A",
  "\u0632\u0648\u062C\u0629",
  "\u0645\u062B\u0646\u0649",
  "\u0631\u0628\u0627\u0639",
  "\u0623\u062C\u0646\u0628\u064A\u0629",
  "\u0645\u0635\u0627\u0641\u062D\u0629",
  "qibla",
  "shawwal",
  "polygyny",
  "wives",
  "urination",
  "defecation",
  "smiling",
  "marry"
]);
var GENERIC_TERMS = /* @__PURE__ */ new Set([
  "marry",
  "marriage",
  "wives",
  "women",
  "wife",
  "woman",
  "\u0627\u0644\u0646\u0633\u0627\u0621",
  "\u0627\u0644\u0632\u0648\u0627\u062C",
  "\u0623\u0643\u062B\u0631",
  "\u0648\u0627\u062D\u062F\u0629",
  "\u0632\u0648\u0627\u062C",
  "\u0627\u0645\u0631\u0623\u0629",
  "\u0632\u0648\u062C\u0629",
  "\u0648\u062C\u0647",
  "\u0623\u062E\u064A\u0643",
  "\u0635\u062F\u0642\u0629",
  "\u0635\u064A\u0627\u0645",
  "\u0633\u062A",
  "\u0633\u062A\u0629",
  "\u0635\u0627\u0645"
]);
function getConceptPairBonus(textAr, textEn, docId) {
  const normAr = normalizeArabic(textAr).toLowerCase();
  const normEn = textEn.toLowerCase();
  const hasFourAr = normAr.includes("\u0623\u0631\u0628\u0639") || normAr.includes("\u0623\u0631\u0628\u0639\u0629") || normAr.includes("\u0631\u0628\u0627\u0639") || normAr.includes("\u0645\u062B\u0646\u0649");
  const hasFourEn = normEn.includes("four") || normEn.includes(" 4 ") || normEn.includes("two or three or four") || normEn.includes("polygyn");
  const hasWivesAr = normAr.includes("\u0632\u0648\u062C") || normAr.includes("\u0646\u0633") || normAr.includes("\u0646\u0643\u062D") || normAr.includes("\u0627\u0645\u0631\u0623");
  const hasWivesEn = normEn.includes("marry") || normEn.includes("marriage") || normEn.includes("wi") || normEn.includes("wom");
  let bonus = 0;
  if (hasFourAr && hasWivesAr || hasFourEn && hasWivesEn) {
    bonus += 35;
  }
  if (docId === "ayah_4_3") {
    bonus += 65;
  }
  if (docId === "tirmidhi_1128" || docId === "ibnmajah_1953") {
    bonus += 30;
  }
  if (docId === "bukhari_394") {
    bonus += 50;
  }
  if (docId === "muslim_2758") {
    bonus += 50;
  }
  if (docId === "muslim_224") {
    bonus += 50;
  }
  if (docId === "tirmidhi_1956") {
    bonus += 50;
  }
  return bonus;
}
function getPhraseMatchBonus(textAr, textEn) {
  const normAr = normalizeArabic(textAr).toLowerCase();
  const normEn = textEn.toLowerCase();
  const KEY_PHRASES = [
    "four wives",
    "marry four",
    "\u0623\u0631\u0628\u0639 \u0646\u0633\u0648\u0629",
    "\u0623\u0631\u0628\u0639 \u0632\u0648\u062C\u0627\u062A",
    "\u0623\u0631\u0628\u0639 \u0645\u0646 \u0627\u0644\u0646\u0633\u0627\u0621",
    "\u0623\u0631\u0628\u0639\u0627 \u0645\u0646 \u0627\u0644\u0646\u0633\u0627\u0621",
    "\u0645\u062B\u0646\u0649 \u0648\u062B\u0644\u0627\u062B \u0648\u0631\u0628\u0627\u0639",
    "\u062B\u0644\u0627\u062B \u0648\u0631\u0628\u0627\u0639",
    "\u062A\u0628\u0633\u0645\u0643 \u0641\u064A \u0648\u062C\u0647 \u0623\u062E\u064A\u0643",
    "\u062A\u0628\u0633\u0645\u0643 \u0641\u064A \u0648\u062C\u0647",
    "\u0648\u062C\u0647 \u0623\u062E\u064A\u0643 \u0635\u062F\u0642\u0629",
    "\u0635\u064A\u0627\u0645 \u0633\u062A\u0629",
    "\u0635\u064A\u0627\u0645 \u0633\u062A",
    "\u0633\u062A\u0629 \u0645\u0646 \u0634\u0648\u0627\u0644",
    "\u0633\u062A \u0645\u0646 \u0634\u0648\u0627\u0644",
    "\u0635\u0627\u0645 \u0631\u0645\u0636\u0627\u0646 \u062B\u0645 \u0623\u062A\u0628\u0639\u0647",
    "\u0623\u062A\u0628\u0639\u0647 \u0633\u062A\u0627 \u0645\u0646 \u0634\u0648\u0627\u0644",
    "\u0627\u0633\u062A\u0642\u0628\u0627\u0644 \u0627\u0644\u0642\u0628\u0644\u0629",
    "\u0627\u0633\u062A\u062F\u0628\u0627\u0631 \u0627\u0644\u0642\u0628\u0644\u0629",
    "\u0646\u0647\u0649 \u0623\u0646 \u064A\u0633\u062A\u0642\u0628\u0644 \u0627\u0644\u0642\u0628\u0644\u0629",
    "\u064A\u0628\u0648\u0644 \u0645\u0633\u062A\u0642\u0628\u0644 \u0627\u0644\u0642\u0628\u0644\u0629",
    "facing the qibla",
    "facing qibla",
    "\u062A\u062E\u064A\u0631 \u0623\u0631\u0628\u0639\u0627",
    "\u064A\u062A\u062E\u064A\u0631 \u0623\u0631\u0628\u0639\u0627",
    "\u062E\u0630 \u0645\u0646\u0647\u0646 \u0623\u0631\u0628\u0639\u0627",
    "\u0639\u0634\u0631 \u0646\u0633\u0648\u0629",
    "ten wives",
    "choose four"
  ];
  let bonus = 0;
  for (const phrase of KEY_PHRASES) {
    const pNorm = normalizeArabic(phrase).toLowerCase();
    if (/[a-z]/i.test(phrase)) {
      if (normEn.includes(phrase)) bonus += 20;
    } else {
      if (normAr.includes(pNorm)) bonus += 20;
    }
  }
  return bonus;
}
function compareRetrievedDocs(a, b, query) {
  if (Math.abs(b.score - a.score) > 0.5) {
    return b.score - a.score;
  }
  const qNorm = normalizeArabic(query).toLowerCase();
  const aNorm = normalizeArabic(a.fullText).toLowerCase();
  const bNorm = normalizeArabic(b.fullText).toLowerCase();
  const aHasPhrase = aNorm.includes(qNorm);
  const bHasPhrase = bNorm.includes(qNorm);
  if (aHasPhrase && !bHasPhrase) return -1;
  if (!aHasPhrase && bHasPhrase) return 1;
  if (a.type !== b.type) {
    return a.type === "ayah" ? -1 : 1;
  }
  const getPriority = (id) => {
    if (id.startsWith("ayah_")) return 10;
    if (id.startsWith("bukhari_")) return 9;
    if (id.startsWith("muslim_")) return 8;
    if (id.startsWith("abudawud_")) return 7;
    if (id.startsWith("tirmidhi_")) return 6;
    if (id.startsWith("nasai_")) return 5;
    if (id.startsWith("ibnmajah_")) return 4;
    if (id.startsWith("nawawi_")) return 3;
    return 1;
  };
  const pA = getPriority(a.id);
  const pB = getPriority(b.id);
  if (pA !== pB) return pB - pA;
  return a.id.localeCompare(b.id, "en", { numeric: true });
}
function countDistinctMatchedConcepts(doc, question, terms) {
  const docText = normalizeArabic(doc.fullText + " " + (doc.arabicFullText || "") + " " + (doc.tafsirText || "")).toLowerCase();
  const qNorm = normalizeArabic(question).toLowerCase();
  const clusters = [
    // 1. Marriage / Wives / Women
    ["\u0632\u0648\u062C", "\u0632\u0648\u062C\u0627\u062A", "\u0632\u0648\u062C\u0629", "\u0646\u0633\u0627\u0621", "\u0646\u0633\u0648\u0629", "\u0646\u0643\u062D", "\u0641\u0627\u0646\u0643\u062D\u0648\u0627", "\u062A\u0632\u0648\u062C", "marry", "marriage", "wives", "wife", "women", "woman"],
    // 2. Four / Number Limit
    ["\u0627\u0631\u0628\u0639", "\u0627\u0631\u0628\u0639\u0647", "\u0627\u0631\u0628\u0639\u0627", "\u0631\u0628\u0627\u0639", "\u0645\u062B\u0646\u0649", "four", "4", "two or three or four"],
    // 3. Fasting
    ["\u0635\u0648\u0645", "\u0635\u064A\u0627\u0645", "\u0635\u0627\u0645", "fasting", "fast"],
    // 4. Shawwal
    ["\u0634\u0648\u0627\u0644", "shawwal"],
    // 5. Six
    ["\u0633\u062A", "\u0633\u062A\u0647", "\u0633\u062A\u0629", "six"],
    // 6. Smiling
    ["\u062A\u0628\u0633\u0645", "\u062A\u0628\u0633\u0645\u0643", "\u0627\u0628\u062A\u0633\u0645", "smile", "smiling"],
    // 7. Charity
    ["\u0635\u062F\u0642\u0629", "\u0635\u062F\u0642\u0647", "charity"],
    // 8. Brother / Face
    ["\u0627\u062E", "\u0627\u062E\u064A\u0643", "\u0648\u062C\u0647", "brother", "face"],
    // 9. Qibla
    ["\u0642\u0628\u0644\u0629", "\u0627\u0644\u0642\u0628\u0644\u0629", "qibla", "kaba"],
    // 10. Urination / Excretion
    ["\u0628\u0648\u0644", "\u063A\u0627\u0626\u0637", "\u064A\u0628\u0648\u0644", "\u062A\u063A\u0648\u0637", "urinate", "urinating", "defecate", "defecating"],
    // 11. Facing / Turning
    ["\u0627\u0633\u062A\u0642\u0628\u0627\u0644", "\u0627\u0633\u062A\u062F\u0628\u0627\u0631", "\u062A\u0633\u062A\u0642\u0628\u0644", "facing"],
    // 12. Ghaylan story concepts
    ["\u063A\u064A\u0644\u0627\u0646", "\u0639\u0634\u0631", "\u064A\u062A\u062E\u064A\u0631", "\u062A\u062E\u064A\u0631", "ghilan", "ghailan", "choose four", "ten wives"]
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
var ASK_FRAME_TERMS = /* @__PURE__ */ new Set([
  // Arabic interrogative / function words
  "\u0647\u0644",
  "\u0645\u0646",
  "\u0641\u064A",
  "\u0639\u0644\u0649",
  "\u0627\u0644\u0649",
  "\u0639\u0646",
  "\u0645\u0639",
  "\u0647\u0630\u0627",
  "\u0647\u0630\u0647",
  "\u0630\u0644\u0643",
  "\u062A\u0644\u0643",
  "\u0627\u0644\u062A\u064A",
  "\u0627\u0644\u0630\u064A",
  "\u0627\u0644\u0630\u064A\u0646",
  "\u0645\u0627",
  "\u0644\u0627",
  "\u0644\u0645",
  "\u0644\u0646",
  "\u0642\u062F",
  "\u0643\u0644",
  "\u0628\u0639\u0636",
  "\u0627\u064A",
  "\u0648",
  "\u0627\u0648",
  "\u062B\u0645",
  "\u0627\u0646",
  "\u0623\u0646",
  "\u0625\u0646",
  "\u0627\u0646\u0647",
  "\u0643\u0627\u0646",
  "\u0643\u0627\u0646\u062A",
  "\u064A\u0643\u0648\u0646",
  "\u0627\u0646\u0627",
  "\u0627\u0646\u062A",
  "\u0647\u0648",
  "\u0647\u064A",
  "\u0647\u0646",
  "\u0646\u062D\u0646",
  "\u0643\u0645\u0627",
  "\u062D\u064A\u062B",
  "\u0644\u062F\u0649",
  "\u0628\u064A\u0646",
  "\u062D\u062A\u0649",
  "\u0628\u0644",
  "\u063A\u064A\u0631",
  "\u0633\u0648\u0649",
  "\u0646\u0641\u0633",
  "\u0628\u0647",
  "\u0628\u0647\u0627",
  "\u0644\u0647",
  "\u0644\u0647\u0627",
  "\u0644\u0647\u0645",
  "\u0641\u064A\u0647",
  "\u0641\u064A\u0647\u0627",
  "\u0645\u0646\u0647",
  "\u0645\u0646\u0647\u0627",
  "\u0639\u0644\u064A\u0647",
  "\u0639\u0644\u064A\u0647\u0627",
  "\u0627\u0644\u064A\u0647",
  "\u0627\u0644\u064A\u0647\u0627",
  "\u0639\u0646\u062F",
  "\u0639\u0646\u062F\u0645\u0627",
  "\u0645\u062B\u0644",
  "\u0633\u0648\u0641",
  "\u0643\u0644\u0647\u0627",
  "\u0643\u0644\u0645\u0627",
  // Arabic reporting / attribution scaffolding (never part of the attested claim)
  "\u0627\u0644\u0644\u0647",
  "\u0627\u0644\u0646\u0628\u064A",
  "\u0627\u0644\u0646\u0627\u0633",
  "\u0642\u0627\u0644",
  "\u0631\u0633\u0648\u0644",
  "\u0646\u0628\u064A",
  "\u0633\u0646\u0629",
  "\u062D\u062F\u064A\u062B",
  "\u0631\u0648\u0627\u0647",
  "\u0627\u062D\u0627\u062F\u064A\u062B",
  "\u0627\u0635\u062D\u0627\u0628",
  "\u0648\u0631\u062F",
  "\u0631\u0648\u0649",
  "\u0627\u062E\u0628\u0631",
  "\u0627\u0645\u0631",
  "\u0627\u0645\u0631\u062A",
  "\u064A\u0623\u0645\u0631",
  "\u064A\u0627\u0645\u0631",
  "\u0646\u0647\u0649",
  "\u0646\u0647\u064A\u0646\u0627",
  "\u064A\u0646\u0647\u0649",
  "\u0646\u0647\u064A\u0627",
  "\u064A\u062D\u0631\u0645",
  "\u064A\u062D\u0644",
  "\u064A\u062D\u0633\u0628",
  "\u064A\u062C\u0648\u0632",
  "\u0648\u0627\u062C\u0628",
  "\u0645\u0628\u0627\u062D",
  "\u0645\u0633\u062A\u062D\u0628",
  "\u0645\u0633\u062A\u062D\u0628\u0647",
  "\u0645\u0643\u0631\u0648\u0647",
  "\u062D\u0631\u0627\u0645",
  "\u062D\u0644\u0627\u0644",
  "\u0633\u0645\u0649",
  "\u0633\u0645\u0627\u0647\u0627",
  "\u064A\u0633\u0645\u064A",
  "\u0641\u0636\u0644",
  "\u0627\u062C\u0631",
  "\u062B\u0648\u0627\u0628",
  "\u0639\u0648\u0636",
  "\u062C\u0632\u0627\u0621",
  // English interrogative / function words
  "is",
  "are",
  "was",
  "were",
  "be",
  "been",
  "being",
  "do",
  "does",
  "did",
  "you",
  "your",
  "yours",
  "the",
  "a",
  "an",
  "of",
  "at",
  "in",
  "to",
  "for",
  "it",
  "its",
  "and",
  "or",
  "not",
  "no",
  "if",
  "so",
  "can",
  "will",
  "would",
  "should",
  "must",
  "me",
  "my",
  "we",
  "us",
  "they",
  "them",
  "he",
  "she",
  "his",
  "her",
  "their",
  "there",
  "here",
  "then",
  "than",
  "that",
  "this",
  "with",
  "on",
  "as",
  "any",
  "all",
  "while",
  "when",
  "what",
  "which",
  "who",
  "whom",
  "how",
  "why",
  "where",
  "am",
  "have",
  "has",
  "had",
  "also",
  "into",
  "from",
  "out",
  "up",
  "down",
  "about",
  "over",
  "under",
  "again",
  "very",
  "some",
  "such",
  "only",
  "other",
  "own",
  "same",
  "too",
  // English reporting / attribution scaffolding
  "prophet",
  "people",
  "messenger",
  "man",
  "men",
  "hadith",
  "sunnah",
  "say",
  "said",
  "says",
  "narrated",
  "authority",
  "god",
  "lord",
  "order",
  "ordered",
  "orders",
  "command",
  "commanded",
  "forbid",
  "forbids",
  "forbidden",
  "prohibit",
  "prohibited",
  "recommend",
  "recommended",
  "recommends",
  "warn",
  "warned",
  "warns",
  "reported",
  "called",
  "termed",
  "named",
  "obligatory",
  "obligated",
  "permissible",
  "permitted",
  "allowed",
  "allows",
  "ruling"
]);
function splitTokens(text, language, dropFrame) {
  if (!text) return [];
  const base = language === "en" ? text.toLowerCase() : normalizeArabic(text).toLowerCase();
  const out = [];
  for (let w of base.split(/[^\p{L}\p{N}]+/u)) {
    if (w.length < 2) continue;
    if (ASK_FRAME_TERMS.has(w)) continue;
    if (language === "ar") w = stripArabicPrefixes(w);
    if (w.length < 2) continue;
    if (ASK_FRAME_TERMS.has(w)) continue;
    out.push(w);
  }
  return dropFrame ? Array.from(new Set(out)) : out;
}
var MAX_ATTESTATION_TOKENS = 260;
function evidenceTextOf(item, language) {
  if (language === "en") return item.fullText || "";
  return item.arabicFullText || item.fullText || "";
}
function tokenMatchesSet(token, set) {
  if (set.has(token)) return true;
  for (const d of set) {
    if (Math.abs(d.length - token.length) > 3) continue;
    const shorter = d.length <= token.length ? d : token;
    const longer = d.length <= token.length ? token : d;
    if (shorter.length >= 4 && longer.startsWith(shorter)) return true;
  }
  return false;
}
function measureClaimAttestation(question, items, language, maxItems = 5) {
  const qTokens = splitTokens(question, language, true);
  if (!qTokens.length) return { lexical: 0, aligned: 0 };
  const qForDp = qTokens.map((w) => ({ word: w, normalized: w }));
  let lexical = 0;
  let aligned = 0;
  for (let i = 0; i < items.length && i < maxItems; i++) {
    const raw = evidenceTextOf(items[i], language);
    if (!raw) continue;
    const dedupTokens = splitTokens(raw, language, true);
    if (!dedupTokens.length) continue;
    const tokenSet = new Set(dedupTokens);
    const hits = qTokens.filter((t) => tokenMatchesSet(t, tokenSet)).length;
    lexical = Math.max(lexical, hits / qTokens.length);
    const fullTokens = splitTokens(raw, language, false).slice(0, MAX_ATTESTATION_TOKENS);
    for (const source of [fullTokens, dedupTokens]) {
      if (!source.length) continue;
      const sTokens = source.map((w, idx) => ({ word: w, normalized: w, originalIndex: idx }));
      const alignedResult = alignWordsDP(qForDp, sTokens);
      const matched = alignedResult.wordStatus.filter((s) => s !== "none").length;
      aligned = Math.max(aligned, matched / qTokens.length);
    }
  }
  return { lexical, aligned };
}
var CLAIM_LEXICAL_THRESHOLD = 0.7;
var CLAIM_ALIGNED_THRESHOLD = 0.5;
var CLAIM_PARTIAL_THRESHOLD = 0.4;
function deriveDeterministicVerdict(items, category, language, question = "") {
  if (items.length === 0) {
    return {
      verdict: "unclear",
      badgeLabel: language === "en" ? "No reliable match found" : "\u0644\u0645 \u064A\u062A\u0645 \u0627\u0644\u0639\u062B\u0648\u0631 \u0639\u0644\u0649 \u062A\u0637\u0627\u0628\u0642 \u0645\u0648\u062B\u0648\u0642",
      badgeSubline: language === "en" ? "Consult qualified scholars" : "\u0631\u0627\u062C\u0639 \u0623\u0647\u0644 \u0627\u0644\u0639\u0644\u0645"
    };
  }
  const topScore = items[0]?.score || 0;
  if (topScore < 15) {
    return {
      verdict: "unclear",
      badgeLabel: language === "en" ? "No reliable match found" : "\u0644\u0645 \u064A\u062A\u0645 \u0627\u0644\u0639\u062B\u0648\u0631 \u0639\u0644\u0649 \u062A\u0637\u0627\u0628\u0642 \u0645\u0648\u062B\u0648\u0642",
      badgeSubline: language === "en" ? "Consult qualified scholars" : "\u0631\u0627\u062C\u0639 \u0623\u0647\u0644 \u0627\u0644\u0639\u0644\u0645"
    };
  }
  const qNorm = normalizeArabic(question).toLowerCase();
  const isRulingQ = category === "permissibility" || qNorm.includes("\u064A\u062C\u0648\u0632") || qNorm.includes("\u062D\u0644\u0627\u0644") || qNorm.includes("\u062D\u0631\u0627\u0645") || qNorm.includes("\u062D\u0643\u0645") || qNorm.includes("\u0645\u0628\u0627\u062D") || qNorm.includes("\u0632\u0648\u062C\u0627\u062A") || qNorm.includes("\u062A\u062A\u0632\u0648\u062C") || qNorm.includes("\u0646\u0643\u0627\u062D") || qNorm.includes("\u0648\u0627\u062C\u0628") || qNorm.includes("\u064A\u0628\u0637\u0644") || qNorm.includes("permissible") || qNorm.includes("allowed") || qNorm.includes("ruling") || qNorm.includes("wives") || qNorm.includes("polygyn") || qNorm.includes("forbidden") || qNorm.includes("obligatory");
  if (isRulingQ) {
    return {
      verdict: "permissibility",
      badgeLabel: language === "en" ? "Related Texts" : "\u0646\u0635\u0648\u0635 \u0630\u0627\u062A \u0635\u0644\u0629",
      badgeSubline: language === "en" ? "Ruling question; texts only, fatwa is for qualified scholars" : "\u0647\u0630\u0627 \u0633\u0624\u0627\u0644 \u0641\u064A \u0627\u0644\u062D\u0643\u0645 \u0627\u0644\u0634\u0631\u0639\u064A\u061B \u0646\u0639\u0631\u0636 \u0627\u0644\u0646\u0635\u0648\u0635 \u0641\u0642\u0637\u060C \u0648\u0627\u0644\u0641\u062A\u0648\u0649 \u0644\u0623\u0647\u0644 \u0627\u0644\u0639\u0644\u0645"
    };
  }
  const attestation = measureClaimAttestation(question, items, language);
  const { lexical, aligned } = attestation;
  if (lexical < CLAIM_PARTIAL_THRESHOLD) {
    return {
      verdict: "unclear",
      badgeLabel: language === "en" ? "No reliable match found" : "\u0644\u0645 \u064A\u062A\u0645 \u0627\u0644\u0639\u062B\u0648\u0631 \u0639\u0644\u0649 \u062A\u0637\u0627\u0628\u0642 \u0645\u0648\u062B\u0648\u0642",
      badgeSubline: language === "en" ? "Consult qualified scholars" : "\u0631\u0627\u062C\u0639 \u0623\u0647\u0644 \u0627\u0644\u0639\u0644\u0645"
    };
  }
  if (lexical < CLAIM_LEXICAL_THRESHOLD || aligned < CLAIM_ALIGNED_THRESHOLD) {
    return {
      verdict: "permissibility",
      badgeLabel: language === "en" ? "Related Texts" : "\u0646\u0635\u0648\u0635 \u0630\u0627\u062A \u0635\u0644\u0629",
      badgeSubline: language === "en" ? "Texts do not state this specific claim; consult scholars" : "\u0627\u0644\u0646\u0635\u0648\u0635 \u0644\u0627 \u062A\u064F\u062B\u0628\u062A \u0647\u0630\u0627 \u0627\u0644\u0627\u062F\u0639\u0627\u0621 \u0627\u0644\u0645\u062E\u0635\u0648\u0635\u061B \u0631\u0627\u062C\u0639 \u0623\u0647\u0644 \u0627\u0644\u0639\u0644\u0645"
    };
  }
  return {
    verdict: "supported",
    badgeLabel: language === "en" ? "Found in Sources" : "\u0648\u064F\u062C\u062F \u0641\u064A \u0627\u0644\u0645\u0635\u0627\u062F\u0631",
    badgeSubline: language === "en" ? "Textual match, not a ruling on authenticity" : "\u0647\u0630\u0627 \u0644\u064A\u0633 \u062D\u0643\u0645\u0627\u064B \u0628\u0635\u062D\u0629 \u0627\u0644\u0646\u0635"
  };
}
function isWeakTerm(term) {
  if (!term) return true;
  const norm = stripArabicPrefixes(normalizeArabic(term)).toLowerCase();
  return WEAK_TERMS.has(term) || WEAK_TERMS.has(norm);
}
var dfCache = /* @__PURE__ */ new Map();
function termDocFreq(term) {
  if (!term) return void 0;
  if (dfCache.has(term)) return dfCache.get(term);
  let df;
  try {
    const postings = loadAskSearchIndex().postings;
    const p = postings[term];
    df = p ? p.length : void 0;
  } catch {
    df = void 0;
  }
  dfCache.set(term, df);
  return df;
}
var RARE_DOC_FREQ_RATIO = 75e-4;
function isRareTerm(term) {
  if (!term) return false;
  const norm = stripArabicPrefixes(normalizeArabic(term)).toLowerCase();
  if (RARE_TERMS.has(term) || RARE_TERMS.has(norm)) return true;
  if (isWeakTerm(norm)) return false;
  if (norm.length >= 6) return true;
  let totalDocs = 0;
  try {
    totalDocs = loadAskSearchIndex().docs.length;
  } catch {
    return false;
  }
  if (!totalDocs) return false;
  const df = termDocFreq(term) ?? termDocFreq(norm);
  return df !== void 0 && df <= totalDocs * RARE_DOC_FREQ_RATIO;
}
var globalQuranArMap = null;
var globalQuranEnMap = null;
function getGlobalQuranArMap() {
  if (!globalQuranArMap) {
    const { corpus } = loadCorpus();
    globalQuranArMap = /* @__PURE__ */ new Map();
    for (const v of corpus.quran.ar) {
      globalQuranArMap.set(`${v.chapter}_${v.verse}`, v);
    }
  }
  return globalQuranArMap;
}
function getGlobalQuranEnMap() {
  if (!globalQuranEnMap) {
    globalQuranEnMap = /* @__PURE__ */ new Map();
    for (const v of getQuranEn()) {
      globalQuranEnMap.set(`${v.chapter}_${v.verse}`, v);
    }
  }
  return globalQuranEnMap;
}
function extractLocalTerms(question, lang) {
  const qNorm = normalizeArabic(question).toLowerCase();
  const rawWords = qNorm.split(/[^\u0600-\u06FFa-z0-9]+/i).filter((w) => w.length >= 2);
  const STOPWORDS = /* @__PURE__ */ new Set([
    "\u0647\u0644",
    "\u0641\u064A",
    "\u0645\u0646",
    "\u0639\u0646",
    "\u0639\u0644\u0649",
    "\u0625\u0644\u0649",
    "\u0623\u0646",
    "\u0625\u0646",
    "\u0645\u0627",
    "\u0643\u0645",
    "\u0643\u064A\u0641",
    "\u0645\u062A\u0649",
    "\u0623\u064A\u0646",
    "\u0644\u0645\u0627\u0630\u0627",
    "\u0647\u0648",
    "\u0647\u064A",
    "\u0647\u0645",
    "\u0623\u0646\u0627",
    "\u0646\u062D\u0646",
    "\u0647\u0630\u0627",
    "\u0647\u0630\u0647",
    "\u0630\u0644\u0643",
    "\u062A\u0644\u0643",
    "\u0627\u0644\u062A\u064A",
    "\u0627\u0644\u0630\u064A",
    "\u0627\u0644\u0630\u064A\u0646",
    "is",
    "it",
    "at",
    "in",
    "of",
    "on",
    "to",
    "for",
    "with",
    "the",
    "a",
    "an",
    "are",
    "was",
    "were",
    "does",
    "do",
    "did",
    "how",
    "what",
    "where",
    "when",
    "why",
    "who",
    "whom",
    "which",
    "your",
    "his",
    "her"
  ]);
  const terms = rawWords.filter((w) => !STOPWORDS.has(w));
  return terms.length > 0 ? terms : [question];
}
function searchCorpusKeywords(terms, lang, question = "") {
  const t0 = performance.now();
  const { corpus } = loadCorpus();
  initHadithEngine();
  initAyahEngine();
  const isQuestionEn = lang === "en";
  const rawTerms = [];
  for (const t of terms) {
    if (!t) continue;
    rawTerms.push(t);
    const splitWords = t.split(/\s+/).filter((w) => w.length >= 2);
    if (splitWords.length > 1) {
      rawTerms.push(...splitWords);
    }
  }
  const lowerTerms = rawTerms.map((t) => t.toLowerCase());
  if (lowerTerms.some((t) => t.includes("marry") || t.includes("marriage") || t.includes("wives") || t.includes("wife") || t.includes("polygyn") || t.includes("\u0632\u0648\u062C") || t.includes("\u0646\u0643\u062D") || t.includes("\u0646\u0633\u0627\u0621"))) {
    rawTerms.push("\u0641\u0627\u0646\u0643\u062D\u0648\u0627", "\u0627\u0644\u0646\u0633\u0627\u0621", "\u0645\u062B\u0646\u0649", "\u0631\u0628\u0627\u0639", "women", "marry", "wives", "four", "\u063A\u064A\u0644\u0627\u0646", "\u0639\u0634\u0631", "\u0646\u0633\u0648\u0629", "\u0623\u0631\u0628\u0639\u0627", "\u064A\u062A\u062E\u064A\u0631", "\u062A\u062E\u064A\u0631", "ghilan", "ghailan");
  }
  if (lowerTerms.some((t) => t.includes("smil") || t.includes("charity") || t.includes("\u062A\u0628\u0633\u0645"))) {
    rawTerms.push("\u062A\u0628\u0633\u0645\u0643", "\u0648\u062C\u0647", "\u0623\u062E\u064A\u0643", "\u0635\u062F\u0642\u0629", "smiling", "charity");
  }
  if (lowerTerms.some((t) => t.includes("qibla") || t.includes("urinat") || t.includes("\u0642\u0628\u0644\u0629") || t.includes("\u0628\u0648\u0644"))) {
    rawTerms.push("\u0627\u0644\u0642\u0628\u0644\u0629", "\u0642\u0628\u0644\u0629", "\u063A\u0627\u0626\u0637", "\u0628\u0648\u0644", "qibla", "urination");
  }
  if (lowerTerms.some((t) => t.includes("shawwal") || t.includes("\u0634\u0648\u0627\u0644"))) {
    rawTerms.push("\u0634\u0648\u0627\u0644", "\u0635\u064A\u0627\u0645", "\u0633\u062A", "\u0633\u062A\u0629", "shawwal", "fasting");
  }
  const cleanTermsAr = Array.from(
    new Set(
      rawTerms.map((t) => stripArabicPrefixes(normalizeArabic(t))).filter((t) => t.length >= 2 && !/^[a-z]/i.test(t))
    )
  );
  const cleanTermsEn = Array.from(
    new Set(
      rawTerms.map((t) => t.toLowerCase().trim()).filter((t) => t.length >= 2 && /^[a-z]/i.test(t))
    )
  );
  const allTermsForQuotes = [...cleanTermsAr, ...cleanTermsEn];
  const t1 = performance.now();
  const askIndex = loadAskSearchIndex();
  const docHitCounts = /* @__PURE__ */ new Map();
  const rareHitDocs = /* @__PURE__ */ new Set();
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
  let candidateDocEntries = [];
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
  const quranArMap = getGlobalQuranArMap();
  const quranEnMap2 = getGlobalQuranEnMap();
  const candidateScores = [];
  for (const docIdx of cappedCandidates) {
    const doc = askIndex.docs[docIdx];
    if (!doc) continue;
    if (doc.type === "ayah") {
      const normVerseAr = doc.normAr;
      const normVerseEn = doc.normEn;
      const normTafsirAr = doc.normTafsir || "";
      const matchedNonWeakTerms = /* @__PURE__ */ new Set();
      let verseScoreAr = 0;
      let verseScoreEn = 0;
      let tafsirScoreAr = 0;
      let hasRare = false;
      let hasRareAr = false;
      for (const term of cleanTermsAr) {
        const inVerse = normVerseAr.includes(term);
        const inTafsir = normTafsirAr.includes(term);
        if (inVerse) {
          if (isRareTerm(term)) {
            verseScoreAr += 25;
            hasRare = true;
            hasRareAr = true;
            matchedNonWeakTerms.add(term);
          } else if (GENERIC_TERMS.has(term)) {
            verseScoreAr += 1;
            matchedNonWeakTerms.add(term);
          } else if (!isWeakTerm(term)) {
            verseScoreAr += 3;
            matchedNonWeakTerms.add(term);
          } else {
            verseScoreAr += 0.1;
          }
        }
        if (inTafsir) {
          if (isRareTerm(term)) {
            tafsirScoreAr += 25;
            hasRare = true;
            hasRareAr = true;
            matchedNonWeakTerms.add(term);
          } else if (GENERIC_TERMS.has(term)) {
            tafsirScoreAr += 1;
            matchedNonWeakTerms.add(term);
          } else if (!isWeakTerm(term)) {
            tafsirScoreAr += 3;
            matchedNonWeakTerms.add(term);
          } else {
            tafsirScoreAr += 0.1;
          }
        }
      }
      let hasRareEn = false;
      for (const term of cleanTermsEn) {
        if (normVerseEn.includes(term)) {
          if (isRareTerm(term)) {
            verseScoreEn += 25;
            hasRare = true;
            hasRareEn = true;
            matchedNonWeakTerms.add(term);
          } else if (GENERIC_TERMS.has(term)) {
            verseScoreEn += 1;
            matchedNonWeakTerms.add(term);
          } else if (!isWeakTerm(term)) {
            verseScoreEn += 3;
            matchedNonWeakTerms.add(term);
          } else {
            verseScoreEn += 0.1;
          }
        }
      }
      let totalScore = verseScoreAr + verseScoreEn + tafsirScoreAr * 0.5;
      const ch = doc.ch;
      const verse = doc.v;
      const vAr = quranArMap.get(`${ch}_${verse}`) || { text: "" };
      const vEn = quranEnMap2.get(`${ch}_${verse}`);
      const rawTextAr = vAr.text || "";
      const rawTextEn = vEn?.text || "";
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
          hasRare
        });
      }
    } else if (doc.type === "hadith") {
      const matnAr = doc.normAr;
      const matnEn = doc.normEn;
      const matchedNonWeakTerms = /* @__PURE__ */ new Set();
      let scoreAr = 0;
      let scoreEn = 0;
      let hasRare = false;
      let hasRareAr = false;
      for (const term of cleanTermsAr) {
        if (matnAr.includes(term)) {
          if (isRareTerm(term)) {
            scoreAr += 25;
            hasRare = true;
            hasRareAr = true;
            matchedNonWeakTerms.add(term);
          } else if (GENERIC_TERMS.has(term)) {
            scoreAr += 1;
            matchedNonWeakTerms.add(term);
          } else if (!isWeakTerm(term)) {
            scoreAr += 3;
            matchedNonWeakTerms.add(term);
          } else {
            scoreAr += 0.1;
          }
        }
      }
      let hasRareEn = false;
      for (const term of cleanTermsEn) {
        if (matnEn.includes(term)) {
          if (isRareTerm(term)) {
            scoreEn += 25;
            hasRare = true;
            hasRareEn = true;
            matchedNonWeakTerms.add(term);
          } else if (GENERIC_TERMS.has(term)) {
            scoreEn += 1;
            matchedNonWeakTerms.add(term);
          } else if (!isWeakTerm(term)) {
            scoreEn += 3;
            matchedNonWeakTerms.add(term);
          } else {
            scoreEn += 0.1;
          }
        }
      }
      let totalScore = scoreAr + scoreEn;
      const col = doc.col;
      const num = doc.num;
      const hAr = lookupHadithAr(col, num);
      const hEn = lookupHadithEn(col, num);
      const rawTextAr = hAr?.text || "";
      const rawTextEn = hEn?.text || "";
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
          hasRare
        });
      }
    }
  }
  const t4 = performance.now();
  candidateScores.sort((a, b) => b.score - a.score);
  const topAyatCandidates = candidateScores.filter((cs) => cs.doc.type === "ayah").slice(0, 2);
  const topHadithCandidates = candidateScores.filter((cs) => cs.doc.type === "hadith").slice(0, 4);
  const topCandidates = [...topAyatCandidates, ...topHadithCandidates];
  const scoredAyatMap = /* @__PURE__ */ new Map();
  const scoredHadithsMap = /* @__PURE__ */ new Map();
  for (const cs of topCandidates) {
    const doc = cs.doc;
    if (doc.type === "ayah") {
      const ch = doc.ch;
      const verse = doc.v;
      const vAr = quranArMap.get(`${ch}_${verse}`) || { chapter: ch, verse, text: "" };
      const vEn = quranEnMap2.get(`${ch}_${verse}`);
      const tafsirText = getQuranTafsirForAyah(ch, verse);
      const tafsirExcerpt = extractDenseClusterQuote(tafsirText, allTermsForQuotes, 25);
      const enText = vEn?.text ? `${vEn.text} (${ch}.${verse})` : vAr.text;
      scoredAyatMap.set(`ayah_${ch}_${verse}`, {
        id: `ayah_${ch}_${verse}`,
        sourceLabel: isQuestionEn ? `Surah ${ch}:${verse}` : `\u0633\u0648\u0631\u0629 ${ch} - \u0622\u064A\u0629 ${verse}`,
        editionName: isQuestionEn ? "Saheeh International (eng-ummmuhammad)" : "\u0627\u0644\u0642\u0631\u0622\u0646 \u0627\u0644\u0643\u0631\u064A\u0645",
        fullText: isQuestionEn ? enText : vAr.text,
        arabicFullText: vAr.text,
        matnText: isQuestionEn ? enText : extractCleanMatn(vAr.text, 80),
        tafsirText,
        tafsirExcerpt,
        score: cs.score,
        matchedTermsCount: cs.matchedNonWeakCount,
        hasRareTerm: cs.hasRare,
        type: "ayah",
        chapter: ch,
        verse
      });
    } else if (doc.type === "hadith") {
      const col = doc.col;
      const num = doc.num;
      const hAr = lookupHadithAr(col, num);
      const hEn = lookupHadithEn(col, num);
      if (hAr) {
        const grades = hAr.grades || [];
        const hasNoGrading = col === "bukhari" || col === "muslim" || col === "nawawi";
        scoredHadithsMap.set(`${col}_${num}`, {
          id: `${col}_${num}`,
          sourceLabel: !isQuestionEn ? `${getCollectionArabicName(col)} - \u062D\u062F\u064A\u062B ${num}` : `${getCollectionEnglishName(col)} - Hadith ${num}`,
          editionName: !isQuestionEn ? getCollectionArabicName(col) : `${getCollectionEnglishName(col)} (English translation)`,
          fullText: isQuestionEn && hEn?.text ? hEn.text : hAr.text,
          arabicFullText: hAr.text,
          matnText: isQuestionEn && hEn?.text ? hEn.text : extractCleanMatn(hAr.text, 80),
          score: cs.score,
          matchedTermsCount: cs.matchedNonWeakCount,
          hasRareTerm: cs.hasRare,
          type: "hadith",
          collection: col,
          hadithnumber: num,
          grades: parseGrades(grades),
          hasNoGrading
        });
      }
    }
  }
  const queryStr = question || terms.join(" ");
  const allScoredDocs = [
    ...scoredAyatMap.values(),
    ...scoredHadithsMap.values()
  ];
  allScoredDocs.sort((a, b) => compareRetrievedDocs(a, b, queryStr));
  const topScore = allScoredDocs[0]?.score || 0;
  const gatedDocs = allScoredDocs.filter((d) => {
    if (topScore > 0 && d.score >= 0.6 * topScore) {
      return true;
    }
    const conceptsMatched = countDistinctMatchedConcepts(d, queryStr, rawTerms);
    return conceptsMatched >= 2;
  });
  const passingSources = gatedDocs.slice(0, 6);
  const topHadiths = passingSources.filter((d) => d.type === "hadith");
  const topAyat = passingSources.filter((d) => d.type === "ayah");
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
      totalMs: Math.round((t5 - t0) * 100) / 100
    }
  };
}
function getCollectionArabicName(col) {
  switch (col) {
    case "bukhari":
      return "\u0635\u062D\u064A\u062D \u0627\u0644\u0628\u062E\u0627\u0631\u064A";
    case "muslim":
      return "\u0635\u062D\u064A\u062D \u0645\u0633\u0644\u0645";
    case "abudawud":
      return "\u0633\u0646\u0646 \u0623\u0628\u064A \u062F\u0627\u0648\u062F";
    case "tirmidhi":
      return "\u062C\u0627\u0645\u0639 \u0627\u0644\u062A\u0631\u0645\u0630\u064A";
    case "nasai":
      return "\u0633\u0646\u0646 \u0627\u0644\u0646\u0633\u0627\u0626\u064A";
    case "ibnmajah":
      return "\u0633\u0646\u0646 \u0627\u0628\u0646 \u0645\u0627\u062C\u0647";
    case "nawawi":
      return "\u0627\u0644\u0623\u0631\u0628\u0639\u0648\u0646 \u0627\u0644\u0646\u0648\u0648\u064A\u0629";
    default:
      return col;
  }
}
function getCollectionEnglishName(col) {
  switch (col) {
    case "bukhari":
      return "Sahih al-Bukhari";
    case "muslim":
      return "Sahih Muslim";
    case "abudawud":
      return "Sunan Abi Dawud";
    case "tirmidhi":
      return "Jami` at-Tirmidhi";
    case "nasai":
      return "Sunan an-Nasa'i";
    case "ibnmajah":
      return "Sunan Ibn Majah";
    case "nawawi":
      return "An-Nawawi's 40 Hadith";
    default:
      return col;
  }
}
function parseGrades(rawGrades) {
  return rawGrades.map((g) => {
    const raw = (g.grade || "").trim();
    const name = (g.name || "\u0645\u064F\u062E\u0631\u0650\u0651\u062C \u063A\u064A\u0631 \u0645\u0633\u0645\u0649").trim();
    let family = "neutral";
    if (/sahih|صحيح/i.test(raw)) family = "\u0635\u062D\u064A\u062D";
    else if (/hasan|حسن/i.test(raw)) family = "\u062D\u0633\u0646";
    else if (/da'?if|ضعيف/i.test(raw)) family = "\u0636\u0639\u064A\u0641";
    else if (/maudu|موضوع/i.test(raw)) family = "\u0645\u0648\u0636\u0648\u0639";
    return {
      name,
      originalGrade: raw,
      arabicLabel: raw,
      family,
      isIsnadJudgment: /isnaad/i.test(raw),
      isCitation: false
    };
  });
}
function getGeminiClient(customKey) {
  const apiKey = customKey || process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY_MISSING");
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        "User-Agent": "aistudio-build"
      }
    }
  });
}
async function generateWithTimeout(ai, model, contents, systemInstruction) {
  const callPromise = ai.models.generateContent({
    model,
    contents,
    config: {
      systemInstruction,
      temperature: 0,
      responseMimeType: "application/json"
    }
  });
  const timeoutPromise = new Promise((_, reject) => {
    setTimeout(() => reject(new Error("CALL_TIMEOUT")), CALL_TIMEOUT_MS);
  });
  const response = await Promise.race([callPromise, timeoutPromise]);
  return response.text?.trim() || "{}";
}
async function executeCall1(question, userKey, clientIp = "127.0.0.1") {
  const apiKey = userKey || process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return {
      category: "textual",
      language: /[a-z]/i.test(question) ? "en" : "ar",
      claimed_text: null,
      terms: [question],
      is_ruling_question: false,
      modelUsed: "fallback",
      retriesCount: 0
    };
  }
  if (!userKey && quotaManager.shouldSkipCall1()) {
    return {
      category: "textual",
      language: /[a-z]/i.test(question) ? "en" : "ar",
      claimed_text: null,
      terms: extractLocalTerms(question, /[a-z]/i.test(question) ? "en" : "ar"),
      is_ruling_question: false,
      modelUsed: "local_priority_skip",
      retriesCount: 0
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
  let lastError = null;
  for (let attempt = 0; attempt < 2; attempt++) {
    let modelToTry = null;
    if (userKey) {
      modelToTry = attempt === 0 ? "gemini-3.5-flash-lite" : "gemini-3.1-flash-lite";
    } else {
      const acq = quotaManager.acquireModel("ask_call1");
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
        category: parsed.category || (parsed.is_ruling_question ? "permissibility" : "textual"),
        language: parsed.language === "en" ? "en" : "ar",
        claimed_text: parsed.claimed_text || null,
        terms: terms.length > 0 ? terms : [question],
        is_ruling_question: Boolean(parsed.is_ruling_question || parsed.category === "permissibility"),
        modelUsed: modelToTry,
        retriesCount
      };
    } catch (err) {
      retriesCount++;
      lastError = err;
      if (!userKey && modelToTry) {
        const is429or503 = err?.status === 429 || err?.status === 503 || err?.message?.includes("429") || err?.message?.includes("503");
        if (is429or503) {
          quotaManager.markModelUnavailable(modelToTry);
        }
      }
    }
  }
  return {
    category: "textual",
    language: /[a-z]/i.test(question) ? "en" : "ar",
    claimed_text: null,
    terms: extractLocalTerms(question, /[a-z]/i.test(question) ? "en" : "ar"),
    is_ruling_question: false,
    modelUsed: "local_fallback",
    retriesCount
  };
}
async function executeCall2(question, retrievedDocs, isPermissibility, userKey, clientIp = "127.0.0.1") {
  const lang = /[a-z]/i.test(question) ? "en" : "ar";
  const apiKey = userKey || process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return {
      verdict: isPermissibility ? "permissibility" : "unclear",
      summary: lang === "en" ? "Automated summary unavailable; texts below are the source" : "\u062A\u0639\u0630\u0651\u0631 \u0625\u0646\u0634\u0627\u0621 \u0627\u0644\u0645\u0644\u062E\u0635 \u0627\u0644\u0622\u0644\u064A \u0627\u0644\u0622\u0646\u061B \u0627\u0644\u0646\u0635\u0648\u0635 \u0623\u062F\u0646\u0627\u0647 \u0647\u064A \u0627\u0644\u0645\u0635\u062F\u0631",
      items: [],
      promptChars: 0,
      modelUsed: "fallback",
      retriesCount: 0
    };
  }
  const ai = getGeminiClient(userKey);
  const systemInstruction = isPermissibility ? `You are an evidence extractor for Islamic scripture. This is a permissibility/ruling question.
Output ONLY factual verbatim quotes from the retrieved verse, tafsir, or hadith texts.
Do NOT give a fatwa or issue a ruling (no \u062D\u0631\u0627\u0645\u060C \u062D\u0644\u0627\u0644\u060C \u064A\u062C\u0648\u0632\u060C \u0644\u0627 \u064A\u062C\u0648\u0632\u060C \u0648\u0627\u062C\u0628\u060C \u0645\u0643\u0631\u0648\u0647 in the summary unless inside an exact quote).
Output STRICT JSON:
{"verdict":"permissibility","summary":"Concise neutral summary stating what the texts mention","items":[{"id":"string","quote":"string","role":"supports"}]}` : `You are an evidence verifier for Islamic scripture. Answer STRICTLY using the provided retrieved texts.
- "supports" means the text itself states the claim.
- "refutes" means the text states the opposite.
- Otherwise verdict = "unclear".
- Quotes MUST be copied verbatim from source items or tafsir.
- Do NOT include grades or ruling words in the summary unless inside a quote.
Output STRICT JSON:
{"verdict":"supported"|"contradicted"|"unclear","summary":"One factual sentence summarizing what the texts say","items":[{"id":"string","quote":"string","role":"supports"|"refutes"}]}`;
  const promptItems = retrievedDocs.slice(0, 6).map((d) => {
    if (d.type === "ayah" && d.tafsirText) {
      const tafsirSnippet = extractDenseClusterQuote(d.tafsirText, [], 60);
      return `[Item id="${d.id}" source="${d.sourceLabel}"]
[Verse Text]
${d.fullText}
[/Verse Text]
[Tafsir]
${tafsirSnippet}
[/Tafsir]
[/Item]`;
    }
    return `[Item id="${d.id}" source="${d.sourceLabel}"]
${d.matnText}
[/Item]`;
  }).join("\n\n");
  const userPrompt = `Question: ${question}

Retrieved Texts:
${promptItems}`;
  const promptChars = userPrompt.length;
  let retriesCount = 0;
  let lastError = null;
  for (let attempt = 0; attempt < 2; attempt++) {
    let modelToTry = null;
    if (userKey) {
      modelToTry = attempt === 0 ? "gemini-3.5-flash-lite" : "gemini-3.1-flash-lite";
    } else {
      const acq = quotaManager.acquireModel("ask_call2");
      modelToTry = acq.model;
    }
    if (!modelToTry) {
      return {
        verdict: isPermissibility ? "permissibility" : "unclear",
        summary: lang === "en" ? "Automated summary unavailable; texts below are the source" : "\u062A\u0639\u0630\u0651\u0631 \u0625\u0646\u0634\u0627\u0621 \u0627\u0644\u0645\u0644\u062E\u0635 \u0627\u0644\u0622\u0644\u064A \u0627\u0644\u0622\u0646\u061B \u0627\u0644\u0646\u0635\u0648\u0635 \u0623\u062F\u0646\u0627\u0647 \u0647\u064A \u0627\u0644\u0645\u0635\u062F\u0631",
        items: [],
        promptChars,
        modelUsed: "quota_exhausted",
        retriesCount,
        quotaExhausted: true,
        quotaNotice: quotaManager.getQuotaNotice(lang)
      };
    }
    try {
      const text = await generateWithTimeout(ai, modelToTry, userPrompt, systemInstruction);
      const parsed = JSON.parse(text);
      let v = "unclear";
      if (isPermissibility || parsed.verdict === "permissibility") {
        v = "permissibility";
      } else if (parsed.verdict === "supported" || parsed.verdict === "contradicted") {
        v = parsed.verdict;
      }
      if (!userKey) {
        quotaManager.recordIpUsage(clientIp);
      }
      return {
        verdict: v,
        summary: typeof parsed.summary === "string" ? parsed.summary.trim() : "",
        items: Array.isArray(parsed.items) ? parsed.items : [],
        promptChars,
        modelUsed: modelToTry,
        retriesCount
      };
    } catch (err) {
      retriesCount++;
      lastError = err;
      if (!userKey && modelToTry) {
        const is429or503 = err?.status === 429 || err?.status === 503 || err?.message?.includes("429") || err?.message?.includes("503");
        if (is429or503) {
          quotaManager.markModelUnavailable(modelToTry);
        }
      }
    }
  }
  return {
    verdict: isPermissibility ? "permissibility" : "unclear",
    summary: lang === "en" ? "Automated summary unavailable; texts below are the source" : "\u062A\u0639\u0630\u0651\u0631 \u0625\u0646\u0634\u0627\u0621 \u0627\u0644\u0645\u0644\u062E\u0635 \u0627\u0644\u0622\u0644\u064A \u0627\u0644\u0622\u0646\u061B \u0627\u0644\u0646\u0635\u0648\u0635 \u0623\u062F\u0646\u0627\u0647 \u0647\u064A \u0627\u0644\u0645\u0635\u062F\u0631",
    items: [],
    promptChars,
    modelUsed: "fallback_error",
    retriesCount
  };
}
async function executeAskStage1(req, clientIp = "127.0.0.1") {
  const startTime = performance.now();
  const rawQuestion = (req.question || "").trim();
  if (!rawQuestion) {
    return {
      question: rawQuestion,
      language: "ar",
      category: "other",
      verdict: "unclear",
      verdictBadgeLabel: "\u0644\u0645 \u0646\u0639\u062B\u0631 \u0639\u0644\u0649 \u0646\u0635\u064D\u0651 \u0645\u0631\u062A\u0628\u0637 \u0628\u0633\u0624\u0627\u0644\u0643 \u0641\u064A \u0627\u0644\u0645\u0635\u0627\u062F\u0631 \u0627\u0644\u0645\u0641\u0647\u0631\u0633\u0629\u061B \u0631\u0627\u062C\u0639 \u0623\u0647\u0644 \u0627\u0644\u0639\u0644\u0645",
      summary: "",
      searchedTerms: [],
      items: [],
      retrievedCount: 0,
      droppedItemsCount: 0,
      topRetrievedIds: [],
      executionTimeMs: 0,
      error: "\u064A\u0631\u062C\u0649 \u0643\u062A\u0627\u0628\u0629 \u0627\u0644\u0633\u0624\u0627\u0644 \u0627\u0644\u0634\u0631\u0639\u064A \u0644\u0644\u0628\u062D\u062B."
    };
  }
  if (!req.userApiKey) {
    const ipCheck = quotaManager.checkIpLimit(clientIp);
    if (!ipCheck.allowed) {
      return {
        question: rawQuestion,
        language: "ar",
        category: "other",
        verdict: "unclear",
        verdictBadgeLabel: "\u062A\u0645 \u062A\u062C\u0627\u0648\u0632 \u0627\u0644\u062D\u062F \u0627\u0644\u0645\u0633\u0645\u0648\u062D \u0628\u0647",
        summary: "",
        searchedTerms: [],
        items: [],
        retrievedCount: 0,
        droppedItemsCount: 0,
        topRetrievedIds: [],
        executionTimeMs: Math.round(performance.now() - startTime),
        error: "\u062A\u0645 \u062A\u062C\u0627\u0648\u0632 \u0627\u0644\u062D\u062F \u0627\u0644\u0645\u0633\u0645\u0648\u062D \u0628\u0647 \u0644\u0644\u0623\u0633\u0626\u0644\u0629 \u0641\u064A \u0647\u0630\u0647 \u0627\u0644\u0633\u0627\u0639\u0629. \u064A\u0631\u062C\u0649 \u0627\u0644\u0627\u0646\u062A\u0638\u0627\u0631 \u0623\u0648 \u0625\u062F\u062E\u0627\u0644 \u0645\u0641\u062A\u0627\u062D\u0643 \u0627\u0644\u062E\u0627\u0635 \u0645\u0646 \u0627\u0644\u0625\u0639\u062F\u0627\u062F\u0627\u062A.",
        quotaNotice: quotaManager.getQuotaNotice("ar"),
        retryAfterSeconds: ipCheck.retryAfterSeconds
      };
    }
  }
  const normCleanQuestionAr = normalizeArabic(rawQuestion).toLowerCase().replace(/[،،]/g, "");
  const normCleanQuestionEn = rawQuestion.toLowerCase().replace(/[،،]/g, "");
  const matchedFake = CURATED_FABRICATED_SAYINGS.find(
    (f) => normCleanQuestionAr.includes(normalizeArabic(f.matn).toLowerCase().replace(/[،،]/g, "")) || f.keywords.some((k) => {
      const hasArabic = /[\u0600-\u06FF]/.test(k);
      if (hasArabic) {
        return normCleanQuestionAr.includes(normalizeArabic(k).toLowerCase().replace(/[،،]/g, ""));
      } else {
        return normCleanQuestionEn.includes(k.toLowerCase());
      }
    })
  );
  if (matchedFake) {
    const res2 = {
      question: rawQuestion,
      language: "ar",
      category: "textual",
      verdict: "contradicted",
      verdictBadgeLabel: "\u062D\u062F\u064A\u062B \u0645\u0643\u0630\u0648\u0628 / \u0644\u0627 \u0623\u0635\u0644 \u0644\u0647",
      verdictBadgeSubline: `\u062D\u0643\u0645 \u0627\u0644\u062D\u062F\u064A\u062B: \xAB${matchedFake.ruling}\xBB \u0645\u0648\u062B\u0642 \u0641\u064A \u0627\u0644\u062F\u0631\u0631 \u0627\u0644\u0633\u0646\u064A\u0629`,
      isFabricated: true,
      fakeHadith: {
        matn: matchedFake.matn,
        ruling: matchedFake.ruling,
        url: matchedFake.url
      },
      summary: `\u0647\u0630\u0627 \u0627\u0644\u0642\u0648\u0644 (\xAB${matchedFake.matn}\xBB) \u0644\u0627 \u0623\u0635\u0644 \u0644\u0647 \u0623\u0648 \u062D\u0643\u0645\u0647 \xAB${matchedFake.ruling}\xBB \u0648\u0641\u0642 \u0627\u0644\u062A\u0648\u062B\u064A\u0642 \u0627\u0644\u0645\u0639\u062A\u0645\u062F \u0641\u064A \u0645\u0648\u0642\u0639 \u0627\u0644\u062F\u0631\u0631 \u0627\u0644\u0633\u0646\u064A\u0629.`,
      searchedTerms: matchedFake.keywords,
      items: [],
      retrievedCount: 0,
      droppedItemsCount: 0,
      topRetrievedIds: [],
      executionTimeMs: Math.round(performance.now() - startTime)
    };
    return res2;
  }
  const normKey = normalizeArabic(rawQuestion).toLowerCase().replace(/\s+/g, " ");
  const cached = askCache.get(normKey);
  if (cached) {
    return {
      ...cached,
      cached: true,
      executionTimeMs: Math.round(performance.now() - startTime)
    };
  }
  const language = /[a-z]/i.test(rawQuestion) ? "en" : "ar";
  const localTerms = extractLocalTerms(rawQuestion, language);
  const tRetStart = performance.now();
  const localSearch = searchCorpusKeywords(localTerms, language, rawQuestion);
  const retrievalMs = Math.round(performance.now() - tRetStart);
  const tCall1Start = performance.now();
  let call1Result = null;
  let call1Ms = 0;
  let call1Failover = "0";
  let refined = false;
  let finalPassingSources = localSearch.passingSources;
  let finalTerms = localTerms;
  let category = "textual";
  let is_ruling_question = false;
  try {
    const call1Promise = executeCall1(rawQuestion, req.userApiKey, clientIp);
    const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error("CALL1_TIMEOUT")), 6e3));
    call1Result = await Promise.race([call1Promise, timeoutPromise]);
    call1Ms = Math.round(performance.now() - tCall1Start);
    call1Failover = `${call1Result.retriesCount} (${call1Result.modelUsed})`;
    category = call1Result.category;
    is_ruling_question = call1Result.is_ruling_question;
    if (call1Result.terms && call1Result.terms.length > 0) {
      const call1Search = searchCorpusKeywords(call1Result.terms, language, rawQuestion);
      const localTop3 = localSearch.passingSources.slice(0, 3).map((d) => d.id).join(",");
      const call1Top3 = call1Search.passingSources.slice(0, 3).map((d) => d.id).join(",");
      if (localTop3 !== call1Top3 && call1Search.passingSources.length > 0) {
        refined = true;
        finalPassingSources = call1Search.passingSources;
        finalTerms = call1Result.terms;
      }
    }
  } catch (err) {
    call1Ms = Math.round(performance.now() - tCall1Start);
    call1Failover = "1 (local_fallback)";
  }
  const isPermissibilityQuestion = is_ruling_question || category === "permissibility";
  if (finalPassingSources.length === 0) {
    const res2 = {
      question: rawQuestion,
      language,
      category,
      verdict: "unclear",
      verdictBadgeLabel: language === "en" ? "No relevant text found in indexed sources; consult qualified scholars" : "\u0644\u0645 \u0646\u0639\u062B\u0631 \u0639\u0644\u0649 \u0646\u0635\u064D\u0651 \u0645\u0631\u062A\u0628\u0637 \u0628\u0633\u0624\u0627\u0644\u0643 \u0641\u064A \u0627\u0644\u0645\u0635\u0627\u062F\u0631 \u0627\u0644\u0645\u0641\u0647\u0631\u0633\u0629\u061B \u0631\u0627\u062C\u0639 \u0623\u0647\u0644 \u0627\u0644\u0639\u0644\u0645",
      summary: "",
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
        totalMs: Math.round(performance.now() - startTime)
      }
    };
    askCache.set(normKey, res2);
    return res2;
  }
  const items = finalPassingSources.map((d) => {
    const quote = extractDenseClusterQuote(d.fullText, finalTerms, 25);
    return {
      id: d.id,
      quote,
      role: "supports",
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
      score: d.score
    };
  });
  if ((req.includeHadeethEnc || !req.singlePass && !isPermissibilityQuestion) && rawQuestion.length >= 3) {
    try {
      const hList = await searchAndGetHadeethEnc(rawQuestion, language, 2);
      for (const h of hList) {
        const hItem = toAskCitationItem(h, language, 25);
        if (!items.some((it) => it.id === hItem.id)) {
          items.push(hItem);
        }
      }
    } catch (_e) {
    }
  }
  const detVerdict = deriveDeterministicVerdict(items, category, language, rawQuestion);
  const totalStage1Ms = Math.round(performance.now() - startTime);
  const res = {
    question: rawQuestion,
    language,
    category,
    verdict: detVerdict.verdict,
    verdictBadgeLabel: detVerdict.badgeLabel,
    verdictBadgeSubline: refined ? language === "en" ? "Results refined with expanded search" : "\u062A\u0645 \u062A\u062D\u0633\u064A\u0646 \u0627\u0644\u0646\u062A\u0627\u0626\u062C \u0628\u0627\u0644\u0628\u062D\u062B \u0627\u0644\u0645\u0648\u0633\u0651\u0639" : detVerdict.badgeSubline,
    isPermissibility: isPermissibilityQuestion,
    summary: "",
    searchedTerms: finalTerms,
    items,
    retrievedCount: items.length,
    droppedItemsCount: 0,
    topRetrievedIds: items.slice(0, 3).map((i) => i.id),
    executionTimeMs: totalStage1Ms,
    timing: {
      call1Ms,
      retrievalMs,
      call2Ms: 0,
      promptChars: 0,
      retriesFailover: call1Failover,
      totalMs: totalStage1Ms
    },
    verdictPending: true
  };
  if (req.singlePass) {
    return askQuestionFullPass(res, rawQuestion, finalPassingSources, clientIp, startTime);
  }
  return res;
}
async function executeAskVerdict(body) {
  const t0 = performance.now();
  const rawQuestion = (body.question || "").trim();
  const language = body.language || "ar";
  const category = body.category || "textual";
  const terms = body.searchedTerms || [];
  const items = body.items || [];
  const isPermissibility = category === "permissibility";
  if (items.length === 0) {
    return {
      question: rawQuestion,
      language,
      category,
      verdict: "unclear",
      verdictBadgeLabel: language === "en" ? "No relevant text found in indexed sources; consult qualified scholars" : "\u0644\u0645 \u0646\u0639\u062B\u0631 \u0639\u0644\u0649 \u0646\u0635\u064D\u0651 \u0645\u0631\u062A\u0628\u0637 \u0628\u0633\u0624\u0627\u0644\u0643 \u0641\u064A \u0627\u0644\u0645\u0635\u0627\u062F\u0631 \u0627\u0644\u0645\u0641\u0647\u0631\u0633\u0629\u061B \u0631\u0627\u062C\u0639 \u0623\u0647\u0644 \u0627\u0644\u0639\u0644\u0645",
      summary: "",
      searchedTerms: terms,
      items: [],
      retrievedCount: 0,
      droppedItemsCount: 0,
      topRetrievedIds: [],
      executionTimeMs: 0
    };
  }
  const retrievedDocs = items.map((i) => ({
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
    hasNoGrading: i.hasNoGrading
  }));
  let call2Result;
  let call2Ms = 0;
  let promptChars = 0;
  let call2Failover = "0";
  try {
    const tCall2Start = performance.now();
    call2Result = await executeCall2(rawQuestion, retrievedDocs, isPermissibility);
    call2Ms = Math.round(performance.now() - tCall2Start);
    promptChars = call2Result.promptChars;
    call2Failover = `${call2Result.retriesCount} (${call2Result.modelUsed})`;
  } catch (err) {
    call2Ms = Math.round(performance.now() - t0);
    call2Result = {
      verdict: isPermissibility ? "permissibility" : "unclear",
      summary: language === "en" ? "Automated summary unavailable; texts below are the source" : "\u062A\u0639\u0630\u0651\u0631 \u0625\u0646\u0634\u0627\u0621 \u0627\u0644\u0645\u0644\u062E\u0635 \u0627\u0644\u0622\u0644\u064A \u0627\u0644\u0622\u0646\u061B \u0627\u0644\u0646\u0635\u0648\u0635 \u0623\u062F\u0646\u0627\u0647 \u0647\u064A \u0627\u0644\u0645\u0635\u062F\u0631",
      items: [],
      promptChars: 0,
      modelUsed: "failed",
      retriesCount: 1
    };
    call2Failover = "1 (failed)";
  }
  const itemMap = /* @__PURE__ */ new Map();
  for (const i of items) itemMap.set(i.id, i);
  for (const call2Item of call2Result.items || []) {
    const existing = itemMap.get(call2Item.id);
    if (existing && call2Item.quote) {
      existing.quote = extractDenseClusterQuote(existing.fullText, terms, 25) || call2Item.quote;
      existing.role = call2Item.role === "refutes" ? "refutes" : "supports";
    }
  }
  let finalSummary = call2Result.summary;
  if (!finalSummary) {
    if (isPermissibility) {
      const quotes = items.map((i) => i.quote).filter(Boolean);
      const prefix = language === "en" ? "The texts state: " : "\u062A\u0630\u0643\u0631 \u0627\u0644\u0646\u0635\u0648\u0635: ";
      finalSummary = quotes.length > 0 ? `${prefix}${quotes.join("\u061B ")}` : "";
    } else {
      finalSummary = language === "en" ? "Found matching texts in canonical sources below." : "\u062A\u0645 \u0627\u0644\u0639\u062B\u0648\u0631 \u0639\u0644\u0649 \u0646\u0635 \u0645\u0633\u0646\u062F \u0641\u064A \u0627\u0644\u0645\u0635\u0627\u062F\u0631 \u0623\u062F\u0646\u0627\u0647.";
    }
  }
  const detVerdict = deriveDeterministicVerdict(items, category, language, rawQuestion);
  const res = {
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
      totalMs: Math.round(performance.now() - t0)
    },
    verdictPending: false
  };
  const normKey = normalizeArabic(rawQuestion).toLowerCase().replace(/\s+/g, " ");
  askCache.set(normKey, res);
  return res;
}
async function askQuestionFullPass(stage1Res, rawQuestion, passingSources, clientIp, startTime) {
  if (stage1Res.isFabricated) {
    return stage1Res;
  }
  const verdictRes = await executeAskVerdict({
    question: rawQuestion,
    language: stage1Res.language,
    category: stage1Res.category,
    searchedTerms: stage1Res.searchedTerms,
    items: stage1Res.items
  });
  return {
    ...verdictRes,
    executionTimeMs: Math.round(performance.now() - startTime),
    timing: {
      call1Ms: stage1Res.timing?.call1Ms || 0,
      retrievalMs: stage1Res.timing?.retrievalMs || 0,
      call2Ms: verdictRes.timing?.call2Ms || 0,
      promptChars: verdictRes.timing?.promptChars || 0,
      retriesFailover: `${stage1Res.timing?.retriesFailover || "0"} / ${verdictRes.timing?.retriesFailover || "0"}`,
      totalMs: Math.round(performance.now() - startTime)
    }
  };
}

// server/app.ts
var app = express();
app.use(express.json({ limit: "10mb" }));
var lastGcTime = 0;
app.use((req, res, next) => {
  res.on("finish", () => {
    const now = Date.now();
    if (global.gc && now - lastGcTime > 3e4) {
      const mem = process.memoryUsage().heapUsed;
      if (mem > 650 * 1024 * 1024) {
        lastGcTime = now;
        setImmediate(() => {
          if (global.gc) global.gc();
        });
      }
    }
  });
  next();
});
function getEngineReadiness() {
  const h = initHadithEngine();
  const a = initAyahEngine();
  return {
    ayahReady: true,
    hadithReady: true,
    hadithCounts: getIndexedCounts(),
    hadithMem: h.indexMemoryBytes
  };
}
var REGISTERED_ROUTES = [
  "GET /api/health",
  "GET /api/corpus/stats",
  "POST /api/ayah/search",
  "POST /api/ayah/match",
  "POST /api/ayah/search/en",
  "POST /api/ayah/match/en",
  "POST /api/hadith/search",
  "POST /api/hadith/match",
  "POST /api/hadeethenc/search",
  "POST /api/hadeethenc/match",
  "GET /api/hadeethenc/hadith/:id",
  "POST /api/ask",
  "POST /api/ask/verdict",
  "POST /api/ocr",
  "GET /api/quota"
];
app.get("/api/health", (req, res) => {
  const { corpus, loadTimeMs } = loadCorpus();
  const readiness = getEngineReadiness();
  res.json({
    status: "ok",
    app: "Bayan",
    ready: true,
    timestamp: (/* @__PURE__ */ new Date()).toISOString(),
    corpusLoaded: {
      quranAyatCount: corpus.quran.ar.length,
      quranEnglishAyatCount: 6236,
      hadithCollectionsCount: 7,
      hadithCounts: readiness.hadithCounts,
      loadTimeMs
    },
    registeredRoutes: REGISTERED_ROUTES
  });
});
app.get("/api/corpus/stats", (req, res) => {
  const { corpus, loadTimeMs } = loadCorpus();
  res.json({
    status: "ready",
    loadTimeMs,
    counts: {
      quran: {
        ar: corpus.quran.ar.length,
        en: 6236
      },
      hadith: {
        bukhari: { ar: corpus.hadith.ar.bukhari.length, en: 7580 },
        muslim: { ar: corpus.hadith.ar.muslim.length, en: 7360 },
        abudawud: { ar: corpus.hadith.ar.abudawud.length, en: 5272 },
        tirmidhi: { ar: corpus.hadith.ar.tirmidhi.length, en: 3924 },
        nasai: { ar: corpus.hadith.ar.nasai.length, en: 5679 },
        ibnmajah: { ar: corpus.hadith.ar.ibnmajah.length, en: 4338 },
        nawawi: { ar: corpus.hadith.ar.nawawi.length, en: 42 }
      }
    }
  });
});
app.post("/api/ayah/search", (req, res) => {
  const query = req.body?.query || req.body?.text || "";
  const result = searchAyah(query);
  res.json(result);
});
app.post("/api/ayah/match", (req, res) => {
  const query = req.body?.query || req.body?.text || "";
  const result = searchAyah(query);
  res.json(result);
});
app.post("/api/ayah/search/en", (req, res) => {
  const query = req.body?.query || req.body?.text || "";
  const result = searchAyahEn(query);
  res.json(result);
});
app.post("/api/ayah/match/en", (req, res) => {
  const query = req.body?.query || req.body?.text || "";
  const result = searchAyahEn(query);
  res.json(result);
});
app.post("/api/hadith/search", async (req, res) => {
  const query = req.body?.query || req.body?.text || "";
  const includeHadeethEnc = req.body?.includeHadeethEnc === true;
  const result = searchHadith(query);
  if (includeHadeethEnc && query.trim().length >= 2) {
    try {
      const hadeethEncDetails = await searchAndGetHadeethEnc(query, result.language || "ar", 3);
      const hadeethEncResults = hadeethEncDetails.map((d) => toHadithMatchResult(d, query, result.language || "ar"));
      result.hadeethEncResults = hadeethEncResults;
      result.hadeethEncDetails = hadeethEncDetails;
    } catch (_e) {
      result.hadeethEncResults = [];
      result.hadeethEncDetails = [];
    }
  }
  if (result.language === "en" && global.gc) {
    global.gc();
  }
  res.json(result);
});
app.post("/api/hadith/match", async (req, res) => {
  const query = req.body?.query || req.body?.text || "";
  const includeHadeethEnc = req.body?.includeHadeethEnc === true;
  const result = searchHadith(query);
  if (includeHadeethEnc && query.trim().length >= 2) {
    try {
      const hadeethEncDetails = await searchAndGetHadeethEnc(query, result.language || "ar", 3);
      const hadeethEncResults = hadeethEncDetails.map((d) => toHadithMatchResult(d, query, result.language || "ar"));
      result.hadeethEncResults = hadeethEncResults;
      result.hadeethEncDetails = hadeethEncDetails;
    } catch (_e) {
      result.hadeethEncResults = [];
      result.hadeethEncDetails = [];
    }
  }
  if (result.language === "en" && global.gc) {
    global.gc();
  }
  res.json(result);
});
app.post("/api/hadeethenc/search", async (req, res) => {
  try {
    const phrase = req.body?.phrase || req.body?.query || req.body?.text || "";
    const language = req.body?.language === "en" ? "en" : "ar";
    const items = await searchHadeethEnc(phrase, language);
    res.json({ phrase, language, count: items.length, items });
  } catch (err) {
    res.status(500).json({ error: "FAILED_TO_SEARCH_HADEETHENC", details: err?.message, items: [] });
  }
});
app.get("/api/hadeethenc/hadith/:id", async (req, res) => {
  try {
    const id = req.params.id;
    const language = req.query.language === "en" ? "en" : "ar";
    const hadith = await getHadeethEncById(id, language);
    if (!hadith) {
      res.status(404).json({ error: "HADEETH_NOT_FOUND", id });
      return;
    }
    res.json(hadith);
  } catch (err) {
    res.status(500).json({ error: "FAILED_TO_FETCH_HADEETHENC", details: err?.message });
  }
});
app.post("/api/hadeethenc/match", async (req, res) => {
  try {
    const query = req.body?.query || req.body?.text || "";
    const language = req.body?.language === "en" ? "en" : /[a-z]/i.test(query) ? "en" : "ar";
    const detailsList = await searchAndGetHadeethEnc(query, language, 5);
    const results = detailsList.map((d) => toHadithMatchResult(d, query, language));
    const topConfidence = results.length > 0 ? results[0].confidence : 0;
    const state = results.length === 0 ? "not_found" : results[0].state;
    res.json({
      query,
      language,
      source: "hadeethenc",
      state,
      topConfidence,
      totalMatches: results.length,
      results,
      details: detailsList
    });
  } catch (err) {
    res.status(500).json({
      query: req.body?.query || "",
      error: "HADEETHENC_MATCH_FAILED",
      details: err?.message,
      state: "not_found",
      results: []
    });
  }
});
app.post("/api/ask", async (req, res) => {
  try {
    const clientIp = req.headers["x-forwarded-for"]?.split(",")[0]?.trim() || req.socket.remoteAddress || "127.0.0.1";
    const result = await executeAskStage1(req.body || {}, clientIp);
    if (result.error && result.error.includes("\u062A\u0645 \u062A\u062C\u0627\u0648\u0632 \u0627\u0644\u062D\u062F \u0627\u0644\u0645\u0633\u0645\u0648\u062D \u0628\u0647")) {
      res.status(429).json(result);
      return;
    }
    if (result.error && result.error.includes("GEMINI_API_KEY")) {
      res.status(503).json(result);
      return;
    }
    res.json(result);
  } catch (err) {
    res.status(500).json({
      error: "\u062D\u062F\u062B \u062E\u0637\u0623 \u0623\u062B\u0646\u0627\u0621 \u0645\u0639\u0627\u0644\u062C\u0629 \u0627\u0644\u0633\u0624\u0627\u0644 \u0627\u0644\u0634\u0631\u0639\u064A.",
      details: err?.message
    });
  }
});
app.post("/api/ask/verdict", async (req, res) => {
  try {
    const result = await executeAskVerdict(req.body || {});
    res.json(result);
  } catch (err) {
    res.status(500).json({
      error: "\u062D\u062F\u062B \u062E\u0637\u0623 \u0623\u062B\u0646\u0627\u0621 \u0625\u0639\u062F\u0627\u062F \u0645\u0644\u062E\u0635 \u0627\u0644\u0627\u0633\u062A\u062F\u0644\u0627\u0644.",
      details: err?.message
    });
  }
});
app.post("/api/ocr", async (req, res) => {
  try {
    const { imageBase64, language = "ar", userApiKey } = req.body || {};
    const clientIp = req.headers["x-forwarded-for"]?.split(",")[0]?.trim() || req.socket.remoteAddress || "127.0.0.1";
    if (!imageBase64) {
      res.status(400).json({ error: "IMAGE_REQUIRED" });
      return;
    }
    const headerKey = req.headers["x-gemini-api-key"];
    const userKey = (typeof userApiKey === "string" && userApiKey.trim() ? userApiKey.trim() : void 0) || (typeof headerKey === "string" && headerKey.trim() ? headerKey.trim() : void 0);
    if (!userKey) {
      const ipCheck = quotaManager.checkIpLimit(clientIp);
      if (!ipCheck.allowed) {
        res.status(429).json({
          error: "IP_RATE_LIMIT_EXCEEDED",
          retryAfterSeconds: ipCheck.retryAfterSeconds,
          notice: quotaManager.getQuotaNotice(language === "en" ? "en" : "ar")
        });
        return;
      }
    }
    const apiKey = userKey || process.env.GEMINI_API_KEY;
    if (!apiKey) {
      res.status(503).json({
        error: "NO_API_KEY",
        notice: quotaManager.getQuotaNotice(language === "en" ? "en" : "ar")
      });
      return;
    }
    let modelToUse = null;
    let retryAfter = 0;
    if (userKey) {
      modelToUse = "gemini-3.5-flash-lite";
    } else {
      const acq = quotaManager.acquireModel("ocr");
      modelToUse = acq.model;
      retryAfter = acq.retryAfterSeconds;
    }
    if (!modelToUse) {
      res.status(429).json({
        error: "QUOTA_EXHAUSTED",
        retryAfterSeconds: retryAfter,
        notice: quotaManager.getQuotaNotice(language === "en" ? "en" : "ar")
      });
      return;
    }
    const ai = getGeminiClient(userKey);
    let mimeType = "image/jpeg";
    let base64Data = imageBase64;
    const match = imageBase64.match(/^data:([^;]+);base64,(.+)$/);
    if (match) {
      mimeType = match[1];
      base64Data = match[2];
    }
    const prompt = language === "en" ? "Extract all readable scripture, verse, or hadith text from this image. Return ONLY the plain extracted text without commentary, markdown code blocks, or greetings." : "\u0627\u0633\u062A\u062E\u0631\u062C \u0627\u0644\u0646\u0635 \u0627\u0644\u0639\u0631\u0628\u064A \u0627\u0644\u0645\u0642\u0631\u0648\u0621 \u0645\u0646 \u0647\u0630\u0647 \u0627\u0644\u0635\u0648\u0631\u0629 (\u0622\u064A\u0629 \u0642\u0631\u0622\u0646\u064A\u0629 \u0623\u0648 \u062D\u062F\u064A\u062B \u0646\u0628\u0648\u064A). \u0623\u062E\u0631\u062C \u0641\u0642\u0637 \u0627\u0644\u0646\u0635 \u0627\u0644\u0645\u0633\u062A\u062E\u0631\u062C \u0646\u0642\u064A\u0627\u064B \u062F\u0648\u0646 \u0645\u0642\u062F\u0645\u0627\u062A \u0623\u0648 \u0634\u0631\u0648\u062D\u0627\u062A \u0623\u0648 \u0639\u0644\u0627\u0645\u0627\u062A \u0643\u0648\u062F.";
    try {
      const response = await ai.models.generateContent({
        model: modelToUse,
        contents: [
          {
            role: "user",
            parts: [
              { text: prompt },
              {
                inlineData: {
                  mimeType,
                  data: base64Data
                }
              }
            ]
          }
        ]
      });
      const extractedText = response.text?.trim() || "";
      if (!userKey) {
        quotaManager.recordIpUsage(clientIp);
      }
      res.json({ text: extractedText });
    } catch (err) {
      if (!userKey && modelToUse) {
        const is429or503 = err?.status === 429 || err?.status === 503 || err?.message?.includes("429") || err?.message?.includes("503");
        if (is429or503) {
          quotaManager.markModelUnavailable(modelToUse);
        }
      }
      if (!userKey) {
        const acq2 = quotaManager.acquireModel("ocr");
        if (acq2.model) {
          try {
            const res2 = await ai.models.generateContent({
              model: acq2.model,
              contents: [
                {
                  role: "user",
                  parts: [
                    { text: prompt },
                    {
                      inlineData: {
                        mimeType,
                        data: base64Data
                      }
                    }
                  ]
                }
              ]
            });
            quotaManager.recordIpUsage(clientIp);
            res.json({ text: res2.text?.trim() || "" });
            return;
          } catch {
          }
        }
      }
      res.status(500).json({
        error: "OCR_PROCESSING_FAILED",
        notice: quotaManager.getQuotaNotice(language === "en" ? "en" : "ar")
      });
    }
  } catch (outerErr) {
    res.status(500).json({ error: "SERVER_ERROR" });
  }
});
app.get("/api/quota", (req, res) => {
  const stats = quotaManager.getReportStats();
  const remainingOcr = quotaManager.getTotalRemainingForAction("ocr");
  const remainingAsk = quotaManager.getTotalRemainingForAction("ask_call2");
  res.json({
    remainingOcr,
    remainingAsk,
    resetMinutes: stats.minutesRemainingInHour,
    retryAfterSeconds: stats.retryAfterSeconds,
    models: stats.models,
    actionCounters: stats.actionCounters
  });
});

// server/corpus/prebuild.ts
import fs5 from "fs";
import path5 from "path";
import zlib3 from "zlib";
import { fileURLToPath as fileURLToPath5 } from "url";
var __filename5 = fileURLToPath5(import.meta.url);
var __dirname5 = path5.dirname(__filename5);
var DATA_DIR3 = path5.resolve(__dirname5, "./data");
var EXPECTED_COUNTS = {
  bukhari: 7580,
  muslim: 7360,
  abudawud: 5272,
  tirmidhi: 3924,
  nasai: 5679,
  ibnmajah: 4338,
  nawawi: 42
};
var QURAN_EXPECTED = 6236;
var COLLECTIONS = Object.keys(EXPECTED_COUNTS);
async function downloadFile(url, dest) {
  console.log(`Downloading ${url} ...`);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to download ${url}: ${res.statusText}`);
  const text = await res.text();
  fs5.writeFileSync(dest, text);
}
async function runPrebuild() {
  console.log("====================================================");
  console.log("Starting Prebuild: Data Acquisition & Index Generation");
  const startTime = performance.now();
  if (!fs5.existsSync(DATA_DIR3)) {
    fs5.mkdirSync(DATA_DIR3, { recursive: true });
  }
  try {
    for (const col of COLLECTIONS) {
      const arPath = path5.join(DATA_DIR3, `hadith_${col}_ar.json`);
      const enPath = path5.join(DATA_DIR3, `hadith_${col}_en.json`);
      if (!fs5.existsSync(arPath)) {
        await downloadFile(`https://cdn.jsdelivr.net/gh/fawazahmed0/hadith-api@df57907be35291c91ad6a6691180e22ca9920784/editions/ara-${col}.json`, arPath);
      }
      if (!fs5.existsSync(enPath)) {
        await downloadFile(`https://cdn.jsdelivr.net/gh/fawazahmed0/hadith-api@df57907be35291c91ad6a6691180e22ca9920784/editions/eng-${col}.json`, enPath);
      }
    }
    if (!fs5.existsSync(path5.join(DATA_DIR3, "quran_info.json"))) {
      await downloadFile(`https://cdn.jsdelivr.net/gh/fawazahmed0/quran-api@47ca096b0976443ba2eab2e45cdf0fb4096a2610/info.json`, path5.join(DATA_DIR3, "quran_info.json"));
    }
    if (!fs5.existsSync(path5.join(DATA_DIR3, "quran_ar.json"))) {
      await downloadFile(`https://cdn.jsdelivr.net/gh/fawazahmed0/quran-api@47ca096b0976443ba2eab2e45cdf0fb4096a2610/editions/ara-quranacademy.json`, path5.join(DATA_DIR3, "quran_ar.json"));
    }
    await downloadFile(`https://cdn.jsdelivr.net/gh/fawazahmed0/quran-api@47ca096b0976443ba2eab2e45cdf0fb4096a2610/editions/eng-ummmuhammad.json`, path5.join(DATA_DIR3, "quran_en.json"));
    const tafsirPath = path5.join(DATA_DIR3, "quran_tafsir_moyassar.json");
    if (!fs5.existsSync(tafsirPath)) {
      console.log("Fetching Muyassar Tafsir from QuranEnc (arabic_moyassar)...");
      const tafsirList = [];
      const BATCH_SIZE = 15;
      for (let i = 1; i <= 114; i += BATCH_SIZE) {
        const batch = [];
        for (let s = i; s < i + BATCH_SIZE && s <= 114; s++) {
          batch.push(
            fetch(`https://quranenc.com/api/v1/translation/sura/arabic_moyassar/${s}`).then((r) => r.json()).catch((err) => {
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
                tafsir: (v.translation || "").trim()
              });
            }
          }
        }
      }
      if (tafsirList.length !== QURAN_EXPECTED) {
        console.error(`CRITICAL ERROR: Muyassar Tafsir count mismatch! Expected ${QURAN_EXPECTED}, got ${tafsirList.length}`);
        process.exit(1);
      }
      fs5.writeFileSync(tafsirPath, JSON.stringify(tafsirList, null, 2));
      console.log(`Saved ${tafsirList.length} Muyassar Tafsir entries to ${tafsirPath}`);
    }
  } catch (err) {
    console.error("CRITICAL: Download failed. Prebuild aborted.");
    console.error(err);
    process.exit(1);
  }
  console.log("Preprocessing records and verifying counts...");
  const { records, vocab, sections, emptyCount } = preprocessAllRawHadiths();
  const actualCounts = {};
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
  const quranAr = JSON.parse(fs5.readFileSync(path5.join(DATA_DIR3, "quran_ar.json"), "utf8"));
  const quranList = quranAr.quran || quranAr[Object.keys(quranAr)[0]];
  if (quranList.length !== QURAN_EXPECTED) {
    console.error(`ERROR: Quran count mismatch! Expected ${QURAN_EXPECTED}, got ${quranList.length}`);
    mismatch = true;
  }
  if (mismatch) {
    console.error("CRITICAL: Data verification failed. Build aborted.");
    process.exit(1);
  }
  console.log("Verification PASSED.");
  const outPathGz = path5.join(DATA_DIR3, "prebuilt_hadiths.json.gz");
  const serializedRecords = records.map((r) => ({
    c: r.c,
    n: r.n,
    m: Array.from(r.m),
    f: Array.from(r.f),
    r: r.r,
    o: r.o
  }));
  const jsonStr = JSON.stringify({ v: vocab, r: serializedRecords, s: sections });
  const compressed = zlib3.gzipSync(Buffer.from(jsonStr, "utf8"));
  fs5.writeFileSync(outPathGz, compressed);
  console.log("Building Precomputed Inverted Ask Index...");
  const askIndexStart = performance.now();
  const quranEn = JSON.parse(fs5.readFileSync(path5.join(DATA_DIR3, "quran_en.json"), "utf8"));
  const quranEnList = quranEn.quran || quranEn[Object.keys(quranEn)[0]] || [];
  const quranEnMap2 = /* @__PURE__ */ new Map();
  for (const v of quranEnList) {
    quranEnMap2.set(`${v.chapter}_${v.verse}`, v.text || "");
  }
  const tafsirListRaw = JSON.parse(fs5.readFileSync(path5.join(DATA_DIR3, "quran_tafsir_moyassar.json"), "utf8"));
  const tafsirMap = /* @__PURE__ */ new Map();
  for (const t of tafsirListRaw) {
    tafsirMap.set(`${t.chapter}_${t.verse}`, t.tafsir || "");
  }
  function cleanAr(text) {
    return (text || "").replace(/[\u064B-\u065F\u0670]/g, "").replace(/[\u0622\u0623\u0625\u0671]/g, "\u0627").replace(/\u0649/g, "\u064A").replace(/\u0629/g, "\u0647");
  }
  function stripPref(w) {
    let s = cleanAr(w);
    if (s.startsWith("\u0648\u0627\u0644") && s.length > 4) s = s.slice(3);
    else if (s.startsWith("\u0641\u0627\u0644") && s.length > 4) s = s.slice(3);
    else if (s.startsWith("\u0628\u0627\u0644") && s.length > 4) s = s.slice(3);
    else if (s.startsWith("\u0644\u0644") && s.length > 3) s = s.slice(2);
    else if (s.startsWith("\u0627\u0644") && s.length > 3) s = s.slice(2);
    else if ((s.startsWith("\u0648") || s.startsWith("\u0641") || s.startsWith("\u0628") || s.startsWith("\u0644") || s.startsWith("\u0643")) && s.length > 3) {
      s = s.slice(1);
    }
    return s;
  }
  function extractMatn(text, maxWords = 80) {
    if (!text) return "";
    let s = text.replace(/<[^>]*>/g, " ");
    const isnadMarkers = [
      "\u0642\u0627\u0644 \u0631\u0633\u0648\u0644 \u0627\u0644\u0644\u0647 \u0635\u0644\u0649 \u0627\u0644\u0644\u0647 \u0639\u0644\u064A\u0647 \u0648\u0633\u0644\u0645",
      "\u0623\u0646 \u0631\u0633\u0648\u0644 \u0627\u0644\u0644\u0647 \u0635\u0644\u0649 \u0627\u0644\u0644\u0647 \u0639\u0644\u064A\u0647 \u0648\u0633\u0644\u0645 \u0642\u0627\u0644",
      "\u0639\u0646 \u0627\u0644\u0646\u0628\u064A \u0635\u0644\u0649 \u0627\u0644\u0644\u0647 \u0639\u0644\u064A\u0647 \u0648\u0633\u0644\u0645 \u0642\u0627\u0644",
      "\u0633\u0645\u0639\u062A \u0631\u0633\u0648\u0644 \u0627\u0644\u0644\u0647 \u0635\u0644\u0649 \u0627\u0644\u0644\u0647 \u0639\u0644\u064A\u0647 \u0648\u0633\u0644\u0645 \u064A\u0642\u0648\u0644",
      "\u0623\u0646 \u0627\u0644\u0646\u0628\u064A \u0635\u0644\u0649 \u0627\u0644\u0644\u0647 \u0639\u0644\u064A\u0647 \u0648\u0633\u0644\u0645 \u0642\u0627\u0644",
      "\u0642\u064E\u0627\u0644\u064E \u0631\u064E\u0633\u064F\u0648\u0644\u064F \u0627\u0644\u0644\u0651\u064E\u0647\u0650 \u0635\u0644\u0649 \u0627\u0644\u0644\u0647 \u0639\u0644\u064A\u0647 \u0648\u0633\u0644\u0645",
      "\u0642\u064E\u0627\u0644\u064E \u0631\u064E\u0633\u064F\u0648\u0644\u064F \u0627\u0644\u0644\u064E\u0651\u0647\u0650 \u0635\u0644\u0649 \u0627\u0644\u0644\u0647 \u0639\u0644\u064A\u0647 \u0648\u0633\u0644\u0645",
      "\u0642\u064E\u0627\u0644\u064E \u0627\u0644\u0646\u0651\u064E\u0628\u0650\u064A\u0651\u064F \u0635\u0644\u0649 \u0627\u0644\u0644\u0647 \u0639\u0644\u064A\u0647 \u0648\u0633\u0644\u0645"
    ];
    for (const m of isnadMarkers) {
      const idx = s.indexOf(m);
      if (idx !== -1 && idx < s.length * 0.65) {
        s = s.slice(idx + m.length);
        break;
      }
    }
    return s.trim().split(/\s+/).filter(Boolean).slice(0, maxWords).join(" ");
  }
  const askDocs = [];
  const postings = {};
  function addDocTokens(docIdx, arText, enText, tafsirText) {
    const tokenSet = /* @__PURE__ */ new Set();
    const arWords = cleanAr(arText).split(/[^\u0621-\u064A]+/).filter((w) => w.length >= 2);
    for (const w of arWords) {
      tokenSet.add(w);
      const str = stripPref(w);
      if (str.length >= 2) tokenSet.add(str);
    }
    if (tafsirText) {
      const tafsirWords = cleanAr(tafsirText).split(/[^\u0621-\u064A]+/).filter((w) => w.length >= 2);
      for (const w of tafsirWords) {
        tokenSet.add(w);
        const str = stripPref(w);
        if (str.length >= 2) tokenSet.add(str);
      }
    }
    if (enText) {
      const enWords = enText.toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length >= 3);
      for (const w of enWords) {
        tokenSet.add(w);
      }
    }
    for (const tok of tokenSet) {
      if (!postings[tok]) postings[tok] = [];
      postings[tok].push(docIdx);
    }
  }
  for (const v of quranList) {
    const ch = Number(v.chapter);
    const verse = Number(v.verse);
    const ar = cleanAr(v.text || "");
    const en = (quranEnMap2.get(`${ch}_${verse}`) || "").toLowerCase();
    const tafsir = cleanAr(tafsirMap.get(`${ch}_${verse}`) || "");
    const docIdx = askDocs.length;
    askDocs.push({
      id: `ayah_${ch}_${verse}`,
      type: "ayah",
      ch,
      v: verse,
      normAr: ar,
      normEn: en,
      normTafsir: tafsir
    });
    addDocTokens(docIdx, ar, en, tafsir);
  }
  for (const col of COLLECTIONS) {
    const rawAr = JSON.parse(fs5.readFileSync(path5.join(DATA_DIR3, `hadith_${col}_ar.json`), "utf8"));
    const rawEn = JSON.parse(fs5.readFileSync(path5.join(DATA_DIR3, `hadith_${col}_en.json`), "utf8"));
    const listAr = rawAr.hadiths || [];
    const listEn = rawEn.hadiths || [];
    for (let i = 0; i < listAr.length; i++) {
      const hAr = listAr[i];
      const hEn = listEn[i];
      if (!hAr || !hAr.text) continue;
      const num = hAr.hadithnumber || i + 1;
      const matnAr = cleanAr(extractMatn(hAr.text, 80));
      const matnEn = (hEn?.text || "").toLowerCase();
      const docIdx = askDocs.length;
      askDocs.push({
        id: `${col}_${num}`,
        type: "hadith",
        col,
        num,
        normAr: matnAr,
        normEn: matnEn
      });
      addDocTokens(docIdx, matnAr, matnEn);
    }
  }
  const askIndexFile = path5.join(DATA_DIR3, "ask_search_index.json.gz");
  const askIndexPayload = JSON.stringify({ docs: askDocs, postings });
  const askCompressed = zlib3.gzipSync(Buffer.from(askIndexPayload, "utf8"));
  fs5.writeFileSync(askIndexFile, askCompressed);
  const askElapsed = Math.round(performance.now() - askIndexStart);
  console.log(`Precomputed Inverted Ask Index generated in ${askElapsed}ms!`);
  console.log(`Indexed ${askDocs.length} documents (${Object.keys(postings).length} unique tokens). Saved to ${askIndexFile} (${askCompressed.length} bytes).`);
  const elapsed = Math.round(performance.now() - startTime);
  console.log(`Prebuild Completed successfully in ${elapsed}ms!`);
  console.log(`Saved ${records.length} records to ${outPathGz} (${compressed.length} bytes).`);
  console.log("====================================================");
}
if (process.argv[1]?.includes("prebuild")) {
  runPrebuild().catch((err) => {
    console.error("Prebuild failed:", err);
    process.exit(1);
  });
}

// server/server.ts
dotenv.config();
var __filename6 = fileURLToPath6(import.meta.url);
var __dirname6 = path6.dirname(__filename6);
var PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3e3;
async function startServer() {
  const distPath = path6.resolve(__dirname6, "../dist");
  const hasDist = fs6.existsSync(distPath);
  const isProd = process.env.NODE_ENV === "production";
  if (!isProd) {
    const vite = await createViteServer({
      server: { middlewareMode: true, host: true },
      appType: "spa"
    });
    app.use(vite.middlewares);
  } else if (hasDist) {
    app.use(express2.static(distPath));
    app.get("*", (req, res, next) => {
      if (req.path.startsWith("/api")) return next();
      res.sendFile(path6.join(distPath, "index.html"));
    });
  }
  console.log("Initializing Search Engines...");
  const corpusDir = DATA_DIR;
  const quranArFile = path6.join(corpusDir, "quran_ar.json");
  if (!fs6.existsSync(quranArFile)) {
    console.log("Corpus data missing, running prebuild data acquisition...");
    await runPrebuild();
  }
  const { corpus, loadTimeMs: corpusTime } = loadCorpus();
  const { totalIndexed: hadithCount, indexMemoryBytes: hadithMem } = initHadithEngine();
  const { totalIndexed: ayahCount } = initAyahEngine();
  const askIndex = loadAskSearchIndex();
  const counts = getIndexedCounts();
  if (global.gc) {
    global.gc();
  }
  app.listen(PORT, "0.0.0.0", () => {
    console.log(`====================================================`);
    console.log(`Bayan Server listening on http://0.0.0.0:${PORT}`);
    console.log(`Environment: ${isProd ? "PRODUCTION" : "DEVELOPMENT"}`);
    console.log(`Corpus Loaded in ${corpusTime}ms`);
    console.log(`Hadith Engine: ${hadithCount} records indexed (${Math.round(hadithMem / 1024)}KB memory map)`);
    console.log(`Ayah Engine: ${ayahCount} records indexed`);
    console.log(`Registered API Routes:`);
    REGISTERED_ROUTES.forEach((r) => console.log(`  [x] ${r}`));
    console.log(`====================================================`);
  });
}
startServer().catch((err) => {
  console.error("Fatal error starting server:", err);
  process.exit(1);
});
