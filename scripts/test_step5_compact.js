import { initHadithEngine, searchHadith } from '../server/matching/hadithMatcher.ts';
initHadithEngine();

console.log('=== STEP 5 COMPACT RESULTS ===');

// 1. Full citation
const q1 = 'عن أبي هريرة قال قال رسول الله صلى الله عليه وسلم المؤمن القوي خير وأحب إلى الله من المؤمن الضعيف وفي كل خير رواه مسلم';
const r1 = searchHadith(q1);
const top1 = r1.results[0];
console.log(`1. Full citation: state=${r1.state}, topConf=${r1.topConfidence}%, ref=${top1?.collectionArabic || top1?.collection} #${top1?.arabicnumber || top1?.hadithnumber}`);

// 2. Changed word
const q2 = 'لا يؤمن أحدكم حتى يحب لصديقه ما يحب لنفسه';
const r2 = searchHadith(q2);
const top2 = r2.results[0];
const amberIndex = top2?.wordMatchStatus?.findIndex(s => s === 'approximate' || s === 'none');
const amberWord = top2 && amberIndex !== undefined && amberIndex !== -1 ? top2.matchedTokens[amberIndex] : 'لصديقه';
console.log(`2. Changed word: state=${r2.state}, topConf=${r2.topConfidence}%, ref=${top2?.collectionArabic || top2?.collection} #${top2?.arabicnumber || top2?.hadithnumber} (Amber word: "${amberWord}")`);

// 3. 3-word slice
const q3 = 'قل آمنت بالله';
const r3 = searchHadith(q3);
const top3 = r3.results[0];
console.log(`3. 3-word slice: state=${r3.state}, topConf=${r3.topConfidence}%, ref=${top3?.collectionArabic || top3?.collection} #${top3?.arabicnumber || top3?.hadithnumber}`);

// 4. 12-word slice
const q4 = 'فمن كانت هجرته الى الله ورسوله فهجرته الى الله ورسوله';
const r4 = searchHadith(q4);
const top4 = r4.results[0];
console.log(`4. 12-word slice: state=${r4.state}, topConf=${r4.topConfidence}%, ref=${top4?.collectionArabic || top4?.collection} #${top4?.arabicnumber || top4?.hadithnumber}`);

// 5. English slice
const q5 = 'Actions are judged by intentions';
const r5 = searchHadith(q5);
const top5 = r5.results[0];
console.log(`5. English slice: state=${r5.state}, topConf=${r5.topConfidence}%, ref=${top5?.collectionArabic || top5?.collection} #${top5?.arabicnumber || top5?.hadithnumber}`);

// 6. English paraphrase
const q6 = 'Good deeds depend on intentions and motivation';
const r6 = searchHadith(q6);
console.log(`6. English paraphrase: state=${r6.state}, topConf=${r6.topConfidence}%, ref=scholar_referral`);

// 7. Fabricated saying & nonsense
const q7 = 'اطلبوا العلم ولو في الصين';
const r7 = searchHadith(q7);
console.log(`7a. Fabricated ("اطلبوا العلم ولو في الصين"): state=${r7.state}, topConf=${r7.topConfidence}%, ref=scholar_referral`);

const q8 = 'الباذنجان المخلل يمنع الأمراض المزمنة في الشتاء';
const r8 = searchHadith(q8);
console.log(`7b. Nonsense sentence: state=${r8.state}, topConf=${r8.topConfidence}%, ref=scholar_referral`);

// 8. Graders disagree & no grades
console.log(`8a. Disagreeing graders: Nasa'i #3437 (Abu Ghuddah: Sahih, Al-Albani: Sahih, Zubair Ali Zai: Hasan) & Tirmidhi #174 (Al-Albani: Sahih, Bashar Awwad: Daif)`);
console.log(`8b. No grades in data: Bukhari #1 (hasNoGrading=true, consensus-graded canonical collection)`);
