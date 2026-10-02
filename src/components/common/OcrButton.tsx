import React, { useRef, useState } from 'react';
import type { InterfaceLanguage } from '../../types';
import { Camera, Image as ImageIcon, Loader2 } from 'lucide-react';

interface OcrButtonProps {
  language: InterfaceLanguage;
  onTextExtracted: (text: string) => void;
}

export const OcrButton: React.FC<OcrButtonProps> = ({ language, onTextExtracted }) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [loading, setLoading] = useState(false);
  const isAr = language === 'ar';

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setLoading(true);
    try {
      const reader = new FileReader();
      reader.onload = async () => {
        const base64 = reader.result as string;
        try {
          const res = await fetch('/api/ocr', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ imageBase64: base64 }),
          });
          const data = await res.json();
          if (data.text) {
            onTextExtracted(data.text);
          }
        } catch (err) {
          console.error('OCR failed:', err);
        } finally {
          setLoading(false);
        }
      };
      reader.readAsDataURL(file);
    } catch (err) {
      console.error(err);
      setLoading(false);
    }
  };

  return (
    <div>
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
        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#6150EA]/20 hover:bg-[#6150EA]/35 text-[#2EF2C2] border border-[#2EF2C2]/30 text-xs font-medium transition disabled:opacity-50"
      >
        {loading ? (
          <Loader2 className="w-3.5 h-3.5 animate-spin" />
        ) : (
          <Camera className="w-3.5 h-3.5" />
        )}
        <span>{isAr ? 'استخراج من صورة (OCR)' : 'OCR from Image'}</span>
      </button>
    </div>
  );
};
