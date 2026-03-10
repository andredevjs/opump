---
name: specify
description: Create a feature specification from a natural language description. Defines WHAT to build (not HOW).
user-invocable: true
---

## User Input

```text
{{args}}
```

You **MUST** consider the user input before proceeding (if not empty). This IS the feature description.

## Outline

Given the feature description, create a structured specification following Spec-Driven Development principles.

### Execution Flow

1. **Generate a concise branch name** (2-4 words):
   - Extract the most meaningful keywords from the description
   - Use action-noun format (e.g., "user-auth", "analytics-dashboard", "fix-payment-timeout")
   - Preserve technical terms and acronyms

2. **Determine the feature number**:
   - Check existing branches: `git branch -a | grep -E '[0-9]+-'`
   - Check existing spec directories: look in `specs/` for numbered directories
   - Find the highest number N across all sources
   - Use N+1 (or 1 if none exist)

3. **Create branch and directory**:
   - Create and checkout branch: `git checkout -b [N]-[short-name]`
   - Create spec directory: `specs/[N]-[short-name]/`

4. **Write the specification** to `specs/[N]-[short-name]/spec.md`:

   ```markdown
   # Feature Specification: [FEATURE NAME]

   **Feature Branch**: `[N]-[short-name]`
   **Created**: [DATE]
   **Status**: Draft

   ## User Scenarios & Testing

   ### User Story 1 - [Title] (Priority: P1)
   [User journey in plain language]
   **Why this priority**: [Value explanation]
   **Independent Test**: [How to test this story alone]
   **Acceptance Scenarios**:
   1. **Given** [state], **When** [action], **Then** [outcome]

   ### User Story 2 - [Title] (Priority: P2)
   [...]

   ### Edge Cases
   - What happens when [boundary condition]?
   - How does system handle [error scenario]?

   ## Requirements

   ### Functional Requirements
   - **FR-001**: System MUST [capability]
   - **FR-002**: System MUST [capability]

   ### Key Entities (if data involved)
   - **[Entity]**: [What it represents, key attributes]

   ## Success Criteria

   ### Measurable Outcomes
   - **SC-001**: [Measurable, technology-agnostic metric]
   - **SC-002**: [Measurable metric]
   ```

5. **Handle unclear aspects**:
   - Make informed guesses based on context and industry standards
   - Only use `[NEEDS CLARIFICATION: question]` if:
     - The choice significantly impacts scope or UX
     - Multiple reasonable interpretations exist
     - No reasonable default exists
   - **Maximum 3 clarification markers**
   - Prioritize: scope > security/privacy > UX > technical details

6. **Validate the spec**:
   - No implementation details (no languages, frameworks, APIs)
   - Focused on user value and business needs
   - Requirements are testable and unambiguous
   - Success criteria are measurable and technology-agnostic
   - All mandatory sections completed

7. **If clarifications remain**, present them as structured questions with options table:

   | Option | Answer | Implications |
   |--------|--------|--------------|
   | A | [answer] | [impact] |
   | B | [answer] | [impact] |

8. **Report completion** with:
   - Branch name and spec file path
   - Readiness for next phase (`/clarify` or `/plan-feature`)

### Key Rules

- Focus on **WHAT** users need and **WHY**
- Avoid **HOW** to implement (no tech stack, APIs, code structure)
- Written for business stakeholders, not developers
- Each user story must be independently testable
- User stories ordered by priority (P1 = most critical)
- Use reasonable defaults for unspecified details (document in Assumptions)
