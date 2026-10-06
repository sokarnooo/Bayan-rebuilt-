export type AppMode = 'ayah' | 'hadith' | 'ask';
export type InterfaceLanguage = 'ar' | 'en';

export interface HadeethEncWordMeaning {
  word: string;
  meaning: string;
}

export interface HadeethEncHadithDetails {
  id: string;
  title: string;
  hadeeth: string;
  attribution: string;
  grade: string;
  explanation: string;
  hints: string[];
  reference?: string;
  words_meanings?: HadeethEncWordMeaning[];
  hadeeth_ar?: string;
  explanation_ar?: string;
  hints_ar?: string[];
  attribution_ar?: string;
  grade_ar?: string;
  url: string;
}
