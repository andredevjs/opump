---
name: checklist
description: Generate a custom requirements quality checklist — "unit tests for English." Validates that requirements are complete, clear, and consistent.
user-invocable: true
---

## User Input

```text
{{args}}
```

You **MUST** consider the user input before proceeding (if not empty). The user specifies what domain to create a checklist for (e.g., "ux", "security", "api", "performance").

## Core Concept: Unit Tests for Requirements

Checklists test whether **requirements are well-written**, NOT whether the implementation works.

- "Are visual hierarchy requirements defined for all card types?" (completeness)
- "Is 'prominent display' quantified with specific sizing/positioning?" (clarity)
- "Are hover state requirements consistent across all interactive elements?" (consistency)

**NOT**: "Verify the button clicks correctly" or "Test error handling works"

## Execution Flow

1. **Load feature context**:
   - Get current branch: `git branch --show-current`
   - Read `specs/[branch]/spec.md` (required)
   - Read `specs/[branch]/plan.md` and `tasks.md` if they exist

2. **Clarify intent** (up to 3 questions):
   - Derive from user input + spec signals
   - Only ask what materially changes checklist content
   - Skip if already clear from `{{args}}`
   - Cover: scope refinement, risk prioritization, depth calibration

3. **Generate checklist** with items grouped by quality dimension:

   | Dimension | What it checks |
   |-----------|---------------|
   | Completeness | Are all necessary requirements present? |
   | Clarity | Are requirements specific and unambiguous? |
   | Consistency | Do requirements align without conflicts? |
   | Measurability | Can requirements be objectively verified? |
   | Coverage | Are all scenarios/edge cases addressed? |
   | Edge Cases | Are boundary conditions defined? |
   | Dependencies | Are assumptions documented and validated? |

4. **Item format**:
   ```
   - [ ] CHK001 Are [requirement type] defined for [scenario]? [Quality Dimension, Spec §X.Y]
   ```
   - Question format asking about requirement quality
   - Include quality dimension in brackets
   - Reference spec section when checking existing requirements
   - Use `[Gap]` marker for missing requirements

5. **Write checklist** to `specs/[branch]/checklists/[domain].md`:
   - Create `checklists/` directory if needed
   - Use descriptive filename based on domain (ux.md, api.md, security.md)
   - Never overwrite existing checklists — each run creates a new file
   - Number items CHK001, CHK002, etc.

6. **Report**: File path, item count, focus areas, suggested next steps

### Prohibited Patterns

- "Verify", "Test", "Confirm", "Check" + implementation behavior
- References to code execution, user actions, system behavior
- "Displays correctly", "works properly", "functions as expected"
- Implementation details (frameworks, APIs, algorithms)

### Required Patterns

- "Are [requirement type] defined/specified/documented for [scenario]?"
- "Is [vague term] quantified/clarified with specific criteria?"
- "Are requirements consistent between [section A] and [section B]?"
- "Can [requirement] be objectively measured/verified?"
