import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DEFAULT_ROOT = path.resolve(__dirname, '..');

const BINARY_EXTENSIONS = new Set([
  '.png', '.jpg', '.jpeg', '.webp', '.gif', '.ico', '.svg',
  '.woff', '.woff2', '.ttf', '.otf', '.eot', '.wasm', '.gz', '.zip',
]);

export const ALLOWED_RUNTIME_DEPENDENCIES = new Set([
  '@mozilla/readability',
  '@supabase/supabase-js',
  'clsx',
  'dexie',
  'dompurify',
  'fast-xml-parser',
  'framer-motion',
  'ical.js',
  'libheif-js',
  'linkedom',
  'lucide-react',
  'qrcode.react',
  'react',
  'react-dom',
  'tailwind-merge',
  'undici',
  'zustand',
]);

export const BANNED_PAID_OR_TRACKER_PACKAGES = new Set([
  'openai',
  '@anthropic-ai/sdk',
  '@google/generative-ai',
  '@google/genai',
  'firebase',
  'stripe',
  '@stripe/stripe-js',
  'posthog-js',
  'mixpanel-browser',
  '@sentry/react',
  '@sentry/browser',
  '@sentry/node',
  '@segment/analytics-next',
  'amplitude-js',
  '@amplitude/analytics-browser',
]);

export const ALLOWED_API_HOSTS = new Set([
  'api.open-meteo.com',
  'geocoding-api.open-meteo.com',
  'air-quality-api.open-meteo.com',
  'commons.wikimedia.org',
  'upload.wikimedia.org',
  'api.giphy.com',
  'plex.tv',
  'app.plex.tv',
  'query1.finance.yahoo.com',
  'query2.finance.yahoo.com',
  'photos.google.com',
  'drive.google.com',
  'lh3.googleusercontent.com',
  'calendar.google.com',
  'images.unsplash.com',
  'dashboard.trinhism.com',
  'tony.trinhism.com',
  'trinhism.com',
  'ical-cache.ambiently.internal',
  'example.com',
  'example.org',
  'www.w3.org',
  'schema.org',
  'vite.dev',
]);

const BANNED_TRACKER_DOMAINS = [
  'googletagmanager.com',
  'google-analytics.com',
  'plausible.io',
  'clarity.ms',
  'hotjar.com',
  'connect.facebook.net',
  'cdn.segment.com',
  'api-js.mixpanel.com',
];

const SECRET_PATTERNS = [
  { name: 'PEM private key', regex: /-----BEGIN (?:RSA |EC |DSA |OPENSSH |PGP )?PRIVATE KEY-----/ },
  { name: 'Supabase secret key', regex: /\bsb_secret_[A-Za-z0-9_-]{15,}\b/ },
  { name: 'Signed JWT token', regex: /\beyJhbGciOi[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{12,}\.[A-Za-z0-9_-]{12,}\b/ },
  { name: 'GitHub PAT', regex: /\b(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9]{36,}\b|\bgithub_pat_[A-Za-z0-9_]{50,}\b/ },
  { name: 'OpenAI/Anthropic key', regex: /\bsk-(?:proj-|ant-)[A-Za-z0-9_-]{24,}\b/ },
  { name: 'Stripe live key', regex: /\b(?:sk|rk)_live_[A-Za-z0-9]{20,}\b/ },
  { name: 'Slack token', regex: /\bxox[baprs]-[A-Za-z0-9-]{20,}\b/ },
  { name: 'Google API key', regex: /\bAIza[0-9A-Za-z_-]{35}\b/ },
  { name: 'AWS access key', regex: /\bAKIA[0-9A-Z]{16}\b/ },
  {
    name: 'Database URI with credentials',
    regex: /postgres(?:ql)?:\/\/[^/\s<[$'"]+:[^@\s<[$>'"]{6,}@(?!localhost\b|127\.0\.0\.1\b)[a-z0-9.-]+/i,
  },
];

const LOCAL_PATH_PATTERNS = [
  /[A-Za-z]:\\Users\\[^\\\s`"']+/i,
  /[A-Za-z]:\\repos\\[^\\\s`"']+/i,
  /\/Users\/[A-Za-z0-9._-]+\//,
];

const REQUIRED_NOINDEX_PATHS = [
  '/tests/*',
  '/AGENTS.md',
  '/CLAUDE.md',
  '/DEVELOPER_WORKFLOW.md',
  '/CHANGELOG.md',
  '/README.md',
  '/package.json',
];

const REQUIRED_ROBOTS_DISALLOWS = [
  '/api/',
  '/tests/',
  '/*?join=',
  '/AGENTS.md',
  '/CLAUDE.md',
  '/DEVELOPER_WORKFLOW.md',
  '/CHANGELOG.md',
  '/README.md',
  '/package.json',
];

function toPosix(relPath) {
  return relPath.replace(/\\/g, '/').replace(/^\.\//, '');
}

function getGitFileList(rootDir, includeOthers) {
  const args = includeOthers
    ? ['ls-files', '--cached', '--others', '--exclude-standard']
    : ['ls-files'];
  const out = execFileSync('git', args, { cwd: rootDir, encoding: 'utf8' });
  return out
    .split(/\r?\n/)
    .map((line) => toPosix(line.trim()))
    .filter(Boolean);
}

function createVfs(rootDir, overrides = {}, extraTrackedFiles = []) {
  const normalizedOverrides = new Map();
  for (const [k, v] of Object.entries(overrides)) {
    normalizedOverrides.set(toPosix(k), v);
  }

  const baseTracked = getGitFileList(rootDir, false);
  const baseRepo = getGitFileList(rootDir, true);

  const applyOverridesToList = (list) => {
    const set = new Set(list);
    for (const extra of extraTrackedFiles) {
      set.add(toPosix(extra));
    }
    for (const [p, val] of normalizedOverrides.entries()) {
      if (val === null) set.delete(p);
      else set.add(p);
    }
    return Array.from(set).sort();
  };

  const exists = (relPath) => {
    const p = toPosix(relPath);
    if (normalizedOverrides.has(p)) {
      return normalizedOverrides.get(p) !== null;
    }
    const abs = path.join(rootDir, p);
    return fs.existsSync(abs) && fs.statSync(abs).isFile();
  };

  const readText = (relPath) => {
    const p = toPosix(relPath);
    if (normalizedOverrides.has(p)) {
      const val = normalizedOverrides.get(p);
      if (val === null) return null;
      return val;
    }
    const abs = path.join(rootDir, p);
    if (!fs.existsSync(abs) || !fs.statSync(abs).isFile()) return null;
    return fs.readFileSync(abs, 'utf8');
  };

  return {
    trackedFiles: applyOverridesToList(baseTracked),
    repoFiles: applyOverridesToList(baseRepo),
    normalizedOverrides,
    exists,
    readText,
  };
}

function isBinaryPath(relPath) {
  return BINARY_EXTENSIONS.has(path.extname(relPath).toLowerCase());
}

function parseHeadersBlocks(content) {
  const blocks = [];
  let current = null;
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trimEnd();
    if (!line.trim() || line.trim().startsWith('#')) continue;
    if (!/^\s/.test(rawLine)) {
      current = { pattern: line.trim(), headers: [] };
      blocks.push(current);
    } else if (current) {
      const colonIdx = line.indexOf(':');
      if (colonIdx > 0) {
        current.headers.push({
          name: line.slice(0, colonIdx).trim().toLowerCase(),
          value: line.slice(colonIdx + 1).trim().toLowerCase(),
        });
      }
    }
  }
  return blocks;
}

function checkSecretsAndPlaceholders(vfs, violations) {
  for (const relPath of vfs.trackedFiles) {
    const base = path.posix.basename(relPath);
    if (/^\.env(\.|$)/i.test(base) && relPath !== '.env.example') {
      violations.push(`[secrets] Forbidden environment file is tracked: ${relPath}`);
    }
    if (base === 'ambiently-data.json' || /\.(pem|key|p12|pfx)$/i.test(base)) {
      violations.push(`[secrets] Forbidden credential or data dump file is tracked: ${relPath}`);
    }
  }

  for (const relPath of vfs.repoFiles) {
    if (isBinaryPath(relPath) || relPath === 'package-lock.json') continue;
    if (
      (relPath === 'tests/validate-guardrails.js' || relPath === 'tests/guardrails.test.ts') &&
      !vfs.normalizedOverrides.has(relPath)
    ) {
      continue;
    }
    const text = vfs.readText(relPath);
    if (text === null) continue;

    for (const { name, regex } of SECRET_PATTERNS) {
      if (regex.test(text)) {
        violations.push(`[secrets] Potential ${name} detected in ${relPath}`);
      }
    }

    const shouldScanLocalPaths =
      relPath === 'AGENTS.md' ||
      relPath === 'CLAUDE.md' ||
      relPath === 'DEVELOPER_WORKFLOW.md' ||
      relPath === 'README.md' ||
      relPath === 'FEATURES.md' ||
      relPath === 'ARCHITECTURE.md' ||
      relPath === 'RASPBERRY_PI.md' ||
      /^(src|functions|server|scripts)\//.test(relPath);

    if (shouldScanLocalPaths) {
      for (const pathRegex of LOCAL_PATH_PATTERNS) {
        if (pathRegex.test(text)) {
          violations.push(`[paths] Hardcoded developer filesystem path found in ${relPath}`);
          break;
        }
      }
    }
  }

  const configJs = vfs.readText('public/config.js');
  if (configJs === null) {
    violations.push('[placeholders] Missing public/config.js runtime placeholder');
  } else {
    if (!configJs.includes('window.__AMBIENTLY_CONFIG__ = window.__AMBIENTLY_CONFIG__ || {};')) {
      violations.push('[placeholders] public/config.js must remain a safe runtime placeholder');
    }
    if (/(\.supabase\.co\b|sb_publishable_|eyJhbGci)/i.test(configJs)) {
      violations.push('[placeholders] public/config.js must not hardcode live Supabase credentials');
    }
  }

  const envExample = vfs.readText('.env.example');
  if (envExample === null) {
    violations.push('[placeholders] Missing .env.example template');
  } else {
    for (const key of ['SUPABASE_URL', 'SUPABASE_ANON_KEY', 'VITE_SUPABASE_URL', 'VITE_SUPABASE_ANON_KEY']) {
      const m = envExample.match(new RegExp(`^${key}=(.*)$`, 'm'));
      if (!m || m[1].trim() !== '') {
        violations.push(`[placeholders] .env.example must keep ${key}= empty`);
      }
    }
  }
}

function checkZeroCostAndApiSafety(vfs, violations) {
  const pkgText = vfs.readText('package.json');
  if (pkgText === null) {
    violations.push('[api-safety] Missing package.json');
    return;
  }

  let pkg;
  try {
    pkg = JSON.parse(pkgText);
  } catch {
    violations.push('[api-safety] Invalid JSON in package.json');
    return;
  }

  const runtimeDeps = Object.keys(pkg.dependencies || {});
  for (const dep of runtimeDeps) {
    if (BANNED_PAID_OR_TRACKER_PACKAGES.has(dep)) {
      violations.push(`[api-safety] Banned paid/telemetry dependency in dependencies: ${dep}`);
    } else if (!ALLOWED_RUNTIME_DEPENDENCIES.has(dep)) {
      violations.push(`[api-safety] Unapproved runtime dependency in package.json: ${dep}`);
    }
  }
  for (const devDep of Object.keys(pkg.devDependencies || {})) {
    if (BANNED_PAID_OR_TRACKER_PACKAGES.has(devDep)) {
      violations.push(`[api-safety] Banned paid/telemetry dependency in devDependencies: ${devDep}`);
    }
  }

  for (const relPath of vfs.repoFiles) {
    if (!/^(src\/services|functions|server)\//.test(relPath) || isBinaryPath(relPath)) continue;
    const text = vfs.readText(relPath);
    if (text === null) continue;

    for (const match of text.matchAll(/https:\/\/([a-z0-9.-]+)/gi)) {
      const host = match[1].toLowerCase();
      if (!ALLOWED_API_HOSTS.has(host)) {
        violations.push(`[api-safety] Unapproved external API host "${host}" in ${relPath}`);
      }
    }

    if (/open-meteo\.com[^\s`'"]*[?&]apikey=/i.test(text) || /customer-api\.open-meteo\.com/i.test(text)) {
      violations.push(`[api-safety] Paid Open-Meteo endpoint/apikey parameter forbidden in ${relPath}`);
    }

    for (const match of text.matchAll(/https:\/\/api\.giphy\.com\/([^`'"]+)/gi)) {
      const rest = match[1];
      if (!rest.startsWith('v1/')) {
        violations.push(`[api-safety] Only GIPHY v1 public endpoints are allowed in ${relPath}`);
      }
      if (!rest.includes('rating=g')) {
        violations.push(`[api-safety] GIPHY endpoint in ${relPath} must enforce rating=g`);
      }
    }
  }

  for (const relPath of vfs.repoFiles) {
    if (relPath !== 'index.html' && !relPath.startsWith('src/')) continue;
    if (isBinaryPath(relPath)) continue;
    const text = vfs.readText(relPath);
    if (text === null) continue;
    const lower = text.toLowerCase();
    for (const domain of BANNED_TRACKER_DOMAINS) {
      if (lower.includes(domain)) {
        violations.push(`[api-safety] Third-party analytics/tracker domain "${domain}" forbidden in ${relPath}`);
      }
    }
  }
}

function checkVersionSync(vfs, violations) {
  const pkgText = vfs.readText('package.json');
  if (!pkgText) return;
  let version;
  try {
    version = JSON.parse(pkgText).version;
  } catch {
    return;
  }
  if (!/^\d+\.\d+\.\d+$/.test(String(version || ''))) {
    violations.push(`[version] Invalid semver version in package.json: ${version}`);
    return;
  }

  const versionJsonText = vfs.readText('public/version.json');
  if (versionJsonText === null) {
    violations.push('[version] Missing public/version.json');
  } else {
    try {
      const parsed = JSON.parse(versionJsonText);
      if (parsed.version !== version) {
        violations.push(
          `[version] public/version.json (${parsed.version}) does not match package.json (${version})`
        );
      }
    } catch {
      violations.push('[version] Invalid JSON in public/version.json');
    }
  }

  const indexHtml = vfs.readText('index.html');
  if (indexHtml === null) {
    violations.push('[version] Missing index.html');
  } else {
    const swMatch = indexHtml.match(/"softwareVersion":\s*"([^"]+)"/);
    if (!swMatch || swMatch[1] !== version) {
      violations.push(
        `[version] index.html softwareVersion (${swMatch?.[1] ?? 'missing'}) does not match package.json (${version})`
      );
    }
  }

  const changelogMd = vfs.readText('CHANGELOG.md');
  if (changelogMd === null) {
    violations.push('[version] Missing CHANGELOG.md');
  } else {
    const mdMatch = changelogMd.match(/^## \[(\d+\.\d+\.\d+)\]/m);
    if (!mdMatch || mdMatch[1] !== version) {
      violations.push(
        `[version] CHANGELOG.md top entry (${mdMatch?.[1] ?? 'missing'}) does not match package.json (${version})`
      );
    }
  }

  const changelogTs = vfs.readText('src/data/changelog.ts');
  if (changelogTs === null) {
    violations.push('[version] Missing src/data/changelog.ts');
  } else {
    const tsMatch = changelogTs.match(/version:\s*["']v(\d+\.\d+\.\d+)["']/);
    if (!tsMatch || tsMatch[1] !== version) {
      violations.push(
        `[version] src/data/changelog.ts top release (${tsMatch?.[1] ?? 'missing'}) does not match package.json (${version})`
      );
    }
  }

  const versionTs = vfs.readText('src/data/version.ts');
  if (versionTs === null || !versionTs.includes('packageJson.version')) {
    violations.push('[version] src/data/version.ts must derive APP_VERSION from package.json');
  }
}

function checkPwaAndStaticAssets(vfs, violations) {
  const viteConfig = vfs.readText('vite.config.ts');
  if (viteConfig === null) {
    violations.push('[assets] Missing vite.config.ts');
  } else {
    const includeMatch = viteConfig.match(/includeAssets:\s*\[([\s\S]*?)\]/);
    if (!includeMatch) {
      violations.push('[assets] vite.config.ts missing VitePWA includeAssets list');
    } else {
      for (const m of includeMatch[1].matchAll(/['"]([^'"]+)['"]/g)) {
        const assetRel = `public/${m[1].replace(/^\/+/, '')}`;
        if (!vfs.exists(assetRel)) {
          violations.push(`[assets] Missing VitePWA includeAsset on disk: ${assetRel}`);
        }
      }
    }

    const iconsMatch = viteConfig.match(/icons:\s*\[([\s\S]*?)\]\s*,/);
    if (!iconsMatch) {
      violations.push('[assets] vite.config.ts missing VitePWA manifest icons list');
    } else {
      for (const m of iconsMatch[1].matchAll(/src:\s*['"]([^'"]+)['"]/g)) {
        const iconRel = `public/${m[1].replace(/^\/+/, '')}`;
        if (!vfs.exists(iconRel)) {
          violations.push(`[assets] Missing PWA manifest icon on disk: ${iconRel}`);
        }
      }
    }
  }

  const requiredAssets = [
    'public/favicon.png',
    'public/apple-touch-icon.png',
    'public/logo.png',
    'public/pwa-192x192.png',
    'public/pwa-512x512.png',
    'public/icon-maskable-192.png',
    'public/icon-maskable-512.png',
    'public/og-banner.png',
    'public/robots.txt',
    'public/sitemap.xml',
    'public/_headers',
    'public/config.js',
    'public/version.json',
    'public/assets/venmo.png',
    'public/assets/paypal.jpg',
    'public/assets/zelle.jpg',
    'assets/brand/icon-square.jpg',
    'assets/brand/banner-ambiently.jpg',
  ];
  for (const reqAsset of requiredAssets) {
    if (!vfs.exists(reqAsset)) {
      violations.push(`[assets] Required static/brand asset missing: ${reqAsset}`);
    }
  }

  for (const deadAsset of [
    'public/favicon.svg',
    'public/icons.svg',
    'public/icon-192.png',
    'public/icon-512.png',
  ]) {
    if (vfs.exists(deadAsset)) {
      violations.push(`[assets] Dead or duplicate legacy asset must not exist: ${deadAsset}`);
    }
  }

  const distManifestText = vfs.readText('dist/manifest.webmanifest');
  if (distManifestText !== null) {
    try {
      const parsedManifest = JSON.parse(distManifestText);
      for (const icon of parsedManifest.icons || []) {
        if (icon && typeof icon.src === 'string') {
          const distIconRel = `dist/${icon.src.replace(/^\/+/, '')}`;
          if (!vfs.exists(distIconRel)) {
            violations.push(`[assets] Built manifest icon missing in dist/: ${distIconRel}`);
          }
        }
      }
    } catch {
      violations.push('[assets] Invalid JSON in dist/manifest.webmanifest');
    }
  }

  const distSwText = vfs.readText('dist/sw.js');
  if (distSwText !== null) {
    const precacheMatch = distSwText.match(/precacheAndRoute\(\s*(\[[\s\S]*?\])\s*[,)]/);
    if (precacheMatch) {
      for (const urlMatch of precacheMatch[1].matchAll(/["']?url["']?\s*:\s*["']([^"']+)["']/g)) {
        const entryRel = `dist/${urlMatch[1].replace(/^\/+/, '')}`;
        if (!vfs.exists(entryRel)) {
          violations.push(`[assets] Built sw.js precache target missing in dist/: ${entryRel}`);
        }
      }
    }
  }
}

function checkBrandingAndAttribution(vfs, violations) {
  const requiredSnippetsByFile = [
    {
      file: 'src/components/dock/AmbientQuickMenu.tsx',
      snippets: ['href="https://trinhism.com"', 'Trinhism', 'https://github.com/Genghis1227/ambiently', 'AGPLv3'],
    },
    {
      file: 'src/components/settings/SettingsModal.tsx',
      snippets: ['Ambiently', 'APP_VERSION', 'href="https://trinhism.com"', '<SupportPanel'],
    },
    {
      file: 'src/components/changelog/ChangelogModal.tsx',
      snippets: ['href="https://trinhism.com"', 'https://github.com/Genghis1227/ambiently/blob/main/CHANGELOG.md', 'AGPLv3'],
    },
    {
      file: 'src/components/settings/SupportPanel.tsx',
      snippets: [
        'href="https://trinhism.com"',
        'Trinhism Labs',
        'https://www.venmo.com/TonyLTrinh',
        '/assets/venmo.png',
        'https://www.paypal.me/Genghis1227',
        '/assets/paypal.jpg',
        '/assets/zelle.jpg',
      ],
    },
    {
      file: 'index.html',
      snippets: ['<meta name="author" content="Trinhism"', '"name": "Trinhism"'],
    },
  ];

  for (const { file, snippets } of requiredSnippetsByFile) {
    const text = vfs.readText(file);
    if (text === null) {
      violations.push(`[branding] Required attribution/support file missing: ${file}`);
      continue;
    }
    for (const snippet of snippets) {
      if (!text.includes(snippet)) {
        violations.push(`[branding] Required branding/support snippet "${snippet}" missing from ${file}`);
      }
    }
  }
}

function checkSearchIndexingHygiene(vfs, violations) {
  const robotsTxt = vfs.readText('public/robots.txt');
  if (robotsTxt === null) {
    violations.push('[seo-hygiene] Missing public/robots.txt');
  } else {
    if (!/^User-agent:\s*\*/m.test(robotsTxt)) {
      violations.push('[seo-hygiene] public/robots.txt must declare User-agent: *');
    }
    if (!/^Allow:\s*\/$/m.test(robotsTxt)) {
      violations.push('[seo-hygiene] public/robots.txt must keep Allow: / for the main app');
    }
    for (const disallowedPath of REQUIRED_ROBOTS_DISALLOWS) {
      const escaped = disallowedPath.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      if (!new RegExp(`^Disallow:\\s*${escaped}\\s*$`, 'm').test(robotsTxt)) {
        violations.push(`[seo-hygiene] public/robots.txt missing Disallow rule: ${disallowedPath}`);
      }
    }
  }

  const headersTxt = vfs.readText('public/_headers');
  if (headersTxt === null) {
    violations.push('[seo-hygiene] Missing public/_headers');
  } else {
    const blocks = parseHeadersBlocks(headersTxt);
    const rootBlock = blocks.find((b) => b.pattern === '/*');
    if (!rootBlock) {
      violations.push('[seo-hygiene] public/_headers missing root /* security header block');
    } else if (rootBlock.headers.some((h) => h.name === 'x-robots-tag' && h.value.includes('noindex'))) {
      violations.push('[seo-hygiene] public/_headers must not apply X-Robots-Tag: noindex to /*');
    }

    for (const noindexPattern of REQUIRED_NOINDEX_PATHS) {
      const matchingBlock = blocks.find((b) => b.pattern === noindexPattern);
      const hasNoindex =
        matchingBlock &&
        matchingBlock.headers.some(
          (h) => h.name === 'x-robots-tag' && h.value.includes('noindex') && h.value.includes('nofollow')
        );
      if (!hasNoindex) {
        violations.push(
          `[seo-hygiene] public/_headers must set X-Robots-Tag: noindex, nofollow for ${noindexPattern}`
        );
      }
    }
  }
}

export function validateGuardrails(options = {}) {
  const rootDir = options.rootDir || DEFAULT_ROOT;
  const vfs = createVfs(rootDir, options.overrides || {}, options.extraTrackedFiles || []);
  const violations = [];

  checkSecretsAndPlaceholders(vfs, violations);
  checkZeroCostAndApiSafety(vfs, violations);
  checkVersionSync(vfs, violations);
  checkPwaAndStaticAssets(vfs, violations);
  checkBrandingAndAttribution(vfs, violations);
  checkSearchIndexingHygiene(vfs, violations);

  return {
    ok: violations.length === 0,
    violations,
  };
}

export function runNegativeSelfTests(options = {}) {
  const rootDir = options.rootDir || DEFAULT_ROOT;

  const expectViolation = (label, testOptions, expectedPattern) => {
    const res = validateGuardrails({ rootDir, ...testOptions });
    assert.equal(res.ok, false, `Expected violation for "${label}"`);
    assert.ok(
      res.violations.some((v) => expectedPattern.test(v)),
      `Expected violation matching ${expectedPattern} for "${label}", got: ${JSON.stringify(res.violations)}`
    );
  };

  const baselinePkg = JSON.parse(fs.readFileSync(path.join(rootDir, 'package.json'), 'utf8'));
  const baselineVersionJson = fs.readFileSync(path.join(rootDir, 'public', 'version.json'), 'utf8');
  const baselineIndexHtml = fs.readFileSync(path.join(rootDir, 'index.html'), 'utf8');
  const baselineChangelogMd = fs.readFileSync(path.join(rootDir, 'CHANGELOG.md'), 'utf8');
  const baselineChangelogTs = fs.readFileSync(path.join(rootDir, 'src', 'data', 'changelog.ts'), 'utf8');
  const baselineSupportPanel = fs.readFileSync(
    path.join(rootDir, 'src', 'components', 'settings', 'SupportPanel.tsx'),
    'utf8'
  );
  const baselineQuickMenu = fs.readFileSync(
    path.join(rootDir, 'src', 'components', 'dock', 'AmbientQuickMenu.tsx'),
    'utf8'
  );
  const baselineRobots = fs.readFileSync(path.join(rootDir, 'public', 'robots.txt'), 'utf8');
  const baselineHeaders = fs.readFileSync(path.join(rootDir, 'public', '_headers'), 'utf8');
  const baselineEnvExample = fs.readFileSync(path.join(rootDir, '.env.example'), 'utf8');
  const baselineAgents = fs.readFileSync(path.join(rootDir, 'AGENTS.md'), 'utf8');

  const cases = [
    [
      'tracked .env file',
      { extraTrackedFiles: ['.env'] },
      /Forbidden environment file is tracked: \.env/,
    ],
    [
      'leaked secret token in source',
      {
        overrides: {
          'src/App.tsx': 'const SECRET = "sk_' + 'live_1234567890abcdefghijklmnop";\n',
        },
      },
      /Stripe live key detected in src\/App\.tsx/,
    ],
    [
      'live Supabase URL in public/config.js',
      {
        overrides: {
          'public/config.js':
            'window.__AMBIENTLY_CONFIG__ = window.__AMBIENTLY_CONFIG__ || {};\nwindow.__AMBIENTLY_CONFIG__.supabaseUrl = "https://abc.supabase.co";\n',
        },
      },
      /public\/config\.js must not hardcode live Supabase credentials/,
    ],
    [
      'non-empty secret in .env.example',
      {
        overrides: {
          '.env.example': baselineEnvExample.replace('VITE_SUPABASE_ANON_KEY=', 'VITE_SUPABASE_ANON_KEY=leaked'),
        },
      },
      /\.env\.example must keep VITE_SUPABASE_ANON_KEY= empty/,
    ],
    [
      'hardcoded local filesystem path in AGENTS.md',
      {
        overrides: {
          'AGENTS.md': `${baselineAgents}\n# Dev path: C:\\Users\\Alice\\secrets\n`,
        },
      },
      /Hardcoded developer filesystem path found in AGENTS\.md/,
    ],
    [
      'unapproved runtime dependency in package.json',
      {
        overrides: {
          'package.json': JSON.stringify(
            {
              ...baselinePkg,
              dependencies: { ...baselinePkg.dependencies, openai: '^4.0.0' },
            },
            null,
            2
          ),
        },
      },
      /Banned paid\/telemetry dependency in dependencies: openai/,
    ],
    [
      'unapproved external paid API host and key in service',
      {
        overrides: {
          'src/services/weather.ts':
            'export const u = "https://customer-api.open-meteo.com/v1/forecast?apikey=xyz";\n',
        },
      },
      /Unapproved external API host "customer-api\.open-meteo\.com"/,
    ],
    [
      'analytics tracker in index.html',
      {
        overrides: {
          'index.html': baselineIndexHtml.replace(
            '</head>',
            '<script src="https://www.googletagmanager.com/gtag/js"></script></head>'
          ),
        },
      },
      /Third-party analytics\/tracker domain "googletagmanager\.com" forbidden in index\.html/,
    ],
    [
      'version mismatch in public/version.json',
      {
        overrides: {
          'public/version.json': baselineVersionJson.replace(baselinePkg.version, '9.9.9'),
        },
      },
      /public\/version\.json \(9\.9\.9\) does not match package\.json/,
    ],
    [
      'version mismatch in CHANGELOG.md and changelog.ts',
      {
        overrides: {
          'CHANGELOG.md': baselineChangelogMd.replace(`## [${baselinePkg.version}]`, '## [9.9.9]'),
          'src/data/changelog.ts': baselineChangelogTs.replace(`"v${baselinePkg.version}"`, '"v9.9.9"'),
        },
      },
      /CHANGELOG\.md top entry \(9\.9\.9\) does not match package\.json/,
    ],
    [
      'missing PWA icon and donation QR asset',
      {
        overrides: {
          'public/pwa-512x512.png': null,
          'public/assets/venmo.png': null,
        },
      },
      /Missing PWA manifest icon on disk: public\/pwa-512x512\.png/,
    ],
    [
      'resurrected dead SVG template file',
      {
        overrides: {
          'public/favicon.svg': '<svg></svg>',
        },
      },
      /Dead or duplicate legacy asset must not exist: public\/favicon\.svg/,
    ],
    [
      'missing file referenced by built dist/sw.js precache',
      {
        overrides: {
          'dist/manifest.webmanifest': '{"icons":[{"src":"/pwa-512x512.png"}]}',
          'dist/sw.js': 'precacheAndRoute([{url:"assets/missing-chunk.js",revision:"1"}]);',
          'dist/pwa-512x512.png': null,
          'dist/assets/missing-chunk.js': null,
        },
      },
      /Built sw\.js precache target missing in dist\/: dist\/assets\/missing-chunk\.js/,
    ],
    [
      'tampered Trinhism Labs attribution and SupportPanel links',
      {
        overrides: {
          'src/components/settings/SupportPanel.tsx': baselineSupportPanel.replace('Trinhism Labs', 'Other Labs'),
          'src/components/dock/AmbientQuickMenu.tsx': baselineQuickMenu.replace('https://trinhism.com', 'https://other.invalid'),
        },
      },
      /Required branding\/support snippet "Trinhism Labs" missing/,
    ],
    [
      'missing noindex/Disallow rules in robots.txt and _headers',
      {
        overrides: {
          'public/robots.txt': baselineRobots.replace('Disallow: /tests/\n', '').replace('Disallow: /tests/\r\n', ''),
          'public/_headers': baselineHeaders.replace('/tests/*', '/ignored-other/*'),
        },
      },
      /public\/_headers must set X-Robots-Tag: noindex, nofollow for \/tests\/\*/,
    ],
  ];

  for (const [label, testOptions, pattern] of cases) {
    expectViolation(label, testOptions, pattern);
  }

  return { passed: cases.length };
}

const isCliRun = process.argv[1] && path.resolve(process.argv[1]) === __filename;
if (isCliRun) {
  const result = validateGuardrails();
  if (!result.ok) {
    console.error('❌ Repository guardrail checks failed:');
    for (const violation of result.violations) {
      console.error(`  - ${violation}`);
    }
    process.exit(1);
  }
  if (process.argv.includes('--self-test')) {
    const selfTest = runNegativeSelfTests();
    console.log(
      `✅ Repository guardrails passed (clean repo + ${selfTest.passed} negative in-memory self-tests).`
    );
  } else {
    console.log('✅ Repository guardrails passed.');
  }
}
