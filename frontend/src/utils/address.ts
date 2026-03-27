/**
 * Convert a hex-encoded address (hashed ML-DSA public key) to bech32m format.
 * Mirrors the backend's hexAddressToBech32m in event-decoders.mts.
 * Duplicated here because cross-directory imports break Netlify's esbuild bundler.
 */
import { toBech32 } from '@btc-vision/bitcoin';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function hexAddressToBech32m(hexAddress: string, network: any): string {
  const hex = hexAddress.startsWith('0x') ? hexAddress.slice(2) : hexAddress;
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(hex.substring(i * 2, i * 2 + 2), 16);
  }
  return toBech32(bytes, 16, network.bech32, network.bech32Opnet);
}
