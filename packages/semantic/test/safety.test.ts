/**
 * The last gate before repository text leaves the machine.
 *
 * Two independent defences, tested independently, because either one alone
 * fails open: a path rule cannot catch a key pasted into an ordinary component,
 * and a redactor cannot catch a whole file of them.
 *
 * The table in `every default pattern` is the point of this file. Asserting that
 * *some* patterns work would let a rule be deleted, or quietly broken by a
 * change to the glob compiler, without a single test going red. So the table is
 * checked for completeness against `DEFAULT_SENSITIVE_PATTERNS` itself: adding a
 * pattern without a sample fails here, and so does deleting one.
 *
 * Both rules prefer false positives to leaks. A redacted excerpt costs a model a
 * little context and produces a slightly worse sentence; a leaked key costs a
 * customer their production database. Several tests below assert the *false
 * positive* rather than treating it as a defect, because it is the trade being
 * made on purpose.
 */

import { describe, expect, it } from 'vitest';
import {
  CONFIDENCE,
  componentId,
  createRelationship,
  elementId,
  functionId,
  permissionId,
  routeId,
} from '@statewavedev/guide-indexer';
import type { ApplicationGraph, ApplicationNode } from '@statewavedev/guide-indexer';
import type { ProvenanceReference } from '@statewavedev/guide-shared';
import { buildEvidencePack } from '../src/evidence-pack.js';
import { projectDocs } from '../src/docs.js';
import { enrichApplicationGraph } from '../src/enrich.js';
import { serializeProductModel } from '../src/product-file.js';
import { renderEvidence } from '../src/prompt.js';
import { createMockProvider } from '../src/providers/mock.js';
import {
  DEFAULT_SENSITIVE_PATTERNS,
  REDACTION_PLACEHOLDER,
  isSensitivePath,
  redactSecrets,
} from '../src/safety.js';
import { ID, clientsGraph, makeGraph } from './helpers.js';

describe('isSensitivePath', () => {
  /** One sample path per default pattern. Checked for completeness below. */
  const SAMPLES: Record<string, string> = {
    '.env': '.env',
    '.env.*': '.env.production',
    '*.env': 'apps/web/local.env',
    '.npmrc': '.npmrc',
    '.yarnrc': '.yarnrc',
    '.netrc': '.netrc',
    _netrc: '_netrc',
    '.pgpass': '.pgpass',
    '.htpasswd': 'config/.htpasswd',
    '.dockercfg': '.dockercfg',
    '.docker/config.json': '.docker/config.json',
    '*.pem': 'certs/server.pem',
    '*.key': 'certs/server.key',
    '*.p8': 'keys/AuthKey.p8',
    '*.p12': 'keys/bundle.p12',
    '*.pfx': 'keys/bundle.pfx',
    '*.pkcs12': 'keys/bundle.pkcs12',
    '*.jks': 'keys/store.jks',
    '*.keystore': 'keys/release.keystore',
    '*.asc': 'keys/public.asc',
    '*.gpg': 'keys/secring.gpg',
    '*.ppk': 'keys/putty.ppk',
    id_rsa: 'id_rsa',
    'id_rsa*': 'deploy/id_rsa.pub',
    'id_dsa*': 'deploy/id_dsa',
    'id_ecdsa*': 'deploy/id_ecdsa',
    'id_ed25519*': 'deploy/id_ed25519',
    'credentials*': 'aws/credentials.json',
    'secrets/**': 'packages/api/secrets/keys.ts',
    'secret/**': 'secret/token.txt',
    '.ssh/**': 'home/.ssh/known_hosts',
    '.aws/**': '.aws/credentials',
    '.gnupg/**': '.gnupg/pubring.kbx',
    '.config/gcloud/**': '.config/gcloud/application_default_credentials.json',
    '*service-account*.json': 'infra/prod-service-account-key.json',
    '*serviceaccount*.json': 'infra/serviceaccount.json',
    '*.tfstate': 'infra/terraform.tfstate',
    '*.tfstate.*': 'infra/terraform.tfstate.backup',
    'terraform.tfvars': 'infra/terraform.tfvars',
    'terraform.tfvars.*': 'infra/terraform.tfvars.json',
    '*.kubeconfig': 'infra/prod.kubeconfig',
    kubeconfig: 'infra/kubeconfig',
    '*.log': 'logs/app.log',
    '*.sql': 'db/dump.sql',
    '*.dump': 'db/nightly.dump',
    'node_modules/**': 'node_modules/react/index.js',
    'dist/**': 'dist/index.js',
    'build/**': 'build/main.js',
    'out/**': 'out/server.js',
    'coverage/**': 'coverage/lcov-report/index.html',
    '.next/**': '.next/server/pages.js',
    '.turbo/**': '.turbo/cache/x.json',
    '.git/**': '.git/config',
  };

  it('has a sample for every default pattern, and no sample for a pattern that is gone', () => {
    expect(Object.keys(SAMPLES).sort()).toEqual([...DEFAULT_SENSITIVE_PATTERNS].sort());
  });

  for (const [pattern, sample] of Object.entries(SAMPLES)) {
    it(`excludes ${sample} via ${pattern}`, () => {
      expect(isSensitivePath(sample)).toBe(true);
    });
  }

  it('lets ordinary source through', () => {
    for (const path of [
      'src/pages/Clients.tsx',
      'src/services/clientService.ts',
      'packages/api/src/routes/clients.ts',
      'README.md',
      'package.json',
    ]) {
      expect(isSensitivePath(path), path).toBe(false);
    }
  });

  it('matches at every segment boundary, so depth cannot hide a file', () => {
    expect(isSensitivePath('apps/api/secrets/keys.ts')).toBe(true);
    expect(isSensitivePath('a/b/c/d/e/f/.env')).toBe(true);
    expect(isSensitivePath('vendor/node_modules/left-pad/index.js')).toBe(true);
  });

  it('normalises Windows separators, leading slashes and `./`', () => {
    expect(isSensitivePath('packages\\api\\secrets\\keys.ts')).toBe(true);
    expect(isSensitivePath('/secrets/keys.ts')).toBe(true);
    expect(isSensitivePath('./.env')).toBe(true);
    expect(isSensitivePath('secrets//keys.ts')).toBe(true);
  });

  it('ignores case, because a filesystem often does too', () => {
    expect(isSensitivePath('Certs/Server.PEM')).toBe(true);
    expect(isSensitivePath('.ENV')).toBe(true);
  });

  it('treats an empty or blank path as nothing to exclude', () => {
    expect(isSensitivePath('')).toBe(false);
    expect(isSensitivePath('   ')).toBe(false);
  });

  it('keeps `*` inside one segment', () => {
    // `*.pem` must not swallow a directory: `pem/notes.md` is ordinary source.
    expect(isSensitivePath('pem/notes.md')).toBe(false);
  });

  it('adds extra patterns without letting the defaults be switched off', () => {
    expect(isSensitivePath('internal/fixtures.ts')).toBe(false);
    expect(isSensitivePath('internal/fixtures.ts', ['internal/**'])).toBe(true);
    // The defaults still apply when a caller supplies its own list.
    expect(isSensitivePath('.env', ['internal/**'])).toBe(true);
  });

  it('excludes derived output as well as secrets, and says why by including it', () => {
    // Not secret — simply not the team's own source. A feature explained from a
    // bundled vendor file would be explained from code nobody wrote.
    expect(isSensitivePath('dist/index.js')).toBe(true);
    expect(isSensitivePath('node_modules/react/index.js')).toBe(true);
  });
});

describe('redactSecrets', () => {
  /** Every shape the redactor is meant to recognise. */
  const SHAPES: { name: string; text: string; leaked: string }[] = [
    {
      name: 'a whole private key block',
      text: '-----BEGIN RSA PRIVATE KEY-----\nMIIBOgIBAAJBAK\n-----END RSA PRIVATE KEY-----',
      leaked: 'MIIBOgIBAAJBAK',
    },
    {
      name: 'a truncated private key header',
      text: 'const key = `-----BEGIN PRIVATE KEY-----`;',
      leaked: '-----BEGIN PRIVATE KEY-----',
    },
    {
      name: 'a JSON web token',
      text: 'Authorization: eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjMifQ.dBjftJeZ4CVP',
      leaked: 'eyJhbGciOiJIUzI1NiJ9',
    },
    {
      name: 'a bearer header',
      text: 'headers: { Authorization: "Bearer abcdef1234567890" }',
      leaked: 'abcdef1234567890',
    },
    {
      name: 'a basic header',
      text: 'Authorization: Basic dXNlcjpwYXNzd29yZA==',
      leaked: 'dXNlcjpwYXNzd29yZA',
    },
    {
      name: 'an sk- prefixed key',
      text: 'const key = "sk-abcdefghijklmnop123456";',
      leaked: 'sk-abcdefghijklmnop123456',
    },
    {
      name: 'a personal access token',
      text: 'ghp_abcdefghijklmnopqrstuvwxyz0123456789',
      leaked: 'ghp_abcdefghijklmnopqrstuvwxyz0123456789',
    },
    {
      name: 'a fine-grained access token',
      text: 'github_pat_abcdefghijklmnopqrstuvwxyz0123',
      leaked: 'github_pat_abcdefghijklmnopqrstuvwxyz0123',
    },
    {
      name: 'a project access token',
      text: 'glpat-abcdefghijklmnopqrst',
      leaked: 'glpat-abcdefghijklmnopqrst',
    },
    {
      name: 'a workspace token',
      text: 'xoxb-123456789012-abcdefghijkl',
      leaked: 'xoxb-123456789012-abcdefghijkl',
    },
    {
      name: 'a registry token',
      text: 'npm_abcdefghijklmnopqrstuvwxyz0123456789',
      leaked: 'npm_abcdefghijklmnopqrstuvwxyz0123456789',
    },
    {
      name: 'a cloud access key id',
      text: 'AKIAIOSFODNN7EXAMPLE',
      leaked: 'AKIAIOSFODNN7EXAMPLE',
    },
    {
      name: 'another cloud key prefix',
      text: 'AIzaSyA1234567890abcdefghijklmnopqrs',
      leaked: 'AIzaSyA1234567890abcdefghijklmnopqrs',
    },
    {
      name: 'an assignment to a secret-shaped name',
      text: 'const password = "hunter2";',
      leaked: 'hunter2',
    },
    {
      name: 'an environment-style assignment',
      text: 'AWS_SECRET_ACCESS_KEY=wJalrXUtnFEMIK7MDENGbPxRfiCY',
      leaked: 'wJalrXUtnFEMIK7MDENGbPxRfiCY',
    },
    {
      name: 'a long hexadecimal run',
      text: 'signature: 0123456789abcdef0123456789abcdef',
      leaked: '0123456789abcdef0123456789abcdef',
    },
    {
      name: 'a long base64 run',
      text: 'blob = "QUJDREVGR0hJSktMTU5PUFFSU1RVVldYWVowMTIzNDU2Nzg5"',
      leaked: 'QUJDREVGR0hJSktMTU5PUFFSU1RVVldYWVowMTIzNDU2Nzg5',
    },
  ];

  for (const shape of SHAPES) {
    it(`redacts ${shape.name}`, () => {
      const redacted = redactSecrets(shape.text);

      expect(redacted).not.toContain(shape.leaked);
      expect(redacted).toContain(REDACTION_PLACEHOLDER);
    });
  }

  it('keeps the scheme so a reader can still see what kind of header it was', () => {
    expect(redactSecrets('Authorization: Bearer abcdef1234567890')).toBe(
      `Authorization: Bearer ${REDACTION_PLACEHOLDER}`,
    );
  });

  it('keeps the name so a reader can still see what was set', () => {
    expect(redactSecrets('const apiKey = "abc123xyz";')).toBe(
      `const apiKey = ${REDACTION_PLACEHOLDER};`,
    );
  });

  it('is idempotent, so redacting twice is redacting once', () => {
    for (const shape of SHAPES) {
      const once = redactSecrets(shape.text);
      expect(redactSecrets(once)).toBe(once);
    }
  });

  it('leaves ordinary code alone', () => {
    for (const text of [
      'const clients = await listClients();',
      'export function handleCreate() { return post("/clients"); }',
      '<button data-guide="clients.create">New client</button>',
      'if (user.role === "admin") return true;',
    ]) {
      expect(redactSecrets(text), text).toBe(text);
    }
  });

  it('leaves ordinary English and ordinary TypeScript intact', () => {
    // Every line here was mangled by the scheme rule or the key/value rule.
    // Two of them are not cosmetic: `===` came back as `=[redacted]`, which
    // changes what the code does if a reader copies it, and a `{` was eaten out
    // of a type declaration. The rest reach users, because `verifier.ts` runs
    // this same function over generated prose — a feature whose model title was
    // "Basic authentication" was published as "Basic".
    for (const text of [
      'interface Session { token: string; apiKey: string }',
      '// Basic authentication is required for this endpoint',
      '// Token expiration is handled by the refresh hook',
      'basic validation of the payload happens here',
      'if (user.password === input.password) return true',
      'type Credentials = { token: JwtToken }',
      'export const secretSauce = computeLayout(rows)',
      'const apiKeyRef = useRef<HTMLInputElement>(null)',
      'label="Basic information"',
      'const onSubmit = (password) => save(password)',
    ]) {
      expect(redactSecrets(text), text).toBe(text);
    }
  });

  it('still redacts the same shapes when they carry an actual credential', () => {
    // The positive control for the rule above: relaxing it must not have
    // relaxed it into uselessness.
    expect(redactSecrets('Authorization: Basic dXNlcjpwYXNzd29yZA==')).toContain(
      REDACTION_PLACEHOLDER,
    );
    expect(redactSecrets('const password = "hunter2"')).toContain(REDACTION_PLACEHOLDER);
    expect(redactSecrets('apiKey: process.env.STRIPE_KEY')).toContain(REDACTION_PLACEHOLDER);
    expect(redactSecrets('AWS_SECRET_ACCESS_KEY=wJalrXUtnFEMIK7MDENGbPxRfiCY')).toContain(
      REDACTION_PLACEHOLDER,
    );
  });

  it('redacts a hash it cannot tell from a key, on purpose', () => {
    // A false positive. A slightly poorer sentence is the price of never
    // shipping a raw key to a vendor's request log, and it is worth paying.
    const commit = 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855';
    expect(redactSecrets(`sha: ${commit}`)).toBe(`sha: ${REDACTION_PLACEHOLDER}`);
  });

  it('handles every shape at once without carrying state between calls', () => {
    const all = SHAPES.map((shape) => shape.text).join('\n');

    const first = redactSecrets(all);
    const second = redactSecrets(all);

    expect(second).toBe(first);
    for (const shape of SHAPES) expect(first).not.toContain(shape.leaked);
  });

  it('returns an empty string unchanged', () => {
    expect(redactSecrets('')).toBe('');
  });
});

describe('a planted key never reaches a pack', () => {
  const KEY = 'ghp_plantedabcdefghijklmnopqrstuvwxyz01';
  const SECRET_FILE = 'src/config/.env';

  /** A page whose label, whose excerpt and whose neighbour all carry a key. */
  function plantedGraph(): ApplicationGraph {
    const provenance = (file: string, line: number): ProvenanceReference => ({
      source: 'source-code',
      file,
      line,
      column: 1,
    });
    const button: ApplicationNode = {
      id: elementId('clients.create'),
      kind: 'element',
      provenance: provenance('src/pages/Clients.tsx', 2),
      elementId: 'clients.create',
      type: 'button',
      attribute: 'data-guide',
      tagName: 'button',
      label: `Create (token ${KEY})`,
    };
    const secretModule: ApplicationNode = {
      id: functionId(SECRET_FILE, 'readToken'),
      kind: 'function',
      provenance: provenance(SECRET_FILE, 1),
      name: 'readToken',
      form: 'arrow',
      exported: true,
      isAsync: false,
      parameterCount: 0,
      side: 'backend',
    };
    const handler: ApplicationNode = {
      id: functionId('src/pages/Clients.tsx', 'handleCreate'),
      kind: 'function',
      provenance: provenance('src/pages/Clients.tsx', 8),
      name: 'handleCreate',
      form: 'arrow',
      exported: false,
      isAsync: true,
      parameterCount: 1,
      side: 'frontend',
    };
    const graph = makeGraph(
      [button, secretModule, handler],
      [
        createRelationship('invokes', button.id, handler.id, CONFIDENCE.DIRECT_SYNTAX, [
          {
            type: 'source',
            file: 'src/pages/Clients.tsx',
            line: 8,
            excerpt: `post("/clients", { token: "${KEY}" })`,
          },
        ]),
        createRelationship('calls', handler.id, secretModule.id, CONFIDENCE.DIRECT_SYNTAX, [
          { type: 'source', file: SECRET_FILE, line: 1, excerpt: `TOKEN=${KEY}` },
        ]),
      ],
    );
    return {
      ...graph,
      diagnostics: [
        {
          code: 'UNRESOLVED_API_PATH',
          severity: 'warning',
          message: `could not resolve path near ${KEY}`,
          file: 'src/pages/Clients.tsx',
          line: 8,
          excerpt: `const token = "${KEY}";`,
        },
      ],
    };
  }

  const pack = buildEvidencePack(plantedGraph(), {
    id: 'clients.create',
    idOrigin: 'semantic-id',
    rootNodes: [elementId('clients.create')],
    discoveredBy: 'guide-element',
  });

  it('keeps the key out of the pack entirely', () => {
    expect(JSON.stringify(pack)).not.toContain(KEY);
  });

  it('keeps the key out of the rendered data block', () => {
    expect(renderEvidence(pack)).not.toContain(KEY);
  });

  it('keeps the whole sensitive file out, node and edge alike', () => {
    expect(JSON.stringify(pack)).not.toContain('.env');
    expect(pack.nodes.map((node) => node.id)).not.toContain(functionId(SECRET_FILE, 'readToken'));
  });

  it('still describes what it could not determine', () => {
    // The diagnostic survives — scrubbed — because hiding the pack's own gaps
    // would invite the model to fill them.
    expect(pack.refusals).toHaveLength(1);
    expect(pack.refusals[0]).toContain('UNRESOLVED_API_PATH');
    expect(JSON.stringify(pack.diagnostics)).toContain(REDACTION_PLACEHOLDER);
  });
});

describe('a credential in an identity, not in an excerpt', () => {
  // The leak this closes. Everything above plants a key in *free text* — a
  // label, an excerpt, a diagnostic — and all of it was scrubbed. A key can also
  // arrive as part of an identity: a password-reset route with a token baked
  // into the path, a webhook whose URL is its own secret, a permission string
  // built from a key. Those became `pack.routes`, `pack.permissions` and node
  // ids, none of which went through redaction, and they travelled all the way to
  // the vendor, into `product.json`, and onto a generated page — three lines
  // away from the same key being redacted out of the node's own `name`.
  const RESET_KEY = 'sk-live-9f2b7c4e1a8d6f3b2c5e';
  const CLOUD_KEY = 'AKIAIOSFODNN7EXAMPLE';

  function provenance(file: string, line: number): ProvenanceReference {
    return { source: 'source-code', file, line, column: 1 };
  }

  function plantedIdentityGraph(): ApplicationGraph {
    const page: ApplicationNode = {
      id: componentId('src/pages/Reset.tsx', 'ResetPage'),
      kind: 'component',
      provenance: provenance('src/pages/Reset.tsx', 1),
      name: 'ResetPage',
      exported: true,
      isDefaultExport: true,
    };
    const button: ApplicationNode = {
      id: elementId('reset.submit'),
      kind: 'element',
      provenance: provenance('src/pages/Reset.tsx', 4),
      elementId: 'reset.submit',
      type: 'button',
      attribute: 'data-guide',
      tagName: 'button',
    };
    const route: ApplicationNode = {
      id: routeId(`/reset/${RESET_KEY}`),
      kind: 'route',
      provenance: provenance('src/pages/Reset.tsx', 2),
      path: `/reset/${RESET_KEY}`,
      detectedFrom: 'jsx-route',
    };
    const permission: ApplicationNode = {
      id: permissionId(`admin:${CLOUD_KEY}`),
      kind: 'permission',
      provenance: provenance('src/pages/Reset.tsx', 6),
      permission: `admin:${CLOUD_KEY}`,
      provenances: [provenance('src/pages/Reset.tsx', 6)],
    };
    return makeGraph(
      [page, button, route, permission],
      [
        createRelationship('renders', route.id, page.id, CONFIDENCE.DIRECT_SYNTAX, [
          { type: 'source', file: 'src/pages/Reset.tsx', line: 2 },
        ]),
        createRelationship('contains', page.id, button.id, CONFIDENCE.DIRECT_SYNTAX, [
          { type: 'source', file: 'src/pages/Reset.tsx', line: 4 },
        ]),
        createRelationship(
          'requires_permission',
          button.id,
          permission.id,
          CONFIDENCE.DIRECT_SYNTAX,
          [{ type: 'source', file: 'src/pages/Reset.tsx', line: 6 }],
        ),
      ],
    );
  }

  const pack = buildEvidencePack(plantedIdentityGraph(), {
    id: 'reset.submit',
    idOrigin: 'semantic-id',
    rootNodes: [elementId('reset.submit')],
    discoveredBy: 'guide-element',
  });

  it('keeps a key out of the route list and the permission list', () => {
    expect(JSON.stringify(pack.routes)).not.toContain(RESET_KEY);
    expect(JSON.stringify(pack.permissions)).not.toContain(CLOUD_KEY);
  });

  it('keeps a key out of every id in the pack', () => {
    expect(JSON.stringify(pack)).not.toContain(RESET_KEY);
    expect(JSON.stringify(pack)).not.toContain(CLOUD_KEY);
  });

  it('keeps a key out of the bytes actually sent to the provider', () => {
    const evidence = renderEvidence(pack);
    expect(evidence).not.toContain(RESET_KEY);
    expect(evidence).not.toContain(CLOUD_KEY);
  });

  it('keeps a key out of product.json and out of every generated page', async () => {
    const run = await enrichApplicationGraph({
      graph: plantedIdentityGraph(),
      provider: createMockProvider(),
    });
    expect(serializeProductModel(run.model)).not.toContain(RESET_KEY);
    expect(serializeProductModel(run.model)).not.toContain(CLOUD_KEY);
    for (const file of projectDocs(run.model)) {
      expect(file.contents, file.path).not.toContain(RESET_KEY);
      expect(file.contents, file.path).not.toContain(CLOUD_KEY);
    }
  });

  it('POSITIVE CONTROL: an ordinary route and permission survive intact', () => {
    const ordinary = buildEvidencePack(clientsGraph(), {
      id: 'clients.create',
      idOrigin: 'semantic-id',
      rootNodes: [ID.create],
      discoveredBy: 'guide-element',
    });
    expect(ordinary.routes).toContain('/clients');
    expect(ordinary.permissions).toContain('clients:create');
  });
});
