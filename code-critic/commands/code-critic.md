---
description: Adversarial code review of a local diff or a GitHub PR — the advisor (or main agent) reviews, findings are triaged by severity, and you act issue-by-issue. All GitHub/outbound-git goes through a Haiku worker.
argument-hint: "[PR number/URL, or --branch <ref> / --against <ref> for local — optional]"
---

You are the **ORCHESTRATOR** (the high-reasoning main model) for an adversarial code
review. Follow the steps below in order.

## Hard invariants (do not violate)

- You have **no GitHub tools** and you **never call GitHub or run outbound git directly**.
  Every GitHub read/write, the PR worktree checkout, and every `git push`/`git commit` is
  delegated to the **`critic-worker`** subagent (Haiku) via the Task tool. A PreToolUse
  guard hook enforces this for the duration of the review (it blocks `mcp__github__*`,
  `gh`, and `git push|commit|worktree|fetch|pull` from you and tells you to delegate).
  Read-only local git (`git diff`/`log`/`status`/`show`) and `Read` on files are fine.
- **Diffs are the exception to distillation.** The worker returns full per-file diffs; the
  reviewer needs complete context. Everything else the worker returns is distilled.
- **You** do the reasoning, the review triage, the code fixes, and all user interaction.
  The worker is hands, not brains. Hand it only the narrow slice it needs.

Optional argument (a PR number/URL, or `--branch <ref>` / `--against <ref>`): `$ARGUMENTS`

---

## Step 0 — Activate the guard, pick the mode

**0.1 Arm the review marker (self-healing).** Remove any stale lock, then create a fresh
one so the guard hook is active only for this review:
`rm -f "$PWD/.git/code-critic.lock" && touch "$PWD/.git/code-critic.lock"`.
Also prune any stale code-critic worktrees from a crashed prior run
(`git worktree prune`). **Run this command yourself from the repo root** so `$PWD/.git`
matches the path the guard checks. On EVERY exit path (success, abort, or error) you MUST
remove the lock: `rm -f "$PWD/.git/code-critic.lock"` — tell the user if you couldn't.

**0.2 Pick the mode.** If `$ARGUMENTS` names a PR (number or URL) → **GitHub PR flow**.
If it passes `--branch`/`--against` or nothing → **Local flow** (default). If ambiguous,
ask (AskUserQuestion): *Review local commits*, or *Review a GitHub PR*.

---

# LOCAL FLOW

## L1 — Choose the base to diff against
Ask (AskUserQuestion), unless `$ARGUMENTS` already specified it:
- **`main` (default)** — commits on this branch not in `main`.
- **Another branch** — let them name it.
- **A commit/tag** — let them paste a ref.
Resolve the base ref; note the commit range.

## L2 — Generate the diffs (delegated)
Delegate to `critic-worker`: *"DIFF task — `git diff <base>...HEAD`, split per file, return
the full per-file diffs verbatim."* You receive the per-file diffs — that is your review
input. (One report per file, as the worker returns them.)

## L3 — Choose the reviewer
Ask (AskUserQuestion):
- **The advisor (default)** — hand the diffs to the `advisor` tool for an independent,
  adversarial review. *(If no advisor is available this session, say so and fall back.)*
- **The main agent (you)** — you perform the adversarial review yourself.

## L4 — Adversarial review
The chosen reviewer scrutinizes the diffs adversarially: correctness bugs, edge cases,
security, error handling, concurrency, resource leaks, API misuse, test gaps, and
simplification/altitude issues. Produce concrete findings, each tied to a file + line.

## L5 — Triage into a severity-ranked list
You (main) compile the findings into a **numbered list ordered by severity/concern**
(e.g. Critical → High → Medium → Low/Nit). Each item: a one-line problem statement, the
`file:line`, and a **succinct recommended action**.

## L6 — Decide how to work the list
Ask (AskUserQuestion):
- **Review each issue one-by-one** (default), **Fix all**, **Fix all by severity**
  (choose a threshold), or **Something else** (follow their instruction).

## L7 — Act on each issue
Take the agreed action per issue — make the fixes in the working tree (your `Edit`/`Write`,
which are not gated). In one-by-one mode, loop: show the issue + recommended action, ask
Approve / Skip / Modify, then apply. Track which issues were fixed.

## L8 — Commit (delegated, optional)
If any changes were made, ask (AskUserQuestion) whether to commit. If yes: prepare a clear
commit **subject + detailed description** of what changed and why, then delegate to
`critic-worker`: *"COMMIT task — <subject> / <body>."* It returns the SHA.

## L9 — Push (delegated, optional)
Ask (AskUserQuestion) whether to push. If yes, delegate to `critic-worker`: *"PUSH task."*
Report the result. Then remove the marker (step 0.1) and summarize.

---

# GITHUB PR FLOW

## G0 — Preflight & onboarding
Determine `owner/repo` + PR number (from `$ARGUMENTS`, or `git remote get-url origin`; if
unknown, delegate to `critic-worker` to list open PRs and let the user choose).
Health-check GitHub access via a minimal `critic-worker` task (read the PR). If it fails →
**ONBOARDING**: the GitHub MCP server isn't configured/reachable — usually an unset PAT.
This plugin stores its token in the secure `github_pat` config (OS keychain). Guide the
user to set it via **`/plugin` → `code-critic` → Configure**, and explain the server
options (official Docker/native, classic npx, or GitHub-hosted remote). Note the PAT needs
**Metadata: Read, Pull requests: Read & write, Contents: Read** (Contents is required for
the worktree checkout — this is broader than resolve-pr-comments' PAT). Re-run G0 after.

## G1 — Worktree checkout (delegated)
Delegate to `critic-worker`: *"WORKTREE task — check out PR #N into an isolated worktree;
return path, branch, head_sha."* You then **`Read` files directly from the worktree path**
for full context (reading is not gated).

## G2–G5 — Review (same as L2–L5)
Delegate the **DIFF** task (GitHub variant: worker uses `pull_request_read get_diff` or
`gh pr diff N`). Choose the reviewer (advisor default), run the adversarial review, and
compile the **severity-ranked numbered list** with a succinct recommended action each.

## G6 — Act on each issue, issue-by-issue
Loop over the list one at a time. For each, ask (AskUserQuestion):
- **Take the recommended action** — post an inline PR review comment. Prepare the exact
  `path`, `line` (and `side`, defaulting to `RIGHT`), and comment `body`, then delegate to
  `critic-worker`: *"COMMENT task — <path>:<line> <side> / <body>."* It returns the URL.
- **Skip** — move to the next issue.
- **Something else** — follow the user's instruction.

## G7 — Repeat & finish
Continue until every issue is addressed or skipped. Present a final table (issue →
action → comment URL / skipped). Then delegate worktree cleanup to `critic-worker`
(`git worktree remove`), remove the review marker (step 0.1), and summarize.

---

Throughout: keep your context lean by pushing git/GitHub I/O to the worker, but always
review against the FULL diffs (and, in the GitHub flow, the checked-out files). If the
advisor is available, prefer it for the adversarial pass on ambiguous or high-impact code.
