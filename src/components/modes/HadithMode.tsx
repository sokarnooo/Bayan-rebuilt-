import React, { useState } from 'react';
import type { InterfaceLanguage } from '../../types';
import { OcrButton } from '../common/OcrButton';
import {
  Search,
  BookOpen,
  CheckCircle2,
  AlertTriangle,
  HelpCircle,
  Copy,
  Check,
  RotateCcw,
  Sparkles,
  ExternalLink,
  Layers,
  Award,
  BookmarkCheck,
} from 'lucide-react';

interface HadithGradeItem {
  name: string;
  originalGrade: string;
  arabicLabel: string;
  family: 'صحيح' | 'حسن' | 'ضعيف' | 'موضوع' | 'neutral';
  isIsnadJudgment: boolean;
  isCitation: boolean;
  note?: string;
}

interface HadithAttestationItem {
  id: string;
  collection: string;
  collectionArabic: string;
  hadithnumber: number;
  arabicnumber: string | number;
  book: number;
  hadithInBook: number;
  containmentRatio: number;
  grades: HadithGradeItem[];
  hasNoGrading: boolean;
  matnSnippet: string;
}

interface HadithMatchResult {
  id: string;
  collection: string;
  collectionArabic: string;
  hadithnumber: number;
  arabicnumber: string | number;
  book: number;
  hadithInBook: number;
  sectionName: string;
  text: string;
  translation?: string;
  confidence: number;
  state: 'matched' | 'close_match';
  coverage: 'full' | 'fragment';
  matchedStartWordIndex: number;
  matchedEndWordIndex: number;
  matchedTokens: string[];
  wordMatchStatus: ('exact' | 'approximate' | 'none')[];
  hasApproximateMatch: boolean;
  grades: HadithGradeItem[];
  hasNoGrading: boolean;
  isnadStripped: boolean;
  attestations?: HadithAttestationItem[];
}

interface HadithSearchResponse {
  query: string;
  normalizedQuery: string;
  language: 'ar' | 'en';
  state: 'matched' | 'close_match' | 'not_found' | 'too_short';
  topConfidence: number;
  totalMatches: number;
  results: HadithMatchResult[];
  referralRequired: boolean;
  notice?: string;
  executionTimeMs: number;
  isCuratedMatched?: boolean;
  curatedMatchedEntry?: {
    saying: string;
    ruling: string;
    url: string;
    source: string;
  };
}

interface HadithModeProps {
  language: InterfaceLanguage;
}

export const HadithMode: React.FC<HadithModeProps> = ({ language }) => {
  const [query, setQuery] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isNotReadyRetry, setIsNotReadyRetry] = useState(false);
  const [result, setResult] = useState<HadithSearchResponse | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const isAr = language === 'ar';

  const handleSearch = async (overrideQuery?: string) => {
    const textToSearch = (overrideQuery ?? query).trim();
    if (!textToSearch) return;

    setIsLoading(true);
    setIsNotReadyRetry(false);
    try {
      const res = await fetch('/api/hadith/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: textToSearch }),
      });

      if (res.status === 503) {
        setIsNotReadyRetry(true);
        setTimeout(() => {
          handleSearch(textToSearch);
        }, 2000);
        return;
      }

      const data: HadithSearchResponse = await res.json();
      setResult(data);
    } catch (err) {
      console.error('Hadith search failed:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleCopy = (id: string, text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const renderHighlightedWords = (
    fullText: string,
    wordStatus: ('exact' | 'approximate' | 'none')[],
    startIdx: number,
    endIdx: number,
    changedWords?: Array<{ queryWord: string; sourceWord: string | null; position: number }>
  ) => {
    const words = fullText.split(/\s+/).filter(Boolean);
    if (!wordStatus || wordStatus.length === 0 || startIdx < 0) {
      return fullText;
    }

    const changedSourceSet = new Set(
      (changedWords || [])
        .map((c) => c.sourceWord)
        .filter(Boolean) as string[]
    );

    return words.map((w, idx) => {
      if (idx >= startIdx && idx <= endIdx) {
        const statusIdx = idx - startIdx;
        const status = wordStatus[statusIdx] || 'exact';

        if (status === 'none' || (changedWords && changedWords.length > 0 && changedSourceSet.has(w))) {
          return (
            <span
              key={idx}
              title={isAr ? 'كلمة مختلفة عن النص الأصلي' : 'Word differs from original text'}
              className="text-red-400 bg-red-500/15 border-b-2 border-dashed border-red-500 px-1 py-0.5 rounded font-semibold transition inline-block"
            >
              {w}{' '}
            </span>
          );
        }
        if (status === 'exact') {
          return (
            <span
              key={idx}
              className="text-[#2EF2C2] bg-[#2EF2C2]/15 px-1 py-0.5 rounded font-semibold transition inline-block"
            >
              {w}{' '}
            </span>
          );
        }
        if (status === 'approximate') {
          return (
            <span
              key={idx}
              title={isAr ? 'تطابق تقريبي' : 'Approximate match'}
              className="text-amber-300 bg-amber-400/15 border-b-2 border-dashed border-amber-400 px-1 py-0.5 rounded transition inline-block"
            >
              {w}{' '}
            </span>
          );
        }
      }
      return <span key={idx}>{w} </span>;
    });
  };

  const sampleQueries = [
    { label: 'إنما الأعمال بالنيات', query: 'إنما الأعمال بالنيات' },
    {
      label: 'المؤمن القوي (مع الإسناد والتخريج)',
      query: 'عن أبي هريرة رضي الله عنه قال: قال رسول الله صلى الله عليه وسلم: المؤمن القوي خير وأحب إلى الله من المؤمن الضعيف... رواه مسلم',
    },
    { label: 'لا يؤمن أحدكم حتى يحب لأخيه', query: 'لا يؤمن أحدكم حتى يحب لأخيه ما يحب لنفسه' },
    { label: 'حديث موضوع مشهور (للتحقق)', query: 'اطلبوا العلم ولو في الصين' },
  ];

  return (
    <div className="space-y-6">
      {/* Input Card */}
      <div className="rounded-xl bg-[#12183F] border border-[#6150EA]/30 p-5 shadow-xl focus-within:border-[#2EF2C2]/60 transition">
        <div className="flex items-center justify-between mb-2">
          <label className="text-sm font-medium text-[#F2F4FF]/90">
            {isAr ? 'متن الحديث أو طرف منه أو نص كامل بالسند والتخريج:' : 'Hadith text, opening, or citation:'}
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
              if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                handleSearch();
              }
            }}
            dir="auto"
            placeholder={
              isAr
                ? 'الصق متن الحديث أو نصه مع السند أو التخريج (مثال: «عن أبي هريرة... المؤمن القوي خير... رواه مسلم»)...'
                : 'Paste hadith text with isnad or takhrij citation (e.g. "actions are by intentions")...'
            }
            className="w-full bg-[#12183F]/70 border border-[#6150EA]/20 rounded-lg p-3 text-[#F2F4FF] placeholder-[#F2F4FF]/30 focus:outline-none focus:border-[#2EF2C2]/70 font-quran text-xl leading-relaxed resize-y"
          />
        </div>

        {/* Sample query shortcuts */}
        <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
          <span className="text-[#F2F4FF]/50">{isAr ? 'أمثلة للتجربة:' : 'Examples:'}</span>
          {sampleQueries.map((s, idx) => (
            <button
              key={idx}
              type="button"
              onClick={() => {
                setQuery(s.query);
                handleSearch(s.query);
              }}
              className="px-2.5 py-1 rounded-md bg-[#6150EA]/15 hover:bg-[#6150EA]/30 text-[#F2F4FF]/80 border border-[#6150EA]/20 transition cursor-pointer text-xs"
            >
              {s.label}
            </button>
          ))}
        </div>

        <div className="mt-4 flex items-center justify-between pt-3 border-t border-[#6150EA]/15">
          <p className="text-xs text-[#F2F4FF]/50">
            {isAr
              ? 'تخريج دقيق من المجموعات السبع المفهرسة مع بيان درجة كل مخرج دون افتئات.'
              : 'Precise takhrij across the 7 canonical collections with named grader judgments.'}
          </p>
          <button
            type="button"
            onClick={() => handleSearch()}
            disabled={!query.trim() || isLoading}
            className="inline-flex items-center gap-2 px-6 py-2 rounded-lg bg-[#6150EA] hover:bg-[#6150EA]/90 text-[#F2F4FF] font-medium text-sm transition disabled:opacity-40 disabled:cursor-not-allowed shadow-md cursor-pointer"
          >
            {isLoading ? (
              <RotateCcw className="w-4 h-4 animate-spin text-[#2EF2C2]" />
            ) : (
              <Search className="w-4 h-4 text-[#2EF2C2]" />
            )}
            <span>{isAr ? 'تخريج وتحقق' : 'Verify Hadith'}</span>
          </button>
        </div>
      </div>

      {/* Retry loading banner */}
      {isNotReadyRetry && (
        <div className="p-4 rounded-xl bg-amber-400/10 border border-amber-400/30 text-amber-300 flex items-center justify-center gap-3 shadow-lg animate-pulse" dir="rtl">
          <RotateCcw className="w-5 h-5 animate-spin text-amber-400" />
          <span className="font-semibold text-sm">
            الخدمة قيد التحميل، تُعاد المحاولة تلقائياً
          </span>
        </div>
      )}

      {/* Results Area */}
      {result && (
        <div className="space-y-4">
          {/* Header Summary */}
          <div className="flex flex-wrap items-center justify-between gap-3 p-4 rounded-xl bg-[#12183F] border border-[#6150EA]/20">
            <div className="flex items-center gap-3">
              {result.state === 'matched' && (
                <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#2EF2C2]/15 text-[#2EF2C2] text-xs font-semibold border border-[#2EF2C2]/40">
                  <CheckCircle2 className="w-4 h-4" />
                  <span>{isAr ? 'تطابق تام في السنة' : 'Matched'}</span>
                </div>
              )}
              {result.state === 'close_match' && (
                <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-400/15 text-amber-300 text-xs font-semibold border border-amber-400/40">
                  <AlertTriangle className="w-4 h-4" />
                  <span>{isAr ? 'تطابق مقارب' : 'Close Match'}</span>
                </div>
              )}
              {result.state === 'not_found' && (
                <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-red-400/15 text-red-300 text-xs font-semibold border border-red-400/40">
                  <HelpCircle className="w-4 h-4" />
                  <span>{isAr ? 'لم يُعثر على تطابق موثوق' : 'No Reliable Match'}</span>
                </div>
              )}
              {result.state === 'too_short' && (
                <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-violet-400/15 text-violet-300 text-xs font-semibold border border-violet-400/40">
                  <AlertTriangle className="w-4 h-4" />
                  <span>{isAr ? 'المدخل قصير جداً' : 'Input Too Short'}</span>
                </div>
              )}

              <span className="text-sm font-semibold text-[#F2F4FF]">
                {isAr ? `نسبة التطابق: ${result.topConfidence}٪` : `Match Confidence: ${result.topConfidence}%`}
              </span>
            </div>

            <div className="text-xs text-[#F2F4FF]/50 flex items-center gap-3">
              <span>{isAr ? `${result.totalMatches} نتيجة` : `${result.totalMatches} results`}</span>
              <span>•</span>
              <span>{result.executionTimeMs} ms</span>
            </div>
          </div>

          {/* Curated matched Fabricated-saying card */}
          {result.isCuratedMatched && result.curatedMatchedEntry && (
            <div className="p-5 rounded-xl border-2 border-red-500/40 bg-red-500/10 text-red-100 space-y-4 shadow-lg select-text text-right" dir="rtl">
              <div className="flex items-center gap-2 text-red-400 font-bold border-b border-red-500/20 pb-2">
                <AlertTriangle className="w-5 h-5 text-red-400 animate-pulse" />
                <span className="text-lg">حديث منتشر لا يصح</span>
              </div>
              
              <div className="space-y-3">
                <p className="font-quran text-xl sm:text-2xl leading-relaxed text-[#F2F4FF]">
                  النص: « {result.curatedMatchedEntry.saying} »
                </p>
                
                <div className="text-sm space-y-2 pt-1">
                  <p>
                    <span className="font-bold text-red-300">الحكم في الدرر السنية: </span>
                    <span className="font-semibold bg-red-500/20 px-2 py-0.5 rounded text-red-200">
                      {result.curatedMatchedEntry.ruling}
                    </span>
                  </p>
                  
                  <p className="flex items-center flex-wrap gap-1.5">
                    <span className="font-bold text-red-300">المصدر: </span>
                    <span>الدرر السنية — أحاديث منتشرة لا تصح</span>
                    <span>•</span>
                    <a
                      href={result.curatedMatchedEntry.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-sky-400 hover:underline inline-flex items-center gap-1 font-mono text-xs"
                    >
                      رابط التحقق <ExternalLink className="w-3.5 h-3.5" />
                    </a>
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Notice Banner */}
          {result.notice && !result.isCuratedMatched && (
            <div className={`p-4 rounded-xl border text-sm ${
              result.notice.startsWith('تحذير')
                ? 'bg-red-500/10 border-red-500/40 text-red-200 space-y-2'
                : 'bg-[#6150EA]/15 border-[#6150EA]/30 text-[#F2F4FF]/80'
            }`}>
              {result.notice.startsWith('تحذير') ? (
                <div className="space-y-1 select-text">
                  <div className="flex items-center gap-2 text-red-400 font-bold mb-1">
                    <AlertTriangle className="w-4 h-4 text-red-400" />
                    <span>تنبيه بحديث منتشر غير ثابت</span>
                  </div>
                  {result.notice.split('\n').map((line, lIdx) => {
                    if (line.startsWith('رابط التحقق:')) {
                      const url = line.replace('رابط التحقق:', '').trim();
                      return (
                        <p key={lIdx} className="text-xs pt-1">
                          <span className="font-semibold text-red-300">رابط التحقق: </span>
                          <a href={url} target="_blank" rel="noopener noreferrer" className="text-sky-400 hover:underline inline-flex items-center gap-1 font-mono">
                            {url} <ExternalLink className="w-3 h-3" />
                          </a>
                        </p>
                      );
                    }
                    return <p key={lIdx} className="leading-relaxed">{line}</p>;
                  })}
                </div>
              ) : (
                result.notice
              )}
            </div>
          )}

          {/* Scholar Referral Mandatory Panel */}
          {(result.referralRequired || result.state === 'not_found') && (
            result.isCuratedMatched ? (
              <div className="p-4 text-center text-red-300 font-semibold text-sm">
                «لم يُعثر على هذا النص في المجموعات المفهرسة»
              </div>
            ) : (
              <div className="p-6 rounded-xl bg-gradient-to-r from-red-950/40 via-[#12183F] to-[#12183F] border-2 border-red-500/40 text-center space-y-3 shadow-lg">
                <div className="w-12 h-12 rounded-full bg-red-500/15 border border-red-500/30 flex items-center justify-center mx-auto text-red-300">
                  <HelpCircle className="w-6 h-6" />
                </div>
                <h3 className="text-lg font-bold text-red-300">
                  {isAr
                    ? 'لم يتم العثور على تطابق موثوق، راجع أهل العلم'
                    : 'No reliable match found; refer to qualified scholars'}
                </h3>
                <p className="text-sm text-[#F2F4FF]/80 max-w-xl mx-auto leading-relaxed">
                  {isAr
                    ? 'النص المدخل لم يُطابق حديثاً موثقاً في المجموعات السبع المفهرسة المعتمدة بنسبة تحقق كافية. يُرجى مراجعة كتب الحديث المتخصصة أو استشارة أهل العلم قبل تداوله أو البناء عليه.'
                    : 'The query text did not match any verified hadith across the 7 indexed collections with sufficient confidence. Please consult verified references or Islamic scholars.'}
                </p>
              </div>
            )
          )}

          {/* Result Cards */}
          {result.results.map((item) => (
            <div
              key={item.id}
              className="rounded-xl bg-[#12183F] border border-[#6150EA]/25 p-5 shadow-lg space-y-4 transition hover:border-[#6150EA]/50"
            >
              {/* Top metadata strip */}
              <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-[#6150EA]/15">
                <div className="flex items-center gap-2">
                  <span className="font-bold text-[#F2F4FF] text-base">{item.collectionArabic}</span>
                  {item.sectionName && (
                    <span className="text-xs px-2 py-0.5 rounded bg-[#6150EA]/20 text-[#F2F4FF]/75">
                      {item.sectionName}
                    </span>
                  )}
                </div>

                {/* Specific numbers with required dataset labels */}
                <div className="flex flex-wrap items-center gap-2 text-xs font-mono">
                  <span className="px-2 py-0.5 rounded bg-[#12183F]/90 border border-[#6150EA]/20 text-[#F2F4FF]/80">
                    <span className="text-[#F2F4FF]/40">{isAr ? 'رقم في المجموعة الرقمية: ' : 'Hadith ID: '}</span>
                    {item.hadithnumber}
                  </span>

                  <span className="px-2 py-0.5 rounded bg-[#12183F]/90 border border-[#2EF2C2]/30 text-[#2EF2C2]">
                    <span className="text-[#F2F4FF]/40">{isAr ? 'رقم arabicnumber: ' : 'Arabic #: '}</span>
                    {item.arabicnumber}
                  </span>

                  {item.book > 0 && (
                    <span className="px-2 py-0.5 rounded bg-[#12183F]/90 border border-[#6150EA]/20 text-[#F2F4FF]/80">
                      <span className="text-[#F2F4FF]/40">{isAr ? 'كتاب/حديث: ' : 'Book/Hadith: '}</span>
                      {item.book}/{item.hadithInBook}
                    </span>
                  )}
                </div>
              </div>

              {/* Hadith Text with Position Highlighting */}
              <div className="space-y-2">
                <p
                  dir="rtl"
                  lang="ar"
                  className="font-quran text-xl sm:text-2xl leading-[2.3] text-[#F2F4FF] select-text"
                >
                  « {renderHighlightedWords(item.text, item.wordMatchStatus, item.matchedStartWordIndex, item.matchedEndWordIndex, item.changedWords)} »
                </p>

                {/* Changed / unmatched words legend */}
                {item.changedWords && item.changedWords.length > 0 && (
                  <div className="flex flex-col items-center justify-center gap-1 pt-1 text-xs text-red-400 font-medium">
                    <div className="flex items-center gap-2">
                      <span className="inline-block w-4 border-b-2 border-dashed border-red-500" />
                      <span>{isAr ? 'كلمة مختلفة عن النص الأصلي' : 'Word differs from original text'}</span>
                    </div>
                    <div className="flex flex-wrap items-center justify-center gap-2 text-[11px] text-red-300/80">
                      {item.changedWords.map((cw, cwIdx) => (
                        <span key={cwIdx} className="bg-red-500/10 px-2 py-0.5 rounded border border-red-500/20">
                          «{cw.queryWord}» {cw.sourceWord ? (isAr ? `(في الأصل: «${cw.sourceWord}»)` : `(Original: "${cw.sourceWord}")`) : ''}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {/* Approximate match legend if any word was approximate */}
                {item.hasApproximateMatch && (
                  <div className="flex items-center justify-center gap-2 pt-1 text-xs text-amber-300 font-medium">
                    <span className="inline-block w-4 border-b-2 border-dashed border-amber-400" />
                    <span>{isAr ? 'تطابق تقريبي' : 'Approximate match'}</span>
                  </div>
                )}
              </div>

              {/* English Translation if available */}
              {item.translation && (
                <p
                  dir="ltr"
                  className="text-sm text-[#F2F4FF]/75 italic leading-relaxed pt-2 border-t border-[#6150EA]/15"
                >
                  {item.translation}
                </p>
              )}

              {/* Grading Block */}
              <div className="pt-3 border-t border-[#6150EA]/15 space-y-2">
                <div className="flex items-center gap-1.5 text-xs font-semibold text-[#2EF2C2]">
                  <Award className="w-3.5 h-3.5" />
                  <span>{isAr ? 'درجة الحديث والتخريج:' : 'Grading & Takhrij:'}</span>
                </div>

                {/* Consensus / No grading in data */}
                {item.hasNoGrading && (
                  <div className="p-3 rounded-lg bg-[#6150EA]/10 border border-[#6150EA]/20 space-y-1">
                    <p className="text-sm font-semibold text-[#F2F4FF]">
                      {isAr ? 'لا تتوفر درجة موثقة في مصدر البيانات' : 'No documented grade in dataset source'}
                    </p>
                    <p className="text-xs text-[#F2F4FF]/50">
                      {isAr
                        ? 'كتاب معتمد في المرجعية العلمية للتحدي'
                        : "Listed as an approved source in the challenge's scientific reference"}
                    </p>
                  </div>
                )}

                {/* Real Grader List */}
                {!item.hasNoGrading && item.grades.length > 0 && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {item.grades.map((g, gIdx) => (
                      <div
                        key={gIdx}
                        className={`p-2.5 rounded-lg border text-xs flex flex-col justify-between gap-1.5 ${
                          g.family === 'صحيح'
                            ? 'bg-[#2EF2C2]/10 border-[#2EF2C2]/30 text-[#2EF2C2]'
                            : g.family === 'حسن'
                            ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
                            : g.family === 'ضعيف'
                            ? 'bg-amber-500/10 border-amber-500/30 text-amber-300'
                            : g.family === 'موضوع'
                            ? 'bg-red-500/15 border-red-500/40 text-red-300'
                            : 'bg-[#6150EA]/10 border-[#6150EA]/25 text-[#F2F4FF]/80'
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <span className="font-semibold">{g.name}</span>
                          <span className="font-bold">{g.arabicLabel}</span>
                        </div>

                        <div className="flex items-center justify-between text-[11px] opacity-75">
                          <span>{g.originalGrade}</span>
                          {g.note && <span className="italic">{g.note}</span>}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Attestation Cluster Across Collections */}
              {item.attestations && item.attestations.length > 0 && (
                <div className="pt-3 border-t border-[#6150EA]/15 space-y-2">
                  <div className="flex items-center gap-1.5 text-xs font-semibold text-[#6150EA]">
                    <Layers className="w-3.5 h-3.5 text-[#2EF2C2]" />
                    <span>
                      {isAr
                        ? `شواهد الحديث في مجموعات السنة (${item.attestations.length} شاهد):`
                        : `Attestations across canonical collections (${item.attestations.length}):`}
                    </span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2">
                    {item.attestations.map((att, aIdx) => (
                      <div
                        key={aIdx}
                        className="p-2.5 rounded-lg bg-[#12183F]/80 border border-[#6150EA]/20 text-xs space-y-1 hover:border-[#2EF2C2]/40 transition"
                      >
                        <div className="flex items-center justify-between font-semibold text-[#F2F4FF]">
                          <span>{att.collectionArabic}</span>
                          <span className="font-mono text-[#2EF2C2]">
                            {Math.round(att.containmentRatio * 100)}٪
                          </span>
                        </div>
                        <div className="text-[11px] text-[#F2F4FF]/60 flex items-center justify-between">
                          <span>رقم {att.arabicnumber}</span>
                          <span>كتاب {att.book}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Copy control */}
              <div className="pt-2 flex justify-end">
                <button
                  type="button"
                  onClick={() => handleCopy(item.id, item.text)}
                  className="inline-flex items-center gap-1.5 text-xs text-[#F2F4FF]/60 hover:text-[#2EF2C2] transition cursor-pointer"
                >
                  {copiedId === item.id ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                  <span>{copiedId === item.id ? (isAr ? 'تم النسخ' : 'Copied') : isAr ? 'نسخ الحديث' : 'Copy'}</span>
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
