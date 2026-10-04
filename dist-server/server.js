// server/server.ts
import express2 from "express";
import fs5 from "fs";
import path5 from "path";
import { fileURLToPath as fileURLToPath5 } from "url";
import { createServer as createViteServer } from "vite";

// server/app.ts
import express from "express";

// server/corpus/loader.ts
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
var __filename = fileURLToPath(import.meta.url);
var __dirname = path.dirname(__filename);
var DATA_DIR = fs.existsSync(path.resolve(__dirname, "./data")) ? path.resolve(__dirname, "./data") : path.resolve(process.cwd(), "server/corpus/data");
var cachedCorpus = null;
var loadDurationMs = 0;
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
var cachedHadithEn = {};
function getHadithEn(col) {
  if (!cachedHadithEn[col]) {
    const raw = readJsonFile(`hadith_${col}_en.json`);
    const list = raw.hadiths || [];
    cachedHadithEn[col] = list.map((h) => ({
      hadithnumber: h.hadithnumber,
      arabicnumber: h.arabicnumber ?? h.hadithnumber,
      text: h.text || "",
      grades: [],
      reference: {
        book: h.reference?.book || 0,
        hadith: h.reference?.hadith || 0
      }
    }));
  }
  return cachedHadithEn[col];
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
    hadithAr[col] = list.map((h) => ({
      hadithnumber: h.hadithnumber,
      arabicnumber: h.arabicnumber ?? h.hadithnumber,
      text: h.text || "",
      grades: h.grades || [],
      reference: {
        book: h.reference?.book || 0,
        hadith: h.reference?.hadith || 0
      }
    }));
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
  s = s.replace(/[.,/#!$%^&*;:{}=\-_`~()؟،؛«»"'\d\u0660-\u0669\uFD3E\uFD3F\[\]<>ـ]/g, " ");
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
var DATA_DIR2 = fs2.existsSync(path2.resolve(__dirname2, "../corpus/data")) ? path2.resolve(__dirname2, "../corpus/data") : path2.resolve(process.cwd(), "server/corpus/data");
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
    fs2.readFileSync(path2.join(DATA_DIR2, "quran_info.json"), "utf8")
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
        const firstW = stream.find((w) => w.verse === ayah.verse && w.wordIndexInAyah === 0);
        if (firstW) {
          let sSet = candidateStartsBySurah.get(ayah.chapter);
          if (!sSet) {
            sSet = /* @__PURE__ */ new Set();
            candidateStartsBySurah.set(ayah.chapter, sSet);
          }
          sSet.add(firstW.globalWordIndex);
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

// server/matching/hadithMatcher.ts
import fs3 from "fs";
import path3 from "path";
import zlib from "zlib";
import { fileURLToPath as fileURLToPath3 } from "url";
var __filename3 = fileURLToPath3(import.meta.url);
var __dirname3 = path3.dirname(__filename3);
var DATA_DIR3 = fs3.existsSync(path3.resolve(__dirname3, "../corpus/data")) ? path3.resolve(__dirname3, "../corpus/data") : path3.resolve(process.cwd(), "server/corpus/data");
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
  const dp = Array.from({ length: m + 1 }, () => new Float64Array(n + 1));
  const back = Array.from({ length: m + 1 }, () => new Int32Array(n + 1));
  dp[0][0] = 0;
  for (let i = 1; i <= m; i++) {
    dp[i][0] = i * 1.5;
    back[i][0] = 2;
  }
  for (let j = 1; j <= n; j++) {
    dp[0][j] = 0;
    back[0][j] = 3;
  }
  for (let i = 1; i <= m; i++) {
    const qw = queryTokens[i - 1].normalized;
    for (let j = 1; j <= n; j++) {
      const sw = sourceTokens[j - 1].normalized;
      let subCost = 3;
      if (qw === sw || qw.replace(/ء/g, "\u0627") === sw.replace(/ء/g, "\u0627")) {
        subCost = 0;
      } else {
        const lenDiff = Math.abs(qw.length - sw.length);
        if (lenDiff <= 1) {
          const dist = levenshteinDistance(qw, sw);
          if (dist <= 1) {
            subCost = 0.5;
          } else {
            subCost = 2.5;
          }
        } else {
          subCost = 2.5;
        }
      }
      const costDiag = dp[i - 1][j - 1] + subCost;
      const costUp = dp[i - 1][j] + 1.5;
      const costLeft = dp[i][j - 1] + 1;
      if (costDiag <= costUp && costDiag <= costLeft) {
        dp[i][j] = costDiag;
        back[i][j] = 1;
      } else if (costUp <= costLeft) {
        dp[i][j] = costUp;
        back[i][j] = 2;
      } else {
        dp[i][j] = costLeft;
        back[i][j] = 3;
      }
    }
  }
  let bestJ = n;
  let minCost = dp[m][n];
  const searchStart = Math.min(n, Math.max(1, m - 4));
  for (let j = searchStart; j <= n; j++) {
    if (dp[m][j] < minCost) {
      minCost = dp[m][j];
      bestJ = j;
    }
  }
  const rev = [];
  let currI = m;
  let currJ = bestJ;
  while (currI > 0) {
    if (currI > 0 && currJ > 0 && back[currI][currJ] === 1) {
      const qw = queryTokens[currI - 1];
      const sw = sourceTokens[currJ - 1];
      const isExact = qw.normalized === sw.normalized || qw.normalized.replace(/ء/g, "\u0627") === sw.normalized.replace(/ء/g, "\u0627");
      const dist = isExact ? 0 : levenshteinDistance(qw.normalized, sw.normalized);
      const type = isExact ? "exact" : dist <= 1 ? "approximate" : "deleted";
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
    } else if (currJ <= 0 || back[currI][currJ] === 2) {
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
  let bestStart = 0;
  let maxHits = -1;
  const winLen = query.length;
  for (let i = 0; i <= source.length - winLen; i++) {
    let hits = 0;
    for (let j = 0; j < winLen; j++) {
      if (qWords.has(source[i + j].normalized)) hits++;
    }
    if (hits > maxHits) {
      maxHits = hits;
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
    const arPath = path3.join(DATA_DIR3, `hadith_${col}_ar.json`);
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
  const prebuiltPathGz = path3.join(DATA_DIR3, "prebuilt_hadiths.json.gz");
  const prebuiltPathPlain = path3.join(DATA_DIR3, "prebuilt_hadiths.json");
  corpusHadiths = [];
  twoGramKeyIndexMap.clear();
  let emptyCount = 379;
  if (fs3.existsSync(prebuiltPathGz)) {
    const buffer = fs3.readFileSync(prebuiltPathGz);
    const decompressed = zlib.gunzipSync(buffer).toString("utf8");
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
  const candidateIndices = Array.from(candHits.entries()).filter(([_, count]) => count >= 2 || targetTokenIds.length <= 4).sort((a, b) => b[1] - a[1]).slice(0, 20).map(([cIdx]) => cIdx);
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
      const arList = corpus.hadith.ar[candidate.c] || [];
      const rawAr = arList.find((h) => h.hadithnumber === candidate.n);
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
    const { corpus } = loadCorpus();
    const cols = ["bukhari", "muslim", "abudawud", "tirmidhi", "nasai", "ibnmajah", "nawawi"];
    for (const col of cols) {
      const enList = corpus.hadith.en[col] || [];
      const arList = corpus.hadith.ar[col] || [];
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
          const rawAr = arList.find((x) => x.hadithnumber === enH.hadithnumber);
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
    candidateIndices = Array.from(candidateScores.entries()).sort((a, b) => b[1] - a[1]).slice(0, 25).map((entry) => entry[0]);
  } else if (qIds[0] !== -1 || fullQIds[0] !== -1) {
    const targetId = qIds[0] !== -1 ? qIds[0] : fullQIds[0];
    for (let c = 0; c < corpusHadiths.length; c++) {
      if (corpusHadiths[c].f.includes(targetId)) {
        candidateIndices.push(c);
        if (candidateIndices.length >= 25) break;
      }
    }
  }
  const results = [];
  const qTokenize = tokenizeDisplayWords(trimmed);
  const qNonSkipped = qTokenize.nonSkipped;
  const qStripped = stripIsnadTokens(qNonSkipped);
  const matnQTokens = qStripped.matnTokens;
  for (const cIdx of candidateIndices) {
    const record = corpusHadiths[cIdx];
    const { corpus } = loadCorpus();
    const arList = corpus.hadith.ar[record.c] || [];
    const rawAr = arList.find((h) => h.hadithnumber === record.n);
    const rawArabicText = rawAr?.text || "";
    const { displayWords, nonSkipped } = tokenizeDisplayWords(rawArabicText);
    if (nonSkipped.length === 0) continue;
    const windowFull = findBestWindow(qNonSkipped, nonSkipped);
    const resFull = alignWordsDP(qNonSkipped, windowFull);
    let res = resFull;
    let usedMatn = false;
    if (qStripped.isnadStripped && matnQTokens.length >= 3) {
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
        isnadChecked: !(qStripped.isnadStripped || usedMatn)
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
    const topRecord = corpusHadiths.find((h) => `${h.c}_${h.n}` === results[0].id);
    if (topRecord) {
      results[0].attestations = findAttestationCluster(topRecord);
    }
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

// server/app.ts
var app = express();
app.use(express.json({ limit: "10mb" }));
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
  "POST /api/hadith/search",
  "POST /api/hadith/match",
  "POST /api/ask",
  "POST /api/ocr"
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
app.post("/api/hadith/search", (req, res) => {
  const query = req.body?.query || req.body?.text || "";
  const result = searchHadith(query);
  res.json(result);
});
app.post("/api/hadith/match", (req, res) => {
  const query = req.body?.query || req.body?.text || "";
  const result = searchHadith(query);
  res.json(result);
});
app.post("/api/ask", (req, res) => {
  res.json({ status: "scaffold_ready", mode: "ask", verdict: "unclear" });
});
app.post("/api/ocr", (req, res) => {
  res.json({ status: "scaffold_ready", text: "" });
});

// server/corpus/prebuild.ts
import fs4 from "fs";
import path4 from "path";
import zlib2 from "zlib";
import { fileURLToPath as fileURLToPath4 } from "url";
var __filename4 = fileURLToPath4(import.meta.url);
var __dirname4 = path4.dirname(__filename4);
var DATA_DIR4 = path4.resolve(__dirname4, "./data");
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
  fs4.writeFileSync(dest, text);
}
async function runPrebuild() {
  console.log("====================================================");
  console.log("Starting Prebuild: Data Acquisition & Index Generation");
  const startTime = performance.now();
  if (!fs4.existsSync(DATA_DIR4)) {
    fs4.mkdirSync(DATA_DIR4, { recursive: true });
  }
  try {
    for (const col of COLLECTIONS) {
      const arPath = path4.join(DATA_DIR4, `hadith_${col}_ar.json`);
      const enPath = path4.join(DATA_DIR4, `hadith_${col}_en.json`);
      if (!fs4.existsSync(arPath)) {
        await downloadFile(`https://cdn.jsdelivr.net/gh/fawazahmed0/hadith-api@df57907be35291c91ad6a6691180e22ca9920784/editions/ara-${col}.json`, arPath);
      }
      if (!fs4.existsSync(enPath)) {
        await downloadFile(`https://cdn.jsdelivr.net/gh/fawazahmed0/hadith-api@df57907be35291c91ad6a6691180e22ca9920784/editions/eng-${col}.json`, enPath);
      }
    }
    if (!fs4.existsSync(path4.join(DATA_DIR4, "quran_info.json"))) {
      await downloadFile(`https://cdn.jsdelivr.net/gh/fawazahmed0/quran-api@47ca096b0976443ba2eab2e45cdf0fb4096a2610/info.json`, path4.join(DATA_DIR4, "quran_info.json"));
    }
    if (!fs4.existsSync(path4.join(DATA_DIR4, "quran_ar.json"))) {
      await downloadFile(`https://cdn.jsdelivr.net/gh/fawazahmed0/quran-api@47ca096b0976443ba2eab2e45cdf0fb4096a2610/editions/ara-quranacademy.json`, path4.join(DATA_DIR4, "quran_ar.json"));
    }
    if (!fs4.existsSync(path4.join(DATA_DIR4, "quran_en.json"))) {
      await downloadFile(`https://cdn.jsdelivr.net/gh/fawazahmed0/quran-api@47ca096b0976443ba2eab2e45cdf0fb4096a2610/editions/eng-abdullahyusufal.json`, path4.join(DATA_DIR4, "quran_en.json"));
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
  const quranAr = JSON.parse(fs4.readFileSync(path4.join(DATA_DIR4, "quran_ar.json"), "utf8"));
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
  const outPathGz = path4.join(DATA_DIR4, "prebuilt_hadiths.json.gz");
  const serializedRecords = records.map((r) => ({
    c: r.c,
    n: r.n,
    m: Array.from(r.m),
    f: Array.from(r.f),
    r: r.r,
    o: r.o
  }));
  const jsonStr = JSON.stringify({ v: vocab, r: serializedRecords, s: sections });
  const compressed = zlib2.gzipSync(Buffer.from(jsonStr, "utf8"));
  fs4.writeFileSync(outPathGz, compressed);
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
var __filename5 = fileURLToPath5(import.meta.url);
var __dirname5 = path5.dirname(__filename5);
var PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3e3;
async function startServer() {
  const distPath = path5.resolve(__dirname5, "../dist");
  const hasDist = fs5.existsSync(distPath);
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
      res.sendFile(path5.join(distPath, "index.html"));
    });
  }
  console.log("Initializing Search Engines...");
  const corpusDir = fs5.existsSync(path5.resolve(__dirname5, "./corpus/data")) ? path5.resolve(__dirname5, "./corpus/data") : fs5.existsSync(path5.resolve(__dirname5, "../server/corpus/data")) ? path5.resolve(__dirname5, "../server/corpus/data") : path5.resolve(process.cwd(), "server/corpus/data");
  const quranArFile = path5.join(corpusDir, "quran_ar.json");
  if (!fs5.existsSync(quranArFile)) {
    console.log("Corpus data missing, running prebuild data acquisition...");
    await runPrebuild();
  }
  const { corpus, loadTimeMs: corpusTime } = loadCorpus();
  const { totalIndexed: hadithCount, indexMemoryBytes: hadithMem } = initHadithEngine();
  const { totalIndexed: ayahCount } = initAyahEngine();
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
