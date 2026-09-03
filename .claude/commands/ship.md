---
description: Verify, commit and push finished development work to main with a proper description
---

Ship the current working tree: verify it, split it into coherent commits, write real
commit messages, and push. Follow every step in order — do not skip verification
because the change "looks small".

## 1. Survey

```
git status --short
git log --oneline -5
git remote -v && git rev-parse --abbrev-ref HEAD
```

Read the actual diff of what changed (`git diff`, `git diff --cached`). You are
writing a description of this work, so you need to know what it does — never
describe a change you have not read.

## 2. Regenerate before verifying

If anything under `convex/` changed:

```
npx convex codegen
```

`convex/_generated/api.d.ts` is committed, so it must match the functions being
shipped. A stale generated file breaks the build for whoever pulls next.

## 3. Verify — all three must pass

```
npx tsc --noEmit
npx eslint <the files you changed>
npx next build
```

Lint only the changed files: the repo has pre-existing warnings elsewhere, and a
full-repo lint buries real problems in noise. If any of the three fails, **fix it
and re-run.** Never commit knowing the build is broken; never disable a rule to get
a green result.

## 4. Group into commits

Look for distinct work streams in the tree — unrelated features, someone else's
in-progress work, a refactor that happened alongside a fix. **One commit per
coherent change.**

If the tree mixes work streams:
- Say so, list what belongs to each, and ask before combining them into one commit.
- Never push someone's unfinished work without asking first.
- When a shared file (`convex/schema.ts`, `convex/_generated/api.d.ts`) carries
  changes from two streams, split it: write an intermediate version for the first
  commit, then restore the full version for the second. Keep a backup copy in the
  scratchpad first, and re-run `npx tsc --noEmit` after restoring to confirm the
  tree came back intact.

## 5. Write the message

Conventional Commits, scoped to the area (`feat(pos):`, `fix(auth):`,
`refactor(convex):`, `docs:`, `chore:`).

- Subject: imperative, under ~72 chars, says what changed — not "update files".
- Body: what it does and **why**, grouped under short headings when the change is
  large. Name the functions, tables and files a reviewer will look for.
- Call out anything with operational consequences: new environment variables,
  schema migrations, rollout order, manual setup steps.
- If you fixed a security issue, say plainly what was exposed and what closed it.

Pass the message via a heredoc (`git commit --file=-`) so formatting survives.

End every commit message with:

```
Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
```

## 6. Push

```
git push origin main
```

This project commits directly to `main`. Before pushing, confirm nothing sensitive
is staged — `.env*`, keys, tokens, or a real `CLERK_SECRET_KEY` in a committed
file. If you find one, stop and tell the user rather than pushing.

## 7. Report

Give the user:
- The pushed range (`0f6ced1..b4b85db`) and one line per commit.
- Any manual step the deploy needs — environment variables to set on the **Convex
  deployment**, accounts to create, a flag to flip and in what order.
- Anything you deliberately left out of the push, and why.

Report failures honestly. If a verification step failed and you worked around it,
say so explicitly instead of reporting a clean ship.
