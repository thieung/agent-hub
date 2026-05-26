# ClaudeKit Hooks For Codex

## `fix-claudekit-hooks-for-codex.mjs`

Repairs ClaudeKit-generated hooks after they are ported from Claude Code hooks
to Codex hooks.

The fixer handles both scopes:

```bash
# Global Codex hooks: ~/.codex/hooks.json and ~/.codex/hooks
node scripts/claudekit-hooks-for-codex/fix-claudekit-hooks-for-codex.mjs --global

# Project Codex hooks: <project>/.codex/hooks.json and <project>/.codex/hooks
node scripts/claudekit-hooks-for-codex/fix-claudekit-hooks-for-codex.mjs --project --project-dir /path/to/project

# Check without writing
node scripts/claudekit-hooks-for-codex/fix-claudekit-hooks-for-codex.mjs --project --dry-run
```

What it fixes:

- Removes missing or duplicate hook commands from `hooks.json`.
- Scrubs unsupported `permissionDecision: "allow"` output.
- Keeps valid `permissionDecision: "deny"` block output.
- Emits `{}` for successful allow-through hook paths where Codex expects JSON.
- Patches `descriptive-name.cjs` allow-through output.
- Patches `scout-block/pattern-matcher.cjs` so current-directory path `.` is not treated as a blockable path.
