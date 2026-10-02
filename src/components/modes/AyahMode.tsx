import React, { useState } from 'react';
import type { InterfaceLanguage } from '../../types';
import { OcrButton } from '../common/OcrButton';
import { Search } from 'lucide-react';

interface AyahModeProps {
  language: InterfaceLanguage;
}

export const AyahMode: React.FC<AyahModeProps> = ({ language }) => {
  const [query, setQuery] = useState('');
  const isAr = language === 'ar';

  return (
    <div className="space-y-6">
      {/* Search Input Box with embedded OCR */}
      <div className="rounded-xl bg-[#12183F] border border-[#6150EA]/30 p-4 shadow-lg focus-within:border-[#2EF2C2]/60 transition">
        <div className="flex items-center justify-between mb-2">
          <label className="text-sm font-medium text-[#F2F4FF]/90">
            {isAr ? 'نص الآية الكريمة أو جزء منها:' : 'Verse text or partial quote:'}
          </label>
          {/* Embedded OCR Button */}
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
                ? 'اكتب أو الصق نص الآية هنا (يقبل الأخطاء الإملائية والاقتباسات الجزئية)...'
                : 'Type or paste Quranic text here (tolerates typos and partial verses)...'
            }
            className="w-full bg-[#12183F]/70 border border-[#6150EA]/20 rounded-lg p-3 text-[#F2F4FF] placeholder-[#F2F4FF]/30 focus:outline-none focus:border-[#6150EA] font-serif text-lg leading-relaxed"
          />
        </div>

        <div className="mt-3 flex items-center justify-between pt-2 border-t border-[#6150EA]/15">
          <p className="text-xs text-[#F2F4FF]/50">
            {isAr
              ? 'مطابقة حتمية عبر مصحف مجمع الملك فهد (عاصم - حفص) مع التفسير الميسر.'
              : 'Deterministic matching against King Fahd Complex with Al-Muyassar tafsir.'}
          </p>
          <button
            type="button"
            disabled={!query.trim()}
            className="inline-flex items-center gap-2 px-5 py-2 rounded-lg bg-[#6150EA] hover:bg-[#6150EA]/90 text-[#F2F4FF] font-medium text-sm transition disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <Search className="w-4 h-4" />
            <span>{isAr ? 'تحقق من الآية' : 'Verify Verse'}</span>
          </button>
        </div>
      </div>

      {/* Empty State / Standby view */}
      <div className="p-8 text-center rounded-xl border border-dashed border-[#6150EA]/20 bg-[#12183F]/40">
        <p className="text-sm text-[#F2F4FF]/60 max-w-md mx-auto leading-relaxed">
          {isAr
            ? 'أدخل نص الآية أعلاه أو استخدم زر «استخراج من صورة» للبحث المباشر وعرض بيانات السورة والتفسير المعتمد.'
            : 'Enter verse text above or use "OCR Image" to match and view authentic chapter details and tafsir.'}
        </p>
      </div>
    </div>
  );
};
