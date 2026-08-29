const BOOLEAN_OPTIONS = new Set(["write", "help"]);
const MULTI_VALUE_OPTIONS = new Set(["changed", "tag"]);
const SINGLE_VALUE_OPTIONS = new Set(["project", "issue", "suite"]);

export function parseArguments(argv) {
  const values = { _: [], changed: [], tag: [] };
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith("--")) {
      values._.push(token);
      continue;
    }

    const key = token.slice(2);
    if (BOOLEAN_OPTIONS.has(key)) {
      values[key] = true;
      continue;
    }
    if (!MULTI_VALUE_OPTIONS.has(key) && !SINGLE_VALUE_OPTIONS.has(key)) {
      throw new Error(`Unknown option: --${key}`);
    }

    if (MULTI_VALUE_OPTIONS.has(key)) {
      let consumed = 0;
      while (index + 1 < argv.length && !argv[index + 1].startsWith("--")) {
        values[key].push(argv[index + 1]);
        index += 1;
        consumed += 1;
      }
      if (consumed === 0) throw new Error(`Option --${key} requires at least one value.`);
      continue;
    }

    const next = argv[index + 1];
    if (!next || next.startsWith("--")) throw new Error(`Option --${key} requires a value.`);
    values[key] = next;
    index += 1;
  }
  return values;
}
