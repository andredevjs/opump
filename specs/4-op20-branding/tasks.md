# Tasks: Rebrand "Launch Token" → "Launch OP20 Token"

**Branch**: 4-op20-branding | **Date**: 2026-03-19
**Spec**: specs/4-op20-branding/spec.md | **Plan**: specs/4-op20-branding/plan.md

---

## Phase 1: Homepage & Navigation [US1]

**Goal**: All homepage copy references "OP20 token(s)" instead of generic "token(s)."
**Depends on**: Nothing

- [x] T001 [P] [US1] Update hero text and CTA buttons in `frontend/src/components/home/Hero.tsx`: "Launch Tokens on" → "Launch OP20 Tokens on", "Launch Token" button → "Launch OP20 Token", "Explore Tokens" → "Explore OP20 Tokens"
- [x] T002 [P] [US1] Update how-it-works descriptions in `frontend/src/components/home/HowItWorks.tsx`: "Create a token in 6 steps." → "Create an OP20 token in 6 steps.", "the token graduates to MotoSwap DEX" → "the OP20 token graduates to MotoSwap DEX"
- [x] T003 [P] [US1] Update section heading in `frontend/src/components/home/TopTokens.tsx`: "Trending Tokens" → "Trending OP20 Tokens"
- [x] T004 [P] [US1] Update stat label in `frontend/src/components/home/PlatformStats.tsx`: "Tokens Launched" → "OP20 Tokens Launched"

## Phase 2: Launch Flow [US2]

**Goal**: Token creation wizard uses OP20 terminology throughout.
**Depends on**: Nothing (parallel with Phase 1)

- [x] T005 [P] [US2] Update page heading and subtitle in `frontend/src/pages/LaunchPage.tsx`: "Launch Your Token" → "Launch Your OP20 Token", "Deploy a bonding curve token on Bitcoin L1 in minutes." → "Deploy a bonding curve OP20 token on Bitcoin L1 in minutes."
- [x] T006 [P] [US2] Update step heading and description in `frontend/src/components/launch/steps/StepDetails.tsx`: "Token Details" → "OP20 Token Details", "Name, symbol, and description for your token." → "Name, symbol, and description for your OP20 token."
- [x] T007 [P] [US2] Update allocation description in `frontend/src/components/launch/steps/StepAllocation.tsx`: "Reserve a percentage of the token supply for yourself." → "Reserve a percentage of the OP20 token supply for yourself."
- [x] T008 [P] [US2] Update airdrop description in `frontend/src/components/launch/steps/StepAirdrop.tsx`: "Distribute tokens to existing Bitcoin communities." → "Distribute OP20 tokens to existing Bitcoin communities."
- [x] T009 [P] [US2] Update deploy step in `frontend/src/components/launch/steps/StepDeploy.tsx`: "Deploy Token" headings/buttons → "Deploy OP20 Token", "Review and launch your token on OPNet." → "Review and launch your OP20 token on OPNet.", "Token Deployed!" → "OP20 Token Deployed!", "Your token is now live on OPNet." → "Your OP20 token is now live on OPNet.", alt="Token" → alt="OP20 Token". Kept "View Token" button unchanged.

## Phase 3: Token Detail & Trading [US3]

**Goal**: Token detail pages use OP20 branding for type-level references.
**Depends on**: Nothing (parallel with Phases 1-2)

- [x] T010 [US3] Update token detail page in `frontend/src/pages/TokenPage.tsx`: "This token has migrated to MotoSwap DEX..." → "This OP20 token has migrated to MotoSwap DEX..." Kept "Token Info" tab, "Price Chart", "Bonding Curve" tab unchanged.

## Phase 4: Discovery / Trenches Page [US3]

**Goal**: Trenches discovery page uses OP20 branding in empty states, stats, and search.
**Depends on**: Nothing (parallel with Phases 1-3)

- [x] T011 [US3] Update all empty state messages and search placeholder in `frontend/src/pages/TrenchesPage.tsx`: 6 empty state messages ("No tokens..." → "No OP20 tokens..."), "Search tokens..." → "Search OP20 tokens..."

## Phase 5: Profile Page [US3]

**Goal**: Profile page uses OP20 branding in section headers and empty states.
**Depends on**: Nothing (parallel with Phases 1-4)

- [x] T012 [P] [US3] Update empty state in `frontend/src/components/profile/CreatedTokens.tsx`: "No tokens launched yet." → "No OP20 tokens launched yet."
- [x] T013 [P] [US3] Update stat label in `frontend/src/components/profile/ProfileHeader.tsx`: "Tokens Launched" → "OP20 Tokens Launched"
- [x] T014 [P] [US3] Update tab label in `frontend/src/pages/ProfilePage.tsx`: "Created Tokens" → "Created OP20 Tokens"
- [x] T015 [P] [US3] Update empty state in `frontend/src/components/profile/Holdings.tsx`: "No holdings yet. Buy some tokens to get started!" → "No holdings yet. Buy some OP20 tokens to get started!"

## Phase 6: Documentation

**Goal**: Project documentation matches the OP20 branding.
**Depends on**: Nothing (parallel with all phases)

- [x] T016 [P] Update `documents/what-is-opump.md`: changed generic "token" asset-type references to "OP20 token." Kept contract names (`LaunchToken`) and specific references unchanged.
- [x] T017 [P] Update `documents/README.md`: changed user-facing "token" type references to "OP20 token."

## Phase 7: Verification

**Goal**: Confirm all changes are correct and nothing is broken.
**Depends on**: All previous phases

- [x] T018 Grep for "Launch Token" / "Launch Your Token" in frontend/src/ — zero matches remain (only code identifiers, no UI strings)
- [x] T019 TypeScript compilation (`tsc --noEmit`) passes with zero errors
- [x] T020 Verified only frontend components + documents modified. No files in `contracts/`, `netlify/`, `shared/`, or `frontend/src/services/` were changed (SC-003 satisfied)

---

## Summary

| Metric | Value |
|--------|-------|
| Total tasks | 20 |
| Completed | 20 |
| Status | **DONE** |
