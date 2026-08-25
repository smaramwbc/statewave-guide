import { existsSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { createProjectIndexer } from '../src/indexer.js';
import { escapeGlobLiteral, globPrefix, joinGlob } from '../src/paths.js';
import { createTempProject, removeTempProject } from './helpers.js';

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

describe('glob construction', () => {
  it('quotes the metacharacters in a project path and leaves the pattern alone', () => {
    const prefix = globPrefix(path.join('/work', 'my (app)'), '/work');
    expect(joinGlob(prefix, 'src/**/*.{ts,tsx}')).toBe('my [(]app[)]/src/**/*.{ts,tsx}');
  });

  it('quotes nothing when the project is the directory the command was run from', () => {
    expect(globPrefix('/work/app', '/work/app')).toBe('');
  });

  it('leaves `!` alone, because `[!]` would be a negated bracket expression', () => {
    expect(escapeGlobLiteral('wow!/a+b/at@x')).toBe('wow!/a+b/at@x');
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

        expect(graph.files.map((file) => file.path)).toEqual(['src/Widget.tsx']);
        expect(graph.elements.map((element) => element.id)).toEqual(['widget.go']);
        expect(graph.diagnostics.map((diagnostic) => diagnostic.code)).not.toContain(
          'no-source-files',
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
      expect(graph.files.map((file) => file.path)).toEqual(['src/Widget.tsx']);
      expect(graph.elements.map((element) => element.id)).toEqual(['widget.go']);
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

      for (const element of graph.elements) {
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
      const labels = new Map(graph.elements.map((element) => [element.id, element.label]));

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
      const element = graph.elements.find((candidate) => candidate.id === 'hash.file');

      expect(element?.componentId).toBe('src/we#ird.tsx#Widget');
      expect(element?.provenance.symbol).toBe('Widget');
    } finally {
      await removeTempProject(root);
    }
  });
});
