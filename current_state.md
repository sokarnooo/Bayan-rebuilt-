# Current Project State - Bayan (بيان)

## Status
- **Core Engine**: Fully operational with deterministic Arabic normalization, sliding-window scoring, and isnad/takhrij stripping.
- **Hadith & Ayah Matching**: Sub-sequence alignment tokenizer with exact word matching, approximate word matching, punctuation/format stripping, and precise `matchedWords` highlighting.
- **Evaluation Harness**: 68+ test cases evaluated with automated highlight validation enforcing exact substring/alignment match rules.
- **Build & Server**: React 18 SPA + Vite + Node 20 Express backend running successfully on port 3000.
