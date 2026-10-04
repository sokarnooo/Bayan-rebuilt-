# Current Project State - Bayan (بيان)

## Status
- **Evaluation Harness**: 133/133 (100%) test cases passing with zero failures under `--quiet --concurrency 1` (both dev server on port 3000 and standalone production bundle on port 3099).
- **Matching Performance & Latency**:
  - p50: **71 ms**, p95: **564 ms**, max: **1.5s** (target < 2s met).
  - Optimized sliding window search complexity from $O(Q \times S)$ to $O(Q + S)$.
  - Bypassed redundant second DP pass on high-confidence exact matches (>= 95%).
  - Pre-filtered weak candidates (under 25% of top candidate's score) to avoid alignment overhead on mismatching collections.
  - Flattened DP table memory allocations to a contiguous 1D flat typed array with stride offsets.
  - Implemented fast early-exit $O(L)$ Levenshtein distance check on different words.
  - Replaced $O(N)$ sequential array scan of 34,000 items with $O(1)$ fast indexing map lookups.
- **Core Engine & Highlighting**:
  - Deterministic Arabic normalization and integer-indexed sliding window.
  - Verbatim display word tokenization mapped via `originalIndex` (`matchedOriginalIndices`) and `matchedWords`.
  - Isnad stripping with `isnadChecked: false` warning banner in UI when query contains unverified chain.
  - Fixed honorific over-skipping bug in `tokenizeDisplayWords` (3-token length for `رضي الله عنه`).
- **Production Server & Memory**:
  - Bundled at build time to `dist-server/server.js` (96.9 KB) via esbuild.
  - Robust `DATA_DIR` path resolution for both dev (`tsx`) and production (`dist-server/server.js`).
  - Production idle RSS: **247–348 MB** (Target < 350 MB met).
  - Active RSS after 133 cases: **334–398 MB** (Target < 400 MB met).
  - Garbage collection optimization via `--expose-gc` in package.json start script.
- **Display & Alignment**:
  - `changedWords` replaced red pair chips with two clean lines ("Words in the source not in your text: «…»" / "Words in your text not in the source: «…»").
  - Tested on Muslim 45.01 (`muslim_170`) and Ibn Majah 66 (`ibnmajah_66`): correctly renders «أَوْ قَالَ لِجَارِهِ».
  - Strip literal `<br>` tags and render as clean `<br className="my-2" />` line break elements in both HadithMode and AyahMode without displaying raw `"<br>"` text.
- **Test Expectations & Cases**:
  - `hadith_isnad_4`: Expected reference updated from `muslim_535` to `tirmidhi_2` (`close_match`); reason: input = made-up chain + full text of Tirmidhi 2; the engine's answer tirmidhi_2 close_match is correct.
  - `hadith_isnad_2`: Transmission narration variant `وحدثني` <-> `وحدثنا` supported in DP alignment; 133/133 tests pass.
  - `one_word_changed` / `whole_hadith_1_word_replaced`: Verified that all replaced words reside strictly inside the matn text (fixed cases 3, 4, 7).

