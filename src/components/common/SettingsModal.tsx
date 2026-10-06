import React, { useState, useEffect } from 'react';
import type { InterfaceLanguage } from '../../types';
import { Settings, Key, X, Check, ExternalLink, ShieldCheck } from 'lucide-react';

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
      <div className="bg-[#12183F] border border-[#6150EA]/40 rounded-2xl w-full max-w-md p-6 shadow-2xl relative text-[#F2F4FF]">
        {/* Header */}
        <div className="flex items-center justify-between mb-4 border-b border-[#6150EA]/20 pb-3">
          <div className="flex items-center gap-2 text-[#2EF2C2]">
            <Settings className="w-5 h-5" />
            <h3 className="font-bold text-lg text-[#F2F4FF]">
              {isAr ? 'إعدادات المفتاح والميزات' : 'Settings & API Key'}
            </h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded-lg text-[#F2F4FF]/70 hover:text-[#F2F4FF] hover:bg-[#6150EA]/20 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="space-y-4 text-sm">
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
      </div>
    </div>
  );
};
