import React, { useState } from 'react';
import type { InterfaceLanguage } from '../../types';
import {
  Search,
  BookOpen,
  CheckCircle2,
  AlertCircle,
  AlertTriangle,
  Info,
  ChevronDown,
  ChevronUp,
  Sparkles,
  ExternalLink,
  RotateCcw,
  Layers,
} from 'lucide-react';

interface AyahModeProps {
  language: InterfaceLanguage;
}

interface AyahBreakdownItem {
  verse: number;
  text: string;
  translation: string;
  confidence: number;
  coverage: 'full' | 'fragment';
  coverageRatio: number;
  matchedWordCount: number;
  totalWordCount: number;
  matchedSlice?: string;
}

interface ChangedWordItem {
  queryWord: string | null;
  sourceWord: string | null;
  position: number;
  type?: 'exact' | 'approximate' | 'inserted' | 'deleted';
}

interface AyahResult {
  chapter: number;
  verse: number;
  startVerse?: number;
  endVerse?: number;
  verseRange?: string;
  isRange?: boolean;
  surah: {
    arabic: string;
    english: string;
    revelation: string;
  };
  text: string;
  translation: string;
  confidence: number;
  state: 'matched' | 'close_match';
  coverage: 'full' | 'fragment';
  coverageRatio: number;
  matchedSlice?: string;
  matchedTokens: string[];
  matchedWords?: string[];
  matchedOriginalIndices?: number[];
  wordMatchStatus?: ('exact' | 'approx' | 'none')[];
  matchedStartWordIndex?: number;
  matchedEndWordIndex?: number;
  hasApproximateMatch?: boolean;
  changedWords?: ChangedWordItem[];
  breakdown?: AyahBreakdownItem[];
  leadingBasmalaIgnored?: boolean;
}

interface SearchResponse {
  query: string;
  normalizedQuery: string;
  alefInvariantQuery: string;
  state: 'matched' | 'close_match' | 'not_found' | 'too_short';
  topConfidence: number;
  totalMatches: number;
  results: AyahResult[];
  referralRequired: boolean;
  referralMessage?: string;
  notice?: string;
  executionTimeMs: number;
}

export const AyahMode: React.FC<AyahModeProps> = ({ language }) => {
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [searchResponse, setSearchResponse] = useState<SearchResponse | null>(null);
  const [expandedAll, setExpandedAll] = useState(false);
  const [tafsirLoading, setTafsirLoading] = useState<Record<string, boolean>>({});
  const [tafsirData, setTafsirData] = useState<Record<string, string>>({});
  const [hasConnectionError, setHasConnectionError] = useState(false);

  const isAr = language === 'ar';

  const handleSearch = async (textToSearch?: string) => {
    const q = (textToSearch ?? query).trim();
    if (!q) return;

    setLoading(true);
    setHasConnectionError(false);
    setExpandedAll(false);

    try {
      const res = await fetch('/api/ayah/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: q }),
      });

      if (!res.ok) {
        console.error(`Verification API error: HTTP ${res.status} ${res.statusText}`);
        setHasConnectionError(true);
        return;
      }

      const data: SearchResponse = await res.json();
      setSearchResponse(data);
    } catch (err: any) {
      console.error('Network/Server connection error during verification:', err);
      setHasConnectionError(true);
    } finally {
      setLoading(false);
    }
  };

  const fetchTafsir = async (chapter: number, verse: number) => {
    const key = `${chapter}:${verse}`;
    if (tafsirData[key]) {
      return;
    }

    setTafsirLoading((prev) => ({ ...prev, [key]: true }));

    try {
      const res = await fetch(
        `https://api.quran.com/api/v4/quran/tafsirs/16?verse_key=${chapter}:${verse}`
      );
      if (res.ok) {
        const json = await res.json();
        const rawText = json.tafsirs?.[0]?.text || '';
        const cleanText = rawText.replace(/<[^>]*>?/gm, '');
        setTafsirData((prev) => ({
          ...prev,
          [key]: cleanText || (isAr ? 'لا يتوفر نص التفسير حالياً.' : 'Tafsir unavailable.'),
        }));
      } else {
        setTafsirData((prev) => ({
          ...prev,
          [key]: isAr
            ? 'التفسير الميسر (مجمع الملك فهد لطباعة المصحف الشريف)'
            : 'Tafsir Al-Muyassar (King Fahd Complex)',
        }));
      }
    } catch (e) {
      console.error('Tafsir fetch error:', e);
      setTafsirData((prev) => ({
        ...prev,
        [key]: isAr
          ? 'تعذر جلب التفسير من المصدر حالياً.'
          : 'Unable to fetch tafsir at this moment.',
      }));
    } finally {
      setTafsirLoading((prev) => ({ ...prev, [key]: false }));
    }
  };

  // Matched word highlighter by word status or positional slice
  const renderHighlightedWords = (
    text: string,
    wordMatchStatus?: Array<'exact' | 'approx' | 'none'>,
    startWordIndex?: number,
    endWordIndex?: number,
    changedWords?: Array<{ queryWord: string | null; sourceWord: string | null; position: number; type?: string }>,
    matchedOriginalIndices?: number[]
  ) => {
    const cleanText = text.replace(/<br\s*\/?>/gi, ' \n ');
    const words = cleanText.split(/\s+/).filter(Boolean);
    const matchedSet = matchedOriginalIndices ? new Set(matchedOriginalIndices) : null;
    const changedSourceSet = new Set(
      (changedWords || [])
        .map((c) => c.sourceWord)
        .filter(Boolean) as string[]
    );

    let displayWordIdx = 0;
    return words.map((word, idx) => {
      if (word === '\n') {
        return <br key={`br-${idx}`} className="my-2" />;
      }
      const currentIdx = displayWordIdx++;
      let status: 'exact' | 'approx' | 'none' = 'none';

      if (matchedSet) {
        if (matchedSet.has(currentIdx)) {
          status = (wordMatchStatus && wordMatchStatus[currentIdx]) || 'exact';
        }
      } else if (wordMatchStatus && wordMatchStatus.length === words.length) {
        status = wordMatchStatus[currentIdx];
      } else if (
        startWordIndex !== undefined &&
        endWordIndex !== undefined &&
        startWordIndex >= 0 &&
        currentIdx >= startWordIndex &&
        currentIdx <= endWordIndex
      ) {
        status = 'exact';
      }

      const isChanged =
        (status === 'none' &&
          ((matchedSet && matchedSet.has(currentIdx)) ||
            (startWordIndex !== undefined &&
              endWordIndex !== undefined &&
              currentIdx >= startWordIndex &&
              currentIdx <= endWordIndex))) ||
        (changedWords && changedWords.length > 0 && changedSourceSet.has(word));

      return (
        <React.Fragment key={idx}>
          {idx > 0 && word !== '\n' ? ' ' : ''}
          {isChanged && changedWords && changedWords.length > 0 ? (
            <span
              title={isAr ? 'كلمة مختلفة عن النص الأصلي' : 'Word differs from original text'}
              className="text-red-400 bg-red-500/15 border-b-2 border-dashed border-red-500 px-1 py-0.5 rounded font-bold inline-block"
            >
              {word}
            </span>
          ) : status === 'exact' ? (
            <span className="text-[#2EF2C2] bg-[#2EF2C2]/15 px-1 py-0.5 rounded font-bold inline-block">
              {word}
            </span>
          ) : status === 'approx' ? (
            <span
              title={isAr ? 'تطابق تقريبي / رسم عثماني' : 'Approximate / script variant match'}
              className="text-amber-300 bg-amber-400/15 border-b-2 border-dashed border-amber-400 px-1 py-0.5 rounded font-bold inline-block"
            >
              {word}
            </span>
          ) : (
            <span>{word}</span>
          )}
        </React.Fragment>
      );
    });
  };

  const quickSamples = [
    'فبأي آلاء ربكما تكذبان',
    'الله لا اله الا هو الحي القيوم',
    'قل هو الله أحد الله الصمد لم يلد ولم يولد ولم يكن له كفوا أحد',
    'وهو العلي العظيم لا اكراه في الدين',
    'ذلك الكتاب لا ريب فيه',
    'الم',
    'طه',
    'من جد وجد ومن زرع حصد',
  ];

  const resultsToShow =
    searchResponse?.results && !expandedAll && searchResponse.results.length > 5
      ? searchResponse.results.slice(0, 5)
      : searchResponse?.results || [];

  return (
    <div className="space-y-6">
      {/* Search Input Box */}
      <div className="rounded-xl bg-[#12183F] border border-[#6150EA]/30 p-4 shadow-xl focus-within:border-[#2EF2C2]/60 transition">
        <div className="flex items-center justify-between mb-2">
          <label className="text-sm font-medium text-[#F2F4FF]/90">
            {isAr ? 'نص الآية الكريمة أو نطاق الآيات:' : 'Verse text or multi-ayah quote:'}
          </label>
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
                ? 'اكتب أو الصق نص الآية أو السورة كاملة هنا (يقبل الأخطاء الإملائية والاقتباسات المتصلة عبر الآيات)...'
                : 'Type or paste Quranic text or contiguous ayah ranges here (tolerates typos and cross-ayah pastes)...'
            }
            className="w-full bg-[#12183F]/70 border border-[#6150EA]/20 rounded-lg p-3 text-[#F2F4FF] placeholder-[#F2F4FF]/30 focus:outline-none focus:border-[#2EF2C2]/70 font-quran text-2xl leading-relaxed resize-y"
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
              className="text-xs px-2.5 py-1 rounded bg-[#6150EA]/15 hover:bg-[#6150EA]/30 text-[#F2F4FF]/80 hover:text-[#2EF2C2] border border-[#6150EA]/30 transition cursor-pointer"
            >
              {sample}
            </button>
          ))}
        </div>

        <div className="mt-4 flex items-center justify-between pt-3 border-t border-[#6150EA]/15">
          <p className="text-xs text-[#F2F4FF]/50">
            {isAr
              ? 'مطابقة نصية آلية عبر نص Quran Academy (ara-quranacademy).'
              : 'Automated text matching against Quran Academy text source.'}
          </p>
          <button
            type="button"
            onClick={() => handleSearch()}
            disabled={!query.trim() || loading}
            className="inline-flex items-center gap-2 px-6 py-2 rounded-lg bg-[#6150EA] hover:bg-[#6150EA]/90 text-[#F2F4FF] font-medium text-sm transition disabled:opacity-40 disabled:cursor-not-allowed shadow-md cursor-pointer"
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

      {/* Connection error panel */}
      {hasConnectionError && (
        <div className="p-5 rounded-xl bg-red-950/30 border border-red-500/40 text-red-200 text-sm flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 shadow-lg">
          <div className="flex items-center gap-3">
            <AlertCircle className="w-5 h-5 text-red-400 shrink-0" />
            <span className="font-medium">
              {isAr
                ? 'تعذر الاتصال بخدمة التحقق. حاول مرة أخرى بعد قليل.'
                : 'Unable to connect to verification service. Please try again shortly.'}
            </span>
          </div>
          <button
            type="button"
            onClick={() => handleSearch()}
            className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-lg bg-red-600/30 hover:bg-red-600/50 border border-red-400/40 text-red-100 text-xs font-semibold transition cursor-pointer shrink-0"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>{isAr ? 'إعادة المحاولة' : 'Retry'}</span>
          </button>
        </div>
      )}

      {/* Results Section */}
      {searchResponse && !hasConnectionError && (
        <div className="space-y-4">
          {/* Notice banner if leading Basmalah was ignored */}
          {searchResponse.notice && (
            <div className="p-3.5 rounded-xl bg-blue-950/30 border border-blue-500/40 text-blue-200 text-xs flex items-center gap-2">
              <Info className="w-4 h-4 text-blue-400 shrink-0" />
              <span>{searchResponse.notice}</span>
            </div>
          )}

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
              ) : searchResponse.state === 'too_short' ? (
                <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-blue-500/20 border border-blue-500/40 text-blue-300 text-xs font-bold">
                  <Info className="w-3.5 h-3.5 text-blue-400" />
                  <span>{isAr ? 'مدخل قصير جداً' : 'Query Too Short'}</span>
                </div>
              ) : (
                <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-red-500/20 border border-red-500/40 text-red-300 text-xs font-bold">
                  <AlertTriangle className="w-3.5 h-3.5" />
                  <span>{isAr ? 'لا يوجد تطابق موثوق' : 'No Reliable Match'}</span>
                </div>
              )}

              {searchResponse.state !== 'too_short' && searchResponse.topConfidence > 0 && (
                <span className="text-xs text-[#F2F4FF]/70">
                  {isAr
                    ? `نسبة المطابقة: ${searchResponse.topConfidence}%`
                    : `Match Confidence: ${searchResponse.topConfidence}%`}
                </span>
              )}
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

          {/* Short-Query Notice Panel */}
          {searchResponse.state === 'too_short' && (
            <div className="p-6 rounded-2xl bg-blue-950/25 border-2 border-blue-500/40 text-blue-100 flex flex-col sm:flex-row items-start gap-4">
              <div className="p-3 rounded-xl bg-blue-500/15 border border-blue-500/30 shrink-0 text-blue-400">
                <Info className="w-6 h-6" />
              </div>
              <div className="space-y-1.5 flex-1">
                <h3 className="text-base font-bold text-blue-300">
                  {searchResponse.notice ||
                    (isAr
                      ? 'المدخل قصير جداً للتحقق، يرجى كتابة 3 كلمات أو أكثر'
                      : 'Query too short to verify, please enter 3 or more words')}
                </h3>
                <p className="text-sm text-blue-200/80 leading-relaxed">
                  {isAr
                    ? 'الكلمات المفردة والعبارات القصيرة تتكرر في مواضع متعددة من القرآن الكريم. تفادياً لعرض مئات النتائج غير المقصودة، يُرجى كتابة ثلاث كلمات على الأقل لتحديد الآية المقصودة بدقة (إلا إذا كانت الكلمة تشكل آية مستقلة كاملة مثل «الم» أو «الرحمن»).'
                    : 'Single words and short phrases occur across dozens of verses. Please type at least 3 words to pinpoint the verse (unless the query is an entire standalone ayah like "Alif Lam Meem" or "Ar-Rahman").'}
                </p>
              </div>
            </div>
          )}

          {/* Scholar Referral Panel when not found */}
          {searchResponse.state === 'not_found' && (
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

          {/* Matched Ayah / Range Cards */}
          {resultsToShow.map((item, idx) => {
            const verseKey = `${item.chapter}:${item.verseRange || item.verse}`;
            const isTafsirOpen = !!tafsirData[verseKey];
            const isTafsirBusy = !!tafsirLoading[verseKey];

            return (
              <div
                key={idx}
                className="rounded-2xl bg-[#12183F] border border-[#6150EA]/30 overflow-hidden shadow-lg hover:border-[#2EF2C2]/40 transition"
              >
                {/* Ayah Card Header */}
                <div className="px-5 py-3 bg-[#6150EA]/10 border-b border-[#6150EA]/20 flex flex-wrap items-center justify-between gap-3 text-xs">
                  <div className="flex items-center gap-2 font-medium text-[#F2F4FF]">
                    <span className="px-2.5 py-0.5 rounded bg-[#12183F] border border-[#6150EA]/30 text-[#2EF2C2] font-bold">
                      {item.surah.arabic}
                    </span>
                    <span className="text-[#F2F4FF]/90 font-semibold">
                      {isAr
                        ? item.isRange
                          ? `الآيات ${item.verseRange}`
                          : `الآية ${item.verse}`
                        : item.isRange
                        ? `${item.surah.english} — Verses ${item.verseRange}`
                        : `${item.surah.english} — Verse ${item.verse}`}
                    </span>
                    <span className="text-[11px] px-2 py-0.5 rounded bg-[#6150EA]/20 text-[#F2F4FF]/60">
                      {item.surah.revelation === 'Mecca' || item.surah.revelation === 'مكية'
                        ? isAr ? 'مكية' : 'Meccan'
                        : isAr ? 'مدنية' : 'Medinan'}
                    </span>
                  </div>

                  <div className="flex items-center gap-2">
                    {/* Coverage badge with strict language localization */}
                    <span
                      className={`text-[11px] px-2 py-0.5 rounded font-semibold ${
                        item.coverage === 'full'
                          ? 'bg-[#2EF2C2]/20 text-[#2EF2C2] border border-[#2EF2C2]/40'
                          : 'bg-[#6150EA]/30 text-[#F2F4FF]/80 border border-[#6150EA]/40'
                      }`}
                    >
                      {item.isRange
                        ? item.coverage === 'full'
                          ? isAr ? 'نطاق آيات كامل' : 'Full Ayah Range'
                          : isAr ? 'مقطع عبر آيات' : 'Cross-Ayah Fragment'
                        : item.coverage === 'full'
                        ? isAr ? 'آية كاملة' : 'Full Ayah'
                        : isAr ? 'مقطع من آية' : 'Fragment'}
                    </span>

                    <span className="text-[11px] px-2 py-0.5 rounded bg-[#12183F] border border-[#2EF2C2]/30 text-[#2EF2C2] font-bold">
                      {item.confidence}% {isAr ? 'مطابقة' : 'match'}
                    </span>
                  </div>
                </div>

                {/* Ayah Scripture Arabic Text with Amiri Font & Highlighting */}
                <div className="p-6 text-center space-y-4">
                  <p
                    dir="rtl"
                    lang="ar"
                    className="font-quran text-2xl sm:text-3xl leading-[2.3] text-[#F2F4FF] select-text"
                  >
                    « {renderHighlightedWords(item.text, item.wordMatchStatus, item.matchedStartWordIndex, item.matchedEndWordIndex, item.changedWords, item.matchedOriginalIndices)} »
                  </p>

                  {/* Changed / unmatched words legend */}
                  {item.changedWords && item.changedWords.filter(c => c.type !== 'exact').length > 0 && (() => {
                    const sourceOnlyWords = item.changedWords
                      .filter(c => c.type !== 'exact' && c.sourceWord && (!c.queryWord || c.type === 'inserted'))
                      .map(c => c.sourceWord)
                      .filter(Boolean);
                    const queryOnlyWords = item.changedWords
                      .filter(c => c.type !== 'exact' && c.queryWord && (!c.sourceWord || c.type === 'deleted'))
                      .map(c => c.queryWord)
                      .filter(Boolean);

                    return (
                      <div className="flex flex-col gap-1.5 pt-2 text-xs font-medium border-t border-[#6150EA]/15 text-start">
                        {sourceOnlyWords.length > 0 && (
                          <div className="flex items-start gap-1.5 text-red-300">
                            <span className="font-semibold shrink-0">
                              {isAr ? 'كلمات في المصدر ليست في نصك:' : 'Words in the source not in your text:'}
                            </span>
                            <span className="text-red-200 font-bold">
                              «{sourceOnlyWords.join(' ')}»
                            </span>
                          </div>
                        )}
                        {queryOnlyWords.length > 0 && (
                          <div className="flex items-start gap-1.5 text-amber-300">
                            <span className="font-semibold shrink-0">
                              {isAr ? 'كلمات في نصك ليست في المصدر:' : 'Words in your text not in the source:'}
                            </span>
                            <span className="text-amber-200 font-bold">
                              «{queryOnlyWords.join(' ')}»
                            </span>
                          </div>
                        )}
                      </div>
                    );
                  })()}

                  {/* Approximate match legend if any word was approximate */}
                  {item.hasApproximateMatch && (
                    <div className="flex items-center justify-center gap-2 pt-1 text-xs text-amber-300 font-medium">
                      <span className="inline-block w-4 border-b-2 border-dashed border-amber-400" />
                      <span>{isAr ? 'تطابق تقريبي' : 'Approximate match'}</span>
                    </div>
                  )}

                  {/* English Translation */}
                  {item.isRange && item.breakdown && item.breakdown.length > 1 ? (
                    <div
                      dir="ltr"
                      className="text-sm text-[#F2F4FF]/75 italic leading-relaxed pt-2 border-t border-[#6150EA]/15 space-y-1.5"
                    >
                      {item.breakdown.map((b) => (
                        <p key={b.verse} className="flex items-start gap-1.5">
                          <span className="font-mono text-xs font-semibold text-[#2EF2C2] not-italic shrink-0 pt-0.5">
                            [{b.verse}]
                          </span>
                          <span>{b.translation}</span>
                        </p>
                      ))}
                    </div>
                  ) : (
                    item.translation && (
                      <p
                        dir="ltr"
                        className="text-sm text-[#F2F4FF]/75 italic leading-relaxed pt-2 border-t border-[#6150EA]/15"
                      >
                        {item.translation}
                      </p>
                    )
                  )}

                  {/* Per-Ayah Breakdown for Ranges */}
                  {item.isRange && item.breakdown && item.breakdown.length > 1 && (
                    <div className="pt-3 border-t border-[#6150EA]/15 text-start">
                      <div className="flex items-center gap-2 mb-2 text-xs font-semibold text-[#2EF2C2]">
                        <Layers className="w-3.5 h-3.5" />
                        <span>{isAr ? 'تفصيل الآيات المشمولة في النطاق:' : 'Breakdown of verses in range:'}</span>
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        {item.breakdown.map((b, bIdx) => (
                          <div
                            key={bIdx}
                            className="p-2.5 rounded-lg bg-[#12183F]/70 border border-[#6150EA]/20 flex items-center justify-between text-xs"
                          >
                            <span className="text-[#F2F4FF]/80 font-medium">
                              {isAr ? `الآية ${b.verse}` : `Verse ${b.verse}`}
                            </span>
                            <div className="flex items-center gap-2">
                              <span
                                className={`text-[10px] px-1.5 py-0.5 rounded ${
                                  b.coverage === 'full'
                                    ? 'bg-[#2EF2C2]/15 text-[#2EF2C2]'
                                    : 'bg-[#6150EA]/20 text-[#F2F4FF]/70'
                                }`}
                              >
                                {b.coverage === 'full'
                                  ? isAr ? 'كاملة' : 'Full'
                                  : isAr ? `${Math.round(b.coverageRatio * 100)}% من الآية` : `${Math.round(b.coverageRatio * 100)}% coverage`}
                              </span>
                              <span className="text-[10px] text-[#F2F4FF]/50">
                                {b.matchedWordCount}/{b.totalWordCount} {isAr ? 'كلمة' : 'words'}
                              </span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                {/* Ayah Card Footer Actions */}
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
                        fetchTafsir(item.chapter, item.startVerse || item.verse);
                      }
                    }}
                    className="inline-flex items-center gap-1.5 text-xs font-medium text-[#2EF2C2] hover:text-[#2EF2C2]/80 transition cursor-pointer"
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
                    href={`https://quran.com/${item.chapter}/${item.startVerse || item.verse}`}
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

          {/* Multi-occurrence expander */}
          {searchResponse.results.length > 5 && (
            <div className="text-center pt-2">
              <button
                type="button"
                onClick={() => setExpandedAll(!expandedAll)}
                className="inline-flex items-center gap-2 px-6 py-2.5 rounded-xl bg-[#6150EA]/20 hover:bg-[#6150EA]/35 border border-[#6150EA]/40 text-[#F2F4FF] text-sm font-semibold transition cursor-pointer shadow-md"
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
                        ? `عرض جميع المواضع (${searchResponse.totalMatches} موضعاً في القرآن الكريم)`
                        : `View all occurrences (${searchResponse.totalMatches} in Quran)`}
                    </span>
                  </>
                )}
              </button>
            </div>
          )}
        </div>
      )}

      {/* Standby view */}
      {!searchResponse && !hasConnectionError && (
        <div className="p-8 text-center rounded-xl border border-dashed border-[#6150EA]/20 bg-[#12183F]/40">
          <p className="text-sm text-[#F2F4FF]/60 max-w-md mx-auto leading-relaxed">
            {isAr
              ? 'أدخل نص الآية أو السورة أعلاه للمطابقة المباشرة مع النص القرآني المعتمد وعرض التفسير والمواضع.'
              : 'Enter verse or surah text above to verify against primary Quranic source text.'}
          </p>
        </div>
      )}
    </div>
  );
};
