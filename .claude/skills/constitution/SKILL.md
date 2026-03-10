---
name: constitution
description: Create or update the project constitution — the governing principles that shape all specs, plans, and code.
user-invocable: true
---

## User Input

```text
{{args}}
```

You **MUST** consider the user input before proceeding (if not empty).

## Outline

You are creating or updating the project constitution. This is a set of non-negotiable principles that govern how all code in this project is written. The constitution lives in `CLAUDE.md` under a `## Constitution` section and optionally as a standalone `specs/constitution.md` for detailed versioning.

### Execution Flow

1. **Check for existing constitution**:
   - Read `CLAUDE.md` at the project root. Look for a `## Constitution` section.
   - If it exists, you're amending. If not, you're creating from scratch.

2. **Collect principles from user input**:
   - If the user provided principles in their input, use those.
   - If not, analyze the existing repo (README, docs, code patterns) and propose principles.
   - Ask the user to confirm or adjust before writing.
   - The user might want fewer or more principles — respect that.

3. **Draft the constitution** with this structure:

   ```markdown
   ## Constitution

   **Version**: X.Y.Z | **Ratified**: YYYY-MM-DD | **Last Amended**: YYYY-MM-DD

   ### I. [Principle Name]
   [Description — declarative, testable, uses MUST/SHOULD language]

   ### II. [Principle Name]
   [Description]

   [... more principles as needed ...]

   ### Governance
   - Constitution supersedes all other practices
   - Amendments require documentation and version bump
   - All code changes must verify compliance
   ```

4. **Version the constitution**:
   - New constitution: Start at `1.0.0`
   - Adding/expanding principles: bump MINOR (e.g., 1.1.0)
   - Wording/clarification changes: bump PATCH (e.g., 1.0.1)
   - Removing or redefining principles: bump MAJOR (e.g., 2.0.0)

5. **Write the constitution**:
   - Update the `## Constitution` section in `CLAUDE.md`
   - If `CLAUDE.md` doesn't exist, create it with the constitution section plus a basic project description header
   - Optionally write a standalone copy to `specs/constitution.md` for version tracking

6. **Report completion**:
   - New version and bump rationale
   - List of principles
   - Suggested commit message

### Guidelines

- Principles must be declarative and testable — no vague language
- Replace "should" with "MUST" or "SHOULD" with explicit rationale
- Keep principles concise but specific
- Each principle needs a clear name and actionable rules
- Maximum ~10 principles to keep it manageable
- Dates in ISO format (YYYY-MM-DD)
