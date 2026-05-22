# AGENTS.md — ForagerFlow

## ⚠️ Mandatory Rules — Read Before Editing

- **Never commit**: `node_modules/`, `.venv/`, `venv/`, `__pycache__/`, `*.pyc`, `dist/`, `build/`, `.next/`, `coverage/`, `.mypy_cache/`, `.pytest_cache/`, `.ruff_cache/`, `.tox/`, `.DS_Store`, `*.log`, `.env`, `*.pem`, `*.key`
- **Always pull before work, push after work**
- **Git identity**: `Henrik Kirk <285947470+KirkForge@users.noreply.github.com>`
- **Commit format**: `type(scope): message` — feat, fix, docs, refactor, test, chore, wip
- **Pre-push CI**: `ci-cleandev` hooks block pushes on failure. Fix, don't bypass.

## Node Project Rules

- Package manager: **pnpm** — always use `pnpm run` for scripts, `pnpm ci` or `pnpm install --frozen-lockfile` for installs
- Prefer `test:ci` over `test` if available (avoids watch mode)
- Never run `npm install` without a lockfile present
- Run `typecheck` before `build` if the script exists

## Before Editing

1. `git pull`
2. Check `.gitignore` — don't stage ignored files
3. Check this file for project-specific rules

## Before Committing

1. `git status --short` — review staged files
2. No secrets, no generated files, no cache directories
3. `git diff --cached` — verify actual content
4. Let pre-push CI pass before pushing
