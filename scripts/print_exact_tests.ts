import { initAyahEngine, searchAyah } from '../server/matching/ayahMatcher.ts';
import fs from 'fs';

initAyahEngine();

const testQueries = [
  { name: '1a_al_ikhlas_alone', q: 'قل هو الله أحد الله الصمد لم يلد ولم يولد ولم يكن له كفوا أحد' },
  { name: '1b_al_ikhlas_with_basmala', q: 'بسم الله الرحمن الرحيم قل هو الله أحد الله الصمد لم يلد ولم يولد ولم يكن له كفوا أحد' },
  { name: '1c_al_fatihah_in_full', q: 'بسم الله الرحمن الرحيم الحمد لله رب العالمين الرحمن الرحيم مالك يوم الدين إياك نعبد وإياك نستعين اهدنا الصراط المستقيم صراط الذين أنعمت عليهم غير المغضوب عليهم ولا الضالين' },
  { name: '1d_baqarah_last_two', q: 'آمن الرسول بما أنزل إليه من ربه والمؤمنون كل آمن بالله وملائكته وكتبه ورسله لا نفرق بين أحد من رسله وقالوا سمعنا وأطعنا غفرانك ربنا وإليك المصير لا يكلف الله نفسا إلا وسعها لها ما كسبت وعليها ما اكتسبت ربنا لا تؤاخذنا إن نسينا أو أخطأنا ربنا ولا تحمل علينا إصرا كما حملته على الذين من قبلنا ربنا ولا تحملنا ما لا طاقة لنا به واعف عنا واغفر لنا وارحمنا أنت مولانا فانصرنا على القوم الكافرين' },
  { name: '1e_end_255_start_256', q: 'وهو العلي العظيم لا اكراه في الدين' },
  { name: '1f_two_surahs_different', q: 'قل هو الله أحد قل أعوذ برب الفلق' },
  { name: '2a_allah_la_ilaha_illa_huwa_hayy_qayyum', q: 'الله لا اله الا هو الحي القيوم' },
  { name: '2b_la_ilaha_illa_huwa', q: 'لا اله الا هو' },
  { name: '6a_dhalika_al_kutub', q: 'ذلك الكتب لا ريب فيه' },
  { name: '6b_dhalika_al_kitab', q: 'ذلك الكتاب لا ريب فيه' },
  { name: '6c_salawatika', q: 'خذ من اموالهم صدقة تطهرهم وتزكيهم بها وصل عليهم ان صلواتك سكن لهم' },
  { name: '8a_aqimu_salat_wa_atu_zakat', q: 'أقيموا الصلاة وآتوا الزكاة' },
  { name: '8b_wa_ahalla_allahu_al_bay_wa_harrama_al_riba', q: 'وأحل الله البيع وحرم الربا' },
  { name: '8c_samawati_wal_ard_wa_la_yauduhu', q: 'السموات والارض ولا يئوده حفظهما' },
  { name: '8d_dhalika_al_kitab_la_rayba_fih', q: 'ذلك الكتاب لا ريب فيه' },
];

const resultsObj: Record<string, any> = {};

for (const t of testQueries) {
  const res = searchAyah(t.q);
  resultsObj[t.name] = res;
}

fs.writeFileSync('scripts/test_outputs.json', JSON.stringify(resultsObj, null, 2), 'utf8');
console.log('Saved all test outputs to scripts/test_outputs.json');
