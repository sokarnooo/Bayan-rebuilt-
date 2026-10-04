# PROGRESS.md — Bayan Project Progress

## Checklist
[x] 0 docs and eval flags (2026-10-04: Created PROGRESS.md, DEVLOG.md, AGENTS.md Session Protocol, current_state.md, eval/run.ts flags & duration logging)
[ ] 1 Highlight by originalIndex (matchedOriginalIndices); harness checks matchedWords (in progress: verified tokenization & alignment logic; harness updated to flexible token alignment)
[ ] 2 changedWords by word-level alignment (test: «لا تقبل صلاة بغير طهور» vs nasai_139)
[ ] 3 Fix test hadith_isnad_4 (expectation wrong; correct = tirmidhi_2, close_match)
[ ] 4 Speed: per-request time; p95 < 500 ms, max < 2 s
[ ] 5 Memory: production RSS < 400 MB
[ ] 6 List all changes to eval/cases.json
## Next
[ ] 7 Review the import-run edits (ayahMatcher.ts, hadithMatcher.ts, AyahMode.tsx, HadithMode.tsx)
[ ] 8 Ask mode: plan, then build (query expansion, no embeddings)
[ ] 9 OCR test
[ ] 10 Server key and hourly limits (owner supplies RPD values)
[ ] 11 English labels for Sharia terms (Jamhara dictionary, owner supplies)
[ ] 12 README, sources and licenses register, content-and-sources doc
[ ] 13 Final harness run, numbers for the deck
Owner-only: publish (other account), GitHub commits, video, deck, user tests.
