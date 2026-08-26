/**
 * Zod schema to JSON Schema, in the dialect structured-output APIs accept.
 *
 * Both OpenAI's `json_schema` response format and Anthropic's `output_config`
 * want a JSON Schema, and both are stricter than the general specification:
 * every object needs `additionalProperties: false` and an explicit `required`
 * list. Zod 4 emits a schema that is correct but not necessarily strict, so this
 * tightens it.
 *
 * @packageDocumentation
 */

import { z } from 'zod';

/** A JSON Schema node, as far as this module needs to understand one. */
interface SchemaNode {
  type?: string;
  properties?: Record<string, SchemaNode>;
  items?: SchemaNode;
  required?: string[];
  additionalProperties?: boolean;
  anyOf?: SchemaNode[];
  oneOf?: SchemaNode[];
  allOf?: SchemaNode[];
  [key: string]: unknown;
}

/**
 * Keywords a provider's structured-output mode rejects outright.
 *
 * Keyed by the `type` they appear on, because the same keyword may be fine
 * elsewhere: Anthropic accepts `minItems` on an array but refuses `maxItems`,
 * and accepts `minLength`/`maxLength` on a string while refusing
 * `minimum`/`maximum` on a number.
 *
 * Dropping one of these cannot weaken verification, and it is worth being exact
 * about why. The wire schema is a *hint* — it shapes what the model tends to
 * emit. The gate is the Zod schema, which is validated locally after the
 * response arrives and is never sent anywhere. So an array that exceeds a
 * dropped `maxItems` does not become an accepted claim; it becomes a counted
 * `schema_violation`, exactly as it would have had the provider enforced the
 * bound itself. The constraint moves from prevention to detection, and
 * detection is where this pipeline's guarantees already live.
 */
export type UnsupportedSchemaKeywords = Readonly<Record<string, readonly string[]>>;

/**
 * Anthropic's `output_config.format` dialect, established by probing the live
 * API rather than by reading a specification — every other keyword this
 * pipeline emits (`minItems`, `minLength`, `maxLength`, `pattern`, `format`,
 * `enum`, `anyOf`, `description`) was accepted.
 */
export const ANTHROPIC_UNSUPPORTED_SCHEMA_KEYWORDS: UnsupportedSchemaKeywords = {
  array: ['maxItems'],
  number: ['minimum', 'maximum'],
  integer: ['minimum', 'maximum'],
};

/** Removes the keywords a provider refuses, for this node's `type` only. */
function strip(node: SchemaNode, unsupported: UnsupportedSchemaKeywords): SchemaNode {
  const forType = typeof node.type === 'string' ? unsupported[node.type] : undefined;
  if (forType === undefined) return node;
  const kept: SchemaNode = { ...node };
  for (const keyword of forType) delete kept[keyword];
  return kept;
}

/**
 * Walks a schema making every object strict.
 *
 * `required` is set to *all* declared properties rather than to Zod's required
 * set. Strict structured-output modes reject a schema whose `required` omits a
 * declared key, and the pipeline's own Zod validation still applies afterwards —
 * so an optional field arrives as explicit `null` and is caught there rather
 * than causing the provider to refuse the request outright.
 */
function tighten(node: SchemaNode, unsupported: UnsupportedSchemaKeywords): SchemaNode {
  const self = strip(node, unsupported);
  if (self.type === 'object' && self.properties !== undefined) {
    const properties: Record<string, SchemaNode> = {};
    for (const [key, value] of Object.entries(self.properties)) {
      properties[key] = tighten(value, unsupported);
    }
    return {
      ...self,
      properties,
      required: Object.keys(properties),
      additionalProperties: false,
    };
  }
  if (self.type === 'array' && self.items !== undefined) {
    return { ...self, items: tighten(self.items, unsupported) };
  }
  for (const key of ['anyOf', 'oneOf', 'allOf'] as const) {
    const branch = self[key];
    if (Array.isArray(branch)) {
      return { ...self, [key]: branch.map((entry) => tighten(entry, unsupported)) };
    }
  }
  return self;
}

/**
 * Converts a Zod schema to a strict JSON Schema.
 *
 * `unsupported` names the keywords this particular provider refuses; see
 * {@link UnsupportedSchemaKeywords} for why removing them is safe. It defaults
 * to removing nothing, so a provider that accepts standard JSON Schema keeps
 * the full constraint set.
 */
export function toJsonSchema(
  schema: z.ZodType,
  unsupported: UnsupportedSchemaKeywords = {},
): Record<string, unknown> {
  const generated = z.toJSONSchema(schema, { io: 'input' }) as SchemaNode;
  return tighten(generated, unsupported) as Record<string, unknown>;
}
