import React, { useState } from 'react';
import type { InterfaceLanguage } from '../../types';
import { OcrButton } from '../common/OcrButton';
import { Search, ScrollText } from 'lucide-react';

interface HadithModeProps {
  language: InterfaceLanguage;
}

export const HadithMode: React.FC<HadithModeProps> = ({ language }) => {
  const [query, setQuery] = useState('');
  const isAr = language === 'ar';

  return (
    <div className="space-y-6">
      <div className="rounded-xl bg-[#12183F] border border-[#6150EA]/30 p-4 shadow-xl focus-within:border-[#2EF2C2]/60 transition">
        <div className="flex items-center justify-between mb-2">
          <label className="text-sm font-medium text-[#F2F4FF]/90">
            {isAr ? 'متن الحديث أو طرف منه:' : 'Hadith text or opening phrase:'}
          </label>
          <OcrButton
            language={language}
            onTextExtracted={(extractedText) => setQuery(extractedText)}
          />
        </div>

        <div className="relative">
          <textarea
            rows={3}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            dir="rtl"
            lang="ar"
            placeholder={
              isAr
                ? 'اكتب أو الصق نص الحديث النبوي الشريف هنا للتخريج وعرض الحكم والدرجة...'
                : 'Type or paste Hadith text here for takhrij and grader rulings...'
            }
            className="w-full bg-[#12183F]/70 border border-[#6150EA]/20 rounded-lg p-3 text-[#F2F4FF] placeholder-[#F2F4FF]/30 focus:outline-none focus:border-[#2EF2C2]/70 font-quran text-xl leading-relaxed resize-y"
          />
        </div>

        <div className="mt-4 flex items-center justify-between pt-3 border-t border-[#6150EA]/15">
          <p className="text-xs text-[#F2F4FF]/50">
            {isAr
              ? 'تخريج دقيق من الكتب السبعة (البخاري ومسلم والسنن الأربعة والأربعين النووية).'
              : 'Scholarly takhrij across the 7 major books with grader attribution.'}
          </p>
          <button
            type="button"
            disabled={!query.trim()}
            className="inline-flex items-center gap-2 px-6 py-2 rounded-lg bg-[#6150EA] hover:bg-[#6150EA]/90 text-[#F2F4FF] font-medium text-sm transition disabled:opacity-40 disabled:cursor-not-allowed shadow-md cursor-pointer"
          >
            <Search className="w-4 h-4 text-[#2EF2C2]" />
            <span>{isAr ? 'تخريج الحديث' : 'Verify Hadith'}</span>
          </button>
        </div>
      </div>

      <div className="p-8 text-center rounded-xl border border-dashed border-[#6150EA]/20 bg-[#12183F]/40">
        <ScrollText className="w-8 h-8 text-[#6150EA]/60 mx-auto mb-2" />
        <p className="text-sm text-[#F2F4FF]/60 max-w-md mx-auto leading-relaxed">
          {isAr
            ? 'خاصية تخريج الأحاديث جاهزة للخطوة التالية مع درجات الحفاظ المعتمدة.'
            : 'Hadith takhrij mode ready for step 2 with authenticated grader rulings.'}
        </p>
      </div>
    </div>
  );
};
