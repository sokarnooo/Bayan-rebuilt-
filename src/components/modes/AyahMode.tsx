import React, { useState } from 'react';
import type { InterfaceLanguage } from '../../types';
import { OcrButton } from '../common/OcrButton';
import {
  Search,
  BookOpen,
  CheckCircle2,
  AlertCircle,
  AlertTriangle,
  ChevronDown,
  ChevronUp,
  Sparkles,
  ExternalLink,
} from 'lucide-react';

interface AyahModeProps {
  language: InterfaceLanguage;
}

interface AyahResult {
  chapter: number;
  verse: number;
  surah: {
    arabic: string;
    english: string;
    revelation: string;
  };
  text: string;
  translation: string;
  confidence: number;
  state: 'matched' | 'close_match';
  matchedSlice?: string;
}

interface SearchResponse {
  query: string;
  normalizedQuery: string;
  state: 'matched' | 'close_match' | 'not_found';
  topConfidence: number;
  totalMatches: number;
  results: AyahResult[];
  referralRequired: boolean;
  referralMessage?: string;
  executionTimeMs: number;
}

export const AyahMode: React.FC<AyahModeProps> = ({ language }) => {
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [searchResponse, setSearchResponse] = useState<SearchResponse | null>(null);
  const [expandedAll, setExpandedAll] = useState(false);
  const [tafsirLoading, setTafsirLoading] = useState<Record<string, boolean>>({});
  const [tafsirData, setTafsirData] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);

  const isAr = language === 'ar';

  const handleSearch = async (textToSearch?: string) => {
    const q = (textToSearch ?? query).trim();
    if (!q) return;

    setLoading(true);
    setError(null);
    setExpandedAll(false);

    try {
      const res = await fetch('/api/ayah/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: q }),
      });

      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }

      const data: SearchResponse = await res.json();
      setSearchResponse(data);
    } catch (err: any) {
      setError(err.message || 'Error executing search');
    } finally {
      setLoading(false);
    }
  };

  const fetchTafsir = async (chapter: number, verse: number) => {
    const key = `${chapter}:${verse}`;
    if (tafsirData[key]) {
      // Toggle off by removing or keeping
      return;
    }

    setTafsirLoading((prev) => ({ ...prev, [key]: true }));

    try {
      // Quran.com API v4 for Al-Muyassar (King Fahd Complex tafsir id = 16)
      const res = await fetch(
        `https://api.quran.com/api/v4/quran/tafsirs/16?verse_key=${chapter}:${verse}`
      );
      if (res.ok) {
        const json = await res.json();
        const rawText = json.tafsirs?.[0]?.text || '';
        // Strip any HTML tags
        const cleanText = rawText.replace(/<[^>]*>?/gm, '');
        setTafsirData((prev) => ({
          ...prev,
          [key]: cleanText || (isAr ? 'لا يتوفر نص التفسير حالياً.' : 'Tafsir unavailable.'),
        }));
      } else {
        setTafsirData((prev) => ({
          ...prev,
          [key]: isAr ? 'التفسير الميسر (مجمع الملك فهد لطباعة المصحف الشريف)' : 'Tafsir Al-Muyassar (King Fahd Complex)',
        }));
      }
    } catch (e) {
      setTafsirData((prev) => ({
        ...prev,
        [key]: isAr ? 'تعذر جلب التفسير من المصدر حالياً.' : 'Unable to fetch tafsir at this moment.',
      }));
    } finally {
      setTafsirLoading((prev) => ({ ...prev, [key]: false }));
    }
  };

  const quickSamples = [
    'فبأي آلاء ربكما تكذبان',
    'الله لا اله الا هو الحي القيوم',
    'ولا تساموا ان تكتبوه صغيرا او كبيرا الى اجله',
    'من جد وجد ومن زرع حصد',
  ];

  const resultsToShow =
    searchResponse?.results && !expandedAll && searchResponse.results.length > 5
      ? searchResponse.results.slice(0, 5)
      : searchResponse?.results || [];

  return (
    <div className="space-y-6">
      {/* Search Input Box with embedded OCR */}
      <div className="rounded-xl bg-[#12183F] border border-[#6150EA]/30 p-4 shadow-xl focus-within:border-[#2EF2C2]/60 transition">
        <div className="flex items-center justify-between mb-2">
          <label className="text-sm font-medium text-[#F2F4FF]/90">
            {isAr ? 'نص الآية الكريمة أو جزء منها:' : 'Verse text or partial quote:'}
          </label>
          <OcrButton
            language={language}
            onTextExtracted={(extractedText) => {
              setQuery(extractedText);
              handleSearch(extractedText);
            }}
          />
        </div>

        <div className="relative">
          <textarea
            rows={3}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                handleSearch();
              }
            }}
            dir="rtl"
            lang="ar"
            placeholder={
              isAr
                ? 'اكتب أو الصق نص الآية هنا (يقبل الأخطاء الإملائية والاقتباسات الجزئية)...'
                : 'Type or paste Quranic text here (tolerates typos and partial verses)...'
            }
            className="w-full bg-[#12183F]/70 border border-[#6150EA]/20 rounded-lg p-3 text-[#F2F4FF] placeholder-[#F2F4FF]/30 focus:outline-none focus:border-[#2EF2C2]/70 font-serif text-xl leading-relaxed resize-y"
          />
        </div>

        {/* Quick sample chips */}
        <div className="mt-2.5 flex flex-wrap items-center gap-2">
          <span className="text-xs text-[#F2F4FF]/40">{isAr ? 'نماذج للتجربة:' : 'Sample queries:'}</span>
          {quickSamples.map((sample, idx) => (
            <button
              key={idx}
              type="button"
              onClick={() => {
                setQuery(sample);
                handleSearch(sample);
              }}
              className="text-xs px-2.5 py-1 rounded bg-[#6150EA]/15 hover:bg-[#6150EA]/30 text-[#F2F4FF]/80 hover:text-[#2EF2C2] border border-[#6150EA]/30 transition"
            >
              {sample}
            </button>
          ))}
        </div>

        <div className="mt-4 flex items-center justify-between pt-3 border-t border-[#6150EA]/15">
          <p className="text-xs text-[#F2F4FF]/50">
            {isAr
              ? 'مطابقة حتمية عبر مصحف مجمع الملك فهد (عاصم - حفص) مع التفسير الميسر.'
              : 'Deterministic matching against King Fahd Complex with Al-Muyassar tafsir.'}
          </p>
          <button
            type="button"
            onClick={() => handleSearch()}
            disabled={!query.trim() || loading}
            className="inline-flex items-center gap-2 px-6 py-2 rounded-lg bg-[#6150EA] hover:bg-[#6150EA]/90 text-[#F2F4FF] font-medium text-sm transition disabled:opacity-40 disabled:cursor-not-allowed shadow-md"
          >
            {loading ? (
              <div className="w-4 h-4 border-2 border-[#F2F4FF] border-t-transparent rounded-full animate-spin" />
            ) : (
              <Search className="w-4 h-4 text-[#2EF2C2]" />
            )}
            <span>{isAr ? 'تحقق من الآية' : 'Verify Verse'}</span>
          </button>
        </div>
      </div>

      {error && (
        <div className="p-4 rounded-xl bg-red-900/30 border border-red-500/50 text-red-200 text-sm flex items-center gap-3">
          <AlertCircle className="w-5 h-5 text-red-400 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Results Section */}
      {searchResponse && (
        <div className="space-y-4">
          {/* Header Summary Bar */}
          <div className="flex flex-wrap items-center justify-between gap-3 p-3.5 rounded-xl bg-[#12183F] border border-[#6150EA]/20">
            <div className="flex items-center gap-3">
              {searchResponse.state === 'matched' ? (
                <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#2EF2C2]/15 border border-[#2EF2C2]/40 text-[#2EF2C2] text-xs font-bold">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  <span>{isAr ? 'تطابق مؤكد' : 'Authentic Match'}</span>
                </div>
              ) : searchResponse.state === 'close_match' ? (
                <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#6150EA]/20 border border-[#6150EA]/50 text-[#F2F4FF] text-xs font-semibold">
                  <Sparkles className="w-3.5 h-3.5 text-[#6150EA]" />
                  <span>{isAr ? 'تطابق تقريبي / مقطع' : 'Close / Partial Match'}</span>
                </div>
              ) : (
                <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-red-500/20 border border-red-500/40 text-red-300 text-xs font-bold">
                  <AlertTriangle className="w-3.5 h-3.5" />
                  <span>{isAr ? 'غير موجود في القرآن' : 'Not Found in Quran'}</span>
                </div>
              )}

              <span className="text-xs text-[#F2F4FF]/70">
                {isAr
                  ? `نسبة المطابقة: ${searchResponse.topConfidence}%`
                  : `Match Confidence: ${searchResponse.topConfidence}%`}
              </span>
            </div>

            <div className="flex items-center gap-3 text-xs text-[#F2F4FF]/50">
              <span>
                {isAr
                  ? `عدد النتائج: ${searchResponse.totalMatches}`
                  : `Matches found: ${searchResponse.totalMatches}`}
              </span>
              <span>•</span>
              <span>{searchResponse.executionTimeMs} ms</span>
            </div>
          </div>

          {/* Scholar Referral Panel when not found or below 70% confidence */}
          {(searchResponse.referralRequired || searchResponse.state === 'not_found') && (
            <div className="p-6 rounded-2xl bg-amber-950/25 border-2 border-amber-500/40 text-amber-100 flex flex-col sm:flex-row items-start gap-4">
              <div className="p-3 rounded-xl bg-amber-500/15 border border-amber-500/30 shrink-0 text-amber-400">
                <AlertTriangle className="w-6 h-6" />
              </div>
              <div className="space-y-1.5 flex-1">
                <h3 className="text-base font-bold text-amber-300">
                  {searchResponse.referralMessage ||
                    (isAr
                      ? 'لم يتم العثور على تطابق موثوق، راجع أهل العلم'
                      : 'No reliable match found, please consult scholars')}
                </h3>
                <p className="text-sm text-amber-200/80 leading-relaxed">
                  {isAr
                    ? 'النص المدخل لم يُطابق أياً من آيات القرآن الكريم بدرجة يقين كافية. تحرّياً للدقة الشرعية ودرءاً للقول بغير علم، لا يُجزم بنسبة هذا النص للقرآن الكريم ويُحال أمره للرجوع المباشر للمصادر المعتمدة أو سؤال أهل الاختصاص.'
                    : 'The entered text did not reliably match any verse in the Quran. Out of scholarly rigor and preventing unverified attribution, no speculative guess is made.'}
                </p>
              </div>
            </div>
          )}

          {/* Matched Ayah Cards */}
          {resultsToShow.map((item, idx) => {
            const verseKey = `${item.chapter}:${item.verse}`;
            const isTafsirOpen = !!tafsirData[verseKey];
            const isTafsirBusy = !!tafsirLoading[verseKey];

            return (
              <div
                key={idx}
                className="rounded-2xl bg-[#12183F] border border-[#6150EA]/30 overflow-hidden shadow-lg hover:border-[#2EF2C2]/40 transition"
              >
                {/* Ayah Card Header */}
                <div className="px-5 py-3 bg-[#6150EA]/10 border-b border-[#6150EA]/20 flex items-center justify-between gap-3 text-xs">
                  <div className="flex items-center gap-2 font-medium text-[#F2F4FF]">
                    <span className="px-2.5 py-0.5 rounded bg-[#12183F] border border-[#6150EA]/30 text-[#2EF2C2] font-bold">
                      {item.surah.arabic}
                    </span>
                    <span className="text-[#F2F4FF]/70">
                      {isAr
                        ? `الآية ${item.verse}`
                        : `${item.surah.english} — Verse ${item.verse}`}
                    </span>
                    <span className="text-[11px] px-2 py-0.5 rounded bg-[#6150EA]/20 text-[#F2F4FF]/60">
                      {item.surah.revelation === 'Mecca' || item.surah.revelation === 'مكية'
                        ? isAr ? 'مكية' : 'Meccan'
                        : isAr ? 'مدنية' : 'Medinan'}
                    </span>
                  </div>

                  <div className="flex items-center gap-2">
                    <span className="text-[11px] px-2 py-0.5 rounded bg-[#12183F] border border-[#2EF2C2]/30 text-[#2EF2C2]">
                      {item.confidence}% {isAr ? 'مطابقة' : 'match'}
                    </span>
                  </div>
                </div>

                {/* Ayah Scripture Arabic Text */}
                <div className="p-6 text-center space-y-4">
                  <p
                    dir="rtl"
                    lang="ar"
                    className="font-serif text-2xl sm:text-3xl leading-[2.2] text-[#F2F4FF] select-text"
                  >
                    « {item.text} »
                  </p>

                  {/* English Translation */}
                  {item.translation && (
                    <p
                      dir="ltr"
                      className="text-sm text-[#F2F4FF]/75 italic leading-relaxed pt-2 border-t border-[#6150EA]/15"
                    >
                      "{item.translation}"
                    </p>
                  )}
                </div>

                {/* Ayah Card Footer Actions (Tafsir button) */}
                <div className="px-5 py-3 bg-[#12183F]/80 border-t border-[#6150EA]/20 flex items-center justify-between">
                  <button
                    type="button"
                    onClick={() => {
                      if (tafsirData[verseKey]) {
                        setTafsirData((prev) => {
                          const next = { ...prev };
                          delete next[verseKey];
                          return next;
                        });
                      } else {
                        fetchTafsir(item.chapter, item.verse);
                      }
                    }}
                    className="inline-flex items-center gap-1.5 text-xs font-medium text-[#2EF2C2] hover:text-[#2EF2C2]/80 transition"
                  >
                    <BookOpen className="w-3.5 h-3.5" />
                    <span>
                      {isTafsirOpen
                        ? isAr ? 'إخفاء التفسير' : 'Hide Tafsir'
                        : isAr ? 'عرض التفسير الميسر (مجمع الملك فهد)' : 'View Al-Muyassar Tafsir'}
                    </span>
                    {isTafsirBusy && (
                      <div className="w-3 h-3 border-2 border-[#2EF2C2] border-t-transparent rounded-full animate-spin ml-1" />
                    )}
                  </button>

                  <a
                    href={`https://quran.com/${item.chapter}/${item.verse}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-[11px] text-[#F2F4FF]/50 hover:text-[#F2F4FF]/90 transition"
                  >
                    <span>{isAr ? 'فتح في Quran.com' : 'Open in Quran.com'}</span>
                    <ExternalLink className="w-3 h-3" />
                  </a>
                </div>

                {/* Tafsir Content Drawer */}
                {isTafsirOpen && (
                  <div className="p-5 bg-[#6150EA]/10 border-t border-[#6150EA]/20 text-sm text-[#F2F4FF]/90 leading-relaxed font-sans">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs font-bold text-[#2EF2C2]">
                        {isAr ? 'التفسير الميسر — مجمع الملك فهد لطباعة المصحف الشريف:' : 'Al-Muyassar Tafsir (King Fahd Complex):'}
                      </span>
                    </div>
                    <p dir="rtl" lang="ar" className="leading-relaxed text-[#F2F4FF]/90">
                      {tafsirData[verseKey]}
                    </p>
                  </div>
                )}
              </div>
            );
          })}

          {/* Multi-occurrence expander for 6+ results (e.g. 31 occurrences of Ar-Rahman) */}
          {searchResponse.results.length > 5 && (
            <div className="text-center pt-2">
              <button
                type="button"
                onClick={() => setExpandedAll(!expandedAll)}
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-[#6150EA]/20 hover:bg-[#6150EA]/35 border border-[#6150EA]/40 text-[#F2F4FF] text-sm font-semibold transition"
              >
                {expandedAll ? (
                  <>
                    <ChevronUp className="w-4 h-4 text-[#2EF2C2]" />
                    <span>{isAr ? 'طي المواضع الإضافية' : 'Collapse extra occurrences'}</span>
                  </>
                ) : (
                  <>
                    <ChevronDown className="w-4 h-4 text-[#2EF2C2]" />
                    <span>
                      {isAr
                        ? `عرض جميع المواضع (${searchResponse.totalMatches} موضعاً في القرآن)`
                        : `View all occurrences (${searchResponse.totalMatches} in Quran)`}
                    </span>
                  </>
                )}
              </button>
            </div>
          )}
        </div>
      )}

      {/* Standby view when no search executed */}
      {!searchResponse && (
        <div className="p-8 text-center rounded-xl border border-dashed border-[#6150EA]/20 bg-[#12183F]/40">
          <p className="text-sm text-[#F2F4FF]/60 max-w-md mx-auto leading-relaxed">
            {isAr
              ? 'أدخل نص الآية أعلاه أو استخدم زر «استخراج من صورة» للبحث المباشر وعرض بيانات السورة والتفسير المعتمد.'
              : 'Enter verse text above or use "OCR Image" to match and view authentic chapter details and tafsir.'}
          </p>
        </div>
      )}
    </div>
  );
};
