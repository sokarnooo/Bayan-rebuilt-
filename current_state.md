# Current Project State - Bayan (بيان)

## Interrupted work
The last session was cut by quota while investigating tasks 1-6; no code edits after the import; the import run auto-edited 4 files unreviewed; `hadith_isnad_4`'s expectation is wrong (input = made-up chain + full Tirmidhi 2 text; correct answer `tirmidhi_2` `close_match`; `muslim_535` is unrelated; the Muslim counterpart is 577); `changedWords` currently pairs by position.

## Status
- **Core Engine**: Fully operational with deterministic Arabic normalization, sliding-window scoring, and isnad/takhrij stripping.
- **Hadith & Ayah Matching**: Sub-sequence alignment tokenizer with exact word matching, approximate word matching, punctuation/format stripping, and precise `matchedWords` highlighting.
- **Evaluation Harness**: 68+ test cases evaluated with automated highlight validation enforcing exact substring/alignment match rules.
- **Build & Server**: React 18 SPA + Vite + Node 20 Express backend running successfully on port 3000.
