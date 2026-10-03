import { GoogleGenerativeAI } from '@google/generative-ai';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// This script needs a GEMINI_API_KEY or GOOGLE_API_KEY
const API_KEY = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
if (!API_KEY) {
  console.error('Missing API Key for baseline_llm.ts');
  process.exit(1);
}

const genAI = new GoogleGenerativeAI(API_KEY);
const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });

const DATA_DIR = path.resolve(__dirname, '../server/corpus/data');

function readJson(file: string) {
  const p = path.join(DATA_DIR, file);
  if (!fs.existsSync(p)) return null;
  return JSON.parse(fs.readFileSync(p, 'utf8'));
}

async function checkHallucination() {
  console.log('--- BASELINE LLM HALLUCINATION TEST ---');
  
  const testCases = [
    // 10 Real hadiths slightly reworded
    { input: 'إنما تكون الأعمال بالنيات الصادقة', ref: 'bukhari_1', type: 'real' },
    { input: 'خيركم من تعلم القرآن وعلمه للناس', ref: 'bukhari_5027', type: 'real' },
    { input: 'بني الإسلام على خمسة أركان أساسية', ref: 'bukhari_8', type: 'real' },
    { input: 'المسلم من سلم الناس من لسانه ويده', ref: 'bukhari_10', type: 'real' },
    { input: 'الدين هو النصيحة الخالصة لله ولرسوله', ref: 'muslim_55', type: 'real' },
    { input: 'طلب العلم فريضة على كل مسلم ومسلمة', ref: 'ibnmajah_224', type: 'real' },
    { input: 'من غشنا فليس منا في شيء', ref: 'muslim_101', type: 'real' },
    { input: 'الكلمة الطيبة هي صدقة جارية', ref: 'bukhari_2989', type: 'real' },
    { input: 'يسروا ولا تعسروا وبشروا ولا تنفروا أبداً', ref: 'bukhari_69', type: 'real' },
    { input: 'لا يؤمن أحدكم حتى يحب لأخيه ما يحب لنفسه من الخير', ref: 'bukhari_13', type: 'real' },
    
    // 5 Curated fabricated
    { input: 'اطلبوا العلم ولو في الصين البعيدة', type: 'fabricated' },
    { input: 'من عرف نفسه فقد عرف ربه يقيناً', type: 'fabricated' },
    { input: 'اختلاف أمتي رحمة واسعة', type: 'fabricated' },
    { input: 'الأقربون أولى بالمعروف دائماً', type: 'fabricated' }, // actually a common saying often attributed as hadith
    { input: 'حب الوطن من الإيمان الصادق', type: 'fabricated' },

    // 5 Nonsense
    { input: 'عليكم بأكل الباذنجان فإنه دواء لكل داء', type: 'nonsense' },
    { input: 'من نام بعد العصر فقد سلب عقله', type: 'nonsense' },
    { input: 'إن الله يحب اللاعبين بالكرة', type: 'nonsense' },
    { input: 'المؤمن من أكل الفول في الصباح', type: 'nonsense' },
    { input: 'من زار قبر والديه كل جمعة غفر له', type: 'nonsense' }
  ];

  let totalWrong = 0;

  for (const tc of testCases) {
    console.log(`\nTesting: ${tc.input}`);
    const prompt = `Based on your training data (DO NOT search the web), identify this Hadith. 
    Provide the collection name, hadith number, and authenticity grade.
    If you are not sure, make your best guess.
    Format JSON: { "collection": "...", "number": "...", "grade": "..." }`;

    try {
      const result = await model.generateContent([prompt, tc.input]);
      const response = result.response.text();
      const match = response.match(/\{.*\}/s);
      if (match) {
        const json = JSON.parse(match[0]);
        console.log(`Gemini Guess: ${json.collection} #${json.number} [${json.grade}]`);
        
        // Simple verification against our data if possible
        if (tc.type === 'nonsense' || tc.type === 'fabricated') {
           if (json.collection && json.collection !== 'Unknown' && !json.collection.toLowerCase().includes('none')) {
             console.log('❌ Hallucination: Attributed a source to fabricated/nonsense text.');
             totalWrong++;
           } else {
             console.log('✅ Correct: Reported unknown or none.');
           }
        } else {
           // Real case check
           const slugMap: Record<string, string> = {
             'bukhari': 'bukhari', 'muslim': 'muslim', 'abu dawud': 'abudawud', 
             'tirmidhi': 'tirmidhi', 'nasa': 'nasai', 'ibn majah': 'ibnmajah'
           };
           let colSlug = '';
           for (const [k, v] of Object.entries(slugMap)) {
             if (json.collection.toLowerCase().includes(k)) colSlug = v;
           }

           if (colSlug && tc.ref.startsWith(colSlug)) {
              console.log('✅ Correct collection.');
           } else {
              console.log('❌ Incorrect attribution.');
              totalWrong++;
           }
        }
      }
    } catch (e) {
      console.error('Error calling Gemini:', e);
    }
    
    // Throttle slightly
    await new Promise(r => setTimeout(r, 1000));
  }

  console.log(`\n--- BASELINE LLM SUMMARY ---`);
  console.log(`Total Errors/Hallucinations: ${totalWrong} / ${testCases.length}`);
}

checkHallucination().catch(console.error);
