import { describe, it, expect, beforeEach } from 'vitest';
import { saveKnownAddress, getKnownTokenAddresses } from '../known-tokens';

describe('known-tokens', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('returns empty array when nothing stored', () => {
    expect(getKnownTokenAddresses()).toEqual([]);
  });

  it('saves and retrieves a single address', () => {
    saveKnownAddress('bcrt1qaddr1');
    expect(getKnownTokenAddresses()).toEqual(['bcrt1qaddr1']);
  });

  it('saves multiple addresses', () => {
    saveKnownAddress('bcrt1qaddr1');
    saveKnownAddress('bcrt1qaddr2');
    const result = getKnownTokenAddresses();
    expect(result).toContain('bcrt1qaddr1');
    expect(result).toContain('bcrt1qaddr2');
    expect(result).toHaveLength(2);
  });

  it('deduplicates addresses', () => {
    saveKnownAddress('bcrt1qaddr1');
    saveKnownAddress('bcrt1qaddr1');
    expect(getKnownTokenAddresses()).toEqual(['bcrt1qaddr1']);
  });

  it('handles corrupt localStorage data gracefully', () => {
    localStorage.setItem('opump:known-token-addresses', 'not-json');
    expect(getKnownTokenAddresses()).toEqual([]);
  });

  it('handles non-array JSON gracefully', () => {
    localStorage.setItem('opump:known-token-addresses', '{"foo": "bar"}');
    expect(getKnownTokenAddresses()).toEqual([]);
  });

  it('filters out non-string entries', () => {
    localStorage.setItem('opump:known-token-addresses', JSON.stringify(['valid', 123, null, 'also-valid']));
    expect(getKnownTokenAddresses()).toEqual(['valid', 'also-valid']);
  });
});
