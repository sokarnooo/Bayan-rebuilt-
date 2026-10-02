import React from 'react';
import type { InterfaceLanguage } from '../../types';
import { BookMarked, Globe, Shield } from 'lucide-react';

interface HeaderProps {
  language: InterfaceLanguage;
  onLanguageChange: (lang: InterfaceLanguage) => void;
}

export const Header: React.FC<HeaderProps> = ({ language, onLanguageChange }) => {
  const isAr = language === 'ar';

  return (
    <header className="border-b border-[#6150EA]/25 bg-[#12183F]/95 backdrop-blur-md sticky top-0 z-50">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
        {/* App Title & Logo */}
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#6150EA] to-[#2EF2C2] p-0.5 flex items-center justify-center shadow-lg shadow-[#6150EA]/30">
            <div className="w-full h-full bg-[#12183F] rounded-[10px] flex items-center justify-center">
              <BookMarked className="w-5 h-5 text-[#2EF2C2]" />
            </div>
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-bold tracking-tight text-[#F2F4FF]">بَيَان</h1>
              <span className="text-xs px-2 py-0.5 rounded-full bg-[#6150EA]/30 text-[#2EF2C2] border border-[#2EF2C2]/40 font-mono">
                Bayan v1.0
              </span>
            </div>
            <p className="text-[11px] text-[#F2F4FF]/60 font-sans">
              {isAr ? 'التحقق الشرعي القطعي بالدليل والدرجة' : 'Authoritative Islamic Text Verification'}
            </p>
          </div>
        </div>

        {/* Header Right: Badges & Language Switcher */}
        <div className="flex items-center gap-3">
          <div className="hidden sm:flex items-center gap-1.5 px-3 py-1 rounded-lg bg-[#6150EA]/15 border border-[#6150EA]/30 text-xs text-[#F2F4FF]/80">
            <Shield className="w-3.5 h-3.5 text-[#2EF2C2]" />
            <span>{isAr ? 'بيانات أصلية غير مولدة' : 'Grounded Authentic Data'}</span>
          </div>

          <button
            type="button"
            onClick={() => onLanguageChange(isAr ? 'en' : 'ar')}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-[#6150EA]/30 bg-[#12183F] hover:bg-[#6150EA]/20 text-xs font-medium text-[#F2F4FF] transition"
            title={isAr ? 'Switch to English' : 'التحويل إلى العربية'}
          >
            <Globe className="w-3.5 h-3.5 text-[#2EF2C2]" />
            <span>{isAr ? 'English' : 'عربي'}</span>
          </button>
        </div>
      </div>
    </header>
  );
};
