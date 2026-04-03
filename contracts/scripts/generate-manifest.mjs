#!/usr/bin/env node
/**
 * Generates a WASM manifest with SHA-256 checksums for deploy-time validation.
 * Run after contract build to produce build/wasm-manifest.json.
 */
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, statSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const buildDir = resolve(__dirname, '..', 'build');
const wasmPath = resolve(buildDir, 'LaunchToken.wasm');

const wasmBytes = readFileSync(wasmPath);
const sha256 = createHash('sha256').update(wasmBytes).digest('hex');
const size = statSync(wasmPath).size;

const manifest = {
  'LaunchToken.wasm': { sha256, size },
  generatedAt: new Date().toISOString(),
};

const manifestPath = resolve(buildDir, 'wasm-manifest.json');
writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n');

console.log(`WASM manifest: LaunchToken.wasm sha256=${sha256} size=${size}`);
