# Feature Specification: Rebrand "Launch Token" to "Launch OP20 Token"

**Feature Branch**: `4-op20-branding`
**Created**: 2026-03-19
**Status**: Draft

## User Scenarios & Testing

### User Story 1 - Homepage reflects OP20 branding (Priority: P1)
A visitor lands on the OPump homepage and sees messaging that clearly communicates they can launch **OP20 tokens** on Bitcoin. The hero section, call-to-action buttons, and any descriptive copy reference "OP20 tokens" instead of generic "tokens."

**Why this priority**: The homepage is the first impression — it must immediately communicate the OP20 value proposition.
**Independent Test**: Visit the homepage and verify all references say "OP20 token(s)" instead of "token(s)" where contextually appropriate.
**Acceptance Scenarios**:
1. **Given** I am on the homepage, **When** I read the hero section, **Then** I see "Launch OP20 Tokens on Bitcoin" (or equivalent OP20-branded copy).
2. **Given** I am on the homepage, **When** I look at the primary CTA button, **Then** it says "Launch OP20 Token" (or equivalent).

### User Story 2 - Launch flow uses OP20 terminology (Priority: P1)
A user navigating the token creation/launch flow sees "OP20 token" terminology in page titles, step descriptions, and confirmation messages.

**Why this priority**: The launch flow is the core product action — consistency here builds user confidence.
**Independent Test**: Walk through the entire launch flow and verify all user-facing text references "OP20 token" instead of generic "token" where the context is about the asset type being created.
**Acceptance Scenarios**:
1. **Given** I am on the launch page, **When** I see the page heading, **Then** it says "Launch Your OP20 Token" (or equivalent).
2. **Given** I am deploying a token, **When** I see status/confirmation messages, **Then** they reference "OP20 token."

### User Story 3 - Token detail and trading pages use OP20 terminology (Priority: P2)
When viewing a specific token's detail page, trading interface, or profile page, references to the token type say "OP20 token" where contextually appropriate (e.g., "This OP20 token has graduated" rather than "This token has graduated").

**Why this priority**: Reinforces branding throughout the user journey, but lower priority since users already understand the asset type by this point.
**Independent Test**: Visit a token detail page and profile page; verify OP20 branding where the asset type is referenced.
**Acceptance Scenarios**:
1. **Given** I am viewing a token detail page, **When** I see descriptive text about the token type, **Then** it references "OP20 token."
2. **Given** I am on my profile page, **When** I see sections listing tokens I created or hold, **Then** section headers reference "OP20 tokens."

### Edge Cases
- Generic uses of "token" that refer to a specific named token (e.g., "Buy PEPE") should NOT be changed — only references to the asset class/type should say "OP20 token."
- Internal code identifiers (contract names, variable names, ABI types) are NOT in scope for this change — this is a user-facing copy change only.
- Pluralization must be natural: "OP20 tokens" (plural), "OP20 token" (singular).

## Requirements

### Functional Requirements
- **FR-001**: All user-facing text that refers to the asset type being launched/created MUST say "OP20 token" instead of "token" or "launch token."
- **FR-002**: Navigation elements, page titles, and headings that reference the launch action MUST include "OP20."
- **FR-003**: Internal code identifiers (component names, variable names, contract names, ABIs) MUST NOT be renamed — this is a copy-only change.
- **FR-004**: Context-specific token references (e.g., a token's own name, "Buy [TOKEN_NAME]") MUST NOT be changed.
- **FR-005**: Documentation and marketing copy within the repository (e.g., `documents/`) SHOULD also be updated for consistency.

### Key Entities
- **OP20 Token**: The standard token type on the OPNet Bitcoin L1 smart contract platform. Previously referred to generically as "token" or "launch token" in the UI.

## Success Criteria

### Measurable Outcomes
- **SC-001**: Zero instances of "Launch Token" or "Launch Your Token" in user-facing UI copy (replaced with OP20 equivalents).
- **SC-002**: All user-facing pages (home, launch, token detail, profile) consistently use "OP20 token" when referring to the asset type.
- **SC-003**: No changes to contract code, ABIs, or internal variable/function names.
- **SC-004**: No broken UI or rendering regressions after copy changes.
