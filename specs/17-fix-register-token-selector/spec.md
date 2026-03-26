# Feature Specification: Fix "Method Not Found" on Token Registration

**Feature Branch**: `17-fix-register-token-selector`
**Created**: 2026-03-25
**Status**: Draft

## Problem Statement

When a user attempts to register (create) a new token via the OPump launchpad, the transaction fails with:

```
Error in calling function: Method not found: 2822811599
at ~lib/@btc-vision/btc-runtime/runtime/contracts/OP_NET.ts:92:9
```

The method selector `2822811599` (hex `0xA840AFCF`) corresponds to `registerToken(string,string,uint256,uint256,uint256,uint256,uint256)` — the correct factory method. The compiled `OPumpFactory.wasm` **does** contain a handler for this selector, which means the contract deployed at the configured factory address (`VITE_FACTORY_ADDRESS`) either:

1. Was never deployed (address is a placeholder or invalid),
2. Contains outdated bytecode that predates the current `registerToken` signature, or
3. Contains a different contract (e.g., LaunchToken) instead of OPumpFactory.

## User Scenarios & Testing

### User Story 1 - Create a Token Successfully (Priority: P1)
A user fills in the token creation form (name, symbol, supply, allocations) and clicks "Create Token." The transaction is submitted to the factory contract, which registers the token and deploys a new LaunchToken instance. The user sees the new token appear in the UI.

**Why this priority**: This is the core flow of the product. Nothing else works if token creation fails.

**Independent Test**: Submit a `registerToken` call to the factory contract address and verify it returns a success response (not "Method not found").

**Acceptance Scenarios**:
1. **Given** a deployed OPumpFactory contract at the configured address, **When** the user submits a valid token creation form, **Then** the transaction succeeds and the new token address is returned.
2. **Given** the factory contract is deployed, **When** the frontend calls `registerToken` with the correct selector, **Then** the factory's `registerToken` handler is invoked (no "Method not found" error).
3. **Given** a newly created token, **When** the user views the token list, **Then** the new token appears (mempool-first, no block wait).

### User Story 2 - Clear Error on Misconfigured Factory (Priority: P2)
If the factory address is invalid or the contract at that address doesn't support `registerToken`, the user sees a clear, actionable error message — not a raw runtime trace.

**Why this priority**: Even after the fix, future misconfigurations should produce helpful errors.

**Independent Test**: Point `VITE_FACTORY_ADDRESS` at a non-factory address and attempt token creation; verify the error message is user-friendly.

**Acceptance Scenarios**:
1. **Given** an invalid factory address, **When** the user tries to create a token, **Then** the UI displays "Factory contract not available" (or similar) instead of a raw stack trace.

### Edge Cases
- What happens if the factory contract is deployed but hasn't been confirmed yet? (Mempool-first: it should still work.)
- What happens if the user double-submits the same token creation? (Should be idempotent or blocked.)
- What happens if the factory WASM is updated but the old address is still in `.env`?

## Root Cause Analysis

The compiled `OPumpFactory.wasm` (23KB) correctly includes:
- A `registerToken` handler with selector `2822811599` (`0xA840AFCF`)
- All 5 expected public methods

The selector value in the WAT output matches the selector the frontend sends. This confirms the issue is **deployment/configuration**, not a code bug in the contract or frontend.

### Most Likely Cause
The factory contract at `opt1sqrcx5egqfggm7vl6xeknccdlyr87xq733y2w6z9a` either doesn't exist or contains different bytecode. The contract needs to be (re-)deployed and the address updated.

**Clarified**: Factory was deployed and should be working, but a clean redeploy is needed to ensure bytecode matches.

## Requirements

### Functional Requirements
- **FR-001**: System MUST have a correctly deployed OPumpFactory contract whose bytecode matches the latest compiled `OPumpFactory.wasm`.
- **FR-002**: System MUST configure `VITE_FACTORY_ADDRESS` to point to the verified factory contract address.
- **FR-003**: System MUST verify that calling `registerToken` with the correct parameters succeeds without "Method not found" errors.
- **FR-004**: System SHOULD display a user-friendly error when the factory contract is unreachable or misconfigured.

### Key Entities
- **OPumpFactory**: The factory contract that registers new tokens and deploys LaunchToken instances.
- **LaunchToken**: The bonding-curve token contract deployed by the factory for each new token.
- **Factory Address**: The on-chain address stored in `VITE_FACTORY_ADDRESS` that the frontend calls.

## Clarifications

### Session 2026-03-25

- Q: Has OPumpFactory ever been successfully deployed to testnet, or is the current address a placeholder? → A: It was deployed and should be working — but a clean redeploy was performed to ensure bytecode matches. New address: `opt1sqp9zgdmp3pjhqgrgvac26k5egq84jz5l2c4a3tzn`.

### Actions Taken

1. Clean rebuild of all contracts (`npm run clean && npm run build:all`) — confirmed selector `0xa840afcf` matches
2. Redeployed OPumpFactory to testnet — new address: `opt1sqp9zgdmp3pjhqgrgvac26k5egq84jz5l2c4a3tzn`
3. Updated `VITE_FACTORY_ADDRESS` in `frontend/.env`
4. Fixed deploy script bug: `sendRawTransaction` returns `.result` not `.txid`
5. Fixed deploy script post-deploy instructions to reference `frontend/.env` (not `backend/.env`)

## Success Criteria

### Measurable Outcomes
- **SC-001**: A user can successfully create a token via the UI without encountering "Method not found" errors.
- **SC-002**: The `registerToken` method selector (`2822811599`) resolves correctly at the deployed factory address.
- **SC-003**: Token creation flow completes end-to-end: form submission -> factory call -> token deployed -> visible in UI.
