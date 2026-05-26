# Agent Hub

Shared utilities for maintaining agent workflows, migrations, and local
developer tooling.

## Layout

| Path | Purpose |
| --- | --- |
| [`scripts/`](./scripts/) | Reusable maintenance scripts, grouped by task. |

## Current Scripts

| Script | Purpose |
| --- | --- |
| [`claudekit-hooks-for-codex`](./scripts/claudekit-hooks-for-codex/) | Detect and fix ClaudeKit hooks after migration from Claude Code hooks to Codex hooks. |

## Quick Start

Detect hook migration issues before writing changes:

```bash
node scripts/claudekit-hooks-for-codex/fix-claudekit-hooks-for-codex.mjs --detect --project --project-dir /path/to/project
```

Apply fixes after review:

```bash
node scripts/claudekit-hooks-for-codex/fix-claudekit-hooks-for-codex.mjs --fix --project --project-dir /path/to/project
```

