# Current Project State - Bayan (بيان)

## Status
- **Evaluation Harness**: 133/133 (100%) test cases passing with zero failures under `--quiet --concurrency 1` (both dev server on port 3000 and standalone production bundle on port 3099).
- **Core Engine & Highlighting**:
  - Deterministic Arabic normalization and integer-indexed sliding window.
  - Verbatim display word tokenization mapped via `originalIndex` (`matchedOriginalIndices`) and `matchedWords`.
  - Isnad stripping with `isnadChecked: false` warning banner in UI when query contains unverified chain.
  - Fixed honorific over-skipping bug in `tokenizeDisplayWords` (3-token length for `رضي الله عنه`).
- **Production Server & Memory**:
  - Bundled at build time to `dist-server/server.js` (93.8 KB) via esbuild.
  - Production idle RSS: **251 MB** (Target < 350 MB met).
  - Active RSS after 133 cases: **337 MB** (Target < 400 MB met).
  - Garbage collection optimization via `--expose-gc` in package.json start script.
- **Display & Alignment**:
  - `changedWords` replaced red pair chips with two clean lines ("Words in the source not in your text: «…»" / "Words in your text not in the source: «…»").
  - Strip literal `<br>` tags and render as clean line breaks in Hadith and Ayah text views.
- **Test Expectations**: `hadith_isnad_4` verified against `tirmidhi_2` `close_match`.

