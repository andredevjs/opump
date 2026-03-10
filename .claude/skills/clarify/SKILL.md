---
name: clarify
description: Identify underspecified areas in the current feature spec by asking targeted clarification questions and encoding answers back into the spec.
user-invocable: true
---

## User Input

```text
{{args}}
```

You **MUST** consider the user input before proceeding (if not empty).

## Outline

Detect and reduce ambiguity in the active feature specification. This should run BEFORE `/plan-feature`.

### Execution Flow

1. **Find the active spec**:
   - Get current branch name: `git branch --show-current`
   - Look for spec at `specs/[branch-name]/spec.md`
   - If not found, instruct user to run `/specify` first

2. **Load and scan the spec** for ambiguities across these categories:

   | Category | What to check |
   |----------|---------------|
   | Functional Scope | Core user goals, out-of-scope declarations, user roles |
   | Domain & Data | Entities, relationships, identity rules, state transitions |
   | Interaction & UX | Critical user journeys, error/empty/loading states |
   | Non-Functional | Performance, scalability, reliability, security, observability |
   | Integration | External services, data formats, failure modes |
   | Edge Cases | Negative scenarios, rate limiting, conflict resolution |
   | Constraints | Technical constraints, explicit tradeoffs |
   | Terminology | Canonical terms, avoided synonyms |

   Mark each: **Clear** / **Partial** / **Missing**

3. **Generate questions** (max 5 total):
   - Only ask questions whose answers materially impact architecture, data modeling, task decomposition, or test design
   - Prioritize by (Impact x Uncertainty) — highest first
   - Each question must be answerable with:
     - Multiple choice (2-5 options), OR
     - Short answer (<=5 words)

4. **Ask ONE question at a time**:
   - For multiple-choice: recommend the best option with reasoning, then show all options in a table
   - User can reply with option letter, "yes"/"recommended" to accept suggestion, or custom answer
   - After answer: record it, move to next question
   - Stop when: all critical ambiguities resolved, user says "done", or 5 questions asked

5. **After EACH accepted answer**, update the spec:
   - Add/create a `## Clarifications` section with `### Session YYYY-MM-DD`
   - Append: `- Q: <question> → A: <answer>`
   - Update the relevant spec section (requirements, data model, edge cases, etc.)
   - Replace any invalidated ambiguous statements
   - Save immediately after each integration

6. **Report completion**:
   - Number of questions asked & answered
   - Path to updated spec
   - Sections touched
   - Coverage summary (Resolved / Deferred / Clear / Outstanding per category)
   - Suggested next command (`/plan-feature`)

### Rules

- Maximum 5 questions per session
- Never reveal future queued questions
- If no meaningful ambiguities found: report "No critical ambiguities detected" and suggest proceeding
- Respect early termination signals ("stop", "done", "proceed")
- Never ask about tech stack — that's for `/plan-feature`
