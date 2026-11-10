export type RssFeedCategory =
  | 'Featured'
  | 'News'
  | 'Tech'
  | 'Science'
  | 'Lifestyle'
  | 'Sports & Finance';

export interface CuratedRssFeed {
  id: string;
  name: string;
  description: string;
  url: string;
  category: RssFeedCategory;
  badgeColor: string;
}

export const RSS_FEED_CATEGORIES: readonly ('All' | RssFeedCategory)[] = [
  'All',
  'Featured',
  'News',
  'Tech',
  'Science',
  'Lifestyle',
  'Sports & Finance',
] as const;

export const CURATED_RSS_FEEDS: CuratedRssFeed[] = [
  // Featured
  {
    id: 'tony-tipbits',
    name: "Tony's Tipbits",
    description: 'Engineering insights, AI workflows, and software craft',
    url: 'https://tony.trinhism.com/index.xml',
    category: 'Featured',
    badgeColor: 'bg-orange-500/20 text-orange-300 border-orange-500/30',
  },

  // News
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
    id: 'cbs-news',
    name: 'CBS News',
    description: 'National and international top stories from CBS News',
    url: 'https://www.cbsnews.com/latest/rss/main',
    category: 'News',
    badgeColor: 'bg-cyan-500/20 text-cyan-300 border-cyan-500/30',
  },
  {
    id: 'pbs-newshour',
    name: 'PBS NewsHour',
    description: 'In-depth public broadcasting journalism, policy, and analysis',
    url: 'https://www.pbs.org/newshour/feeds/rss/headlines',
    category: 'News',
    badgeColor: 'bg-sky-500/20 text-sky-300 border-sky-500/30',
  },
  {
    id: 'guardian-world',
    name: 'The Guardian',
    description: 'Independent global news, investigations, and world events',
    url: 'https://www.theguardian.com/world/rss',
    category: 'News',
    badgeColor: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30',
  },

  // Tech & AI
  {
    id: 'the-verge',
    name: 'The Verge',
    description: 'Consumer technology, gadgets, AI, and digital culture',
    url: 'https://www.theverge.com/rss/index.xml',
    category: 'Tech',
    badgeColor: 'bg-purple-500/20 text-purple-300 border-purple-500/30',
  },
  {
    id: 'ars-technica',
    name: 'Ars Technica',
    description: 'In-depth technology analysis, hardware, science, and policy',
    url: 'https://feeds.arstechnica.com/arstechnica/index',
    category: 'Tech',
    badgeColor: 'bg-red-500/20 text-red-300 border-red-500/30',
  },
  {
    id: 'techcrunch',
    name: 'TechCrunch',
    description: 'Startups, venture capital, AI products, and Silicon Valley news',
    url: 'https://techcrunch.com/feed/',
    category: 'Tech',
    badgeColor: 'bg-green-500/20 text-green-300 border-green-500/30',
  },
  {
    id: 'wired',
    name: 'WIRED',
    description: 'How emerging technology affects culture, science, and security',
    url: 'https://www.wired.com/feed/rss',
    category: 'Tech',
    badgeColor: 'bg-violet-500/20 text-violet-300 border-violet-500/30',
  },
  {
    id: 'hacker-news',
    name: 'Hacker News',
    description: 'Top community-curated engineering, AI, and startup links',
    url: 'https://hnrss.org/frontpage',
    category: 'Tech',
    badgeColor: 'bg-amber-500/20 text-amber-300 border-amber-500/30',
  },
  {
    id: '9to5mac',
    name: '9to5Mac',
    description: 'Apple news, Mac, iPhone, iPad, and iOS ecosystem coverage',
    url: 'https://9to5mac.com/feed/',
    category: 'Tech',
    badgeColor: 'bg-blue-500/20 text-blue-300 border-blue-500/30',
  },
  {
    id: 'android-authority',
    name: 'Android Authority',
    description: 'Android phones, Google Pixel, smart home, and mobile reviews',
    url: 'https://www.androidauthority.com/feed/',
    category: 'Tech',
    badgeColor: 'bg-lime-500/20 text-lime-300 border-lime-500/30',
  },
  {
    id: 'github-blog',
    name: 'GitHub Blog',
    description: 'Engineering stories, developer tools, Copilot, and open source',
    url: 'https://github.blog/feed/',
    category: 'Tech',
    badgeColor: 'bg-blue-500/20 text-blue-300 border-blue-500/30',
  },
  {
    id: 'simon-willison',
    name: 'Simon Willison',
    description: 'Practical LLM engineering, AI agents, Datasette, and Python',
    url: 'https://simonwillison.net/atom/everything/',
    category: 'Tech',
    badgeColor: 'bg-indigo-500/20 text-indigo-300 border-indigo-500/30',
  },

  // Science & Space
  {
    id: 'nasa-news',
    name: 'NASA Breaking News',
    description: 'Deep space discoveries, Webb telescope, and Artemis missions',
    url: 'https://www.nasa.gov/news-release/feed/',
    category: 'Science',
    badgeColor: 'bg-indigo-500/20 text-indigo-300 border-indigo-500/30',
  },
  {
    id: 'space-com',
    name: 'Space.com',
    description: 'Astronomy, rocket launches, skywatching, and space exploration',
    url: 'https://www.space.com/feeds/all',
    category: 'Science',
    badgeColor: 'bg-indigo-500/20 text-indigo-300 border-indigo-500/30',
  },
  {
    id: 'quanta',
    name: 'Quanta Magazine',
    description: 'Illuminating basic research in physics, math, biology, and CS',
    url: 'https://www.quantamagazine.org/feed/',
    category: 'Science',
    badgeColor: 'bg-cyan-500/20 text-cyan-300 border-cyan-500/30',
  },
  {
    id: 'sciencedaily',
    name: 'ScienceDaily',
    description: 'Latest research breakthroughs in health, environment, and tech',
    url: 'https://www.sciencedaily.com/rss/all.xml',
    category: 'Science',
    badgeColor: 'bg-sky-500/20 text-sky-300 border-sky-500/30',
  },

  // Lifestyle, Home & Food
  {
    id: 'lifehacker',
    name: 'Lifehacker',
    description: 'Productivity tips, smart home hacks, and everyday life upgrades',
    url: 'https://lifehacker.com/feed/rss',
    category: 'Lifestyle',
    badgeColor: 'bg-pink-500/20 text-pink-300 border-pink-500/30',
  },
  {
    id: 'serious-eats',
    name: 'Serious Eats',
    description: 'Food science, tested family recipes, and kitchen equipment reviews',
    url: 'https://feeds.feedburner.com/seriouseats/recipes',
    category: 'Lifestyle',
    badgeColor: 'bg-rose-500/20 text-rose-300 border-rose-500/30',
  },
  {
    id: 'smitten-kitchen',
    name: 'Smitten Kitchen',
    description: 'Fearless home cooking, baking, and weeknight family meals',
    url: 'https://smittenkitchen.com/feed/',
    category: 'Lifestyle',
    badgeColor: 'bg-amber-500/20 text-amber-300 border-amber-500/30',
  },
  {
    id: 'apartment-therapy',
    name: 'Apartment Therapy',
    description: 'Home organization, interior design inspiration, and cleaning guides',
    url: 'https://www.apartmenttherapy.com/main.rss',
    category: 'Lifestyle',
    badgeColor: 'bg-fuchsia-500/20 text-fuchsia-300 border-fuchsia-500/30',
  },

  // Sports & Finance
  {
    id: 'espn-top',
    name: 'ESPN Top Headlines',
    description: 'Breaking sports news, scores, NFL, NBA, MLB, and college sports',
    url: 'https://www.espn.com/espn/rss/news',
    category: 'Sports & Finance',
    badgeColor: 'bg-red-500/20 text-red-300 border-red-500/30',
  },
  {
    id: 'yahoo-sports',
    name: 'Yahoo Sports',
    description: 'Live sports coverage, columns, and league-wide news',
    url: 'https://sports.yahoo.com/rss/',
    category: 'Sports & Finance',
    badgeColor: 'bg-purple-500/20 text-purple-300 border-purple-500/30',
  },
  {
    id: 'cnbc-top',
    name: 'CNBC Top News',
    description: 'Stock market updates, economy, personal finance, and business',
    url: 'https://search.cnbc.com/rs/search/combinedcms/view.xml?partnerId=wrss01&id=100003114',
    category: 'Sports & Finance',
    badgeColor: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30',
  },
];
