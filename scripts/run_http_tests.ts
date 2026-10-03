import fs from 'fs';

async function runHttpTests() {
  // Wait 2s for server readiness
  await new Promise(r => setTimeout(r, 2000));

  console.log('Testing server health...');
  const healthRes = await fetch('http://localhost:3000/api/health');
  const health = await healthRes.json();
  console.log('Health:', health.status, 'Quran verses count:', health.corpusLoaded.quranAyatCount);

  // 1. Displayed text self-test
  const arRaw = JSON.parse(fs.readFileSync('server/corpus/data/quran_ar.json', 'utf8'));
  const verses = arRaw.quran || arRaw[Object.keys(arRaw)[0]];

  let passedUthmani = 0;
  const uthmaniFailures: any[] = [];

  console.log('\n--- 1. Testing all 6,236 Displayed Uthmani Verses over HTTP ---');
  for (let i = 0; i < verses.length; i++) {
    const v = verses[i];
    const query = v.text.trim();
    const res = await fetch('http://localhost:3000/api/ayah/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query })
    });
    const data = await res.json();
    const self = data.results?.find((r: any) => r.chapter === v.chapter && r.verse === v.verse);

    if (self && self.confidence === 100 && self.coverage === 'full') {
      passedUthmani++;
    } else {
      uthmaniFailures.push({
        ref: `${v.chapter}:${v.verse}`,
        topConfidence: data.topConfidence,
        foundSelf: !!self,
        selfConfidence: self ? self.confidence : 0,
        selfCoverage: self ? self.coverage : 'none',
        state: data.state
      });
    }

    if ((i + 1) % 1000 === 0 || i === verses.length - 1) {
      console.log(`Uthmani test progress: ${i + 1} / ${verses.length} (Passed: ${passedUthmani})`);
    }
  }

  console.log(`\n=== 1. UTHMANI HTTP SELF-TEST RESULTS ===`);
  console.log(`Passed: ${passedUthmani} / ${verses.length} (${(passedUthmani / verses.length * 100).toFixed(2)}%)`);
  console.log(`Failures: ${uthmaniFailures.length}`);
  if (uthmaniFailures.length > 0) {
    console.log('Failures:', JSON.stringify(uthmaniFailures, null, 2));
  }

  // 2. Second edition ara-quransimple test
  console.log('\n--- 2. Testing all 6,236 ara-quransimple Verses over HTTP ---');
  const simpleRes = await fetch('https://cdn.jsdelivr.net/gh/fawazahmed0/quran-api@47ca096b0976443ba2eab2e45cdf0fb4096a2610/editions/ara-quransimple.min.json');
  const simpleJson = await simpleRes.json();
  const simpleVerses = simpleJson.quran || simpleJson[Object.keys(simpleJson)[0]];

  let passedSimple = 0;
  const simpleFailures: any[] = [];

  for (let i = 0; i < simpleVerses.length; i++) {
    const sv = simpleVerses[i];
    const query = sv.text.trim();
    const res = await fetch('http://localhost:3000/api/ayah/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query })
    });
    const data = await res.json();
    const self = data.results?.find((r: any) => r.chapter === sv.chapter && (r.verse === sv.verse || (r.startVerse <= sv.verse && r.endVerse >= sv.verse)));

    if (self && self.confidence >= 90) {
      passedSimple++;
    } else {
      simpleFailures.push({
        ref: `${sv.chapter}:${sv.verse}`,
        query,
        topConfidence: data.topConfidence,
        foundSelf: !!self,
        selfConfidence: self ? self.confidence : 0,
        state: data.state
      });
    }

    if ((i + 1) % 1000 === 0 || i === simpleVerses.length - 1) {
      console.log(`Simple test progress: ${i + 1} / ${simpleVerses.length} (Passed: ${passedSimple})`);
    }
  }

  console.log(`\n=== 2. ARA-QURANSIMPLE HTTP TEST RESULTS ===`);
  console.log(`Passed: ${passedSimple} / ${simpleVerses.length} (${(passedSimple / simpleVerses.length * 100).toFixed(2)}%)`);
  console.log(`Failures: ${simpleFailures.length}`);
  if (simpleFailures.length > 0) {
    console.log('Failures (sample first 10):', JSON.stringify(simpleFailures.slice(0, 10), null, 2));
  }
}

runHttpTests();
