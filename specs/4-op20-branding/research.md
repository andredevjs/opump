# Research: OP20 Branding

**Branch**: 4-op20-branding | **Date**: 2026-03-19

## No NEEDS CLARIFICATION Items

The spec has zero clarification markers. The scope is a copy-only change.

## File Inventory

A thorough scan of the codebase identified **~20 frontend files** and **2 document files** containing user-facing "token" references that should be rebranded to "OP20 token."

### Decision: Which references to change

**Rule**: Only change references where "token" describes the **asset type/class** being launched on OPNet. Do NOT change:
- Specific token names (data-driven, e.g., `{token.name}`)
- Internal code identifiers (variable names, imports, component names, ABIs)
- Generic UI labels where "Token" is a column header showing a specific token's info (e.g., table header "Token" in a list — this labels the column, not the type)
- Contract/API internals

**Rationale**: The goal is branding clarity for users — they should know they're launching an **OP20** standard token, not a generic "token." But we don't want to make copy awkward by over-qualifying (e.g., "Search OP20 tokens..." is fine, but "No OP20 tokens found" reads naturally too).

### Decision: Contextual judgment calls

Some references are borderline. Apply this heuristic:
- **Change** if the text describes what OPump creates/launches (asset type)
- **Keep** if the text labels a specific token instance in a list/table
- **Change** section headings like "Token Details" → "OP20 Token Details" only if it describes the type, not if it's a detail view for a specific token
- For "Token Info" tab on a specific token's page — **keep** as-is (it's about THAT token, not the type)

### No Technology Decisions Needed

This is a copy-only change. No new dependencies, no architectural changes, no API changes.
