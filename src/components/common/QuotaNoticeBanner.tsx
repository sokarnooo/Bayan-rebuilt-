import React from 'react';
import type { InterfaceLanguage } from '../../types';
import { AlertCircle, X, Settings } from 'lucide-react';

interface QuotaNoticeBannerProps {
  language: InterfaceLanguage;
  noticeText: string;
  onDismiss: () => void;
  onOpenSettings: () => void;
}

export const QuotaNoticeBanner: React.FC<QuotaNoticeBannerProps> = ({
  language,
  noticeText,
  onDismiss,
  onOpenSettings,
}) => {
  const isAr = language === 'ar';

  return (
    <aside aria-label="Quota Notice" className="mb-6 p-4 rounded-xl bg-[#6150EA]/20 border border-[#6150EA]/50 text-[#F2F4FF] shadow-lg flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 animate-fadeIn">
      <div className="flex items-start gap-2.5">
        <AlertCircle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
        <p className="text-xs sm:text-sm leading-relaxed text-[#F2F4FF]/90 font-medium">
          {noticeText}
        </p>
      </div>

      <div className="flex items-center gap-2 self-end sm:self-center shrink-0">
        <button
          type="button"
          onClick={onOpenSettings}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#6150EA]/40 hover:bg-[#6150EA]/60 text-[#2EF2C2] border border-[#2EF2C2]/40 text-xs font-medium transition"
        >
          <Settings className="w-3.5 h-3.5" />
          <span>{isAr ? 'إدخال مفتاحي' : 'Use My Key'}</span>
        </button>
        <button
          type="button"
          onClick={onDismiss}
          className="p-1.5 rounded-lg text-[#F2F4FF]/60 hover:text-[#F2F4FF] hover:bg-[#6150EA]/20 transition"
          title={isAr ? 'إغلاق الإشعار' : 'Dismiss notice'}
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    </aside>
  );
};
