/**
 * What a control is called, and when we are allowed to say we know.
 *
 * Round 6 shipped the step **"Choose Open."** for
 * `<button data-guide="invoices.list.open">{invoice.number}</button>`. The
 * button shows an invoice number; nothing in that interface says *Open*, and the
 * word came from the last segment of the semantic id. A reader would have gone
 * looking for a control that does not exist under that name, and the review
 * package carried no fact about it because there was none to carry.
 *
 * Meanwhile eight genuinely visible labels sat unread in the same fixture —
 * three in wrapping `<label>` elements, five passed as props to components that
 * render them.
 *
 * So these tests come in pairs throughout: what must be read, and what must not
 * be guessed. A suite that only checked the recoveries would be satisfied by an
 * extractor that believed every attribute called `label`.
 */

import { describe, expect, it } from 'vitest';
import { createProjectIndexer } from '../src/indexer.js';
import type { ApplicationGraph } from '../src/graph.js';
import { createTempProject, removeTempProject } from './helpers.js';

const BASE: Record<string, string> = {
  'tsconfig.json': '{ "compilerOptions": { "jsx": "react-jsx" } }\n',
  'package.json': '{ "name": "label-app" }\n',
};

async function indexOf(files: Record<string, string>): Promise<ApplicationGraph> {
  const root = await createTempProject({ ...BASE, ...files });
  try {
    return (await createProjectIndexer({ root }).index()).graph;
  } finally {
    await removeTempProject(root);
  }
}

function element(graph: ApplicationGraph, id: string) {
  const found = graph.nodes.find((node) => node.id === `element:${id}`);
  if (found === undefined || found.kind !== 'element') throw new Error(`no element ${id}`);
  return found;
}

function contains(graph: ApplicationGraph): string[] {
  return graph.relationships
    .filter((edge) => edge.type === 'contains' && edge.source.startsWith('element:'))
    .map((edge) => `${edge.source} > ${edge.target}`)
    .sort();
}

// ---------------------------------------------------------------------------
// A–C · wrapping <label>
// ---------------------------------------------------------------------------

describe('A · a wrapping label names the control it wraps', () => {
  it('reads the text beside the input', async () => {
    const graph = await indexOf({
      'src/Form.tsx': `export function Form() {
  return (
    <form>
      <label>
        Name
        <input data-guide="form.name" />
      </label>
    </form>
  );
}
`,
    });
    expect(element(graph, 'form.name').label).toBe('Name');
    expect(element(graph, 'form.name').labelOrigin).toBe('wrapping-label');
  });
});

describe('B · a decorative span is read through', () => {
  it('takes the text inside an intrinsic wrapper', async () => {
    const graph = await indexOf({
      'src/Form.tsx': `export function Form() {
  return (
    <label className="field">
      <span className="field__label">Billing email</span>
      <input data-guide="form.email" />
    </label>
  );
}
`,
    });
    expect(element(graph, 'form.email').label).toBe('Billing email');
  });

  it('refuses when two candidate texts sit in one label', async () => {
    // Which of them is the name? Nothing says, so nothing is claimed.
    const graph = await indexOf({
      'src/Form.tsx': `export function Form() {
  return (
    <label>
      <span>Email</span>
      <input data-guide="form.email" />
      <span>required</span>
    </label>
  );
}
`,
    });
    expect(element(graph, 'form.email').label).toBeUndefined();
  });
});

describe('C · an unrelated sibling label does not attach', () => {
  it('leaves a control outside the label unnamed', async () => {
    const graph = await indexOf({
      'src/Form.tsx': `export function Form() {
  return (
    <div>
      <label>
        Name
        <input data-guide="form.name" />
      </label>
      <input data-guide="form.loose" />
    </div>
  );
}
`,
    });
    expect(element(graph, 'form.name').label).toBe('Name');
    expect(element(graph, 'form.loose').label).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// D–G · props, and proving they are rendered
// ---------------------------------------------------------------------------

describe('D · a prop is a name only when the component renders it', () => {
  it('reads a prop that reaches a text position', async () => {
    const graph = await indexOf({
      'src/Field.tsx': `export function Field({ label, ...rest }: { label: string }) {
  return (
    <label>
      <span>{label}</span>
      <input {...rest} />
    </label>
  );
}
`,
      'src/Form.tsx': `import { Field } from './Field';
export function Form() {
  return <Field data-guide="form.email" label="Billing email" />;
}
`,
    });
    expect(element(graph, 'form.email').label).toBe('Billing email');
    expect(element(graph, 'form.email').labelOrigin).toBe('label-prop');
  });
});

describe('E · a prop the component never renders is not a name', () => {
  it('refuses a label prop used only for analytics', async () => {
    // The whole point of proving the dataflow. `label` is a convention, and a
    // convention that is wrong here would put a string on the page that no user
    // has ever seen.
    const graph = await indexOf({
      'src/Field.tsx': `export function Field({ label, ...rest }: { label: string }) {
  const track = () => report(label);
  return <input onFocus={track} {...rest} />;
}
declare function report(value: string): void;
`,
      'src/Form.tsx': `import { Field } from './Field';
export function Form() {
  return <Field data-guide="form.email" label="Billing email" />;
}
`,
    });
    expect(element(graph, 'form.email').label).toBeUndefined();
  });

  it('refuses a prop passed only into another attribute', async () => {
    const graph = await indexOf({
      'src/Field.tsx': `export function Field({ label, ...rest }: { label: string }) {
  return <input placeholder={label} {...rest} />;
}
`,
      'src/Form.tsx': `import { Field } from './Field';
export function Form() {
  return <Field data-guide="form.email" label="Billing email" />;
}
`,
    });
    expect(element(graph, 'form.email').label).toBeUndefined();
  });
});

describe('F · a forwarded prop is followed, once', () => {
  it('reads a label through one component hop', async () => {
    const graph = await indexOf({
      'src/Inner.tsx': `export function Inner({ caption }: { caption: string }) {
  return <span>{caption}</span>;
}
`,
      'src/Outer.tsx': `import { Inner } from './Inner';
export function Outer({ label, ...rest }: { label: string }) {
  return (
    <label>
      <Inner caption={label} />
      <input {...rest} />
    </label>
  );
}
`,
      'src/Form.tsx': `import { Outer } from './Outer';
export function Form() {
  return <Outer data-guide="form.email" label="Billing email" />;
}
`,
    });
    expect(element(graph, 'form.email').label).toBe('Billing email');
  });
});

describe('G · a computed label is not a label', () => {
  it('refuses a template literal', async () => {
    const graph = await indexOf({
      'src/Form.tsx': `export function Form({ n }: { n: number }) {
  return <button data-guide="form.go" aria-label={\`Go \${n}\`}>{n}</button>;
}
`,
    });
    expect(element(graph, 'form.go').label).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// H–J · accessibility, and text we cannot read
// ---------------------------------------------------------------------------

describe('H · aria-label', () => {
  it('is read, and recorded as an accessibility name', async () => {
    const graph = await indexOf({
      'src/Close.tsx': `export function Close() {
  return <button data-guide="dialog.close" aria-label="Close">×</button>;
}
`,
    });
    expect(element(graph, 'dialog.close').label).toBe('Close');
    expect(element(graph, 'dialog.close').labelOrigin).toBe('aria-label');
  });
});

describe('I · aria-labelledby', () => {
  it('resolves to statically known text in the same file', async () => {
    const graph = await indexOf({
      'src/Panel.tsx': `export function Panel({ icon }: { icon: unknown }) {
  return (
    <section>
      <h2 id="panel-heading">Danger zone</h2>
      <button data-guide="panel.act" aria-labelledby="panel-heading">{icon}</button>
    </section>
  );
}
`,
    });
    expect(element(graph, 'panel.act').label).toBe('Danger zone');
    expect(element(graph, 'panel.act').labelOrigin).toBe('aria-labelledby');
  });

  it('refuses when the referenced id is not in the file', async () => {
    const graph = await indexOf({
      'src/Panel.tsx': `export function Panel({ n }: { n: number }) {
  return <button data-guide="panel.act" aria-labelledby="elsewhere">{n}</button>;
}
`,
    });
    expect(element(graph, 'panel.act').label).toBeUndefined();
  });
});

describe('J · dynamic text is recorded as dynamic, never as a name', () => {
  it('marks a control whose content is computed', async () => {
    // The Round 6 defect, pinned. The extractor must be able to say "this has a
    // name and it is not knowable", because the alternative is a compiler
    // reaching for the identifier.
    const graph = await indexOf({
      'src/List.tsx': `export function List({ invoice }: { invoice: { number: string } }) {
  return <button data-guide="invoices.list.open">{invoice.number}</button>;
}
`,
    });
    const node = element(graph, 'invoices.list.open');
    expect(node.label).toBeUndefined();
    expect(node.labelKind).toBe('dynamic');
  });

  it('separates dynamic from absent', async () => {
    const graph = await indexOf({
      'src/Blank.tsx': `export function Blank() {
  return <div data-guide="panel.blank" />;
}
`,
    });
    expect(element(graph, 'panel.blank').labelKind).toBe('none');
  });
});

// ---------------------------------------------------------------------------
// K–M · containment
// ---------------------------------------------------------------------------

describe('K · a nested control is contained by the control above it', () => {
  it('records form to input and form to button', async () => {
    const graph = await indexOf({
      'src/Form.tsx': `export function Form() {
  return (
    <form data-guide="settings.form">
      <input data-guide="settings.name" />
      <button data-guide="settings.save">Save</button>
    </form>
  );
}
`,
    });
    expect(contains(graph)).toEqual([
      'element:settings.form > element:settings.name',
      'element:settings.form > element:settings.save',
    ]);
  });

  it('records the nearest container, not every ancestor', async () => {
    const graph = await indexOf({
      'src/Page.tsx': `export function Page() {
  return (
    <section data-guide="settings">
      <form data-guide="settings.form">
        <input data-guide="settings.name" />
      </form>
    </section>
  );
}
`,
    });
    expect(contains(graph)).toEqual([
      'element:settings > element:settings.form',
      'element:settings.form > element:settings.name',
    ]);
  });
});

describe('L · siblings are not containment', () => {
  it('records nothing between two controls side by side', async () => {
    const graph = await indexOf({
      'src/Page.tsx': `export function Page() {
  return (
    <div>
      <input data-guide="settings.name" />
      <button data-guide="settings.save">Save</button>
    </div>
  );
}
`,
    });
    expect(contains(graph)).toEqual([]);
  });
});

describe('M · a component boundary is not containment', () => {
  it('does not reach through a custom component', async () => {
    // `Gate` may render its children, or its fallback, or neither. What it does
    // with what it is given is its business.
    const graph = await indexOf({
      'src/Gate.tsx': `export function Gate({ children }: { children: unknown }) {
  return <>{children}</>;
}
`,
      'src/Page.tsx': `import { Gate } from './Gate';
export function Page() {
  return (
    <section data-guide="settings">
      <Gate>
        <button data-guide="settings.save">Save</button>
      </Gate>
    </section>
  );
}
`,
    });
    expect(contains(graph)).toEqual([]);
  });

  it('does not reach out of a JSX attribute', async () => {
    const graph = await indexOf({
      'src/Page.tsx': `export function Page() {
  return (
    <section data-guide="app.shell">
      <Route element={<p data-guide="app.not-found">Missing</p>} />
    </section>
  );
}
declare function Route(props: { element: unknown }): JSX.Element;
`,
    });
    expect(contains(graph)).toEqual([]);
  });
});
