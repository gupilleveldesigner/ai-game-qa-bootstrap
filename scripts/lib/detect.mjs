import { lstat, readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { canonicalProjectRoot, normalizeSlashes, readUtf8Prefix } from "./fs-safe.mjs";
import { ENGINE_PRIORITY } from "./constants.mjs";

async function regularFile(filePath) {
  try {
    const info = await lstat(filePath);
    return info.isFile() && !info.isSymbolicLink();
  } catch (error) {
    if (error?.code === "ENOENT") return false;
    throw error;
  }
}

async function regularDirectory(filePath) {
  try {
    const info = await lstat(filePath);
    return info.isDirectory() && !info.isSymbolicLink();
  } catch (error) {
    if (error?.code === "ENOENT") return false;
    throw error;
  }
}

async function topLevelNames(root) {
  const entries = await readdir(root, { withFileTypes: true });
  return entries.map((entry) => entry.name).sort((a, b) => a.localeCompare(b));
}

async function readPackage(root) {
  const filePath = path.join(root, "package.json");
  if (!(await regularFile(filePath))) return null;
  try {
    return JSON.parse(await readFile(filePath, "utf8"));
  } catch (error) {
    return { __parseError: error.message };
  }
}

function packageDependencies(packageJson) {
  return {
    ...(packageJson?.dependencies ?? {}),
    ...(packageJson?.devDependencies ?? {}),
    ...(packageJson?.peerDependencies ?? {})
  };
}

function detectWebFramework(packageJson, indexPrefix = "") {
  const dependencies = packageDependencies(packageJson);
  const names = Object.keys(dependencies).map((name) => name.toLowerCase());
  if (names.includes("phaser") || /\bphaser\b/i.test(indexPrefix)) return "phaser";
  if (names.includes("pixi.js") || names.includes("pixijs") || /\bpixi(?:\.js)?\b/i.test(indexPrefix)) return "pixi";
  if (names.includes("three") || /\bthree(?:\.min)?\.js\b/i.test(indexPrefix)) return "three";
  if (names.includes("@babylonjs/core") || names.includes("babylonjs") || /\bbabylon(?:\.js)?\b/i.test(indexPrefix)) return "babylon";
  if (/unityloader|createunityinstance|unityframework/i.test(indexPrefix)) return "unity-webgl";
  if (/godot.*engine|\.pck["']/i.test(indexPrefix)) return "godot-web";
  if (/construct\s*3|c3runtime/i.test(indexPrefix)) return "construct-web";
  return null;
}

function detectBuildScript(packageJson) {
  const scripts = packageJson?.scripts ?? {};
  const priority = ["build", "build:web", "build:browser", "build:client", "build:prod", "build:production"];
  for (const script of priority) {
    if (typeof scripts[script] === "string" && scripts[script].trim()) {
      return { manager: "npm", script, command: ["npm", "run", script] };
    }
  }
  return null;
}

async function findTopLevelExtension(root, extension) {
  const names = await topLevelNames(root);
  return names.find((name) => name.toLowerCase().endsWith(extension.toLowerCase())) ?? null;
}

async function detectBevy(root) {
  const cargoPath = path.join(root, "Cargo.toml");
  if (!(await regularFile(cargoPath))) return false;
  const prefix = await readUtf8Prefix(cargoPath, 64 * 1024);
  return /(^|\n)\s*bevy\s*=|bevy\s*\{?/m.test(prefix);
}

async function detectMonoGame(root) {
  const names = await topLevelNames(root);
  const projects = names.filter((name) => name.toLowerCase().endsWith(".csproj"));
  for (const name of projects) {
    const prefix = await readUtf8Prefix(path.join(root, name), 64 * 1024);
    if (/MonoGame|FNA\b|Microsoft\.Xna/i.test(prefix)) return name;
  }
  return null;
}

function makeSignal(engine, confidence, reason, extra = {}) {
  return { engine, confidence, reason, ...extra };
}

export async function detectProject(inputRoot = process.cwd()) {
  const root = await canonicalProjectRoot(inputRoot);
  const names = await topLevelNames(root);
  const signals = [];
  const warnings = [];

  const packageJson = await readPackage(root);
  if (packageJson?.__parseError) warnings.push({ code: "invalid_package_json", detail: packageJson.__parseError });

  const indexCandidates = ["index.html", "dist/index.html", "build/index.html", "www/index.html", "out/index.html", "export/index.html", "web/index.html"];
  let indexPath = null;
  let indexPrefix = "";
  for (const candidate of indexCandidates) {
    const absolute = path.join(root, candidate);
    if (await regularFile(absolute)) {
      indexPath = normalizeSlashes(candidate);
      indexPrefix = await readUtf8Prefix(absolute);
      break;
    }
  }

  if (await regularFile(path.join(root, "ProjectSettings", "ProjectVersion.txt")) && await regularDirectory(path.join(root, "Assets"))) {
    signals.push(makeSignal("unity", 1, "Assets and ProjectSettings/ProjectVersion.txt are present", { target: "multi-target", adapterHint: "engine-native" }));
  }

  const uproject = await findTopLevelExtension(root, ".uproject");
  if (uproject) signals.push(makeSignal("unreal", 1, `Found ${uproject}`, { target: "multi-target", adapterHint: "engine-native" }));

  if (await regularFile(path.join(root, "project.godot"))) {
    signals.push(makeSignal("godot", 1, "Found project.godot", { target: "multi-target", adapterHint: "engine-native" }));
  }

  if (await regularFile(path.join(root, "main.lua"))) {
    signals.push(makeSignal("love2d", 0.99, "Found root main.lua", { target: "desktop", adapterHint: "love2d" }));
  }

  if (await regularFile(path.join(root, "game.project"))) {
    signals.push(makeSignal("defold", 0.99, "Found game.project", { target: "multi-target", adapterHint: "engine-native" }));
  }

  const yyp = await findTopLevelExtension(root, ".yyp");
  if (yyp) signals.push(makeSignal("gamemaker", 0.98, `Found ${yyp}`, { target: "multi-target", adapterHint: "engine-native" }));

  const c3p = await findTopLevelExtension(root, ".c3p");
  if (c3p) signals.push(makeSignal("construct", 0.98, `Found ${c3p}`, { target: "web", adapterHint: "web" }));

  const rpy = await findTopLevelExtension(root, ".rpy");
  if (rpy) signals.push(makeSignal("renpy", 0.96, `Found ${rpy}`, { target: "desktop", adapterHint: "engine-native" }));

  if (await detectBevy(root)) {
    signals.push(makeSignal("bevy", 0.94, "Cargo.toml declares Bevy", { target: "desktop", adapterHint: "engine-native" }));
  }

  const monoProject = await detectMonoGame(root);
  if (monoProject) {
    signals.push(makeSignal("monogame", 0.94, `${monoProject} references MonoGame/FNA/XNA`, { target: "desktop", adapterHint: "engine-native" }));
  }

  if (packageJson || indexPath) {
    const framework = detectWebFramework(packageJson, indexPrefix);
    signals.push(makeSignal("web", indexPath ? 0.95 : 0.78, indexPath ? `Found ${indexPath}` : "Found package.json", {
      target: "web",
      framework: framework ?? "generic-web",
      adapterHint: "web",
      startPath: indexPath ?? null,
      build: detectBuildScript(packageJson)
    }));
  }

  if (signals.length === 0) {
    signals.push(makeSignal("generic", 0.35, "No known engine marker was found", { target: "unknown", adapterHint: "manual" }));
  }

  const priority = new Map(ENGINE_PRIORITY.map((engine, index) => [engine, index]));
  signals.sort((a, b) => {
    const priorityDifference = (priority.get(a.engine) ?? 999) - (priority.get(b.engine) ?? 999);
    if (priorityDifference !== 0) return priorityDifference;
    return b.confidence - a.confidence;
  });

  const primary = signals[0];
  return {
    schemaVersion: 1,
    projectPath: ".",
    primary,
    signals,
    warnings,
    inspection: {
      executedProjectCode: false,
      followedSymlinks: false,
      topLevelEntries: names.filter((name) => ![".ai-game-qa", ".git", "node_modules"].includes(name)).length
    }
  };
}

export { detectBuildScript, detectWebFramework };
