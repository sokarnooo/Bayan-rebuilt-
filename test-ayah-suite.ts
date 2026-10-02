import { searchAyah, initAyahEngine } from './server/matching/ayahMatcher.ts';

initAyahEngine();

const testQueries = [
  {
    name: '1. Multi-occurrence: فبأي آلاء ربكما تكذبان',
    query: 'فبأي آلاء ربكما تكذبان',
  },
  {
    name: '2a. Ayat al-Kursi without diacritics',
    query: 'الله لا اله الا هو الحي القيوم لا تاخذه سنة ولا نوم له ما في السماوات وما في الارض من ذا الذي يشفع عنده الا باذنه يعلم ما بين ايديهم وما خلفهم ولا يحيطون بشيء من علمه الا بما شاء وسع كرسيه السماوات والارض ولا يئوده حفظهما وهو العلي العظيم',
  },
  {
    name: '2b. Ayat al-Kursi with 2-3 intentional typos',
    // typos: 'اله' -> 'الاه', 'القيوم' -> 'القيومم', 'يشفع' -> 'يشفعع'
    query: 'الله لا الاه الا هو الحي القيومم لا تاخذه سنة ولا نوم له ما في السماوات وما في الارض من ذا الذي يشفعع عنده الا باذنه',
  },
  {
    name: '3. Partial slice from middle of a long ayah with a typo',
    // from 2:282 (Ayat ad-Dayn): 'ولا تساموا ان تكتبوه صغيرا او كبيرا الى اجله' with typo 'تسامو' and 'صغيرن'
    query: 'ولا تسامو ان تكتبوه صغيرن او كبيرا الى اجله',
  },
  {
    name: '4. Ayah typed with Arabic ي and ك instead of Uthmani/Farsi variants',
    // 2:255 with standard ي and ك
    query: 'وسع كرسيه السموات والارض',
  },
  {
    name: '5. «بسم الله الرحمن الرحيم»',
    query: 'بسم الله الرحمن الرحيم',
  },
  {
    name: '6. Nonsense sentence',
    query: 'الباذنجان المقلي يذهب الحزن عن القلب وينبت الذهب في البيت',
  },
  {
    name: '7. Real Arabic proverb not in Quran',
    query: 'من جد وجد ومن زرع حصد ومن سار على الدرب وصل',
  },
];

console.log('Running Ayah Matching Engine Test Suite...\n');

for (const t of testQueries) {
  console.log('='.repeat(80));
  console.log(`TEST: ${t.name}`);
  console.log(`Query: "${t.query}"`);
  
  const start = performance.now();
  const res = searchAyah(t.query);
  const time = performance.now() - start;

  console.log(`Execution Time: ${time.toFixed(2)} ms (internal: ${res.executionTimeMs} ms)`);
  console.log(`State: ${res.state}`);
  console.log(`Top Confidence: ${res.topConfidence}`);
  console.log(`Total Matches: ${res.totalMatches}`);
  console.log(`Referral Required: ${res.referralRequired}`);
  if (res.referralMessage) console.log(`Referral Message: ${res.referralMessage}`);

  console.log('Top Results Sample:');
  const sample = res.results.slice(0, 3).map(r => ({
    surah: `${r.surah.arabic} (${r.surah.english})`,
    ayah: `${r.chapter}:${r.verse}`,
    confidence: r.confidence,
    state: r.state,
    text: r.text.substring(0, 80) + (r.text.length > 80 ? '...' : ''),
  }));
  console.log(JSON.stringify(sample, null, 2));
  if (res.results.length > 3) {
    console.log(`... and ${res.results.length - 3} more occurrences across surahs:`);
    const surahList = Array.from(new Set(res.results.map(r => `${r.surah.arabic} [${r.chapter}:${r.verse}]`)));
    console.log(surahList.join(', '));
  }
}
