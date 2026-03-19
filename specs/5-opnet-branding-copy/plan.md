# Implementation Plan: OPNet Branding in Bitcoin L1 Copy

**Branch**: `5-opnet-branding-copy` | **Date**: 2026-03-19 | **Spec**: `specs/5-opnet-branding-copy/spec.md`

## Summary

Update all user-facing mentions of "Bitcoin L1" in the frontend to include "via Op_Net", reinforcing OPNet as the enabling platform. This is a pure copy change across 3 React component files (4 string edits total).

## Technical Context

| Field | Value |
|-------|-------|
| **Language/Version** | TypeScript / React 18 |
| **Primary Dependencies** | React, Vite, TailwindCSS |
| **Storage** | N/A (no data changes) |
| **Testing** | Manual visual inspection + grep verification |
| **Target Platform** | Web (SPA) |
| **Project Type** | Web application (frontend only) |
| **Performance Goals** | N/A |
| **Constraints** | Copy-only change, no layout breakage |

## Constitution Check

| Principle | Status | Notes |
|-----------|--------|-------|
| SafeMath for u256 | N/A | No contract changes |
| Frontend never holds keys | N/A | No signing logic touched |
| Shared type definitions | N/A | No API changes |
| Mempool-first updates | N/A | No state/data changes |

All clear — no violations.

## Phase 0 — Research

No NEEDS CLARIFICATION items in the spec. All affected files have been read and verified.

### Verification of Affected Locations

| # | File | Line | Current Text | Verified |
|---|------|------|-------------|----------|
| 1 | `frontend/src/components/home/Hero.tsx` | 14 | `Live on Bitcoin L1` | Yes |
| 2 | `frontend/src/components/home/Hero.tsx` | 23 | `and automatic DEX graduation — all on Bitcoin L1.` | Yes |
| 3 | `frontend/src/pages/LaunchPage.tsx` | 17 | `Deploy a bonding curve OP20 token on Bitcoin L1 in minutes.` | Yes |
| 4 | `frontend/src/components/layout/Footer.tsx` | 18 | `Built on Bitcoin L1` | Yes |

No other user-facing instances found. Non-user-facing files (CLAUDE.md, docs, specs) are intentionally excluded per FR-002.

## Phase 1 — Implementation

### Task List

| Task | File | Change | Priority |
|------|------|--------|----------|
| T001 | `frontend/src/components/home/Hero.tsx:14` | `Live on Bitcoin L1` → `Live on Bitcoin L1 via Op_Net` | P1 |
| T002 | `frontend/src/components/home/Hero.tsx:23` | `all on Bitcoin L1.` → `all on Bitcoin L1 via Op_Net.` | P1 |
| T003 | `frontend/src/pages/LaunchPage.tsx:17` | `on Bitcoin L1 in minutes.` → `on Bitcoin L1 via Op_Net in minutes.` | P1 |
| T004 | `frontend/src/components/layout/Footer.tsx:18` | `Built on Bitcoin L1` → `Built on Bitcoin L1 via Op_Net` | P1 |

### Layout Considerations

- **Hero badge (T001)**: The pill badge uses `inline-flex` with auto-width. Adding " via Op_Net" (~10 chars) is safe — the badge will grow naturally.
- **Hero paragraph (T002)**: The `<p>` has `max-w-2xl` constraint. The added text is short and won't cause overflow.
- **LaunchPage subtitle (T003)**: Simple centered text paragraph — no width constraint issues.
- **Footer (T004)**: Inline `<span>` in a flex row with `gap-4`. The additional text fits comfortably.

No responsive breakpoint issues expected. All changes are within text content, not structural.

## Verification Plan

After implementation:

1. **Grep check**: `grep -r "Bitcoin L1" frontend/src/` — every match must include "via Op_Net"
2. **Visual check**: Load homepage, launch page, and scroll to footer — verify copy reads correctly
3. **Responsive check**: Verify hero badge and footer don't wrap awkwardly on mobile widths

## Artifacts

- `specs/5-opnet-branding-copy/spec.md` — Feature specification
- `specs/5-opnet-branding-copy/plan.md` — This implementation plan
