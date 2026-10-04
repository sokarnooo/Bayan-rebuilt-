import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { normalizeArabic } from '../server/matching/normalizer.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const BASE_URL = process.argv[2];
if (!BASE_URL) {
  console.error('Usage: tsx eval/run.ts <BASE_URL>');
  process.exit(1);
}

const CASES_PATH = path.resolve(__dirname, 'cases.json');
const RESULTS_PATH = path.resolve(__dirname, 'results.json');

function verifyHighlights(query: string, matchedWords: string[], mode: string): boolean {
  if (!matchedWords || matchedWords.length === 0) return false;
  
  const qNorm = normalizeArabic(query);
  const qWords = qNorm.split(/\s+/).filter(Boolean);
  const qWordsSet = new Set(qWords);
  
  const SKIP_WORDS = new Set([
    'صلى', 'صلي', 'الله', 'عليه', 'وسلم', 
    'رضي', 'عنه', 'عنها', 'عنهم', 'عنهما', 'عنهن',
    'رحمه', 'سبحانه', 'وتعالى', 'وتعالي', 'عز', 'وجل', 
    'عليهما', 'السلام'
  ]);
  
  // Rule 1: no skipped honorific is highlighted unless it is inside the query
  for (const mw of matchedWords) {
    const mwNorm = normalizeArabic(mw);
    if (SKIP_WORDS.has(mwNorm) && !qWordsSet.has(mwNorm)) {
      return false; // Error: highlighted a skipped honorific not in the query!
    }
  }
  
  // Rule 2: normalized joined matchedWords equal the normalized aligned part of the query (approximate words allowed)
  const filteredMatched = matchedWords
    .map(w => normalizeArabic(w))
    .filter(w => !SKIP_WORDS.has(w) || qWordsSet.has(w));
    
  if (filteredMatched.length === 0) return false;
  
  // Find the best alignment of filteredMatched within the query words
  let bestOverlap = 0;
  const qLen = qWords.length;
  const mLen = filteredMatched.length;
  
  for (let i = 0; i <= qLen - mLen; i++) {
    let matchCount = 0;
    for (let j = 0; j < mLen; j++) {
      const qw = qWords[i + j];
      const mw = filteredMatched[j];
      if (qw === mw) {
        matchCount++;
      } else {
        if (qw.replace(/ء/g, 'ا') === mw.replace(/ء/g, 'ا')) {
          matchCount++;
        } else {
          const qwAlef = qw.replace(/[ا\u0670ء]/g, '');
          const mwAlef = mw.replace(/[ا\u0670ء]/g, '');
          if (qwAlef === mwAlef && qwAlef !== '') {
            matchCount++;
          } else {
            // Char-level distance comparison for approximate matching
            const maxLen = Math.max(qw.length, mw.length);
            if (maxLen > 0) {
              let dist = 0;
              const minLen = Math.min(qw.length, mw.length);
              for (let c = 0; c < minLen; c++) {
                if (qw[c] !== mw[c]) dist++;
              }
              dist += Math.abs(qw.length - mw.length);
              const sim = 1 - dist / maxLen;
              if (sim >= 0.65) matchCount++;
            }
          }
        }
      }
    }
    if (matchCount > bestOverlap) {
      bestOverlap = matchCount;
    }
  }
  
  for (let i = 0; i <= mLen - qLen; i++) {
    let matchCount = 0;
    for (let j = 0; j < qLen; j++) {
      const qw = qWords[j];
      const mw = filteredMatched[i + j];
      if (qw === mw) {
        matchCount++;
      } else {
        if (qw.replace(/ء/g, 'ا') === mw.replace(/ء/g, 'ا')) {
          matchCount++;
        } else {
          const qwAlef = qw.replace(/[ا\u0670ء]/g, '');
          const mwAlef = mw.replace(/[ا\u0670ء]/g, '');
          if (qwAlef === mwAlef && qwAlef !== '') {
            matchCount++;
          }
        }
      }
    }
    if (matchCount > bestOverlap) {
      bestOverlap = matchCount;
    }
  }
  
  const reqOverlap = Math.min(qWords.length, filteredMatched.length) * 0.70;
  return bestOverlap >= reqOverlap;
}

async function runTest(mode: string, input: string) {
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
      const checkResultMatch = (r: any) => {
        if (!r) return false;
        if (actual.query_mode === 'ayah') {
          const rangeStr = (r.verseRange || '').replace(/–/g, '-');
          const actualRef = r.isRange ? `${r.chapter}:${rangeStr}` : `${r.chapter}:${r.verse}`;
          return actualRef === expected.ref || actualRef.includes(expected.ref) || expected.ref.includes(actualRef);
        } else {
          const arabicRef = `${r.collection}_${r.arabicnumber}`;
          return r.id === expected.ref || arabicRef === expected.ref;
        }
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
  if (stateMatch && refMatch) {
    const expectsMatch = expected.state === 'matched' || expected.state === 'close_match' || (expected.ref && expected.ref !== null) || (expected.refs && expected.refs.length > 0);
    if (expectsMatch) {
      if (topResult) {
        highlightMatch = verifyHighlights(expected.input || actual.query, topResult.matchedWords || [], actual.query_mode);
      } else {
        highlightMatch = false;
      }
    }
  }
  
  return stateMatch && refMatch && highlightMatch;
}

async function run() {
  const cases = JSON.parse(fs.readFileSync(CASES_PATH, 'utf8'));
  const results: any[] = [];
  
  console.log(`Starting Evaluation against ${BASE_URL}...`);
  console.log(`Total Cases: ${cases.length}`);

  for (const c of cases) {
    process.stdout.write(`Testing ${c.id}... `);
    const caseRuns: any[] = [];
    
    for (let i = 0; i < 3; i++) {
      const start = performance.now();
      const actual = await runTest(c.mode, c.input);
      const duration = Math.round(performance.now() - start);
      
      const passed = checkPass(c.expected, actual);
      caseRuns.push({ run: i + 1, passed, actual, duration });
    }
    
    const allPassed = caseRuns.every(r => r.passed);
    const consistent = caseRuns.every(r => r.passed === caseRuns[0].passed);
    
    results.push({
      ...c,
      runs: caseRuns,
      summary: {
        passed: allPassed,
        consistent,
        avgDuration: Math.round(caseRuns.reduce((acc, r) => acc + r.duration, 0) / 3)
      }
    });
    
    console.log(allPassed ? '✅' : '❌');
  }

  fs.writeFileSync(RESULTS_PATH, JSON.stringify(results, null, 2));
  
  // Final Report
  const total = results.length;
  const passedCount = results.filter(r => r.summary.passed).length;
  const categories = [...new Set(results.map(r => r.category))];
  
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

run().catch(console.error);
