export interface QuoteItem {
  id: string;
  quote: string;
  author: string;
  category?: string;
}

export const CURATED_QUOTES: QuoteItem[] = [
  {
    id: 'q1',
    quote: 'Simplicity is the prerequisite for reliability.',
    author: 'Edsger W. Dijkstra',
  },
  {
    id: 'q2',
    quote: 'The secret of getting ahead is getting started.',
    author: 'Mark Twain',
  },
  {
    id: 'q3',
    quote: 'In the middle of difficulty lies opportunity.',
    author: 'Albert Einstein',
  },
  {
    id: 'q4',
    quote: 'Do what you can, with what you have, where you are.',
    author: 'Theodore Roosevelt',
  },
  {
    id: 'q5',
    quote: 'Stay hungry, stay foolish.',
    author: 'Stewart Brand / Steve Jobs',
  },
  {
    id: 'q6',
    quote: 'Action is the foundational key to all success.',
    author: 'Pablo Picasso',
  },
  {
    id: 'q7',
    quote: 'What we think, we become.',
    author: 'Buddha',
  },
  {
    id: 'q8',
    quote: 'Creativity is intelligence having fun.',
    author: 'Albert Einstein',
  },
];

export function getQuoteForToday(customQuotes: QuoteItem[] = []): QuoteItem {
  const all = [...CURATED_QUOTES, ...customQuotes];
  if (all.length === 0) return CURATED_QUOTES[0];
  const dayOfYear = Math.floor(
    (Date.now() - new Date(new Date().getFullYear(), 0, 0).getTime()) / 1000 / 60 / 60 / 24
  );
  const index = dayOfYear % all.length;
  return all[index];
}
