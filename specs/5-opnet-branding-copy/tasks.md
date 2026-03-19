# Tasks: OPNet Branding in Bitcoin L1 Copy

**Branch**: `5-opnet-branding-copy`
**Generated**: 2026-03-19

## Phase 1: User Story 1 — OPNet attribution in all Bitcoin L1 mentions (P1)

**Goal**: Every user-facing "Bitcoin L1" reference includes "via Op_Net"

- [x] T001 [P] [US1] Update hero badge in `frontend/src/components/home/Hero.tsx`: "Live on Bitcoin L1" → "Live on Bitcoin L1 via Op_Net" (line 14)
- [x] T002 [P] [US1] Update hero description in `frontend/src/components/home/Hero.tsx`: "all on Bitcoin L1." → "all on Bitcoin L1 via Op_Net." (line 23)
- [x] T003 [P] [US1] Update launch page subtitle in `frontend/src/pages/LaunchPage.tsx`: "on Bitcoin L1 in minutes." → "on Bitcoin L1 via Op_Net in minutes." (line 17)
- [x] T004 [P] [US1] Update footer badge in `frontend/src/components/layout/Footer.tsx`: "Built on Bitcoin L1" → "Built on Bitcoin L1 via Op_Net" (line 18)

## Phase 2: User Story 2 — Verification (P1)

**Goal**: Confirm zero standalone "Bitcoin L1" instances remain in user-facing code

- [x] T005 [US2] Run `grep -r "Bitcoin L1" frontend/src/` and verify every match includes "via Op_Net". If any standalone instance found, update it.
