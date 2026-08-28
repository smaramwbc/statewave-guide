/**
 * Whether a capability still means one thing.
 *
 * Closed Loop #10 defined `select` twice — once in the runtime verifier, once in
 * the semantic integration table — and both copies said a route change was
 * enough. The pair of them put *"Lets you select an invoice."* in front of a
 * reviewer about a control that navigates to a client, and fixing it meant
 * finding both, the second by luck. `MECHANISM_ACTIONS` diverged the same way in
 * the same loop, emitting a summary the purpose compiler had already withheld.
 *
 * Two hand-written tables answering one semantic question will disagree. This
 * exists so the disagreement cannot be silent: every capability is defined once
 * in `CAPABILITY_REGISTRY`, every consumer is a projection of it, and a consumer
 * that grows a private opinion fails here rather than in a review package.
 *
 * Usage:
 *   pnpm test:capability-verification-registry-consistency
 *
 * @packageDocumentation
 */

import { readFileSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import {
  CAPABILITY_REGISTRY,
  EFFECT_TAXONOMY,
  capabilityDefinition,
  integrableCapabilities,
} from '../packages/shared/dist/index.js';
import { RUNTIME_VERIFICATION_RULES, runtimeRuleFor } from '../packages/semantic/dist/index.js';

const ROOT = path.resolve(import.meta.dirname, '..');
const failures = [];

// --- 1. The registry is internally coherent -------------------------------
const kinds = CAPABILITY_REGISTRY.map((entry) => entry.kind);
if (new Set(kinds).size !== kinds.length) failures.push('a capability is defined twice');

const effectKinds = new Set(EFFECT_TAXONOMY.map((entry) => entry.kind));
if (new Set(EFFECT_TAXONOMY.map((e) => e.kind)).size !== EFFECT_TAXONOMY.length) {
  failures.push('an effect kind is defined twice');
}
for (const entry of EFFECT_TAXONOMY) {
  // An effect that already means something has moved a decision out of the
  // verifier, where it is reviewable, and into the diff, where it is not.
  if (entry.semantics !== 'observation') {
    failures.push(`effect ${entry.kind} is an interpretation; the observer may only observe`);
  }
}
for (const entry of CAPABILITY_REGISTRY) {
  for (const kind of [...entry.requires, ...entry.refusedWhen]) {
    if (!effectKinds.has(kind)) {
      failures.push(`${entry.kind} names effect ${kind}, which is not in the taxonomy`);
      continue;
    }
    const effect = EFFECT_TAXONOMY.find((e) => e.kind === kind);
    if (effect?.eligibleForVerification !== true) {
      failures.push(`${entry.kind} rests on ${kind}, which is not eligible for verification`);
    }
  }
  if (entry.requires.length === 0) failures.push(`${entry.kind} requires nothing`);
  for (const kind of entry.requires) {
    if (entry.refusedWhen.includes(kind)) {
      failures.push(`${entry.kind} both requires and forbids ${kind}`);
    }
  }
  if (entry.requirement.trim().length === 0) failures.push(`${entry.kind} states no requirement`);
  if (entry.refusal.trim().length === 0) failures.push(`${entry.kind} names no refusal`);
}

// --- 2. Integration is a projection, not an opinion ------------------------
const integrable = new Set(integrableCapabilities());
const integrationKinds = RUNTIME_VERIFICATION_RULES.map((rule) => rule.action);

for (const action of integrationKinds) {
  const definition = capabilityDefinition(action);
  if (definition === undefined) {
    failures.push(`the integration layer knows "${action}", which the registry does not define`);
    continue;
  }
  if (!definition.integrable) {
    failures.push(`"${action}" is integrated but the registry does not permit it`);
  }
  const rule = runtimeRuleFor(action);
  if (JSON.stringify(rule?.requires) !== JSON.stringify(definition.requires)) {
    failures.push(`"${action}" requires different effects in the integration layer`);
  }
  if (JSON.stringify(rule?.refusedWhen) !== JSON.stringify(definition.refusedWhen)) {
    failures.push(`"${action}" refuses on different effects in the integration layer`);
  }
}
for (const kind of integrable) {
  if (!integrationKinds.includes(kind)) {
    failures.push(`"${kind}" is integrable and the integration layer does not know it`);
  }
}
if (new Set(integrationKinds).size !== integrationKinds.length) {
  failures.push('the integration layer lists a capability twice');
}

// --- 3. No second truth table anywhere ------------------------------------
//
// A structural check rather than a trusting one: the source is read, and any
// file other than the registry that writes down what a capability *requires* is
// a second definition regardless of whether it currently agrees.
const SUSPECT = ['packages/runtime/src/capabilities.ts', 'packages/semantic/src/runtime-claims.ts'];
for (const file of SUSPECT) {
  const source = readFileSync(path.join(ROOT, file), 'utf8');
  const declarations = source.match(/^\s*(requires|refusedWhen|actionKinds):\s*\[/gm) ?? [];
  if (declarations.length > 0) {
    failures.push(
      `${file} declares ${declarations.length} requirement list(s) of its own; the registry is the only place that may`,
    );
  }
}

const say = (line = '') => console.log(line);
say('\nCapability verification registry consistency\n');
say(`  capabilities defined                 ${CAPABILITY_REGISTRY.length}`);
say(`  integrable into the ProductModel     ${integrable.size}`);
say(`  effect kinds in the taxonomy         ${EFFECT_TAXONOMY.length}`);
say(
  `  eligible for verification            ${EFFECT_TAXONOMY.filter((e) => e.eligibleForVerification).length}`,
);
say('');
for (const entry of CAPABILITY_REGISTRY) {
  say(
    `    ${entry.kind.padEnd(16)} ${entry.integrable ? 'integrable' : 'verify-only'}  requires ${entry.requires.join('+')}${entry.refusedWhen.length > 0 ? `  not-when ${entry.refusedWhen.join(',')}` : ''}`,
  );
}

if (failures.length > 0) {
  say('\n  Failures\n');
  for (const failure of failures) say(`    ✗ ${failure}`);
  say('\nFAIL — a capability means more than one thing.\n');
  process.exit(1);
}
say('\nPASS — one definition per capability, and every consumer derives from it.\n');
