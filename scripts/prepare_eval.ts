import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DATA_DIR = path.resolve(__dirname, '../server/corpus/data');

function readJson(file: string) {
  return JSON.parse(fs.readFileSync(path.join(DATA_DIR, file), 'utf8'));
}

function stripMarks(text: string): string {
  return text
    .replace(/[\u064B-\u065F\u0670\u06D6-\u06ED\u0610-\u061A\u08D4-\u08F2\uFD3E\uFD3F]/g, '')
    .replace(/[ـ]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

// Single character edit inside a word without inserting spaces
function mutateSingleChar(word: string, fallbackWord: string): string {
  if (word.length <= 2) return fallbackWord;
  const chars = Array.from(word);
  const pos = 1 + Math.floor(Math.random() * (chars.length - 2)); // middle char
  const action = Math.floor(Math.random() * 3);
  
  if (action === 0 && chars.length > 3) {
    // Delete one middle char
    chars.splice(pos, 1);
  } else if (action === 1 && pos < chars.length - 1) {
    // Swap adjacent middle chars
    const tmp = chars[pos];
    chars[pos] = chars[pos + 1];
    chars[pos + 1] = tmp;
  } else {
    // Substitute with close Arabic letter
    const substitutes: Record<string, string> = {
      'ت': 'ة', 'ة': 'ت', 'ه': 'ة', 'ي': 'ى', 'ى': 'ي',
      'س': 'ص', 'ص': 'س', 'ق': 'ك', 'ك': 'ق', 'ذ': 'ز', 'ز': 'ذ', 'ض': 'ظ'
    };
    const c = chars[pos];
    chars[pos] = substitutes[c] || (c === 'ا' ? 'و' : 'ا');
  }
  return chars.join('');
}

async function prepare() {
  const cases: any[] = [];
  
  // 1. Quran Editions
  const quranAr = readJson('quran_ar.json');
  const quranList = quranAr.quran || quranAr[Object.keys(quranAr)[0]];
  
  const quranSimple = readJson('quran_simple.json');
  const quranSimpleList = quranSimple.quran || quranSimple[Object.keys(quranSimple)[0]];
  
  const quranEn = readJson('quran_en.json');
  const quranEnList = quranEn.quran || quranEn[Object.keys(quranEn)[0]];

  // 2. Hadith Editions
  const collections = ['bukhari', 'muslim', 'abudawud', 'tirmidhi', 'nasai', 'ibnmajah', 'nawawi'];
  const hadiths: Record<string, any[]> = {};
  const hadithsEn: Record<string, any[]> = {};
  for (const col of collections) {
    hadiths[col] = readJson(`hadith_${col}_ar.json`).hadiths || [];
    hadithsEn[col] = readJson(`hadith_${col}_en.json`).hadiths || [];
  }

  // Pre-index Quran verses by clean normalized text to find all matching refs for repeated phrases
  const quranPhraseMap = new Map<string, string[]>();
  for (const a of quranSimpleList) {
    const clean = stripMarks(a.text);
    const words = clean.split(/\s+/).filter(Boolean);
    for (let len = 4; len <= 8; len++) {
      for (let i = 0; i <= words.length - len; i++) {
        const phrase = words.slice(i, i + len).join(' ');
        const ref = `${a.chapter}:${a.verse}`;
        if (!quranPhraseMap.has(phrase)) quranPhraseMap.set(phrase, []);
        const list = quranPhraseMap.get(phrase)!;
        if (!list.includes(ref)) list.push(ref);
      }
    }
  }

  // Helper pool of real Arabic words from different verses
  const poolWords: string[] = [];
  for (let i = 100; i < 300; i++) {
    const wList = stripMarks(quranSimpleList[i].text).split(/\s+/).filter(w => w.length > 2);
    poolWords.push(...wList);
  }

  // ==========================================
  // A. AYAH SUITE (POSITIVE & CONTROLLED)
  // ==========================================

  // 1. Ayah Exact (6)
  const exactIndices = [0, 100, 500, 1000, 3000, 6235];
  exactIndices.forEach((idx, i) => {
    const a = quranList[idx];
    cases.push({
      id: `ayah_exact_${i + 1}`,
      mode: 'ayah',
      input: a.text,
      language: 'ar',
      category: 'exact',
      expected: { state: 'matched', ref: `${a.chapter}:${a.verse}` },
      note: 'Exact Uthmani text match'
    });
  });

  // 2. Ayah No Diacritics (6) - Derived from modern ara-quransimple (input >= 6 words)
  const diacriticIndices = [50, 150, 600, 1100, 3105, 5025];
  diacriticIndices.forEach((idx, i) => {
    const a = quranSimpleList[idx];
    const stripped = stripMarks(a.text);
    const words = stripped.split(/\s+/).filter(Boolean);
    if (words.length < 6) {
      throw new Error(`Ayah no-diacritics case index ${idx} has fewer than 6 words`);
    }
    cases.push({
      id: `ayah_nodiacritics_${i + 1}`,
      mode: 'ayah',
      input: stripped,
      language: 'ar',
      category: 'no_diacritics',
      expected: { state: 'matched', ref: `${a.chapter}:${a.verse}` },
      note: 'Modern spelling without any diacritics'
    });
  });

  // 3. Ayah Typos (6) - Single char edit per word, input >= 6 words, no inserted spaces
  const typoIndices = [75, 175, 650, 1150, 3158, 5075];
  typoIndices.forEach((idx, i) => {
    const a = quranSimpleList[idx];
    const cleanWords = stripMarks(a.text).split(/\s+/).filter(Boolean);
    if (cleanWords.length < 6) throw new Error('Typo case verse too short');
    
    // Mutate 1 character in the 2nd word and 1 character in the 5th word
    const mutated = [...cleanWords];
    mutated[1] = mutateSingleChar(mutated[1], 'بالمعروف');
    if (mutated.length > 5) {
      mutated[4] = mutateSingleChar(mutated[4], 'الحكيم');
    }
    const input = mutated.join(' ');
    
    cases.push({
      id: `ayah_typo_${i + 1}`,
      mode: 'ayah',
      input,
      language: 'ar',
      category: 'typos',
      expected: { state: 'close_match', ref: `${a.chapter}:${a.verse}` },
      note: 'Ayah with single character typo edits without inserted spaces'
    });
  });

  // 4. Ayah Partial Slice (6) - Input 4-6 words from verse, computing matching set of refs
  const sliceIndices = [10, 200, 700, 1200, 3200, 5100];
  sliceIndices.forEach((idx, i) => {
    const a = quranSimpleList[idx];
    const words = stripMarks(a.text).split(/\s+/).filter(Boolean);
    const startPos = Math.min(words.length - 4, Math.floor(words.length / 3));
    const sliceWords = words.slice(startPos, startPos + Math.min(5, words.length));
    const slice = sliceWords.join(' ');
    
    // Find all verses containing this exact phrase
    const matchingRefs = quranPhraseMap.get(slice) || [`${a.chapter}:${a.verse}`];
    if (!matchingRefs.includes(`${a.chapter}:${a.verse}`)) matchingRefs.push(`${a.chapter}:${a.verse}`);
    
    cases.push({
      id: `ayah_slice_${i + 1}`,
      mode: 'ayah',
      input: slice,
      language: 'ar',
      category: 'partial_slice',
      expected: { state: 'close_match', refs: matchingRefs },
      note: 'Partial ayah slice with corpus-derived multi-ref support'
    });
  });

  // 5. Ayah Multi-Ayah Range (3)
  const rangeStarts = [0, 1000, 5000];
  rangeStarts.forEach((idx, i) => {
    const a1 = quranList[idx];
    const a2 = quranList[idx + 1];
    cases.push({
      id: `ayah_range_${i + 1}`,
      mode: 'ayah',
      input: a1.text + ' ' + a2.text,
      language: 'ar',
      category: 'multi_ayah_range',
      expected: { state: 'matched', ref: `${a1.chapter}:${a1.verse}-${a2.verse}` },
      note: 'Multi-ayah range match'
    });
  });

  // 6. Ar-Rahman Refrain (1) - Appears 31 times
  const rahmanRefrainRefs: string[] = [];
  for (let v = 13; v <= 77; v++) {
    rahmanRefrainRefs.push(`55:${v}`);
  }
  cases.push({
    id: `ayah_rahman_refrain`,
    mode: 'ayah',
    input: 'فبأي آلاء ربكما تكذبان',
    language: 'ar',
    category: 'refrain',
    expected: { state: 'matched', refs: rahmanRefrainRefs },
    note: 'Ar-Rahman refrain with 31 authentic verse occurrences'
  });

  // 7. Ayah One Word Replaced (3) - Input >= 6 words, replaced with real Arabic word
  const replaceIndices = [20, 250, 800];
  replaceIndices.forEach((idx, i) => {
    const a = quranSimpleList[idx];
    const words = stripMarks(a.text).split(/\s+/).filter(Boolean);
    if (words.length < 6) throw new Error('Verse too short for replacement test');
    const mid = Math.floor(words.length / 2);
    const replacementWord = poolWords[(i * 37) % poolWords.length];
    words[mid] = replacementWord;
    
    cases.push({
      id: `ayah_replaced_${i + 1}`,
      mode: 'ayah',
      input: words.join(' '),
      language: 'ar',
      category: 'one_word_replaced',
      expected: { state: 'close_match', ref: `${a.chapter}:${a.verse}` },
      note: 'One word replaced with real Arabic word from corpus'
    });
  });

  // ==========================================
  // B. HADITH SUITE (POSITIVE & CONTROLLED)
  // ==========================================

  // 1. Hadith Exact Matn (6)
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
      id: `hadith_exact_${i + 1}`,
      mode: 'hadith',
      input: h.text,
      language: 'ar',
      category: 'exact_matn',
      expected: { state: 'matched', ref: `${hInfo.col}_${hInfo.num}` },
      note: 'Exact hadith matn'
    });
  });

  // 2. Hadith Isnad + Takhrij (4)
  const isnadHadiths = [
    { col: 'bukhari', num: 2, prefix: 'حدثنا عبد الله بن يوسف قال أخبرنا مالك عن نافع عن ابن عمر أن رسول الله صلى الله عليه وسلم قال: ' },
    { col: 'muslim', num: 2, prefix: 'وحدثني محمد بن رافع حدثنا عبد الرزاق أخبرنا معمر عن همام بن منبه قال هذا ما حدثنا أبو هريرة عن رسول الله صلى الله عليه وسلم فذكر أحاديث منها وقال رسول الله صلى الله عليه وسلم: ' },
    { col: 'abudawud', num: 2, prefix: 'حدثنا مسدد حدثنا عيسى بن يونس حدثنا الأعمش عن أبي وائل عن حذيفة قال: ' },
    { col: 'tirmidhi', num: 2, prefix: 'حدثنا قتيبة حدثنا الليث عن نافع عن ابن عمر أن رسول الله صلى الله عليه وسلم قال: ' }
  ];
  isnadHadiths.forEach((hInfo, i) => {
    const h = hadiths[hInfo.col].find(x => x.hadithnumber === hInfo.num);
    cases.push({
      id: `hadith_isnad_${i + 1}`,
      mode: 'hadith',
      input: hInfo.prefix + h.text,
      language: 'ar',
      category: 'isnad_takhrij',
      expected: { state: 'matched', ref: `${hInfo.col}_${hInfo.num}` },
      note: 'Hadith with isnad preamble'
    });
  });

  // 3. Hadith No Diacritics (4) - Input >= 6 words
  const hadithNoDiacritics = [
    { col: 'bukhari', num: 10 },
    { col: 'muslim', num: 93 },
    { col: 'abudawud', num: 10 },
    { col: 'tirmidhi', num: 10 }
  ];
  hadithNoDiacritics.forEach((hInfo, i) => {
    const h = hadiths[hInfo.col].find(x => x.hadithnumber === hInfo.num);
    const clean = stripMarks(h.text);
    const words = clean.split(/\s+/).filter(Boolean);
    if (words.length < 6) throw new Error('Hadith no-diacritics case too short');
    cases.push({
      id: `hadith_nodiacritics_${i + 1}`,
      mode: 'hadith',
      input: clean,
      language: 'ar',
      category: 'no_diacritics',
      expected: { state: 'matched', ref: `${hInfo.col}_${hInfo.num}` },
      note: 'Hadith text without diacritics'
    });
  });

  // 4. Hadith One Word Changed (4) - Input >= 6 words, real Arabic word replaced
  const hadithChanged = [
    { col: 'bukhari', num: 20 },
    { col: 'muslim', num: 93 },
    { col: 'abudawud', num: 20 },
    { col: 'tirmidhi', num: 20 }
  ];
  hadithChanged.forEach((hInfo, i) => {
    const h = hadiths[hInfo.col].find(x => x.hadithnumber === hInfo.num);
    const clean = stripMarks(h.text);
    const words = clean.split(/\s+/).filter(Boolean);
    if (words.length < 6) throw new Error('Hadith too short for word change');
    const mid = Math.floor(words.length / 2);
    words[mid] = poolWords[(i * 43) % poolWords.length];
    
    cases.push({
      id: `hadith_changed_${i + 1}`,
      mode: 'hadith',
      input: words.join(' '),
      language: 'ar',
      category: 'one_word_changed',
      expected: { state: 'close_match', ref: `${hInfo.col}_${hInfo.num}` },
      note: 'One word changed inside hadith text'
    });
  });

  // 5. Hadith Attestation (2)
  cases.push({
    id: `hadith_attestation_1`,
    mode: 'hadith',
    input: 'إنما الأعمال بالنيات وإنما لكل امرئ ما نوى',
    language: 'ar',
    category: 'attestation',
    expected: { state: 'matched', refs: ['bukhari_1', 'bukhari_54', 'muslim_1907', 'abudawud_2201', 'tirmidhi_1647', 'nasai_75', 'nasai_3437', 'ibnmajah_4227', 'nawawi_1'] },
    note: 'Cross-collection attestation check'
  });
  cases.push({
    id: `hadith_attestation_2`,
    mode: 'hadith',
    input: 'المؤمن القوي خير وأحب إلى الله من المؤمن الضعيف وفي كل خير',
    language: 'ar',
    category: 'attestation',
    expected: { state: 'matched', refs: ['muslim_2664', 'muslim_6774', 'ibnmajah_79', 'ibnmajah_4168'] },
    note: 'Attestation check across Muslim and Ibn Majah'
  });

  // 6. Grader Disagreement (2) - Picked hadiths from Sunan collections with stored grader conflicts
  cases.push({
    id: `hadith_disagreement_1`,
    mode: 'hadith',
    input: 'الماء طهور لا ينجسه شيء',
    language: 'ar',
    category: 'grader_disagreement',
    expected: { state: 'matched', refs: ['abudawud_66', 'abudawud_67', 'tirmidhi_66', 'nasai_326'] },
    note: 'Grader disagreement verified in Sunan Abu Dawud / Tirmidhi'
  });
  cases.push({
    id: `hadith_disagreement_2`,
    mode: 'hadith',
    input: 'طلب العلم فريضة على كل مسلم',
    language: 'ar',
    category: 'grader_disagreement',
    expected: { state: 'matched', refs: ['ibnmajah_224', 'ibnmajah_225'] },
    note: 'Grader disagreement in Sunan Ibn Majah (Al-Albani: Sahih vs others: Daif)'
  });

  // 7. No-Grade Collections (2) - Pass if top result is from Bukhari, Muslim or Nawawi
  cases.push({
    id: `hadith_nograde_1`,
    mode: 'hadith',
    input: 'بني الإسلام على خمس شهادة أن لا إله إلا الله وأن محمدا رسول الله',
    language: 'ar',
    category: 'no_grade_collections',
    expected: { state: 'matched', allowedCollections: ['bukhari', 'muslim', 'nawawi'] },
    note: 'Pass if top result is from consensus collections (Bukhari/Muslim/Nawawi)'
  });
  cases.push({
    id: `hadith_nograde_2`,
    mode: 'hadith',
    input: 'المرء مع من أحب يوم القيامة',
    language: 'ar',
    category: 'no_grade_collections',
    expected: { state: 'matched', allowedCollections: ['bukhari', 'muslim', 'nawawi'] },
    note: 'Pass if top result is from consensus collections'
  });

  // 8. English Verbatim (2) - Slice of 6+ words from specific record; pass if top result English contains slice
  cases.push({
    id: `hadith_en_verbatim_1`,
    mode: 'hadith',
    input: 'Actions are but by intention and every man shall have but that which he intended',
    language: 'en',
    category: 'english_verbatim',
    expected: { state: 'matched', containsEnglishSlice: 'Actions are but by intention' },
    note: 'English verbatim search slice >= 6 words'
  });
  cases.push({
    id: `hadith_en_verbatim_2`,
    mode: 'hadith',
    input: 'The best among you are those who learn the Quran and teach it',
    language: 'en',
    category: 'english_verbatim',
    expected: { state: 'matched', containsEnglishSlice: 'learn the quran and teach' },
    note: 'English verbatim search'
  });

  // 9. English Paraphrase (4 Hand-written Paraphrases) - Pass ONLY if state is NOT "matched"
  const enParaphrases = [
    {
      id: `hadith_en_paraphrase_1`,
      input: "Deeds are judged solely according to a person's inner intention",
      targetRef: 'bukhari_1',
      note: 'Paraphrase of Actions are by intentions (Bukhari 1)'
    },
    {
      id: `hadith_en_paraphrase_2`,
      input: "The superior person among all of you is one who studies the holy book and instructs others in it",
      targetRef: 'bukhari_5027',
      note: 'Paraphrase of The best of you learn Quran and teach it (Bukhari 5027)'
    },
    {
      id: `hadith_en_paraphrase_3`,
      input: "True faith consists of sincere advice and loyalty towards God, His scripture, and His messenger",
      targetRef: 'muslim_55',
      note: 'Paraphrase of Religion is sincerity (Muslim 55)'
    },
    {
      id: `hadith_en_paraphrase_4`,
      input: "None of you truly possesses complete faith until he desires for his fellow brother whatever good he desires for himself",
      targetRef: 'bukhari_13',
      note: 'Paraphrase of None of you believes until he loves for his brother (Bukhari 13)'
    }
  ];

  enParaphrases.forEach(p => {
    cases.push({
      id: p.id,
      mode: 'hadith',
      input: p.input,
      language: 'en',
      category: 'english_paraphrase',
      expected: { stateNot: 'matched' },
      note: p.note
    });
  });

  // ==========================================
  // C. NEGATIVE SUITE (TARGET 40+, NONE MAY RETURN "matched")
  // ==========================================

  // 1. Non-Quran/Hadith Arabic: Proverbs, Poetry, News Sentences (14 cases)
  const nonReligiousArabic = [
    'الوقت كالسيف إن لم تقطعه قطعك والعلم في الصغر كالنقش على الحجر',
    'لكل داء دواء يستطب به إلا الحماقة أعيت من يداويها',
    'أعلنت وزارة التجارة اليوم عن ارتفاع مؤشرات النمو الاقتصادي في الربع الأخير',
    'إذا غامرت في شرف مروم فلا تقنع بما دون النجوم',
    'تعتبر القراءة غذاء العقل والوسيلة الأساسية لاكتساب المعرفة وتطوير المهارات الفردية',
    'بلغت نسبة الأمطار الهاطلة على المرتفعات الجبلية مستويات قياسية هذا الأسبوع',
    'صاحب الحاجة أرعن لا يرى إلا قضاءها ولو كان فيه حتفه',
    'تنعقد القمة الدولية للتغير المناخي لمناقشة سبل تقليل الانبعاثات الكربونية في العالم',
    'لا تنه عن خلق وتأتي مثله عار عليك إذا فعلت عظيم',
    'أكد خبراء التغذية على أهمية شرب كميات كافية من الماء يوميا لتعزيز المناعة',
    'الخيل والليل والبيداء تعرفني والسيف والرمح والقرطاس والقلم',
    'افتتح وزير التعليم المؤتمر السنوي لتطوير المناهج والذكاء الاصطناعي في المدارس',
    'من جد وجد ومن زرع حصد ومن سار على الدرب وصل',
    'أطلقت الهيئة الوطنية للمواصلات خطة لتوسيع شبكة القطارات السريعة بين المدن'
  ];
  nonReligiousArabic.forEach((text, i) => {
    cases.push({
      id: `negative_arabic_prose_${i + 1}`,
      mode: i % 2 === 0 ? 'ayah' : 'hadith',
      input: text,
      language: 'ar',
      category: 'negative_arabic_prose',
      expected: { state: 'not_found', ref: null },
      note: 'Non-scripture Arabic proverb, poetry, or contemporary news sentence'
    });
  });

  // 2. Famous Non-Hadith Sayings (5 cases)
  const famousNonHadith = [
    'النظافة من الإيمان',
    'حب الوطن من الإيمان',
    'الصبر مفتاح الفرج',
    'العقل السليم في الجسم السليم',
    'المعدة بيت الداء والحمية رأس الدواء'
  ];
  famousNonHadith.forEach((text, i) => {
    cases.push({
      id: `negative_famous_nonhadith_${i + 1}`,
      mode: 'hadith',
      input: text,
      language: 'ar',
      category: 'negative_famous_nonhadith',
      expected: { state: 'not_found', ref: null },
      note: 'Famous cultural saying that is not a verified hadith'
    });
  });

  // 3. Real Ayah or Hadith with 3 Words Replaced (10 cases) - Expected NOT "matched"
  const corruptedVerses = [
    { text: 'يا أيها الذين آمنوا كتب عليكم الصيام كما كتب على الذين من قبلكم لعلكم تتقون', mode: 'ayah' },
    { text: 'إن الذين كفروا سواء عليهم أأنذرتهم أم لم تنذرهم لا يؤمنون ختم الله على قلوبهم', mode: 'ayah' },
    { text: 'الله لا إله إلا هو الحي القيوم لا تأخذه سنة ولا نوم له ما في السماوات وما في الأرض', mode: 'ayah' },
    { text: 'قل هو الله أحد الله الصمد لم يلد ولم يولد ولم يكن له كفوا أحد', mode: 'ayah' },
    { text: 'والعصر إن الإنسان لفي خسر إلا الذين آمنوا وعملوا الصالحات وتواصوا بالحق وتواصوا بالصبر', mode: 'ayah' },
    { text: 'طلب العلم فريضة على كل مسلم ومسلمة في كل مكان وزمان', mode: 'hadith' },
    { text: 'من غشنا فليس منا والمكر والخداع في النار وبئس المصير', mode: 'hadith' },
    { text: 'إنما بعثت لأتمم صالح الأخلاق ومكارم الشيم بين الناس', mode: 'hadith' },
    { text: 'المسلم من سلم المسلمون من لسانه ويده والمهاجر من هجر ما نهى الله عنه', mode: 'hadith' },
    { text: 'لا يؤمن أحدكم حتى يحب لأخيه ما يحب لنفسه من الخير والبركة', mode: 'hadith' }
  ];
  corruptedVerses.forEach((item, i) => {
    const words = item.text.split(' ');
    words[1] = poolWords[(i * 13) % poolWords.length];
    words[3] = poolWords[(i * 29) % poolWords.length];
    words[5] = poolWords[(i * 47) % poolWords.length];
    cases.push({
      id: `negative_3_words_replaced_${i + 1}`,
      mode: item.mode,
      input: words.join(' '),
      language: 'ar',
      category: 'negative_3_words_replaced',
      expected: { stateNot: 'matched' },
      note: 'Real verse/hadith with 3 words corrupted; must never return matched'
    });
  });

  // 4. First Half Real + Second Half Invented (5 cases) - Expected NOT "matched"
  const halfInvented = [
    { prefix: 'يا أيها الذين آمنوا إذا قمتم إلى الصلاة', suffix: 'فاغسلوا هواتفكم بالماء البارد واشحنوا البطاريات سريعا', mode: 'ayah' },
    { prefix: 'إن الذين قالوا ربنا الله ثم استقاموا', suffix: 'فإنهم يسافرون بالقطار الكهربائي إلى المحطة المركزية', mode: 'ayah' },
    { prefix: 'قال رسول الله صلى الله عليه وسلم من كان يؤمن بالله واليوم الآخر', suffix: 'فليركب الدراجة الهوائية ولا يستعمل السيارات الحديثة', mode: 'hadith' },
    { prefix: 'عن أبي هريرة رضي الله عنه قال قال النبي صلى الله عليه وسلم', suffix: 'عليكم بتناول الآيس كريم في ليالي الصيف الحارة', mode: 'hadith' },
    { prefix: 'اتق الله حيثما كنت وأتبع السيئة الحسنة تمحها', suffix: 'واشرب عصير البرتقال الطازج قبل شروق الشمس كل يوم', mode: 'hadith' }
  ];
  halfInvented.forEach((item, i) => {
    cases.push({
      id: `negative_half_invented_${i + 1}`,
      mode: item.mode,
      input: `${item.prefix} ${item.suffix}`,
      language: 'ar',
      category: 'negative_half_invented',
      expected: { stateNot: 'matched' },
      note: 'Half authentic text joined with modern invented claim; must never return matched'
    });
  });

  // 5. Invented English Claims (5 cases) - Expected NOT "matched"
  const inventedEnglish = [
    'The Prophet ordered people to drink green tea after every morning meal',
    'Whoever rides an iron bicycle in the morning will receive golden coins',
    'It was narrated that sleeping near electricity damages the heart',
    'The Messenger of Allah forbade swimming in cold ocean water during winter',
    'Whoever eats purple grapes before noon will find treasure under his house'
  ];
  inventedEnglish.forEach((text, i) => {
    cases.push({
      id: `negative_invented_english_${i + 1}`,
      mode: 'hadith',
      input: text,
      language: 'en',
      category: 'negative_invented_english',
      expected: { state: 'not_found', ref: null },
      note: 'Completely invented English religious claim'
    });
  });

  // 6. Curated Fabricated Sayings (3 cases)
  const curatedFabricated = [
    { input: 'اطلبوا العلم ولو في الصين', note: 'Fabricated saying about seeking knowledge in China' },
    { input: 'من عرف نفسه فقد عرف ربه', note: 'Sufi maxim falsely attributed as hadith' },
    { input: 'اختلاف أمتي رحمة', note: 'Fabricated saying about disagreement being mercy' }
  ];
  curatedFabricated.forEach((f, i) => {
    cases.push({
      id: `negative_curated_fabricated_${i + 1}`,
      mode: 'hadith',
      input: f.input,
      language: 'ar',
      category: 'negative_curated_fabricated',
      expected: { state: 'not_found', ref: null },
      note: f.note
    });
  });

  // Assertions: verify no empty inputs or inputs under 3 words
  for (const c of cases) {
    if (!c.input || typeof c.input !== 'string') {
      throw new Error(`Test case ${c.id} has invalid empty input`);
    }
    const tokenCount = c.input.trim().split(/\s+/).filter(Boolean).length;
    if (tokenCount < 3) {
      throw new Error(`Test case ${c.id} has only ${tokenCount} words (minimum required is 3): "${c.input}"`);
    }
  }

  fs.writeFileSync(path.resolve(__dirname, '../eval/cases.json'), JSON.stringify(cases, null, 2));
  console.log(`Successfully generated ${cases.length} evaluation cases.`);
  
  const negativeCount = cases.filter(c => c.id.startsWith('negative_')).length;
  console.log(`Total negative cases: ${negativeCount}`);
}

prepare().catch(console.error);
