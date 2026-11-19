import type {
  DiscoveryHistoryEvent,
  DiscoveryTriviaCategory,
  DiscoveryTriviaItem,
  DiscoveryWordItem,
} from '../types/phase3Widgets';

export const CURATED_TRIVIA_ITEMS: DiscoveryTriviaItem[] = [
  {
    id: 'trv-sci-1',
    category: 'science',
    kind: 'trivia',
    prompt: 'Which planet in our solar system rotates on its side at roughly a 98-degree tilt?',
    answer: 'Uranus',
    funFact: 'Because of its extreme tilt, each pole gets about 42 continuous years of sunlight followed by 42 years of darkness.',
  },
  {
    id: 'trv-sci-2',
    category: 'science',
    kind: 'trivia',
    prompt: 'What is the only metal that is liquid at standard room temperature?',
    answer: 'Mercury',
    funFact: 'Gallium is close — it stays solid on a counter at 70°F but melts right in the palm of your hand at 85.6°F.',
  },
  {
    id: 'trv-sci-3',
    category: 'science',
    kind: 'trivia',
    prompt: 'Roughly how long does light from the Sun take to reach Earth?',
    answer: 'About 8 minutes and 20 seconds',
    funFact: 'Sunlight travels across 93 million miles of space at 186,282 miles per second.',
  },
  {
    id: 'trv-sci-4',
    category: 'science',
    kind: 'trivia',
    prompt: 'Which gas makes up about 78% of Earth’s atmosphere?',
    answer: 'Nitrogen',
    funFact: 'Oxygen only accounts for around 21%, while argon, carbon dioxide, and trace gases share the remaining 1%.',
  },
  {
    id: 'trv-sci-5',
    category: 'science',
    kind: 'trivia',
    prompt: 'What type of subatomic particle carries a negative electric charge?',
    answer: 'An electron',
    funFact: 'An electron has roughly 1/1,836th the mass of a proton, yet balances its positive charge equally.',
  },
  {
    id: 'trv-sci-6',
    category: 'science',
    kind: 'trivia',
    prompt: 'Which planet has a day longer than its entire year?',
    answer: 'Venus',
    funFact: 'Venus takes 243 Earth days to spin once on its axis, compared to 225 Earth days to orbit the Sun.',
  },
  {
    id: 'trv-sci-7',
    category: 'science',
    kind: 'trivia',
    prompt: 'What everyday kitchen ingredient has the chemical formula NaHCO3?',
    answer: 'Baking soda (sodium bicarbonate)',
    funFact: 'When baking soda meets an acid like lemon juice or buttermilk, it releases carbon dioxide bubbles that lift batters.',
  },
  {
    id: 'trv-sci-8',
    category: 'science',
    kind: 'trivia',
    prompt: 'How many bones are in an adult human body?',
    answer: '206 bones',
    funFact: 'Babies are born with around 270 to 300 softer bones and cartilage plates that gradually fuse together as they grow.',
  },
  {
    id: 'trv-his-1',
    category: 'history',
    kind: 'trivia',
    prompt: 'In what year did humans first land on the Moon aboard Apollo 11?',
    answer: '1969',
    funFact: 'The Apollo Guidance Computer had roughly 72 KB of read-only memory — far less than a modern greeting card.',
  },
  {
    id: 'trv-his-2',
    category: 'history',
    kind: 'trivia',
    prompt: 'Which ancient library in Egypt became the most famous center of scholarship in the classical world?',
    answer: 'The Library of Alexandria',
    funFact: 'Scholars cataloged hundreds of thousands of papyrus scrolls by genre and author in a system called the Pinakes.',
  },
  {
    id: 'trv-his-3',
    category: 'history',
    kind: 'trivia',
    prompt: 'Who wrote the very first published algorithm intended to be processed by a mechanical computer?',
    answer: 'Ada Lovelace',
    funFact: 'In 1843, her notes on Charles Babbage’s Analytical Engine even imagined computers composing music.',
  },
  {
    id: 'trv-his-4',
    category: 'history',
    kind: 'trivia',
    prompt: 'Which 19th-century expedition employed Carrier Pigeons to carry urgent news across France before telegraphs?',
    answer: 'The Havas news service (and later the 1870 Siege of Paris)',
    funFact: 'Microfilmed dispatches were rolled into tiny quills attached to feathers so one bird could carry thousands of messages.',
  },
  {
    id: 'trv-his-5',
    category: 'history',
    kind: 'trivia',
    prompt: 'What stone artifact unlocked the ability to read Egyptian hieroglyphs in 1822?',
    answer: 'The Rosetta Stone',
    funFact: 'Carved in 196 BCE, the decree was inscribed in three scripts: hieroglyphs, Demotic, and Ancient Greek.',
  },
  {
    id: 'trv-his-6',
    category: 'history',
    kind: 'trivia',
    prompt: 'Which strait separates Asia from North America by only about 53 miles?',
    answer: 'The Bering Strait',
    funFact: 'Two islands in the middle — Big Diomede and Little Diomede — sit just 2.4 miles apart across the International Date Line.',
  },
  {
    id: 'trv-his-7',
    category: 'history',
    kind: 'trivia',
    prompt: 'What 1440s invention by Johannes Gutenberg transformed literacy across Europe?',
    answer: 'The movable-type printing press',
    funFact: 'Within 50 years, millions of books were printed in hundreds of European cities.',
  },
  {
    id: 'trv-nat-1',
    category: 'nature',
    kind: 'trivia',
    prompt: 'How many hearts does an octopus have?',
    answer: 'Three hearts',
    funFact: 'Two pump blood to its gills, while the third circulates blood to the rest of its body — pausing briefly while it swims.',
  },
  {
    id: 'trv-nat-2',
    category: 'nature',
    kind: 'trivia',
    prompt: 'Which mammal is the only one capable of sustained true flight?',
    answer: 'The bat',
    funFact: 'More than 1,400 bat species exist worldwide, and many pollinate night-blooming fruit plants like bananas and cacao.',
  },
  {
    id: 'trv-nat-3',
    category: 'nature',
    kind: 'trivia',
    prompt: 'What color is a polar bear’s skin underneath its translucent white-looking fur?',
    answer: 'Black',
    funFact: 'Hollow guard hairs scatter visible light so the coat appears white while dark skin underneath absorbs warming sunlight.',
  },
  {
    id: 'trv-nat-4',
    category: 'nature',
    kind: 'trivia',
    prompt: 'Which bird can fly backward as well as hover in place?',
    answer: 'The hummingbird',
    funFact: 'Its figure-eight wingbeat cycles up to 80 times per second, allowing instant flips and sideways darts.',
  },
  {
    id: 'trv-nat-5',
    category: 'nature',
    kind: 'trivia',
    prompt: 'A group of owls is traditionally called what?',
    answer: 'A parliament',
    funFact: 'C.S. Lewis helped popularize the collective noun in The Chronicles of Narnia.',
  },
  {
    id: 'trv-nat-6',
    category: 'nature',
    kind: 'trivia',
    prompt: 'Which ocean creature sleeps with one half of its brain awake at a time?',
    answer: 'The dolphin',
    funFact: 'Unihemispheric sleep lets dolphins keep swimming, watching for predators, and surfacing to breathe.',
  },
  {
    id: 'trv-nat-7',
    category: 'nature',
    kind: 'trivia',
    prompt: 'Which tree species holds the record as Earth’s tallest living organisms?',
    answer: 'Coast redwoods (Sequoia sempervirens)',
    funFact: 'Mature coast redwoods soak up coastal fog directly through needles high in the canopy, reaching over 380 feet tall.',
  },
  {
    id: 'trv-geo-1',
    category: 'geography',
    kind: 'trivia',
    prompt: 'Which continent touches all four hemispheres (Northern, Southern, Eastern, and Western)?',
    answer: 'Africa',
    funFact: 'Both the Equator and the Prime Meridian pass near West and Central Africa.',
  },
  {
    id: 'trv-geo-2',
    category: 'geography',
    kind: 'trivia',
    prompt: 'What is the largest desert on Earth by total area?',
    answer: 'Antarctica',
    funFact: 'A desert is defined by sparse precipitation, not sand dunes — the interior of Antarctica gets only a couple inches per year.',
  },
  {
    id: 'trv-geo-3',
    category: 'geography',
    kind: 'trivia',
    prompt: 'Which country spans the most time zones when including its overseas territories?',
    answer: 'France (12 time zones)',
    funFact: 'French departments and territories stretch from the Caribbean and South America to the Indian Ocean and Polynesia.',
  },
  {
    id: 'trv-geo-4',
    category: 'geography',
    kind: 'trivia',
    prompt: 'Which waterfall has the largest single-drop height in the world?',
    answer: 'Angel Falls in Venezuela (3,212 ft)',
    funFact: 'Its plunge is so tall that much of the water mists into fine spray before reaching the river below.',
  },
  {
    id: 'trv-geo-5',
    category: 'geography',
    kind: 'trivia',
    prompt: 'Lake Baikal in Siberia holds roughly what fraction of Earth’s unfrozen surface freshwater?',
    answer: 'About one-fifth (roughly 20%)',
    funFact: 'At over 5,380 feet deep, Baikal is both the deepest and oldest freshwater lake on the planet.',
  },
  {
    id: 'trv-geo-6',
    category: 'geography',
    kind: 'trivia',
    prompt: 'Which capital city sits at the highest official elevation above sea level (executive & legislative seat)?',
    answer: 'La Paz, Bolivia (approx. 11,975 ft)',
    funFact: 'La Paz uses an extensive network of aerial cable cars (Mi Teleférico) as everyday public transit across steep valleys.',
  },
  {
    id: 'trv-geo-7',
    category: 'geography',
    kind: 'trivia',
    prompt: 'Which sea has no coastline at all, bounded only by four ocean currents?',
    answer: 'The Sargasso Sea',
    funFact: 'Located in the North Atlantic, it is defined by the North Atlantic Gyre and floating mats of golden sargassum seaweed.',
  },
  {
    id: 'trv-wrd-1',
    category: 'wordplay',
    kind: 'riddle',
    prompt: 'I have cities, but no houses. I have mountains, but no trees. I have water, but no fish. What am I?',
    answer: 'A map',
    funFact: 'Cartographers have drawn roads, peaks, and coastlines on clay tablets for more than 4,000 years.',
  },
  {
    id: 'trv-wrd-2',
    category: 'wordplay',
    kind: 'riddle',
    prompt: 'What 8-letter English word still remains a valid word each time you remove one letter until only one letter is left?',
    answer: 'Starting (starting -> staring -> string -> sting -> sing -> sin -> in -> I)',
    funFact: 'Word-pyramid puzzles like this are classic table games called “beheading” or “word-shrinking” chains.',
  },
  {
    id: 'trv-wrd-3',
    category: 'wordplay',
    kind: 'riddle',
    prompt: 'The more you take away from me, the bigger I grow. What am I?',
    answer: 'A hole',
    funFact: 'Simple paradox riddles date back to folk traditions shared aloud around hearths and dinner tables.',
  },
  {
    id: 'trv-wrd-4',
    category: 'wordplay',
    kind: 'riddle',
    prompt: 'What travels around the entire globe without ever leaving its corner?',
    answer: 'A postage stamp',
    funFact: 'The first adhesive postage stamp, Great Britain’s Penny Black, launched in May 1840.',
  },
  {
    id: 'trv-wrd-5',
    category: 'wordplay',
    kind: 'riddle',
    prompt: 'I speak without a mouth and hear without ears. I have nobody, yet I come alive with wind. What am I?',
    answer: 'An echo',
    funFact: 'Because sound waves travel around 1,125 ft/s in air, a cliff 560 feet away returns an echo in about one second.',
  },
  {
    id: 'trv-wrd-6',
    category: 'wordplay',
    kind: 'riddle',
    prompt: 'What 5-letter word becomes shorter when you add two letters to it?',
    answer: 'Short',
    funFact: 'Adding "-er" creates "shorter" — one of the best-known pun riddles for kids and adults alike.',
  },
  {
    id: 'trv-wrd-7',
    category: 'wordplay',
    kind: 'trivia',
    prompt: 'What do you call a sentence that contains every single letter of the alphabet at least once?',
    answer: 'A pangram',
    funFact: 'Besides “The quick brown fox jumps over the lazy dog,” shorter pangrams like “Sphinx of black quartz, judge my vow” use only 29 letters.',
  },
];

export const CURATED_WORD_ITEMS: DiscoveryWordItem[] = [
  {
    id: 'wod-01',
    word: 'Apricity',
    phonetic: '/əˈprɪs.ɪ.ti/',
    partOfSpeech: 'noun',
    definition: 'The comforting warmth of the winter sun against cool air.',
    example: 'We carried our mugs out onto the porch to soak in the afternoon apricity.',
    origin: 'Latin apricitas (“warmth of the sun”), first recorded in English in 1623.',
  },
  {
    id: 'wod-02',
    word: 'Serendipity',
    phonetic: '/ˌser.ənˈdɪp.ɪ.ti/',
    partOfSpeech: 'noun',
    definition: 'The happy knack of finding something valuable or delightful when looking for something else.',
    example: 'Finding an unopened sketchbook while cleaning the hall closet was pure serendipity.',
    origin: 'Coined in 1754 by Horace Walpole from the Persian fairy tale The Three Princes of Serendip.',
  },
  {
    id: 'wod-03',
    word: 'Sonder',
    phonetic: '/ˈsɒn.dər/',
    partOfSpeech: 'noun',
    definition: 'The sudden realization that every passerby is living a life as vivid and complex as your own.',
    example: 'Watching commuters from the train window brought on a quiet wave of sonder.',
    origin: 'Coined by John Koenig (The Dictionary of Obscure Sorrows), blending German sonder (“special”) and ponder.',
  },
  {
    id: 'wod-04',
    word: 'Petrichor',
    phonetic: '/ˈpet.rɪ.kɔːr/',
    partOfSpeech: 'noun',
    definition: 'The crisp, earthy fragrance produced when rain falls on dry soil or warm pavement.',
    example: 'After three dry weeks, the evening shower filled the garden with petrichor.',
    origin: 'Coined in 1964 by Australian researchers from Greek petra (“stone”) + ichor.',
  },
  {
    id: 'wod-05',
    word: 'Ephemeral',
    phonetic: '/ɪˈfem.ər.əl/',
    partOfSpeech: 'adjective',
    definition: 'Lasting for only a brief, fleeting span of time.',
    example: 'The pastel pink glow after sunset was ephemeral, fading within five minutes.',
    origin: 'Greek ephēmeros (“lasting just a day”).',
  },
  {
    id: 'wod-06',
    word: 'Fernweh',
    phonetic: '/ˈfɛrn.veɪ/',
    partOfSpeech: 'noun',
    definition: 'An ache for distant places; a longing to travel even farther than ordinary wanderlust.',
    example: 'Spinning the desk globe sparked an instant case of fernweh.',
    origin: 'German fern (“far”) + Weh (“pain/ache”), the opposite of Heimweh (homesickness).',
  },
  {
    id: 'wod-07',
    word: 'Halcyon',
    phonetic: '/ˈhæl.si.ən/',
    partOfSpeech: 'adjective',
    definition: 'Calm, golden, unhurried, and peaceful.',
    example: 'They looked back fondly on those halcyon summers spent camping by the lake.',
    origin: 'Greek halkyōn (kingfisher), from legends that kingfishers calmed winter seas while nesting.',
  },
  {
    id: 'wod-08',
    word: 'Luminous',
    phonetic: '/ˈluː.mɪ.nəs/',
    partOfSpeech: 'adjective',
    definition: 'Softly glowing or shining steadily with clear light or clarity.',
    example: 'Paper lanterns cast a luminous amber circle across the patio table.',
    origin: 'Latin luminosus, from lumen (“light”).',
  },
  {
    id: 'wod-09',
    word: 'Susurrus',
    phonetic: '/suːˈsʌr.əs/',
    partOfSpeech: 'noun',
    definition: 'A gentle whispering, rustling, or murmuring sound.',
    example: 'Only the soft susurrus of pine needles broke the morning silence.',
    origin: 'Direct borrowing from Latin susurrus (“a gentle whisper”).',
  },
  {
    id: 'wod-10',
    word: 'Vellichor',
    phonetic: '/ˈvel.ɪ.kɔːr/',
    partOfSpeech: 'noun',
    definition: 'The quiet nostalgia felt inside secondhand bookshops lined with well-read stories.',
    example: 'Rows of clothbound field guides filled the corner aisle with vellichor.',
    origin: 'Coined from vellum + ichor to describe the atmospheric pull of old paper.',
  },
  {
    id: 'wod-11',
    word: 'Hygge',
    phonetic: '/ˈhuː.ɡə/',
    partOfSpeech: 'noun',
    definition: 'A mood of cozy contentment and simple togetherness created by warmth, good company, and comfort.',
    example: 'Board games, wool socks, and spiced cider made Friday night effortless hygge.',
    origin: 'Danish & Norwegian term rooted in Old Norse hugr (“mind, comfort”).',
  },
  {
    id: 'wod-12',
    word: 'Equanimity',
    phonetic: '/ˌek.wəˈnɪm.ɪ.ti/',
    partOfSpeech: 'noun',
    definition: 'Steady mental calmness and composure, especially when plans shift unexpectedly.',
    example: 'When the flight was delayed by three hours, she handled the reroute with equanimity.',
    origin: 'Latin aequanimitas (“evenness of mind”), from aequus (“equal”) + animus (“spirit”).',
  },
  {
    id: 'wod-13',
    word: 'Resplendent',
    phonetic: '/rɪˈsplen.dənt/',
    partOfSpeech: 'adjective',
    definition: 'Strikingly bright, colorful, or impressive in appearance.',
    example: 'October maples turned the hillside resplendent in copper and crimson.',
    origin: 'Latin resplendere (“to shine brightly back”).',
  },
  {
    id: 'wod-14',
    word: 'Crepuscular',
    phonetic: '/krɪˈpʌs.kjə.lər/',
    partOfSpeech: 'adjective',
    definition: 'Relating to twilight, or active mainly around dawn and dusk.',
    example: 'Deer and fireflies are crepuscular, appearing most often as the light softens.',
    origin: 'Latin crepusculum (“twilight”).',
  },
  {
    id: 'wod-15',
    word: 'Palimpsest',
    phonetic: '/ˈpæl.ɪmp.sest/',
    partOfSpeech: 'noun',
    definition: 'Something reused or layered over time where traces of what came earlier still peek through.',
    example: 'The kitchen chalkboard was a palimpsest of grocery notes, doodles, and scores.',
    origin: 'Greek palimpsēstos (“scraped clean and written over again”).',
  },
  {
    id: 'wod-16',
    word: 'Alacrity',
    phonetic: '/əˈlæk.rɪ.ti/',
    partOfSpeech: 'noun',
    definition: 'Cheerful briskness and eager readiness to jump in.',
    example: 'Everyone volunteered with surprising alacrity when homemade pizza was on the menu.',
    origin: 'Latin alacritas (“eagerness, liveliness”).',
  },
  {
    id: 'wod-17',
    word: 'Mellifluous',
    phonetic: '/məˈlɪf.lu.əs/',
    partOfSpeech: 'adjective',
    definition: 'Smooth, sweet, and soothing to listen to.',
    example: 'A mellifluous cello melody drifted from the living room speakers.',
    origin: 'Latin mel (“honey”) + fluere (“to flow”).',
  },
  {
    id: 'wod-18',
    word: 'Eudaimonia',
    phonetic: '/ˌjuː.daɪˈmoʊ.ni.ə/',
    partOfSpeech: 'noun',
    definition: 'Deep human flourishing and well-being earned through curiosity, purpose, and kindness.',
    example: 'Teaching kids to cook a shared meal feels close to everyday eudaimonia.',
    origin: 'Ancient Greek eudaimonia (“flourishing spirit”), central to Aristotle’s ethics.',
  },
  {
    id: 'wod-19',
    word: 'Liminal',
    phonetic: '/ˈlɪm.ɪ.nəl/',
    partOfSpeech: 'adjective',
    definition: 'Sitting on a threshold between two stages, seasons, or moments.',
    example: 'That quiet half hour before the house wakes up feels wonderfully liminal.',
    origin: 'Latin limen (“threshold, doorway”).',
  },
  {
    id: 'wod-20',
    word: 'Perspicacious',
    phonetic: '/ˌpɜːr.spɪˈkeɪ.ʃəs/',
    partOfSpeech: 'adjective',
    definition: 'Quick to notice subtle details and understand things clearly.',
    example: 'A perspicacious observer spotted the camouflaged owl right away.',
    origin: 'Latin perspicax (“sharp-sighted”), from perspicere (“to look right through”).',
  },
  {
    id: 'wod-21',
    word: 'Solstice',
    phonetic: '/ˈsɒl.stɪs/',
    partOfSpeech: 'noun',
    definition: 'Either of the two days each year when the Sun reaches its highest or lowest noon path.',
    example: 'We marked the winter solstice by lighting candles early and planning spring seeds.',
    origin: 'Latin sol (“sun”) + sistere (“to stand still”).',
  },
  {
    id: 'wod-22',
    word: 'Convivial',
    phonetic: '/kənˈvɪv.i.əl/',
    partOfSpeech: 'adjective',
    definition: 'Warm, lively, and welcoming; happiest around a shared table.',
    example: 'A pot of soup and warm bread always sets a convivial tone.',
    origin: 'Latin convivium (“a feast together”), from con- (“with”) + vivere (“to live”).',
  },
  {
    id: 'wod-23',
    word: 'Quotidian',
    phonetic: '/kwoʊˈtɪd.i.ən/',
    partOfSpeech: 'adjective',
    definition: 'Ordinary, daily, and recurring as part of everyday rhythm.',
    example: 'Making morning tea is a small quotidian ritual that anchors the whole day.',
    origin: 'Latin quotidianus (“every day”), from quot (“how many”) + dies (“day”).',
  },
  {
    id: 'wod-24',
    word: 'Ubiquitous',
    phonetic: '/juːˈbɪk.wɪ.təs/',
    partOfSpeech: 'adjective',
    definition: 'Present or spotted nearly everywhere you look.',
    example: 'Reusable water bottles became ubiquitous on every school backpack.',
    origin: 'Latin ubique (“everywhere”).',
  },
  {
    id: 'wod-25',
    word: 'Kaleidoscope',
    phonetic: '/kəˈlaɪ.də.skoʊp/',
    partOfSpeech: 'noun',
    definition: 'A constantly shifting mosaic of bright patterns, colors, or viewpoints.',
    example: 'Fall leaves formed a crisp kaleidoscope across the sidewalk.',
    origin: 'Coined in 1817 by David Brewster from Greek kalos (“beautiful”) + eidos (“form”) + skopeō (“to view”).',
  },
  {
    id: 'wod-26',
    word: 'Komorebi',
    phonetic: '/ˌkoʊ.moʊˈreɪ.bi/',
    partOfSpeech: 'noun',
    definition: 'The dappled pattern of sunlight filtering down through moving tree leaves.',
    example: 'The bike trail shimmered under golden afternoon komorebi.',
    origin: 'Japanese 木漏れ日 (ko “tree” + more “leaking through” + bi “sunlight”).',
  },
  {
    id: 'wod-27',
    word: 'Trouvaille',
    phonetic: '/truːˈvaɪ/',
    partOfSpeech: 'noun',
    definition: 'A lucky, unexpected gem stumbled across by chance.',
    example: 'That vintage cast-iron skillet at the neighborhood yard sale was a real trouvaille.',
    origin: 'French trouver (“to find”).',
  },
  {
    id: 'wod-28',
    word: 'Ingenious',
    phonetic: '/ɪnˈdʒiː.ni.əs/',
    partOfSpeech: 'adjective',
    definition: 'Cleverly designed, inventive, and surprisingly simple in practice.',
    example: 'Folding paper origami boxes out of old calendars was an ingenious desk organizer.',
    origin: 'Latin ingenium (“inborn talent or inventiveness”).',
  },
  {
    id: 'wod-29',
    word: 'Zephyr',
    phonetic: '/ˈzef.ər/',
    partOfSpeech: 'noun',
    definition: 'A soft, refreshing, gentle breeze.',
    example: 'A cool zephyr from the open kitchen window stirred the curtain.',
    origin: 'Greek Zephyros, god of the mild west wind.',
  },
  {
    id: 'wod-30',
    word: 'Astrolabe',
    phonetic: '/ˈæs.trə.leɪb/',
    partOfSpeech: 'noun',
    definition: 'A brass handheld sky instrument once used to tell time, seasons, and star altitude.',
    example: 'Sailors and astronomers tuned the astrolabe’s rotating plates by sightings of Polaris.',
    origin: 'Greek astrolabos (“star-taker”).',
  },
  {
    id: 'wod-31',
    word: 'Panacea',
    phonetic: '/ˌpæn.əˈsiː.ə/',
    partOfSpeech: 'noun',
    definition: 'A universal cure-all or solution for every difficulty.',
    example: 'A good night’s sleep isn’t a panacea, yet almost every hard problem feels lighter afterward.',
    origin: 'Greek panakeia (“all-healing”), from pan (“all”) + akos (“remedy”).',
  },
  {
    id: 'wod-32',
    word: 'Cacophony',
    phonetic: '/kəˈkɒf.ə.ni/',
    partOfSpeech: 'noun',
    definition: 'A wild, clashing jumble of loud sounds all at once.',
    example: 'Saturday morning band practice began with a joyful cacophony of brass and drums.',
    origin: 'Greek kakophōnia (“harsh sound”).',
  },
  {
    id: 'wod-33',
    word: 'Effervescent',
    phonetic: '/ˌef.ərˈves.ənt/',
    partOfSpeech: 'adjective',
    definition: 'Bubbling briskly, or full of irrepressible energy and enthusiasm.',
    example: 'She brought an effervescent curiosity to every science fair project.',
    origin: 'Latin effervescere (“to boil up briskly”).',
  },
  {
    id: 'wod-34',
    word: 'Meridian',
    phonetic: '/məˈrɪd.i.ən/',
    partOfSpeech: 'noun',
    definition: 'An imaginary north–south line around Earth connecting the poles, or the high noon peak of a day.',
    example: 'By solar meridian, shadows stood short directly under the oak trees.',
    origin: 'Latin meridies (“midday, noon”).',
  },
  {
    id: 'wod-35',
    word: 'Kintsugi',
    phonetic: '/kɪnˈtsuː.ɡi/',
    partOfSpeech: 'noun',
    definition: 'The Japanese craft of repairing broken pottery with gold-dusted lacquer, celebrating its history.',
    example: 'Rather than hiding the crack, kintsugi turned the teacup’s scar into a shimmering seam.',
    origin: 'Japanese 金継ぎ (kin “gold” + tsugi “joinery”).',
  },
  {
    id: 'wod-36',
    word: 'Nostalgia',
    phonetic: '/nɒˈstæl.dʒə/',
    partOfSpeech: 'noun',
    definition: 'An affectionate, bittersweet longing for times, places, or moments from the past.',
    example: 'Hearing that old arcade chime brought back an instant rush of childhood nostalgia.',
    origin: 'Coined in 1688 from Greek nostos (“homecoming”) + algos (“ache”).',
  },
];

interface MonthFallbackHistoryEntry {
  month: number;
  day: number;
  year: number;
  text: string;
  articleTitle: string;
}

export const FALLBACK_ON_THIS_DAY_BY_MONTH: MonthFallbackHistoryEntry[] = [
  {
    month: 1,
    day: 7,
    year: 1610,
    text: 'Galileo Galilei first observed three of Jupiter’s largest moons through his handcrafted telescope, proving not everything orbits Earth.',
    articleTitle: 'Galilean moons',
  },
  {
    month: 1,
    day: 24,
    year: 1984,
    text: 'Apple introduced the original Macintosh 128K personal computer, bringing graphical windows and mouse navigation into everyday homes.',
    articleTitle: 'Macintosh 128K',
  },
  {
    month: 2,
    day: 14,
    year: 1990,
    text: 'The Voyager 1 spacecraft turned its camera back across 3.7 billion miles to capture the iconic “Pale Blue Dot” portrait of Earth.',
    articleTitle: 'Pale Blue Dot',
  },
  {
    month: 2,
    day: 29,
    year: 1940,
    text: 'On Leap Day, astronomer Harlow Shapley and colleagues highlighted the rare calendar adjustment keeping seasons aligned with Earth’s orbit.',
    articleTitle: 'February 29',
  },
  {
    month: 3,
    day: 10,
    year: 1876,
    text: 'Alexander Graham Bell transmitted the first clear speech sentence over a wire telephone to Thomas Watson in an adjacent room.',
    articleTitle: 'Telephone',
  },
  {
    month: 3,
    day: 14,
    year: 1879,
    text: 'Physicist Albert Einstein was born in Ulm, Germany — later sharing relativity theories that reshaped how humanity measures space, light, and gravity.',
    articleTitle: 'Albert Einstein',
  },
  {
    month: 4,
    day: 12,
    year: 1961,
    text: 'Yuri Gagarin completed the first crewed orbital spaceflight aboard Vostok 1 in 108 minutes.',
    articleTitle: 'Vostok 1',
  },
  {
    month: 4,
    day: 24,
    year: 1990,
    text: 'The Hubble Space Telescope launched into low Earth orbit, opening decades of deep-field cosmic photography.',
    articleTitle: 'Hubble Space Telescope',
  },
  {
    month: 5,
    day: 29,
    year: 1953,
    text: 'Edmund Hillary and Tenzing Norgay became the first climbers confirmed to reach the 29,031-foot summit of Mount Everest.',
    articleTitle: '1953 British Mount Everest expedition',
  },
  {
    month: 5,
    day: 24,
    year: 1844,
    text: 'Samuel Morse tapped out the first public intercity telegraph message (“What hath God wrought”) between Washington and Baltimore.',
    articleTitle: 'Electrical telegraph',
  },
  {
    month: 6,
    day: 15,
    year: 1752,
    text: 'Benjamin Franklin conducted atmospheric electricity experiments showing lightning and static sparks share the same physical nature.',
    articleTitle: 'Kite experiment',
  },
  {
    month: 6,
    day: 23,
    year: 1912,
    text: 'Mathematician and computer science pioneer Alan Turing was born in London.',
    articleTitle: 'Alan Turing',
  },
  {
    month: 7,
    day: 20,
    year: 1969,
    text: 'Apollo 11’s Lunar Module Eagle touched down on the Sea of Tranquility as millions around the world watched live.',
    articleTitle: 'Apollo 11',
  },
  {
    month: 7,
    day: 25,
    year: 1920,
    text: 'Chemist and X-ray crystallographer Rosalind Franklin was born; her diffraction Photo 51 proved crucial to revealing DNA’s double-helix structure.',
    articleTitle: 'Rosalind Franklin',
  },
  {
    month: 8,
    day: 6,
    year: 1991,
    text: 'Tim Berners-Lee published the first public summary of the World Wide Web project, inviting anyone online to build hyperlinks and web pages.',
    articleTitle: 'World Wide Web',
  },
  {
    month: 8,
    day: 20,
    year: 1977,
    text: 'NASA launched Voyager 2 on its Grand Tour of Jupiter, Saturn, Uranus, and Neptune — still transmitting from interstellar space today.',
    articleTitle: 'Voyager 2',
  },
  {
    month: 9,
    day: 1,
    year: 1985,
    text: 'A joint expedition led by Robert Ballard and Jean-Louis Michel located the resting place of RMS Titanic deep on the North Atlantic seafloor.',
    articleTitle: 'Wreck of the Titanic',
  },
  {
    month: 9,
    day: 22,
    year: 1791,
    text: 'Experimental physicist Michael Faraday was born; his discoveries in electromagnetic induction power modern generators and transformers.',
    articleTitle: 'Michael Faraday',
  },
  {
    month: 10,
    day: 4,
    year: 1957,
    text: 'Sputnik 1 became Earth’s first artificial orbital satellite, broadcasting steady radio pulses heard by amateur operators worldwide.',
    articleTitle: 'Sputnik 1',
  },
  {
    month: 10,
    day: 29,
    year: 1969,
    text: 'Researchers sent the first host-to-host message across ARPANET between UCLA and Stanford Research Institute, laying foundations for the Internet.',
    articleTitle: 'ARPANET',
  },
  {
    month: 11,
    day: 19,
    year: 1863,
    text: 'Abraham Lincoln delivered the 272-word Gettysburg Address in Pennsylvania, enduring as one of history’s clearest statements on civic democracy.',
    articleTitle: 'Gettysburg Address',
  },
  {
    month: 11,
    day: 20,
    year: 1998,
    text: 'The first module of the International Space Station, Zarya, launched into orbit — beginning continuous international teamwork in space.',
    articleTitle: 'International Space Station',
  },
  {
    month: 12,
    day: 17,
    year: 1903,
    text: 'Orville and Wilbur Wright completed four controlled, powered flights above the sand dunes of Kitty Hawk, North Carolina.',
    articleTitle: 'Wright Flyer',
  },
  {
    month: 12,
    day: 25,
    year: 2021,
    text: 'The James Webb Space Telescope launched cleanly on Christmas morning to peer into infrared light from the earliest galaxies.',
    articleTitle: 'James Webb Space Telescope',
  },
];

export function dayOfYearIndex(date: Date): number {
  const start = new Date(date.getFullYear(), 0, 0);
  const diffMs = date.getTime() - start.getTime();
  const oneDayMs = 86_400_000;
  return Math.max(0, Math.floor(diffMs / oneDayMs));
}

export function getDailyTriviaList(
  category: DiscoveryTriviaCategory = 'all'
): DiscoveryTriviaItem[] {
  if (!category || category === 'all') return CURATED_TRIVIA_ITEMS;
  const filtered = CURATED_TRIVIA_ITEMS.filter((item) => item.category === category);
  return filtered.length > 0 ? filtered : CURATED_TRIVIA_ITEMS;
}

export function getDailyTriviaForDate(
  date: Date = new Date(),
  category: DiscoveryTriviaCategory = 'all',
  stepOffset = 0
): { item: DiscoveryTriviaItem; index: number; total: number } {
  const list = getDailyTriviaList(category);
  const baseIdx = dayOfYearIndex(date);
  const safeOffset = Math.trunc(Number.isFinite(stepOffset) ? stepOffset : 0);
  const idx = ((baseIdx + safeOffset) % list.length + list.length) % list.length;
  return {
    item: list[idx],
    index: idx,
    total: list.length,
  };
}

export function getDailyWordForDate(
  date: Date = new Date(),
  stepOffset = 0
): { item: DiscoveryWordItem; index: number; total: number } {
  const list = CURATED_WORD_ITEMS;
  const baseIdx = dayOfYearIndex(date);
  const safeOffset = Math.trunc(Number.isFinite(stepOffset) ? stepOffset : 0);
  const idx = ((baseIdx + safeOffset) % list.length + list.length) % list.length;
  return {
    item: list[idx],
    index: idx,
    total: list.length,
  };
}

export function getFallbackHistoryEventsForDate(
  month: number,
  day: number
): DiscoveryHistoryEvent[] {
  const safeMonth = Number.isInteger(month) && month >= 1 && month <= 12 ? month : 1;
  const safeDay = Number.isInteger(day) && day >= 1 && day <= 31 ? day : 1;

  const exactMatches = FALLBACK_ON_THIS_DAY_BY_MONTH.filter(
    (entry) => entry.month === safeMonth && entry.day === safeDay
  );
  const sameMonth = FALLBACK_ON_THIS_DAY_BY_MONTH.filter(
    (entry) => entry.month === safeMonth && entry.day !== safeDay
  );

  // Rotate starting point in the global landmark list so every calendar day gets at least 4 cards offline
  const rotatedGlobal: MonthFallbackHistoryEntry[] = [];
  const total = FALLBACK_ON_THIS_DAY_BY_MONTH.length;
  const start = (safeMonth * 31 + safeDay) % total;
  for (let i = 0; i < total; i++) {
    rotatedGlobal.push(FALLBACK_ON_THIS_DAY_BY_MONTH[(start + i) % total]);
  }

  const combined = [...exactMatches, ...sameMonth, ...rotatedGlobal];
  const seen = new Set<string>();
  const out: DiscoveryHistoryEvent[] = [];

  for (const entry of combined) {
    const key = `${entry.year}:${entry.text}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({
      year: entry.year,
      text: entry.text,
      articleTitle: entry.articleTitle,
    });
    if (out.length >= 6) break;
  }

  return out;
}
