# Implementation Plan: Rebrand "Launch Token" → "Launch OP20 Token"

**Branch**: 4-op20-branding | **Date**: 2026-03-19 | **Spec**: specs/4-op20-branding/spec.md

## Summary

Replace all user-facing "token" / "launch token" copy with "OP20 token" across the frontend UI and project documentation. This is a copy-only change — no code identifiers, contracts, ABIs, or API logic are modified.

## Technical Context

**Language/Version**: TypeScript / React 18
**Primary Dependencies**: None new — existing React + TailwindCSS
**Storage**: N/A
**Testing**: Manual visual verification (no automated copy tests exist)
**Target Platform**: Web (Vite SPA)
**Project Type**: Web application (frontend-only changes + docs)
**Performance Goals**: N/A (no runtime impact)
**Constraints**: Must not break any JSX rendering; must read naturally in English

## Constitution Check

| Principle | Status | Notes |
|-----------|--------|-------|
| SafeMath for all u256 | N/A | No contract changes |
| Frontend never holds keys | N/A | No signing logic touched |
| API responses follow shared types | N/A | No API changes |
| Mempool-first UI updates | N/A | No data flow changes |

**Result**: All clear — this feature doesn't touch any constitutionally-governed areas.

## Approach

### Guiding Heuristic

For each "token" reference, apply this decision:

| Context | Action | Example |
|---------|--------|---------|
| Describes the asset TYPE being launched | **Change** to "OP20 token" | "Launch Your Token" → "Launch Your OP20 Token" |
| Labels a specific token instance | **Keep** | Token column header in a table, "Token Info" tab |
| Generic plural referring to launched assets | **Change** | "Explore Tokens" → "Explore OP20 Tokens" |
| Part of a form label for token properties | **Keep most** | "Token Name" stays (it's the name field for any token) |
| Empty state describing what exists on platform | **Change** | "No tokens launched yet" → "No OP20 tokens launched yet" |
| Contract/code identifier | **Never change** | `LaunchToken`, `ILaunchTokenContract` |

### Notable Judgment Calls

- **"Token Details" (StepDetails.tsx heading)**: Change → "OP20 Token Details" — this is the launch wizard describing what TYPE of thing you're creating.
- **"Token Name" / "Token Image" labels**: Keep — these are form field labels, not type descriptors. "OP20 Token Name" would be awkward.
- **"Token" table column (TokenList.tsx)**: Keep — it labels which specific token, not the type.
- **"Token Info" tab (TokenPage.tsx)**: Keep — it's a tab about THAT specific token.
- **"Untitled Token" default name**: Keep — it's a placeholder name, not a type descriptor.
- **Search placeholder "Search tokens..."**: Change → "Search OP20 tokens..."
- **"Tokens Launched" stat**: Change → "OP20 Tokens Launched"

## Phase 1: Homepage & Navigation

**Files**:

### `frontend/src/components/home/Hero.tsx`
| Line | Current | New |
|------|---------|-----|
| 18 | "Launch Tokens on" | "Launch OP20 Tokens on" |
| 30 | "Launch Token" | "Launch OP20 Token" |
| 36 | "Explore Tokens" | "Explore OP20 Tokens" |

### `frontend/src/components/home/HowItWorks.tsx`
| Line | Current | New |
|------|---------|-----|
| 8 | "Create a token in 6 steps." | "Create an OP20 token in 6 steps." |
| 18 | "the token graduates to MotoSwap DEX" | "the OP20 token graduates to MotoSwap DEX" |

### `frontend/src/components/home/TopTokens.tsx`
| Line | Current | New |
|------|---------|-----|
| 32 | "Trending Tokens" | "Trending OP20 Tokens" |

### `frontend/src/components/home/PlatformStats.tsx`
| Line | Current | New |
|------|---------|-----|
| 44 | "Tokens Launched" | "OP20 Tokens Launched" |

## Phase 2: Launch Flow

**Files**:

### `frontend/src/pages/LaunchPage.tsx`
| Line | Current | New |
|------|---------|-----|
| 15 | "Launch Your Token" | "Launch Your OP20 Token" |
| 17 | "Deploy a bonding curve token on Bitcoin L1 in minutes." | "Deploy a bonding curve OP20 token on Bitcoin L1 in minutes." |

### `frontend/src/components/launch/steps/StepDetails.tsx`
| Line | Current | New |
|------|---------|-----|
| 58 | "Token Details" | "OP20 Token Details" |
| 59 | "Name, symbol, and description for your token." | "Name, symbol, and description for your OP20 token." |

### `frontend/src/components/launch/steps/StepAllocation.tsx`
| Line | Current | New |
|------|---------|-----|
| 14 | "Reserve a percentage of the token supply for yourself." | "Reserve a percentage of the OP20 token supply for yourself." |

### `frontend/src/components/launch/steps/StepAirdrop.tsx`
| Line | Current | New |
|------|---------|-----|
| 18 | "Distribute tokens to existing Bitcoin communities." | "Distribute OP20 tokens to existing Bitcoin communities." |

### `frontend/src/components/launch/steps/StepDeploy.tsx`
| Line | Current | New |
|------|---------|-----|
| 171 | "Deploy Token" | "Deploy OP20 Token" |
| 172 | "Review and launch your token on OPNet." | "Review and launch your OP20 token on OPNet." |
| 245 | "Token Deployed!" | "OP20 Token Deployed!" |
| 246 | "Your token is now live on OPNet." | "Your OP20 token is now live on OPNet." |
| 253 | "View Token" | Keep — links to specific token |
| 280 | "Deploy Token" | "Deploy OP20 Token" |

## Phase 3: Token Detail & Trading Pages

**Files**:

### `frontend/src/pages/TokenPage.tsx`
| Line | Current | New |
|------|---------|-----|
| 180 | `alt="Token"` | `alt="OP20 Token"` |
| 213 | "This token has migrated to MotoSwap DEX..." | "This OP20 token has migrated to MotoSwap DEX..." |

**Keep unchanged**: "Token Info" tab (line 141), "Price Chart" (line 115), "Bonding Curve" tab (line 142) — these are about a specific token, not the type.

## Phase 4: Discovery / Trenches Page

### `frontend/src/pages/TrenchesPage.tsx`
| Line | Current | New |
|------|---------|-----|
| 20 | "No tokens found. Try adjusting your search." | "No OP20 tokens found. Try adjusting your search." |
| 21 | "No active tokens on the bonding curve right now." | "No active OP20 tokens on the bonding curve right now." |
| 22 | "No tokens have graduated yet." | "No OP20 tokens have graduated yet." |
| 23 | "No tokens have migrated to the DEX yet." | "No OP20 tokens have migrated to the DEX yet." |
| 25 | "No new tokens awaiting their first trade." | "No new OP20 tokens awaiting their first trade." |
| 44 | "Tokens Launched" | "OP20 Tokens Launched" |
| 72 | "Search tokens..." | "Search OP20 tokens..." |

## Phase 5: Profile Page

### `frontend/src/components/profile/CreatedTokens.tsx`
| Line | Current | New |
|------|---------|-----|
| 12 | "No tokens launched yet." | "No OP20 tokens launched yet." |

### `frontend/src/components/profile/ProfileHeader.tsx`
| Line | Current | New |
|------|---------|-----|
| 31 | "Tokens Launched" | "OP20 Tokens Launched" |

### `frontend/src/pages/ProfilePage.tsx`
| Line | Current | New |
|------|---------|-----|
| 89 | "Created Tokens" | "Created OP20 Tokens" |

### `frontend/src/components/profile/Holdings.tsx`
| Line | Current | New |
|------|---------|-----|
| 47 | "No holdings yet. Buy some tokens to get started!" | "No holdings yet. Buy some OP20 tokens to get started!" |

## Phase 6: Documentation

### `documents/what-is-opump.md`
Apply same heuristic: change generic "token" asset-type references to "OP20 token." Keep contract names (`LaunchToken`) and specific token references unchanged.

### `documents/README.md`
Check for any user-facing copy that references generic tokens and update.

## Files NOT Changed (Explicit Exclusions)

| File/Area | Reason |
|-----------|--------|
| `contracts/` (all files) | FR-003: No code identifier changes |
| `frontend/src/services/abis.ts` | Code identifiers only |
| `frontend/src/services/contract.ts` | Code identifiers only |
| `netlify/` (all files) | Backend/API internals |
| `shared/` (all files) | Type definitions, not user-facing copy |
| `frontend/src/components/token/TokenList.tsx` | "Token" column header labels specific tokens |
| `frontend/src/components/token/MinterRewardCard.tsx` | Internal reward logic references |
| `frontend/src/components/token/CreatorFeeCard.tsx` | Internal fee logic references |
| `CLAUDE.md` | Developer documentation, not user-facing |

## Verification Plan

1. `grep -ri "launch.*token\|launch your token" frontend/src/` — should only return code identifiers, not UI strings
2. Visual check: navigate Home → Launch → Deploy → Token Detail → Trenches → Profile
3. Confirm no JSX rendering breaks (dev server loads without errors)
4. Confirm no contract/ABI/variable names were changed

## Complexity Tracking

| Item | Complexity | Notes |
|------|-----------|-------|
| Total files to edit | ~15 frontend + 2 docs | Low risk per file |
| Total string changes | ~35-40 | Each is a simple text substitution |
| Risk of regression | Very low | Copy-only, no logic changes |
| Constitution violations | 0 | N/A |
