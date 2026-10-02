import React from 'react';
import { BookOpen, ShieldCheck, Globe } from 'lucide-react';
import type { InterfaceLanguage } from '../../types';

interface HeaderProps {
  language: InterfaceLanguage;
  onLanguageChange: (lang: InterfaceLanguage) => void;
}

export const Header: React.FC<HeaderProps> = ({ language, onLanguageChange }) => {
  const isAr = language === 'ar';

  return (
    <header className="border-b border-[#6150EA]/20 bg-[#12183F]/90 backdrop-blur-md sticky top-0 z-40">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 h-20 flex items-center justify-between">
        {/* Brand identity */}
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-lg bg-[#6150EA]/15 border border-[#6150EA]/40 flex items-center justify-center text-[#2EF2C2]">
            <BookOpen className="w-6 h-6 stroke-[2.2]" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-bold tracking-tight text-[#F2F4FF]">
                {isAr ? 'بَيَان' : 'Bayan'}
              </h1>
              <span className="text-xs px-2 py-0.5 rounded border border-[#2EF2C2]/40 bg-[#2EF2C2]/10 text-[#2EF2C2] font-medium">
                {isAr ? 'تثبّت وتوثيق' : 'Verification'}
              </span>
            </div>
            <p className="text-xs text-[#F2F4FF]/70">
              {isAr
                ? 'فحص دعاوى القرآن والسنة بالرجوع إلى المصادر المعتمدة'
                : 'Verifying Quran and Hadith claims against authentic sources'}
            </p>
          </div>
        </div>

        {/* Language switch & trust indicator */}
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => onLanguageChange(isAr ? 'en' : 'ar')}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-[#6150EA]/30 hover:border-[#6150EA] hover:bg-[#6150EA]/10 text-xs text-[#F2F4FF] transition"
            title={isAr ? 'Switch to English' : 'التحويل إلى العربية'}
          >
            <Globe className="w-3.5 h-3.5 text-[#2EF2C2]" />
            <span>{isAr ? 'English' : 'العربية'}</span>
          </button>
        </div>
      </div>
    </header>
  );
};
