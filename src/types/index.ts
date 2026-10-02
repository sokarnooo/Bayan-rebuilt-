export type AppMode = 'ayah' | 'hadith' | 'ask';

export type InterfaceLanguage = 'ar' | 'en';

export interface AyahMatchResult {
  surahNumber: number;
  surahName: string;
  ayahNumber: number;
  text: string;
  confidence: number; // 0 - 100
  tafsir?: {
    text: string;
    source: string;
  };
}

export interface HadithGradeItem {
  name: string; // Named grader, e.g. "الألباني", "شعيب الأرنؤوط"
  grade: string; // "صحيح", "حسن", "ضعيف", "موضوع"
}

export interface HadithMatchResult {
  collection: string;
  hadithNumber: number | string;
  matn: string;
  isnad?: string;
  grades: HadithGradeItem[];
  confidence: number; // 0 - 100
  attestations?: Array<{
    collection: string;
    hadithNumber: number | string;
    grades: HadithGradeItem[];
  }>;
}

export interface AskEvidenceResult {
  verdict: 'supported' | 'contradicted' | 'unclear';
  confidence: number;
  supportingSources: Array<{
    type: 'ayah' | 'hadith';
    citation: string;
    text: string;
    gradeOrTafsir?: string;
  }>;
  refutingSources: Array<{
    type: 'ayah' | 'hadith';
    citation: string;
    text: string;
    reason: string;
  }>;
  referralNote?: string;
}
