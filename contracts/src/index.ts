import { Blockchain } from '@btc-vision/btc-runtime/runtime';
import { LaunchToken } from './LaunchToken';
import { revertOnError } from '@btc-vision/btc-runtime/runtime/abort/abort';

// 1. Factory function — REQUIRED
Blockchain.contract = (): LaunchToken => {
  return new LaunchToken();
};

// 2. Runtime exports — REQUIRED
export * from '@btc-vision/btc-runtime/runtime/exports';

// 3. Abort handler — REQUIRED
export function abort(message: string, fileName: string, line: u32, column: u32): void {
  revertOnError(message, fileName, line, column);
}
