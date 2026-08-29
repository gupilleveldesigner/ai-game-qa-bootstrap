import {
  access,
  lstat,
  mkdir,
  open,
  readFile,
  realpath,
  readdir,
  rename,
  rm,
  stat,
  writeFile
} from "node:fs/promises";
import { constants as fsConstants } from "node:fs";
import path from "node:path";
import { createHash, randomBytes } from "node:crypto";
import { DEFAULT_SCAN_EXCLUDES, OUTPUT_DIR } from "./constants.mjs";

export function normalizeSlashes(value) {
  return value.split(path.sep).join("/");
}

export function hashText(value) {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

export async function hashFile(filePath) {
  const content = await readFile(filePath);
  return createHash("sha256").update(content).digest("hex");
}

export async function pathExists(filePath) {
  try {
    await lstat(filePath);
    return true;
  } catch (error) {
    if (error?.code === "ENOENT") return false;
    throw error;
  }
}

export async function canonicalProjectRoot(inputPath = process.cwd()) {
  const resolved = path.resolve(inputPath);
  const info = await stat(resolved);
  if (!info.isDirectory()) {
    throw new Error(`Project root is not a directory: ${inputPath}`);
  }
  return realpath(resolved);
}

export function assertSafeRelativePath(relativePath) {
  if (typeof relativePath !== "string" || relativePath.length === 0) {
    throw new Error("A non-empty relative path is required.");
  }
  if (relativePath.includes("\0") || path.isAbsolute(relativePath)) {
    throw new Error(`Unsafe absolute or null-containing path: ${relativePath}`);
  }
  const normalized = path.normalize(relativePath);
  if (
    normalized === ".." ||
    normalized.startsWith(`..${path.sep}`) ||
    normalized.split(path.sep).includes("..")
  ) {
    throw new Error(`Path escapes the project root: ${relativePath}`);
  }
  return normalized;
}

export function resolveInside(root, relativePath) {
  const safe = assertSafeRelativePath(relativePath);
  const resolved = path.resolve(root, safe);
  const relation = path.relative(root, resolved);
  if (relation === ".." || relation.startsWith(`..${path.sep}`) || path.isAbsolute(relation)) {
    throw new Error(`Path escapes the project root: ${relativePath}`);
  }
  return resolved;
}

export async function assertNoSymlinkInPath(root, relativePath) {
  const safe = assertSafeRelativePath(relativePath);
  const parts = safe.split(path.sep).filter(Boolean);
  let cursor = root;
  for (const part of parts) {
    cursor = path.join(cursor, part);
    try {
      const info = await lstat(cursor);
      if (info.isSymbolicLink()) {
        throw new Error(`Refusing to write through symbolic link: ${normalizeSlashes(path.relative(root, cursor))}`);
      }
    } catch (error) {
      if (error?.code === "ENOENT") return;
      throw error;
    }
  }
}

export async function readJson(filePath, fallback = undefined) {
  try {
    return JSON.parse(await readFile(filePath, "utf8"));
  } catch (error) {
    if (error?.code === "ENOENT" && fallback !== undefined) return fallback;
    throw error;
  }
}

export async function writeTextAtomic(filePath, content) {
  await mkdir(path.dirname(filePath), { recursive: true });
  const temporary = `${filePath}.tmp-${process.pid}-${randomBytes(5).toString("hex")}`;
  await writeFile(temporary, content, { encoding: "utf8", flag: "wx" });
  await rename(temporary, filePath);
}

export async function writeJsonAtomic(filePath, value) {
  await writeTextAtomic(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

function shouldExclude(relativePath, excludes) {
  const parts = normalizeSlashes(relativePath).split("/");
  return parts.some((part) => excludes.has(part));
}

export async function walkFiles(root, options = {}) {
  const excludes = new Set(options.excludes ?? DEFAULT_SCAN_EXCLUDES);
  const maxFiles = options.maxFiles ?? 25000;
  const files = [];
  const symlinks = [];
  const skipped = [];
  const queue = [{ absolute: root, relative: "" }];

  while (queue.length > 0) {
    const current = queue.shift();
    const entries = await readdir(current.absolute, { withFileTypes: true });
    entries.sort((a, b) => a.name.localeCompare(b.name));

    for (const entry of entries) {
      const relative = current.relative ? path.join(current.relative, entry.name) : entry.name;
      if (shouldExclude(relative, excludes)) continue;
      const absolute = path.join(current.absolute, entry.name);
      const info = await lstat(absolute);

      if (info.isSymbolicLink()) {
        symlinks.push(normalizeSlashes(relative));
        continue;
      }
      if (info.isDirectory()) {
        queue.push({ absolute, relative });
        continue;
      }
      if (!info.isFile()) {
        skipped.push({ path: normalizeSlashes(relative), reason: "non_regular_file" });
        continue;
      }
      files.push(normalizeSlashes(relative));
      if (files.length > maxFiles) {
        throw new Error(`Project scan exceeded the ${maxFiles}-file safety limit.`);
      }
    }
  }

  return { files, symlinks, skipped };
}

export async function projectFingerprint(root, options = {}) {
  const excludes = new Set(options.excludes ?? DEFAULT_SCAN_EXCLUDES);
  excludes.add(OUTPUT_DIR);
  const scan = await walkFiles(root, { ...options, excludes: [...excludes] });
  const digest = createHash("sha256");
  for (const relative of scan.files) {
    const absolute = resolveInside(root, relative);
    digest.update(relative, "utf8");
    digest.update("\0");
    digest.update(await readFile(absolute));
    digest.update("\0");
  }
  return {
    algorithm: "sha256",
    value: digest.digest("hex"),
    fileCount: scan.files.length,
    symlinksSkipped: scan.symlinks
  };
}

export async function isWritableDirectory(root) {
  try {
    await access(root, fsConstants.W_OK);
    return true;
  } catch {
    return false;
  }
}

export async function safeRemoveOwnTemporary(filePath) {
  if (path.basename(filePath).includes(".tmp-")) {
    await rm(filePath, { force: true });
  }
}

export async function readUtf8Prefix(filePath, maxBytes = 128 * 1024) {
  const handle = await open(filePath, "r");
  try {
    const buffer = Buffer.alloc(maxBytes);
    const { bytesRead } = await handle.read(buffer, 0, maxBytes, 0);
    return buffer.subarray(0, bytesRead).toString("utf8");
  } finally {
    await handle.close();
  }
}
