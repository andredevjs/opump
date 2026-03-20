# Implementation Plan: Consolidate Flywheel Tax Destinations

**Branch**: 13-consolidate-tax-destinations | **Date**: 2026-03-20 | **Spec**: specs/13-consolidate-tax-destinations/spec.md

## Summary

Remove the duplicate "Creator Pool" / "Creator Wallet" tax destinations and replace with a single "Creator" option. Changes span **frontend**, **shared types**, and **netlify functions**. No contract changes needed.

## Technical Context

**Language/Version**: TypeScript 5.x
**Primary Dependencies**: React 18, Zustand, Vite, TailwindCSS, Netlify Functions, Upstash Redis
**Storage**: Redis (existing tokens may have `communityPool` stored — backward-compatible)
**Testing**: Frontend build (`npm run build`), Netlify tests (`npm test`)
**Target Platform**: Web (frontend SPA + serverless API)
**Project Type**: Web app — frontend + backend + shared types
**Constraints**: No contract changes, backward-compatible with existing dest=2 tokens and tokens stored with `communityPool` in Redis

## Constitution Check

| Principle | Status | Notes |
|-----------|--------|-------|
| SafeMath for u256 | N/A | No contract changes |
| Frontend never holds signing keys | N/A | No signing changes |
| Shared types in shared/types/ | PASS | Shared types updated to match |
| Mempool-first | N/A | No state propagation changes |

## Affected Files

**8 files** across 3 layers:

| # | Layer | File | Change |
|---|-------|------|--------|
| 1 | shared | `shared/types/token.ts:24` | Remove `'communityPool'` from union → `'burn' \| 'creator'` |
| 2 | shared | `shared/types/api.ts:117` | Remove `'communityPool'` from union → `'burn' \| 'creator'` |
| 3 | netlify | `functions/_shared/constants.mts:42` | Remove `'communityPool'` from union → `'burn' \| 'creator'` |
| 4 | netlify | `functions/_shared/constants.mts:126` | Remove `'communityPool'` from union → `'burn' \| 'creator'` |
| 5 | frontend | `types/launch.ts:35` | Change from `'burn' \| 'community_pool' \| 'creator_wallet'` to `'burn' \| 'creator'` |
| 6 | frontend | `components/launch/steps/StepFlywheel.tsx` | Remove `creator_wallet` option, rename `community_pool` to `creator` |
| 7 | frontend | `components/launch/steps/StepDeploy.tsx` | Simplify `flywheelDestMap` and `flywheelDestNames` |
| 8 | frontend | `stores/launch-store.ts` | No change needed — default is already `'burn'` |

## Backward Compatibility

Existing tokens stored in Redis may have `flywheelDestination: "communityPool"`. The netlify `create-token` function and Redis query layer should treat `"communityPool"` as equivalent to `"creator"` when reading from Redis, even though new tokens will only ever write `"creator"`.

## Implementation Steps

### Step 1: Update shared types

**File**: `shared/types/token.ts:24`
```typescript
// Before
flywheelDestination: 'burn' | 'communityPool' | 'creator';
// After
flywheelDestination: 'burn' | 'creator';
```

**File**: `shared/types/api.ts:117`
```typescript
// Before
flywheelDestination: 'burn' | 'communityPool' | 'creator';
// After
flywheelDestination: 'burn' | 'creator';
```

### Step 2: Update netlify types

**File**: `netlify/functions/_shared/constants.mts:42`
```typescript
// Before
flywheelDestination: "burn" | "communityPool" | "creator";
// After
flywheelDestination: "burn" | "creator";
```

**File**: `netlify/functions/_shared/constants.mts:126`
```typescript
// Before
flywheelDestination: "burn" | "communityPool" | "creator";
// After
flywheelDestination: "burn" | "creator";
```

### Step 3: Add backward-compat normalization in Redis query layer

**File**: `netlify/functions/_shared/redis-queries.mts`

When reading `flywheelDestination` from Redis, normalize `"communityPool"` → `"creator"` so existing tokens work with the new type.

### Step 4: Update frontend type definition

**File**: `frontend/src/types/launch.ts:35`
```typescript
// Before
export type TaxDestination = 'burn' | 'community_pool' | 'creator_wallet';
// After
export type TaxDestination = 'burn' | 'creator';
```

### Step 5: Update StepFlywheel UI options

**File**: `frontend/src/components/launch/steps/StepFlywheel.tsx:9-13`
```typescript
// Before
const TAX_DESTINATIONS = [
  { value: 'burn', label: 'Burn', description: 'Reduce supply over time' },
  { value: 'community_pool', label: 'Creator Pool', description: 'Additional creator revenue' },
  { value: 'creator_wallet', label: 'Creator Wallet', description: 'Direct to you' },
];
// After
const TAX_DESTINATIONS = [
  { value: 'burn', label: 'Burn', description: 'Reduce supply over time' },
  { value: 'creator', label: 'Creator', description: 'Claimable creator revenue' },
];
```

### Step 6: Update StepDeploy destination mapping

**File**: `frontend/src/components/launch/steps/StepDeploy.tsx:27-31`
```typescript
// Before
const flywheelDestMap: Record<TaxDestination, number> = {
  burn: 0,
  community_pool: 1,
  creator_wallet: 2,
};
// After
const flywheelDestMap: Record<TaxDestination, number> = {
  burn: 0,
  creator: 1,
};
```

**File**: `frontend/src/components/launch/steps/StepDeploy.tsx:135`
```typescript
// Before
const flywheelDestNames = ['burn', 'creator', 'creator'] as const;
// After
const flywheelDestNames = ['burn', 'creator'] as const;
```

### Step 7: Verify builds and tests

```bash
cd frontend && npm run build
cd ../netlify && npm test
```

## Verification Checklist

- [ ] Shared types have exactly 2 values: `'burn' | 'creator'`
- [ ] Netlify types match shared types
- [ ] Redis query layer normalizes `"communityPool"` → `"creator"` for existing tokens
- [ ] Frontend `TaxDestination` has 2 values: `'burn' | 'creator'`
- [ ] StepFlywheel shows exactly 2 destination options
- [ ] `flywheelDestMap` maps `'creator'` to contract value `1`
- [ ] `launch-store.ts` default (`'burn'`) still valid
- [ ] Frontend build passes
- [ ] Netlify tests pass
- [ ] No references to `community_pool`, `creator_wallet`, or `communityPool` remain (except Redis normalization)

## Next Step

Run `/generate-tasks` to create the task list, or proceed directly to implementation.
