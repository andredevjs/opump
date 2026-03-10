---
name: commit
description: Create a commit following Conventional Commits format with ClickUp task ID
user-invocable: true
---

# Create Commit

Create a commit following Conventional Commits format with ClickUp task ID.

## Usage

```
/commit [clickup-task-id]
```

Examples:
- `/commit 86aey7py2` - Use the specified task ID
- `/commit` - Will offer to reuse the previous commit's task ID or enter a new one

## Format

```
type[clickup-id]: subject (min 4 chars)

optional body with more details
```

## Instructions

1. **Determine the ClickUp task ID**:
   - If provided as argument (`{{args}}`), use that task ID
   - If no task ID is provided:
     - Run `git log -1 --oneline` to check the previous commit for a task ID
     - Extract the task ID from the commit message format `type[task-id]: subject`
     - Ask the user with two options:
       - Use the previous commit's task ID (show it if found)
       - Enter a different task ID
     - If no previous task ID exists, simply ask the user to provide one

2. **Gather git context** by running these commands in parallel:
   - `git status` - Check for staged/unstaged changes
   - `git diff --cached` - See what's staged for commit
   - `git diff` - See unstaged changes
   - `git branch --show-current` - Get current branch name

3. **Check staging status**:
   - If nothing is staged but there are unstaged changes, ask the user what to stage
   - If nothing is staged and no changes exist, inform the user there's nothing to commit
   - Show the user a summary of staged changes before proceeding

4. **Fetch ClickUp task context** (optional but recommended):
   - Use `clickup_get_task` with the provided task ID to understand what the task is about
   - This helps generate a more accurate commit message aligned with the task

5. **Analyze the staged changes** to understand:
   - What type of change this is (feat, fix, refactor, etc.)
   - What the change does in plain language
   - Whether a detailed body is needed

6. **Determine the commit type**:
   - `feat` - A new feature
   - `fix` - A bug fix
   - `docs` - Documentation only changes
   - `style` - Code style changes (formatting, semicolons, etc.)
   - `refactor` - Code change that neither fixes a bug nor adds a feature
   - `perf` - Performance improvements
   - `test` - Adding or updating tests
   - `build` - Changes to build system or dependencies
   - `ci` - Changes to CI configuration files and scripts
   - `chore` - Other changes that don't modify src or test files
   - `revert` - Reverts a previous commit

7. **Generate the commit message**:
   - First line: `type[clickup-id]: subject` (subject must be at least 4 characters)
   - Keep first line under 100 characters
   - If changes are complex, add a blank line followed by a body explaining:
     - What was changed and why
     - Any important implementation details
     - Breaking changes (prefix with `BREAKING CHANGE:`)

8. **Create the commit** using a HEREDOC for proper formatting:
   ```bash
   git commit -m "$(cat <<'EOF'
   type[clickup-id]: subject

   Optional body with more details.
   EOF
   )"
   ```

9. **Verify the commit** by running `git log -1` to show the created commit.

## Notes

- Always show the user the proposed commit message before creating it
- Subject must be at least 4 characters (enforced by commit-msg hook)
- First line should be under 100 characters for readability
- Use imperative mood in the subject (e.g., "add feature" not "added feature")
- If the commit includes breaking changes, add an exclamation mark after the brackets (e.g., `type[id]!:`) and include "BREAKING CHANGE:" in the body
- Do not stage files that contain secrets (.env, credentials, etc.)
- Prefer staging specific files over `git add -A` or `git add .`
