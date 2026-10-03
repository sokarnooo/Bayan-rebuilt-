# Current State — Bayan Project Handoff

## Done
- **Infrastructure**: Shared Vocabulary matching engine implemented (Integer IDs). Memory footprint reduced (RSS ~339MB), safe for 512MB/1GB tiers.
- **Data Acquisition**: `npm run build` downloads from pinned SHAs:
  - Quran (47ca096): 6,236 Ayat.
  - Hadith (df57907): 34,195 non-empty records across 7 collections.
  - Verification: Count checks pass on every build.
- **Search Logic**:
  - Ayah: Sliding-window containment, range detection, Basmala stripping.
  - Hadith: Isnad/Takhrij stripping, attestation clustering across collections, English translation retrieval.
- **Security**: Secret leak audit passed. `GEMINI_API_KEY` moved to server-side only (no `VITE_` prefix).
- **Evaluation**: 68-case harness written in `eval/cases.json` and `eval/run.ts` (**written, NOT yet run** in this session).
- **UI**: High-fidelity dark theme (Navy/Ice/Turquoise), full RTL support, scholar referral mandatory path.

## In Progress / Not Started
- **Ask Mode**: Plan defined (Question expansion + internal index search). **NOT built**.
- **OCR**: Logic scaffolded, but **not yet tested** with real images.
- **English Ayah Search**: **Not started** (Currently Arabic-only).
- **Documentation**: Final sources/licenses register and MCP server inspection.
- **Live Testing**: 3-5 real user test sessions not performed.

## Decisions & Reasons
- **No Embeddings**: Dropped in favor of integer-based BM25-style search to avoid free-tier quota limits and excessive startup latency.
- **On-demand Reconstruction**: Search index only stores token IDs; full text and grades are fetched from raw corpus only for results (Saves ~100MB RAM).
- **Pinned SHAs**: Switched from `@1` to specific commits to ensure build reproducibility for competition judging.
- **Port 3000**: Forced as default for AI Studio compatibility, but respects `process.env.PORT` for Cloud Run.

## Pending Decisions for Owner
- **RPD Values**: Provide rate limits (Requests Per Day) from AI Studio for the quota guard.
- ** MCP Server**: Confirm if `mcp.islamiccontent.org` should be a blocking requirement.

## Next Steps
1. **Run Evaluation**: Execute `npx tsx eval/run.ts <URL>` and fix any false accepts.
2. **LLM Baseline**: Run `npx tsx eval/baseline_llm.ts` (Requires `GEMINI_API_KEY`).
3. **Build Ask Mode**: Implement search term expansion and the result summary model.
4. **Jamhara English Labels**: Copy approved terms for Sharia concepts.
5. **Final Deliverables**: Video (2 min), PDF deck, and Sources documentation.

## How to Resume
1. `npm ci`
2. Set `GEMINI_API_KEY` as an environment secret.
3. `npm run build` (Downloads data and generates index).
4. `npm run start`
5. Run `eval/run.ts` against the live link.

## Facts Checklist
- **Competition**: Baathel Challenge, Track 04. Submit by Oct 6 23:59 Riyadh.
- **Fabricated Sayings**: 3 entries verified on Dorar (/38, /74, /557).
- **License**: Corpus is Unlicense; translations may have separate terms.
