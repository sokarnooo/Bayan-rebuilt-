import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { preprocessAllRawHadiths } from '../matching/hadithMatcher.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DATA_DIR = path.resolve(__dirname, './data');

async function runPrebuild() {
  console.log('====================================================');
  console.log('Prebuilding Hadith records index to save cold-start time...');
  const startTime = performance.now();

  const { records, emptyCount } = preprocessAllRawHadiths();

  const outPath = path.join(DATA_DIR, 'prebuilt_hadiths.json');
  fs.writeFileSync(outPath, JSON.stringify(records));

  const elapsed = Math.round(performance.now() - startTime);
  console.log(`Prebuild Completed successfully in ${elapsed}ms!`);
  console.log(`Saved ${records.length} records to ${outPath} (${emptyCount} empty records excluded).`);
  console.log('====================================================');
}

runPrebuild().catch(err => {
  console.error('Prebuild failed:', err);
  process.exit(1);
});
