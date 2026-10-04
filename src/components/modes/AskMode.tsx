import React, { useState } from 'react';
import type { InterfaceLanguage } from '../../types';
import {
  MessageSquareQuote,
  Sparkles,
  AlertTriangle,
  ExternalLink,
  Copy,
  Check,
  Award,
  BookOpen,
  ScrollText,
  ShieldAlert,
  HelpCircle,
  Search,
} from 'lucide-react';

interface AskModeProps {
  language: InterfaceLanguage;
}

interface AskCitationItem {
  id: string;
  quote?: string;
  role: 'supports' | 'refutes';
  sourceTitle: string;
  editionName?: string;
  fullText: string;
  grades?: Array<{
    name: string;
    originalGrade: string;
    arabicLabel: string;
    family: 'صحيح' | 'حسن' | 'ضعيف' | 'موضوع' | 'neutral';
    isIsnadJudgment: boolean;
    isCitation: boolean;
    note?: string;
  }>;
  hasNoGrading?: boolean;
  type: 'ayah' | 'hadith';
  chapter?: number;
  verse?: number;
  collection?: string;
  hadithnumber?: number;
}

interface AskResponse {
  question: string;
  language: 'ar' | 'en';
  category: 'textual' | 'permissibility' | 'personal' | 'other';
  verdict: 'supported' | 'contradicted' | 'unclear' | 'permissibility';
  verdictBadgeLabel: string;
  verdictBadgeSubline?: string;
  isWeakOnly?: boolean;
  isPermissibility?: boolean;
  isFabricated?: boolean;
  fakeHadith?: {
    matn: string;
    ruling: string;
    url: string;
  };
  summary: string;
  searchedTerms: string[];
  items: AskCitationItem[];
  retrievedCount: number;
  droppedItemsCount: number;
  topRetrievedIds: string[];
  executionTimeMs: number;
  error?: string;
}

export const AskMode: React.FC<AskModeProps> = ({ language }) => {
  const [question, setQuestion] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [result, setResult] = useState<AskResponse | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const isAr = language === 'ar';

  const handleSearch = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const trimmed = question.trim();
    if (!trimmed || isLoading) return;

    setIsLoading(true);
    setErrorMessage(null);

    try {
      const response = await fetch('/api/ask', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question: trimmed, language }),
      });

      const data: AskResponse = await response.json();

      if (!response.ok && data?.error) {
        setErrorMessage(data.error);
        setResult(data);
      } else {
        setResult(data);
      }
    } catch (err: any) {
      setErrorMessage(
        isAr
          ? 'تعذر الاتصال بالخادم. يرجى التحقق من اتصال الشبكة.'
          : 'Failed to connect to the server. Please check your network connection.'
      );
    } finally {
      setIsLoading(false);
    }
  };

  const copyToClipboard = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  return (
    <div className="space-y-6">
      {/* Search Input Box */}
      <form onSubmit={handleSearch} className="rounded-xl bg-[#12183F] border border-[#6150EA]/30 p-4 shadow-xl focus-within:border-[#2EF2C2]/60 transition">
        <label className="block text-sm font-medium text-[#F2F4FF]/90 mb-2">
          {isAr
            ? 'السؤال الشرعي بالدليل (توسيع استعلام + استرجاع بالكلمات المفتاحية):'
            : 'Question with evidence (Query expansion + keyword retrieval):'}
        </label>

        <textarea
          rows={3}
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          dir={isAr ? 'rtl' : 'ltr'}
          placeholder={
            isAr
              ? 'اطرح مسألتك أو ابحث عن نص (مثال: هل صيام ستة أيام من شوال مستحب؟ أو: هل تبسمك في وجه أخيك صدقة؟)...'
              : 'Ask a religious question to retrieve primary evidence (e.g. Does smiling at your brother count as charity?)...'
          }
          className="w-full bg-[#12183F]/70 border border-[#6150EA]/20 rounded-lg p-3 text-[#F2F4FF] placeholder-[#F2F4FF]/30 focus:outline-none focus:border-[#2EF2C2]/70 text-base leading-relaxed resize-y font-sans"
        />

        <div className="mt-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-3 border-t border-[#6150EA]/15">
          <p className="text-xs text-[#F2F4FF]/50 leading-relaxed">
            {isAr
              ? 'توسيع استعلام ذكي بدون تضمينات متجهة — إجابة حصرية من النصوص المسترجعة مع إحالة المسائل الاجتهادية لأهل العلم.'
              : 'Deterministic keyword retrieval over canonical corpora. Permissibility questions refer strictly to scholars.'}
          </p>

          <button
            type="submit"
            disabled={!question.trim() || isLoading}
            className="inline-flex items-center justify-center gap-2 px-6 py-2.5 rounded-lg bg-[#6150EA] hover:bg-[#6150EA]/90 text-[#F2F4FF] font-medium text-sm transition disabled:opacity-40 disabled:cursor-not-allowed shadow-md cursor-pointer shrink-0"
          >
            {isLoading ? (
              <>
                <div className="w-4 h-4 border-2 border-[#2EF2C2] border-t-transparent rounded-full animate-spin" />
                <span>{isAr ? 'جاري الاسترجاع والتحقق...' : 'Verifying...'}</span>
              </>
            ) : (
              <>
                <Sparkles className="w-4 h-4 text-[#2EF2C2]" />
                <span>{isAr ? 'ابحث بالدليل' : 'Ask with Proof'}</span>
              </>
            )}
          </button>
        </div>
      </form>

      {/* Error / 429 Rate Limit Banner */}
      {errorMessage && (
        <div className="flex items-center gap-3 p-4 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-300 text-sm">
          <AlertTriangle className="w-5 h-5 shrink-0" />
          <span>{errorMessage}</span>
        </div>
      )}

      {/* Results Section */}
      {result && (
        <div className="space-y-6">
          {/* Main Verdict Badge Header */}
          <div
            className={`p-5 rounded-xl border flex flex-col gap-2 ${
              result.isFabricated
                ? 'bg-red-500/15 border-red-500/40 text-red-200'
                : result.isPermissibility
                ? 'bg-[#6150EA]/15 border-[#6150EA]/40 text-[#F2F4FF]'
                : result.isWeakOnly
                ? 'bg-amber-500/15 border-amber-500/40 text-amber-200'
                : result.verdict === 'supported'
                ? 'bg-[#2EF2C2]/15 border-[#2EF2C2]/40 text-[#2EF2C2]'
                : result.verdict === 'contradicted'
                ? 'bg-red-500/15 border-red-500/40 text-red-200'
                : 'bg-amber-500/15 border-amber-500/40 text-amber-200'
            }`}
          >
            <div className="flex items-center gap-2.5">
              {result.isFabricated || result.verdict === 'contradicted' ? (
                <ShieldAlert className="w-6 h-6 text-red-400 shrink-0" />
              ) : result.isPermissibility ? (
                <BookOpen className="w-6 h-6 text-[#6150EA] shrink-0" />
              ) : result.isWeakOnly ? (
                <AlertTriangle className="w-6 h-6 text-amber-400 shrink-0" />
              ) : result.verdict === 'supported' ? (
                <Award className="w-6 h-6 text-[#2EF2C2] shrink-0" />
              ) : (
                <HelpCircle className="w-6 h-6 text-amber-400 shrink-0" />
              )}

              <div>
                <h3 className="text-lg font-bold">
                  {result.verdictBadgeLabel}
                </h3>
                {result.verdictBadgeSubline && (
                  <p className="text-xs opacity-85 mt-0.5">
                    {result.verdictBadgeSubline}
                  </p>
                )}
              </div>
            </div>

            {/* Fabricated Card Details */}
            {result.isFabricated && result.fakeHadith && (
              <div className="mt-3 p-3.5 rounded-lg bg-[#12183F]/80 border border-red-500/30 text-xs space-y-2">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-red-300">
                    {isAr ? 'حكم الحديث في التوثيق العلمي:' : 'Scientific Ruling:'}
                  </span>
                  <span className="px-2 py-0.5 rounded bg-red-500/20 text-red-300 font-bold border border-red-500/30">
                    {result.fakeHadith.ruling}
                  </span>
                </div>
                <p className="text-sm font-serif text-[#F2F4FF]">
                  « {result.fakeHadith.matn} »
                </p>
                <div className="pt-2 border-t border-red-500/20 flex items-center justify-between">
                  <span className="text-[#F2F4FF]/50 text-[11px]">
                    {isAr ? 'مصدر التوثيق: الدرر السنية - أحاديث منتشرة لا تصح' : 'Source: dorar.net'}
                  </span>
                  <a
                    href={result.fakeHadith.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-[#2EF2C2] hover:underline"
                  >
                    <span>{isAr ? 'فتح صفحة التخريج في الدرر السنية' : 'View on Dorar.net'}</span>
                    <ExternalLink className="w-3 h-3" />
                  </a>
                </div>
              </div>
            )}
          </div>

          {/* Searched Keywords Chips */}
          {result.searchedTerms && result.searchedTerms.length > 0 && (
            <div className="flex flex-wrap items-center gap-2 p-3 rounded-lg bg-[#12183F]/70 border border-[#6150EA]/20 text-xs text-[#F2F4FF]/75">
              <span className="flex items-center gap-1 font-semibold text-[#2EF2C2]">
                <Search className="w-3.5 h-3.5" />
                <span>{isAr ? 'الكلمات المفتاحية المبحوثة:' : 'Searched Terms:'}</span>
              </span>
              {result.searchedTerms.map((t, idx) => (
                <span
                  key={idx}
                  className="px-2.5 py-1 rounded-md bg-[#6150EA]/15 border border-[#6150EA]/30 text-[#F2F4FF] font-mono text-[11px]"
                >
                  {t}
                </span>
              ))}
            </div>
          )}

          {/* Automated One-Line Summary Box */}
          {result.summary && (
            <div className="p-4 rounded-xl bg-[#12183F] border border-[#6150EA]/25 space-y-1.5 shadow-sm">
              <span className="block text-[11px] font-semibold text-[#2EF2C2]/90">
                {isAr ? 'ملخص آلي — المصدر هو النص أدناه:' : 'Automated Summary — Source is the text below:'}
              </span>
              <p className="text-sm sm:text-base leading-relaxed text-[#F2F4FF] font-medium">
                {result.summary}
              </p>
            </div>
          )}

          {/* Retrieved Evidence Source Cards */}
          {result.items && result.items.length > 0 && (
            <div className="space-y-4">
              <div className="flex items-center justify-between text-xs text-[#F2F4FF]/70 pb-1 border-b border-[#6150EA]/20">
                <span className="font-semibold text-sm text-[#F2F4FF]">
                  {isAr
                    ? `النصوص المسترجعة من المصادر الأصلية (${result.items.length}):`
                    : `Retrieved Primary Sources (${result.items.length}):`}
                </span>
                <span>
                  {result.executionTimeMs} {isAr ? 'مللي ثانية' : 'ms'}
                </span>
              </div>

              {result.items.map((item, idx) => {
                const isItemEnglish = result.language === 'en';
                return (
                  <div
                    key={item.id || idx}
                    className="rounded-xl bg-[#12183F] border border-[#6150EA]/25 p-5 shadow-lg space-y-4 transition hover:border-[#6150EA]/50"
                  >
                    {/* Card Header Strip */}
                    <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-[#6150EA]/15">
                      <div className="flex items-center gap-2">
                        {item.type === 'ayah' ? (
                          <BookOpen className="w-4 h-4 text-[#2EF2C2]" />
                        ) : (
                          <ScrollText className="w-4 h-4 text-[#6150EA]" />
                        )}
                        <div>
                          <span className="font-bold text-[#F2F4FF] text-base">
                            {item.sourceTitle}
                          </span>
                          {item.editionName && (
                            <span className="block text-[11px] text-[#F2F4FF]/50 mt-0.5">
                              {item.editionName}
                            </span>
                          )}
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={() => copyToClipboard(item.fullText, item.id)}
                        className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded bg-[#6150EA]/20 hover:bg-[#6150EA]/40 text-xs text-[#F2F4FF]/80 transition cursor-pointer"
                      >
                        {copiedId === item.id ? (
                          <>
                            <Check className="w-3.5 h-3.5 text-[#2EF2C2]" />
                            <span>{isAr ? 'تم النسخ' : 'Copied'}</span>
                          </>
                        ) : (
                          <>
                            <Copy className="w-3.5 h-3.5" />
                            <span>{isAr ? 'نسخ النص' : 'Copy'}</span>
                          </>
                        )}
                      </button>
                    </div>

                    {/* Scripture Text: Amiri for Arabic, clean Sans for English */}
                    <div className="space-y-2">
                      <p
                        dir={isItemEnglish ? 'ltr' : 'rtl'}
                        lang={isItemEnglish ? 'en' : 'ar'}
                        className={`${
                          isItemEnglish
                            ? 'text-left font-sans text-base sm:text-lg leading-relaxed text-[#F2F4FF]/95'
                            : 'text-right font-serif text-xl sm:text-2xl leading-[2.3] text-[#F2F4FF]'
                        } select-text`}
                      >
                        « {item.fullText} »
                      </p>

                      {/* Quote Box: only when item.quote is present and non-empty */}
                      {item.quote && item.quote.trim().length > 0 && (
                        <div className="mt-2 p-2.5 rounded-lg bg-[#2EF2C2]/10 border border-[#2EF2C2]/20 text-xs text-[#2EF2C2]">
                          <span className="font-bold">{isAr ? 'الشاهد المقتبس: ' : 'Quoted excerpt: '}</span>
                          <span className={isItemEnglish ? 'font-sans text-sm' : 'font-serif text-sm'}>
                            «{item.quote.trim()}»
                          </span>
                        </div>
                      )}
                    </div>

                    {/* Grade panel for Hadiths */}
                    {item.type === 'hadith' && (
                      <div className="pt-3 border-t border-[#6150EA]/15 space-y-2">
                        <div className="flex items-center gap-1.5 text-xs font-semibold text-[#2EF2C2]">
                          <Award className="w-3.5 h-3.5" />
                          <span>{isAr ? 'درجة الحديث والتخريج:' : 'Grading & Takhrij:'}</span>
                        </div>

                        {/* Bukhari / Muslim / Nawawi Rule 2 notice */}
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

                        {/* Real grader citations */}
                        {!item.hasNoGrading && item.grades && item.grades.length > 0 && (
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
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {/* Scholar Referral Box when unclear or no texts */}
          {(result.verdict === 'unclear' || (result.items && result.items.length === 0 && !result.isFabricated)) && (
            <div className="p-5 rounded-xl border border-amber-500/30 bg-amber-500/10 space-y-2 text-amber-200">
              <div className="flex items-center gap-2 font-bold text-base">
                <HelpCircle className="w-5 h-5 text-amber-400" />
                <span>{isAr ? 'لم يتم العثور على تطابق موثوق، راجع أهل العلم' : 'No reliable match found; consult qualified scholars'}</span>
              </div>
              <p className="text-xs text-amber-200/80 leading-relaxed">
                {isAr
                  ? 'لم تتضمن مجموعات الحديث والآيات المفهرسة نصاً صريحاً يثبت أو ينفي المسألة المطروحة بدلالة قطعية. يُرجى مراجعة كتب الفقه المعتمدة واستفتاء أهل العلم الموثوقين.'
                  : 'The indexed Quranic and Hadith collections do not contain explicit textual evidence for this specific phrasing. Consult recognized scholars.'}
              </p>
            </div>
          )}
        </div>
      )}

      {/* Empty Initial State Info */}
      {!result && !isLoading && (
        <div className="p-8 text-center rounded-xl border border-dashed border-[#6150EA]/20 bg-[#12183F]/40 space-y-3">
          <MessageSquareQuote className="w-10 h-10 text-[#6150EA]/60 mx-auto" />
          <h4 className="text-base font-semibold text-[#F2F4FF]/90">
            {isAr ? 'اسأل بالدليل الموثق من الكتاب والسنة' : 'Ask with Verified Evidence'}
          </h4>
          <p className="text-xs text-[#F2F4FF]/60 max-w-lg mx-auto leading-relaxed">
            {isAr
              ? 'يقوم النظام بتوسيع السؤال إلى جذوره الشرعية، والبحث في كتب السنة السبعة وفهرس القرآن الكريم، ثم التحقق من النص دون افتئات على الأحكام أو تخمين.'
              : 'Expands query into classical terminology, searches the 7 Hadith collections and Quran index, and verifies citations strictly from primary texts.'}
          </p>
        </div>
      )}
    </div>
  );
};
