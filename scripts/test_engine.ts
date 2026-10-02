import { cleanWhitespaceBeforeCombiningMarks } from '../server/matching/normalizer.ts';

export function normalizeArabicStrict(text: string): string {
  if (!text) return '';
  let s = cleanWhitespaceBeforeCombiningMarks(text);

  // 1. Silent carrier Waw (waw with dagger alef before ة or ا)
  s = s.replace(
    /و[\u064B-\u065F\u06E1\u06D6-\u06ED\u08D3-\u08FF]*\u0670(?=[\u064B-\u065F\u06D6-\u06ED\u08D3-\u08FF]*[ةا])/g,
    'ا'
  );
  s = s.replace(
    /([وفبلك]*(?:ال)?)(صل|زك|حي|مشك|نج|من|غد)و(ة)(?=[\s،.؛!؟()\[\]«»]|$)/gu,
    '$1$2ا$3'
  );
  s = s.replace(/(^|[\s،.؛!؟()\[\]«»])([وفبلك]*(?:ال)?)ربوا(?=[\s،.؛!؟()\[\]«»]|$)/gu, '$1$2ربا');

  // 2. Demonstratives and common defective words where dagger alef is written in Uthmani but standard modern Arabic omits it:
  // e.g. ذَٰلِكَ -> ذلك, هَـٰذَا -> هذا, هَـٰذِهِ -> هذه, هَـٰؤُلَاءِ -> هؤلاء, لَـٰكِن -> لكن, ٱلرَّحۡمَـٰنِ -> الرحمن, إِلَـٰهَ -> إله
  s = s.replace(/ذَٰلِك/g, 'ذلك');
  s = s.replace(/هَـٰذَا/g, 'هذا');
  s = s.replace(/هَـٰذِهِ/g, 'هذه');
  s = s.replace(/هَـٰؤُلَا/g, 'هؤلاء');
  s = s.replace(/لَـٰكِن/g, 'لكن');
  s = s.replace(/ٱلرَّحۡمَـٰن/g, 'الرحمن');
  s = s.replace(/إِلَـٰه/g, 'إله');

  // Also handle modern user input spellings for these defective nouns:
  s = s.replace(/(^|[\s])(الرحمان)(?=[\s]|$)/g, '$1الرحمن');
  s = s.replace(/(^|[\s])(هاذا)(?=[\s]|$)/g, '$1هذا');
  s = s.replace(/(^|[\s])(هاذه)(?=[\s]|$)/g, '$1هذه');
  s = s.replace(/(^|[\s])(ذالك)(?=[\s]|$)/g, '$1ذلك');
  s = s.replace(/(^|[\s])(الاه)(?=[\s]|$)/g, '$1اله');
  s = s.replace(/(^|[\s])(إلاه)(?=[\s]|$)/g, '$1اله');
  s = s.replace(/(^|[\s])(لاكن)(?=[\s]|$)/g, '$1لكن');

  // 3. Convert all remaining dagger alefs \u0670 to standard alef 'ا'
  s = s.replace(/\u0670/g, 'ا');

  // 4. Strip invisible format characters (Zero-width space, word joiner, etc.)
  s = s.replace(/[\u200B\u200C\u200D\u2060\uFEFF]/g, '');

  // 5. Strip Tashkeel, Quranic signs, Tatweel
  s = s.replace(/[\u064B-\u065F\u06D6-\u06ED\u06DF-\u06E8\u08D3-\u08FF]/g, '');
  s = s.replace(/\u0640/g, '');

  // 6. Fold letter variants
  s = s.replace(/[\u0622\u0623\u0625\u0671]/g, 'ا');
  s = s.replace(/\u0629/g, 'ه');
  s = s.replace(/[\u0649\u06CC]/g, 'ي');
  s = s.replace(/\u06A9/g, 'ك');
  s = s.replace(/\u0624/g, 'و');
  s = s.replace(/\u0626/g, 'ي');
  s = s.replace(/\u0621/g, '');

  // 7. Strip non-Arabic symbols & collapse whitespace
  s = s.replace(/[.,/#!$%^&*;:{}=\-_`~()؟،؛«»"'\d\u0660-\u0669\uFD3E\uFD3F\[\]<>ـ]/g, ' ');
  return s.replace(/\s+/g, ' ').trim();
}

console.log('2:2 Uthmani ->', normalizeArabicStrict('ذَٰلِكَ ٱلۡكِتَـٰبُ لَا رَیۡبَۛ فِیهِۛ هُدࣰى لِّلۡمُتَّقِینَ'));
console.log('9:103 Uthmani ->', normalizeArabicStrict('خُذۡ مِنۡ أَمۡوَ ٰ⁠لِهِمۡ صَدَقَةࣰ تُطَهِّرُهُمۡ وَتُزَكِّیهِم بِهَا وَصَلِّ عَلَیۡهِمۡۖ إِنَّ صَلَوَٰتِكَ سَكَنࣱ لَّهُمۡۗ'));
console.log('2:255 Uthmani ->', normalizeArabicStrict('ٱللَّهُ لَاۤ إِلَـٰهَ إِلَّا هُوَ ٱلۡحَیُّ ٱلۡقَیُّومُۚ لَا تَأۡخُذُهُۥ سِنَةࣱ وَلَا نَوۡمࣱۚ لَّهُۥ مَا فِی ٱلسَّمَـٰوَ ٰ⁠تِ وَمَا فِی ٱلۡأَرۡضِۗ'));
console.log('User query "ذلك الكتب لا ريب فيه" ->', normalizeArabicStrict('ذلك الكتب لا ريب فيه'));
console.log('User query "ذلك الكتاب لا ريب فيه" ->', normalizeArabicStrict('ذلك الكتاب لا ريب فيه'));
console.log('User query "صلواتك" ->', normalizeArabicStrict('صلواتك'));
