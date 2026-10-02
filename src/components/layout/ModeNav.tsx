import React from 'react';
import type { AppMode, InterfaceLanguage } from '../../types';
import { Sparkles, ScrollText, MessageSquareQuote } from 'lucide-react';

interface ModeNavProps {
  currentMode: AppMode;
  onModeChange: (mode: AppMode) => void;
  language: InterfaceLanguage;
}

export const ModeNav: React.FC<ModeNavProps> = ({ currentMode, onModeChange, language }) => {
  const isAr = language === 'ar';

  const modes: Array<{
    id: AppMode;
    titleAr: string;
    titleEn: string;
    descAr: string;
    descEn: string;
    icon: React.ReactNode;
  }> = [
    {
      id: 'ayah',
      titleAr: 'آية',
      titleEn: 'Ayah',
      descAr: 'التحقق من الآيات القرآنية والتفسير',
      descEn: 'Match Quranic verse & tafsir',
      icon: <Sparkles className="w-4 h-4" />,
    },
    {
      id: 'hadith',
      titleAr: 'حديث',
      titleEn: 'Hadith',
      descAr: 'تخريج الحديث وعرض درجات العلماء',
      descEn: 'Hadith takhrij & grader ratings',
      icon: <ScrollText className="w-4 h-4" />,
    },
    {
      id: 'ask',
      titleAr: 'اسأل بالدليل',
      titleEn: 'Ask with Evidence',
      descAr: 'استعلام استدلالي محكوم بالنصوص المسترجعة',
      descEn: 'Retrieval-augmented verification',
      icon: <MessageSquareQuote className="w-4 h-4" />,
    },
  ];

  return (
    <div className="w-full">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 p-1.5 rounded-xl bg-[#12183F]/80 border border-[#6150EA]/25 shadow-inner">
        {modes.map((m) => {
          const isActive = currentMode === m.id;
          return (
            <button
              key={m.id}
              type="button"
              onClick={() => onModeChange(m.id)}
              className={`flex flex-col text-start px-4 py-3 rounded-lg transition border text-start ${
                isActive
                  ? 'bg-[#6150EA]/25 border-[#2EF2C2]/50 text-[#F2F4FF] shadow-sm'
                  : 'border-transparent text-[#F2F4FF]/70 hover:text-[#F2F4FF] hover:bg-[#6150EA]/10'
              }`}
            >
              <div className="flex items-center gap-2 mb-1">
                <span className={isActive ? 'text-[#2EF2C2]' : 'text-[#6150EA]'}>
                  {m.icon}
                </span>
                <span className="font-semibold text-base">
                  {isAr ? m.titleAr : m.titleEn}
                </span>
              </div>
              <span className="text-xs text-[#F2F4FF]/60 line-clamp-1">
                {isAr ? m.descAr : m.descEn}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
};
