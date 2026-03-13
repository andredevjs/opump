import type { OPNetEvent } from '../types/contracts.js';

/**
 * Event data layouts emitted by the on-chain contracts.
 * Each field is a 32-byte u256. Addresses are written as u256 (32 bytes).
 */
export interface BuyEventData {
  buyer: string;
  btcIn: bigint;
  tokensOut: bigint;
  newPrice: bigint;
}

export interface SellEventData {
  seller: string;
  tokensIn: bigint;
  btcOut: bigint;
  newPrice: bigint;
}

export interface GraduationEventData {
  triggerer: string;
  finalBtcReserve: bigint;
}

export interface MigrationEventData {
  recipient: string;
  tokenAmount: bigint;
  btcReserve: bigint;
}

export interface TokenDeployedEventData {
  creator: string;
  tokenAddress: string;
}

/**
 * Extract raw event data as Uint8Array from an OPNet event object.
 */
export function getEventData(event: unknown): Uint8Array | null {
  const evt = event as OPNetEvent;

  // The OPNet SDK event structure may provide data in different formats
  if (evt.data instanceof Uint8Array) {
    return evt.data;
  }
  if (typeof evt.data === 'string') {
    // Hex-encoded data
    const hex = evt.data.startsWith('0x') ? evt.data.slice(2) : evt.data;
    if (hex.length % 2 !== 0) {
      console.debug('[EventDecoder] Invalid hex string: odd length', { length: hex.length });
      return null;
    }
    const bytes = new Uint8Array(hex.length / 2);
    for (let i = 0; i < bytes.length; i++) {
      bytes[i] = parseInt(hex.substring(i * 2, i * 2 + 2), 16);
    }
    return bytes;
  }
  // Some events may have properties directly decoded
  if (evt.properties && typeof evt.properties === 'object') {
    return null; // Handle via properties in the caller if needed
  }
  return null;
}

/**
 * Read a u256 from event data at the given byte offset (big-endian).
 */
export function readU256FromEventData(data: Uint8Array, offset: number): bigint {
  if (offset + 32 > data.length) {
    throw new Error(`Insufficient event data: need ${offset + 32} bytes, have ${data.length}`);
  }
  let value = 0n;
  for (let i = 0; i < 32; i++) {
    value = (value << 8n) | BigInt(data[offset + i]);
  }
  return value;
}

/**
 * Read an address from event data at the given byte offset.
 * Addresses are stored as u256 (32 bytes). We convert to hex.
 */
export function readAddressFromEventData(data: Uint8Array, offset: number): string {
  const bytes = data.slice(offset, offset + 32);
  let hex = '0x';
  for (const b of bytes) {
    hex += b.toString(16).padStart(2, '0');
  }
  return hex;
}

/**
 * Decode a Buy event from the on-chain event data.
 * Layout: buyer(32) + btcIn(32) + tokensOut(32) + newPrice(32)
 */
export function decodeBuyEvent(event: unknown): BuyEventData | null {
  const data = getEventData(event);
  if (!data || data.length < 128) {
    console.debug('[EventDecoder] Malformed Buy event data:', { dataLength: data?.length ?? 0 });
    return null;
  }

  return {
    buyer: readAddressFromEventData(data, 0),
    btcIn: readU256FromEventData(data, 32),
    tokensOut: readU256FromEventData(data, 64),
    newPrice: readU256FromEventData(data, 96),
  };
}

/**
 * Decode a Sell event from the on-chain event data.
 * Layout: seller(32) + tokensIn(32) + btcOut(32) + newPrice(32)
 */
export function decodeSellEvent(event: unknown): SellEventData | null {
  const data = getEventData(event);
  if (!data || data.length < 128) {
    console.debug('[EventDecoder] Malformed Sell event data:', { dataLength: data?.length ?? 0 });
    return null;
  }

  return {
    seller: readAddressFromEventData(data, 0),
    tokensIn: readU256FromEventData(data, 32),
    btcOut: readU256FromEventData(data, 64),
    newPrice: readU256FromEventData(data, 96),
  };
}

/**
 * Decode a Graduation event from the on-chain event data.
 * Layout: triggerer(32) + finalBtcReserve(32)
 */
export function decodeGraduationEvent(event: unknown): GraduationEventData | null {
  const data = getEventData(event);
  if (!data || data.length < 64) return null;

  return {
    triggerer: readAddressFromEventData(data, 0),
    finalBtcReserve: readU256FromEventData(data, 32),
  };
}

/**
 * Decode a TokenDeployed event from the on-chain event data.
 * Layout: creator(32) + tokenAddress(32)
 */
export function decodeTokenDeployedEvent(event: unknown): TokenDeployedEventData | null {
  const data = getEventData(event);
  if (!data || data.length < 64) return null;

  return {
    creator: readAddressFromEventData(data, 0),
    tokenAddress: readAddressFromEventData(data, 32),
  };
}

/**
 * Decode a Migration event from the on-chain event data.
 * Layout: recipient(32) + tokenAmount(32) + btcReserve(32)
 */
export function decodeMigrationEvent(event: unknown): MigrationEventData | null {
  const data = getEventData(event);
  if (!data || data.length < 96) return null;

  return {
    recipient: readAddressFromEventData(data, 0),
    tokenAmount: readU256FromEventData(data, 32),
    btcReserve: readU256FromEventData(data, 64),
  };
}
