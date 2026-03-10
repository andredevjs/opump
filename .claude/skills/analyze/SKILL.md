---
name: analyze
description: Cross-artifact consistency and quality analysis across spec, plan, and tasks. Read-only — does not modify files.
user-invocable: true
---

## User Input

```text
{{args}}
```

You **MUST** consider the user input before proceeding (if not empty).

## Outline

Identify inconsistencies, duplications, ambiguities, and underspecified items across spec, plan, and tasks BEFORE implementation. This is a **read-only** analysis.

### Execution Flow

1. **Load artifacts** from the active feature:
   - Get current branch: `git branch --show-current`
   - Required: `specs/[branch]/spec.md`, `specs/[branch]/plan.md`, `specs/[branch]/tasks.md`
   - Optional: constitution from `CLAUDE.md`
   - If any required file is missing, abort and instruct user to run the missing prerequisite command

2. **Build semantic models** (internal, not output):
   - **Requirements inventory**: Each requirement with a stable slug key
   - **User story inventory**: Discrete actions with acceptance criteria
   - **Task coverage mapping**: Map each task to requirements/stories
   - **Constitution rules**: Extract MUST/SHOULD normative statements

3. **Run detection passes** (limit to 50 findings total):

   | Pass | What to detect |
   |------|---------------|
   | Duplication | Near-duplicate requirements |
   | Ambiguity | Vague adjectives without metrics, unresolved placeholders (TODO, ???) |
   | Underspecification | Requirements missing measurable outcomes, stories missing acceptance criteria |
   | Constitution Alignment | Conflicts with MUST principles, missing mandated sections |
   | Coverage Gaps | Requirements with zero tasks, tasks with no mapped requirement |
   | Inconsistency | Terminology drift, entity mismatches, task ordering contradictions |

4. **Assign severity**:
   - **CRITICAL**: Constitution MUST violations, missing core artifacts, zero-coverage requirements blocking baseline
   - **HIGH**: Duplicate/conflicting requirements, ambiguous security/performance attributes
   - **MEDIUM**: Terminology drift, missing non-functional task coverage
   - **LOW**: Style/wording improvements, minor redundancy

5. **Output analysis report** (Markdown, no file writes):

   ```markdown
   ## Specification Analysis Report

   | ID | Category | Severity | Location(s) | Summary | Recommendation |
   |----|----------|----------|-------------|---------|----------------|

   **Coverage Summary:**
   | Requirement Key | Has Task? | Task IDs | Notes |

   **Metrics:**
   - Total Requirements / Total Tasks / Coverage %
   - Ambiguity Count / Duplication Count / Critical Issues Count

   **Next Actions:**
   - [Prioritized recommendations]
   ```

6. **Offer remediation**: Ask if the user wants concrete edit suggestions for top issues (do NOT apply automatically)

### Operating Principles

- **NEVER modify files** — this is read-only analysis
- **NEVER hallucinate missing sections** — report accurately what's absent
- **Prioritize constitution violations** — always CRITICAL severity
- Constitution is non-negotiable within analysis scope — conflicts require adjusting spec/plan/tasks, not the constitution
- Limit to 50 findings; summarize overflow
- Deterministic: rerunning without changes should produce consistent results
