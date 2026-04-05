# Codex Working Preferences

## Default Workflow
- Prefer a terminal-first workflow for discovery, verification, and debugging.
- On Windows, use PowerShell and `rg` instead of assuming `bash`.
- Be practical and fast on straightforward tasks: inspect, patch, verify.
- Default to making the change when the request is clear instead of stopping to propose a long plan.

## Editing Style
- Keep the edit loop tight: read only the files needed, make focused patches, then verify.
- Prefer small incremental edits over large speculative rewrites.
- Minimize routine narration during simple file edits; provide concise progress updates for substantial work.
- Preserve existing patterns in the codebase unless there is a clear reason to improve them.

## Shell Preferences
- Prefer `rg` and concise shell commands for search and repo exploration.
- Use shell commands freely for inspection, diffs, formatting, and tests.
- When investigating an issue, verify assumptions with commands before making broad code changes.

## Safety Rails
- Do not overwrite or revert user changes unless explicitly asked.
- Use structured file edits when required by the environment, but keep the workflow fast and incremental.
- Ask before making changes with non-obvious product or architectural tradeoffs.

## Response Style
- Keep answers concise and execution-oriented.
- Summarize what changed, what was verified, and any remaining risk.
- Avoid over-explaining obvious implementation steps unless asked.
