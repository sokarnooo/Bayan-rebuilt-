import React, { useState, useEffect } from 'react';
import type { AppMode, InterfaceLanguage } from './types';
import { Header } from './components/layout/Header';
import { ModeNav } from './components/layout/ModeNav';
import { AyahMode } from './components/modes/AyahMode';
import { HadithMode } from './components/modes/HadithMode';
import { AskMode } from './components/modes/AskMode';
import { ShieldCheck, BookOpen, ScrollText } from 'lucide-react';

export default function App() {
  const [currentMode, setCurrentMode] = useState<AppMode>('ayah');
  const [language, setLanguage] = useState<InterfaceLanguage>('ar');
  const [corpusStats, setCorpusStats] = useState<{
    quranCount: number;
    hadithCount: number;
    collectionsCount: number;
  }>({
    quranCount: 6236,
    hadithCount: 34574,
    collectionsCount: 7,
  });

  useEffect(() => {
    document.documentElement.lang = language;
    document.documentElement.dir = language === 'ar' ? 'rtl' : 'ltr';
  }, [language]);

  useEffect(() => {
    fetch('/api/health')
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data?.corpusLoaded) {
          setCorpusStats({
            quranCount: data.corpusLoaded.quranAyatCount || 6236,
            hadithCount: 34574,
            collectionsCount: data.corpusLoaded.hadithCollectionsCount || 7,
          });
        }
      })
      .catch(() => {});
  }, []);

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
                ? 'تثبّت من صحة النصوص الشرعية بالدليل'
                : 'Verify Islamic texts against primary authentic sources'}
            </h2>
            <p className="text-sm text-[#F2F4FF]/75 max-w-2xl leading-relaxed">
              {isAr
                ? 'أداة علمية دقيقة لمطابقة الآيات، وتخريج الأحاديث بدرجات أئمة الحديث، مع بيان الأقوال دون افتئات، وإحالة ما يشتبه إلى أهل العلم.'
                : 'A scholarly tool for Quranic verse matching and Hadith takhrij with named grader attributions and strict scholar referral.'}
            </p>
          </div>
          <div className="flex items-center gap-3 shrink-0">
            <div className="text-center px-4 py-2.5 rounded-xl bg-[#12183F]/80 border border-[#2EF2C2]/40 min-w-[110px]">
              <div className="flex items-center justify-center gap-1.5 text-[#2EF2C2]">
                <BookOpen className="w-3.5 h-3.5" />
                <span className="block text-base font-bold">
                  {corpusStats.quranCount.toLocaleString('ar-EG')}
                </span>
              </div>
              <span className="text-[11px] text-[#F2F4FF]/70">
                {isAr ? 'آية في الفهرس' : 'Indexed Ayat'}
              </span>
            </div>
            <div className="text-center px-4 py-2.5 rounded-xl bg-[#12183F]/80 border border-[#6150EA]/40 min-w-[110px]">
              <div className="flex items-center justify-center gap-1.5 text-[#6150EA]">
                <ScrollText className="w-3.5 h-3.5" />
                <span className="block text-base font-bold">
                  {corpusStats.hadithCount.toLocaleString('ar-EG')}
                </span>
              </div>
              <span className="text-[11px] text-[#F2F4FF]/70">
                {isAr ? 'حديث في 7 كتب' : 'Hadiths (7 Books)'}
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

      {/* Footer with accurate dataset attributions */}
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
          <div className="flex flex-wrap items-center justify-center gap-3 text-[#F2F4FF]/50 text-[11px]">
            <span>نص Quran Academy (ara-quranacademy)</span>
            <span>•</span>
            <span>التفسير الميسر: مجمع الملك فهد لطباعة المصحف الشريف</span>
            <span>•</span>
            <span>كتب الحديث السبعة المعتمدة</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
