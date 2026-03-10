---
name: create-pr
description: Create a pull request to dev branch with auto-generated description from ClickUp task
user-invocable: true
---

# Create Pull Request

Create a pull request to the `dev` branch with an auto-generated description based on branch changes and ClickUp task context.

## Instructions

1. **Gather git context** by running these commands in parallel:
   - `git branch --show-current` - Get current branch name
   - `git log dev..HEAD --oneline` - Get commits on this branch
   - `git diff dev...HEAD --stat` - Get summary of file changes
   - `git diff dev...HEAD` - Get full diff (for understanding changes)

2. **Extract ClickUp task ID** from commit messages:
   - All commits follow Conventional Commits format: `type[task-id]: description`
   - Extract the task ID from inside the brackets (e.g., `feat[86aey7py2]: add feature` → `86aey7py2`)
   - Task IDs are alphanumeric strings that may include hyphens/underscores
   - Use the task ID from the most recent commit, or verify all commits reference the same task

3. **Fetch ClickUp task context** using the MCP tools:
   - Workspace ID: `9003098945`
   - Use `clickup_get_task` with the extracted task ID and workspace_id to get:
     - Task name and description
     - Status and priority
     - Acceptance criteria or requirements
   - Use `clickup_get_task_comments` to get additional context from task discussions
   - This provides the "why" behind the changes

4. **Analyze all context** to understand:
   - What feature/fix/refactor this PR implements (from ClickUp task)
   - The original requirements and acceptance criteria (from ClickUp)
   - Which files and modules are affected (from git diff)
   - The scope and impact of changes

5. **Generate the PR description** following the repo's PR template at `.github/pull_request_template.md`:
   - **Summary**: 1-2 sentences explaining what this PR does and why (informed by ClickUp task description)
   - **Changes**: Bullet points for each logical change, aligned with task requirements
   - **ClickUp Task**: Link to the ClickUp task using format `https://app.clickup.com/t/TASK_ID`
   - **Testing**: How changes were tested, informed by acceptance criteria from ClickUp
   - **Screenshots / Videos**: Leave this section empty as a placeholder for the developer to add evidence
   - **Checklist**: Fill in the checklist items (mark all as checked since Claude has reviewed the code)

6. **Create the PR** using:
   ```bash
   gh pr create --base dev --title "TITLE" --body "BODY"
   ```

   - Title format: `type[task-id]: short description` (e.g., `feat[86aey7py2]: add user authentication`)
   - Types: `feat`, `fix`, `refactor`, `chore`, `docs`, `test`
   - Use the ClickUp task name to inform the title description

7. **Return the PR URL** to the user after creation.

## Notes

- ClickUp task context is essential - it provides the "why" and acceptance criteria
- If no ClickUp task ID is found, warn the user and ask if they want to proceed without it
- If the branch has no commits ahead of dev, inform the user
- If there are uncommitted changes, warn the user before creating the PR
- Keep the summary concise but informative, combining ClickUp context with actual code changes
- ClickUp workspace ID: `9003098945`
- ClickUp task link format: `https://app.clickup.com/t/TASK_ID`
