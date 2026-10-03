import fs from 'fs';

function cleanWhitespaceBeforeCombiningMarks(text: string): string {
  if (!text) return '';
  return text
    .replace(/[\s\u00A0\u200B\u200C\u200D\u2060\uFEFF]+(?=[\u064B-\u065F\u0670\u06D6-\u06ED\u08D3-\u08FF])/g, '')
    .replace(/\u00A0/g, ' ');
}

function foldSilentCarrierWaw(text: string): string {
  if (!text) return '';
  let s = text.replace(/و[\u064B-\u065F\u06E1\u06D6-\u06ED\u08D3-\u08FF]*\u0670(?=[\u064B-\u065F\u06D6-\u06ED\u08D3-\u08FF]*[ةا])/g, 'ا');
  s = s.replace(/([وفبلك]*(?:ال)?)(صل|زك|حي|مشك|نج|من|غد)و(ة)(?=[\s،.؛!؟()\[\]«»]|$)/gu, '$1$2ا$3');
  s = s.replace(/(^|[\s،.؛!؟()\[\]«»])([وفبلك]*(?:ال)?)ربوا(?=[\s،.؛!؟()\[\]«»]|$)/gu, '$1$2ربا');
  return s;
}

export function normalizeArabic(text: string): string {
  if (!text) return '';
  let s = cleanWhitespaceBeforeCombiningMarks(text);

  s = s.replace(/\u06A9/g, 'ك');
  s = s.replace(/[\u0649\u06CC]/g, 'ي');

  s = foldSilentCarrierWaw(s);

  // Alef maqsura / ya followed by dagger alef
  s = s.replace(/([ىي\u0649\u06CC\u064A])[\u064B-\u065F\u06E1\u06D6-\u06ED\u08D3-\u08FF]*\u0670(?=[\u064B-\u065F\u06D6-\u06ED\u08D3-\u08FF]*[\u0621-\u064A\u0671-\u06D3\u06E5\u06E6])/gu, 'ا');
  s = s.replace(/([ىي\u0649\u06CC\u064A])[\u064B-\u065F\u06E1\u06D6-\u06ED\u08D3-\u08FF]*\u0670/gu, 'ي');

  // Remaining dagger alefs -> standard alef
  s = s.replace(/\u0670/g, 'ا');

  // Strip invisible formatting characters
  s = s.replace(/[\u200B\u200C\u200D\u2060\uFEFF]/g, '');

  // Strip tashkeel, tatweel, pause marks
  s = s.replace(/[\u064B-\u065F\u06D6-\u06ED\u06DF-\u06E8\u08D3-\u08FF]/g, '');
  s = s.replace(/\u0640/g, '');

  // Generic: fold ءا (standalone hamza + alef) to alef
  s = s.replace(/ءا/g, 'ا');

  // Fold Alef variants (آ, أ, إ, ٱ) -> ا
  s = s.replace(/[\u0622\u0623\u0625\u0671]/g, 'ا');

  // Fold Ta Marbuta
  s = s.replace(/\u0629/g, 'ه');

  // Fold Yeh variants
  s = s.replace(/[\u0649\u06CC]/g, 'ي');

  // Fold remaining Hamza seats
  s = s.replace(/[\u0624\u0626\u0654\u0655\u0674]/g, 'ء');

  // Clean punctuation and non-letters
  s = s.replace(/[.,/#!$%^&*;:{}=\-_`~()؟،؛«»"'\d\u0660-\u0669\uFD3E\uFD3F\[\]<>ـ]/g, ' ');

  // Defective nouns and demonstratives normalization (words whose spoken alef is omitted in rasm)
  s = s.replace(/(^|[\s])الرحمان(?=[\s]|$)/g, '$1الرحمن');
  s = s.replace(/(^|[\s])هاذا(?=[\s]|$)/g, '$1هذا');
  s = s.replace(/(^|[\s])هاذه(?=[\s]|$)/g, '$1هذه');
  s = s.replace(/(^|[\s])هاؤلاء(?=[\s]|$)/g, '$1هؤلاء');
  s = s.replace(/(^|[\s])لاكن(?=[\s]|$)/g, '$1لكن');
  s = s.replace(/(^|[\s])ولاكن(?=[\s]|$)/g, '$1ولكن');
  s = s.replace(/(^|[\s])فلاكن(?=[\s]|$)/g, '$1فلكن');
  s = s.replace(/(^|[\s])ذالك(?=[\s]|$)/g, '$1ذلك');
  s = s.replace(/(^|[\s])كذالك(?=[\s]|$)/g, '$1كذلك');
  s = s.replace(/(^|[\s])الاه(?=[\s]|$)/g, '$1اله');
  s = s.replace(/(^|[\s])والاه(?=[\s]|$)/g, '$1واله');
  s = s.replace(/(^|[\s])فالاه(?=[\s]|$)/g, '$1فاله');
  s = s.replace(/(^|[\s])اليل(?=[\s]|$)/g, '$1الليل');
  s = s.replace(/(^|[\s])واليل(?=[\s]|$)/g, '$1والليل');
  s = s.replace(/(^|[\s])فاليل(?=[\s]|$)/g, '$1فالليل');
  s = s.replace(/(^|[\s])باليل(?=[\s]|$)/g, '$1بالليل');
  s = s.replace(/(^|[\s])كاليل(?=[\s]|$)/g, '$1كالليل');

  return s.replace(/\s+/g, ' ').trim();
}

const samples = [
  ['هَٰذَا', 'هَـٰذَا'],
  ['آمَنُوا', 'ءَامَنُوا۟'],
  ['آلَاءِ', 'ءَالَاۤءِ'],
  ['بِآيَاتِنَا', 'بِءَایَـٰتِنَا'],
  ['آمَنَّا', 'ءَامَنَّا'],
  ['وَلَٰكِنْ', 'وَلَـٰكِن'],
  ['الْآخِرَةِ', 'ٱلۡءَاخِرَةِ'],
  ['الْقُرْآنَ', 'ٱلۡقُرۡءَانَ'],
  ['الرَّحْمَٰنِ', 'ٱلرَّحۡمَـٰنِ'],
  ['اللَّيْلِ', 'ٱلَّیۡلِ'],
  ['آتَيْنَا', 'ءَاتَیۡنَا'],
  ['إِلَٰهَ', 'إِلَـٰهَ']
];

console.log('Testing top samples:');
samples.forEach(([q, c]) => {
  const qN = normalizeArabic(q);
  const cN = normalizeArabic(c);
  console.log(`[${q} -> ${c}] => qNorm: "${qN}", cNorm: "${cN}", Match: ${qN === cN}`);
});
