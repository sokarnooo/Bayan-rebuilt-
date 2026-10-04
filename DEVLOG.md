# DEVLOG.md — Development Log & Verification Register

Project: **بيان (Bayan) — Islamic Knowledge & Scripture Verification Tool**
Goal: Verifiable Quranic verse and Hadith text verification against authentic sources with strict scholar referral.
*Disclaimer: Everything here was run; anything not run is marked unverified.*

---

### 2026-10-04 — Task 1: Highlight Regression Verification & Original Index Mapping [IN PROGRESS]
- **Goal**: Verify single-pass tokenization of original text into display words, mapping non-skipped tokens via `originalIndex` (`matchedOriginalIndices`), UI highlighting without offset recomputation, and harness alignment verification.
- **Change (files)**: `server/matching/hadithMatcher.ts`, `eval/run.ts`, `PROGRESS.md`, `DEVLOG.md`.
- **Why**: Guarantee verbatim scripture rendering, fix 3-word honorific skipping bug in `hadithMatcher.ts`, and enforce in-order LCS alignment in `verifyHighlights` with edit distance <= 1 constraint.
- **Evidence**:
  - Shifted Index Test on `bukhari_13` («لا يؤمن أحدكم حتى يحب لأخيه ما يحب لنفسه»):
    - Normal (exact indices): `true` (PASS)
    - Shift +2: `false` (FAIL - caught correctly)
    - Shift -2: `false` (FAIL - caught correctly)
  - Engine fixes:
    - Fixed 4-token over-skipping bug in `tokenizeDisplayWords` for `رضي الله عنه` (which was improperly skipping the 4th word `عن`). `hadith_nodiacritics_1` now passes (`10/10` in `no_diacritics`).
    - Handled comma-separated multi-ref expectations in `eval/run.ts`.
    - Added permanent reason column to quiet failure output (`id | expected | actual | reason`).
  - Harness Diagnostic Runs (`--concurrency 1`):
    - Initial normal run (rigid positional check): `94/133 (71%)`
    - Run with `--skip-highlight`: `131/133 (98%)`
    - Final tightened in-order LCS run: `131/133 (98%)` (2 remaining failures: `ayah_typo_6` and `hadith_changed_4`).
- **Limits**: Item 1 remains unticked until total reaches >= 132/133 (blocked by `hadith_changed_4` and `ayah_typo_6`).
- **Commit**: `pending`

### 2026-10-04 — Initial Documentation Setup & CLI Harness Flags
- **Goal**: Setup progress tracking (`PROGRESS.md`), judge-facing development log (`DEVLOG.md`), session protocol rules in `AGENTS.md`, and update evaluation harness with CLI flags and per-request duration tracking.
- **Change (files)**: `PROGRESS.md`, `DEVLOG.md`, `AGENTS.md`, `current_state.md`, `eval/run.ts`, `package.json`.
- **Why**: Ensure standard project lifecycle, strict token discipline, session continuation protocols, and harness diagnostic capabilities (`--quiet`, `--runs`, `--concurrency`, `--only`).
- **Evidence**:
  - Executed `./node_modules/.bin/tsx eval/run.ts http://localhost:3000 --quiet --runs 1 --concurrency 8` → completed all test cases with category summaries and per-request durations saved to `eval/results.json`.
  - Executed `npm run build` → compiled server to `dist-server/server.js` (85.3 KB in 20ms) and client to `dist/` (525 KB bundle).
- **Limits**: None.
- **Commit**: `pending`

### 2026-10-03 — In-Memory Sliding-Window Matching Engine & Prebuild Pipeline
- **Goal**: Build deterministic Arabic normalization, integer-indexed 2-gram matching, isnad/takhrij stripping, and lazy-loading corpus index.
- **Change (files)**: `server/matching/normalizer.ts`, `server/matching/hadithMatcher.ts`, `server/matching/ayahMatcher.ts`, `server/corpus/prebuild.ts`, `server/corpus/loader.ts`.
- **Why**: Eliminate LLM hallucination in scripture verification. Guarantee reproducible deterministic matching over primary corpus datasets.
- **Evidence**:
  - Prebuild download and verification against pinned SHAs:
    - `hadith-api` pinned SHA: `df57907be35291c91ad6a6691180e22ca9920784` (34,195 non-empty records indexed across 7 collections: Bukhari 7,580, Muslim 7,360, Abu Dawud 5,272, Tirmidhi 3,924, Nasai 5,679, Ibn Majah 4,338, Nawawi 42).
    - `quran-api` pinned SHA: `47ca096b0976443ba2eab2e45cdf0fb4096a2610` (6,236 ayat loaded).
  - Both upstream datasets are licensed under `The Unlicense` (Public Domain).
  - Health check endpoint `GET /api/health` → returned HTTP 200 with `loadTimeMs: 879ms` and full corpus stats.
- **Limits**: Farsi/Urdu character variants normalizer covers common transcription inputs; rare regional OCR artifacts handled via fuzzy DP alignment.
- **Commit**: `pending`

### 2026-10-03 — Curated Fabricated Sayings Checklist Verification
- **Goal**: Integrate verified fake hadith entries from Dorar.net with exact ruling wording and direct links.
- **Change (files)**: `server/matching/hadithMatcher.ts`.
- **Why**: Enforce Rule 7 (only entries verified on dorar.net/fake-hadith shown with exact ruling wording, without internal tags in UI).
- **Evidence**:
  1. «اطلبوا العلم ولو بالصين» → Ruling: `لا يصح` (`https://dorar.net/fake-hadith/38`)
  2. «حب الوطن من الإيمان» → Ruling: `ليس بحديث` (`https://dorar.net/fake-hadith/74`)
  3. «المعدة بيت الداء، والحمية رأس الدواء» → Ruling: `لا أصل له` (`https://dorar.net/fake-hadith/557`)
- **Limits**: Only user-verified entries from Dorar.net are checked deterministically before index search.
- **Commit**: `pending`

---

## Commit History
GitHub commit history API returned HTTP 404 (private or non-existent remote repository path `sokarnooo/Bayan-rebuilt-`).
