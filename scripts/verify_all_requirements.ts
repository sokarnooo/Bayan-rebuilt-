import { initAyahEngine, searchAyah } from '../server/matching/ayahMatcher.ts';

initAyahEngine();

console.log('=== RUNNING TESTS FOR ALL REQUIREMENTS ===\n');

// 1. Tests for Multi-Ayah Paste (Item 1)
console.log('--- 1.a Al-Ikhlas Alone ---');
const r1a = searchAyah('قل هو الله أحد الله الصمد لم يلد ولم يولد ولم يكن له كفوا أحد');
console.log(JSON.stringify(r1a, null, 2));

console.log('\n--- 1.b Al-Ikhlas With Leading Basmala ---');
const r1b = searchAyah('بسم الله الرحمن الرحيم قل هو الله أحد الله الصمد لم يلد ولم يولد ولم يكن له كفوا أحد');
console.log(JSON.stringify(r1b, null, 2));

console.log('\n--- 1.c Al-Fatihah In Full ---');
const r1c = searchAyah('بسم الله الرحمن الرحيم الحمد لله رب العالمين الرحمن الرحيم مالك يوم الدين إياك نعبد وإياك نستعين اهدنا الصراط المستقيم صراط الذين أنعمت عليهم غير المغضوب عليهم ولا الضالين');
console.log(JSON.stringify(r1c, null, 2));

console.log('\n--- 1.d Last Two Ayat of Al-Baqarah (2:285-286) ---');
const r1d = searchAyah('آمن الرسول بما أنزل إليه من ربه والمؤمنون كل آمن بالله وملائكته وكتبه ورسله لا نفرق بين أحد من رسله وقالوا سمعنا وأطعنا غفرانك ربنا وإليك المصير لا يكلف الله نفسا إلا وسعها لها ما كسبت وعليها ما اكتسبت ربنا لا تؤاخذنا إن نسينا أو أخطأنا ربنا ولا تحمل علينا إصرا كما حملته على الذين من قبلنا ربنا ولا تحملنا ما لا طاقة لنا به واعف عنا واغفر لنا وارحمنا أنت مولانا فانصرنا على القوم الكافرين');
console.log(JSON.stringify(r1d, null, 2));

console.log('\n--- 1.e End of 2:255 + Start of 2:256 ---');
const r1e = searchAyah('وهو العلي العظيم لا اكراه في الدين');
console.log(JSON.stringify(r1e, null, 2));

console.log('\n--- 1.f Two Ayat from Different Surahs (112:1 + 113:1) ---');
const r1f = searchAyah('قل هو الله أحد قل أعوذ برب الفلق');
console.log(JSON.stringify(r1f, null, 2));

// 2. Recall Bug Tests (Item 2)
console.log('\n--- 2.a الله لا اله الا هو الحي القيوم ---');
const r2a = searchAyah('الله لا اله الا هو الحي القيوم');
console.log(JSON.stringify(r2a, null, 2));

console.log('\n--- 2.b لا اله الا هو ---');
const r2b = searchAyah('لا اله الا هو');
console.log(JSON.stringify(r2b, null, 2));

// 6. Precision Tests (Item 6)
console.log('\n--- 6.a ذلك الكتب لا ريب فيه ---');
const r6a = searchAyah('ذلك الكتب لا ريب فيه');
console.log(JSON.stringify(r6a, null, 2));

console.log('\n--- 6.b ذلك الكتاب لا ريب فيه ---');
const r6b = searchAyah('ذلك الكتاب لا ريب فيه');
console.log(JSON.stringify(r6b, null, 2));

console.log('\n--- 6.c صلواتك (9:103) ---');
const r6c = searchAyah('خذ من اموالهم صدقة تطهرهم وتزكيهم بها وصل عليهم ان صلواتك سكن لهم');
console.log(JSON.stringify(r6c, null, 2));

// 8. Retest dagger-alef words inside phrases (Item 8)
console.log('\n--- 8.a أقيموا الصلاة وآتوا الزكاة ---');
const r8a = searchAyah('أقيموا الصلاة وآتوا الزكاة');
console.log(JSON.stringify(r8a, null, 2));

console.log('\n--- 8.b وأحل الله البيع وحرم الربا ---');
const r8b = searchAyah('وأحل الله البيع وحرم الربا');
console.log(JSON.stringify(r8b, null, 2));

console.log('\n--- 8.c السموات والارض ولا يئوده حفظهما ---');
const r8c = searchAyah('السموات والارض ولا يئوده حفظهما');
console.log(JSON.stringify(r8c, null, 2));

console.log('\n--- 8.d ذلك الكتاب لا ريب فيه ---');
const r8d = searchAyah('ذلك الكتاب لا ريب فيه');
console.log(JSON.stringify(r8d, null, 2));
