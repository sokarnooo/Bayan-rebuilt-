import React, { useState } from 'react';
import type { InterfaceLanguage } from '../../types';
import { Send, ShieldAlert, BookOpen } from 'lucide-react';

interface AskModeProps {
  language: InterfaceLanguage;
}

export const AskMode: React.FC<AskModeProps> = ({ language }) => {
  const [question, setQuestion] = useState('');
  const isAr = language === 'ar';

  return (
    <div className="space-y-6">
      {/* Search Input Box (NO OCR button per brief) */}
      <div className="rounded-xl bg-[#12183F] border border-[#6150EA]/30 p-4 shadow-lg focus-within:border-[#2EF2C2]/60 transition">
        <div className="flex items-center justify-between mb-2">
          <label className="text-sm font-medium text-[#F2F4FF]/90">
            {isAr ? 'السؤال أو الدعوى الدينية المراد فحصها:' : 'Religious claim or question to examine:'}
          </label>
          <span className="text-xs text-[#2EF2C2] bg-[#2EF2C2]/10 border border-[#2EF2C2]/20 px-2 py-0.5 rounded">
            {isAr ? 'استرجاع بالمتجهات الدلالية' : 'Vector Retrieval'}
          </span>
        </div>

        <div className="relative">
          <textarea
            rows={3}
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            placeholder={
              isAr
                ? 'اطرح سؤالاً باللغة العربية أو الإنجليزية (مثال: «هل ورد حديث في النهي عن كذا؟» أو «هل ذُكر كذا في القرآن؟»)...'
                : 'Ask a question in Arabic or English (e.g. "Is there a hadith forbidding X?" or "Is X mentioned in the Quran?")...'
            }
            className="w-full bg-[#12183F]/70 border border-[#6150EA]/20 rounded-lg p-3 text-[#F2F4FF] placeholder-[#F2F4FF]/30 focus:outline-none focus:border-[#6150EA] text-base leading-relaxed"
          />
        </div>

        <div className="mt-3 flex items-center justify-between pt-2 border-t border-[#6150EA]/15">
          <p className="text-xs text-[#F2F4FF]/50">
            {isAr
              ? 'توليد ملخص مقيد حصراً بالنصوص المسترجعة، ولا يُفتى في الدين قط دون نص صريح.'
              : 'Answers strictly bounded by retrieved authentic texts; never acting as a mufti.'}
          </p>
          <button
            type="button"
            disabled={!question.trim()}
            className="inline-flex items-center gap-2 px-5 py-2 rounded-lg bg-[#6150EA] hover:bg-[#6150EA]/90 text-[#F2F4FF] font-medium text-sm transition disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <Send className="w-4 h-4 rtl:rotate-180" />
            <span>{isAr ? 'فحص الدعوى' : 'Examine Claim'}</span>
          </button>
        </div>
      </div>

      {/* Trust & Boundary Notice */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="p-4 rounded-xl border border-[#6150EA]/20 bg-[#12183F]/40 flex items-start gap-3">
          <BookOpen className="w-5 h-5 text-[#2EF2C2] shrink-0 mt-0.5" />
          <div className="text-xs text-[#F2F4FF]/75 leading-relaxed">
            <strong className="block text-[#F2F4FF] mb-1 font-semibold">
              {isAr ? 'الاستدلال بالنص وحده' : 'Evidence-Only Grounding'}
            </strong>
            {isAr
              ? 'تُعرض الأدلة المؤيدة أو المعارضة من القرآن والأحاديث مع درجة التوثيق، دون استنتاج فقهي مفتوح.'
              : 'Shows supporting or refuting Quranic and Hadith texts with citations, without unfettered extrapolation.'}
          </div>
        </div>

        <div className="p-4 rounded-xl border border-[#6150EA]/20 bg-[#12183F]/40 flex items-start gap-3">
          <ShieldAlert className="w-5 h-5 text-[#6150EA] shrink-0 mt-0.5" />
          <div className="text-xs text-[#F2F4FF]/75 leading-relaxed">
            <strong className="block text-[#F2F4FF] mb-1 font-semibold">
              {isAr ? 'الإحالة الصارمة لأهل العلم' : 'Strict Scholar Referral'}
            </strong>
            {isAr
              ? 'إذا قلت نسبة الثقة عن 70% أو كان النص غير جازم، يحال المستعلم فوراً إلى أهل العلم المعتمدين.'
              : 'If confidence falls below 70% or the source is inconclusive, Bayan refers directly to scholars.'}
          </div>
        </div>
      </div>
    </div>
  );
};
