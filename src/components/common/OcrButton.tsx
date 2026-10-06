import React, { useRef, useState, useEffect } from 'react';
import type { InterfaceLanguage } from '../../types';
import { Camera, Loader2, AlertCircle } from 'lucide-react';

interface OcrButtonProps {
  language: InterfaceLanguage;
  onTextExtracted: (text: string) => void;
  onQuotaNotice?: (notice: string) => void;
}

export const OcrButton: React.FC<OcrButtonProps> = ({
  language,
  onTextExtracted,
  onQuotaNotice,
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [loading, setLoading] = useState(false);
  const [remainingQuota, setRemainingQuota] = useState<number | null>(null);
  const isAr = language === 'ar';

  useEffect(() => {
    fetch('/api/quota')
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (typeof data?.remainingOcr === 'number') {
          setRemainingQuota(data.remainingOcr);
        }
      })
      .catch(() => {});
  }, []);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setLoading(true);
    try {
      const reader = new FileReader();
      reader.onload = async () => {
        const base64 = reader.result as string;
        try {
          const userKey = localStorage.getItem('bayan_user_gemini_key') || '';
          const headers: Record<string, string> = {
            'Content-Type': 'application/json',
          };
          if (userKey) {
            headers['x-gemini-api-key'] = userKey;
          }

          const res = await fetch('/api/ocr', {
            method: 'POST',
            headers,
            body: JSON.stringify({ imageBase64: base64, language, userApiKey: userKey || undefined }),
          });

          const data = await res.json();
          if (res.status === 429 || data.error === 'QUOTA_EXHAUSTED' || data.error === 'IP_RATE_LIMIT_EXCEEDED') {
            if (data.notice && onQuotaNotice) {
              onQuotaNotice(data.notice);
            }
          } else if (data.text) {
            onTextExtracted(data.text);
            if (remainingQuota !== null && remainingQuota > 0) {
              setRemainingQuota(remainingQuota - 1);
            }
          }
        } catch (err) {
          console.error('OCR failed:', err);
        } finally {
          setLoading(false);
          if (fileInputRef.current) fileInputRef.current.value = '';
        }
      };
      reader.readAsDataURL(file);
    } catch (err) {
      console.error(err);
      setLoading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  return (
    <div className="flex items-center gap-2">
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        onChange={handleFileChange}
        className="hidden"
      />
      <button
        type="button"
        disabled={loading}
        onClick={() => fileInputRef.current?.click()}
        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#6150EA]/20 hover:bg-[#6150EA]/35 text-[#2EF2C2] border border-[#2EF2C2]/30 text-xs font-medium transition disabled:opacity-50 cursor-pointer"
      >
        {loading ? (
          <Loader2 className="w-3.5 h-3.5 animate-spin" />
        ) : (
          <Camera className="w-3.5 h-3.5" />
        )}
        <span>{isAr ? 'استخراج من صورة (OCR)' : 'OCR from Image'}</span>
        {remainingQuota !== null && (
          <span className="text-[10px] text-[#F2F4FF]/50 bg-[#12183F]/60 px-1.5 py-0.5 rounded border border-[#6150EA]/20 font-mono">
            {remainingQuota}
          </span>
        )}
      </button>
    </div>
  );
};

