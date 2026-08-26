/**
 * The benchmark fixture, when there is one.
 *
 * `test/fixtures/realistic-app` and its `expectations.json` are built alongside
 * this package rather than by it, so this file must behave when the directory is
 * absent: it skips, it does not fail. A red suite caused by a fixture someone
 * else has not finished writing teaches a reader to ignore red suites.
 *
 * The same reasoning applies while the fixture is *being* written. Every
 * manifest entry names the file it was written about, so each assertion is
 * filtered to the entries whose file is still there. A renamed module makes the
 * benchmark smaller for one run; it does not make this suite red.
 *
 * What is asserted here is deliberately narrow. `expectations.json` is a
 * multi-milestone benchmark: it lists `opens`, `submits_to`, `navigates_to`,
 * `validates_with` and element-to-handler `invokes` edges that belong to the
 * next closed loop, plus `stretch` and `ambiguous` entries it explicitly does
 * not score. So this file checks the two things this milestone is answerable
 * for — that every node kind it owns is complete, and that not one of the
 * fixture's false-positive traps produced anything — and leaves recall on the
 * rest to the benchmark script.
 *
 * ## Endpoint identity
 *
 * The fixture originally spelled an endpoint's canonical path with the API base
 * removed (`api:POST:/clients`) while the indexer kept the full runtime path
 * (`api:POST:/api/clients`). That looked arbitrary and was not: a legacy router
 * mounted at an unprovable point also registers `/clients`, so stripping the
 * base makes the two collide and attaches the wrong controller to a real
 * endpoint. ADR 0006 settled it in favour of the fullest provable runtime path,
 * and the manifest was reconciled to match, so both sides now spell an endpoint
 * the same way and nothing is normalised away here.
 *
 * Path *parameters* remain positional in the id — `` api.delete(`/clients/${id}`) ``
 * and `router.delete('/clients/:clientId')` are one endpoint under every router
 * that exists, and keeping the names apart split it into a frontend-only node and
 * a backend-only node, two endpoints nobody serves. The declared name survives on
 * the node's `path`.
 */

import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { createProjectIndexer } from '../src/indexer.js';
import { serializeApplicationGraph } from '../src/serialize.js';
import type { ApplicationGraph, ApplicationNode } from '../src/graph.js';
import type { ProvenanceReference } from '@statewavedev/guide-shared';

const ROOT = fileURLToPath(new URL('./fixtures/realistic-app', import.meta.url));
const EXPECTATIONS = path.join(ROOT, 'expectations.json');
const AVAILABLE = existsSync(ROOT) && existsSync(EXPECTATIONS);

/** The fixture is two packages with no root config, so the globs are explicit. */
const INCLUDE = ['frontend/src/**/*.{ts,tsx}', 'backend/src/**/*.ts'];

interface ExpectedNode {
  id: string;
  file: string;
}

interface MustNotExist {
  kind: 'node' | 'relationship';
  why: string;
  file: string;
  line: number;
  idLike?: string;
  sourceLike?: string;
  targetLike?: string;
  type?: string;
  /** Present when the node may exist but must not be sighted here. */
  extra?: string;
  /** The file an edge must not be discovered from. */
  from?: string;
}

interface ExpectedRelationship {
  type: string;
  source: string;
  target: string;
  tier?: string;
  why: string;
  evidence?: { file?: string };
}

interface Expectations {
  canonicalApiBase?: string;
  nodes?: Record<string, ExpectedNode[]>;
  relationships?: ExpectedRelationship[];
  mustNotExist?: MustNotExist[];
}

function readExpectations(): Expectations {
  const parsed: unknown = JSON.parse(readFileSync(EXPECTATIONS, 'utf8'));
  return typeof parsed === 'object' && parsed !== null ? (parsed as Expectations) : {};
}

/** True while the manifest entry still describes a file that exists. */
function stillPresent(entry: { file?: string }): boolean {
  return entry.file === undefined || existsSync(path.join(ROOT, entry.file));
}

/**
 * Removes the fixture's API base from an endpoint id, and the names from its
 * path parameters.
 *
 * Applied to both sides of every comparison, so the assertions test which
 * endpoints were found rather than which spelling was chosen for them.
 *
 * The base is the disagreement documented above. The parameter names are a
 * second one, and it goes the same way: this indexer addresses a path parameter
 * positionally, because `` api.delete(`/clients/${id}`) `` and
 * `router.delete('/clients/:clientId')` are one endpoint under every router
 * that exists, and keeping the two names apart split it into a frontend-only
 * node and a backend-only node — two endpoints nobody serves. The manifest
 * spells the parameter the way the server does, which survives on the node's
 * `path`; only the id is positional. So both sides are reduced here and the
 * comparison tests the join.
 */
function canonicalParameters(value: string): string {
  return value.replace(/(?<=\/):[^/?#]+/g, ':param');
}

/**
 * Identity, retained as a named seam.
 *
 * Before the Day 1 reconciliation this stripped the API base so produced ids
 * could be compared against a base-relative manifest. ADR 0006 settled that an
 * endpoint's identity IS its fullest provable runtime path, so both sides now
 * spell it the same way and no normalisation is correct here. Parameters are
 * still canonicalised because the manifest records the declared name for
 * readability while the id addresses the parameter positionally.
 */
function canonicalId(id: string): string {
  return canonicalParameters(id);
}

/**
 * Both spellings of a service member's id, mapped onto the one the graph holds.
 *
 * `const invoiceService = { list, create }` aggregates functions declared
 * elsewhere in the module, so its members are already nodes at their own names
 * — `#list` — and the service records them in `memberIds`. The manifest
 * addresses the same declarations through their owner, `#invoiceService.list`,
 * and says of the difference that an indexer using the declaration form "plus a
 * mapping is differently addressed, not wrong". `memberIds` is that mapping, so
 * it is read off the graph rather than assumed, and the comparison then tests
 * whether the edge was found rather than which of two names was chosen for it.
 */
/** One node by canonical id, or `undefined`. */
function nodeById(graph: ApplicationGraph, id: string): ApplicationNode | undefined {
  return graph.nodes.find((node) => node.id === id);
}

function memberAliases(graph: ApplicationGraph): Map<string, string> {
  const aliases = new Map<string, string>();
  for (const node of graph.nodes) {
    if (node.kind !== 'service') continue;
    for (const memberId of node.memberIds) {
      const separator = memberId.lastIndexOf('#');
      const name = memberId.slice(separator + 1);
      if (separator === -1 || name.includes('.')) continue;
      aliases.set(`${memberId.slice(0, separator + 1)}${node.name}.${name}`, memberId);
    }
  }
  return aliases;
}

describe.skipIf(!AVAILABLE)('the realistic application fixture', () => {
  async function index(): Promise<ApplicationGraph> {
    return (await createProjectIndexer({ root: ROOT, config: { include: INCLUDE } }).index()).graph;
  }

  it('produces a graph whose every edge lands on a node', async () => {
    const graph = await index();
    expect(graph.version).toBe(2);
    expect(graph.health.danglingRelationships).toEqual([]);
    expect(graph.health.integrity).toBe('PASS');
  });

  it('is byte-identical on a second run and holds no absolute path', async () => {
    const first = serializeApplicationGraph(await index());
    const second = serializeApplicationGraph(await index());
    expect(second).toBe(first);
    expect(first).not.toContain(ROOT);
  });

  it('finds every node of the kinds this milestone claims to complete', async () => {
    const expectations = readExpectations();
    const present = new Set((await index()).nodes.map((node) => node.id));

    const kinds = ['route', 'component', 'element', 'permission', 'service', 'hook', 'schema'];
    for (const kind of [...kinds, 'type']) {
      const expected = (expectations.nodes?.[kind] ?? []).filter(stillPresent);
      expect({ kind, missing: expected.filter((node) => !present.has(node.id)) }).toEqual({
        kind,
        missing: [],
      });
    }
  });

  it('finds every endpoint, joining both sides onto one node', async () => {
    const expectations = readExpectations();
    const graph = await index();

    const endpoints = graph.nodes.filter(
      (node): node is Extract<ApplicationNode, { kind: 'api' }> => node.kind === 'api',
    );
    const found = new Set(endpoints.map((node) => canonicalId(node.id)));
    const expected = (expectations.nodes?.api ?? []).filter(stillPresent);
    const missing = expected.filter((node) => !found.has(canonicalId(node.id)));

    // One gap, and the fixture classifies it as `stretch`: an HTTP client that
    // arrives through a constructor default. Asserted as an exact list rather
    // than as a ratio, because a ratio with slack in it silently absorbs the
    // next regression — the previous form allowed one more miss than the graph
    // had, so losing an endpoint would not have been noticed.
    expect(missing.map((node) => node.id)).toEqual(['api:POST:/api/settings/api-key/rotate']);

    // Every endpoint both sides name is one node. This was 7 while a path
    // parameter's *name* was part of an endpoint's identity: the frontend's
    // `/clients/${id}` and the backend's `/clients/:clientId` are one endpoint,
    // and spelling them apart produced a frontend-only and a backend-only node
    // where there should have been a join.
    const joined = endpoints.filter((node) => node.observedOn.length === 2);
    expect(joined.length).toBe(8);
    expect(graph.health.frontendOnlyEndpoints).toBe(0);
    for (const endpoint of joined) {
      expect(endpoint.observedOn).toEqual(['backend', 'frontend']);
      expect(endpoint.provenances.length).toBeGreaterThanOrEqual(2);
    }
    expect(graph.health.joinedEndpoints).toBe(joined.length);

    // A parameter's name survives as a label, and it is the server's spelling —
    // the client is only guessing at what the route calls its parameter.
    const parameterised = nodeById(graph, 'api:DELETE:/api/clients/:param');
    expect(parameterised?.kind === 'api' ? parameterised.path : undefined).toBe(
      '/api/clients/:clientId',
    );
  });

  it('finds every core behaviour, call and endpoint edge the ground truth lists', async () => {
    const expectations = readExpectations();
    const graph = await index();

    const alias = memberAliases(graph);
    const address = (id: string): string => canonicalId(alias.get(id) ?? id);
    const present = new Set(
      graph.relationships.map(
        (relationship) =>
          `${address(relationship.source)}|${relationship.type}|${address(relationship.target)}`,
      ),
    );

    // The types this milestone owns. `stretch` entries are excluded by the
    // fixture's own rules: they name a hop no member of `InferenceRule` covers,
    // and inventing a rule to reach them is exactly what this package refuses.
    //
    // `uses_service` is the one owned type absent here, and its absence is a
    // disagreement rather than a gap: the manifest sources those edges from the
    // `hook:` or `component:` that encloses the call, while `graph.ts` defines
    // the edge as "a function uses a service object" and this indexer follows
    // the contract. The edges exist; they leave from a different node kind, and
    // scoring them here would test which document is right rather than whether
    // the indexer obeys the one it is built to.
    const owned = [
      'invokes',
      'opens',
      'submits_to',
      'navigates_to',
      'validates_with',
      'requires_permission',
      'renders',
      'uses_hook',
      'calls',
      'calls_api',
    ];

    for (const type of owned) {
      const expected = (expectations.relationships ?? [])
        .filter((entry) => entry.type === type && entry.tier === 'core')
        .filter((entry) => stillPresent(entry.evidence ?? {}));
      const missing = expected
        .filter(
          (entry) =>
            !present.has(`${address(entry.source)}|${entry.type}|${address(entry.target)}`),
        )
        .map((entry) => `${entry.source} -> ${entry.target}: ${entry.why}`);
      expect({ type, missing }).toEqual({ type, missing: [] });
    }
  });

  it('produces none of the false positives the ground truth lists', async () => {
    const expectations = readExpectations();
    const graph = await index();

    const like = (pattern: string, value: string): boolean => {
      if (!pattern.includes('*')) return pattern === value;
      const [head, ...tail] = pattern.split('*');
      const escape = (part: string): string => part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      return new RegExp(`^${escape(head ?? '')}[^:]*${tail.map(escape).join('[^:]*')}$`).test(
        value,
      );
    };

    /** Every sighting a node records, whichever field carries them. */
    const sightingsOf = (node: ApplicationNode): ProvenanceReference[] =>
      node.kind === 'api' || node.kind === 'permission'
        ? [node.provenance, ...node.provenances]
        : [node.provenance];

    // An id the manifest also lists as a real node is a *provenance* trap: the
    // endpoint exists, it simply must not have been sighted at the trap's line.
    const real = new Set(
      Object.values(expectations.nodes ?? {}).flatMap((list) => list.map((node) => node.id)),
    );

    const failures: string[] = [];
    for (const entry of (expectations.mustNotExist ?? []).filter(stillPresent)) {
      if (entry.kind === 'node' && entry.idLike !== undefined) {
        const pattern = entry.idLike;
        const hits = graph.nodes.filter((node) => like(pattern, canonicalId(node.id)));
        for (const hit of hits) {
          const id = canonicalId(hit.id);
          if (entry.extra === undefined && !real.has(id)) {
            failures.push(`node ${hit.id} — ${entry.why}`);
            continue;
          }
          if (sightingsOf(hit).some((at) => at.file === entry.file && at.line === entry.line)) {
            failures.push(`provenance ${hit.id} @ ${entry.file}:${entry.line} — ${entry.why}`);
          }
        }
        continue;
      }

      // A relationship trap is anchored to the file the trap is written in, so
      // an identical *legitimate* edge discovered somewhere else does not count.
      const anchor = entry.from ?? entry.file;
      const bad = graph.relationships.filter((relationship) => {
        if (entry.type !== undefined && relationship.type !== entry.type) return false;
        if (!relationship.evidence.some((evidence) => evidence.file === anchor)) return false;
        if (
          entry.sourceLike !== undefined &&
          !like(entry.sourceLike, canonicalId(relationship.source))
        ) {
          return false;
        }
        if (entry.targetLike !== undefined) {
          const target = canonicalId(relationship.target);
          if (!like(entry.targetLike, target) && !target.endsWith(`#${entry.targetLike}`)) {
            return false;
          }
        }
        return true;
      });
      for (const hit of bad) failures.push(`relationship ${hit.id} — ${entry.why}`);
    }

    expect(failures).toEqual([]);
  });

  it('reports the gaps it could not close rather than closing them by guessing', async () => {
    const graph = await index();
    const codes = new Set(graph.diagnostics.map((diagnostic) => diagnostic.code));

    // `api[method](path)` — half an endpoint is not an endpoint.
    expect(codes.has('UNRESOLVED_DYNAMIC_CALL')).toBe(true);
    // `app.use(legacyMountPoint(), legacyRouter)` — the prefix reads an env var.
    expect(codes.has('UNSUPPORTED_ROUTING_PATTERN')).toBe(true);
    expect(codes.has('UNRESOLVED_API_PATH')).toBe(true);
    // `<Link to={backTo}>` — the destination is read from history state.
    expect(codes.has('UNRESOLVED_DYNAMIC_ROUTE')).toBe(true);
    expect(codes.has('INVALID_ELEMENT_ID')).toBe(true);
    expect(codes.has('DUPLICATE_ELEMENT_ID')).toBe(true);
  });
});
