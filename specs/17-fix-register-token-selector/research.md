# Phase 0 — Research

**Branch**: `17-fix-register-token-selector`
**Date**: 2026-03-25

## R1: Root Cause of "Method not found: 2822811599"

**Question**: Why does `registerToken` fail with "Method not found" when the WASM contains the correct handler?

**Findings**:
- Selector `0xa840afcf` (decimal `2822811599`) is compiled into `OPumpFactory.wasm` — confirmed via build output and WAT inspection.
- The frontend ABI (`OPUMP_FACTORY_ABI`) declares `registerToken(string,string,uint256,uint256,uint256,uint256,uint256)` — matches exactly.
- The error comes from `OP_NET.ts:92` which throws when `execute()` receives a selector with no matching case in the switch statement.

**Conclusion**: The WASM at the old address (`opt1sqrcx5egqfggm7vl6xeknccdlyr87xq733y2w6z9a`) had stale bytecode. A clean redeploy to `opt1sqqvc007ncgfp64zjqctx8pfyk5a2e5hc6qfj7q9u` resolves this.

**Decision**: Redeploy factory + update address. No contract or frontend code changes needed for the core fix.

## R2: Deploy Script `.txid` Bug

**Question**: Why did the deploy script log `undefined` for TX IDs?

**Findings**:
- `provider.sendRawTransaction()` returns `BroadcastedTransaction` interface:
  ```typescript
  { success: boolean; result?: string; error?: string; peers?: number; }
  ```
- The deploy script was accessing `.txid` (doesn't exist). Correct property is `.result`.

**Decision**: Fix deploy script to use `.result`.

## R3: Error UX for Misconfigured Factory (FR-004)

**Question**: What error does the user see today when factory is misconfigured?

**Findings**:
- `StepDeploy.tsx:181-183` catches all errors and shows `err.message` via `toast.error()`.
- The raw OPNet error `"Error in calling function: Method not found: 2822811599"` is shown directly — not user-friendly.
- The retry loop (5 attempts, 3s delay) means the user waits up to 15 seconds before seeing this error.

**Decision**: Add error message parsing in the catch block to detect "Method not found" errors and show a clear message like "Factory contract error — contact support." This is a small, targeted change.

## R4: Frontend Error Detection Patterns

**Question**: What's the best way to detect specific contract errors in the frontend?

**Findings**:
- OPNet errors come as Error objects with `.message` containing the raw runtime message.
- Pattern: `err.message.includes('Method not found')` is sufficient for detection.
- The `sim.revert` check in `sendContractCall` already handles contract-level reverts with clear messages.
- The "Method not found" error happens during simulation (before `sendContractCall`), so it's caught by the outer try/catch in `handleDeploy`.

**Decision**: Parse error in the StepDeploy catch block to provide category-specific messages.
