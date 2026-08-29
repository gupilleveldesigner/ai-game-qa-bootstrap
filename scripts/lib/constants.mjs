export const GENERATOR_NAME = "ai-game-qa-bootstrap";
export const GENERATOR_VERSION = "0.1.0";
export const OUTPUT_DIR = ".ai-game-qa";
export const SCHEMA_VERSION = 1;

export const QA_LANES = Object.freeze([
  "tech",
  "play-functional",
  "play-experience",
  "visual"
]);

export const EXECUTION_METHODS = Object.freeze([
  "deterministic",
  "scripted-runtime",
  "vision-agent",
  "blind-play-agent",
  "human-review"
]);

export const CAPABILITY_STATUSES = Object.freeze([
  "supported",
  "adapter_required",
  "project_input_required",
  "manual",
  "unsupported"
]);

export const DEFAULT_SCAN_EXCLUDES = Object.freeze([
  ".git",
  ".hg",
  ".svn",
  OUTPUT_DIR,
  "node_modules",
  "Library",
  "Temp",
  "Logs",
  "obj",
  "bin",
  "Binaries",
  "Intermediate",
  "Saved",
  "DerivedDataCache",
  ".gradle",
  ".idea",
  ".vscode"
]);

export const ENGINE_PRIORITY = Object.freeze([
  "unity",
  "unreal",
  "godot",
  "love2d",
  "defold",
  "gamemaker",
  "construct",
  "renpy",
  "bevy",
  "monogame",
  "web",
  "generic"
]);
