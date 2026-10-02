import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DATA_DIR = path.resolve(__dirname, '../server/corpus/data');

// Load Quran
const arRaw = JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'quran_ar.json'), 'utf8'));
const enRaw = JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'quran_en.json'), 'utf8'));
const infoRaw = JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'quran_info.json'), 'utf8'));

const arVerses = arRaw.quran || arRaw[Object.keys(arRaw)[0]];
const enVerses = enRaw.quran || enRaw[Object.keys(enRaw)[0]];

console.log(`Loaded ${arVerses.length} Arabic verses, ${enVerses.length} English verses.`);
