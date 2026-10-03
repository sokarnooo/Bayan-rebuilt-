import fs from 'fs';
import path from 'path';

const DATA_DIR = 'server/corpus/data';
const collections = ['bukhari', 'muslim', 'abudawud', 'tirmidhi', 'nasai', 'ibnmajah', 'nawawi'];

console.log('=== STARTING HTTP SELF-TEST ACROSS 34,195 HADITHS ===');

const failuresByCollection = {};
const failureExamples = {};
for (const c of collections) {
  failuresByCollection[c] = 0;
  failureExamples[c] = [];
}

let totalTested = 0;
let totalPassed = 0;
const latencies = [];

async function run() {
  for (const col of collections) {
    const filePath = path.join(DATA_DIR, `hadith_${col}_ar.json`);
    if (!fs.existsSync(filePath)) continue;

    const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    const list = data.hadiths || [];

    let colTested = 0;
    let colPassed = 0;

    for (const h of list) {
      const raw = (h.text || '').trim();
      if (!raw) continue;

      const words = raw.split(/\s+/).filter(Boolean);
      if (words.length < 5) continue;

      const startWord = Math.floor(words.length * 0.45);
      const sliceLen = Math.min(12, words.length - startWord);
      if (sliceLen < 3) continue;

      const querySlice = words.slice(startWord, startWord + sliceLen).join(' ');

      const t0 = performance.now();
      try {
        const res = await fetch('http://localhost:3000/api/hadith/search', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ query: querySlice }),
        });
        const dt = performance.now() - t0;
        latencies.push(dt);

        const json = await res.json();
        totalTested++;
        colTested++;

        const targetId = `${col}_${h.hadithnumber}`;
        const found = (json.results || []).some((r) => r.id === targetId || (r.collection === col && r.hadithnumber === h.hadithnumber));

        if (found) {
          totalPassed++;
          colPassed++;
        } else {
          failuresByCollection[col]++;
          if (failureExamples[col].length < 10) {
            failureExamples[col].push({
              hadithnumber: h.hadithnumber,
              querySlice,
              rawTextSnippet: raw.slice(0, 80) + '...',
            });
          }
        }
      } catch (err) {
        console.error(`Fetch error for ${col}:${h.hadithnumber}`, err.message);
      }
    }

    console.log(`[${col.toUpperCase()}] Tested: ${colTested}, Passed: ${colPassed}, Failures: ${failuresByCollection[col]}`);
  }

  latencies.sort((a, b) => a - b);
  const p50 = latencies[Math.floor(latencies.length * 0.50)]?.toFixed(2) || 'N/A';
  const p95 = latencies[Math.floor(latencies.length * 0.95)]?.toFixed(2) || 'N/A';
  const p99 = latencies[Math.floor(latencies.length * 0.99)]?.toFixed(2) || 'N/A';

  console.log('\n=== FINAL HTTP SELF-TEST RESULTS ===');
  console.log(`Total Tested: ${totalTested}`);
  console.log(`Total Passed: ${totalPassed} (${((totalPassed / totalTested) * 100).toFixed(2)}%)`);
  console.log(`Total Failed: ${totalTested - totalPassed}`);
  console.log('Failures by collection:', failuresByCollection);
  console.log('Failure Examples (up to 10 per collection):', JSON.stringify(failureExamples, null, 2));
  console.log(`Latency p50: ${p50} ms | p95: ${p95} ms | p99: ${p99} ms`);
}

run();
