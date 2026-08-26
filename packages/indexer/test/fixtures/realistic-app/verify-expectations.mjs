/**
 * Checks that every claim in `expectations.json` still matches the fixture source.
 *
 * Run it after *any* edit to this directory:
 *
 *     node packages/indexer/test/fixtures/realistic-app/verify-expectations.mjs
 *
 * It has no dependencies and reads nothing outside this directory. It does not
 * run the indexer — it checks the ground truth itself, which is the file most
 * likely to rot: a line inserted anywhere shifts every reference below it.
 *
 * Matching an excerpt is not enough on its own. Several lines in this fixture
 * are byte-identical to each other — `const { clientId } = clientIdParamSchema
 * .parse(req.params);` appears in three handlers and `const rows = await
 * query<ClientRecord>(` in three service members — so an edge can cite the
 * wrong one and still pass an excerpt check. Everything below the graph
 * integrity section exists because of that: evidence is checked against the
 * brace-matched body of the declaration it hangs off, not just against the text
 * of one line.
 */
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const manifest = JSON.parse(readFileSync(path.join(ROOT, 'expectations.json'), 'utf8'));

const problems = [];
let checkedLocations = 0;

const INFERENCE_RULES = new Set([
  'jsx-handler-identifier', 'import-symbol-resolution', 'state-flag-gates-element', 'object-literal-service',
  'http-client-member-call', 'module-constant-string', 'router-handler-identifier',
  'configured-permission-recogniser', 'form-submit-wrapper',
]);
const DIAGNOSTICS = new Set([
  'INVALID_ELEMENT_ID', 'DUPLICATE_ELEMENT_ID', 'MISSING_TSCONFIG', 'NO_SOURCE_FILES', 'UNRESOLVED_DYNAMIC_CALL',
  'UNRESOLVED_DYNAMIC_ROUTE', 'UNSUPPORTED_FORM_PATTERN', 'UNRESOLVED_MODAL_REGISTRY', 'UNRESOLVED_API_PATH',
  'UNRESOLVED_IMPORT', 'UNRESOLVED_PERMISSION', 'UNSUPPORTED_ROUTING_PATTERN', 'PARSE_FAILURE',
]);
const RELATIONSHIP_TYPES = new Set([
  'renders', 'contains', 'invokes', 'opens', 'navigates_to', 'calls', 'submits_to',
  'uses_hook', 'uses_service', 'calls_api', 'requires_permission', 'validates_with',
]);
const CONFIDENCES = new Set([1.0, 0.95, 0.9]);
const KINDS = new Set(['file', 'route', 'component', 'element', 'function', 'hook', 'service', 'api', 'schema', 'permission', 'type']);
const HTTP_METHODS = new Set(['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS']);
const GUIDE_ID = /^[a-z0-9][a-z0-9-]*(?:\.[a-z0-9][a-z0-9-]*)*$/;
const MINIMUMS = { routes: 4, components: 12, elements: 25, functions: 30, apis: 6 };
const NODE_ID = /^(file|route|component|element|function|hook|service|api|schema|permission|type):/;
/** Relationship types whose evidence is conventionally the import statement, not a body line. */
const IMPORT_EVIDENCE = new Set(['uses_service']);
/** A comment anchor is a defect unless the trap *is* the comment. */
const COMMENT_TRAP = /comment|jsdoc|prose/i;

/** Blanks out string, template, regex and comment content, preserving offsets. */
function maskSource(text) {
  const out = text.split('');
  let i = 0;
  const n = text.length;
  let state = null; // 'line' | 'block' | quote char
  const prefixOperator = /[=(,:;[{!&|?+\-*%~^]$|\b(?:return|typeof|case|in|of|do|else)$/;
  while (i < n) {
    const c = text[i];
    if (state === null) {
      if (c === '/' && text[i + 1] === '/') { state = 'line'; out[i] = out[i + 1] = ' '; i += 2; continue; }
      if (c === '/' && text[i + 1] === '*') { state = 'block'; out[i] = out[i + 1] = ' '; i += 2; continue; }
      if (c === '\'' || c === '"' || c === '`') { state = c; out[i] = ' '; i += 1; continue; }
      if (c === '/') {
        const before = text.slice(0, i).replace(/\s+$/, '');
        if (before === '' || prefixOperator.test(before)) {
          let j = i + 1;
          while (j < n && text[j] !== '\n') {
            if (text[j] === '\\') { j += 2; continue; }
            if (text[j] === '[') { while (j < n && text[j] !== ']' && text[j] !== '\n') j += text[j] === '\\' ? 2 : 1; }
            else if (text[j] === '/') break;
            j += 1;
          }
          if (text[j] === '/') { for (let k = i; k <= j; k += 1) out[k] = ' '; i = j + 1; continue; }
        }
      }
      i += 1; continue;
    }
    if (state === 'line') { if (c === '\n') state = null; else out[i] = ' '; i += 1; continue; }
    if (state === 'block') {
      if (c === '*' && text[i + 1] === '/') { out[i] = out[i + 1] = ' '; state = null; i += 2; continue; }
      if (c !== '\n') out[i] = ' ';
      i += 1; continue;
    }
    if (c === '\\') { out[i] = ' '; if (text[i + 1] !== '\n') out[i + 1] = ' '; i += 2; continue; }
    if (c === state) { state = null; out[i] = ' '; i += 1; continue; }
    if (c !== '\n') out[i] = ' ';
    i += 1;
  }
  return out.join('');
}

const maskCache = new Map();
function maskedLines(relativePath) {
  if (!maskCache.has(relativePath)) {
    const lines = sourceLines(relativePath);
    maskCache.set(relativePath, lines === null ? null : maskSource(lines.join('\n')).split('\n'));
  }
  return maskCache.get(relativePath);
}

/**
 * The 1-indexed [start, end] of the body a declaration at `declLine` opens.
 *
 * The body brace is the first `{` at paren depth 0 *after* the parameter list
 * has closed, so `function C({ a, b }: P) {` does not terminate the scan on its
 * destructured parameter.
 */
function bodyRange(relativePath, declLine) {
  const masked = maskedLines(relativePath);
  if (masked === null || declLine > masked.length) return null;
  let paren = 0;
  let started = false;
  let depth = 0;
  for (let line = declLine - 1; line < masked.length; line += 1) {
    for (const ch of masked[line]) {
      if (!started) {
        if (ch === '(') { paren += 1; continue; }
        if (ch === ')') { paren -= 1; continue; }
        if (ch === '{' && paren === 0) { started = true; depth = 1; }
        continue;
      }
      if (ch === '{') depth += 1;
      else if (ch === '}') {
        depth -= 1;
        if (depth === 0) return [declLine, line + 1];
      }
    }
  }
  return started ? [declLine, masked.length] : null;
}

function isCommentLine(relativePath, line) {
  const raw = sourceLines(relativePath)[line - 1];
  const masked = maskedLines(relativePath)[line - 1];
  return raw.trim() !== '' && masked.trim() === '';
}

const fileCache = new Map();
function sourceLines(relativePath) {
  if (!fileCache.has(relativePath)) {
    const full = path.join(ROOT, relativePath);
    fileCache.set(relativePath, existsSync(full) ? readFileSync(full, 'utf8').split('\n') : null);
  }
  return fileCache.get(relativePath);
}

function checkLocation(node, where) {
  const { file, line, excerpt } = node;
  if (file.startsWith('/') || file.includes('\\')) {
    problems.push(`${where}: absolute or non-POSIX path "${file}"`);
    return;
  }
  const lines = sourceLines(file);
  if (lines === null) {
    problems.push(`${where}: file does not exist: ${file}`);
    return;
  }
  if (!Number.isInteger(line) || line < 1 || line > lines.length) {
    problems.push(`${where}: line ${line} out of range for ${file} (1..${lines.length})`);
    return;
  }
  checkedLocations += 1;
  if (excerpt === undefined) return;
  const actual = lines[line - 1].split(/\s+/).filter(Boolean).join(' ').slice(0, 120);
  if (actual !== excerpt) {
    problems.push(`${where}: excerpt mismatch at ${file}:${line}\n    manifest: ${JSON.stringify(excerpt)}\n    source:   ${JSON.stringify(actual)}`);
  }
}

function walk(value, where) {
  if (Array.isArray(value)) {
    value.forEach((child, index) => walk(child, `${where}[${index}]`));
  } else if (value !== null && typeof value === 'object') {
    if ('file' in value && 'line' in value) checkLocation(value, where);
    for (const [key, child] of Object.entries(value)) walk(child, `${where}.${key}`);
  }
}
walk(manifest, 'manifest');

for (const fragment of ['/Users/', 'C:\\\\', 'file://']) {
  if (JSON.stringify(manifest).includes(fragment)) {
    problems.push(`manifest contains an absolute path fragment: ${fragment}`);
  }
}

// --- node ids ---------------------------------------------------------------
const declared = new Set();
for (const [kind, entries] of Object.entries(manifest.nodes)) {
  for (const node of entries) {
    const id = node.id;
    if (declared.has(id)) problems.push(`duplicate node id: ${id}`);
    declared.add(id);
    if (id.split(':', 1)[0] !== kind) problems.push(`node id "${id}" filed under kind "${kind}"`);

    if (['component', 'function', 'hook', 'service', 'schema', 'type'].includes(kind)) {
      const rest = id.slice(id.indexOf(':') + 1);
      const hash = rest.lastIndexOf('#');
      if (hash === -1) {
        problems.push(`${kind} id missing #name: ${id}`);
      } else {
        const declPath = rest.slice(0, hash);
        const name = rest.slice(hash + 1);
        if (!declPath.startsWith('frontend/src/') && !declPath.startsWith('backend/src/')) {
          problems.push(`${kind} id path is not fixture-relative: ${id}`);
        }
        if (node.file && node.file !== declPath) problems.push(`${kind} id path disagrees with file: ${id}`);
        if (name !== node.name) problems.push(`${kind} id name disagrees with name field: ${id}`);
      }
    }
    if (kind === 'element') {
      const semantic = id.slice('element:'.length);
      if (!GUIDE_ID.test(semantic) || semantic.split('.').length > 8 || semantic.length > 128) {
        problems.push(`element id is not a valid guide id: ${id}`);
      }
      if (semantic !== node.elementId) problems.push(`element id/elementId disagree: ${id}`);
    }
    if (kind === 'api') {
      const [, method, ...rest] = id.split(':');
      const apiPath = rest.join(':');
      if (!HTTP_METHODS.has(method)) problems.push(`api id has an unknown method: ${id}`);
      if (!apiPath.startsWith('/') || apiPath.includes('//') || (apiPath.length > 1 && apiPath.endsWith('/'))) {
        problems.push(`api id path is not normalised: ${id}`);
      }
      if (apiPath.startsWith('/api/')) problems.push(`api id still carries the API base: ${id}`);
      if (id !== `api:${node.method}:${node.path}`) problems.push(`api id disagrees with its fields: ${id}`);
      if (node.observedOn.length === 0 || node.observedOn.some((side) => side !== 'frontend' && side !== 'backend')) {
        problems.push(`api node has a bad observedOn: ${id}`);
      }
    }
    if (kind === 'permission' && id !== `permission:${node.permission}`) {
      problems.push(`permission id disagrees with its value: ${id}`);
    }
  }
}

// --- relationships ----------------------------------------------------------
const edges = new Set();
manifest.relationships.forEach((edge, index) => {
  const where = `relationships[${index}] ${edge.type} ${edge.source} -> ${edge.target}`;
  if (!RELATIONSHIP_TYPES.has(edge.type)) problems.push(`${where}: unknown relationship type`);
  for (const role of ['source', 'target']) {
    if (!declared.has(edge[role])) problems.push(`${where}: ${role} is not a declared node`);
    if (!KINDS.has(edge[role].split(':', 1)[0])) problems.push(`${where}: ${role} has an unknown kind prefix`);
  }
  const key = `${edge.source}|${edge.type}|${edge.target}`;
  if (edges.has(key)) problems.push(`${where}: duplicate relationship triple`);
  edges.add(key);
  if (!CONFIDENCES.has(edge.expectedConfidence)) problems.push(`${where}: confidence ${edge.expectedConfidence} is not on the scale`);
  if (edge.expectedRule !== null && !INFERENCE_RULES.has(edge.expectedRule)) problems.push(`${where}: unknown inference rule "${edge.expectedRule}"`);
  if (edge.expectedRule === null && edge.tier === 'core' && edge.expectedConfidence !== 1.0) {
    problems.push(`${where}: a core edge below 1.0 must name a rule`);
  }
  if (edge.tier !== 'core' && edge.tier !== 'stretch') problems.push(`${where}: unknown tier "${edge.tier}"`);
  if (!edge.evidence) problems.push(`${where}: no evidence`);
});

manifest.expectedUnresolved.forEach((entry, index) => {
  if (entry.expectedDiagnostic !== null && !DIAGNOSTICS.has(entry.expectedDiagnostic)) {
    problems.push(`expectedUnresolved[${index}]: unknown diagnostic "${entry.expectedDiagnostic}"`);
  }
  if (entry.severity !== 'info' && entry.severity !== 'warning') {
    problems.push(`expectedUnresolved[${index}]: unknown severity`);
  }
});
// --- evidence attribution ---------------------------------------------------
// An edge whose source is a declaration must cite a line inside that
// declaration's body. This is the check that excerpt-matching cannot do: the
// three `clientIdParamSchema.parse(req.params)` lines are byte-identical, so a
// citation can name the wrong handler and match perfectly.
const declarationNodes = ['function', 'component', 'hook']
  .flatMap((kind) => manifest.nodes[kind] ?? []);
const nodeById = new Map();
for (const entries of Object.values(manifest.nodes)) {
  for (const node of entries) nodeById.set(node.id, node);
}
function ownerOf(file, line) {
  let best = null;
  for (const node of declarationNodes) {
    if (node.file !== file) continue;
    const range = bodyRange(node.file, node.line);
    if (range === null || line < range[0] || line > range[1]) continue;
    if (best === null || range[1] - range[0] < best.width) best = { id: node.id, width: range[1] - range[0] };
  }
  return best?.id ?? null;
}
manifest.relationships.forEach((edge, index) => {
  const evidence = edge.evidence;
  const source = nodeById.get(edge.source);
  if (!evidence?.file || !source?.file || source.file !== evidence.file) return;
  if (!['function', 'component', 'hook'].includes(edge.source.split(':', 1)[0])) return;
  if (IMPORT_EVIDENCE.has(edge.type)) return;
  if (/^\s*import\b/.test(sourceLines(evidence.file)[evidence.line - 1])) return;
  const range = bodyRange(source.file, source.line);
  if (range === null) return;
  if (evidence.line < range[0] || evidence.line > range[1]) {
    const owner = ownerOf(evidence.file, evidence.line);
    problems.push(
      `relationships[${index}] ${edge.type} ${edge.source} -> ${edge.target}: evidence ` +
      `${evidence.file}:${evidence.line} is outside the source's body (lines ${range[0]}-${range[1]})` +
      (owner ? `; that line belongs to ${owner}` : ''),
    );
  }
});

// --- traps may not be made of prose -----------------------------------------
for (const [section, entries] of Object.entries(manifest)) {
  if (!Array.isArray(entries)) continue;
  entries.forEach((entry, index) => {
    if (typeof entry?.file !== 'string' || typeof entry.line !== 'number') return;
    const lines = sourceLines(entry.file);
    if (lines === null || entry.line > lines.length) return;
    if (!isCommentLine(entry.file, entry.line)) return;
    if (COMMENT_TRAP.test(`${entry.why ?? ''} ${entry.pattern ?? ''}`)) return;
    problems.push(`${section}[${index}]: anchored to a comment line ${entry.file}:${entry.line} — a trap made of prose is not a trap`);
  });
}

// --- mustNotExist has a schema, and it is checked ---------------------------
manifest.mustNotExist.forEach((entry, index) => {
  const where = `mustNotExist[${index}]`;
  if (entry.kind === 'node') {
    for (const stray of ['type', 'sourceLike', 'targetLike']) {
      if (stray in entry) problems.push(`${where}: node entry carries the relationship field "${stray}"`);
    }
    if (typeof entry.idLike !== 'string') { problems.push(`${where}: node entry has no idLike`); return; }
    if (!NODE_ID.test(entry.idLike)) problems.push(`${where}: idLike "${entry.idLike}" is not a canonical node id`);
    if (entry.idLike.includes('*') && !/^api:\*:/.test(entry.idLike)) {
      problems.push(`${where}: idLike "${entry.idLike}" puts a wildcard outside an api: method`);
    }
    if (declared.has(entry.idLike) && !entry.extra) {
      problems.push(`${where}: idLike "${entry.idLike}" is a node this manifest declares; say what is forbidden with "extra"`);
    }
  } else if (entry.kind === 'relationship') {
    if ('idLike' in entry) problems.push(`${where}: relationship entry carries idLike`);
    if (!RELATIONSHIP_TYPES.has(entry.type)) problems.push(`${where}: unknown relationship type "${entry.type}"`);
    if (!entry.sourceLike && !entry.targetLike) problems.push(`${where}: names neither endpoint`);
    for (const role of ['sourceLike', 'targetLike']) {
      if (entry[role] !== undefined && !NODE_ID.test(entry[role])) {
        problems.push(`${where}: ${role} "${entry[role]}" is not a canonical node id`);
      }
    }
  } else {
    problems.push(`${where}: unknown kind "${entry.kind}"`);
  }
});

// --- expectedDiagnostics: resolves AND diagnoses -----------------------------
for (const [index, entry] of (manifest.expectedDiagnostics ?? []).entries()) {
  if (!DIAGNOSTICS.has(entry.expectedDiagnostic)) {
    problems.push(`expectedDiagnostics[${index}]: unknown diagnostic "${entry.expectedDiagnostic}"`);
  }
  if (!declared.has(entry.resolvesTo)) {
    problems.push(`expectedDiagnostics[${index}]: resolvesTo "${entry.resolvesTo}" is not a declared node — it belongs in expectedUnresolved`);
  }
}

// --- counts and minimums ----------------------------------------------------
const actualCounts = {
  routes: manifest.nodes.route.length,
  components: manifest.nodes.component.length,
  elements: manifest.nodes.element.length,
  functions: manifest.nodes.function.length,
  apis: manifest.nodes.api.length,
  relationships: manifest.relationships.length,
  permissions: manifest.nodes.permission.length,
  services: manifest.nodes.service.length,
  hooks: manifest.nodes.hook.length,
  schemas: manifest.nodes.schema.length,
  types: manifest.nodes.type.length,
  expectedUnresolved: manifest.expectedUnresolved.length,
  expectedDiagnostics: (manifest.expectedDiagnostics ?? []).length,
  mustNotExist: manifest.mustNotExist.length,
  ambiguous: manifest.ambiguous.length,
};
for (const key of Object.keys(manifest.counts)) {
  if (!(key in actualCounts)) problems.push(`counts.${key} is not checked by this script`);
}
for (const [key, value] of Object.entries(actualCounts)) {
  if (manifest.counts[key] !== value) problems.push(`counts.${key} says ${manifest.counts[key]} but there are ${value}`);
}
for (const [key, floor] of Object.entries(MINIMUMS)) {
  if (actualCounts[key] < floor) problems.push(`counts.${key} = ${actualCounts[key]} is below the required minimum ${floor}`);
}

// --- the flagship chain, hop by hop ----------------------------------------
const FLAGSHIP = [
  ['renders', 'route:/clients', 'component:frontend/src/pages/ClientsPage.tsx#ClientsPage'],
  ['contains', 'component:frontend/src/pages/ClientsPage.tsx#ClientsPage', 'element:clients.create'],
  ['invokes', 'element:clients.create', 'function:frontend/src/pages/ClientsPage.tsx#openCreateClient'],
  ['opens', 'function:frontend/src/pages/ClientsPage.tsx#openCreateClient', 'component:frontend/src/components/NewClientDialog.tsx#NewClientDialog'],
  ['renders', 'component:frontend/src/components/NewClientDialog.tsx#NewClientDialog', 'component:frontend/src/components/ClientForm.tsx#ClientForm'],
  ['submits_to', 'element:clients.create-dialog.form', 'function:frontend/src/components/ClientForm.tsx#submitClient'],
  ['calls', 'function:frontend/src/components/ClientForm.tsx#submitClient', 'function:frontend/src/services/clientService.ts#clientService.create'],
  ['calls_api', 'function:frontend/src/services/clientService.ts#clientService.create', 'api:POST:/clients'],
  ['invokes', 'api:POST:/clients', 'function:backend/src/controllers/clientController.ts#createClient'],
  ['calls', 'function:backend/src/controllers/clientController.ts#createClient', 'function:backend/src/services/clientService.ts#clientService.create'],
  ['requires_permission', 'api:POST:/clients', 'permission:clients:create'],
  ['requires_permission', 'element:clients.create', 'permission:clients:create'],
];
for (const [type, source, target] of FLAGSHIP) {
  if (!edges.has(`${source}|${type}|${target}`)) problems.push(`flagship hop missing: ${type} ${source} -> ${target}`);
}
const postClients = manifest.nodes.api.find((node) => node.id === 'api:POST:/clients');
if (!postClients || [...postClients.observedOn].sort().join(',') !== 'backend,frontend') {
  problems.push('api:POST:/clients is not observed on both sides');
}

console.log(`locations checked: ${checkedLocations}`);
console.log(`nodes: ${declared.size}   relationships: ${manifest.relationships.length}`);
console.log(`evidence attributed to a declaration body, mustNotExist schema and comment anchors: checked`);
if (problems.length > 0) {
  console.log(`\nPROBLEMS (${problems.length}):`);
  for (const problem of problems) console.log('  - ' + problem);
  process.exit(1);
}
console.log('\nOK: every file/line reference resolves, every excerpt matches, graph integrity holds.');
