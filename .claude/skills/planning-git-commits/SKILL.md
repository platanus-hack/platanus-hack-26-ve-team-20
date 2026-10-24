---
name: planning-git-commits
id: 5a71d5fc9c69c269
description: Creates a commit plan with conventional commits based on file paths. Use when the user wants to push or commit changes to git.
id: 508488c5515645f2
author: Daniel Montilla
version: 1.2.0
license: MIT
dependencies:
  - executing-skills
groups:
  - git
  - workflow
---

# When To Use

Use when the user asks to commit, push, or stage changes to git.

> **Prerequisite**: Load the [executing-skills](../executing-skills/SKILL.md) skill before running this pipeline. It governs how skills are loaded, executed, and verified.

# Pipeline

## 0. Check Repository State

Before planning, run `git status --porcelain` and validate:

- **Merge conflicts**: If any files show `UU` status (unmerged), abort and tell the user to resolve conflicts before committing.
- **Detached HEAD**: If `git symbolic-ref -q HEAD` fails (detached HEAD), warn the user and confirm before proceeding.
- **Staged changes outside plan**: Check `git diff --cached --stat`. If pre-existing staged changes exist, warn the user and unstage them with `git restore --staged .` to avoid including unintended changes.
- **No changes**: If there are no changes (tracked, untracked, or staged), inform the user and stop.

## 1. Identify Files

If the user didn't specify which files to commit, ask which files should be included. Accept file paths, directories, or patterns.

## 2. Create Plan

Analyze the specified files and group them by:
- Package or app they belong to (for conventional commit scope)
- Logical grouping of related changes

### Commit Message Format

Use conventional commits with scope in parentheses derived from file paths:

| Type | Format | Example |
|------|--------|---------|
| Feature | `feat(scope): message` | `feat(web): add new component` |
| Fix | `fix(scope): message` | `fix(api): resolve endpoint error` |
| Chore | `chore(scope): message` | `chore(db): add migration` |
| Docs | `docs(scope): message` | `docs: update README` |
| Refactor | `refactor(scope): message` | `refactor(core): extract helper` |
| Test | `test(scope): message` | `test(api): add unit tests` |
| Style | `style(scope): message` | `style(web): format code` |
| Perf | `perf(scope): message` | `perf(db): optimize query` |
| Build | `build(scope): message` | `build(deps): upgrade effect` |
| CI | `ci(scope): message` | `ci: update workflow` |

Derive scope from file paths using these rules:

1. **Workspace directory**: If the path is inside a workspace package (per the root manifest's workspace globs, e.g. `package.json` `workspaces`: `libs/*`, `apps/*`, `services/*`, …), use the package's directory name as the scope. Example: `libs/logger/src/index.ts` → `logger`, `apps/web/pages/index.tsx` → `web`.
2. **Top-level directory**: For files not under a recognized prefix, use the top-level directory name. Example: `.github/workflows/ci.yml` → `ci`, `docs/architecture.md` → `docs`.
3. **Root files**: Files at the repository root (e.g., `turbo.json`, `package.json`, `README.md`) get no scope.
4. **Multiple scopes in one commit group**: If grouped files span multiple scopes, use the most common scope or no scope if evenly split.

### Message Quality

The commit message after the colon must be an imperative, present-tense description of what the change does (e.g., `add input validation`, not `added validation` or `fix`). Minimum 3 words, maximum 72 characters for the subject line.

### Breaking Changes

If a commit includes a breaking API or behavioral change, append `!` after the scope (e.g., `feat(api)!: drop v1 endpoint`). Optionally include a `BREAKING CHANGE:` footer describing the migration path.

## 3. Present Plan

Show the plan in this format:

```
## Commit Plan

### Commit 1: feat(api): add input validation
**Files:**
- packages/api/src/validators/input.ts
- packages/api/src/routes/validate.ts

### Commit 2: fix(web): correct button alignment
**Files:**
- apps/web/components/button.tsx
- apps/web/styles/button.css
```

Keep each commit focused on a single logical change. Large commits should be split and the user asked for approval.

Then ask for confirmation.

## 4. Execute After Confirmation

Wait for explicit user approval ("yes", "go ahead", "execute", "do it") before running git commands.

### Stage Files

Stage only the files from the plan using `git add -- <file1> <file2>`:
- The `--` separator prevents file paths from being interpreted as options.
- This handles both modified tracked files and new untracked files.
- Do NOT use `git add .` or `git add -A` as they would include changes not in the plan.

### Commit

Run `git commit -m '<subject>'` for single-line messages or `git commit -m '<subject>' -m '<body>'` for multi-line messages. Ensure the message is properly shell-escaped to prevent injection. Do NOT open an interactive editor — always use the `-m` flag.

### Error Handling

- If `git commit` fails (e.g., pre-commit hook rejects it, linter fails), report the full error output to the user, show current `git status`, and ask how to proceed. Do NOT retry automatically.
- If a pre-commit hook modifies files, the user may need to re-stage those changes before retrying.

## 5. Push (Optional)

After a successful commit, ask the user if they want to push — unless the caller said not to offer a push (e.g. `executing-feature-spec` pushes once at the end; `executing-feature-spec-autonomously` never pushes). If yes:

1. Determine the remote and branch: run `git rev-parse --abbrev-ref @{upstream}` to get the upstream tracking branch. If no upstream is configured, default to `origin` and the current branch name from `git rev-parse --abbrev-ref HEAD`.
2. Confirm with the user before pushing, especially if the remote is shared.
3. Run `git push <remote> <branch>`.
4. If push fails (diverged history, rejected, auth failure), report the error output and ask the user how to proceed. Do NOT force-push without explicit user consent.

# Rules

- NEVER commit without explicit user confirmation
- NEVER amend pushed commits
- NEVER use `--author` flag or `Co-authored-by` trailers
- Group files logically with descriptive messages
- Always use conventional commit format with appropriate scope
- Use `git add -- <file>` with the `--` separator to prevent path injection — never interpolate paths unsafely into shell commands
- Always stage files explicitly from the plan — never use wildcard `git add .` or `git add -A`
- On commit failure, report the error and ask the user — never retry automatically
- Use `git commit -m` with the `-m` flag to supply the message — never open an interactive editor
- On successful commit, ask the user if they want to push the changes before exiting, unless the caller said not to offer a push
