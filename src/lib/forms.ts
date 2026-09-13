/**
 * A server action used directly as `<form action={...}>` is handed a FormData
 * object, not the plain object a Zod schema expects. Actions created with
 * `.bind()` receive their bound argument first and are unaffected — which is
 * why the favourite and delete buttons worked while the plan and shopping-list
 * forms failed with "expected string, received undefined".
 *
 * Unfilled inputs and unselected `<select>`s submit as empty strings; those are
 * dropped so `.nullish()` fields see "not provided" rather than "".
 */
export function fromForm(raw: unknown): unknown {
  if (!(raw instanceof FormData)) return raw;

  const out: Record<string, FormDataEntryValue> = {};
  for (const [key, value] of raw.entries()) {
    if (typeof value === 'string' && value.trim() === '') continue;
    out[key] = value;
  }
  return out;
}

const TRUE_VALUES = new Set(['true', 'on', '1', 'yes']);
const FALSE_VALUES = new Set(['false', 'off', '0', 'no']);

/**
 * Turns the string a form sends into the boolean a contract expects.
 *
 * This lives here rather than in the Zod schema on purpose. Making the schema
 * itself accept `boolean | "true" | "false" | ...` also changes the JSON Schema
 * the MCP tools publish, so a language model would be shown a union where the
 * honest answer is "this is a boolean". Forms are the odd caller out, so the
 * form adapter is where the oddity belongs.
 *
 * `undefined` is passed through untouched so a schema default still applies.
 */
export function coerceBoolean(value: unknown): boolean | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') {
    const v = value.trim().toLowerCase();
    if (TRUE_VALUES.has(v)) return true;
    if (FALSE_VALUES.has(v)) return false;
  }
  return undefined;
}

/** `fromForm`, with the named fields coerced from form strings to booleans. */
export function fromFormWithBooleans(raw: unknown, fields: readonly string[]): unknown {
  const parsed = fromForm(raw);
  if (parsed === raw || typeof parsed !== 'object' || parsed === null) return parsed;

  const out = { ...(parsed as Record<string, unknown>) };
  for (const field of fields) {
    if (!(field in out)) continue;
    const coerced = coerceBoolean(out[field]);
    if (coerced === undefined) delete out[field];
    else out[field] = coerced;
  }
  return out;
}
