import { existsSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { createProjectIndexer } from '../src/indexer.js';
import { createPatternSet, discoverSourceFiles, expandBraces } from '../src/discover.js';
import { createTempProject, nodesOfKind, removeTempProject } from './helpers.js';

/** A one-element application, used wherever only the file set is interesting. */
const WIDGET: Record<string, string> = {
  'tsconfig.json': '{ "compilerOptions": { "jsx": "react-jsx" } }\n',
  'package.json': '{ "name": "widget-app" }\n',
  'src/Widget.tsx':
    'export function Widget() {\n  return <button data-guide="widget.go">Go</button>;\n}\n',
};

/** The same files, nested under `directory` inside a throwaway temp root. */
function nested(directory: string): Record<string, string> {
  return Object.fromEntries(
    Object.entries(WIDGET).map(([file, contents]) => [`${directory}/${file}`, contents]),
  );
}

describe('pattern matching', () => {
  it('expands braces, nesting included', () => {
    expect(expandBraces('src/**/*.{ts,tsx}')).toEqual(['src/**/*.ts', 'src/**/*.tsx']);
    expect(expandBraces('a/{b,{c,d}}/e')).toEqual(['a/b/e', 'a/c/e', 'a/d/e']);
    // An unbalanced brace is far likelier to be a directory name than a pattern.
    expect(expandBraces('a/{b/c')).toEqual(['a/{b/c']);
  });

  it('matches `**` across any number of segments and `*` within one', () => {
    const set = createPatternSet(['src/**/*.{ts,tsx}']);
    expect(set.matches('src/a.ts')).toBe(true);
    expect(set.matches('src/deep/deeper/b.tsx')).toBe(true);
    expect(set.matches('src/a.js')).toBe(false);
    expect(set.matches('other/a.ts')).toBe(false);
  });

  it('refuses to let a wildcard match a leading dot', () => {
    const set = createPatternSet(['src/**/*.ts']);
    expect(set.matches('src/.hidden/a.ts')).toBe(false);
    expect(set.matches('src/.a.ts')).toBe(false);
    expect(createPatternSet(['src/.hidden/*.ts']).matches('src/.hidden/a.ts')).toBe(true);
  });

  it('knows which directories a pattern could still reach', () => {
    const set = createPatternSet(['src/**/*.ts']);
    expect(set.reaches('src')).toBe(true);
    expect(set.reaches('src/deep')).toBe(true);
    expect(set.reaches('node_modules')).toBe(false);
  });

  it('knows which directories an exclude covers entirely', () => {
    const set = createPatternSet(['**/node_modules/**', '**/*.test.*']);
    expect(set.covers('node_modules')).toBe(true);
    expect(set.covers('packages/app/node_modules')).toBe(true);
    expect(set.covers('src')).toBe(false);
    expect(set.matches('src/a.test.ts')).toBe(true);
  });

  it('treats a path that is only a glob metacharacter as a literal name', () => {
    const set = createPatternSet(['src/**/*.ts']);
    expect(set.matches('src/a(1).ts')).toBe(true);
    expect(set.matches('src/wow!/a.ts')).toBe(true);
  });
});

describe('file discovery', () => {
  it('is a property of the project, not of the working directory', async () => {
    const root = await createTempProject({
      ...WIDGET,
      'src/deep/Nested.tsx': 'export const nested = 1;\n',
      'src/Widget.test.tsx': 'export const spec = 1;\n',
    });

    try {
      const from = (cwd: string): string[] => {
        const previous = process.cwd();
        process.chdir(cwd);
        try {
          return discoverSourceFiles({
            root,
            include: ['src/**/*.{ts,tsx}'],
            exclude: ['**/*.test.*'],
          }).files.map((file) => file.relativePath);
        } finally {
          process.chdir(previous);
        }
      };

      const expected = ['src/Widget.tsx', 'src/deep/Nested.tsx'];
      expect(from(root)).toEqual(expected);
      expect(from(path.join(root, 'src'))).toEqual(expected);
      expect(from(path.join(root, 'src', 'deep'))).toEqual(expected);
      expect(from(path.parse(root).root)).toEqual(expected);
    } finally {
      await removeTempProject(root);
    }
  });

  it('indexes a project whose path begins with `!`', async () => {
    const temporary = await createTempProject(nested('!apps'));

    try {
      const root = path.join(temporary, '!apps');
      const previous = process.cwd();
      process.chdir(temporary);
      try {
        const { graph } = await createProjectIndexer({ root }).index();
        expect(nodesOfKind(graph, 'file').map((file) => file.path)).toEqual(['src/Widget.tsx']);
        expect(graph.diagnostics.map((diagnostic) => diagnostic.code)).not.toContain(
          'NO_SOURCE_FILES',
        );
      } finally {
        process.chdir(previous);
      }
    } finally {
      await removeTempProject(temporary);
    }
  });

  it('says so rather than leaking a machine path when a pattern points outside', async () => {
    const root = await createTempProject(WIDGET);

    try {
      const { graph } = await createProjectIndexer({
        root,
        config: { include: [path.join(path.parse(root).root, 'elsewhere', 'src', '**', '*.ts')] },
      }).index();

      const messages = graph.diagnostics.map((diagnostic) => diagnostic.message).join('\n');
      expect(messages).toContain('outside the project');
      expect(messages).not.toContain(root);
    } finally {
      await removeTempProject(root);
    }
  });

  it('reads an absolute include that points inside the project', async () => {
    const root = await createTempProject(WIDGET);

    try {
      const { graph } = await createProjectIndexer({
        root,
        config: { include: [path.join(root, 'src', '**', '*.tsx')] },
      }).index();

      expect(nodesOfKind(graph, 'file').map((file) => file.path)).toEqual(['src/Widget.tsx']);
    } finally {
      await removeTempProject(root);
    }
  });
});

describe('projects in awkward directories', () => {
  // Parentheses are the case that matters — `Dropbox (Personal)`,
  // `Documents (2)` and `project (copy)` are all ordinary directory names, and
  // an unquoted `(…)` turns into a match group that describes a path nobody has.
  const AWKWARD = ['my (app)', 'Repos (Personal)', 'brace{x,y}', 'foo[1]', 'star*dir', 'wow!'];

  for (const directory of AWKWARD) {
    it(`indexes a project living in "${directory}"`, async () => {
      const temporary = await createTempProject(nested(directory));

      try {
        const { graph } = await createProjectIndexer({
          root: path.join(temporary, directory),
        }).index();

        expect(nodesOfKind(graph, 'file').map((file) => file.path)).toEqual(['src/Widget.tsx']);
        expect(nodesOfKind(graph, 'element').map((element) => element.id)).toEqual([
          'element:widget.go',
        ]);
        expect(graph.diagnostics.map((diagnostic) => diagnostic.code)).not.toContain(
          'NO_SOURCE_FILES',
        );
      } finally {
        await removeTempProject(temporary);
      }
    });
  }

  it('indexes the same files however the root was capitalised', async () => {
    const temporary = await createTempProject(nested('CaseTest'));

    try {
      const misspelt = path.join(temporary, 'CASETEST');
      // On a case-sensitive filesystem that path is simply not there, and the
      // question the test asks does not arise.
      if (!existsSync(misspelt)) return;

      const { graph } = await createProjectIndexer({ root: misspelt }).index();
      expect(nodesOfKind(graph, 'file').map((file) => file.path)).toEqual(['src/Widget.tsx']);
      expect(nodesOfKind(graph, 'element').map((element) => element.id)).toEqual([
        'element:widget.go',
      ]);
    } finally {
      await removeTempProject(temporary);
    }
  });
});

describe('degraded inputs', () => {
  it('names the tsconfig when it cannot be parsed', async () => {
    const root = await createTempProject({
      ...WIDGET,
      'tsconfig.json': '{ "compilerOptions": { "strict": true\n',
    });

    try {
      await expect(createProjectIndexer({ root }).index()).rejects.toThrow(/"tsconfig\.json"/);
    } finally {
      await removeTempProject(root);
    }
  });
});

describe('element extraction edge cases', () => {
  it('maps a tag named after an Object prototype member to `other`, not a function', async () => {
    const root = await createTempProject({
      ...WIDGET,
      'src/Widget.tsx': [
        'export function Widget() {',
        '  return (',
        '    <div>',
        '      <constructor data-guide="proto.ctor">Ctor</constructor>',
        '      <toString data-guide="proto.str">Str</toString>',
        '    </div>',
        '  );',
        '}',
        '',
      ].join('\n'),
    });

    try {
      const { graph } = await createProjectIndexer({ root }).index();

      for (const element of nodesOfKind(graph, 'element')) {
        expect(element.type).toBe('other');
        // A function survives `toEqual` but disappears from the JSON, taking a
        // required field of the contract with it.
        expect(Object.keys(JSON.parse(JSON.stringify(element)) as object)).toContain('type');
      }
    } finally {
      await removeTempProject(root);
    }
  });

  it('records the label a reader sees, not the character references it is spelt with', async () => {
    const root = await createTempProject({
      ...WIDGET,
      'src/Widget.tsx': [
        'export function Widget() {',
        '  return (',
        '    <div>',
        '      <button data-guide="entity.text">Save &amp; close</button>',
        '      <button data-guide="entity.space">Hello&nbsp;World</button>',
        '      <button data-guide="entity.numeric">Done &#x2713;</button>',
        '      <button data-guide="entity.unknown">Raw &notanentity; here</button>',
        '      <button data-guide="entity.once">&amp;bull; stays</button>',
        '      <a data-guide="entity.attribute" aria-label="Open &amp; view">x</a>',
        '      <span data-guide="entity.expression" data-guide-label={\'Kept &amp; raw\'}>y</span>',
        '    </div>',
        '  );',
        '}',
        '',
      ].join('\n'),
    });

    try {
      const { graph } = await createProjectIndexer({ root }).index();
      const labels = new Map(
        nodesOfKind(graph, 'element').map((element) => [element.elementId, element.label]),
      );

      expect(labels.get('entity.text')).toBe('Save & close');
      // A no-break space is whitespace, so it collapses like any other.
      expect(labels.get('entity.space')).toBe('Hello World');
      expect(labels.get('entity.numeric')).toBe('Done ✓');
      // Decoding once, so an escaped reference stays escaped.
      expect(labels.get('entity.once')).toBe('&bull; stays');
      // A name nobody recognises is left exactly as written, as a browser does.
      expect(labels.get('entity.unknown')).toBe('Raw &notanentity; here');
      expect(labels.get('entity.attribute')).toBe('Open & view');
      // `{'…'}` is a JavaScript string, and JSX does not decode those.
      expect(labels.get('entity.expression')).toBe('Kept &amp; raw');
    } finally {
      await removeTempProject(root);
    }
  });

  it('reads the component name from the last # of a component id', async () => {
    const root = await createTempProject({
      ...WIDGET,
      'src/we#ird.tsx':
        'export function Widget() {\n  return <div data-guide="hash.file">z</div>;\n}\n',
    });

    try {
      const { graph } = await createProjectIndexer({ root }).index();
      const element = nodesOfKind(graph, 'element').find(
        (candidate) => candidate.elementId === 'hash.file',
      );

      expect(element?.provenance.symbol).toBe('Widget');
      expect(
        graph.relationships.some(
          (relationship) =>
            relationship.type === 'contains' &&
            relationship.source === 'component:src/we#ird.tsx#Widget' &&
            relationship.target === 'element:hash.file',
        ),
      ).toBe(true);
    } finally {
      await removeTempProject(root);
    }
  });
});
