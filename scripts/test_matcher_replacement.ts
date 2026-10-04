import fs from 'fs';
import { loadCorpus } from '../server/corpus/loader.ts';
import { normalizeArabic, levenshteinDistance } from '../server/matching/normalizer.ts';

const { corpus } = loadCorpus();

export interface DisplayToken {
  word: string;
  normalized: string;
  originalIndex: number;
  skip: boolean;
}

export function isPunctuationWord(word: string): boolean {
  const norm = normalizeArabic(word).replace(/[\u200E\u200F]/g, '');
  if (!norm) return true;
  return /^[.,/#!$%^&*;:{}=\-_`~()؟،؛«»"'\d\u0660-\u0669\uFD3E\uFD3F\[\]<>ـ\s\u200B-\u200F\uFEFF]*$/.test(norm);
}

export function tokenizeDisplayWords(rawText: string): { displayWords: string[]; tokens: DisplayToken[]; nonSkipped: DisplayToken[] } {
  const displayWords = rawText.split(/\s+/).filter(Boolean);
  const tokens: DisplayToken[] = displayWords.map((word, originalIndex) => {
    const norm = normalizeArabic(word).replace(/[\u200E\u200F]/g, '');
    const skip = isPunctuationWord(word) || !norm;
    return {
      word,
      normalized: norm,
      originalIndex,
      skip,
    };
  });

  const norms = tokens.map(t => t.normalized);
  for (let i = 0; i < tokens.length; i++) {
    if (
      (norms[i] === 'صلي' || norms[i] === 'صلى') &&
      norms[i + 1] === 'الله' &&
      norms[i + 2] === 'عليه' &&
      norms[i + 3] === 'وسلم'
    ) {
      tokens[i].skip = true;
      tokens[i + 1].skip = true;
      tokens[i + 2].skip = true;
      tokens[i + 3].skip = true;
    }
    if (
      norms[i] === 'رضي' &&
      norms[i + 1] === 'الله' &&
      (norms[i + 2] === 'عنه' || norms[i + 2] === 'عنها' || norms[i + 2] === 'عنهم' || norms[i + 2] === 'عنهما' || norms[i + 2] === 'عنهن')
    ) {
      tokens[i].skip = true;
      tokens[i + 1].skip = true;
      tokens[i + 2].skip = true;
    }
    if (norms[i] === 'عليه' && norms[i + 1] === 'السلام') {
      tokens[i].skip = true;
      tokens[i + 1].skip = true;
    }
    if (norms[i] === 'عليه' && norms[i + 1] === 'الصلاه' && norms[i + 2] === 'والسلام') {
      tokens[i].skip = true;
      tokens[i + 1].skip = true;
      tokens[i + 2].skip = true;
    }
    if (norms[i] === 'رحمه' && norms[i + 1] === 'الله') {
      tokens[i].skip = true;
      tokens[i + 1].skip = true;
    }
    if (norms[i] === 'عز' && norms[i + 1] === 'وجل') {
      tokens[i].skip = true;
      tokens[i + 1].skip = true;
    }
    if (norms[i] === 'سبحانه' && (norms[i + 1] === 'وتعالي' || norms[i + 1] === 'وتعالى')) {
      tokens[i].skip = true;
      tokens[i + 1].skip = true;
    }
  }

  const nonSkipped = tokens.filter(t => !t.skip);
  return { displayWords, tokens, nonSkipped };
}

export function stripIsnadTokens(tokens: DisplayToken[]): { matnTokens: DisplayToken[]; isnadStripped: boolean } {
  if (tokens.length <= 4) {
    return { matnTokens: tokens, isnadStripped: false };
  }

  const maxIdx = Math.max(Math.floor(tokens.length * 0.90), tokens.length - 2);
  const attributionMarkers = [
    ['قال', 'رسول', 'الله'],
    ['سمعت', 'رسول', 'الله'],
    ['ان', 'رسول', 'الله'],
    ['عن', 'رسول', 'الله'],
    ['ان', 'النبي'],
    ['عن', 'النبي'],
    ['يقول', 'رسول', 'الله'],
    ['سمعت', 'النبي'],
  ];

  for (let i = 0; i <= maxIdx; i++) {
    for (const m of attributionMarkers) {
      if (i + m.length <= tokens.length) {
        let match = true;
        for (let j = 0; j < m.length; j++) {
          if (tokens[i + j].normalized !== m[j]) {
            match = false;
            break;
          }
        }
        if (match) {
          let after = i + m.length;
          if (after < tokens.length && (tokens[after].normalized === 'قال' || tokens[after].normalized === 'يقول')) {
            after++;
          }
          if (after < tokens.length) {
            return { matnTokens: tokens.slice(after), isnadStripped: true };
          }
        }
      }
    }
  }

  return { matnTokens: tokens, isnadStripped: false };
}

console.log("Tokenization helper loaded successfully.");
