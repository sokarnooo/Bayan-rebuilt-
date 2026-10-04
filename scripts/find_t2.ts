import fs from 'fs';
import { loadCorpus } from '../server/corpus/loader.ts';
import { normalizeArabic } from '../server/matching/normalizer.ts';

const { corpus } = loadCorpus();
const t2 = corpus.hadith.ar.tirmidhi.find(h => h.hadithnumber === 2);
console.log("Found Tirmidhi 2?", !!t2);
