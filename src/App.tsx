import React, { useState, useEffect } from 'react';
import type { AppMode, InterfaceLanguage } from './types';
import { Header } from './components/layout/Header';
import { ModeNav } from './components/layout/ModeNav';
import { AyahMode } from './components/modes/AyahMode';
import { HadithMode } from './components/modes/HadithMode';
import { AskMode } from './components/modes/AskMode';
import { ShieldCheck } from 'lucide-react';

export default function App() {
  const [currentMode, setCurrentMode] = useState<AppMode>('ayah');
  const [language, setLanguage] = useState<InterfaceLanguage>('ar');

  useEffect(() => {
    document.documentElement.lang = language;
    document.documentElement.dir = language === 'ar' ? 'rtl' : 'ltr';
  }, [language]);

  const isAr = language === 'ar';

  return (
    <div className="min-h-screen bg-[#12183F] text-[#F2F4FF] flex flex-col font-sans">
      <Header language={language} onLanguageChange={setLanguage} />

      <main className="flex-1 max-w-5xl w-full mx-auto px-4 sm:px-6 py-8">
        {/* Intro Mission Banner */}
        <section className="mb-8 text-center sm:text-start flex flex-col sm:flex-row items-center justify-between gap-4 p-6 rounded-2xl bg-gradient-to-r from-[#6150EA]/15 via-[#12183F] to-[#12183F] border border-[#6150EA]/30">
          <div>
            <h2 className="text-xl sm:text-2xl font-bold text-[#F2F4FF] mb-1.5">
              {isAr
                ? 'تثبّت من صحة النصوص الشرعية بالدليل القاطع'
                : 'Verify Islamic texts against primary authentic sources'}
            </h2>
            <p className="text-sm text-[#F2F4FF]/75 max-w-2xl leading-relaxed">
              {isAr
                ? 'أداة علمية دقيقة لمطابقة الآيات، وتخريج الأحاديث بدرجات أئمة الحديث، مع بيان الأقوال دون افتئات، وإحالة ما يشتبه إلى أهل العلم.'
                : 'A scholarly tool for Quranic verse matching and Hadith takhrij with named grader attributions and strict scholar referral.'}
            </p>
          </div>
          <div className="flex items-center gap-3 shrink-0">
            <div className="text-center px-4 py-2 rounded-xl bg-[#12183F]/80 border border-[#2EF2C2]/40">
              <span className="block text-base font-bold text-[#2EF2C2]">100%</span>
              <span className="text-[11px] text-[#F2F4FF]/70">
                {isAr ? 'بيانات موثقة' : 'Verified Sources'}
              </span>
            </div>
            <div className="text-center px-4 py-2 rounded-xl bg-[#12183F]/80 border border-[#6150EA]/40">
              <span className="block text-base font-bold text-[#6150EA]">0%</span>
              <span className="text-[11px] text-[#F2F4FF]/70">
                {isAr ? 'تخمين أو توليد حر' : 'Zero Guesswork'}
              </span>
            </div>
          </div>
        </section>

        {/* 3 Modes */}
        <section className="mb-8">
          <ModeNav
            currentMode={currentMode}
            onModeChange={setCurrentMode}
            language={language}
          />
        </section>

        {/* Active Mode Body */}
        <section className="transition-all duration-200">
          {currentMode === 'ayah' && <AyahMode language={language} />}
          {currentMode === 'hadith' && <HadithMode language={language} />}
          {currentMode === 'ask' && <AskMode language={language} />}
        </section>
      </main>

      {/* Footer */}
      <footer className="border-t border-[#6150EA]/20 bg-[#12183F]/90 py-6 text-center text-xs text-[#F2F4FF]/60">
        <div className="max-w-5xl mx-auto px-4 flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-[#2EF2C2]" />
            <span>
              {isAr
                ? 'مشروع بيان — تحدي الذكاء الاصطناعي في خدمة المحتوى الإسلامي'
                : 'Bayan Project — AI in Service of Islamic Content Challenge'}
            </span>
          </div>
          <div className="flex items-center gap-4 text-[#F2F4FF]/50">
            <span>مصحف مجمع الملك فهد</span>
            <span>كتب السنة المعتمدة</span>
            <span>التفسير الميسر</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
