import React, { useState } from 'react';
import type { InterfaceLanguage } from '../../types';
import { MessageSquareQuote, Sparkles } from 'lucide-react';

interface AskModeProps {
  language: InterfaceLanguage;
}

export const AskMode: React.FC<AskModeProps> = ({ language }) => {
  const [question, setQuestion] = useState('');
  const isAr = language === 'ar';

  return (
    <div className="space-y-6">
      <div className="rounded-xl bg-[#12183F] border border-[#6150EA]/30 p-4 shadow-xl focus-within:border-[#2EF2C2]/60 transition">
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
              ? 'اطرح مسألتك ليقوم النظام بالبحث في المصادر الأصلية دون افتئات أو تخمين...'
              : 'Ask a religious question to retrieve primary evidence from authenticated texts...'
          }
          className="w-full bg-[#12183F]/70 border border-[#6150EA]/20 rounded-lg p-3 text-[#F2F4FF] placeholder-[#F2F4FF]/30 focus:outline-none focus:border-[#2EF2C2]/70 text-base leading-relaxed resize-y font-sans"
        />

        <div className="mt-4 flex items-center justify-between pt-3 border-t border-[#6150EA]/15">
          <p className="text-xs text-[#F2F4FF]/50">
            {isAr
              ? 'توسيع استعلام ذكي واسترجاع الكلمات المفتاحية — إحالة ما لا نص فيه لأهل العلم.'
              : 'Scholarly query expansion with strict primary source grounded responses.'}
          </p>
          <button
            type="button"
            disabled={!question.trim()}
            className="inline-flex items-center gap-2 px-6 py-2 rounded-lg bg-[#6150EA] hover:bg-[#6150EA]/90 text-[#F2F4FF] font-medium text-sm transition disabled:opacity-40 disabled:cursor-not-allowed shadow-md cursor-pointer"
          >
            <Sparkles className="w-4 h-4 text-[#2EF2C2]" />
            <span>{isAr ? 'ابحث بالدليل' : 'Ask with Proof'}</span>
          </button>
        </div>
      </div>

      <div className="p-8 text-center rounded-xl border border-dashed border-[#6150EA]/20 bg-[#12183F]/40">
        <MessageSquareQuote className="w-8 h-8 text-[#6150EA]/60 mx-auto mb-2" />
        <p className="text-sm text-[#F2F4FF]/60 max-w-md mx-auto leading-relaxed">
          {isAr
            ? 'وضع «اسأل بالدليل» سينطلق بعد مرحلة الأحاديث وفق المواصفات المحددة.'
            : 'Ask with Proof mode will be activated in step 3 per the prompt specification.'}
        </p>
      </div>
    </div>
  );
};
