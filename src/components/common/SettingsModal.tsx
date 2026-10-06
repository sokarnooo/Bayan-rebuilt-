import React, { useState, useEffect } from 'react';
import type { InterfaceLanguage } from '../../types';
import { Settings, Key, X, Check, ExternalLink, ShieldCheck, BookOpen, Layers } from 'lucide-react';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  language: InterfaceLanguage;
  onKeySaved: (key: string | null) => void;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen,
  onClose,
  language,
  onKeySaved,
}) => {
  const [activeTab, setActiveTab] = useState<'settings' | 'sources'>('settings');
  const [apiKey, setApiKey] = useState('');
  const [isSaved, setIsSaved] = useState(false);
  const isAr = language === 'ar';

  useEffect(() => {
    if (isOpen) {
      const storedKey = localStorage.getItem('bayan_user_gemini_key') || '';
      setApiKey(storedKey);
      setIsSaved(false);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleSave = () => {
    const trimmed = apiKey.trim();
    if (trimmed) {
      localStorage.setItem('bayan_user_gemini_key', trimmed);
      onKeySaved(trimmed);
    } else {
      localStorage.removeItem('bayan_user_gemini_key');
      onKeySaved(null);
    }
    setIsSaved(true);
    setTimeout(() => {
      onClose();
    }, 800);
  };

  const handleClear = () => {
    localStorage.removeItem('bayan_user_gemini_key');
    setApiKey('');
    onKeySaved(null);
    setIsSaved(true);
    setTimeout(() => {
      onClose();
    }, 800);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-fadeIn">
      <div className="bg-[#12183F] border border-[#6150EA]/40 rounded-2xl w-full max-w-xl p-6 shadow-2xl relative text-[#F2F4FF] max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between mb-4 border-b border-[#6150EA]/20 pb-3 shrink-0">
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 text-[#2EF2C2]">
              <Settings className="w-5 h-5" />
              <h3 className="font-bold text-lg text-[#F2F4FF]">
                {isAr ? 'الإعدادات وسجل المصادر' : 'Settings & Sources Register'}
              </h3>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded-lg text-[#F2F4FF]/70 hover:text-[#F2F4FF] hover:bg-[#6150EA]/20 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab Switcher */}
        <div className="flex border-b border-[#6150EA]/20 mb-4 shrink-0">
          <button
            type="button"
            onClick={() => setActiveTab('settings')}
            className={`pb-2.5 px-4 text-xs font-semibold border-b-2 transition flex items-center gap-1.5 ${
              activeTab === 'settings'
                ? 'border-[#2EF2C2] text-[#2EF2C2]'
                : 'border-transparent text-[#F2F4FF]/60 hover:text-[#F2F4FF]'
            }`}
          >
            <Key className="w-3.5 h-3.5" />
            <span>{isAr ? 'مفتاح Gemini والحصة' : 'API Key & Quota'}</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('sources')}
            className={`pb-2.5 px-4 text-xs font-semibold border-b-2 transition flex items-center gap-1.5 ${
              activeTab === 'sources'
                ? 'border-[#2EF2C2] text-[#2EF2C2]'
                : 'border-transparent text-[#F2F4FF]/60 hover:text-[#F2F4FF]'
            }`}
          >
            <BookOpen className="w-3.5 h-3.5" />
            <span>{isAr ? 'سجل المصادر والتراخيص' : 'Sources & Licences'}</span>
          </button>
        </div>

        {/* Scrollable Tab Content */}
        <div className="overflow-y-auto space-y-4 text-sm flex-1 pr-1">
          {activeTab === 'settings' ? (
            <div className="space-y-4">
              <div className="p-3.5 rounded-xl bg-[#6150EA]/15 border border-[#6150EA]/30 text-xs leading-relaxed text-[#F2F4FF]/80 flex items-start gap-2.5">
                <ShieldCheck className="w-4 h-4 text-[#2EF2C2] shrink-0 mt-0.5" />
                <p>
                  {isAr
                    ? 'يوفر خادم "بيان" حصة مجانية متجددة كل ساعة. إذا أردت تجاوز حدود الحصة، يمكنك إدخال مفتاحك الخاص من Google AI Studio؛ يُحفظ محلياً في متصفحك فقط.'
                    : 'Bayan provides an hourly refreshed free AI quota. To bypass limits, you can provide your own Google AI Studio key; it is stored only locally in your browser.'}
                </p>
              </div>

              <div>
                <label className="block text-xs font-medium text-[#F2F4FF]/80 mb-1.5 flex items-center justify-between">
                  <span className="flex items-center gap-1.5">
                    <Key className="w-3.5 h-3.5 text-[#2EF2C2]" />
                    {isAr ? 'مفتاح Google Gemini الخاص (اختياري)' : 'Custom Google Gemini API Key (Optional)'}
                  </span>
                  <a
                    href="https://aistudio.google.com/app/apikey"
                    target="_blank"
                    rel="noreferrer"
                    className="text-[11px] text-[#2EF2C2] hover:underline inline-flex items-center gap-1"
                  >
                    <span>{isAr ? 'الحصول على مفتاح' : 'Get Key'}</span>
                    <ExternalLink className="w-3 h-3" />
                  </a>
                </label>
                <input
                  type="password"
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  placeholder={isAr ? 'AIzaSy...' : 'AIzaSy...'}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-[#12183F]/80 border border-[#6150EA]/40 focus:border-[#2EF2C2] focus:outline-none text-sm font-mono text-[#F2F4FF]"
                />
              </div>

              {/* Action buttons */}
              <div className="flex items-center justify-end gap-2.5 pt-2">
                {apiKey && (
                  <button
                    type="button"
                    onClick={handleClear}
                    className="px-3 py-2 rounded-xl text-xs font-medium text-[#F2F4FF]/60 hover:text-red-300 hover:bg-red-500/10 transition"
                  >
                    {isAr ? 'حذف المفتاح' : 'Remove Key'}
                  </button>
                )}
                <button
                  type="button"
                  onClick={onClose}
                  className="px-4 py-2 rounded-xl text-xs font-medium text-[#F2F4FF]/80 hover:bg-[#6150EA]/20 border border-[#6150EA]/30 transition"
                >
                  {isAr ? 'إلغاء' : 'Cancel'}
                </button>
                <button
                  type="button"
                  onClick={handleSave}
                  className="px-5 py-2 rounded-xl text-xs font-bold bg-[#6150EA] hover:bg-[#6150EA]/90 text-white shadow-lg shadow-[#6150EA]/30 transition flex items-center gap-1.5"
                >
                  {isSaved ? (
                    <>
                      <Check className="w-3.5 h-3.5 text-[#2EF2C2]" />
                      <span>{isAr ? 'تم الحفظ' : 'Saved'}</span>
                    </>
                  ) : (
                    <span>{isAr ? 'حفظ الإعدادات' : 'Save'}</span>
                  )}
                </button>
              </div>
            </div>
          ) : (
            <div className="space-y-3 text-xs">
              <p className="text-[#F2F4FF]/75 leading-relaxed">
                {isAr
                  ? 'يعتمد "بيان" على مصادر معتمدة محددة؛ وكل حكم أو نص يُعرض منسوباً لمصدره الأصلي دون افتئات أو توليد آلي:'
                  : 'Bayan strictly relies on documented Islamic sources; every text and grade is attributed without generative hallucination:'}
              </p>

              <div className="space-y-2.5">
                {/* HadeethEnc entry */}
                <div className="p-3 rounded-xl bg-[#2EF2C2]/10 border border-[#2EF2C2]/30 space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-[#2EF2C2] text-sm">
                      {isAr ? 'موسوعة الأحاديث النبوية (HadeethEnc)' : 'Encyclopedia of Prophetic Hadiths (HadeethEnc)'}
                    </span>
                    <a
                      href="https://hadeethenc.com"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-[11px] text-sky-400 hover:underline inline-flex items-center gap-1 font-mono"
                    >
                      <span>hadeethenc.com</span>
                      <ExternalLink className="w-3 h-3" />
                    </a>
                  </div>
                  <p className="text-[#F2F4FF]/80 leading-relaxed">
                    {isAr
                      ? 'الاستخدام: مصدر متقدم لتخريج الأحاديث بدرجاتها المعتمدة، وشروحها المبسطة، وفوائدها المستنبطة، وترجماتها المعتمدة، ومعاني المفردات.'
                      : 'Usage: Advanced takhrij source for prophetic hadiths with documented grades, simplified explanations, lessons, translations, and word meanings.'}
                  </p>
                  <p className="text-[10px] text-[#F2F4FF]/50">
                    {isAr
                      ? 'الترخيص والحدود: متاح عبر واجهة HadeethEnc API الرسمية. تخضع الأحاديث لمهلة سريعة (٣ ثوانٍ) مع كاش محلي لمنع أي تعطل.'
                      : 'Licence & Limits: Integrated via the official HadeethEnc API with in-memory caching and strict 3s failover.'}
                  </p>
                </div>

                {/* Canonical Hadith Collections */}
                <div className="p-3 rounded-xl bg-[#6150EA]/15 border border-[#6150EA]/25 space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-[#F2F4FF]">
                      {isAr ? 'مجموعات الحديث السبع المعتمدة' : '7 Canonical Hadith Collections'}
                    </span>
                    <span className="text-[10px] text-[#2EF2C2] font-mono">٣٤٬١٩٥ حديثاً</span>
                  </div>
                  <p className="text-[#F2F4FF]/75">
                    {isAr
                      ? 'البخاري، مسلم، أبو داود، الترمذي، النسائي، ابن ماجه، الأربعون النووية. الدرجات مأخوذة من بيانات التخريج بأسماء أئمة الحديث (الألباني، شاكر، الأرنؤوط، وغيرهم).'
                      : 'Bukhari, Muslim, Abu Dawud, Tirmidhi, Nasai, Ibn Majah, Nawawi 40. Documented grader attributions (Al-Albani, Shakir, Al-Arnaut, etc.).'}
                  </p>
                </div>

                {/* Quran Corpus */}
                <div className="p-3 rounded-xl bg-[#6150EA]/15 border border-[#6150EA]/25 space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-[#F2F4FF]">
                      {isAr ? 'القرآن الكريم وترجمة Saheeh International' : 'Quran Corpus & Saheeh International'}
                    </span>
                    <span className="text-[10px] text-[#2EF2C2] font-mono">٦٬٢٣٦ آية</span>
                  </div>
                  <p className="text-[#F2F4FF]/75">
                    {isAr
                      ? 'نص المصحف بالرسم العثماني عبر مستودع ara-quranacademy، مع ترجمة Saheeh International المعتمدة.'
                      : 'Uthmani Quranic script via ara-quranacademy, alongside verified Saheeh International translation.'}
                  </p>
                </div>

                {/* Muyassar Tafsir */}
                <div className="p-3 rounded-xl bg-[#6150EA]/15 border border-[#6150EA]/25 space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-[#F2F4FF]">
                      {isAr ? 'التفسير الميسر — مجمع الملك فهد' : 'Al-Tafsir Al-Muyassar — King Fahd Complex'}
                    </span>
                    <span className="text-[10px] text-[#F2F4FF]/50 font-mono">عبر QuranEnc</span>
                  </div>
                  <p className="text-[#F2F4FF]/75">
                    {isAr
                      ? 'تفسير موجز معتمد لمجمع الملك فهد لطباعة المصحف الشريف بالمدينة المنورة.'
                      : 'Concise verified tafsir by King Fahd Glorious Quran Printing Complex.'}
                  </p>
                </div>

                {/* Dorar Fake Hadith */}
                <div className="p-3 rounded-xl bg-[#6150EA]/15 border border-[#6150EA]/25 space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-[#F2F4FF]">
                      {isAr ? 'قائمة الأحاديث المنتشرة التي لا تصح — الدرر السنية' : 'Unauthentic Circulated Sayings — Dorar.net'}
                    </span>
                    <a
                      href="https://dorar.net/fake-hadith"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-[11px] text-sky-400 hover:underline inline-flex items-center gap-1 font-mono"
                    >
                      <span>dorar.net</span>
                      <ExternalLink className="w-3 h-3" />
                    </a>
                  </div>
                  <p className="text-[#F2F4FF]/75">
                    {isAr
                      ? 'الأحكام مأخوذة كما هي في صفحة الدرر السنية مع رابط التحقق المباشر لكل قول.'
                      : 'Rulings documented verbatim from Dorar.net with direct verification links.'}
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
