import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { normalizeArabic } from '../server/matching/normalizer.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Command line flags parsing
let BASE_URL = 'http://localhost:3000';
let quiet = false;
let numRuns = 1;
let concurrency = 1;
let onlyCategory: string | null = null;
let skipHighlight = false;

for (let i = 2; i < process.argv.length; i++) {
  const arg = process.argv[i];
  if (arg === '--quiet') {
    quiet = true;
  } else if (arg === '--skip-highlight') {
    skipHighlight = true;
  } else if (arg === '--runs' && process.argv[i + 1]) {
    numRuns = parseInt(process.argv[++i], 10) || 1;
  } else if (arg === '--concurrency' && process.argv[i + 1]) {
    concurrency = parseInt(process.argv[++i], 10) || 1;
  } else if (arg === '--only' && process.argv[i + 1]) {
    onlyCategory = process.argv[++i];
  } else if (!arg.startsWith('-')) {
    BASE_URL = arg;
  }
}

const CASES_PATH = path.resolve(__dirname, 'cases.json');
const RESULTS_PATH = path.resolve(__dirname, 'results.json');

function editDistance(a: string, b: string): number {
  if (a === b) return 0;
  if (Math.abs(a.length - b.length) > 1) return 2;
  let dist = 0;
  let i = 0, j = 0;
  while (i < a.length && j < b.length) {
    if (a[i] !== b[j]) {
      dist++;
      if (dist > 1) return dist;
      if (a.length > b.length) i++;
      else if (b.length > a.length) j++;
      else { i++; j++; }
    } else {
      i++; j++;
    }
  }
  if (i < a.length || j < b.length) dist++;
  return dist;
}

function wordMatches(qw: string, mw: string): boolean {
  if (qw === mw) return true;
  const qwAlef = qw.replace(/[ا\u0670ء]/g, '');
  const mwAlef = mw.replace(/[ا\u0670ء]/g, '');
  if (qwAlef && qwAlef === mwAlef) return true;
  return editDistance(qw, mw) <= 1;
}

function lcsMatch(qWords: string[], mWords: string[]): number {
  const m = mWords.length;
  const n = qWords.length;
  const dp = Array.from({ length: m + 1 }, () => new Int32Array(n + 1));
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (wordMatches(qWords[j - 1], mWords[i - 1])) {
        dp[i][j] = dp[i - 1][j - 1] + 1;
      } else {
        dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
      }
    }
  }
  return dp[m][n];
}

export function verifyHighlights(query: string, matchedWords: string[], mode: string, isCloseMatch?: boolean): boolean {
  if (!matchedWords || matchedWords.length === 0) return false;
  
  const SKIP_WORDS = new Set([
    'صلى', 'صلي', 'الله', 'عليه', 'وسلم', 
    'رضي', 'عنه', 'عنها', 'عنهم', 'عنهما', 'عنهن',
    'رحمه', 'سبحانه', 'وتعالى', 'وتعالي', 'عز', 'وجل', 
    'عليهما', 'السلام'
  ]);

  const qNorm = normalizeArabic(query);
  const qWords = qNorm.split(/\s+/).filter(Boolean);
  const qWordsSet = new Set(qWords);

  // Rule 1: No skipped honorific is highlighted unless present in query
  for (const mw of matchedWords) {
    const mwNorm = normalizeArabic(mw);
    if (SKIP_WORDS.has(mwNorm) && !qWordsSet.has(mwNorm)) {
      return false; // Error: highlighted a skipped honorific not in query!
    }
  }

  // Filter out skipped honorifics/punctuation
  const filteredQueryWords = qWords.filter(w => w.length > 0 && !/^[\p{P}\p{S}]+$/u.test(w) && (!SKIP_WORDS.has(w) || qWordsSet.has(w)));
  const filteredMatchedWords = matchedWords
    .map(w => normalizeArabic(w))
    .filter(w => w.length > 0 && !/^[\p{P}\p{S}]+$/u.test(w) && (!SKIP_WORDS.has(w) || qWordsSet.has(w)));

  if (filteredMatchedWords.length === 0 || filteredQueryWords.length === 0) return false;

  const matchCount = lcsMatch(filteredQueryWords, filteredMatchedWords);
  const threshold = isCloseMatch ? 0.60 : 0.85;
  const matchRatio = matchCount / filteredMatchedWords.length;
  return matchRatio >= threshold;
}

async function runTest(mode: string, input: string) {
  if (mode === 'ask') {
    try {
      const res = await fetch(`${BASE_URL}/api/ask`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question: input, singlePass: true })
      });
      if (!res.ok) return { error: `HTTP ${res.status}` };
      const data = await res.json();
      return {
        state: data.verdict,
        query: input,
        query_mode: 'ask',
        topRetrievedIds: data.topRetrievedIds || [],
        results: (data.items || []).map((i: any) => ({
          id: i.id,
          collection: i.collection || 'ayah',
          arabicnumber: i.hadithnumber || `${i.chapter}:${i.verse}`,
          chapter: i.chapter,
          verse: i.verse,
          text: i.fullText,
          translation: i.fullText,
          matchedWords: data.searchedTerms
        }))
      };
    } catch (e: any) {
      return { error: e.message };
    }
  }
  const endpoint = mode === 'ayah' ? '/api/ayah/match' : '/api/hadith/match';
  try {
    const res = await fetch(`${BASE_URL}${endpoint}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: input })
    });
    if (!res.ok) return { error: `HTTP ${res.status}` };
    return await res.json();
  } catch (e: any) {
    return { error: e.message };
  }
}

function normalizeEnglishForEval(text: string): string {
  return text
    .toLowerCase()
    .replace(/\([^)]*\)/g, ' ')
    .replace(/[()]/g, ' ')
    .replace(/['"’`\-–]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function checkPass(expected: any, actual: any) {
  if (actual.error) return false;
  
  // State validation
  let stateMatch = true;
  if (expected.stateNot) {
    stateMatch = actual.state !== expected.stateNot;
  } else if (expected.state) {
    stateMatch = actual.state === expected.state;
  }

  // Ref / content validation
  let refMatch = true;
  const topResult = actual.results?.[0];

  // minScore validation
  if (expected.minScore !== undefined) {
    if (!topResult || (topResult.confidence ?? 0) < expected.minScore) {
      return false;
    }
  }

  // requireChangedWords validation
  if (expected.requireChangedWords) {
    if (!topResult || !topResult.changedWords || topResult.changedWords.length === 0) {
      return false;
    }
  }

  // requireTopRetrievedMatch validation (shown == retrieval top-k ranking)
  if (expected.requireTopRetrievedMatch) {
    if (!actual.topRetrievedIds || !actual.results || actual.results.length === 0) {
      return { passed: false, reason: 'REF' };
    }
    if (actual.topRetrievedIds[0] !== actual.results[0].id) {
      return { passed: false, reason: 'REF' };
    }
  }

  // excludeRefs validation (e.g. no off-topic card in top 3)
  if (expected.excludeRefs && Array.isArray(expected.excludeRefs)) {
    const top3Ids = (actual.results || []).slice(0, 3).map((r: any) => r.id);
    if (top3Ids.some((id: string) => expected.excludeRefs.includes(id))) {
      return { passed: false, reason: 'REF' };
    }
  }

  if (expected.containsEnglishSlice) {
    if (!topResult?.translation) {
      refMatch = false;
    } else {
      const trans = normalizeEnglishForEval(topResult.translation);
      const slice = normalizeEnglishForEval(expected.containsEnglishSlice);
      refMatch = trans.includes(slice);
    }
  } else if (expected.allowedCollections) {
    if (!topResult) refMatch = false;
    else {
      refMatch = expected.allowedCollections.includes(topResult.collection);
    }
  } else if (expected.refs && Array.isArray(expected.refs)) {
    if (!topResult) refMatch = false;
    else {
      const allActualRefs = (actual.results || []).map((r: any) => {
        if (actual.query_mode === 'ayah') {
          const rangeStr = (r.verseRange || '').replace(/–/g, '-');
          return r.isRange ? `${r.chapter}:${rangeStr}` : `${r.chapter}:${r.verse}`;
        } else {
          return [r.id, `${r.collection}_${r.arabicnumber}`];
        }
      }).flat();
      refMatch = expected.refs.some((exp: string) =>
        allActualRefs.some((act: string) => act === exp || act.includes(exp) || exp.includes(act))
      );
    }
  } else if (expected.ref) {
    if (!topResult) refMatch = false;
    else {
      const checkSingleRef = (r: any, expRef: string) => {
        if (!r) return false;
        if (actual.query_mode === 'ayah') {
          const rangeStr = (r.verseRange || '').replace(/–/g, '-');
          const actualRef = r.isRange ? `${r.chapter}:${rangeStr}` : `${r.chapter}:${r.verse}`;
          return actualRef === expRef || actualRef.includes(expRef) || expRef.includes(actualRef);
        } else {
          const arabicRef = `${r.collection}_${r.arabicnumber}`;
          return r.id === expRef || arabicRef === expRef;
        }
      };

      const checkResultMatch = (r: any) => {
        if (!r) return false;
        const refList = expected.ref.includes(',') ? expected.ref.split(',').map((s: string) => s.trim()) : [expected.ref];
        return refList.some((exp: string) => checkSingleRef(r, exp));
      };

      if (expected.rank === 1) {
        refMatch = checkResultMatch(topResult);
      } else {
        refMatch = checkResultMatch(topResult) || (actual.results || []).some(checkResultMatch);
      }
    }
  } else if (expected.ref === null) {
    refMatch = actual.state === 'not_found' || actual.results?.length === 0;
  }
  
  let highlightMatch = true;
  if (!skipHighlight && stateMatch && refMatch) {
    const isEnglish = (actual.query && /^[a-zA-Z\s,.'"-]+$/.test(actual.query)) || expected.containsEnglishSlice;
    const expectsMatch = actual.query_mode !== 'ask' && !isEnglish && (expected.state === 'matched' || expected.state === 'close_match' || (expected.ref && expected.ref !== null) || (expected.refs && expected.refs.length > 0));
    if (expectsMatch) {
      if (topResult) {
        highlightMatch = verifyHighlights(expected.input || actual.query, topResult.matchedWords || [], actual.query_mode, expected.state === 'close_match');
      } else {
        highlightMatch = false;
      }
    }
  }
  
  let reason: 'STATE' | 'REF' | 'HIGHLIGHT' | 'ERROR' | undefined;
  if (!stateMatch) reason = 'STATE';
  else if (!refMatch) reason = 'REF';
  else if (!highlightMatch) reason = 'HIGHLIGHT';

  const passed = stateMatch && refMatch && highlightMatch;
  return { passed, reason };
}

async function runPool<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let index = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (index < items.length) {
      const i = index++;
      results[i] = await fn(items[i]);
    }
  });
  await Promise.all(workers);
  return results;
}

async function run() {
  let cases = JSON.parse(fs.readFileSync(CASES_PATH, 'utf8'));
  if (onlyCategory) {
    cases = cases.filter((c: any) => c.category === onlyCategory);
  }
  
  if (!quiet) {
    console.log(`Starting Evaluation against ${BASE_URL}...`);
    console.log(`Total Cases: ${cases.length} | Runs per case: ${numRuns} | Concurrency: ${concurrency}`);
  }

  const results = await runPool(cases, concurrency, async (c: any) => {
    if (!quiet) {
      process.stdout.write(`Testing ${c.id}... `);
    }
    const caseRuns: any[] = [];
    
    for (let i = 0; i < numRuns; i++) {
      const start = performance.now();
      const actual = await runTest(c.mode, c.input);
      const duration = Math.round(performance.now() - start);
      
      const { passed, reason } = checkPass(c.expected, actual);
      caseRuns.push({ run: i + 1, passed, reason, actual, duration, timestamp: new Date().toISOString() });
    }
    
    const allPassed = caseRuns.every(r => r.passed);
    const consistent = caseRuns.every(r => r.passed === caseRuns[0].passed);
    
    if (!quiet) {
      console.log(allPassed ? '✅' : '❌');
    }

    return {
      ...c,
      runs: caseRuns,
      summary: {
        passed: allPassed,
        consistent,
        avgDuration: Math.round(caseRuns.reduce((acc, r) => acc + r.duration, 0) / caseRuns.length)
      }
    };
  });

  fs.writeFileSync(RESULTS_PATH, JSON.stringify(results, null, 2));
  
  // Final Report
  const total = results.length;
  const passedCount = results.filter(r => r.summary.passed).length;
  const categories = [...new Set(results.map(r => r.category))];

  if (quiet) {
    console.log(`TOTALS: ${passedCount}/${total} (${Math.round(passedCount/total*100)}%)`);
    for (const cat of categories) {
      const catResults = results.filter(r => r.category === cat);
      const catPassed = catResults.filter(r => r.summary.passed).length;
      console.log(`${cat}: ${catPassed}/${catResults.length} (${Math.round(catPassed/catResults.length*100)}%)`);
    }
    console.log('FAILURES:');
    const failures = results.filter(r => !r.summary.passed);
    if (failures.length === 0) {
      console.log('[none]');
    } else {
      failures.forEach(r => {
        const expStr = r.expected.stateNot 
          ? `state != ${r.expected.stateNot}` 
          : `${r.expected.state}${r.expected.ref ? ` (${r.expected.ref})` : (r.expected.refs ? ` (${r.expected.refs.join(',')})` : '')}`;
        const lastRun = r.runs[r.runs.length - 1];
        const lastActual = lastRun.actual;
        const top = lastActual.results?.[0];
        const actRef = lastActual.query_mode === 'ayah'
          ? (top ? (top.isRange ? `${top.chapter}:${top.verseRange}` : `${top.chapter}:${top.verse}`) : 'N/A')
          : (top?.id || 'N/A');
        console.log(`${r.id} | ${expStr} | ${lastActual.state} (${actRef}) | ${lastRun.reason || 'ERROR'}`);
      });
    }
    return;
  }
  
  console.log('\n--- EVALUATION REPORT ---');
  console.log(`Overall Pass Rate: ${passedCount}/${total} (${Math.round(passedCount/total*100)}%)`);
  
  console.log('\nPass Rate by Category:');
  for (const cat of categories) {
    const catResults = results.filter(r => r.category === cat);
    const catPassed = catResults.filter(r => r.summary.passed).length;
    console.log(`- ${cat}: ${catPassed}/${catResults.length} (${Math.round(catPassed/catResults.length*100)}%)`);
  }

  // Highlight Pass Rate
  let highlightCheckTotal = 0;
  let highlightCheckPassed = 0;
  for (const r of results) {
    const expectsMatch = r.expected.state === 'matched' || r.expected.state === 'close_match' || (r.expected.ref && r.expected.ref !== null) || (r.expected.refs && r.expected.refs.length > 0);
    if (expectsMatch) {
      highlightCheckTotal++;
      const lastActual = r.runs[r.runs.length - 1].actual;
      const top = lastActual.results?.[0];
      if (top && verifyHighlights(r.expected.input || r.input || lastActual.query, top.matchedWords || [], lastActual.query_mode)) {
        highlightCheckPassed++;
      }
    }
  }
  const highlightPassRate = highlightCheckTotal > 0 ? Math.round((highlightCheckPassed / highlightCheckTotal) * 100) : 100;
  console.log(`\nHighlight Pass Rate: ${highlightCheckPassed}/${highlightCheckTotal} (${highlightPassRate}%)`);
  
  const inconsistent = results.filter(r => !r.summary.consistent);
  if (inconsistent.length > 0) {
    console.log(`\nInconsistent Results found in ${inconsistent.length} cases.`);
  } else {
    console.log('\nRun-to-run consistency: 100%');
  }

  // Speed and Latency Metrics
  function calcPercentile(arr: number[], p: number): number {
    if (arr.length === 0) return 0;
    const sorted = [...arr].sort((a, b) => a - b);
    const idx = Math.ceil((p / 100) * sorted.length) - 1;
    return sorted[Math.max(0, Math.min(idx, sorted.length - 1))];
  }

  const allDurations: number[] = [];
  results.forEach(r => r.runs.forEach((runItem: any) => allDurations.push(runItem.duration)));

  console.log('\n--- SPEED & LATENCY REPORT ---');
  console.log(`Overall Latency:`);
  console.log(`- p50: ${calcPercentile(allDurations, 50)} ms`);
  console.log(`- p95: ${calcPercentile(allDurations, 95)} ms`);
  console.log(`- Max: ${Math.max(...allDurations)} ms`);

  console.log('\nLatency by Category:');
  for (const cat of categories) {
    const catDurations: number[] = [];
    results.filter(r => r.category === cat).forEach(r => r.runs.forEach((runItem: any) => catDurations.push(runItem.duration)));
    console.log(`- ${cat} (${catDurations.length / 3} cases): p50=${calcPercentile(catDurations, 50)}ms, p95=${calcPercentile(catDurations, 95)}ms, max=${Math.max(...catDurations)}ms`);
  }

  // 5 Slowest Queries
  const sortedSlowest = [...results].sort((a, b) => b.summary.avgDuration - a.summary.avgDuration).slice(0, 5);
  console.log('\nTop 5 Slowest Queries:');
  sortedSlowest.forEach((s, idx) => {
    let reason = 'Complex multi-word candidate alignment';
    if (s.input.length > 200) reason = 'Long hadith input with extensive text to window and align';
    else if (s.mode === 'ayah' && s.input.split(/\s+/).length > 15) reason = 'Multi-verse sliding window span scoring across Surah';
    else if (s.category === 'english_hadith') reason = 'Full-text English search scan across all 7 hadith collections';
    console.log(`${idx + 1}. [${s.id}] avg=${s.summary.avgDuration}ms (${s.category})`);
    console.log(`   Input: "${s.input.substring(0, 70)}..."`);
    console.log(`   Why slow: ${reason}`);
  });
  
  console.log('\nFailures:');
  results.filter(r => !r.summary.passed).forEach(r => {
    const expStr = r.expected.stateNot 
      ? `state != ${r.expected.stateNot}` 
      : `${r.expected.state} (${r.expected.ref || (r.expected.refs ? r.expected.refs.join(',') : '') || r.expected.allowedCollections || r.expected.containsEnglishSlice || 'null'})`;
    const lastActual = r.runs[r.runs.length - 1].actual;
    const top = lastActual.results?.[0];
    const actRef = lastActual.query_mode === 'ayah'
      ? (top ? (top.isRange ? `${top.chapter}:${top.verseRange}` : `${top.chapter}:${top.verse}`) : 'N/A')
      : (top?.id || 'N/A');
    console.log(`[${r.id}] ${r.category}`);
    console.log(`  Input: ${r.input.substring(0, 60)}...`);
    console.log(`  Expected: ${expStr}`);
    console.log(`  Actual: ${lastActual.state} (${actRef}) [Confidence: ${top?.confidence ?? 0}]`);
    if (top?.matchedWords) {
      console.log(`  Matched Words: [${top.matchedWords.join(', ')}]`);
    }
    if (lastActual.error) console.log(`  Error: ${lastActual.error}`);
  });

  const falseAccepts = results.filter(r => 
    (r.id.startsWith('negative_') || r.expected.state === 'not_found') &&
    r.runs[0].actual.state === 'matched'
  );
  
  console.log(`\nFalse Accepts (negative returned 'matched'): ${falseAccepts.length}`);
  falseAccepts.forEach(r => {
    console.log(`- [${r.id}] ${r.category}: ${r.input.substring(0, 50)}...`);
  });
}

if (process.argv[1] && (process.argv[1].endsWith('eval/run.ts') || process.argv[1].endsWith('eval/run.js'))) {
  run().catch(console.error);
}
