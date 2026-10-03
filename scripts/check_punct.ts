import fs from 'fs';

const enRaw = JSON.parse(fs.readFileSync('server/corpus/data/quran_en.json', 'utf8'));
const verses = enRaw.quran || enRaw[Object.keys(enRaw)[0]];

const unpunctuated: string[] = [];
for (const v of verses) {
  const t = v.text.trim();
  const lastChar = t[t.length - 1];
  if (!['.', '!', '?', ',', ':', ';', '-', '—', '"', "'", ')', ']'].includes(lastChar)) {
    unpunctuated.push(`${v.chapter}:${v.verse} -> "${t}"`);
  }
}

console.log('Total verses without terminal punctuation in quran_en.json:', unpunctuated.length);
console.log('Sample first 15:');
unpunctuated.slice(0, 15).forEach((x) => console.log(x));
