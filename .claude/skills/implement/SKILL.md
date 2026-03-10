---
name: implement
description: Execute the implementation plan by processing all tasks defined in tasks.md, phase by phase.
user-invocable: true
---

## User Input

```text
{{args}}
```

You **MUST** consider the user input before proceeding (if not empty).

## Outline

Execute all tasks from the task list, following the defined phases and dependencies.

### Execution Flow

1. **Load implementation context**:
   - Get current branch: `git branch --show-current`
   - **Required**: `specs/[branch]/tasks.md`, `specs/[branch]/plan.md`
   - **Optional**: `data-model.md`, `contracts/`, `research.md`, `quickstart.md`
   - Read constitution from `CLAUDE.md` if present

2. **Check checklists** (if `specs/[branch]/checklists/` exists):
   - Scan all checklist files, count completed vs incomplete items
   - Display status table:

     | Checklist | Total | Done | Incomplete | Status |
     |-----------|-------|------|------------|--------|
     | ux.md     | 12    | 12   | 0          | PASS   |
     | test.md   | 8     | 5    | 3          | FAIL   |

   - If any incomplete: STOP and ask "Some checklists are incomplete. Proceed anyway?"
   - If all pass: continue automatically

3. **Project setup verification**:
   - Verify/create `.gitignore` with technology-appropriate patterns
   - Verify/create other ignore files based on tech stack (`.dockerignore`, `.eslintignore`, etc.)

4. **Parse tasks.md** and extract:
   - Task phases, IDs, descriptions, file paths
   - Dependencies and parallel markers [P]
   - Execution order

5. **Execute phase by phase**:
   - Complete each phase before moving to the next
   - Respect dependencies — sequential tasks in order, parallel [P] tasks can overlap
   - Follow TDD if test tasks exist (write tests first, verify they fail, then implement)
   - Validate at each phase checkpoint

6. **Execution rules**:
   - Setup first → Foundational → User Stories (in priority order) → Polish
   - If tests exist: tests before code
   - Mark completed tasks as `[x]` in tasks.md
   - Report progress after each completed task
   - Halt if a non-parallel task fails
   - For parallel [P] tasks: continue with successful ones, report failures

7. **Completion validation**:
   - Verify all tasks completed
   - Check features match original spec
   - Validate tests pass (if any)
   - Confirm alignment with plan

8. **Report**:
   - Summary of completed work
   - Any issues encountered
   - Test results
   - Suggested next steps

### Key Rules

- Mark completed tasks as `[x]` in tasks.md as you go
- Commit after each logical group of tasks
- Stop at any checkpoint to validate independently
- If tasks.md is missing or incomplete, suggest running `/generate-tasks` first
