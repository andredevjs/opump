---
name: generate-tasks
description: Generate an actionable, dependency-ordered task list from the implementation plan and spec.
user-invocable: true
---

## User Input

```text
{{args}}
```

You **MUST** consider the user input before proceeding (if not empty).

## Outline

Break the implementation plan into ordered, executable tasks organized by user story.

### Execution Flow

1. **Load design documents** from the active feature:
   - Get current branch: `git branch --show-current`
   - **Required**: `specs/[branch]/plan.md`, `specs/[branch]/spec.md`
   - **Optional**: `data-model.md`, `contracts/`, `research.md`, `quickstart.md`

2. **Extract from loaded docs**:
   - Tech stack, libraries, project structure (from plan.md)
   - User stories with priorities P1, P2, P3... (from spec.md)
   - Entities and relationships (from data-model.md if exists)
   - API endpoints (from contracts/ if exists)
   - Technical decisions (from research.md if exists)

3. **Generate tasks** organized by user story:

   **Task Format** (REQUIRED for every task):
   ```
   - [ ] [TaskID] [P?] [Story?] Description with file path
   ```
   - `- [ ]` = markdown checkbox (always)
   - `TaskID` = T001, T002, T003... (sequential)
   - `[P]` = parallelizable (different files, no deps) — only if applicable
   - `[Story]` = [US1], [US2], etc. — required for user story tasks only
   - Description must include exact file path

4. **Phase structure**:

   - **Phase 1: Setup** — project initialization, dependencies, config
   - **Phase 2: Foundational** — blocking prerequisites (MUST complete before user stories)
   - **Phase 3+: User Stories** — one phase per story, in priority order (P1, P2, P3...)
     - Within each: Models → Services → Endpoints → Integration
     - Each phase = independently testable increment
   - **Final Phase: Polish** — cross-cutting concerns, docs, optimization

5. **Include dependency information**:
   - Phase dependencies (Setup → Foundational → User Stories → Polish)
   - Within-story dependencies (models before services, services before endpoints)
   - Parallel opportunities (tasks on different files with no deps)
   - User stories can run in parallel after Foundational

6. **Write tasks** to `specs/[branch]/tasks.md`

7. **Report**:
   - Total task count and per-story breakdown
   - Parallel opportunities identified
   - MVP scope suggestion (typically just User Story 1)
   - Suggested next command (`/implement`)

### Task Generation Rules

- Tests are OPTIONAL — only include if explicitly requested or spec mentions TDD
- Each user story should be independently completable and testable
- Tasks must be specific enough for an LLM to execute without additional context
- Include exact file paths in every task description
- Mark parallel tasks with [P] only when they truly have no dependencies

### Example Tasks

```markdown
## Phase 1: Setup
- [ ] T001 Create project structure per implementation plan
- [ ] T002 Initialize Python project with FastAPI dependencies
- [ ] T003 [P] Configure linting and formatting tools

## Phase 3: User Story 1 - User Registration (P1)
**Goal**: Users can create accounts
- [ ] T010 [P] [US1] Create User model in src/models/user.py
- [ ] T011 [P] [US1] Create UserSchema in src/schemas/user.py
- [ ] T012 [US1] Implement UserService in src/services/user_service.py
- [ ] T013 [US1] Implement POST /users endpoint in src/api/users.py
```
