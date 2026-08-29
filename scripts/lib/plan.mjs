import { readFile } from "node:fs/promises";
import { buildCapabilityMatrix } from "./capabilities.mjs";
import { GENERATOR_NAME, GENERATOR_VERSION, OUTPUT_DIR, SCHEMA_VERSION } from "./constants.mjs";
import { detectProject } from "./detect.mjs";
import {
  assertNoSymlinkInPath,
  canonicalProjectRoot,
  hashText,
  pathExists,
  projectFingerprint,
  readJson,
  resolveInside,
  writeJsonAtomic,
  writeTextAtomic
} from "./fs-safe.mjs";
import { buildGeneratedFiles } from "./templates.mjs";
import { loadRules } from "./rules.mjs";
import { validateGeneratedJson } from "./setup-validation.mjs";

const MANIFEST_PATH = `${OUTPUT_DIR}/generated-manifest.json`;

async function currentHash(root, relativePath) {
  await assertNoSymlinkInPath(root, relativePath);
  const absolute = resolveInside(root, relativePath);
  if (!(await pathExists(absolute))) return null;
  return hashText(await readFile(absolute, "utf8"));
}

function sameFingerprint(left, right) {
  return left?.algorithm === right?.algorithm && left?.value === right?.value && left?.fileCount === right?.fileCount;
}

function sameActions(left, right) {
  const fields = ["path", "action", "desiredHash", "previousHash", "existingHash"];
  return left.length === right.length && left.every((action, index) => fields.every((field) => action[field] === right[index]?.[field]));
}

async function assertActionStillCurrent(root, action) {
  const current = await currentHash(root, action.path);
  if (action.action === "create" && current !== null) throw new Error(`Setup plan is stale: ${action.path} was created after planning.`);
  if (action.action === "update" && current !== action.previousHash) throw new Error(`Setup plan is stale: ${action.path} changed after planning.`);
  if (action.action === "unchanged" && current !== action.desiredHash) throw new Error(`Setup plan is stale: ${action.path} changed after planning.`);
}

export async function planGeneratedFiles(root, desiredFiles, previousManifest = null) {
  const actions = [];
  for (const [relativePath, content] of [...desiredFiles.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    if (!relativePath.startsWith(`${OUTPUT_DIR}/`)) {
      throw new Error(`Generated file is outside ${OUTPUT_DIR}: ${relativePath}`);
    }
    const desiredHash = hashText(content);
    const existingHash = await currentHash(root, relativePath);
    if (existingHash === null) {
      actions.push({ path: relativePath, action: "create", desiredHash });
      continue;
    }
    if (existingHash === desiredHash) {
      actions.push({ path: relativePath, action: "unchanged", desiredHash });
      continue;
    }
    const managedHash = previousManifest?.files?.[relativePath]?.sha256 ?? null;
    if (managedHash && managedHash === existingHash) {
      actions.push({ path: relativePath, action: "update", desiredHash, previousHash: existingHash });
    } else {
      actions.push({ path: relativePath, action: "conflict", desiredHash, existingHash });
    }
  }
  return actions;
}

export async function createSetupPlan(inputRoot = process.cwd()) {
  const root = await canonicalProjectRoot(inputRoot);
  await assertNoSymlinkInPath(root, OUTPUT_DIR);
  const detection = await detectProject(root);
  const capabilities = buildCapabilityMatrix(detection);
  const sourceFingerprint = await projectFingerprint(root);
  const desiredFiles = buildGeneratedFiles({ detection, capabilities, sourceFingerprint });
  await assertNoSymlinkInPath(root, MANIFEST_PATH);
  const previousManifest = await readJson(resolveInside(root, MANIFEST_PATH), null);
  const actions = await planGeneratedFiles(root, desiredFiles, previousManifest);

  return {
    schemaVersion: SCHEMA_VERSION,
    generator: { name: GENERATOR_NAME, version: GENERATOR_VERSION },
    projectRoot: root,
    detection,
    capabilities,
    sourceFingerprint,
    desiredFiles,
    previousManifest,
    actions,
    summary: actions.reduce((summary, item) => {
      summary[item.action] = (summary[item.action] ?? 0) + 1;
      return summary;
    }, { create: 0, update: 0, unchanged: 0, conflict: 0 })
  };
}

export async function applySetupPlan(plan, options = {}) {
  if (!options.write) {
    return { written: false, reason: "dry_run", summary: plan.summary, conflicts: plan.actions.filter((item) => item.action === "conflict") };
  }

  const root = await canonicalProjectRoot(plan.projectRoot);
  await assertNoSymlinkInPath(root, OUTPUT_DIR);
  const refreshed = await createSetupPlan(root);
  if (!sameFingerprint(refreshed.sourceFingerprint, plan.sourceFingerprint)) {
    throw new Error("Setup plan is stale: project source changed after planning.");
  }
  if (!sameActions(refreshed.actions, plan.actions)) {
    throw new Error("Setup plan is stale: generated files changed after planning. Run plan again.");
  }

  const before = refreshed.sourceFingerprint;
  const managedFiles = { ...(refreshed.previousManifest?.files ?? {}) };
  const written = [];
  const conflicts = [];

  for (const action of refreshed.actions) {
    if (action.action === "conflict") {
      conflicts.push(action);
      continue;
    }
    const content = refreshed.desiredFiles.get(action.path);
    if (content === undefined) throw new Error(`Missing desired content for ${action.path}`);
    await assertActionStillCurrent(root, action);
    if (action.action === "create" || action.action === "update") {
      await assertNoSymlinkInPath(root, action.path);
      await writeTextAtomic(resolveInside(root, action.path), content);
      written.push(action.path);
    }
    managedFiles[action.path] = { sha256: hashText(content), generatorVersion: GENERATOR_VERSION };
  }

  const manifest = {
    schemaVersion: SCHEMA_VERSION,
    generator: { name: GENERATOR_NAME, version: GENERATOR_VERSION },
    updatedAt: new Date().toISOString(),
    files: managedFiles,
    conflicts: conflicts.map((item) => item.path)
  };
  await writeJsonAtomic(resolveInside(root, MANIFEST_PATH), manifest);

  const after = await projectFingerprint(root);
  if (before.value !== after.value || before.fileCount !== after.fileCount) {
    throw new Error("Source fingerprint changed while applying the QA scaffold.");
  }

  return {
    written: true,
    filesWritten: written,
    conflicts,
    sourceUnchanged: true,
    sourceFingerprint: after
  };
}

export async function validateSetup(inputRoot = process.cwd()) {
  const root = await canonicalProjectRoot(inputRoot);
  const errors = [];
  const warnings = [];
  await assertNoSymlinkInPath(root, OUTPUT_DIR);

  const required = [
    `${OUTPUT_DIR}/config.json`,
    `${OUTPUT_DIR}/capabilities.json`,
    `${OUTPUT_DIR}/project-manifest.json`,
    `${OUTPUT_DIR}/generated-manifest.json`,
    `${OUTPUT_DIR}/suites/fast.json`,
    `${OUTPUT_DIR}/suites/nightly.json`,
    `${OUTPUT_DIR}/suites/release.json`
  ];
  const parsed = new Map();
  for (const relative of required) {
    try {
      await assertNoSymlinkInPath(root, relative);
      const absolute = resolveInside(root, relative);
      if (!(await pathExists(absolute))) {
        errors.push({ code: "missing_generated_file", path: relative });
        continue;
      }
      const value = await readJson(absolute);
      parsed.set(relative, value);
      const structureErrors = validateGeneratedJson(relative, value);
      if (structureErrors.length > 0) errors.push({ code: "invalid_generated_structure", path: relative, detail: structureErrors.join("; ") });
    } catch (error) {
      const code = /symbolic link/.test(error.message) ? "unsafe_symlink" : "invalid_json";
      errors.push({ code, path: relative, detail: error.message });
    }
  }

  const manifest = parsed.get(MANIFEST_PATH) ?? null;
  if (manifest) {
    for (const [relative, record] of Object.entries(manifest.files ?? {})) {
      try {
        const hash = await currentHash(root, relative);
        if (hash === null) errors.push({ code: "managed_file_missing", path: relative });
        else if (hash !== record.sha256) warnings.push({ code: "managed_file_modified", path: relative });
      } catch (error) {
        errors.push({ code: "unsafe_managed_path", path: relative, detail: error.message });
      }
    }
  }

  try {
    await loadRules(root);
  } catch (error) {
    errors.push({ code: "invalid_rule_registry", path: `${OUTPUT_DIR}/rules`, detail: error.message });
  }

  return { ok: errors.length === 0, errors, warnings };
}
