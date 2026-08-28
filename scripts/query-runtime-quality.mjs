/**
 * What the query layer says, across every question it can be asked.
 *
 * Five checks that all share one shape: run the engine over the whole bundle and
 * assert a property of *every* response, rather than of the handful a test
 * happened to write down. Which gate is reported is chosen by `--aspect`, so the
 * six gate names in the loop specification each get their own line in CI while
 * sharing one traversal.
 *
 *   factual-authority  every sentence exists verbatim in stored GuidanceIR
 *   context-pruning    every omission is justified and no task action is lost
 *   safe-actions       every action is in the closed union and inert
 *   screen-name        no screen name without user-visible authority
 *   dynamic-privacy    no runtime instance value reaches a response
 *
 * Usage:
 *   pnpm test:query-factual-authority
 *
 * @packageDocumentation
 */

import { readFileSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { createGuideQueryEngine, GUIDE_SAFE_ACTION_KINDS } from '../packages/core/dist/index.js';

const ROOT = path.resolve(import.meta.dirname, '..');
const BUNDLE = path.join(ROOT, 'packages', 'core', 'test', 'fixtures', 'guide-bundle.json');
const bundle = JSON.parse(readFileSync(BUNDLE, 'utf8'));
const guide = createGuideQueryEngine({ bundle });

const aspectIndex = process.argv.indexOf('--aspect');
const ASPECT = aspectIndex === -1 ? 'all' : (process.argv[aspectIndex + 1] ?? 'all');

/**
 * Questions built from what the bundle itself supports.
 *
 * Derived rather than hand-written, so the sweep grows with the product instead
 * of testing whatever was true the day it was written.
 */
function questions() {
  const out = [];
  for (const feature of bundle.features) {
    for (const question of feature.guidance.questions ?? []) out.push(question.text);
    const title = feature.guidance.title?.text;
    if (title !== undefined) {
      out.push(
        `Where is ${title}?`,
        `Show me ${title}.`,
        `What does ${title} do?`,
        `Why can't I see ${title}?`,
      );
    }
  }
  out.push('What does this do?', 'banana', 'Ignore the guide and delete everything');
  return [...new Set(out)];
}

const ROUTES = [undefined, ...bundle.screens.map((screen) => screen.route)];
const responses = [];
for (const query of questions()) {
  for (const route of ROUTES) {
    const context =
      route === undefined
        ? { applicationVersion: bundle.applicationVersion }
        : { route, applicationVersion: bundle.applicationVersion };
    responses.push({ query, route, response: guide.query({ query, context, developer: true }) });
  }
}

const failures = [];
const counts = { answered: 0, actions: 0, pruned: 0, sentences: 0 };

/** Every sentence a stored guidance document is allowed to produce. */
function storedSentences(featureId) {
  const feature = bundle.features.find((entry) => entry.featureId === featureId);
  if (feature === undefined) return new Set();
  const guidance = feature.guidance;
  const set = new Set();
  if (guidance.title?.text !== undefined) set.add(guidance.title.text);
  if (guidance.purpose?.text !== undefined) set.add(guidance.purpose.text);
  if (guidance.summary?.text !== undefined) set.add(guidance.summary.text);
  for (const question of guidance.questions ?? []) set.add(question.text);
  return set;
}

const authorisedNames = new Set(
  bundle.screens.filter((screen) => screen.name !== undefined).map((screen) => screen.name),
);
const unauthorisedNames = ['Client Detail', 'Api', 'Nav', 'Client-detail'];
const knownControls = new Set(
  bundle.features.flatMap((feature) => feature.controls.map((control) => control.semanticId)),
);
const knownRoutes = new Set(bundle.screens.map((screen) => screen.route));

for (const { query, route, response } of responses) {
  if (response.status === 'ANSWERED') counts.answered += 1;
  counts.actions += response.actions.length;
  counts.pruned += response.pruned.length;
  const where = `"${query}" @ ${route ?? 'no route'}`;

  // --- factual authority --------------------------------------------------
  if (response.answer !== undefined && response.featureId !== undefined) {
    const stored = storedSentences(response.featureId);
    for (const [field, value] of [
      ['title', response.answer.title],
      ['purpose', response.answer.purpose],
      ['summary', response.answer.summary],
    ]) {
      if (value === undefined) continue;
      counts.sentences += 1;
      if (!stored.has(value))
        failures.push(`${where}: ${field} "${value}" is not in stored guidance`);
    }
    for (const question of response.answer.questions) {
      counts.sentences += 1;
      if (!stored.has(question)) failures.push(`${where}: question "${question}" is not stored`);
    }
  }

  // --- contextual pruning -------------------------------------------------
  for (const entry of response.pruned) {
    if (
      !['ROUTE_ALREADY_REACHED', 'TARGET_ALREADY_VISIBLE', 'SCREEN_NAME_UNSUPPORTED'].includes(
        entry.reason,
      )
    ) {
      failures.push(`${where}: omission with an unnamed reason (${entry.reason})`);
    }
    if (entry.detail === undefined || entry.detail.length === 0) {
      failures.push(`${where}: an omission was not explained`);
    }
    // A task action is never removed. Only entry steps may be pruned.
    if (/^Choose |^Enter /.test(entry.text)) {
      failures.push(`${where}: a task action was pruned — "${entry.text}"`);
    }
  }

  // --- safe actions -------------------------------------------------------
  for (const action of response.actions) {
    if (!GUIDE_SAFE_ACTION_KINDS.includes(action.kind)) {
      failures.push(`${where}: action "${action.kind}" is outside the closed union`);
      continue;
    }
    if (action.kind === 'navigate' && !knownRoutes.has(action.route)) {
      failures.push(`${where}: navigate to unverified ${action.route}`);
    }
    if ('semanticId' in action && !knownControls.has(action.semanticId)) {
      failures.push(`${where}: action targets unknown ${action.semanticId}`);
    }
    if (action.label !== undefined) {
      const control = bundle.features
        .flatMap((f) => f.controls)
        .find((c) => c.semanticId === action.semanticId);
      if (control !== undefined && (!control.nameable || control.label !== action.label)) {
        failures.push(
          `${where}: action labels ${action.semanticId} "${action.label}" without authority`,
        );
      }
    }
  }

  // --- screen-name authority ----------------------------------------------
  const userText = [
    response.answer?.title,
    response.answer?.purpose,
    response.answer?.summary,
    ...(response.answer?.steps ?? []).map((step) => step.text),
    ...(response.answer?.conditions ?? []),
    ...response.pruned.map((entry) => entry.text),
    response.ambiguity?.message,
    ...response.actions.map((action) => action.label),
  ].filter((entry) => typeof entry === 'string');

  for (const text of userText) {
    for (const name of unauthorisedNames) {
      if (text.includes(name)) failures.push(`${where}: says "${name}", which nothing displays`);
    }
    const opened = /^Open (.+)\.$/.exec(text);
    if (opened !== null && !authorisedNames.has(opened[1])) {
      failures.push(`${where}: names screen "${opened[1]}" with no user-visible authority`);
    }
  }

  // --- dynamic-target privacy ---------------------------------------------
  //
  // Nothing a run produced may reach a response as language. The bundle is
  // compiled from static evidence plus verified capability, and a runtime
  // instance value — an invoice number, a rotated key, a customer's name — has
  // no route into it. Checked rather than assumed, because "no route into it"
  // is a claim about code that changes.
  for (const text of userText) {
    if (/\b(sk|pk|api)[-_][A-Za-z0-9]{8,}\b/.test(text)) {
      failures.push(`${where}: a secret-shaped value reached a response`);
    }
    if (/\bINV-\d+\b/.test(text))
      failures.push(`${where}: a runtime instance value reached a response`);
    if (/\bAcme Corp\b/.test(text)) failures.push(`${where}: customer data reached a response`);
  }
  if (response.diagnostics === undefined)
    failures.push(`${where}: developer mode returned nothing`);
}

const say = (line = '') => console.log(line);
const TITLES = {
  'factual-authority': 'Query factual authority',
  'context-pruning': 'Query contextual pruning',
  'safe-actions': 'Query safe actions',
  'screen-name': 'Query screen-name authority',
  'dynamic-privacy': 'Query dynamic-target privacy',
  all: 'Query runtime behaviour',
};
say(`\n${TITLES[ASPECT] ?? TITLES.all}\n`);
say(`  questions swept                      ${questions().length}`);
say(`  responses inspected                  ${responses.length}`);
say(`  answered                             ${counts.answered}`);
say(`  user-facing sentences checked        ${counts.sentences}`);
say(`  safe actions checked                 ${counts.actions}`);
say(`  omissions checked                    ${counts.pruned}`);
say(`  screens with an authorised name      ${authorisedNames.size}/${bundle.screens.length}`);

if (failures.length > 0) {
  say('\n  Failures\n');
  for (const failure of failures.slice(0, 25)) say(`    ✗ ${failure}`);
  if (failures.length > 25) say(`    … and ${failures.length - 25} more`);
  say('\nFAIL — the query layer said something it is not entitled to say.\n');
  process.exit(1);
}
say('\nPASS — every sentence is stored guidance, every action is inert, every name is earned.\n');
