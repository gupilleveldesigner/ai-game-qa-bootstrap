function typeMatches(value, type) {
  if (type === "array") return Array.isArray(value);
  if (type === "object") return value !== null && typeof value === "object" && !Array.isArray(value);
  if (type === "integer") return Number.isInteger(value);
  if (type === "null") return value === null;
  return typeof value === type;
}

function displayPath(path, key) {
  return /^[$A-Za-z_][A-Za-z0-9_-]*$/.test(key) ? `${path}.${key}` : `${path}[${JSON.stringify(key)}]`;
}

function validateNode(value, schema, path, errors) {
  if (schema.const !== undefined && value !== schema.const) {
    errors.push(`${path} must equal ${JSON.stringify(schema.const)}`);
    return;
  }
  if (schema.enum && !schema.enum.includes(value)) {
    errors.push(`${path} must be one of ${schema.enum.map((item) => JSON.stringify(item)).join(", ")}`);
    return;
  }

  if (schema.type !== undefined) {
    const types = Array.isArray(schema.type) ? schema.type : [schema.type];
    if (!types.some((type) => typeMatches(value, type))) {
      errors.push(`${path} must be ${types.join(" or ")}`);
      return;
    }
  }

  if (typeof value === "string") {
    if (schema.minLength !== undefined && value.length < schema.minLength) errors.push(`${path} is too short`);
    if (schema.maxLength !== undefined && value.length > schema.maxLength) errors.push(`${path} is too long`);
    if (schema.pattern && !new RegExp(schema.pattern).test(value)) errors.push(`${path} has an invalid format`);
    if (schema.format === "date-time" && Number.isNaN(Date.parse(value))) errors.push(`${path} must be a date-time`);
  }

  if (typeof value === "number") {
    if (schema.minimum !== undefined && value < schema.minimum) errors.push(`${path} is below the minimum`);
    if (schema.maximum !== undefined && value > schema.maximum) errors.push(`${path} exceeds the maximum`);
  }

  if (Array.isArray(value)) {
    if (schema.minItems !== undefined && value.length < schema.minItems) errors.push(`${path} has too few items`);
    if (schema.maxItems !== undefined && value.length > schema.maxItems) errors.push(`${path} has too many items`);
    if (schema.uniqueItems) {
      const unique = new Set(value.map((item) => JSON.stringify(item)));
      if (unique.size !== value.length) errors.push(`${path} must contain unique items`);
    }
    if (schema.items) value.forEach((item, index) => validateNode(item, schema.items, `${path}[${index}]`, errors));
  }

  if (value !== null && typeof value === "object" && !Array.isArray(value)) {
    const properties = schema.properties ?? {};
    for (const key of schema.required ?? []) {
      if (!Object.hasOwn(value, key) || value[key] === undefined) errors.push(`${displayPath(path, key)} is required`);
    }
    if (schema.additionalProperties === false) {
      for (const key of Object.keys(value)) {
        if (!Object.hasOwn(properties, key)) errors.push(`${displayPath(path, key)} is not allowed`);
      }
    }
    for (const [key, childSchema] of Object.entries(properties)) {
      if (Object.hasOwn(value, key) && value[key] !== undefined) validateNode(value[key], childSchema, displayPath(path, key), errors);
    }
  }
}

export function validateJsonSchema(value, schema) {
  const errors = [];
  validateNode(value, schema, "$", errors);
  return { ok: errors.length === 0, errors };
}
