import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DATA_DIR = path.resolve(__dirname, '../server/corpus/data');

function readJson(file: string) {
  return JSON.parse(fs.readFileSync(path.join(DATA_DIR, file), 'utf8'));
}

async function prepare() {
  const cases: any[] = [];
  
  // Quran Data
  const quranAr = readJson('quran_ar.json');
  const quranList = quranAr.quran || quranAr[Object.keys(quranAr)[0]];
  const quranEn = readJson('quran_en.json');
  const quranEnList = quranEn.quran || quranEn[Object.keys(quranEn)[0]];

  // Hadith Data
  const collections = ['bukhari', 'muslim', 'abudawud', 'tirmidhi', 'nasai', 'ibnmajah', 'nawawi'];
  const hadiths: Record<string, any[]> = {};
  const hadithsEn: Record<string, any[]> = {};
  for (const col of collections) {
    hadiths[col] = readJson(`hadith_${col}_ar.json`).hadiths || [];
    hadithsEn[col] = readJson(`hadith_${col}_en.json`).hadiths || [];
  }

  // --- AYAH CASES (30) ---
  
  // 1. Exact 6
  const exactIndices = [0, 100, 500, 1000, 3000, 6235];
  exactIndices.forEach((idx, i) => {
    const a = quranList[idx];
    cases.push({
      id: `ayah_exact_${i+1}`,
      mode: 'ayah',
      input: a.text,
      language: 'ar',
      category: 'exact',
      expected: { state: 'matched', ref: `${a.chapter}:${a.verse}` },
      note: 'Exact match'
    });
  });

  // 2. No diacritics 6
  const diacriticIndices = [50, 150, 600, 1100, 3100, 5000];
  diacriticIndices.forEach((idx, i) => {
    const a = quranList[idx];
    const noDiacritics = a.text.replace(/[\u064B-\u065F\u0670]/g, '');
    cases.push({
      id: `ayah_nodiacritics_${i+1}`,
      mode: 'ayah',
      input: noDiacritics,
      language: 'ar',
      category: 'no_diacritics',
      expected: { state: 'matched', ref: `${a.chapter}:${a.verse}` },
      note: 'No diacritics'
    });
  });

  // 3. 2-3 Typos 6
  const typoIndices = [75, 175, 650, 1150, 3150, 5050];
  typoIndices.forEach((idx, i) => {
    const a = quranList[idx];
    let text = a.text;
    // Simple typo: swap two characters or change one
    if (text.length > 10) {
       text = text.substring(0, 5) + ' ' + text.substring(7); // remove a char
    }
    cases.push({
      id: `ayah_typo_${i+1}`,
      mode: 'ayah',
      input: text,
      language: 'ar',
      category: 'typos',
      expected: { state: 'close_match', ref: `${a.chapter}:${a.verse}` },
      note: 'With typos'
    });
  });

  // 4. Partial slice 6
  const sliceIndices = [10, 200, 700, 1200, 3200, 5100];
  sliceIndices.forEach((idx, i) => {
    const a = quranList[idx];
    const words = a.text.split(' ');
    const slice = words.slice(Math.floor(words.length/3), Math.floor(words.length/3) + 4).join(' ');
    cases.push({
      id: `ayah_slice_${i+1}`,
      mode: 'ayah',
      input: slice,
      language: 'ar',
      category: 'partial_slice',
      expected: { state: 'close_match', ref: `${a.chapter}:${a.verse}` },
      note: 'Partial slice'
    });
  });

  // 5. Multi-ayah range 3
  const rangeStarts = [0, 1000, 5000];
  rangeStarts.forEach((idx, i) => {
    const a1 = quranList[idx];
    const a2 = quranList[idx+1];
    cases.push({
      id: `ayah_range_${i+1}`,
      mode: 'ayah',
      input: a1.text + ' ' + a2.text,
      language: 'ar',
      category: 'multi_ayah_range',
      expected: { state: 'matched', ref: `${a1.chapter}:${a1.verse}-${a2.verse}` },
      note: 'Multi-ayah range'
    });
  });

  // 6. Ar-Rahman refrain 1
  cases.push({
    id: `ayah_rahman_refrain`,
    mode: 'ayah',
    input: 'فبأي آلاء ربكما تكذبان',
    language: 'ar',
    category: 'refrain',
    expected: { state: 'matched', ref: '55:13' }, // It should return multiple, but we check top
    note: 'Ar-Rahman refrain (31 occurrences)'
  });

  // 7. One word replaced 3
  const replaceIndices = [20, 250, 800];
  replaceIndices.forEach((idx, i) => {
    const a = quranList[idx];
    const words = a.text.split(' ');
    words[Math.floor(words.length/2)] = 'كلمة_مختلفة';
    cases.push({
      id: `ayah_replaced_${i+1}`,
      mode: 'ayah',
      input: words.join(' '),
      language: 'ar',
      category: 'one_word_replaced',
      expected: { state: 'close_match', ref: `${a.chapter}:${a.verse}` },
      note: 'One word replaced'
    });
  });

  // 8. Non-Quran 3
  const nonQuran = [
    'هذا كلام ليس من القرآن الكريم',
    'الذهب والفضة والبر والشعير',
    'إنما العلم بالتعلم والحلم بالتحلم'
  ];
  nonQuran.forEach((text, i) => {
    cases.push({
      id: `ayah_nonquran_${i+1}`,
      mode: 'ayah',
      input: text,
      language: 'ar',
      category: 'non_quran',
      expected: { state: 'not_found', ref: null },
      note: 'Non-Quran input'
    });
  });

  // --- HADITH CASES (30) ---
  
  // 1. Exact matn 6
  const hadithExact = [
    { col: 'bukhari', num: 1 },
    { col: 'muslim', num: 93 },
    { col: 'abudawud', num: 1 },
    { col: 'tirmidhi', num: 1 },
    { col: 'nasai', num: 1 },
    { col: 'ibnmajah', num: 1 }
  ];
  hadithExact.forEach((hInfo, i) => {
    const h = hadiths[hInfo.col].find(x => x.hadithnumber === hInfo.num);
    cases.push({
      id: `hadith_exact_${i+1}`,
      mode: 'hadith',
      input: h.text,
      language: 'ar',
      category: 'exact_matn',
      expected: { state: 'matched', ref: `${hInfo.col}_${hInfo.num}` },
      note: 'Exact matn'
    });
  });

  // 2. Isnad+takhrij 4
  const isnadHadiths = [
    { col: 'bukhari', num: 2, prefix: 'حدثنا عبد الله بن يوسف قال أخبرنا مالك عن نافع عن ابن عمر أن رسول الله صلى الله عليه وسلم قال: ' },
    { col: 'muslim', num: 2, prefix: 'وحدثني محمد بن رافع حدثنا عبد الرزاق أخبرنا معمر عن همام بن منبه قال هذا ما حدثنا أبو هريرة عن رسول الله صلى الله عليه وسلم فذكر أحاديث منها وقال رسول الله صلى الله عليه وسلم: ' },
    { col: 'abudawud', num: 2, prefix: 'حدثنا مسدد حدثنا عيسى بن يونس حدثنا الأعمش عن أبي وائل عن حذيفة قال: ' },
    { col: 'tirmidhi', num: 2, prefix: 'حدثنا قتيبة حدثنا الليث عن نافع عن ابن عمر أن رسول الله صلى الله عليه وسلم قال: ' }
  ];
  isnadHadiths.forEach((hInfo, i) => {
    const h = hadiths[hInfo.col].find(x => x.hadithnumber === hInfo.num);
    cases.push({
      id: `hadith_isnad_${i+1}`,
      mode: 'hadith',
      input: hInfo.prefix + h.text,
      language: 'ar',
      category: 'isnad_takhrij',
      expected: { state: 'matched', ref: `${hInfo.col}_${hInfo.num}` },
      note: 'With isnad and takhrij'
    });
  });

  // 3. No diacritics 4
  const hadithNoDiacritics = [
    { col: 'bukhari', num: 10 },
    { col: 'muslim', num: 10 },
    { col: 'abudawud', num: 10 },
    { col: 'tirmidhi', num: 10 }
  ];
  hadithNoDiacritics.forEach((hInfo, i) => {
    const h = hadiths[hInfo.col].find(x => x.hadithnumber === hInfo.num);
    const text = h.text.replace(/[\u064B-\u065F\u0670]/g, '');
    cases.push({
      id: `hadith_nodiacritics_${i+1}`,
      mode: 'hadith',
      input: text,
      language: 'ar',
      category: 'no_diacritics',
      expected: { state: 'matched', ref: `${hInfo.col}_${hInfo.num}` },
      note: 'No diacritics'
    });
  });

  // 4. One word changed 4
  const hadithChanged = [
    { col: 'bukhari', num: 20 },
    { col: 'muslim', num: 20 },
    { col: 'abudawud', num: 20 },
    { col: 'tirmidhi', num: 20 }
  ];
  hadithChanged.forEach((hInfo, i) => {
    const h = hadiths[hInfo.col].find(x => x.hadithnumber === hInfo.num);
    const words = h.text.split(' ');
    words[Math.floor(words.length/2)] = 'كلمة_مختلفة';
    cases.push({
      id: `hadith_changed_${i+1}`,
      mode: 'hadith',
      input: words.join(' '),
      language: 'ar',
      category: 'one_word_changed',
      expected: { state: 'close_match', ref: `${hInfo.col}_${hInfo.num}` },
      note: 'One word changed'
    });
  });

  // 5. Attestation 2
  // We know "Actions are by intentions" is in Bukhari and others.
  cases.push({
    id: `hadith_attestation_1`,
    mode: 'hadith',
    input: 'إنما الأعمال بالنيات',
    language: 'ar',
    category: 'attestation',
    expected: { state: 'matched', ref: 'bukhari_1' },
    note: 'Should show attestations in other collections'
  });
  cases.push({
    id: `hadith_attestation_2`,
    mode: 'hadith',
    input: 'المؤمن القوي خير وأحب إلى الله من المؤمن الضعيف',
    language: 'ar',
    category: 'attestation',
    expected: { state: 'matched', ref: 'muslim_2664' },
    note: 'Attestation check'
  });

  // 6. Grader disagreement 2
  // We need to find cases with different grades.
  cases.push({
    id: `hadith_disagreement_1`,
    mode: 'hadith',
    input: 'الماء طهور لا ينجسه شيء',
    language: 'ar',
    category: 'grader_disagreement',
    expected: { state: 'matched', ref: 'abudawud_66' },
    note: 'Grader disagreement check'
  });
  cases.push({
    id: `hadith_disagreement_2`,
    mode: 'hadith',
    input: 'صلاة في مسجدي هذا أفضل من ألف صلاة فيما سواه',
    language: 'ar',
    category: 'grader_disagreement',
    expected: { state: 'matched', ref: 'bukhari_1190' },
    note: 'Grader disagreement check'
  });

  // 7. No-grade collections 2
  cases.push({
    id: `hadith_nograde_1`,
    mode: 'hadith',
    input: 'بني الإسلام على خمس',
    language: 'ar',
    category: 'no_grade_collections',
    expected: { state: 'matched', ref: 'bukhari_8' },
    note: 'Bukhari case (implied Sahih)'
  });
  cases.push({
    id: `hadith_nograde_2`,
    mode: 'hadith',
    input: 'المرء مع من أحب',
    language: 'ar',
    category: 'no_grade_collections',
    expected: { state: 'matched', ref: 'muslim_2640' },
    note: 'Muslim case (implied Sahih)'
  });

  // 8. Curated fabricated 3
  const fabricated = [
    { input: 'اطلبوا العلم ولو في الصين', ref: 'fabricated_1' },
    { input: 'من عرف نفسه فقد عرف ربه', ref: 'fabricated_2' },
    { input: 'اختلاف أمتي رحمة', ref: 'fabricated_3' }
  ];
  fabricated.forEach((f, i) => {
    cases.push({
      id: `hadith_fabricated_${i+1}`,
      mode: 'hadith',
      input: f.input,
      language: 'ar',
      category: 'curated_fabricated',
      expected: { state: 'not_found', ref: null }, // or specifically labelled fabricated if implemented
      note: 'Known fabricated saying'
    });
  });

  // 9. Invented 3
  const invented = [
    'قال رسول الله صلى الله عليه وسلم عليكم بأكل الباذنجان فإنه شفاء',
    'إن الله يحب اللاعبين بالكرة إذا أخلصوا النية',
    'من نام بعد العصر فلا يلومن إلا نفسه'
  ];
  invented.forEach((text, i) => {
    cases.push({
      id: `hadith_invented_${i+1}`,
      mode: 'hadith',
      input: text,
      language: 'ar',
      category: 'invented',
      expected: { state: 'not_found', ref: null },
      note: 'Invented claim'
    });
  });

  // 10. English verbatim 2
  cases.push({
    id: `hadith_en_verbatim_1`,
    mode: 'hadith',
    input: 'Actions are but by intentions',
    language: 'en',
    category: 'english_verbatim',
    expected: { state: 'matched', ref: 'bukhari_1' },
    note: 'English verbatim'
  });
  cases.push({
    id: `hadith_en_verbatim_2`,
    mode: 'hadith',
    input: 'The best among you are those who learn the Quran and teach it',
    language: 'en',
    category: 'english_verbatim',
    expected: { state: 'matched', ref: 'bukhari_5027' },
    note: 'English verbatim'
  });

  // 11. English paraphrase 2
  cases.push({
    id: `hadith_en_paraphrase_1`,
    mode: 'hadith',
    input: 'Deeds depend on what you intend',
    language: 'en',
    category: 'english_paraphrase',
    expected: { state: 'close_match', ref: 'bukhari_1' },
    note: 'English paraphrase'
  });
  cases.push({
    id: `hadith_en_paraphrase_2`,
    mode: 'hadith',
    input: 'The religion is sincerity',
    language: 'en',
    category: 'english_paraphrase',
    expected: { state: 'close_match', ref: 'muslim_55' },
    note: 'English paraphrase'
  });

  fs.writeFileSync(path.resolve(__dirname, '../eval/cases.json'), JSON.stringify(cases, null, 2));
  console.log(`Generated ${cases.length} cases.`);
}

prepare().catch(console.error);
