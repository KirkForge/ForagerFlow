# REPORULES — Multi-Machine Repository Discipline

Two machines. Same repos. No drift. No lost work.

## Machine Roles

| Machine | Role | Path |
|---------|------|------|
| **This machine** | Development + local benchmark | `<project-root>/` |
| **.225 machine** | Codex-driven development | `~/Madlab/` (or equivalent) |

## The Golden Rule

**GitHub is the source of truth. Always.** Never have work on one machine that isn't pushed. Before switching machines:

```sh
# On the machine you're leaving:
cd <project-root>/<repo>
git add -A && git commit -m "wip: save point" && git push

# On the machine you're arriving at:
cd <project-root>/<repo>
git pull
```

## Repo Layout

Every KirkForge repo lives in the project root directory:

```
<project-root>/
├── REPORULES.md              ← this file
├── PicoSentry/               → github.com/KirkForge/PicoSentry
├── PicoDome/                 → github.com/KirkForge/PicoDome
├── PicoWatch/                → github.com/KirkForge/PicoWatch
├── PicoShogun/               → github.com/KirkForge/PicoShogun
├── ForagerFlow/              → github.com/KirkForge/ForagerFlow
├── Dopaflow/                 → github.com/KirkForge/Dopaflow
├── Sword-jin_PWA/            → github.com/KirkForge/Sword-jin_PWA
├── MCP/                      → github.com/KirkForge/MCP
├── browser-integration-llm/  → github.com/KirkForge/Browser_integration_llm
├── pet-wifi-sense/           → github.com/KirkForge/PetSense
└── KirkForge/                → github.com/KirkForge/KirkForge (profile)
```

## No Sandbox Divergence

The sandbox directory is for **runtime only** — benchmarks, Docker, npm install artifacts. Never edit source code there. If you need to test changes:

1. Edit in project root
2. Sync to sandbox: `rsync -av --exclude node_modules --exclude .git <repo>/ sandbox/<repo>/`
3. Test in sandbox
4. Commit from project root

Or use the sync script: `scripts/sync-to-sandbox.sh`

## Git Identity

Set this on every machine before committing:

```sh
git config --global user.name "YOUR REAL NAME"
git config --global user.email "your@real.email"
```

**Never use "KirkForge" as the author name.** That's an org, not a person.

Commit format:
```
type(scope): what changed

Optional body with details.
```

Types: `feat`, `fix`, `docs`, `refactor`, `test`, `chore`, `wip`

## Before Every Session

```sh
cd <project-root>
for repo in */; do
  cd "$repo" && git pull && cd ..
done
```

## After Every Session

```sh
cd <project-root>/<repo>
git add -A && git status --short
git commit -m "..."  # meaningful message
git push
```

## Auth

GitHub PAT is stored securely. Use it for HTTPS auth. Never hardcode the PAT in scripts.

## Codex Agent Instructions

When working with a Codex agent, point it at the project root:

```
Work in <project-root>/<repo>.
Always commit and push before ending the session.
Read REPORULES.md at the start of every session.
```

## New Repo Bootstrap

```sh
# On GitHub: create repo (do NOT add README/.gitignore — use existing)
cd <project-root>/<project>
git init
git add -A
git commit -m "Initial commit"
git remote add origin <repo-url>
git push -u origin master
```

## Git Identity — Set Once On Every Machine

```sh
git config --global user.name "Henrik Kirk"
git config --global user.email "285947470+KirkForge@users.noreply.github.com"
```

- **Public commits:** `285947470+KirkForge@users.noreply.github.com` (GitHub no-reply)
- **Private email (never in commits):** `henriktkirk@proton.me`
- **Never use:** `KirkForge` as author name (that's the org, not a person)
- **Never use:** `kirk@kirkforge.dev` or any other email

Commit format: `type(scope): what changed`
Types: `feat`, `fix`, `docs`, `refactor`, `test`, `chore`, `wip`

## GitHub Repo Defaults — ALWAYS Apply

- **Visibility**: New repos must be **private** unless explicitly requested otherwise. Never default to public.
- **Author**: All commits use `Henrik Kirk <285947470+KirkForge@users.noreply.github.com>`
- **Never commit**: `.env` files, PATs, tokens, API keys, or any file with credentials
- **Pre-push CI**: Every repo gets `ci-cleandev` hooks (build → lint → test → trufflehog)
