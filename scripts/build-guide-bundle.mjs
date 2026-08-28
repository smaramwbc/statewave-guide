/**
 * Compiles the knowledge a query engine runs on.
 *
 * This is the seam Closed Loop #12 draws. Everything upstream — the indexer, the
 * graph, feature scope, the verifier, the runtime — runs here, at build time,
 * and what crosses into the product-facing layer is data: compiled GuidanceIR,
 * verified routes, owned controls, required permissions, and the screens a user
 * may be told the names of.
 *
 * **Screen names are decided here**, because this is the last place with the
 * evidence to decide them. A navigation label names a destination only when it
 * is unambiguous: exactly one distinct user-visible label navigates to that
 * route. `/invoices` has two — "Invoices" and "All invoices" — and neither is
 * more authoritative than the other, so it gets no name. That costs a good name
 * in one place and removes every arbitrary tiebreak, which is the trade this
 * project has made at every previous naming decision.
 *
 * Usage:
 *   node scripts/build-guide-bundle.mjs [--check]
 *
 * @packageDocumentation
 */

import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import {
  buildEvidencePack,
  compileGuidance,
  computeFeatureScope,
  realiseInstruction,
} from '../packages/semantic/dist/index.js';
import { enrich, loadEverything } from './lib/runtime-integration.mjs';

const ROOT = path.resolve(import.meta.dirname, '..');
const OUT = path.join(ROOT, 'packages', 'core', 'test', 'fixtures', 'guide-bundle.json');
const CHECK = process.argv.includes('--check');

const loaded = await loadEverything(ROOT);
const { enriched } = enrich(loaded);
const nodeById = new Map(loaded.graph.nodes.map((node) => [node.id, node]));

/**
 * Screen names, from user-visible evidence only.
 *
 * Deliberately not `screenNameFrom`. Every entry step in the benchmark takes its
 * screen name from a route identifier, which is how four features came to say
 * "Open Client Detail" about a screen the application never calls that.
 */
function screens() {
  const byRoute = new Map();
  for (const node of loaded.graph.nodes) {
    if (node.kind !== 'route') continue;
    byRoute.set(node.path, { route: node.path, labels: new Map() });
  }
  for (const relationship of loaded.graph.relationships) {
    if (relationship.type !== 'navigates_to') continue;
    const target = nodeById.get(relationship.target);
    const source = nodeById.get(relationship.source);
    if (target?.kind !== 'route' || source?.kind !== 'element') continue;
    const label = typeof source.label === 'string' ? source.label.trim() : '';
    if (label.length === 0) continue;
    const screen = byRoute.get(target.path);
    if (screen === undefined) continue;
    screen.labels.set(label, (screen.labels.get(label) ?? 0) + 1);
  }

  const out = [];
  const debt = [];
  for (const screen of byRoute.values()) {
    const distinct = [...screen.labels.keys()];
    if (distinct.length === 1) {
      out.push({ route: screen.route, name: distinct[0], nameOrigin: 'navigation-label' });
    } else {
      out.push({ route: screen.route });
      debt.push({
        route: screen.route,
        reason: distinct.length === 0 ? 'NO_USER_VISIBLE_LABEL' : 'AMBIGUOUS_NAVIGATION_LABELS',
        candidates: distinct,
      });
    }
  }
  return { screens: out.sort((a, b) => (a.route < b.route ? -1 : 1)), debt };
}

const { screens: screenList, debt } = screens();

const features = [];
for (const feature of enriched.features) {
  const candidate = loaded.candidates.find((entry) => entry.id === feature.id);
  if (candidate === undefined) continue;
  const pack = buildEvidencePack(loaded.graph, candidate);
  const scope = computeFeatureScope({
    featureId: feature.id,
    roots: candidate.rootNodes,
    nodes: pack.nodes,
    relationships: pack.relationships,
  });
  const guidance = compileGuidance({
    model: enriched,
    feature,
    graph: loaded.graph,
    candidate,
    scope,
  });

  // Only what the feature owns, and only names the interface displays.
  const controls = [];
  for (const node of pack.nodes) {
    if (node.kind !== 'element') continue;
    if (scope.classify(node.id) !== 'OWNED') continue;
    const semanticId = node.id.slice('element:'.length);
    const label = typeof node.label === 'string' ? node.label.trim() : '';
    controls.push({
      semanticId,
      ...(label.length === 0 ? {} : { label }),
      // A control the interface never names is still addressable. An action can
      // point at it; a sentence may not name it. That separation is the whole
      // point of `clients.search`.
      nameable: label.length > 0,
    });
  }

  // The route the entry step was compiled against, taken from the step's own
  // destination rather than re-derived. It is what the screen-name check has to
  // be asked about, and re-deriving it would mean two answers to one question.
  const entry = guidance.steps.find((step) => step.origin === 'synthetic-entry');
  const entryNode = entry?.proposition?.destination?.nodeId;
  const entryRoute =
    typeof entryNode === 'string' && entryNode.startsWith('route:')
      ? entryNode.slice('route:'.length)
      : undefined;

  const routes = [
    ...new Set(
      [
        ...pack.nodes
          .filter((node) => node.kind === 'route' && scope.classify(node.id) !== 'OUTSIDE')
          .map((node) => node.path),
        ...(entryRoute === undefined ? [] : [entryRoute]),
      ].filter((route) => route !== '*'),
    ),
  ].sort();

  const requiredPermissions = [
    ...new Set(
      enriched.claims
        .filter(
          (claim) =>
            claim.featureId === feature.id &&
            claim.type === 'permission' &&
            claim.status === 'structurally_verified',
        )
        .map((claim) => claim.assertion?.permission)
        .filter((entry) => typeof entry === 'string'),
    ),
  ].sort();

  /**
   * The steps, phrased by the layer that owns phrasing.
   *
   * Closed Loop #12 re-derived instruction text inside the query engine from the
   * proposition union, and the copy was incomplete: `confirm_action` was not
   * handled, so every terminal step in the benchmark — four of them, including
   * *"Choose "Create client"."* — vanished from the answer without a trace. A
   * user was told to open a dialog and fill in three fields and never told to
   * submit it.
   *
   * The realiser here is the same one the Markdown instrument uses, so there is
   * one place that turns a proposition into a sentence. The query layer now
   * selects and prunes and phrases nothing, which is what it should have been
   * doing: an unhandled kind can no longer be a silent omission because there is
   * no second implementation to be incomplete.
   */
  const steps = [];
  for (const step of guidance.steps) {
    const text = realiseInstruction(step.proposition);
    if (text === undefined) {
      throw new Error(
        `${feature.id}: step ${step.index} (${step.proposition.kind}) has no realisation; ` +
          'a step that cannot be phrased must be an explicit refusal, never a disappearance',
      );
    }
    const owned = step.provenance.facts
      .filter((ref) => ref.startsWith('element:'))
      .map((ref) => ref.slice('element:'.length))
      .filter((id) => controls.some((control) => control.semanticId === id));
    const destination = step.proposition.destination;
    steps.push({
      index: step.index,
      kind: step.proposition.kind,
      role: step.role,
      origin: step.origin,
      text,
      ...(owned.length === 0 ? {} : { semanticId: owned[0] }),
      ...(typeof destination?.nodeId === 'string' && destination.nodeId.startsWith('route:')
        ? { screenRoute: destination.nodeId.slice('route:'.length), screenName: destination.text }
        : {}),
    });
  }

  /**
   * The object nouns this feature's *supported* language uses.
   *
   * Taken from compiled language propositions, each of which carries evidence —
   * so "invoice" is here because a verified capability claim established it, not
   * because a component is called `InvoiceList` or a semantic id starts with
   * `invoices.`. That distinction is the whole reason runtime instances can be
   * offered at all: a concept has to be earned before anything can be offered as
   * an instance of it.
   */
  const conceptNouns = [
    ...new Set(
      (guidance.languagePropositions ?? [])
        .filter((entry) => entry.type === 'object' && typeof entry.value === 'string')
        .map((entry) => entry.value),
    ),
  ].sort();

  features.push({
    featureId: feature.id,
    steps,
    conceptNouns,
    guidance,
    ...(entryRoute === undefined ? {} : { entryRoute }),
    routes,
    controls: controls.sort((a, b) => (a.semanticId < b.semanticId ? -1 : 1)),
    requiredPermissions,
  });
}

const bundle = {
  version: 1,
  applicationVersion: enriched.claims[0]?.provenance?.graphHash ?? 'unknown',
  features: features.sort((a, b) => (a.featureId < b.featureId ? -1 : 1)),
  screens: screenList,
};

const serialised = `${JSON.stringify(bundle, null, 2)}\n`;

if (CHECK) {
  const committed = readFileSync(OUT, 'utf8');
  if (committed !== serialised) {
    console.log('\nFAIL — the committed bundle is not what this script produces.\n');
    process.exit(1);
  }
  console.log('\nPASS — the committed guide bundle is reproducible.\n');
  process.exit(0);
}

writeFileSync(OUT, serialised);

const say = (line = '') => console.log(line);
say('\nGuide knowledge bundle\n');
say(`  features                             ${bundle.features.length}`);
say(
  `  controls                             ${bundle.features.reduce((n, f) => n + f.controls.length, 0)}`,
);
say(`  screens                              ${bundle.screens.length}`);
say(
  `  screens with an authorised name      ${bundle.screens.filter((s) => s.name !== undefined).length}`,
);
say('');
for (const screen of bundle.screens) {
  say(
    `    ${screen.route.padEnd(24)} ${screen.name === undefined ? '— (unnamed)' : `"${screen.name}" (${screen.nameOrigin})`}`,
  );
}
say('\n  Screen-name debt, stated rather than papered over:\n');
for (const entry of debt) {
  say(
    `    ${entry.route.padEnd(24)} ${entry.reason}${entry.candidates.length > 0 ? ` ${JSON.stringify(entry.candidates)}` : ''}`,
  );
}
say('');
say(`  ${path.relative(ROOT, OUT)}`);
say('');
