export const GRADER_NAME_MAP_AR: Record<string, string> = {
  'Abu Ghuddah': 'عبد الفتاح أبو غدة',
  'Ahmad Muhammad Shakir': 'أحمد شاكر',
  'Al-Albani': 'ناصر الدين الألباني',
  'Bashar Awad Maarouf': 'بشار عواد معروف',
  'Muhammad Fouad Abd al-Baqi': 'محمد فؤاد عبد الباقي',
  'Muhammad Muhyi Al-Din Abdul Hamid': 'محمد محيي الدين عبد الحميد',
  'Shuaib Al Arnaut': 'شعيب الأرنؤوط',
  'Zubair Ali Zai': 'زبير علي زئي',
};

export function getArabicGraderName(name: string): string {
  return GRADER_NAME_MAP_AR[name] || name;
}
