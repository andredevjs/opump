# Phase 0 — Research

**Branch**: `18-token-confirmation-gating`
**Date**: 2026-03-26

## R1: Constitution Compliance — Mempool-First vs Confirmation Gating

**Question**: Does gating trading on confirmation violate Constitution Principle 4 ("Mempool-first: all UI updates on mempool detection, not block confirmation")?

**Findings**:
- Mempool-first means **showing data** immediately (token in lists, trade history, balances)
- Confirmation gating here is about **contract existence** — you physically cannot call a contract that the VM hasn't indexed yet
- The token IS shown in lists immediately (with Pending badge) — that's mempool-first
- Trading is blocked because the contract doesn't exist yet, not because we're waiting for N confirmations

**Decision**: Justified exception. Display is mempool-first; trading requires contract existence. Document in plan.

## R2: How the Indexer Discovers Tokens

**Question**: Does the indexer already update `deployBlock` when it processes a deploy TX?

**Findings** (`netlify/functions/_shared/indexer-core.mts`):
- Indexer discovers tokens via `TokenDeployed` factory events
- Adds token address to `knownTokenAddresses` set
- Does NOT update the token's `deployBlock` field in Redis
- The `deployBlock` is only set during `createToken()` API call via on-chain verification

**Decision**: Add `deployBlock` update in the indexer's factory event handler. When a `TokenDeployed` event is processed, call `updateToken(tokenAddr, { deployBlock: blockNum })`.

## R3: Polling Strategy for Phase 4 and Token Page

**Question**: Should Phase 4 poll the RPC directly or poll the backend API?

**Findings**:
- `waitForConfirmation` in `contract.ts` polls the RPC via `provider.getTransactionReceipt(txHash)`
- The Fields page already polls the backend every 5 seconds
- The token detail page does a single fetch on mount — no polling

**Decision**:
- **Phase 4 (deploy page)**: Reuse `waitForConfirmation` which polls the RPC directly. Remove the timeout (poll indefinitely per clarification).
- **Token detail page**: Poll the backend API (`getToken`) every 10 seconds while `deployBlock === 0`. Stop polling once confirmed.

## R4: `deployBlock` in API Response

**Question**: Is `deployBlock` already exposed in API responses?

**Findings**:
- `TokenDetailResponse = TokenDocument` (shared/types/api.ts)
- `TokenDocument` includes `deployBlock: number`
- The Redis hash stores `deployBlock` and it's returned in all token API responses
- Frontend can check `token.deployBlock === 0` without any API changes

**Decision**: No API changes needed. Frontend derives pending state from existing `deployBlock` field.
