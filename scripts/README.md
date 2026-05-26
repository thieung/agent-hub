# Scripts

Reusable agent-maintenance scripts live in their own folders so new scripts can
be added without mixing docs, fixtures, and helper files.

## Catalog

| Folder | Purpose |
| --- | --- |
| [`claudekit-hooks-for-codex`](./claudekit-hooks-for-codex/) | Detect and fix ClaudeKit-generated hooks after they are ported from Claude Code hooks to Codex hooks. |

## Conventions

- Put each script family in its own folder.
- Keep a folder-level `README.md` with root cause, usage, and modes.
- Prefer detect/check mode before any script writes changes.
