# Tasks: Referral Code System

**Branch**: `10-referral-codes`
**Generated**: 2026-03-19
**Total Tasks**: 22

---

## Phase 1: Foundational — Shared Types & Redis Queries

- [x] T001 Create `shared/types/referral.ts` — shared types
- [x] T002 Create `netlify/functions/_shared/referral-queries.mts` — Redis helper module

## Phase 2: US4 — Bulk Code Creation (P1)

- [x] T003 [US4] Create `netlify/functions/referral-bulk.mts` — admin bulk endpoint

## Phase 3: US1 — Referrer Sees Their Code (P1)

- [x] T004 [US1] Create `netlify/functions/referral-info.mts` — GET referral info endpoint
- [x] T005 [US1] Edit `frontend/src/services/api.ts` — add referral API methods
- [x] T006 [US1] Create `frontend/src/stores/referral-store.ts` — Zustand store
- [x] T007 [US1] Create `frontend/src/components/referral/ReferralDashboard.tsx` — dashboard UI
- [x] T008 [US1] Create `frontend/src/pages/ReferralPage.tsx` — page wrapper
- [x] T009 [US1] Edit `frontend/src/App.tsx` — add /referral route

## Phase 4: US2 — Referred User Linking (P1)

- [x] T010 [US2] Create `netlify/functions/referral-link.mts` — POST link endpoint
- [x] T011 [US2] Create `frontend/src/hooks/use-referral-capture.ts` — URL capture hook
- [x] T012 [US2] Edit `frontend/src/components/layout/RootLayout.tsx` — mount capture hook
- [x] T013 [US2] Edit `frontend/src/stores/wallet-store.ts` — auto-link on wallet connect

## Phase 5: US3 — Referral Earnings on Trade (P1)

- [x] T014 [US3] Edit `netlify/functions/trades-submit.mts` — credit referrer on trade
- [x] T015 [US3] Edit `frontend/src/stores/referral-store.ts` — earnings refresh

## Phase 6: Navigation & Polish

- [x] T016 Edit `frontend/src/components/layout/Header.tsx` — add Referrals nav link
- [x] T017 Create `frontend/src/components/referral/ReferralBanner.tsx` — ref capture banner
- [x] T018 Edit `frontend/src/components/layout/RootLayout.tsx` — mount banner + already has referred-by and USD in dashboard

## Phase 7: Verification

- [x] T019 Frontend build — compiles with zero errors
- [ ] T020 Manual test: bulk create codes
- [ ] T021 Manual test: full referral flow
- [ ] T022 Manual test: edge cases
