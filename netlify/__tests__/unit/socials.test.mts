import { describe, it, expect } from 'vitest';
import {
  normalizeWebsiteInput,
  normalizeHandleInput,
  storedToDisplayUrl,
} from '../../functions/_shared/socials.mts';
import type { WebsiteResult, HandleResult } from '../../functions/_shared/socials.mts';

// ── Website ────────────────────────────────────────────────

describe('normalizeWebsiteInput', () => {
  const cases: [string, WebsiteResult][] = [
    ['', { ok: true, stored: '' }],
    ['   ', { ok: true, stored: '' }],
    ['example.com', { ok: true, stored: 'https://example.com' }],
    ['example.com:3000', { ok: true, stored: 'https://example.com:3000' }],
    ['localhost:5173', { ok: true, stored: 'https://localhost:5173' }],
    ['127.0.0.1:8080', { ok: true, stored: 'https://127.0.0.1:8080' }],
    ['http://example.com', { ok: true, stored: 'http://example.com' }],
    ['https://example.com', { ok: true, stored: 'https://example.com' }],
    ['https://example.com/path?q=1#x', { ok: true, stored: 'https://example.com/path?q=1#x' }],
    ['ftp://example.com', { ok: false, reason: 'unsupported_scheme' }],
    ['ipfs://QmHash', { ok: false, reason: 'unsupported_scheme' }],
    ['mailto:foo@example.com', { ok: false, reason: 'unsupported_scheme' }],
    ['javascript:alert(1)', { ok: false, reason: 'unsupported_scheme' }],
    ['data:text/plain,hi', { ok: false, reason: 'unsupported_scheme' }],
    ['https://', { ok: false, reason: 'invalid_url' }],
  ];

  it.each(cases)('%s → %o', (input, expected) => {
    expect(normalizeWebsiteInput(input)).toEqual(expected);
  });
});

// ── Twitter ────────────────────────────────────────────────

describe('normalizeHandleInput — twitter', () => {
  const cases: [string, HandleResult][] = [
    ['', { ok: true, stored: '' }],
    ['foo', { ok: true, stored: 'foo' }],
    ['@foo', { ok: true, stored: 'foo' }],
    ['x.com/foo', { ok: true, stored: 'foo' }],
    ['x.com/foo/', { ok: true, stored: 'foo' }],
    ['https://x.com/foo', { ok: true, stored: 'foo' }],
    ['https://twitter.com/foo', { ok: true, stored: 'foo' }],
    ['https://mobile.twitter.com/foo/', { ok: true, stored: 'foo' }],
    ['https://www.x.com/foo', { ok: true, stored: 'foo' }],
    ['https://unknown.com/foo', { ok: false, reason: 'unsupported_url' }],
    ['ftp://x.com/foo', { ok: false, reason: 'unsupported_scheme' }],
    ['mailto:foo@example.com', { ok: false, reason: 'unsupported_scheme' }],
    ['https://x.com/foo?ref=1', { ok: false, reason: 'invalid_handle' }],
    ['https://x.com/foo#bar', { ok: false, reason: 'invalid_handle' }],
    ['my handle', { ok: false, reason: 'invalid_handle' }],
    ['https://x.com/', { ok: false, reason: 'invalid_handle' }],
    ['https://x.com', { ok: false, reason: 'invalid_handle' }],
  ];

  it.each(cases)('%s → %o', (input, expected) => {
    expect(normalizeHandleInput('twitter', input)).toEqual(expected);
  });
});

// ── Telegram ───────────────────────────────────────────────

describe('normalizeHandleInput — telegram', () => {
  const cases: [string, HandleResult][] = [
    ['', { ok: true, stored: '' }],
    ['mygroup', { ok: true, stored: 'mygroup' }],
    ['t.me/mygroup', { ok: true, stored: 'mygroup' }],
    ['https://t.me/mygroup', { ok: true, stored: 'mygroup' }],
    ['https://t.me/mygroup/', { ok: true, stored: 'mygroup' }],
    ['https://unknown.com/mygroup', { ok: false, reason: 'unsupported_url' }],
    ['ftp://t.me/mygroup', { ok: false, reason: 'unsupported_scheme' }],
    ['https://t.me/foo?ref=1', { ok: false, reason: 'invalid_handle' }],
    ['foo bar', { ok: false, reason: 'invalid_handle' }],
  ];

  it.each(cases)('%s → %o', (input, expected) => {
    expect(normalizeHandleInput('telegram', input)).toEqual(expected);
  });
});

// ── Discord ────────────────────────────────────────────────

describe('normalizeHandleInput — discord', () => {
  const cases: [string, HandleResult][] = [
    ['', { ok: true, stored: '' }],
    ['abc123', { ok: true, stored: 'abc123' }],
    ['discord.gg/abc123', { ok: true, stored: 'abc123' }],
    ['https://discord.gg/abc123', { ok: true, stored: 'abc123' }],
    ['https://discord.com/invite/abc123', { ok: true, stored: 'abc123' }],
    ['https://www.discord.gg/abc123/', { ok: true, stored: 'abc123' }],
    ['https://unknown.com/abc', { ok: false, reason: 'unsupported_url' }],
    ['ftp://discord.gg/abc', { ok: false, reason: 'unsupported_scheme' }],
    ['https://discord.gg/abc?ref=1', { ok: false, reason: 'invalid_handle' }],
    ['foo bar', { ok: false, reason: 'invalid_handle' }],
  ];

  it.each(cases)('%s → %o', (input, expected) => {
    expect(normalizeHandleInput('discord', input)).toEqual(expected);
  });
});

// ── GitHub ─────────────────────────────────────────────────

describe('normalizeHandleInput — github', () => {
  const cases: [string, HandleResult][] = [
    ['', { ok: true, stored: '' }],
    ['owner', { ok: true, stored: 'owner' }],
    ['owner/repo', { ok: true, stored: 'owner/repo' }],
    ['github.com/owner', { ok: true, stored: 'owner' }],
    ['github.com/owner/repo', { ok: true, stored: 'owner/repo' }],
    ['https://github.com/owner/repo', { ok: true, stored: 'owner/repo' }],
    ['https://github.com/owner/repo/', { ok: true, stored: 'owner/repo' }],
    ['https://www.github.com/owner', { ok: true, stored: 'owner' }],
    ['owner/repo/issues', { ok: false, reason: 'invalid_handle' }],
    ['https://github.com/owner/repo/issues', { ok: false, reason: 'invalid_handle' }],
    ['github.com/org/repo#readme', { ok: false, reason: 'invalid_handle' }],
    ['https://github.com/org/repo?tab=readme', { ok: false, reason: 'invalid_handle' }],
    ['https://unknown.com/owner', { ok: false, reason: 'unsupported_url' }],
    ['ftp://github.com/owner', { ok: false, reason: 'unsupported_scheme' }],
    ['foo bar', { ok: false, reason: 'invalid_handle' }],
  ];

  it.each(cases)('%s → %o', (input, expected) => {
    expect(normalizeHandleInput('github', input)).toEqual(expected);
  });
});

// ── storedToDisplayUrl ─────────────────────────────────────

describe('storedToDisplayUrl', () => {
  it('returns empty for empty value', () => {
    expect(storedToDisplayUrl('', 'twitter')).toBe('');
    expect(storedToDisplayUrl('', 'website')).toBe('');
  });

  it('returns website value as-is', () => {
    expect(storedToDisplayUrl('https://example.com', 'website')).toBe('https://example.com');
  });

  it('builds canonical URLs from handles', () => {
    expect(storedToDisplayUrl('foo', 'twitter')).toBe('https://x.com/foo');
    expect(storedToDisplayUrl('mygroup', 'telegram')).toBe('https://t.me/mygroup');
    expect(storedToDisplayUrl('abc123', 'discord')).toBe('https://discord.gg/abc123');
    expect(storedToDisplayUrl('org/repo', 'github')).toBe('https://github.com/org/repo');
  });
});
