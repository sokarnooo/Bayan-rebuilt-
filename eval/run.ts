import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const BASE_URL = process.argv[2];
if (!BASE_URL) {
  console.error('Usage: tsx eval/run.ts <BASE_URL>');
  process.exit(1);
}

const CASES_PATH = path.resolve(__dirname, 'cases.json');
const RESULTS_PATH = path.resolve(__dirname, 'results.json');

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

  if (expected.containsEnglishSlice) {
    if (!topResult?.translation) {
      refMatch = false;
    } else {
      const trans = topResult.translation.toLowerCase().replace(/[^a-z0-9\s]/g, ' ');
      const slice = expected.containsEnglishSlice.toLowerCase().replace(/[^a-z0-9\s]/g, ' ');
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
      if (actual.query_mode === 'ayah') {
        const rangeStr = (topResult.verseRange || '').replace(/–/g, '-');
        const actualRef = topResult.isRange ? `${topResult.chapter}:${rangeStr}` : `${topResult.chapter}:${topResult.verse}`;
        refMatch = expected.refs.some((r: string) => actualRef === r || actualRef.includes(r) || r.includes(actualRef));
      } else {
        const arabicRef = `${topResult.collection}_${topResult.arabicnumber}`;
        refMatch = expected.refs.includes(topResult.id) || expected.refs.includes(arabicRef);
      }
    }
  } else if (expected.ref) {
    if (!topResult) refMatch = false;
    else {
      if (actual.query_mode === 'ayah') {
        const rangeStr = (topResult.verseRange || '').replace(/–/g, '-');
        const actualRef = topResult.isRange ? `${topResult.chapter}:${rangeStr}` : `${topResult.chapter}:${topResult.verse}`;
        refMatch = actualRef === expected.ref || actualRef.includes(expected.ref) || expected.ref.includes(actualRef);
      } else {
        const arabicRef = `${topResult.collection}_${topResult.arabicnumber}`;
        refMatch = topResult.id === expected.ref || arabicRef === expected.ref;
      }
    }
  } else if (expected.ref === null) {
    refMatch = actual.state === 'not_found' || actual.results?.length === 0;
  }
  
  return stateMatch && refMatch;
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
  
  const inconsistent = results.filter(r => !r.summary.consistent);
  if (inconsistent.length > 0) {
    console.log(`\nInconsistent Results found in ${inconsistent.length} cases.`);
  } else {
    console.log('\nRun-to-run consistency: 100%');
  }
  
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
