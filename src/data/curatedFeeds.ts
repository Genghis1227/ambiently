export interface CuratedRssFeed {
  id: string;
  name: string;
  description: string;
  url: string;
  category: 'Featured' | 'Tech' | 'News' | 'Science';
  badgeColor: string;
}

export const CURATED_RSS_FEEDS: CuratedRssFeed[] = [
  {
    id: 'tony-tipbits',
    name: "Tony's Tipbits",
    description: 'Engineering insights, AI workflows, and software craft',
    url: 'https://tony.trinhism.com/index.xml',
    category: 'Featured',
    badgeColor: 'bg-orange-500/20 text-orange-300 border-orange-500/30',
  },
  {
    id: 'ars-technica',
    name: 'Ars Technica',
    description: 'In-depth technology analysis, science, and policy',
    url: 'https://feeds.arstechnica.com/arstechnica/index',
    category: 'Tech',
    badgeColor: 'bg-red-500/20 text-red-300 border-red-500/30',
  },
  {
    id: 'the-verge',
    name: 'The Verge',
    description: 'Consumer technology, gadgets, and digital culture',
    url: 'https://www.theverge.com/rss/index.xml',
    category: 'Tech',
    badgeColor: 'bg-purple-500/20 text-purple-300 border-purple-500/30',
  },
  {
    id: 'github-blog',
    name: 'GitHub Blog',
    description: 'Engineering stories, developer tools, and open source',
    url: 'https://github.blog/feed/',
    category: 'Tech',
    badgeColor: 'bg-blue-500/20 text-blue-300 border-blue-500/30',
  },
  {
    id: 'bbc-world',
    name: 'BBC News',
    description: 'Top global breaking headlines and international coverage',
    url: 'https://feeds.bbci.co.uk/news/world/rss.xml',
    category: 'News',
    badgeColor: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30',
  },
  {
    id: 'nbc-news',
    name: 'NBC News',
    description: 'Breaking news, US headlines, and world reporting',
    url: 'https://feeds.nbcnews.com/nbcnews/public/news',
    category: 'News',
    badgeColor: 'bg-teal-500/20 text-teal-300 border-teal-500/30',
  },
  {
    id: 'npr-news',
    name: 'NPR Top Stories',
    description: 'Independent reporting, public radio journalism, and culture',
    url: 'https://feeds.npr.org/1001/rss.xml',
    category: 'News',
    badgeColor: 'bg-cyan-500/20 text-cyan-300 border-cyan-500/30',
  },
  {
    id: 'nasa-news',
    name: 'NASA Breaking News',
    description: 'Deep space discoveries, Webb telescope, and missions',
    url: 'https://www.nasa.gov/news-release/feed/',
    category: 'Science',
    badgeColor: 'bg-indigo-500/20 text-indigo-300 border-indigo-500/30',
  },
];
