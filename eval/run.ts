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
  
  const stateMatch = actual.state === expected.state;
  let refMatch = true;
  
  if (expected.ref) {
    const topResult = actual.results?.[0];
    if (!topResult) refMatch = false;
    else {
      if (actual.query_mode === 'ayah') {
        // Handle range or single
        const actualRef = topResult.isRange ? topResult.verseRange : `${topResult.chapter}:${topResult.verse}`;
        // Partial match on ref is often enough for our test
        refMatch = actualRef.includes(expected.ref) || expected.ref.includes(actualRef);
      } else {
        refMatch = topResult.id === expected.ref;
      }
    }
  } else {
    // If expected ref is null, we expect state not_found
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
    console.log(`[${r.id}] ${r.category}`);
    console.log(`  Input: ${r.input.substring(0, 50)}...`);
    console.log(`  Expected: ${r.expected.state} (${r.expected.ref})`);
    const lastActual = r.runs[2].actual;
    console.log(`  Actual: ${lastActual.state} (${lastActual.results?.[0]?.id || 'N/A'})`);
    if (lastActual.error) console.log(`  Error: ${lastActual.error}`);
  });

  const falseAccepts = results.filter(r => 
    (r.expected.state === 'not_found' || r.category === 'curated_fabricated' || r.category === 'invented') &&
    (r.runs[0].actual.state === 'matched' || r.runs[0].actual.state === 'close_match')
  );
  
  console.log(`\nFalse Accepts: ${falseAccepts.length}`);
  falseAccepts.forEach(r => {
    console.log(`- [${r.id}] ${r.category}: ${r.input.substring(0, 30)}...`);
  });
}

run().catch(console.error);
