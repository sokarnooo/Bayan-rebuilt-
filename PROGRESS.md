# PROGRESS.md — Bayan Project Progress

## Checklist
[x] 0 docs and eval flags (2026-10-04: Created PROGRESS.md, DEVLOG.md, AGENTS.md Session Protocol, current_state.md, eval/run.ts flags & duration logging)
[x] 1 Highlight by originalIndex (matchedOriginalIndices); harness checks matchedWords (2026-10-04: 133/133 100% pass; verified display word indices and in-order LCS highlight check)
[x] 3 Fix test hadith_isnad_4 (2026-10-04: Verified tirmidhi_2 close_match expectation; passes cleanly)
[ ] 4 Speed: per-request time; p95 < 500 ms, max < 2 s
[x] 5 Memory: production RSS < 400 MB (2026-10-04: Idle RSS 251 MB < 350 MB target, Active RSS after 133 cases 337 MB < 400 MB target; 133/133 100% pass)
[ ] 6 List all changes to eval/cases.json
## Next
[ ] 7 Review the import-run edits (ayahMatcher.ts, hadithMatcher.ts, AyahMode.tsx, HadithMode.tsx)
[ ] 8 Ask mode: plan, then build (query expansion, no embeddings)
[ ] 2 changedWords by word-level alignment (test: «لا تقبل صلاة بغير طهور» vs nasai_139)
[ ] 9 OCR test
[ ] 10 Server key and hourly limits (owner supplies RPD values)
[ ] 11 English labels for Sharia terms (Jamhara dictionary, owner supplies)
[ ] 12 README, sources and licenses register, content-and-sources doc
[ ] 13 Final harness run, numbers for the deck
Owner-only: publish (other account), GitHub commits, video, deck, user tests.
