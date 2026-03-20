import { describe, it, expect } from 'vitest';
import {
  readU256FromEventData,
  readAddressFromEventData,
  decodeBuyEvent,
  decodeSellEvent,
  getEventData,
  hexAddressToBech32m,
} from '../../functions/_shared/event-decoders.mts';

describe('readU256FromEventData()', () => {
  it('reads 32 bytes where last byte is 42 as 42n', () => {
    const data = new Uint8Array(32);
    data[31] = 42;
    expect(readU256FromEventData(data, 0)).toBe(42n);
  });

  it('reads 32 bytes with 1 at the end as 1n', () => {
    const data = new Uint8Array(32);
    data[31] = 1;
    expect(readU256FromEventData(data, 0)).toBe(1n);
  });

  it('reads 32 bytes all 0xFF as 2^256 - 1', () => {
    const data = new Uint8Array(32).fill(0xff);
    const maxU256 = (1n << 256n) - 1n;
    expect(readU256FromEventData(data, 0)).toBe(maxU256);
  });

  it('throws when data is too short for the given offset', () => {
    const data = new Uint8Array(16);
    expect(() => readU256FromEventData(data, 0)).toThrow('Insufficient event data');
  });
});

describe('readAddressFromEventData()', () => {
  it('reads 32 bytes and returns "0x" + hex representation', () => {
    const data = new Uint8Array(32);
    data[0] = 0xab;
    data[1] = 0xcd;
    data[31] = 0xef;
    const result = readAddressFromEventData(data, 0);
    expect(result).toBe(
      '0xabcd' + '00'.repeat(28) + '00ef',
    );
  });
});

describe('getEventData()', () => {
  it('returns the same Uint8Array when event.data is a Uint8Array', () => {
    const arr = new Uint8Array([1, 2, 3]);
    const result = getEventData({ data: arr });
    expect(result).toBe(arr);
  });

  it('converts a "0x"-prefixed hex string to Uint8Array', () => {
    const result = getEventData({ data: '0x0102' });
    expect(result).toEqual(new Uint8Array([1, 2]));
  });

  it('converts a hex string without 0x prefix to Uint8Array', () => {
    const result = getEventData({ data: 'aabb' });
    expect(result).toEqual(new Uint8Array([0xaa, 0xbb]));
  });

  it('returns null when event.data is null', () => {
    const result = getEventData({ data: null as unknown as undefined });
    expect(result).toBeNull();
  });

  it('returns null when event.data is undefined', () => {
    const result = getEventData({});
    expect(result).toBeNull();
  });
});

describe('decodeBuyEvent()', () => {
  it('decodes a 128-byte event into buyer, btcIn, tokensOut, newPrice', () => {
    const data = new Uint8Array(128);

    // buyer address at offset 0: set byte 0 to 0x01
    data[0] = 0x01;

    // btcIn at offset 32: value = 1000 (0x03E8)
    data[62] = 0x03;
    data[63] = 0xe8;

    // tokensOut at offset 64: value = 5000 (0x1388)
    data[94] = 0x13;
    data[95] = 0x88;

    // newPrice at offset 96: value = 99 (0x63)
    data[127] = 0x63;

    const result = decodeBuyEvent({ data });
    expect(result).not.toBeNull();
    expect(result!.buyer).toBe('0x01' + '00'.repeat(31));
    expect(result!.btcIn).toBe(1000n);
    expect(result!.tokensOut).toBe(5000n);
    expect(result!.newPrice).toBe(99n);
  });

  it('returns null when data is shorter than 128 bytes', () => {
    const data = new Uint8Array(64);
    const result = decodeBuyEvent({ data });
    expect(result).toBeNull();
  });
});

describe('decodeSellEvent()', () => {
  it('decodes a 128-byte event into seller, tokensIn, btcOut, newPrice', () => {
    const data = new Uint8Array(128);

    // seller address at offset 0: set byte 1 to 0xFF
    data[1] = 0xff;

    // tokensIn at offset 32: value = 2000 (0x07D0)
    data[62] = 0x07;
    data[63] = 0xd0;

    // btcOut at offset 64: value = 500 (0x01F4)
    data[94] = 0x01;
    data[95] = 0xf4;

    // newPrice at offset 96: value = 77 (0x4D)
    data[127] = 0x4d;

    const result = decodeSellEvent({ data });
    expect(result).not.toBeNull();
    expect(result!.seller).toBe('0x00ff' + '00'.repeat(30));
    expect(result!.tokensIn).toBe(2000n);
    expect(result!.btcOut).toBe(500n);
    expect(result!.newPrice).toBe(77n);
  });

  it('returns null when data is shorter than 128 bytes', () => {
    const result = decodeSellEvent({ data: new Uint8Array(100) });
    expect(result).toBeNull();
  });
});

describe('hexAddressToBech32m()', () => {
  it('converts a 0x-prefixed hex address to a string starting with the network bech32 prefix', () => {
    const network = { bech32: 'tb', bech32Opnet: 'opt', pubKeyHash: 0x6f } as never;
    const hex = '0x' + 'ab'.repeat(32);
    const result = hexAddressToBech32m(hex, network);
    expect(result.startsWith('tb')).toBe(true);
  });
});
