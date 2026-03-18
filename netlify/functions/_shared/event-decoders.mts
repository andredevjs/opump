/**
 * Event decoding helpers for OPNet contract events.
 * Extracted from indexer-core.mts for reuse and maintainability.
 */

import { toBech32 } from '@btc-vision/bitcoin';
import type { Network } from '@btc-vision/bitcoin';
import type { OPNetEvent } from "./contracts.mts";

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

export function decodeBuyEvent(event: OPNetEvent): BuyEventData | null {
  const data = getEventData(event);
  if (!data || data.length < 128) {
    console.debug('[Indexer] Malformed Buy event data:', { dataLength: data?.length ?? 0 });
    return null;
  }

  return {
    buyer: readAddressFromEventData(data, 0),
    btcIn: readU256FromEventData(data, 32),
    tokensOut: readU256FromEventData(data, 64),
    newPrice: readU256FromEventData(data, 96),
  };
}

export function decodeSellEvent(event: OPNetEvent): SellEventData | null {
  const data = getEventData(event);
  if (!data || data.length < 128) {
    console.debug('[Indexer] Malformed Sell event data:', { dataLength: data?.length ?? 0 });
    return null;
  }

  return {
    seller: readAddressFromEventData(data, 0),
    tokensIn: readU256FromEventData(data, 32),
    btcOut: readU256FromEventData(data, 64),
    newPrice: readU256FromEventData(data, 96),
  };
}

export function getEventData(event: OPNetEvent): Uint8Array | null {
  if (event.data instanceof Uint8Array) {
    return event.data;
  }
  if (typeof event.data === "string") {
    const hex = event.data.startsWith("0x") ? event.data.slice(2) : event.data;
    if (hex.length % 2 !== 0) {
      console.debug("[Indexer] Invalid hex string: odd length", { length: hex.length });
      return null;
    }
    const bytes = new Uint8Array(hex.length / 2);
    for (let i = 0; i < bytes.length; i++) {
      bytes[i] = parseInt(hex.substring(i * 2, i * 2 + 2), 16);
    }
    return bytes;
  }
  return null;
}

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

export function readAddressFromEventData(data: Uint8Array, offset: number): string {
  const bytes = data.slice(offset, offset + 32);
  let hex = "0x";
  for (const b of bytes) {
    hex += b.toString(16).padStart(2, "0");
  }
  return hex;
}

/**
 * Convert a 0x-prefixed hex address (from event data) to bech32m format.
 * This ensures confirmed trades use the same address encoding as pending trades
 * submitted by the frontend (which uses the wallet's bech32m address).
 */
export function hexAddressToBech32m(hexAddress: string, network: Network): string {
  const hex = hexAddress.startsWith('0x') ? hexAddress.slice(2) : hexAddress;
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(hex.substring(i * 2, i * 2 + 2), 16);
  }
  return toBech32(bytes, 16, network.bech32, network.bech32Opnet);
}
