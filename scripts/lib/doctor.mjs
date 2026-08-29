import process from "node:process";
import { buildCapabilityMatrix } from "./capabilities.mjs";
import { detectProject } from "./detect.mjs";
import { canonicalProjectRoot, isWritableDirectory, pathExists, resolveInside } from "./fs-safe.mjs";
import { OUTPUT_DIR } from "./constants.mjs";

export async function runDoctor(inputRoot = process.cwd()) {
  const root = await canonicalProjectRoot(inputRoot);
  const detection = await detectProject(root);
  const capabilities = buildCapabilityMatrix(detection);
  const nodeMajor = Number(process.versions.node.split(".")[0]);
  const checks = [
    {
      id: "node",
      status: nodeMajor >= 20 ? "ok" : "failed",
      mandatory: true,
      detail: `Node ${process.versions.node}; version 20 or newer is required.`
    },
    {
      id: "project-readable",
      status: "ok",
      mandatory: true,
      detail: "Project root was inspected without executing project code."
    },
    {
      id: "project-writable",
      status: await isWritableDirectory(root) ? "ok" : "failed",
      mandatory: true,
      detail: "Write permission is required only for the explicit apply step."
    },
    {
      id: "existing-setup",
      status: await pathExists(resolveInside(root, `${OUTPUT_DIR}/config.json`)) ? "ok" : "warning",
      mandatory: false,
      detail: "A missing setup is expected before initialization."
    },
    {
      id: "runtime-adapter",
      status: "warning",
      mandatory: false,
      detail: `Detected adapter hint: ${detection.primary.adapterHint}. Runtime control is not bundled in v0.1.`
    }
  ];
  return {
    ok: checks.every((check) => !check.mandatory || check.status === "ok"),
    platform: process.platform,
    architecture: process.arch,
    projectPath: ".",
    detection,
    capabilities,
    checks
  };
}
