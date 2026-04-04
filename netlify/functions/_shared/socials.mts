/**
 * Social-link normalization — mirrored from shared/utils/socials.ts.
 * Duplicated here to avoid cross-directory imports that break Netlify's esbuild bundler.
 * Keep in sync with shared/utils/socials.ts.
 */

// ── Types ──────────────────────────────────────────────────

export type Platform = 'twitter' | 'telegram' | 'discord' | 'github';

export type WebsiteResult =
  | { ok: true; stored: string }
  | { ok: false; reason: 'unsupported_scheme' | 'invalid_url' };

export type HandleResult =
  | { ok: true; stored: string }
  | { ok: false; reason: 'unsupported_url' | 'unsupported_scheme' | 'invalid_handle' };

// ── Platform config ────────────────────────────────────────

interface PlatformConfig {
  domains: RegExp[];
  maxSegments: number;
  base: string;
}

const PLATFORM_CONFIG: Record<Platform, PlatformConfig> = {
  twitter: {
    domains: [/^(?:www\.)?(?:x\.com|twitter\.com|mobile\.twitter\.com)$/i],
    maxSegments: 1,
    base: 'https://x.com/',
  },
  telegram: {
    domains: [/^(?:www\.)?t\.me$/i],
    maxSegments: 1,
    base: 'https://t.me/',
  },
  discord: {
    domains: [/^(?:www\.)?discord\.gg$/i, /^(?:www\.)?discord\.com$/i],
    maxSegments: 1,
    base: 'https://discord.gg/',
  },
  github: {
    domains: [/^(?:www\.)?github\.com$/i],
    maxSegments: 2,
    base: 'https://github.com/',
  },
};

const DISCORD_INVITE_PREFIX = /^\/invite\//i;

// ── Helpers ────────────────────────────────────────────────

function hasNonHttpScheme(value: string): boolean {
  return /^[a-z][a-z0-9+.-]*:(?!\d)/i.test(value) && !/^https?:/i.test(value);
}

function isFullUrl(value: string): boolean {
  return /^https?:\/\//i.test(value);
}

function matchesPlatformDomain(hostname: string, platform: Platform): boolean {
  return PLATFORM_CONFIG[platform].domains.some((re) => re.test(hostname));
}

// ── normalizeWebsiteInput ──────────────────────────────────

export function normalizeWebsiteInput(raw: string): WebsiteResult {
  const trimmed = raw.trim();
  if (!trimmed) return { ok: true, stored: '' };

  if (isFullUrl(trimmed)) {
    try {
      new URL(trimmed);
      return { ok: true, stored: trimmed };
    } catch {
      return { ok: false, reason: 'invalid_url' };
    }
  }

  if (hasNonHttpScheme(trimmed)) {
    return { ok: false, reason: 'unsupported_scheme' };
  }

  const withScheme = `https://${trimmed}`;
  try {
    new URL(withScheme);
    return { ok: true, stored: withScheme };
  } catch {
    return { ok: false, reason: 'invalid_url' };
  }
}

// ── normalizeHandleInput ───────────────────────────────────

export function normalizeHandleInput(platform: Platform, raw: string): HandleResult {
  const trimmed = raw.trim();
  if (!trimmed) return { ok: true, stored: '' };

  if (/\s/.test(trimmed)) return { ok: false, reason: 'invalid_handle' };

  if (hasNonHttpScheme(trimmed)) return { ok: false, reason: 'unsupported_scheme' };

  const config = PLATFORM_CONFIG[platform];

  if (isFullUrl(trimmed)) {
    return extractFromUrl(trimmed, platform, config);
  }

  const withScheme = `https://${trimmed}`;
  try {
    const url = new URL(withScheme);
    if (matchesPlatformDomain(url.hostname, platform)) {
      return extractFromUrl(withScheme, platform, config);
    }
  } catch {
    // Not a valid URL — treat as bare handle
  }

  let handle = trimmed;
  if (platform === 'twitter') {
    handle = handle.replace(/^@/, '');
  }
  handle = handle.replace(/\/+$/, '');

  if (!handle) return { ok: false, reason: 'invalid_handle' };

  return validateSegments(handle, config);
}

function extractFromUrl(urlStr: string, platform: Platform, config: PlatformConfig): HandleResult {
  let url: URL;
  try {
    url = new URL(urlStr);
  } catch {
    return { ok: false, reason: 'invalid_handle' };
  }

  if (!['http:', 'https:'].includes(url.protocol)) {
    return { ok: false, reason: 'unsupported_scheme' };
  }

  if (!matchesPlatformDomain(url.hostname, platform)) {
    return { ok: false, reason: 'unsupported_url' };
  }

  if (url.search || url.hash) {
    return { ok: false, reason: 'invalid_handle' };
  }

  let pathname = url.pathname;

  if (platform === 'discord') {
    pathname = pathname.replace(DISCORD_INVITE_PREFIX, '/');
  }

  const segments = pathname.split('/').filter(Boolean);
  if (segments.length === 0) {
    return { ok: false, reason: 'invalid_handle' };
  }

  const handle = segments.join('/');
  return validateSegments(handle, config);
}

function validateSegments(handle: string, config: PlatformConfig): HandleResult {
  const segments = handle.split('/').filter(Boolean);
  if (segments.length === 0 || segments.length > config.maxSegments) {
    return { ok: false, reason: 'invalid_handle' };
  }
  return { ok: true, stored: segments.join('/') };
}

// ── Display helper ─────────────────────────────────────────

export function storedToDisplayUrl(value: string, platform: Platform | 'website'): string {
  if (!value) return '';
  if (platform === 'website') return value;
  return PLATFORM_CONFIG[platform].base + value;
}
