---
name: plan-feature
description: Create a technical implementation plan from a feature spec. Generates research, data model, API contracts, and project structure.
user-invocable: true
---

## User Input

```text
{{args}}
```

You **MUST** consider the user input before proceeding (if not empty). The user typically specifies the tech stack here (e.g., "I am building with Python/FastAPI" or "using React and Node").

## Outline

Execute the implementation planning workflow. This transforms a WHAT (spec) into a HOW (plan).

### Execution Flow

1. **Find the active spec**:
   - Get current branch: `git branch --show-current`
   - Load `specs/[branch-name]/spec.md`
   - Load constitution from `CLAUDE.md` (look for `## Constitution` section)
   - If spec not found, instruct user to run `/specify` first

2. **Fill Technical Context** in the plan:

   ```markdown
   # Implementation Plan: [FEATURE]

   **Branch**: [branch] | **Date**: [date] | **Spec**: specs/[branch]/spec.md

   ## Summary
   [Primary requirement + technical approach]

   ## Technical Context
   **Language/Version**: [from user input or NEEDS CLARIFICATION]
   **Primary Dependencies**: [frameworks, libraries]
   **Storage**: [database, files, etc.]
   **Testing**: [test framework]
   **Target Platform**: [server, mobile, web, etc.]
   **Project Type**: [single/web/mobile]
   **Performance Goals**: [domain-specific targets]
   **Constraints**: [latency, memory, offline, etc.]
   ```

3. **Constitution Check** (if constitution exists in CLAUDE.md):
   - Evaluate each principle as a gate
   - ERROR if violations exist without justification
   - Document any justified violations in Complexity Tracking table

4. **Phase 0 — Research** (`specs/[branch]/research.md`):
   - For each NEEDS CLARIFICATION → research and resolve
   - For each technology choice → find best practices
   - Document decisions with rationale and alternatives considered

5. **Phase 1 — Design & Contracts**:
   - Extract entities from spec → `specs/[branch]/data-model.md`
   - Generate API contracts from functional requirements → `specs/[branch]/contracts/`
   - Create validation scenarios → `specs/[branch]/quickstart.md`

6. **Define Project Structure** in the plan:
   - Choose appropriate layout (single project / web app / mobile + API)
   - Document concrete directory paths

7. **Write the plan** to `specs/[branch]/plan.md`

8. **Re-check constitution** after design phase

9. **Report completion**:
   - Branch and plan path
   - Generated artifacts list
   - Constitution compliance status
   - Suggested next command (`/generate-tasks`)

### Project Structure Options

```
# Single project (default)
src/
├── models/
├── services/
├── cli/
└── lib/
tests/
├── contract/
├── integration/
└── unit/

# Web application
backend/
├── src/ (models, services, api)
└── tests/
frontend/
├── src/ (components, pages, services)
└── tests/

# Mobile + API
api/
└── [same as backend]
ios/ or android/
└── [platform-specific]
```

### Key Rules

- Resolve ALL "NEEDS CLARIFICATION" items during Phase 0
- Constitution violations without justification are ERRORs
- Use absolute paths throughout
- Stop after planning — do NOT implement
