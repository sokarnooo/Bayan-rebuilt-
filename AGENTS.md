# AGENTS.md — Standing Instructions for Bayan

## Project Goal
بيان (Bayan) is a scholarly verification tool for Islamic content (Track 04: knowledge and verification). It allows users to verify Quranic verses and Hadith texts against primary authentic sources, providing deterministic matching with named grader attributions and strict scholar referral for ambiguous cases.

## HARD RULES (Verbatim)
1. Every grade or claim comes from fetched data or the curated list with a real citation, never from model memory.
2. Bukhari, Muslim and Nawawi-40 have no grades in the data: show only «لا تتوفر درجة موثقة في مصدر البيانات» plus a muted line «كتاب معتمد في المرجعية العلمية للتحدي». Never «صحيح» or «إجماع».
3. Confidence and grade are separate. Below 70 show «لم يتم العثور على تطابق موثوق، راجع أهل العلم». The referral path is never removed.
4. Approximate matches are capped at close_match (max 89) and shown amber.
5. Ask the owner before: paid APIs or services, changing dataset sources, removing the referral path.
6. No secrets in the repo, the bundle or git history. Env vars must not start with VITE_.
7. Curated fabricated sayings: only entries the owner verified on dorar.net/fake-hadith, shown with the exact ruling wording and the link; never show internal tags like "user-verified" in the UI.
8. Do not report "100%" unless a run shows it. Do not claim privacy or logging behavior you did not verify.

## Stack & Commands
- **Frontend**: React 18, TypeScript, Vite, Tailwind, Lucide icons.
- **Backend**: Node 20, Express, In-memory integer-based matching engine.
- **Data**: Quran (fawazahmed0/quran-api), Hadith (fawazahmed0/hadith-api).
- **AI**: @google/genai (Gemini 1.5/2.0 Flash) for Ask mode and OCR.
- **Commands**:
  - `npm run dev`: Starts Express server + Vite middleware on port 3000.
  - `npm run build`: Downloads corpus from pinned SHAs and generates gzipped index.
  - `npm run start`: Production server launch.
  - `npx tsx eval/run.ts <URL>`: Executes 68-case evaluation harness.
- **Env Vars**: `GEMINI_API_KEY` (server-side only), `PORT` (assigned by host).
- **Gitignored**: `server/corpus/data/` (raw JSONs and `.gz` index).

## Architecture Map
- `server/server.ts`: Entry point, port handling (3000 default), engine warmup.
- `server/app.ts`: Express routes, API logic, health checks.
- `server/corpus/loader.ts`: Lazy-loading of raw JSON corpus files.
- `server/corpus/prebuild.ts`: Build-time script for data acquisition and verification.
- `server/matching/normalizer.ts`: Core Arabic normalization and sliding-window scoring.
- `server/matching/ayahMatcher.ts`: Quranic verse matching (deterministic).
- `server/matching/hadithMatcher.ts`: Hadith search, isnad stripping, attestation clustering.
- `src/App.tsx`: Main layout, mode navigation, mission banner.
- `src/components/modes/`: Component for each mode (Ayah, Hadith, Ask).
- `eval/cases.json`: 68 labeled test cases with expected states/refs.
- `eval/run.ts`: HTTP-based multi-run evaluation harness.

## Matching Conventions
1. **Normalization**: Whitespace clean -> Farsi folding -> Dagger Alef folding -> Tashkeel/Tatweel strip -> Hamza/Alef variant folding -> Ta-Marbuta folding -> Yeh folding -> Defective/Demonstrative normalization.
2. **Alef Invariant**: Matching form removes all `ا`, `\u0670`, and `ء`.
3. **Scoring**: Exact (1.0), Hamza/Alef swap (1.0), Dagger Alef source approx (0.96), Invariant match without Dagger (0.40 penalty).
4. **Isnad/Takhrij**: Stripped before matching if markers (e.g. «قال رسول الله») found in first 60% of text.
5. **English**: Hadith supports verbatim or content-word fraction search; Ayah is Arabic-only (unverified).
6. **Thresholds**: 70% minimum for any result; < 90% or any approx word = `close_match` (Amber).

## UI Rules
- **Palette**: Navy #12183F, Ice #F2F4FF, Violet #6150EA, Turquoise #2EF2C2 (Authentic only).
- **Fonts**: `Amiri` (Scripture), `IBM Plex Sans Arabic` (UI).
- **Arabic Key Phrases**: «لم يتم العثور على تطابق موثوق، راجع أهل العلم» (Mandatory referral).
- **Forbidden**: No "Ask AI" chat bubbles, no system logs in UI, no unverified grades.

## Working Process
- Investigate code first -> Report proposed changes -> Build -> Test with real terminal output.
- Never claim "100%" or "Ready" without running the evaluation harness.
- Ask owner before adding paid services (Firestore, etc.) or changing datasets.

## Pitfalls
- `VITE_` variables leaking secrets into client bundles.
- Express vs Vite middleware port conflicts (resolved by hardcoding 3000/respecting PORT).
- Memory limits on Cloud Run (resolved by integer-based shared vocabulary index).
- Dagger Alef / Hamza inconsistencies in raw data (resolved by custom normalization).
