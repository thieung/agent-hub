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

## Root Cause

ClaudeKit hooks were originally authored for Claude Code's hook runtime. When
they are migrated into the Codex ecosystem, the hook files may still carry
Claude-oriented output and module assumptions that Codex does not accept.

The most common failure is an allow-through hook returning an explicit
`permissionDecision: "allow"`, sometimes nested inside `hookSpecificOutput`.
Codex expects allow-through paths to omit the decision and emit empty JSON such
as `{}` when JSON output is required. In this Codex path, `permissionDecision`
should only be used for actual blocks, with value `"deny"`.

Other migration leftovers can also break hooks:

- `hooks.json` can keep stale commands that point to removed Claude hook files.
- Generated wrappers can scrub only top-level fields while nested hook output
  still leaks unsupported allow decisions.
- `.mjs` wrappers can fail if migrated code still uses CommonJS `require`.
- Scout path matching can warn or block incorrectly for current-directory path
  `.` if the ported matcher treats it as a normal blockable path.

What it fixes:

- Removes missing or duplicate hook commands from `hooks.json`.
- Scrubs unsupported `permissionDecision: "allow"` output.
- Keeps valid `permissionDecision: "deny"` block output.
- Emits `{}` for successful allow-through hook paths where Codex expects JSON.
- Patches `descriptive-name.cjs` allow-through output.
- Patches `scout-block/pattern-matcher.cjs` so current-directory path `.` is not treated as a blockable path.
