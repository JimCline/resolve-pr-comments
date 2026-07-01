---
name: pr-comments
description: >-
  Resolve unresolved GitHub pull-request review comments by delegating ALL GitHub work to
  Haiku github-worker subagents while the main model reasons and drives issue-by-issue
  approval. Use when the user wants to address, triage, respond to, work through, or
  resolve PR review comments / review threads / reviewer feedback; reply to reviewers;
  clear unresolved conversations on a pull request; or "handle the comments on PR N".
---

# Resolve PR review comments

This runs the exact same flow as the `/resolve-pr-comments` command — trigger it whenever
the user wants to work through a pull request's unresolved review comments, whether or not
they type the slash command.

## Hard invariant (never violate)

You (the main model) have **no GitHub tools** and never call GitHub directly. Every GitHub
read and write is delegated to the **`github-worker`** subagent (Haiku), which owns the
GitHub MCP connection (plus a `gh` CLI fallback). Workers return only distilled data — you
hold summaries, never raw API payloads. You do the reasoning, the code fixes, the
commits/pushes, and all user interaction; workers are hands, not brains.

## How to run

Execute the full, authoritative procedure in this plugin's command file:
**`${CLAUDE_PLUGIN_ROOT}/commands/resolve-pr-comments.md`** — read it and follow every step
in order. That file is the single source of truth for the flow; do not improvise past it.

If you cannot read that file, follow this outline (same steps):

0. **Preflight** — determine the PR source (ask; default = this repo's GitHub remote).
   Health-check GitHub access via a `github-worker`; if it fails, onboard the user through
   GitHub MCP server setup (PAT + server choice). Check `gh auth status` for the fallback.
1–3. **Fetch** — delegate to `github-worker`: return unresolved review threads packaged
   succinctly (`thread_id`, `comment_id`, `path`/`line`, author, body, replies, a short
   code hunk, permalink). Official server: `pull_request_read` `method: get_review_comments`
   exposes threads with `isResolved` + `threadId` natively.
4. **Assess** — per thread decide fix / reject / discuss. If an advisor is available,
   recommend consulting it on ambiguous or high-impact items.
5. **Decide with the user** — issue-by-issue Approve / Deny / Discuss, plus an
   "auto-address all" option. Decide only; post nothing yet.
6. **Implement** — make approved fixes, commit, push, run tests; then confirm the user is
   ready to apply the GitHub actions.
7. **Apply (delegated)** — on approval, fan out `github-worker`s to reply in-thread with
   the resolution and resolve each thread.
8. **Report** — collect succinct worker reports; present a per-thread outcome table; offer
   to retry any failures.
