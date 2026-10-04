import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { askQuestion } from '../server/matching/askEngine.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function runAskSuite() {
  const casesPath = path.resolve(__dirname, 'ask_cases.json');
  const cases = JSON.parse(fs.readFileSync(casesPath, 'utf8'));

  console.log(`================================================================================`);
  console.log(`Running Ask Mode Evaluation Suite (${cases.length} cases)`);
  console.log(`Format: question | intent | terms | top 3 retrieved ids | verdict | dropped items | seconds`);
  console.log(`--------------------------------------------------------------------------------`);

  let passed = 0;

  for (let i = 0; i < cases.length; i++) {
    const c = cases[i];
    const t0 = performance.now();
    try {
      const res = await askQuestion({ question: c.question, language: c.language });
      const sec = ((performance.now() - t0) / 1000).toFixed(2);

      const intent = res.category || 'textual';
      const termsStr = (res.searchedTerms || []).slice(0, 4).join(', ');
      const top3Ids = (res.topRetrievedIds || []).slice(0, 3).join(', ') || 'none';
      const verdict = res.isPermissibility
        ? 'permissibility'
        : res.isWeakOnly
        ? 'weak_only'
        : res.verdict;
      const dropped = res.droppedItemsCount || 0;

      // Truncate question for clean table display
      const qShort = c.question.length > 35 ? c.question.slice(0, 32) + '...' : c.question;

      console.log(
        `${qShort.padEnd(35)} | ${intent.padEnd(14)} | [${termsStr.padEnd(20)}] | ${top3Ids.padEnd(26)} | ${verdict.padEnd(13)} | ${String(dropped).padEnd(2)} dropped | ${sec}s`
      );

      passed++;
    } catch (err: any) {
      const sec = ((performance.now() - t0) / 1000).toFixed(2);
      console.log(`${c.question.slice(0, 35)} | ERROR: ${err.message} | ${sec}s`);
    }
  }

  console.log(`--------------------------------------------------------------------------------`);
  console.log(`Ask Suite Execution Completed: ${passed}/${cases.length} cases executed.`);
  console.log(`================================================================================`);
}

runAskSuite().catch(console.error);
