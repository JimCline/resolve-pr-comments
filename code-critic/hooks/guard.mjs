#!/usr/bin/env node
// code-critic PreToolUse guard.
//
// Enforces the hard invariant for the DURATION of a code-critic review: the
// high-reasoning MAIN agent must never touch GitHub or run outbound/mutating git.
// Every such action is delegated to the `critic-worker` Haiku subagent.
//
// Mechanism: exit code 2 + a stderr message BLOCKS the tool call and feeds the
// message back to the model as feedback (per the Claude Code hooks reference).
//
// Scope: the guard is inert unless a sentinel marker exists (written by the
// /code-critic command at step 0, removed on every exit path). The marker lives
// at `<cwd>/.git/code-critic.lock`. A freshness guard ignores a marker older than
// MAX_AGE_MS so a crashed run can't silently block unrelated future sessions.

import { readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const MAX_AGE_MS = 8 * 60 * 60 * 1000; // 8h — bounds a stale-marker footgun.

function readInput() {
  try {
    return JSON.parse(readFileSync(0, 'utf8') || '{}');
  } catch {
    return {};
  }
}

function markerActive(cwd) {
  try {
    const st = statSync(join(cwd || process.cwd(), '.git', 'code-critic.lock'));
    return Date.now() - st.mtimeMs < MAX_AGE_MS;
  } catch {
    return false; // no marker (or unreadable) → guard inert.
  }
}

const input = readInput();

// Subagents (critic-worker carries agent_id) ARE the delegate — always allow.
if (input.agent_id) process.exit(0);

// Guard is inert outside an active review.
if (!markerActive(input.cwd)) process.exit(0);

const tool = input.tool_name || '';
const cmd = (input.tool_input && input.tool_input.command) || '';

// Any GitHub MCP call from the main agent is forbidden during a review.
const isGithubMcp = /^mcp__github__/.test(tool);

// Outbound / mutating git+gh from the main agent must be delegated. Read-only
// git (diff/log/status/show) stays allowed so the main agent can still orient.
const isOutboundBash =
  tool === 'Bash' &&
  /(^|[\s;&|(])(gh(\s|$)|git\s+(push|commit|worktree|fetch|pull)\b)/.test(cmd);

if (isGithubMcp || isOutboundBash) {
  const what = tool === 'Bash' ? `\`${cmd}\`` : tool;
  process.stderr.write(
    'code-critic guard: the main agent must not run GitHub or outbound-git actions ' +
      'during a review. Delegate this to the `critic-worker` Haiku subagent via the ' +
      'Task tool — worktree checkout, PR diff, posting review comments, and any ' +
      `commit/push all go through the worker. Blocked: ${what}`
  );
  process.exit(2);
}

process.exit(0);
