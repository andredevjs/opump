import { describe, it, expect } from 'vitest';
import { mapApiTokenToToken } from '../mappers';
import type { TokenDetailResponse } from '@shared/types/api';

function makeApiToken(overrides: Partial<TokenDetailResponse & { priceChange24hBps?: number }> = {}): TokenDetailResponse & { priceChange24hBps?: number } {
  return {
    _id: 'bcrt1qtest123',
    name: 'TestToken',
    symbol: 'TT',
    description: 'A test token',
    imageUrl: '',
    socials: {},
    creatorAddress: 'bcrt1qcreator',
    contractAddress: 'bcrt1qtest123',
    virtualBtcReserve: '767000',
    virtualTokenSupply: '100000000000000000',
    kConstant: '76700000000000000000000',
    realBtcReserve: '0',
    config: {
      creatorAllocationBps: 500,
      buyTaxBps: 100,
      sellTaxBps: 200,
      flywheelDestination: 'burn',
      graduationThreshold: '6900000',
    },
    status: 'active',
    currentPriceSats: '7.67',
    volume24h: '1000000',
    volumeTotal: '5000000',
    marketCapSats: '767000000',
    tradeCount: 42,
    tradeCount24h: 10,
    holderCount: 5,
    deployBlock: 100,
    deployTxHash: 'abc123',
    createdAt: new Date('2025-01-01T00:00:00Z'),
    updatedAt: new Date('2025-01-02T00:00:00Z'),
    ...overrides,
  } as TokenDetailResponse & { priceChange24hBps?: number };
}

describe('mapApiTokenToToken', () => {
  it('maps _id to address', () => {
    const token = mapApiTokenToToken(makeApiToken({ _id: 'myaddr' }));
    expect(token.address).toBe('myaddr');
  });

  it('maps name, symbol, description', () => {
    const token = mapApiTokenToToken(makeApiToken({ name: 'Foo', symbol: 'FOO', description: 'desc' }));
    expect(token.name).toBe('Foo');
    expect(token.symbol).toBe('FOO');
    expect(token.description).toBe('desc');
  });

  it('derives image from first char of name', () => {
    const token = mapApiTokenToToken(makeApiToken({ name: 'Bitcoin' }));
    expect(token.image).toBe('B');
  });

  it('falls back to ? for empty name', () => {
    const token = mapApiTokenToToken(makeApiToken({ name: '' }));
    expect(token.image).toBe('?');
  });

  it('maps imageUrl when present', () => {
    const token = mapApiTokenToToken(makeApiToken({ imageUrl: 'https://example.com/img.png' }));
    expect(token.imageUrl).toBe('https://example.com/img.png');
  });

  it('sets imageUrl to undefined when empty', () => {
    const token = mapApiTokenToToken(makeApiToken({ imageUrl: '' }));
    expect(token.imageUrl).toBeUndefined();
  });

  it('converts createdAt Date to timestamp ms', () => {
    const date = new Date('2025-06-15T12:00:00Z');
    const token = mapApiTokenToToken(makeApiToken({ createdAt: date }));
    expect(token.createdAt).toBe(date.getTime());
  });

  it('parses currentPriceSats as float', () => {
    const token = mapApiTokenToToken(makeApiToken({ currentPriceSats: '123.456' }));
    expect(token.currentPriceSats).toBe(123.456);
  });

  it('converts priceChange24hBps to percentage', () => {
    const token = mapApiTokenToToken(makeApiToken({ priceChange24hBps: 1500 }));
    expect(token.priceChange24h).toBe(15); // 1500 bps = 15%
  });

  it('defaults priceChange24h to 0 when bps missing', () => {
    const token = mapApiTokenToToken(makeApiToken({ priceChange24hBps: undefined }));
    expect(token.priceChange24h).toBe(0);
  });

  it('parses volume24hSats from string', () => {
    const token = mapApiTokenToToken(makeApiToken({ volume24h: '9999' }));
    expect(token.volume24hSats).toBe(9999);
  });

  it('parses marketCapSats from string', () => {
    const token = mapApiTokenToToken(makeApiToken({ marketCapSats: '500000' }));
    expect(token.marketCapSats).toBe(500000);
  });

  it('converts config bps to percentages', () => {
    const token = mapApiTokenToToken(makeApiToken({
      config: {
        creatorAllocationBps: 1000,
        buyTaxBps: 300,
        sellTaxBps: 500,
        flywheelDestination: 'burn',
        graduationThreshold: '6900000',
      },
    }));
    expect(token.creatorAllocationPercent).toBe(10); // 1000 bps = 10%
    expect(token.buyTaxPercent).toBe(3); // 300 bps = 3%
    expect(token.sellTaxPercent).toBe(5); // 500 bps = 5%
  });

  it('maps social links', () => {
    const token = mapApiTokenToToken(makeApiToken({
      socials: {
        website: 'https://example.com',
        twitter: '@test',
        telegram: 't.me/test',
        discord: 'discord.gg/test',
        github: 'github.com/test',
      },
    }));
    expect(token.website).toBe('https://example.com');
    expect(token.twitter).toBe('@test');
    expect(token.telegram).toBe('t.me/test');
    expect(token.discord).toBe('discord.gg/test');
    expect(token.github).toBe('github.com/test');
  });

  it('maps status', () => {
    const token = mapApiTokenToToken(makeApiToken({ status: 'graduated' }));
    expect(token.status).toBe('graduated');
  });

  it('calculates graduation progress as percentage', () => {
    // realBtcReserve = 3450000, threshold = 6900000 → 50%
    const token = mapApiTokenToToken(makeApiToken({
      realBtcReserve: '3450000',
      config: {
        creatorAllocationBps: 0,
        buyTaxBps: 0,
        sellTaxBps: 0,
        flywheelDestination: 'burn',
        graduationThreshold: '6900000',
      },
    }));
    expect(token.graduationProgress).toBe(50);
  });

  it('returns 0 graduation progress when threshold is 0', () => {
    const token = mapApiTokenToToken(makeApiToken({
      realBtcReserve: '100000',
      config: {
        creatorAllocationBps: 0,
        buyTaxBps: 0,
        sellTaxBps: 0,
        flywheelDestination: 'burn',
        graduationThreshold: '0',
      },
    }));
    expect(token.graduationProgress).toBe(0);
  });

  it('prefers tradeCount24h over tradeCount', () => {
    const token = mapApiTokenToToken(makeApiToken({ tradeCount24h: 7, tradeCount: 100 }));
    expect(token.tradeCount24h).toBe(7);
  });

  it('falls back to tradeCount when tradeCount24h is absent', () => {
    const token = mapApiTokenToToken(makeApiToken({ tradeCount24h: undefined, tradeCount: 55 }));
    expect(token.tradeCount24h).toBe(55);
  });
});
