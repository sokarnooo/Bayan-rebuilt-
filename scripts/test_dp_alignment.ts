import fs from 'fs';
import { normalizeArabic, levenshteinDistance } from '../server/matching/normalizer.ts';

export interface AlignedWordPair {
  queryWord: string | null;
  sourceWord: string | null;
  type: 'exact' | 'approximate' | 'inserted' | 'deleted';
  queryIndex?: number;
  sourceIndex?: number;
}

export function alignWordsDP(
  queryWords: string[],
  sourceWords: string[]
): {
  alignment: AlignedWordPair[];
  changedWords: Array<{ queryWord: string | null; sourceWord: string | null; position: number; type: string }>;
  score: number;
} {
  const m = queryWords.length;
  const n = sourceWords.length;

  const qNorm = queryWords.map(w => normalizeArabic(w));
  const sNorm = sourceWords.map(w => normalizeArabic(w));

  // dp[i][j] = minimum edit cost to align qNorm[0..i-1] with sNorm[0..j-1]
  // Semi-global: query must be fully aligned. Source can start anywhere or start at 0.
  // Since we pass the candidate slice, let dp[0][0] = 0.
  const dp: number[][] = Array.from({ length: m + 1 }, () => new Float64Array(n + 1) as any);
  const back: number[][] = Array.from({ length: m + 1 }, () => new Int32Array(n + 1) as any);
  // back values: 1 = diag (match/subst), 2 = up (deletion from source / query gap), 3 = left (insertion in source / query null)

  // Initialize
  dp[0][0] = 0;
  for (let i = 1; i <= m; i++) {
    dp[i][0] = i * 1.5; // query words missing from source (deleted)
    back[i][0] = 2;
  }
  for (let j = 1; j <= n; j++) {
    // If source can have leading words before match, cost could be 0 or small,
    // but if sourceWords is the window, cost is gap penalty
    dp[0][j] = j * 1.0;
    back[0][j] = 3;
  }

  for (let i = 1; i <= m; i++) {
    const qw = qNorm[i - 1];
    for (let j = 1; j <= n; j++) {
      const sw = sNorm[j - 1];

      // Substitution / match cost
      let subCost = 3.0;
      if (qw === sw || qw.replace(/ء/g, 'ا') === sw.replace(/ء/g, 'ا')) {
        subCost = 0;
      } else {
        const dist = levenshteinDistance(qw, sw);
        if (dist <= 1) {
          subCost = 0.5; // approximate
        } else {
          subCost = 2.5; // mismatch
        }
      }

      const costDiag = dp[i - 1][j - 1] + subCost;
      const costUp = dp[i - 1][j] + 1.5; // query word deleted / missing in source
      const costLeft = dp[i][j - 1] + 1.0; // word inserted in source (query has null)

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

  // Find best end in source (semi-global: query is fully matched at i = m, source can end at j <= n)
  let bestJ = n;
  let minCost = dp[m][n];
  for (let j = m; j <= n; j++) {
    if (dp[m][j] < minCost) {
      minCost = dp[m][j];
      bestJ = j;
    }
  }

  // Backtrack
  const revAlignment: AlignedWordPair[] = [];
  let currI = m;
  let currJ = bestJ;

  while (currI > 0 || currJ > 0) {
    if (currI > 0 && currJ > 0 && back[currI][currJ] === 1) {
      const qw = queryWords[currI - 1];
      const sw = sourceWords[currJ - 1];
      const qn = qNorm[currI - 1];
      const sn = sNorm[currJ - 1];
      const isExact = (qn === sn || qn.replace(/ء/g, 'ا') === sn.replace(/ء/g, 'ا'));
      const dist = isExact ? 0 : levenshteinDistance(qn, sn);
      const type = isExact ? 'exact' : (dist <= 1 ? 'approximate' : 'deleted');

      revAlignment.push({
        queryWord: qw,
        sourceWord: sw,
        type,
        queryIndex: currI - 1,
        sourceIndex: currJ - 1,
      });
      currI--;
      currJ--;
    } else if (currI > 0 && (currJ === 0 || back[currI][currJ] === 2)) {
      revAlignment.push({
        queryWord: queryWords[currI - 1],
        sourceWord: null,
        type: 'deleted',
        queryIndex: currI - 1,
      });
      currI--;
    } else {
      revAlignment.push({
        queryWord: null,
        sourceWord: sourceWords[currJ - 1],
        type: 'inserted',
        sourceIndex: currJ - 1,
      });
      currJ--;
    }
  }

  const alignment = revAlignment.reverse();
  const changedWords = alignment
    .map((p, idx) => ({
      queryWord: p.queryWord,
      sourceWord: p.sourceWord,
      position: p.queryIndex ?? idx,
      type: p.type,
    }))
    .filter(p => p.type !== 'exact');

  return { alignment, changedWords, score: minCost };
}

// Test case from Requirement 2:
// query «لا تقبل صلاة بغير طهور» against Nasa'i 139
const nasai = JSON.parse(fs.readFileSync('server/corpus/data/hadith_nasai_ar.json', 'utf8')).hadiths;
const h139 = nasai.find((h: any) => h.hadithnumber === 139);

// Matn of Nasa'i 139:
// لاَ يَقْبَلُ اللَّهُ صَلاَةً بِغَيْرِ طُهُورٍ وَلاَ صَدَقَةً مِنْ غُلُولٍ
const sourceWords = ['لاَ', 'يَقْبَلُ', 'اللَّهُ', 'صَلاَةً', 'بِغَيْرِ', 'طُهُورٍ'];
const queryWords = ['لا', 'تقبل', 'صلاة', 'بغير', 'طهور'];

const res = alignWordsDP(queryWords, sourceWords);
console.log("=== Alignment Result ===");
res.alignment.forEach(a => {
  console.log(`(${a.queryWord}, ${a.sourceWord} ${a.type})`);
});
console.log("\nchangedWords:");
console.log(JSON.stringify(res.changedWords, null, 2));
