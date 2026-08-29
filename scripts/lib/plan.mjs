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

const MANIFEST_PATH = `${OUTPUT_DIR}/generated-manifest.json`;

async function currentHash(root, relativePath) {
  const absolute = resolveInside(root, relativePath);
  if (!(await pathExists(absolute))) return null;
  return hashText(await readFile(absolute, "utf8"));
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
  const before = await projectFingerprint(root);
  const managedFiles = { ...(plan.previousManifest?.files ?? {}) };
  const written = [];
  const conflicts = [];

  for (const action of plan.actions) {
    if (action.action === "conflict") {
      conflicts.push(action);
      continue;
    }
    const content = plan.desiredFiles.get(action.path);
    if (content === undefined) throw new Error(`Missing desired content for ${action.path}`);
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
  for (const relative of required) {
    const absolute = resolveInside(root, relative);
    if (!(await pathExists(absolute))) {
      errors.push({ code: "missing_generated_file", path: relative });
      continue;
    }
    if (relative.endsWith(".json")) {
      try {
        await readJson(absolute);
      } catch (error) {
        errors.push({ code: "invalid_json", path: relative, detail: error.message });
      }
    }
  }

  const manifest = await readJson(resolveInside(root, MANIFEST_PATH), null);
  if (manifest) {
    for (const [relative, record] of Object.entries(manifest.files ?? {})) {
      const hash = await currentHash(root, relative);
      if (hash === null) errors.push({ code: "managed_file_missing", path: relative });
      else if (hash !== record.sha256) warnings.push({ code: "managed_file_modified", path: relative });
    }
  }

  return { ok: errors.length === 0, errors, warnings };
}
