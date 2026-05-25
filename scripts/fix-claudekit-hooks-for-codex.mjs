#!/usr/bin/env node
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const TOOL_NAME = "fix-claudekit-hooks-for-codex";
const SCRIPT_EXTENSIONS = /\.(?:cjs|mjs|js)$/;

const args = parseArgs(process.argv.slice(2));
const stamp = new Date().toISOString().replace(/[:.]/g, "-");
const allChanges = [];

function usage() {
  return `Usage:
  ${TOOL_NAME} [--scope global|project|all|auto] [--dry-run]
  ${TOOL_NAME} --global
  ${TOOL_NAME} --project [--project-dir /path/to/repo]

Purpose:
  Fix ClaudeKit-generated hooks so they work properly on Codex after being
  ported from Claude Code hooks.

Scopes:
  global   Fix CODEX_HOME hooks, default: ~/.codex
  project  Fix project hooks, default: <cwd>/.codex
  all      Fix both global and project hooks
  auto     Prefer project scope when .codex hooks exist, else global

Options:
  --codex-home <path>   Override global Codex home
  --project-dir <path>  Override project directory for project scope
  --dry-run             Report changes without writing
  --help                Show this help
`;
}

function parseArgs(argv) {
  const parsed = {
    scope: "global",
    dryRun: false,
    codexHome: process.env.CODEX_HOME || path.join(os.homedir(), ".codex"),
    projectDir: process.cwd(),
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === "--help" || arg === "-h") {
      parsed.help = true;
      continue;
    }
    if (arg === "--dry-run") {
      parsed.dryRun = true;
      continue;
    }
    if (arg === "--global") {
      parsed.scope = "global";
      continue;
    }
    if (arg === "--project") {
      parsed.scope = "project";
      continue;
    }
    if (arg === "--all") {
      parsed.scope = "all";
      continue;
    }
    if (arg === "--scope") {
      const value = argv[index + 1];
      if (!value) throw new Error("--scope requires a value");
      parsed.scope = value;
      index += 1;
      continue;
    }
    if (arg.startsWith("--scope=")) {
      parsed.scope = arg.slice("--scope=".length);
      continue;
    }
    if (arg === "--codex-home") {
      const value = argv[index + 1];
      if (!value) throw new Error("--codex-home requires a value");
      parsed.codexHome = value;
      index += 1;
      continue;
    }
    if (arg.startsWith("--codex-home=")) {
      parsed.codexHome = arg.slice("--codex-home=".length);
      continue;
    }
    if (arg === "--project-dir") {
      const value = argv[index + 1];
      if (!value) throw new Error("--project-dir requires a value");
      parsed.projectDir = value;
      index += 1;
      continue;
    }
    if (arg.startsWith("--project-dir=")) {
      parsed.projectDir = arg.slice("--project-dir=".length);
      continue;
    }

    throw new Error(`Unknown argument: ${arg}`);
  }

  if (!["global", "project", "all", "auto"].includes(parsed.scope)) {
    throw new Error(`Unsupported scope: ${parsed.scope}`);
  }

  parsed.codexHome = path.resolve(expandHome(parsed.codexHome));
  parsed.projectDir = path.resolve(expandHome(parsed.projectDir));
  return parsed;
}

function readText(filePath) {
  return fs.readFileSync(filePath, "utf8");
}

function backupFile(filePath) {
  if (args.dryRun || !fs.existsSync(filePath)) return;
  fs.copyFileSync(filePath, `${filePath}.${stamp}.bak`);
}

function writeIfChanged(target, filePath, nextContent, reason) {
  const current = readText(filePath);
  if (current === nextContent) return false;
  backupFile(filePath);
  if (!args.dryRun) fs.writeFileSync(filePath, nextContent);
  recordChange(target, filePath, reason);
  return true;
}

function recordChange(target, filePath, reason) {
  allChanges.push({
    scope: target.scope,
    file: filePath,
    reason,
  });
}

function expandHome(value) {
  if (value === "~") return os.homedir();
  if (value.startsWith("~/")) return path.join(os.homedir(), value.slice(2));
  return value;
}

function scriptPathsFromCommand(command) {
  const matches = [];
  const pattern = /"([^"]+\.(?:cjs|mjs|js))"|'([^']+\.(?:cjs|mjs|js))'|(\S+\.(?:cjs|mjs|js))/g;
  for (const match of command.matchAll(pattern)) {
    matches.push(expandHome(match[1] || match[2] || match[3]));
  }
  return matches;
}

function globalTarget() {
  return {
    scope: "global",
    rootDir: args.codexHome,
    hooksJsonPath: path.join(args.codexHome, "hooks.json"),
    hooksDir: path.join(args.codexHome, "hooks"),
  };
}

function projectTarget() {
  const codexDir = path.join(args.projectDir, ".codex");
  return {
    scope: "project",
    rootDir: codexDir,
    hooksJsonPath: path.join(codexDir, "hooks.json"),
    hooksDir: path.join(codexDir, "hooks"),
  };
}

function targetExists(target) {
  return fs.existsSync(target.hooksJsonPath) || fs.existsSync(target.hooksDir);
}

function resolveTargets() {
  const global = globalTarget();
  const project = projectTarget();

  if (args.scope === "global") return [global];
  if (args.scope === "project") return [project];
  if (args.scope === "all") return [global, project];

  return targetExists(project) ? [project] : [global];
}

function loadHooksJson(target) {
  if (!fs.existsSync(target.hooksJsonPath)) return null;
  return JSON.parse(readText(target.hooksJsonPath));
}

function cleanHooksJson(target, config) {
  if (!config) return false;

  let changed = false;
  const next = { ...config, hooks: {} };

  for (const [eventName, groups] of Object.entries(config.hooks || {})) {
    const nextGroups = [];
    for (const group of groups || []) {
      const seen = new Set();
      const hooks = [];
      for (const hook of group.hooks || []) {
        const command = String(hook.command || "");
        const scriptPaths = scriptPathsFromCommand(command);
        const missingScript = scriptPaths.length > 0 && scriptPaths.every((filePath) => !fs.existsSync(filePath));

        if (missingScript) {
          changed = true;
          recordChange(target, target.hooksJsonPath, `removed missing hook command: ${command}`);
          continue;
        }

        const key = `${hook.type || ""}\0${command}`;
        if (seen.has(key)) {
          changed = true;
          recordChange(target, target.hooksJsonPath, `removed duplicate hook command: ${command}`);
          continue;
        }

        seen.add(key);
        hooks.push(hook);
      }

      if (hooks.length > 0) {
        nextGroups.push({ ...group, hooks });
      } else {
        changed = true;
      }
    }

    if (nextGroups.length > 0) next.hooks[eventName] = nextGroups;
    else changed = true;
  }

  if (!changed) return false;
  backupFile(target.hooksJsonPath);
  if (!args.dryRun) fs.writeFileSync(target.hooksJsonPath, `${JSON.stringify(next, null, 2)}\n`);
  return true;
}

const deepSanitizeFunction = `function sanitizeOutput(obj, rules) {
  if (!obj || typeof obj !== "object" || Array.isArray(obj)) return obj;

  const allowed = rules.allowedPermissionValues === null
    ? null
    : new Set(rules.allowedPermissionValues);

  function visit(value) {
    if (!value || typeof value !== "object") return value;
    if (Array.isArray(value)) return value.map(visit);

    const result = Object.assign({}, value);
    for (const field of rules.deleteFields) {
      delete result[field];
    }

    if (allowed !== null) {
      if (result.permissionDecision !== undefined && !allowed.has(result.permissionDecision)) {
        delete result.permissionDecision;
      }
      if (result.decision !== undefined && !allowed.has(result.decision)) {
        delete result.decision;
      }
    }

    for (const [key, child] of Object.entries(result)) {
      if (child && typeof child === "object") result[key] = visit(child);
    }
    return result;
  }

  const sanitized = visit(obj);
  if (
    sanitized.hookSpecificOutput &&
    typeof sanitized.hookSpecificOutput === "object" &&
    !Array.isArray(sanitized.hookSpecificOutput)
  ) {
    const keys = Object.keys(sanitized.hookSpecificOutput);
    if (keys.length === 0 || keys.every((key) => key === "hookEventName")) {
      delete sanitized.hookSpecificOutput;
    }
  }
  return sanitized;
}`;

const emptyObjectHelper = `function isEmptyObject(value) {
  return value && typeof value === "object" && !Array.isArray(value) && Object.keys(value).length === 0;
}`;

function patchWrapper(target, filePath) {
  let content = readText(filePath);
  if (!content.includes("function sanitizeOutput(obj, rules)") || !content.includes("allowedPermissionValues")) {
    return false;
  }

  const pattern = /function sanitizeOutput\(obj, rules\) \{[\s\S]*?\n\}\n\n\/\*\*\n \* True when/;
  if (pattern.test(content)) {
    content = content.replace(pattern, `${deepSanitizeFunction}\n\n/**\n * True when`);
  }

  if (!content.includes("function isEmptyObject(value)")) {
    const helperAnchor = `function emitDeny(reason) {
  process.stdout.write(JSON.stringify({
    permissionDecision: "deny",
    reason: reason && reason.length > 0 ? reason : "Hook blocked this operation",
  }));
  process.exit(0);
}`;
    if (content.includes(helperAnchor)) {
      content = content.replace(helperAnchor, `${helperAnchor}\n\n${emptyObjectHelper}`);
    }
  }

  const noStdoutAllowAnchor = `      // Non-block failure or plain allow: forward stderr and pass exit code through.
      if (stderrText) process.stderr.write(stderrText);
      process.exit(exitCode);`;
  if (content.includes(noStdoutAllowAnchor)) {
    content = content.replace(noStdoutAllowAnchor, `      // Codex expects PreToolUse hooks to emit valid JSON even for allow.
      if (exitCode === 0) {
        process.stdout.write("{}");
        process.exit(0);
      }
      if (stderrText) process.stderr.write(stderrText);
      process.exit(exitCode);`);
  }

  const emptyAllowAnchor = `    if (isBlockSignal && (!sanitized || sanitized.permissionDecision !== "deny")) {
      return emitDeny(stderrText.trim());
    }

    process.stdout.write(JSON.stringify(sanitized));`;
  if (content.includes(emptyAllowAnchor)) {
    content = content.replace(emptyAllowAnchor, `    if (isBlockSignal && (!sanitized || sanitized.permissionDecision !== "deny")) {
      return emitDeny(stderrText.trim());
    }

    if (isEmptyObject(sanitized)) {
      process.stdout.write("{}");
      process.exit(exitCode);
    }

    process.stdout.write(JSON.stringify(sanitized));`);
  }

  return writeIfChanged(
    target,
    filePath,
    content,
    "patched wrapper deep scrub and empty JSON allow-through for Codex compatibility",
  );
}

function patchDescriptiveName(target, filePath) {
  if (path.basename(filePath) !== "descriptive-name.cjs") return false;
  const content = readText(filePath);
  if (!content.includes('"permissionDecision": "allow"')) return false;

  const pattern = /console\.log\(JSON\.stringify\(\{\s*"hookSpecificOutput":\s*\{[\s\S]*?\}\s*\}\)\);/;
  const next = content.replace(pattern, "process.exit(0);");
  return writeIfChanged(target, filePath, next, "patched descriptive-name allow output for Codex compatibility");
}

function patchScoutPatternMatcher(target, filePath) {
  if (path.basename(filePath) !== "pattern-matcher.cjs") return false;
  const content = readText(filePath);
  const before = `  // Empty after normalization = not a blockable path
  if (!normalized) {
    return { blocked: false };
  }`;
  const after = `  // Empty/current directory after normalization = not a blockable path
  if (!normalized || normalized === '.') {
    return { blocked: false };
  }`;
  if (!content.includes(before)) return false;
  return writeIfChanged(target, filePath, content.replace(before, after), "patched scout-block current-directory path handling");
}

function collectFilesRecursively(rootDir, files = []) {
  if (!fs.existsSync(rootDir)) return files;

  for (const entry of fs.readdirSync(rootDir, { withFileTypes: true })) {
    const filePath = path.join(rootDir, entry.name);
    if (entry.isDirectory()) {
      collectFilesRecursively(filePath, files);
      continue;
    }
    if (entry.isFile() && SCRIPT_EXTENSIONS.test(entry.name)) {
      files.push(filePath);
    }
  }

  return files;
}

function candidateHookFiles(target, config) {
  const files = new Set();
  for (const groups of Object.values(config?.hooks || {})) {
    for (const group of groups || []) {
      for (const hook of group.hooks || []) {
        for (const filePath of scriptPathsFromCommand(String(hook.command || ""))) {
          files.add(path.resolve(filePath));
        }
      }
    }
  }

  for (const filePath of collectFilesRecursively(target.hooksDir)) {
    files.add(filePath);
  }

  return [...files].filter((filePath) => fs.existsSync(filePath));
}

function fixTarget(target) {
  if (!targetExists(target)) {
    return {
      scope: target.scope,
      rootDir: target.rootDir,
      skipped: true,
      reason: "missing hooks.json and hooks directory",
      changed: 0,
      changes: [],
    };
  }

  const startChangeCount = allChanges.length;
  const config = loadHooksJson(target);
  cleanHooksJson(target, config);

  for (const filePath of candidateHookFiles(target, config)) {
    patchWrapper(target, filePath);
    patchDescriptiveName(target, filePath);
    patchScoutPatternMatcher(target, filePath);
  }

  const changes = allChanges.slice(startChangeCount);
  return {
    scope: target.scope,
    rootDir: target.rootDir,
    hooksJsonPath: fs.existsSync(target.hooksJsonPath) ? target.hooksJsonPath : null,
    hooksDir: fs.existsSync(target.hooksDir) ? target.hooksDir : null,
    skipped: false,
    changed: changes.length,
    changes,
  };
}

function main() {
  if (args.help) {
    process.stdout.write(usage());
    return;
  }

  const targets = resolveTargets();
  const results = targets.map(fixTarget);

  console.log(JSON.stringify({
    tool: TOOL_NAME,
    purpose: "Fix ClaudeKit hooks ported from Claude Code so they run cleanly on Codex",
    dryRun: args.dryRun,
    requestedScope: args.scope,
    changed: allChanges.length,
    results,
  }, null, 2));
}

main();
