# @statewavedev/guide-indexer

Deterministic source-code analysis for [Statewave Guide](https://github.com/smaramwbc/statewave-guide).

Reads a TypeScript/React project with `ts-morph` and writes what it can prove
about it to `.statewave-guide/application.json`.

```bash
npx @statewavedev/guide-indexer .
```

```
Statewave Guide

Analyzing application...

✓ TypeScript project detected
✓ 42 source files
✓ 18 React components
✓ 12 guide elements
✓ 4 routes

Product graph written to:

.statewave-guide/application.json
```

## What it extracts

- **Guide elements** — JSX carrying a string-literal `data-guide` (or the legacy
  `data-ai-id`), with element type, label, enclosing component and provenance
- **React components** — PascalCase functions containing JSX
- **Routes** — `<Route path="…">` and `createBrowserRouter([{ path: '…' }])`
- **Exported functions**, and exported **interfaces, type aliases and enums**

Optional attributes refine what it can see: `data-guide-type="button"` states the
semantic kind of a custom component, and `data-guide-label="…"` states a label
that isn't readable from a string literal child.

## Three rules

**Deterministic facts only.** No model, no inferred business meaning, no invented
descriptions. If a label cannot be read from a string literal, it is omitted
rather than guessed. A computed `data-guide={someVar}` is skipped, because it
cannot be proven.

**Everything carries provenance.** Every node records the file, line, column and
symbol it came from, so a claim about the application is always traceable back to
the code that justified it.

**Byte-identical output.** Two runs over unchanged source produce an identical
file: no timestamps, no absolute paths, POSIX separators, every array sorted by a
stable key, optional keys omitted rather than emitted as `null`. That is what lets
the graph live in version control and be reviewed in a pull request.

## Configuration

Optional, in `statewave-guide.config.ts`:

```ts
import { defineConfig } from '@statewavedev/guide-indexer';

export default defineConfig({
  include: ['src/**/*.{ts,tsx}'],
  exclude: ['**/*.test.*', '**/node_modules/**'],
});
```

`.js`, `.mjs`, `.mts` and `.json` config files are also recognised.

## Programmatic use

```ts
import { createProjectIndexer, writeApplicationGraph } from '@statewavedev/guide-indexer';

const { graph } = await createProjectIndexer({ root: '.' }).index();
await writeApplicationGraph(graph, { root: '.' });
```

The indexer runs entirely offline and shares no process, state or runtime
dependency with the guide itself.

## Status

Early development. It produces a _structural_ application graph; turning that into
a product-shaped model of features is the next milestone. See the
[main README](https://github.com/smaramwbc/statewave-guide#readme).

Apache-2.0
