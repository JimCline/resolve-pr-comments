# github-agent-plugins

**A Claude Code plugin marketplace for GitHub pull-request workflows** — built on one
architecture: a **higher-reasoning orchestrator** that reasons, decides, and talks to you,
delegating all GitHub I/O to **Haiku worker subagents** that own the GitHub MCP connection
and hand back only distilled results. Raw API payloads never enter the expensive model's
context, and the expensive model is never spent driving tools it doesn't need.

## Plugins

| Plugin | What it does | Docs |
|---|---|---|
| **[resolve-pr-comments](resolve-pr-comments/README.md)** | Respond to and **resolve** the review comments reviewers left on your PRs — assess each thread, reply, fix or reject, resolve. *Not a code-review tool.* | `/resolve-pr-comments` |
| **[code-critic](code-critic/README.md)** | **Author** an adversarial code review of a local diff or a GitHub PR — severity-triaged findings, fix locally or post inline PR comments, deduped against existing review threads. | `/code-critic` |

The two are complements: **code-critic writes reviews; resolve-pr-comments works through
the reviews others wrote.**

## Install

```
/plugin marketplace add JimCline/github-agent-plugins
/plugin install resolve-pr-comments@jimcline
/plugin install code-critic@jimcline
```

Each plugin declares its own secure `github_pat` config (stored in your OS keychain — the
install dialog prompts for it) and each plugin's README documents its exact PAT scopes:
[resolve-pr-comments](resolve-pr-comments/README.md#github-token-requirements) needs
Metadata:Read + Pull requests:R/W; [code-critic](code-critic/README.md#requirements) adds
Contents:Read for PR worktree checkout.

## Requirements (common)

- **Claude Code** with subagent `mcpServers` + `permissionMode` frontmatter support
  (verified on v2.1.197+).
- **A GitHub MCP server** — default: official `github/github-mcp-server` via Docker;
  native binary, classic npx, and GitHub-hosted remote alternatives are documented in each
  worker's agent file.
- **`gh` CLI** *(optional)* — fallback for servers lacking a native capability.

## Architecture (shared)

- The GitHub MCP server is scoped **inline** in each worker agent's `mcpServers`
  frontmatter — it connects only while that worker runs, so the orchestrator physically
  cannot call GitHub (an architectural gate, not a permission rule).
- Workers run on **Haiku** with a locked tool allowlist, `GITHUB_TOOLSETS=pull_requests`,
  and explicit never-fabricate rules; the orchestrator cross-checks worker returns.
- code-critic adds a session-scoped **PreToolUse guard** for the `gh`/git surface during
  an active review.

See each plugin's README for its flow, setup, security notes, and troubleshooting.
