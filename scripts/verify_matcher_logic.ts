import fs from 'fs';
import { loadCorpus } from '../server/corpus/loader.ts';
import { normalizeArabic, levenshteinDistance } from '../server/matching/normalizer.ts';

const { corpus } = loadCorpus();

// We will implement and test searchHadith
console.log("Ready to test searchHadith implementation");
