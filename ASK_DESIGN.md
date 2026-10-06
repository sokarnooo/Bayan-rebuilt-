# ASK_DESIGN.md — Design Specification for Ask Mode (اسأل)

## 1. Endpoint & Authentication
- `POST /api/ask` payload: `{ "question": string, "language"?: "ar" | "en" }`.
- Server-side only key: `process.env.GEMINI_API_KEY` (never exposed to client). Models (owner-pinned, live-verified): `gemini-3.5-flash-lite`, `gemini-3.1-flash-lite`, `gemma-4-31b-it` (failover order, identical for OCR and both Ask calls).

## 2. Gemini Call 1 — Classification & Search Term Expansion (Temp: 0, Response: JSON)
**System Prompt 1:**
```
You are a scholarly search term expander for Quran and Hadith corpora. Analyze the user's question.
1. Classify the intent into one of: "textual" (asking if a specific hadith/verse exists or what text says), "permissibility" (halal/haram/ruling question), "personal" (asking for personal fatwa/counsel), or "other".
2. Extract the core semantic query and generate expanded search keywords in both Arabic and English, including morphological stems and classical synonyms.
Output STRICT JSON:
{"category":"textual"|"permissibility"|"personal"|"other","primary_ar":["term1","term2"],"synonyms_ar":["syn1","syn2"],"terms_en":["term1","term2"],"is_ruling_question":boolean}
```

## 3. Deterministic Retrieval Engine (No Embeddings)
- **Index**: Word-level inverted index over integer vocabulary of Quran (6,236 ayat) and 7 Hadith collections (34,195 records).
- **Tokenization**: Light Arabic prefix stripping (`ال`, `و`, `ب`, `ل`, `ف`) and Alef/Hamza folding.
- **Scoring**: $Score(D) = \sum_{t \in Q \cap D} IDF(t) \times TF(t, D)$. Filter: requires $\ge 2$ matched terms or 1 rare term ($IDF > 6.0$).
- **Selection**: Top 8 Hadith records + Top 5 Quran ayat matching question language (Arabic or English).

## 4. Gemini Call 2 — Grounded Synthesis from Retrieved Texts (Temp: 0, Response: JSON)
**System Prompt 2:**
```
You are an evidence verifier for Islamic scripture. You MUST answer STRICTLY and ONLY using the provided retrieved texts. Never use external memory or extrapolate rulings.
- If the retrieved texts directly mention or affirm the premise: verdict is "supported".
- If the retrieved texts explicitly state the opposite: verdict is "contradicted".
- If the retrieved texts do not contain enough direct textual evidence: verdict MUST be "unclear".
- For each citation item: "id" MUST match the source item ID exactly, "quote" MUST be a verbatim continuous Arabic/English substring copied from that source, and "role" MUST be "supports" or "refutes".
Output STRICT JSON:
{"verdict":"supported"|"contradicted"|"unclear","summary":"One factual sentence in Arabic summarizing what the texts say","items":[{"id":"string","quote":"string","role":"supports"|"refutes"}]}
```

## 5. Code-Side Grounding & Deterministic Verification
- **ID & Quote Validation**: Every `item.id` must exist in retrieved set; `item.quote` must be an exact substring of the source text after normalization. Any invalid quote is dropped.
- **Verdict Guard**: If valid supporting items count is 0 $\rightarrow$ force `verdict = "unclear"`.
- **Confidence Computation**: Computed deterministically in code from source match overlap ratio ($C \in [70, 100]$), never model-generated.

## 6. Scholarly Safeguards & Rule Enforcement
- **Permissibility (`category === "permissibility"`)**: Suppress LLM ruling verdict. Show matching texts only + banner: «هذا سؤال في الحكم الشرعي؛ نعرض النصوص فقط، والفتوى لأهل العلم».
- **Personal Cases**: Display objective matching texts + mandatory scholar referral panel.
- **Curated Fabricated Matches**: Intercepted deterministically against Dorar.net verified list $\rightarrow$ `verdict = "contradicted"` + Dorar citation.

## 7. UI & Interaction Specification
- **Verdict Badge**: Turquoise (`#2EF2C2`) for Supported, Amber for Unclear/Referral, Red for Contradicted/Fabricated.
- **Search Scope**: Pill list displaying "الكلمات المفتاحية المبحوثة: [مصطلح 1، مصطلح 2]".
- **Synthesis Summary**: One-line box labeled «ملخص آلي — المصدر هو النص أدناه».
- **Evidence Cards**: Reuses scripture cards (Amiri font, full takhrij, grader citations, Bukhari/Muslim neutral disclaimer).
- **Referral & Error States**: Explicit «لم يتم العثور على دليل موثق، راجع أهل العلم» for unclear; plain-language alerts for 429 quota limits. In-memory LRU cache keyed by normalized query.

## 8. Benchmark Evaluation Suite (12 Cases)
1. `ask_ar_supp_1`: «هل صيام ستة أيام من شوال مستحب؟» $\rightarrow$ `supported` (`muslim_1164`)
2. `ask_ar_supp_2`: «ما فضل قراءة آية الكرسي دبر الصلاة؟» $\rightarrow$ `supported` (`nasai_9848`)
3. `ask_ar_supp_3`: «هل تبسمك في وجه أخيك صدقة؟» $\rightarrow$ `supported` (`tirmidhi_1956`)
4. `ask_en_supp_1`: "Does smiling at your brother count as charity?" $\rightarrow$ `supported` (`tirmidhi_1956`)
5. `ask_en_supp_2`: "Is actions judged by intentions in Islam?" $\rightarrow$ `supported` (`bukhari_1`)
6. `ask_synonym_1`: «هل الابتسام في وجه الصاحب مثوبة؟» $\rightarrow$ `supported` (`tirmidhi_1956` via synonym expansion)
7. `ask_synonym_2`: «ما حكم إفشاء السلام وبذل الطعام؟» $\rightarrow$ `supported` (`bukhari_12` / `muslim_39`)
8. `ask_fabricated_1`: «هل ورد حديث: اطلبوا العلم ولو بالصين؟» $\rightarrow$ `contradicted` (Dorar entry 38)
9. `ask_fabricated_2`: «هل حب الوطن من الإيمان حديث نبوي؟» $\rightarrow$ `contradicted` (Dorar entry 74)
10. `ask_nosource_1`: «هل شرب الشاي الأخضر في الصباح سنة مؤكدة؟» $\rightarrow$ `unclear` (No authentic source)
11. `ask_nosource_2`: «هل ركوب الدراجة الهوائية قبل الفجر يوجب مائة حسنة؟» $\rightarrow$ `unclear` (No authentic source)
12. `ask_permissibility_1`: «ما حكم بيع التقسيط بفائدة محددة مسبقا؟» $\rightarrow$ `permissibility` (Texts only, scholar banner)
