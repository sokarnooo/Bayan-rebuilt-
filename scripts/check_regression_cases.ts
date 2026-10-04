import { searchHadith } from '../server/matching/hadithMatcher.ts';

console.log('=== TEST 1: لا يؤمن أحدكم حتى يحب لأخيه ما يحب لنفسه ===');
const res1 = searchHadith('لا يؤمن أحدكم حتى يحب لأخيه ما يحب لنفسه');
const b13 = res1.results.find(r => r.id === 'bukhari_13');
const t2515 = res1.results.find(r => r.id === 'tirmidhi_2515');

console.log('Bukhari 13 matchedWords:', b13 ? b13.matchedWords?.join(' ') : 'NOT FOUND');
console.log('Bukhari 13 matchedOriginalIndices:', b13 ? JSON.stringify(b13.matchedOriginalIndices) : 'NOT FOUND');
console.log('Tirmidhi 2515 matchedWords:', t2515 ? t2515.matchedWords?.join(' ') : 'NOT FOUND');
console.log('Tirmidhi 2515 matchedOriginalIndices:', t2515 ? JSON.stringify(t2515.matchedOriginalIndices) : 'NOT FOUND');

console.log('\n=== TEST 2: إنما الأعمال بالنيات ===');
const res2 = searchHadith('إنما الأعمال بالنيات');
const b1 = res2.results.find(r => r.id === 'bukhari_1');
const ad2201 = res2.results.find(r => r.id === 'abudawud_2201');
const im4227 = res2.results.find(r => r.id === 'ibnmajah_4227');

console.log('Bukhari 1 matchedWords:', b1 ? b1.matchedWords?.join(' ') : 'NOT FOUND');
console.log('Bukhari 1 matchedOriginalIndices:', b1 ? JSON.stringify(b1.matchedOriginalIndices) : 'NOT FOUND');
console.log('Abu Dawud 2201 matchedWords:', ad2201 ? ad2201.matchedWords?.join(' ') : 'NOT FOUND');
console.log('Abu Dawud 2201 matchedOriginalIndices:', ad2201 ? JSON.stringify(ad2201.matchedOriginalIndices) : 'NOT FOUND');
console.log('Ibn Majah 4227 matchedWords:', im4227 ? im4227.matchedWords?.join(' ') : 'NOT FOUND');
console.log('Ibn Majah 4227 matchedOriginalIndices:', im4227 ? JSON.stringify(im4227.matchedOriginalIndices) : 'NOT FOUND');

console.log('\n=== TEST 3: لا تقبل صلاة بغير طهور on Nasai 139 ===');
const res3 = searchHadith('لا تقبل صلاة بغير طهور');
const n139 = res3.results.find(r => r.id === 'nasai_139');
console.log('Nasa 139 confidence:', n139?.confidence);
console.log('Nasa 139 changedWords:', JSON.stringify(n139?.changedWords, null, 2));
console.log('Nasa 139 matchedWords:', n139 ? n139.matchedWords?.join(' ') : 'NOT FOUND');
console.log('Nasa 139 matchedOriginalIndices:', n139 ? JSON.stringify(n139.matchedOriginalIndices) : 'NOT FOUND');
