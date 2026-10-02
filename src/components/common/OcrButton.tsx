import React, { useRef, useState } from 'react';
import { Camera, Loader2 } from 'lucide-react';

interface OcrButtonProps {
  onTextExtracted: (text: string) => void;
  language: 'ar' | 'en';
  disabled?: boolean;
}

export const OcrButton: React.FC<OcrButtonProps> = ({
  onTextExtracted,
  language,
  disabled = false,
}) => {
  const [isProcessing, setIsProcessing] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const isAr = language === 'ar';

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      setIsProcessing(true);
      // Read file as base64
      const reader = new FileReader();
      reader.onload = async () => {
        try {
          const base64Data = (reader.result as string).split(',')[1];
          const response = await fetch('/api/ocr', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              image: base64Data,
              mimeType: file.type,
            }),
          });
          const result = await response.json();
          if (result.text) {
            onTextExtracted(result.text);
          }
        } catch (err) {
          console.error('OCR Extraction error:', err);
        } finally {
          setIsProcessing(false);
        }
      };
      reader.readAsDataURL(file);
    } catch (err) {
      console.error(err);
      setIsProcessing(false);
    } finally {
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  return (
    <div className="relative inline-flex items-center">
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handleFileChange}
        disabled={disabled || isProcessing}
      />
      <button
        type="button"
        disabled={disabled || isProcessing}
        onClick={() => fileInputRef.current?.click()}
        title={isAr ? 'قراءة النص من صورة (OCR)' : 'Extract Arabic text from image (OCR)'}
        className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-md bg-[#12183F] border border-[#6150EA]/40 text-[#F2F4FF] hover:border-[#2EF2C2] hover:text-[#2EF2C2] transition disabled:opacity-50"
      >
        {isProcessing ? (
          <Loader2 className="w-3.5 h-3.5 animate-spin text-[#2EF2C2]" />
        ) : (
          <Camera className="w-3.5 h-3.5 text-[#2EF2C2]" />
        )}
        <span>{isProcessing ? (isAr ? 'جاري القراءة...' : 'Processing...') : (isAr ? 'استخراج من صورة' : 'OCR Image')}</span>
      </button>
    </div>
  );
};
