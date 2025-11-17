const STOPWORDS = new Set([
  'a',
  'an',
  'the',
  'and',
  'or',
  'but',
  'if',
  'then',
  'so',
  'is',
  'are',
  'to',
  'for',
  'with',
  'on',
  'in',
  'of'
]);

export function normalizeSentence(text = '') {
  return text
    .replace(/[^\w\s'-]/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

export function extractKeywords(text = '', limit = 12) {
  const normalized = normalizeSentence(text);
  const tokens = normalized.split(' ').filter(Boolean);
  const keywords = [];
  for (const token of tokens) {
    if (STOPWORDS.has(token)) {
      continue;
    }
    if (!keywords.includes(token)) {
      keywords.push(token);
    }
    if (keywords.length >= limit) {
      break;
    }
  }
  return keywords;
}

export function toGloss(keyword = '') {
  return keyword.toUpperCase().replace(/[^A-Z-]/g, '');
}
