# PROGRESS.md — Bayan Project Progress

## Completed (2026-10-06) — Part 11
- **Finished**: Ask-mode relevance + adversarial safety. Verdict gate is now deterministic claim attestation (no topic list, no model memory); rarity is IDF-based; the harness's dead `requireTopRetrievedMatch` check was wired up.
- **Key Numbers**: harness **177/181 (98%)** (baseline 157/181 = 87%); **core 133/133 (100%)** unchanged; `ask_adversarial` **20/20 with 0 `supported`** (baseline 8/20 with 12 false positives); `ask_relevance` 24/28; **10/10 true-positive questions `supported`**; lint clean.
- **Proposed next list**: remove the hardcoded doc-id bonuses in `getConceptPairBonus`/`getPhraseMatchBonus` and the 12-cluster list in `countDistinctMatchedConcepts`, replacing both with real IDF scoring; owner decision needed on the 2 test-wrong `muslim_224` references (cases.json must not be edited by the agent).

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
[x] 7 Review the import-run edits (2026-10-05: Verified GitHub import migration in AI Studio runtime; npm build, prebuild corpus acquisition, dev server on 0.0.0.0:3000, 133/133 evaluation harness tests 100% passing)

## Next
[x] 8 Ask mode: retrieval speed, ranking order & false-positive gating (Part 6, 8, 9) (2026-10-05: Unified score sorting with <=0.5 tie-break, relevance gate matches >=2 distinct content concepts or >=60% top score, Ghaylan hadith surfaced at #1/#2 in Tirmidhi 1128 and Ibn Majah 1953, 20 adversarial false-positive cases pass 20/20 with 0 false-positive 'supported' verdicts. Core 133/133 pass 100%.)
[ ] 2 changedWords by word-level alignment (test: «لا تقبل صلاة بغير طهور» vs nasai_139)
[ ] 9 OCR test (2026-10-06: End-to-end OCR verified HTTP 200 with exact text «إنما الأعمال بالنيات» from a real rendered Arabic JPEG, served by gemini-3.5-flash-lite on both server-key and BYOK paths; item left open only for the in-app UI pass)
[x] 14 Swap AI models to the owner-pinned pool (2026-10-06: MODEL_CONFIGS reduced to exactly gemini-3.5-flash-lite / gemini-3.1-flash-lite / gemma-4-31b-it; all three ACTION_CHAINS set to the same order; BYOK branch and Ask attempt-0/1 failover realigned; zero dead model ids left in code; OCR 500 root cause fixed (chain no longer falls through to 404 gemini-1.5-flash); lint clean; harness 157/181 with core 133/133 identical to baseline)
[x] Part 11 Ask-mode relevance & adversarial safety (2026-10-06: replaced the hardcoded 12-cluster verdict gate in deriveDeterministicVerdict with a deterministic two-signal claim attestation - frame-stripped bag coverage >=0.70 AND alignWordsDP alignment coverage >=0.50 over the best single card; rarity now by index document frequency (IDF <=0.75% of 40,431 docs) instead of token length; eval/run.ts now forwards topRetrievedIds so requireTopRetrievedMatch can actually run. Harness 157/181 -> 177/181 (98%), core gate 133/133 untouched, ask_adversarial 8/20 -> 20/20 with 0 'supported', all 10 true-positive questions 'supported'. Remaining 4 failures: 2 are a documented test-wrong reference (muslim_224 is a «بمثله» stub in the pinned corpus; the matn lives at bukhari_6954/abudawud_60) and 2 are green-tea STATE moves from 'unclear' to the equally non-supported 'permissibility' caused by the IDF change - both trade-offs recorded in DEVLOG.md)
[x] 10 Server key and hourly limits (Part 10) (2026-10-05: Implemented server/quota.config.ts with 24 Pacific clock hour buckets, SAFETY=0.8, failover chains, per-IP cap max(2, 20% total budget), priority degradation on Ask, /api/ocr and /api/quota endpoints, remaining-requests UI badges, and verified zero key leaks in /dist)
[ ] 11 English labels for Sharia terms (Jamhara dictionary, owner supplies)
[ ] 12 README, sources and licenses register, content-and-sources doc
[ ] 13 Final harness run, numbers for the deck
Owner-only: publish (other account), GitHub commits, video, deck, user tests.
