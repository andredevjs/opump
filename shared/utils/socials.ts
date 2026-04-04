/**
 * Social-link normalization — single source of truth.
 *
 * Canonical storage contract:
 *   website  — full http:// or https:// URL
 *   twitter  — handle only (e.g. "mytoken")
 *   telegram — slug only   (e.g. "mygroup")
 *   discord  — invite code  (e.g. "abc123")
 *   github   — owner or owner/repo (e.g. "org/repo")
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

// discord.com URLs use /invite/<code> — we need to strip that prefix
const DISCORD_INVITE_PREFIX = /^\/invite\//i;

// ── Helpers ────────────────────────────────────────────────

function hasNonHttpScheme(value: string): boolean {
  // Matches scheme: but NOT host:port (colon followed by digit)
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

  // Already has http(s) — validate
  if (isFullUrl(trimmed)) {
    try {
      new URL(trimmed);
      return { ok: true, stored: trimmed };
    } catch {
      return { ok: false, reason: 'invalid_url' };
    }
  }

  // Non-http scheme
  if (hasNonHttpScheme(trimmed)) {
    return { ok: false, reason: 'unsupported_scheme' };
  }

  // Bare host or host:port — prepend https://
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

  // Whitespace in handle
  if (/\s/.test(trimmed)) return { ok: false, reason: 'invalid_handle' };

  // Non-http scheme — always reject
  if (hasNonHttpScheme(trimmed)) return { ok: false, reason: 'unsupported_scheme' };

  const config = PLATFORM_CONFIG[platform];

  // Full URL
  if (isFullUrl(trimmed)) {
    return extractFromUrl(trimmed, platform, config);
  }

  // Domain-prefixed shorthand without protocol (e.g. "t.me/mygroup", "github.com/org")
  // Try parsing as URL with https:// prepended
  const withScheme = `https://${trimmed}`;
  try {
    const url = new URL(withScheme);
    if (matchesPlatformDomain(url.hostname, platform)) {
      return extractFromUrl(withScheme, platform, config);
    }
  } catch {
    // Not a valid URL with prepended scheme — treat as bare handle
  }

  // Bare handle — strip leading @ for twitter
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

  // Must be http(s)
  if (!['http:', 'https:'].includes(url.protocol)) {
    return { ok: false, reason: 'unsupported_scheme' };
  }

  // Domain must match
  if (!matchesPlatformDomain(url.hostname, platform)) {
    return { ok: false, reason: 'unsupported_url' };
  }

  // Query string or hash fragment — reject
  if (url.search || url.hash) {
    return { ok: false, reason: 'invalid_handle' };
  }

  let pathname = url.pathname;

  // discord.com/invite/<code> → strip the /invite prefix
  if (platform === 'discord') {
    pathname = pathname.replace(DISCORD_INVITE_PREFIX, '/');
  }

  // Extract path segments
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

/**
 * Convert a canonical stored value to a clickable URL.
 * Website values are already full URLs — returned as-is.
 */
export function storedToDisplayUrl(value: string, platform: Platform | 'website'): string {
  if (!value) return '';
  if (platform === 'website') return value;
  return PLATFORM_CONFIG[platform].base + value;
}
