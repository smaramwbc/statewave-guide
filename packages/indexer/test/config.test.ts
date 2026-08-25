import { readdir } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import {
  DEFAULT_EXCLUDE,
  DEFAULT_INCLUDE,
  DEFAULT_OUT_DIR,
  defineConfig,
  loadConfig,
} from '../src/config.js';
import type { StatewaveGuideConfig } from '../src/config.js';
import { createProjectIndexer } from '../src/indexer.js';
import { createTempProject, removeTempProject } from './helpers.js';

/** A two-page project, so `include`/`exclude` have something to choose between. */
const PROJECT_FILES: Record<string, string> = {
  'package.json': '{ "name": "configured-app" }\n',
  'tsconfig.json': '{ "compilerOptions": { "jsx": "react-jsx" } }\n',
  'src/Kept.tsx':
    'export function Kept() {\n  return <button data-guide="kept.go">Go</button>;\n}\n',
  'src/legacy/Dropped.tsx':
    'export function Dropped() {\n  return <button data-guide="dropped.go">Go</button>;\n}\n',
  'app/Extra.tsx':
    'export function Extra() {\n  return <button data-guide="extra.go">Go</button>;\n}\n',
};

describe('defineConfig', () => {
  it('round-trips its input unchanged', () => {
    const config: StatewaveGuideConfig = {
      include: ['app/**/*.tsx'],
      exclude: ['**/*.stories.tsx'],
      tsconfig: 'tsconfig.app.json',
      outDir: 'build/guide',
    };

    const returned = defineConfig(config);

    expect(returned).toEqual(config);
    expect(returned).toBe(config);
  });
});

describe('loadConfig', () => {
  it('returns the defaults when the project has no config file', async () => {
    const root = await createTempProject({ 'package.json': '{ "name": "bare" }\n' });

    try {
      const loaded = await loadConfig(root);
      expect(loaded.configPath).toBeUndefined();
      expect(loaded.config.include).toEqual([...DEFAULT_INCLUDE]);
      expect(loaded.config.exclude).toEqual([...DEFAULT_EXCLUDE]);
      expect(loaded.config.outDir).toBe(DEFAULT_OUT_DIR);
    } finally {
      await removeTempProject(root);
    }
  });

  it('reads a TypeScript config, resolving its relative imports', async () => {
    const root = await createTempProject({
      ...PROJECT_FILES,
      // The transpiled config is written next to the original, so this
      // project-relative import still resolves.
      'guide-globs.js': "export const INCLUDE = ['src/**/*.tsx'];\n",
      'statewave-guide.config.ts': [
        "import { INCLUDE } from './guide-globs.js';",
        '',
        'interface Config {',
        '  include: string[];',
        '  exclude: string[];',
        '  outDir: string;',
        '}',
        '',
        'const config: Config = {',
        '  include: INCLUDE,',
        "  exclude: ['**/legacy/**'],",
        "  outDir: 'build/guide',",
        '};',
        '',
        'export default config;',
        '',
      ].join('\n'),
    });

    try {
      const loaded = await loadConfig(root);

      expect(loaded.configPath).toBe('statewave-guide.config.ts');
      expect(loaded.config.include).toEqual(['src/**/*.tsx']);
      expect(loaded.config.exclude).toEqual(['**/legacy/**']);
      expect(loaded.config.outDir).toBe('build/guide');

      // The transpiled sibling module must not survive the load.
      const remaining = await readdir(root);
      expect(remaining.filter((name) => name.includes('.statewave-guide.config.'))).toEqual([]);
    } finally {
      await removeTempProject(root);
    }
  });

  it('honours include and exclude when the indexer runs', async () => {
    const root = await createTempProject({
      ...PROJECT_FILES,
      'statewave-guide.config.ts': [
        "import type { StatewaveGuideConfig } from '@statewavedev/guide-indexer';",
        '',
        'const config: StatewaveGuideConfig = {',
        "  include: ['src/**/*.tsx', 'app/**/*.tsx'],",
        "  exclude: ['**/legacy/**'],",
        '};',
        '',
        'export default config;',
        '',
      ].join('\n'),
    });

    try {
      const result = await createProjectIndexer({ root }).index();

      expect(result.configPath).toBe('statewave-guide.config.ts');
      expect(result.graph.files.map((file) => file.path)).toEqual([
        'app/Extra.tsx',
        'src/Kept.tsx',
      ]);
      expect(result.graph.elements.map((element) => element.id)).toEqual(['extra.go', 'kept.go']);
    } finally {
      await removeTempProject(root);
    }
  });

  it('reads a JSON config', async () => {
    const root = await createTempProject({
      ...PROJECT_FILES,
      'statewave-guide.config.json': JSON.stringify({ include: ['app/**/*.tsx'] }, null, 2),
    });

    try {
      const loaded = await loadConfig(root);
      expect(loaded.configPath).toBe('statewave-guide.config.json');
      expect(loaded.config.include).toEqual(['app/**/*.tsx']);
      // Unspecified keys keep their defaults.
      expect(loaded.config.exclude).toEqual([...DEFAULT_EXCLUDE]);
    } finally {
      await removeTempProject(root);
    }
  });

  it('reads a plain JavaScript config', async () => {
    const root = await createTempProject({
      ...PROJECT_FILES,
      'statewave-guide.config.mjs': "export default { outDir: 'graph-out' };\n",
    });

    try {
      const loaded = await loadConfig(root);
      expect(loaded.configPath).toBe('statewave-guide.config.mjs');
      expect(loaded.config.outDir).toBe('graph-out');
    } finally {
      await removeTempProject(root);
    }
  });

  it('reports a malformed config with a readable message instead of crashing', async () => {
    const root = await createTempProject({
      'statewave-guide.config.json': JSON.stringify({ include: 'src/**/*.ts' }),
    });

    try {
      await expect(loadConfig(root)).rejects.toThrow(/"include" must be an array of glob strings/);
    } finally {
      await removeTempProject(root);
    }
  });

  it('rejects a TypeScript config with a syntax error rather than error-correcting it', async () => {
    const root = await createTempProject({
      ...PROJECT_FILES,
      // `transpileModule` recovers from this into `{ include: [] }`, which would
      // silently replace the user's file set with an empty one.
      'statewave-guide.config.ts': 'export default {\n  include: [\n};\n',
    });

    try {
      await expect(loadConfig(root)).rejects.toThrow(
        /statewave-guide\.config\.ts is not valid TypeScript/,
      );
    } finally {
      await removeTempProject(root);
    }
  });

  it('rejects a config that does not export an object', async () => {
    const root = await createTempProject({
      'statewave-guide.config.mjs': 'export default 42;\n',
    });

    try {
      await expect(loadConfig(root)).rejects.toThrow(/must export a configuration object/);
    } finally {
      await removeTempProject(root);
    }
  });

  it('lets explicit indexer options override the config file', async () => {
    const root = await createTempProject({
      ...PROJECT_FILES,
      'statewave-guide.config.json': JSON.stringify({ include: ['src/**/*.tsx'] }),
    });

    try {
      const result = await createProjectIndexer({
        root,
        config: { include: ['app/**/*.tsx'] },
      }).index();

      expect(result.graph.files.map((file) => file.path)).toEqual(['app/Extra.tsx']);
      // The config file is still reported, so the override is auditable.
      expect(result.configPath).toBe('statewave-guide.config.json');
    } finally {
      await removeTempProject(root);
    }
  });
});
