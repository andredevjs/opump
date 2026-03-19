# Feature Specification: OPNet Branding in Bitcoin L1 Copy

**Feature Branch**: `5-opnet-branding-copy`
**Created**: 2026-03-19
**Status**: Draft

## User Scenarios & Testing

### User Story 1 - Visitor sees OPNet attribution alongside Bitcoin L1 mentions (Priority: P1)

As a visitor landing on OPump, I want to see that the platform runs "on Bitcoin L1 via Op_Net" (rather than just "on Bitcoin L1") so that I understand the specific technology enabling smart contracts on Bitcoin's base layer.

**Why this priority**: Brand clarity is the core goal of this change — every user-facing mention of Bitcoin L1 should credit Op_Net as the enabling platform.

**Independent Test**: Visit the homepage, launch page, and footer. Every instance of "Bitcoin L1" or "live on Bitcoin" copy should include "via Op_Net".

**Acceptance Scenarios**:
1. **Given** a user is on the homepage hero section, **When** they read the tagline, **Then** it says "Live on Bitcoin L1 via Op_Net" (not just "Live on Bitcoin L1").
2. **Given** a user is on the launch page, **When** they read the subtitle, **Then** it references Bitcoin L1 via Op_Net.
3. **Given** a user scrolls to the footer, **When** they read the built-on badge, **Then** it says "Built on Bitcoin L1 via Op_Net".
4. **Given** a user reads any user-facing copy on the site, **When** that copy mentions Bitcoin L1, **Then** it includes "via Op_Net".

### User Story 2 - Consistent branding across all surfaces (Priority: P1)

As a stakeholder, I want all user-facing references to "Bitcoin L1" to consistently include "via Op_Net" so that the brand messaging is uniform.

**Why this priority**: Inconsistent branding confuses users and weakens partner attribution.

**Independent Test**: Search the entire frontend codebase for "Bitcoin L1" references and verify each includes "via Op_Net".

**Acceptance Scenarios**:
1. **Given** a full-text search of user-facing copy, **When** results are reviewed, **Then** zero instances of standalone "Bitcoin L1" remain in UI-rendered text.

### Edge Cases
- What about internal documentation, specs, and non-user-facing files? **Decision**: Leave unchanged — this change targets only user-facing UI copy.
- What about the hero sub-description that says "all on Bitcoin L1"? **Decision**: Update to "all on Bitcoin L1 via Op_Net" for consistency.

## Requirements

### Functional Requirements
- **FR-001**: System MUST display "via Op_Net" alongside every user-facing mention of "Bitcoin L1" in the frontend.
- **FR-002**: System MUST NOT modify internal documentation, specs, or non-rendered code comments.
- **FR-003**: The updated copy MUST use the exact casing "Op_Net" (capital O, capital N, underscore).

### Key Entities
- **User-Facing Copy**: Any text rendered in the browser that a visitor can read — hero sections, subtitles, footers, descriptions.

## Affected Locations (User-Facing)

| File | Current Copy | Updated Copy |
|------|-------------|--------------|
| `frontend/src/components/home/Hero.tsx:14` | "Live on Bitcoin L1" | "Live on Bitcoin L1 via Op_Net" |
| `frontend/src/components/home/Hero.tsx:23` | "all on Bitcoin L1." | "all on Bitcoin L1 via Op_Net." |
| `frontend/src/pages/LaunchPage.tsx:17` | "Deploy a bonding curve OP20 token on Bitcoin L1 in minutes." | "Deploy a bonding curve OP20 token on Bitcoin L1 via Op_Net in minutes." |
| `frontend/src/components/layout/Footer.tsx:18` | "Built on Bitcoin L1" | "Built on Bitcoin L1 via Op_Net" |

## Success Criteria

### Measurable Outcomes
- **SC-001**: 100% of user-facing "Bitcoin L1" references include "via Op_Net"
- **SC-002**: Zero regressions — no broken layouts, truncated text, or rendering issues from the copy changes
- **SC-003**: Internal docs and specs remain unchanged
