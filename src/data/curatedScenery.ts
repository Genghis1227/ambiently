import type { PhotoItem } from '../services/photos';

export interface CuratedCategory {
  id: string;
  name: string;
  icon: string;
  description: string;
  previewUrl: string;
  photos: PhotoItem[];
}

export const MOUNTAIN_PHOTOS: PhotoItem[] = [
  {
    id: 'curated-mnt-1',
    url: 'https://images.unsplash.com/photo-1506744038136-46273834b3fb?auto=format&fit=crop&w=1920&q=80',
    caption: 'Yosemite Valley Mist',
    author: 'Bailey Zindel',
    source: 'curated',
  },
  {
    id: 'curated-mnt-2',
    url: 'https://images.unsplash.com/photo-1519681393784-d120267933ba?auto=format&fit=crop&w=1920&q=80',
    caption: 'Alpine Starry Summit',
    author: 'Benjamin Voros',
    source: 'curated',
  },
  {
    id: 'curated-mnt-3',
    url: 'https://images.unsplash.com/photo-1464822759023-fed622ff2c3b?auto=format&fit=crop&w=1920&q=80',
    caption: 'Majestic Rocky Mountain Ridge',
    author: 'Kaley Dykstra',
    source: 'curated',
  },
  {
    id: 'curated-mnt-4',
    url: 'https://images.unsplash.com/photo-1542332213-9b5a5a3fad35?auto=format&fit=crop&w=1920&q=80',
    caption: 'Dolomites Peaks at Sunset',
    author: 'Ales Krivec',
    source: 'curated',
  },
  {
    id: 'curated-mnt-5',
    url: 'https://images.unsplash.com/photo-1486870591958-9b9d0d1dda99?auto=format&fit=crop&w=1920&q=80',
    caption: 'Glacial Lake Moraine Reflection',
    author: 'Luca Bravo',
    source: 'curated',
  },
  {
    id: 'curated-mnt-6',
    url: 'https://images.unsplash.com/photo-1508873696983-2df5293cb32f?auto=format&fit=crop&w=1920&q=80',
    caption: 'Matterhorn Alpine Glow',
    author: 'Joshua Earle',
    source: 'curated',
  },
  {
    id: 'curated-mnt-7',
    url: 'https://images.unsplash.com/photo-1533240332313-0db49b459ad6?auto=format&fit=crop&w=1920&q=80',
    caption: 'Torres del Paine Sunrise',
    author: 'Jonatan Pie',
    source: 'curated',
  },
  {
    id: 'curated-mnt-8',
    url: 'https://images.unsplash.com/photo-1472214103451-9374bd1c798e?auto=format&fit=crop&w=1920&q=80',
    caption: 'Emerald Alpine Meadow',
    author: 'Sébastien Goldberg',
    source: 'curated',
  },
  {
    id: 'curated-mnt-9',
    url: 'https://images.unsplash.com/photo-1426604966848-d7adac402bff?auto=format&fit=crop&w=1920&q=80',
    caption: 'Yosemite Granite Peaks',
    author: 'Willian Justen de Vasconcellos',
    source: 'curated',
  },
  {
    id: 'curated-mnt-10',
    url: 'https://images.unsplash.com/photo-1454496522488-7a8e488e8606?auto=format&fit=crop&w=1920&q=80',
    caption: 'Snowcapped Himalayan Range',
    author: 'Daniel Burka',
    source: 'curated',
  },
];

export const COAST_PHOTOS: PhotoItem[] = [
  {
    id: 'curated-cst-1',
    url: 'https://images.unsplash.com/photo-1507525428034-b723cf961d3e?auto=format&fit=crop&w=1920&q=80',
    caption: 'Tropical Dawn Shoreline',
    author: 'Sean Oulashin',
    source: 'curated',
  },
  {
    id: 'curated-cst-2',
    url: 'https://images.unsplash.com/photo-1505118380757-91f5f5632de0?auto=format&fit=crop&w=1920&q=80',
    caption: 'Turquoise Hawaiian Waves',
    author: 'Jeremy Bishop',
    source: 'curated',
  },
  {
    id: 'curated-cst-3',
    url: 'https://images.unsplash.com/photo-1518495973542-4542c06a5843?auto=format&fit=crop&w=1920&q=80',
    caption: 'Golden Coast Sunbeam',
    author: 'Federico Respini',
    source: 'curated',
  },
  {
    id: 'curated-cst-4',
    url: 'https://images.unsplash.com/photo-1473496169904-658ba7c44d8a?auto=format&fit=crop&w=1920&q=80',
    caption: 'Pacific Coastal Twilight',
    author: 'Shifaaz shamoon',
    source: 'curated',
  },
  {
    id: 'curated-cst-5',
    url: 'https://images.unsplash.com/photo-1509233725247-49e657c54213?auto=format&fit=crop&w=1920&q=80',
    caption: 'Big Sur Rugged Cliffs',
    author: 'Caleb Jones',
    source: 'curated',
  },
  {
    id: 'curated-cst-6',
    url: 'https://images.unsplash.com/photo-1544551763-46a013bb70d5?auto=format&fit=crop&w=1920&q=80',
    caption: 'Emerald Shoreline Depths',
    author: 'Cristian Palmer',
    source: 'curated',
  },
  {
    id: 'curated-cst-7',
    url: 'https://images.unsplash.com/photo-1512100356356-de1b84283e18?auto=format&fit=crop&w=1920&q=80',
    caption: 'Nordic Sea Lighthouse',
    author: 'Fabian Møller',
    source: 'curated',
  },
  {
    id: 'curated-cst-8',
    url: 'https://images.unsplash.com/photo-1498837167922-ddd27525d352?auto=format&fit=crop&w=1920&q=80',
    caption: 'Rolling Coral Sea Surf',
    author: 'Joseph Barrientos',
    source: 'curated',
  },
];

export const FOREST_PHOTOS: PhotoItem[] = [
  {
    id: 'curated-fst-1',
    url: 'https://images.unsplash.com/photo-1470071459604-3b5ec3a7fe05?auto=format&fit=crop&w=1920&q=80',
    caption: 'Misty Redwood Forest',
    author: 'Casey Horner',
    source: 'curated',
  },
  {
    id: 'curated-fst-2',
    url: 'https://images.unsplash.com/photo-1441974231531-c6227db76b6e?auto=format&fit=crop&w=1920&q=80',
    caption: 'Sunbeam Woodland Trail',
    author: 'Luca Bravo',
    source: 'curated',
  },
  {
    id: 'curated-fst-3',
    url: 'https://images.unsplash.com/photo-1511497584788-87676104235f?auto=format&fit=crop&w=1920&q=80',
    caption: 'Pacific Northwest Canopy',
    author: 'Krzysztof Niewolny',
    source: 'curated',
  },
  {
    id: 'curated-fst-4',
    url: 'https://images.unsplash.com/photo-1507525428034-b723cf961d3e?auto=format&fit=crop&w=1920&q=80',
    caption: 'Golden Autumn Birch Canopy',
    author: 'Aaron Burden',
    source: 'curated',
  },
  {
    id: 'curated-fst-5',
    url: 'https://images.unsplash.com/photo-1448375240586-882707db888b?auto=format&fit=crop&w=1920&q=80',
    caption: 'Dense Emerald Forest Fog',
    author: 'Sebastian Unrau',
    source: 'curated',
  },
  {
    id: 'curated-fst-6',
    url: 'https://images.unsplash.com/photo-1513836279014-a89f7a76ae86?auto=format&fit=crop&w=1920&q=80',
    caption: 'Arashiyama Bamboo Grove',
    author: 'Trey Ratcliff',
    source: 'curated',
  },
  {
    id: 'curated-fst-7',
    url: 'https://images.unsplash.com/photo-1502082553048-f009c37129b9?auto=format&fit=crop&w=1920&q=80',
    caption: 'Ancient Cedar Canopy',
    author: 'Matthew Smith',
    source: 'curated',
  },
];

export const SPACE_PHOTOS: PhotoItem[] = [
  {
    id: 'curated-spc-1',
    url: 'https://images.unsplash.com/photo-1506703719100-a0f3a48c0f86?auto=format&fit=crop&w=1920&q=80',
    caption: 'Carina Cosmic Nebula',
    author: 'NASA & STScI',
    source: 'curated',
  },
  {
    id: 'curated-spc-2',
    url: 'https://images.unsplash.com/photo-1451187580459-43490279c0fa?auto=format&fit=crop&w=1920&q=80',
    caption: 'Earth from Orbit at Night',
    author: 'NASA Earth Observatory',
    source: 'curated',
  },
  {
    id: 'curated-spc-3',
    url: 'https://images.unsplash.com/photo-1538370965046-79c0d6907d47?auto=format&fit=crop&w=1920&q=80',
    caption: 'Aurora Borealis Over Arctic Fjord',
    author: 'Vincent Guth',
    source: 'curated',
  },
  {
    id: 'curated-spc-4',
    url: 'https://images.unsplash.com/photo-1462331940025-496dfbfc7564?auto=format&fit=crop&w=1920&q=80',
    caption: 'Milky Way Core Over Desert',
    author: 'NASA / JPL',
    source: 'curated',
  },
  {
    id: 'curated-spc-5',
    url: 'https://images.unsplash.com/photo-1446776811953-b23d57bd21aa?auto=format&fit=crop&w=1920&q=80',
    caption: 'International Space Station Horizon',
    author: 'NASA Astronaut Photography',
    source: 'curated',
  },
  {
    id: 'curated-spc-6',
    url: 'https://images.unsplash.com/photo-1518709268805-4e9042af9f23?auto=format&fit=crop&w=1920&q=80',
    caption: 'Starry Cosmic Dust Cloud',
    author: 'Graham Holtshausen',
    source: 'curated',
  },
  {
    id: 'curated-spc-7',
    url: 'https://images.unsplash.com/photo-1502134249126-9f3755a50d78?auto=format&fit=crop&w=1920&q=80',
    caption: 'Total Solar Eclipse Corona',
    author: 'Bryan Goff',
    source: 'curated',
  },
];

export const ART_PHOTOS: PhotoItem[] = [
  {
    id: 'curated-art-1',
    url: 'https://images.unsplash.com/photo-1579783900882-c0d3dad7b119?auto=format&fit=crop&w=1920&q=80',
    caption: 'The Starry Night (1889)',
    author: 'Vincent van Gogh',
    source: 'curated',
  },
  {
    id: 'curated-art-2',
    url: 'https://images.unsplash.com/photo-1577083552431-6e5fd01aa342?auto=format&fit=crop&w=1920&q=80',
    caption: 'Water Lilies & Reflections (1916)',
    author: 'Claude Monet',
    source: 'curated',
  },
  {
    id: 'curated-art-3',
    url: 'https://images.unsplash.com/photo-1578925518470-4def7a0f08bb?auto=format&fit=crop&w=1920&q=80',
    caption: 'Under the Wave off Kanagawa (The Great Wave)',
    author: 'Katsushika Hokusai',
    source: 'curated',
  },
  {
    id: 'curated-art-4',
    url: 'https://images.unsplash.com/photo-1582561424760-0321d75e81fa?auto=format&fit=crop&w=1920&q=80',
    caption: 'Wanderer above the Sea of Fog',
    author: 'Caspar David Friedrich',
    source: 'curated',
  },
  {
    id: 'curated-art-5',
    url: 'https://images.unsplash.com/photo-1579783902614-a3fb3927b675?auto=format&fit=crop&w=1920&q=80',
    caption: 'Girl with a Pearl Earring (c. 1665)',
    author: 'Johannes Vermeer',
    source: 'curated',
  },
  {
    id: 'curated-art-6',
    url: 'https://images.unsplash.com/photo-1579783901586-d88db74b4fe4?auto=format&fit=crop&w=1920&q=80',
    caption: 'The Fighting Temeraire (1839)',
    author: 'J.M.W. Turner',
    source: 'curated',
  },
  {
    id: 'curated-art-7',
    url: 'https://images.unsplash.com/photo-1579783928621-7a13d66a62d1?auto=format&fit=crop&w=1920&q=80',
    caption: 'The Kiss (Der Kuss, 1908)',
    author: 'Gustav Klimt',
    source: 'curated',
  },
];

export const CITY_PHOTOS: PhotoItem[] = [
  {
    id: 'curated-cty-1',
    url: 'https://images.unsplash.com/photo-1503899036084-c55cdd92da26?auto=format&fit=crop&w=1920&q=80',
    caption: 'Tokyo Shinjuku Neon Alley',
    author: 'Jezael Melgoza',
    source: 'curated',
  },
  {
    id: 'curated-cty-2',
    url: 'https://images.unsplash.com/photo-1477959858617-67f30bc75b82?auto=format&fit=crop&w=1920&q=80',
    caption: 'Manhattan Blue Hour Skyline',
    author: 'Ben O’Bro',
    source: 'curated',
  },
  {
    id: 'curated-cty-3',
    url: 'https://images.unsplash.com/photo-1514565131-fce0801e5785?auto=format&fit=crop&w=1920&q=80',
    caption: 'Rainy Chicago Reflections',
    author: 'Sawyer Bengtson',
    source: 'curated',
  },
  {
    id: 'curated-cty-4',
    url: 'https://images.unsplash.com/photo-1513635269975-59663e0ac1ad?auto=format&fit=crop&w=1920&q=80',
    caption: 'London Twilight Tower Bridge',
    author: 'Luke Stackpoole',
    source: 'curated',
  },
  {
    id: 'curated-cty-5',
    url: 'https://images.unsplash.com/photo-1493976040374-85c8e12f0c0e?auto=format&fit=crop&w=1920&q=80',
    caption: 'Kyoto Pontocho Lantern Path',
    author: 'Su San Lee',
    source: 'curated',
  },
  {
    id: 'curated-cty-6',
    url: 'https://images.unsplash.com/photo-1506146332389-18140dc7b2fb?auto=format&fit=crop&w=1920&q=80',
    caption: 'Golden Gate Fog at Sunset',
    author: 'Joseph Barrientos',
    source: 'curated',
  },
];

export const COZY_PHOTOS: PhotoItem[] = [
  {
    id: 'curated-czy-1',
    url: 'https://images.unsplash.com/photo-1542314831-068cd1dbfeeb?auto=format&fit=crop&w=1920&q=80',
    caption: 'Wood Cabin Hearth & Fireplace',
    author: 'Toa Heftiba',
    source: 'curated',
  },
  {
    id: 'curated-czy-2',
    url: 'https://images.unsplash.com/photo-1501339847302-ac426a4a7cbb?auto=format&fit=crop&w=1920&q=80',
    caption: 'Rainy Library Bookshop Cafe',
    author: 'Daiga Ellaby',
    source: 'curated',
  },
  {
    id: 'curated-czy-3',
    url: 'https://images.unsplash.com/photo-1517842645767-c639042777db?auto=format&fit=crop&w=1920&q=80',
    caption: 'Morning Coffee & Notebook',
    author: 'Dan Gold',
    source: 'curated',
  },
  {
    id: 'curated-czy-4',
    url: 'https://images.unsplash.com/photo-1495474472287-4d71bcdd2085?auto=format&fit=crop&w=1920&q=80',
    caption: 'Warm Steam Coffee Roastery',
    author: 'Nathan Dumlao',
    source: 'curated',
  },
  {
    id: 'curated-czy-5',
    url: 'https://images.unsplash.com/photo-1513694203232-719a280e022f?auto=format&fit=crop&w=1920&q=80',
    caption: 'Hygge Sunlit Minimalist Bedroom',
    author: 'Alisa Anton',
    source: 'curated',
  },
];

export const ZEN_PHOTOS: PhotoItem[] = [
  {
    id: 'curated-zen-1',
    url: 'https://images.unsplash.com/photo-1518531933037-91b2f5f229cc?auto=format&fit=crop&w=1920&q=80',
    caption: 'Dewdrops on Monstera Leaf',
    author: 'Scott Webb',
    source: 'curated',
  },
  {
    id: 'curated-zen-2',
    url: 'https://images.unsplash.com/photo-1507668077129-56e32842fceb?auto=format&fit=crop&w=1920&q=80',
    caption: 'Japanese Zen Rock Garden',
    author: 'Ryutaro Tsukata',
    source: 'curated',
  },
  {
    id: 'curated-zen-3',
    url: 'https://images.unsplash.com/photo-1509316975850-ff9c5deb0cd9?auto=format&fit=crop&w=1920&q=80',
    caption: 'Minimalist Sand Dunes at Dawn',
    author: 'Jeremy Bishop',
    source: 'curated',
  },
  {
    id: 'curated-zen-4',
    url: 'https://images.unsplash.com/photo-1528183429752-a97d0bf99b5a?auto=format&fit=crop&w=1920&q=80',
    caption: 'Kyoto Maple & Water Basin',
    author: 'Sora Sagano',
    source: 'curated',
  },
  {
    id: 'curated-zen-5',
    url: 'https://images.unsplash.com/photo-1513836279014-a89f7a76ae86?auto=format&fit=crop&w=1920&q=80',
    caption: 'Misty Bamboo Grove',
    author: 'Kazuend',
    source: 'curated',
  },
];

export const ALL_CURATED_PHOTOS: PhotoItem[] = [
  ...MOUNTAIN_PHOTOS,
  ...COAST_PHOTOS,
  ...FOREST_PHOTOS,
  ...SPACE_PHOTOS,
  ...ART_PHOTOS,
  ...CITY_PHOTOS,
  ...COZY_PHOTOS,
  ...ZEN_PHOTOS,
];

export const CURATED_CATEGORIES: CuratedCategory[] = [
  {
    id: 'all',
    name: 'All Themes (Master Mix)',
    icon: 'Sparkles',
    description: 'A rich continuous shuffle across mountains, space, oceans, classic art, and cities',
    previewUrl: 'https://images.unsplash.com/photo-1506744038136-46273834b3fb?auto=format&fit=crop&w=800&q=80',
    photos: ALL_CURATED_PHOTOS,
  },
  {
    id: 'mountains',
    name: 'National Parks & Mountains',
    icon: 'Mountain',
    description: 'Yosemite mist, snowcapped Alpine summits, and glacial reflection lakes',
    previewUrl: 'https://images.unsplash.com/photo-1464822759023-fed622ff2c3b?auto=format&fit=crop&w=800&q=80',
    photos: MOUNTAIN_PHOTOS,
  },
  {
    id: 'coasts',
    name: 'Coasts & Turquoise Oceans',
    icon: 'Waves',
    description: 'Crashing Pacific surf, tropical Hawaiian shores, and coastal cliff sunrises',
    previewUrl: 'https://images.unsplash.com/photo-1507525428034-b723cf961d3e?auto=format&fit=crop&w=800&q=80',
    photos: COAST_PHOTOS,
  },
  {
    id: 'forests',
    name: 'Deep Woods & Autumn Forests',
    icon: 'Trees',
    description: 'Ancient redwood giants, sunlit woodland trails, and golden fall foliage',
    previewUrl: 'https://images.unsplash.com/photo-1441974231531-c6227db76b6e?auto=format&fit=crop&w=800&q=80',
    photos: FOREST_PHOTOS,
  },
  {
    id: 'space',
    name: 'Deep Space & NASA Cosmos',
    icon: 'Telescope',
    description: 'James Webb deep-field nebulas, Arctic auroras, and Earth from orbit',
    previewUrl: 'https://images.unsplash.com/photo-1506703719100-a0f3a48c0f86?auto=format&fit=crop&w=800&q=80',
    photos: SPACE_PHOTOS,
  },
  {
    id: 'art',
    name: 'Classic Art & Museum Gallery',
    icon: 'Palette',
    description: 'Masterpieces by Van Gogh, Monet, Hokusai, Vermeer, and Caspar David Friedrich',
    previewUrl: 'https://images.unsplash.com/photo-1579783900882-c0d3dad7b119?auto=format&fit=crop&w=800&q=80',
    photos: ART_PHOTOS,
  },
  {
    id: 'cities',
    name: 'Urban Nights & Cityscapes',
    icon: 'Building2',
    description: 'Tokyo neon alleys, rainy Chicago reflections, and Manhattan blue hour',
    previewUrl: 'https://images.unsplash.com/photo-1503899036084-c55cdd92da26?auto=format&fit=crop&w=800&q=80',
    photos: CITY_PHOTOS,
  },
  {
    id: 'cozy',
    name: 'Cozy Cabin & Warm Living',
    icon: 'Coffee',
    description: 'Crackling hearth fires, rainy library bookshops, and warm morning coffee',
    previewUrl: 'https://images.unsplash.com/photo-1542314831-068cd1dbfeeb?auto=format&fit=crop&w=800&q=80',
    photos: COZY_PHOTOS,
  },
  {
    id: 'zen',
    name: 'Zen Minimalism & Botany',
    icon: 'Leaf',
    description: 'Japanese rock gardens, misty bamboo groves, and dewy macro leaves',
    previewUrl: 'https://images.unsplash.com/photo-1518531933037-91b2f5f229cc?auto=format&fit=crop&w=800&q=80',
    photos: ZEN_PHOTOS,
  },
];

export function getCuratedCategoryById(id: string): CuratedCategory {
  return CURATED_CATEGORIES.find((c) => c.id === id) || CURATED_CATEGORIES[0];
}
