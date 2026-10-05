# PROGRESS.md — Bayan Project Progress

## Completed (2026-10-04)
- **Finished Items**:
  - Item 0: docs and eval flags (AGENTS.md, DEVLOG.md, current_state.md, PROGRESS.md, eval/run.ts flags `--quiet`, `--runs`, `--concurrency`, `--only`).
  - Item 1: Highlight by originalIndex (`matchedOriginalIndices`), single-pass tokenization, LCS highlight check in eval harness.
  - Item 3: Fix test `hadith_isnad_4` (`tirmidhi_2` close_match).
  - Item 4: Speed & latency optimizations (p50: 71ms, max < 2s, 133/133 pass).
  - Item 5: Production Memory optimization (Idle RSS: **247 MB** < 350 MB, Active RSS after 133 cases: **334 MB** < 400 MB).
  - Item 6: List all changes to `eval/cases.json` recorded in DEVLOG.md.
- **Key Numbers**:
  - Test Suite: **133/133 (100.0%)** pass.
  - Memory: Idle RSS **247 MB**, Active RSS **334 MB** (both well below 350/400 MB targets).
  - Build Bundle: `dist-server/server.js` (96.9 KB).
- **Proposed Next List**:
  - [ ] 7 Review the import-run edits (`ayahMatcher.ts`, `hadithMatcher.ts`, `AyahMode.tsx`, `HadithMode.tsx`)
  - [ ] 8 Ask mode: plan, then build (query expansion, no embeddings)
  - [ ] 2 changedWords by word-level alignment (test: «لا تقبل صلاة بغير طهور» vs nasai_139)
  - [ ] 9 OCR test
  - [ ] 10 Server key and hourly limits (owner supplies RPD values)
  - [ ] 11 English labels for Sharia terms (Jamhara dictionary, owner supplies)
  - [ ] 12 README, sources and licenses register, content-and-sources doc
  - [ ] 13 Final harness run, numbers for the deck

## Checklist
[x] 0 docs and eval flags (2026-10-04: Created PROGRESS.md, DEVLOG.md, AGENTS.md Session Protocol, current_state.md, eval/run.ts flags & duration logging)
[x] 1 Highlight by originalIndex (matchedOriginalIndices); harness checks matchedWords (2026-10-04: 133/133 100% pass; verified display word indices and in-order LCS highlight check)
[x] 3 Fix test hadith_isnad_4 (2026-10-04: Verified tirmidhi_2 close_match expectation; passes cleanly)
[x] 4 Speed: per-request time; p95 < 500 ms, max < 2 s (2026-10-04: Optimized sliding window sum from O(Q*S) to O(Q+S), added O(1) map lookups, optimized Levenshtein checks, and flattened DP allocations; 133/133 100% pass)
[x] 5 Memory: production RSS < 400 MB (2026-10-04: Production Idle RSS 247 MB < 350 MB, Active RSS after 133 cases 334 MB < 400 MB; 133/133 pass)
[x] 6 List all changes to eval/cases.json (2026-10-04: Documented hadith_isnad_4 update in DEVLOG.md)

## Next
[ ] 7 Review the import-run edits (ayahMatcher.ts, hadithMatcher.ts, AyahMode.tsx, HadithMode.tsx)
[x] 8 Ask mode: ranking fixes part 3 (2026-10-04: Fixed Hadith drowning via separate top-5 Hadith and top-3 Ayat lists, IDF rare term weighting, WEAK_TERMS filter for numbers/meta words, cross-language search with Ayah 4:3 returned and 35:1 excluded, densest cluster 25-word quotes, 133/133 core tests pass)
[ ] 2 changedWords by word-level alignment (test: «لا تقبل صلاة بغير طهور» vs nasai_139)
[ ] 9 OCR test
[ ] 10 Server key and hourly limits (owner supplies RPD values)
[ ] 11 English labels for Sharia terms (Jamhara dictionary, owner supplies)
[ ] 12 README, sources and licenses register, content-and-sources doc
[ ] 13 Final harness run, numbers for the deck
Owner-only: publish (other account), GitHub commits, video, deck, user tests.
