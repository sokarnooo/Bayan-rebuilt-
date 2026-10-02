import React from 'react';
import type { AppMode, InterfaceLanguage } from '../../types';
import { BookOpen, ScrollText, MessageSquareQuote } from 'lucide-react';

interface ModeNavProps {
  currentMode: AppMode;
  onModeChange: (mode: AppMode) => void;
  language: InterfaceLanguage;
}

export const ModeNav: React.FC<ModeNavProps> = ({
  currentMode,
  onModeChange,
  language,
}) => {
  const isAr = language === 'ar';

  const modes: { id: AppMode; labelAr: string; labelEn: string; icon: React.FC<{ className?: string }> }[] = [
    { id: 'ayah', labelAr: 'آيـة', labelEn: 'Ayah', icon: BookOpen },
    { id: 'hadith', labelAr: 'حـديـث', labelEn: 'Hadith', icon: ScrollText },
    { id: 'ask', labelAr: 'اسـأل بالـدليـل', labelEn: 'Ask with Proof', icon: MessageSquareQuote },
  ];

  return (
    <nav className="flex rounded-xl bg-[#12183F] p-1.5 border border-[#6150EA]/30 gap-1.5 shadow-inner">
      {modes.map((m) => {
        const Icon = m.icon;
        const isActive = currentMode === m.id;
        return (
          <button
            key={m.id}
            type="button"
            onClick={() => onModeChange(m.id)}
            className={`flex-1 flex items-center justify-center gap-2.5 py-3 px-4 rounded-lg font-medium text-sm transition-all duration-150 ${
              isActive
                ? 'bg-[#6150EA] text-[#F2F4FF] shadow-md shadow-[#6150EA]/40 font-bold'
                : 'text-[#F2F4FF]/70 hover:text-[#F2F4FF] hover:bg-[#6150EA]/15'
            }`}
          >
            <Icon className={`w-4 h-4 ${isActive ? 'text-[#2EF2C2]' : 'text-[#F2F4FF]/60'}`} />
            <span>{isAr ? m.labelAr : m.labelEn}</span>
          </button>
        );
      })}
    </nav>
  );
};
