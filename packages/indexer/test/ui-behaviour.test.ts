/**
 * The UI behaviour rules, each with the case it must find and the case it must
 * refuse.
 *
 * Every rule here is paired. A test that only proves a rule fires proves the
 * cheap half: any extractor can be made to find `onClick={handler}`. What makes
 * an extractor trustworthy is that it stops — at a prop whose value the parent
 * decides, at a modal named by a string, at a variable that merely shares a name
 * with a router hook — and that when it stops it says so with a diagnostic
 * rather than leaving a silence indistinguishable from "there is nothing here".
 *
 * So each block below asserts three things where they apply: the edge exists,
 * the near-identical negative produces no edge, and the negative produced the
 * diagnostic that names the gap.
 */

import { describe, expect, it } from 'vitest';
import { CONFIDENCE } from '../src/evidence.js';
import type { ApplicationGraph } from '../src/graph.js';
import type { IndexerDiagnosticCode } from '../src/graph.js';
import type { RelationshipType } from '../src/relationships.js';
import { edge, edgesOfType, indexProject, nodeById, nodesOfKind } from './helpers.js';

/** A project skeleton every case in this file starts from. */
const BASE: Record<string, string> = {
  'package.json': '{ "name": "ui-behaviour" }\n',
  'tsconfig.json': '{ "compilerOptions": { "jsx": "react-jsx" } }\n',
};

function lines(...source: string[]): string {
  return `${source.join('\n')}\n`;
}

/** Diagnostic codes the graph reported, deduplicated. */
function codes(graph: ApplicationGraph): IndexerDiagnosticCode[] {
  return [...new Set(graph.diagnostics.map((diagnostic) => diagnostic.code))];
}

/** Every edge of a type, so an assertion can say "and nothing else". */
function targets(graph: ApplicationGraph, type: RelationshipType, source: string): string[] {
  return graph.relationships
    .filter((relationship) => relationship.type === type && relationship.source === source)
    .map((relationship) => relationship.target);
}

// ---------------------------------------------------------------------------
// 1. Element -> handler
// ---------------------------------------------------------------------------

describe('an element and the handler it invokes', () => {
  it('resolves a handler prop that names a function bound in the same module', async () => {
    const graph = await indexProject({
      ...BASE,
      'src/Page.tsx': lines(
        'export function Page() {',
        '  const openCreateClient = (): void => { document.title = "x"; };',
        '  return <button data-guide="clients.create" onClick={openCreateClient}>New</button>;',
        '}',
      ),
    });

    const found = edge(
      graph,
      'element:clients.create',
      'invokes',
      'function:src/Page.tsx#openCreateClient',
    );
    expect(found).toBeDefined();
    expect(found?.confidence).toBe(CONFIDENCE.DIRECT_SYNTAX);
    expect(found?.evidence[0]?.rule).toBe('jsx-handler-identifier');
  });

  it('resolves an arrow whose whole body is one call to a local function', async () => {
    const graph = await indexProject({
      ...BASE,
      'src/Page.tsx': lines(
        'export function Page() {',
        '  const saveName = async (name: string): Promise<void> => { console.log(name); };',
        '  return (',
        '    <button data-guide="clients.rename" onClick={() => void saveName("x")}>Rename</button>',
        '  );',
        '}',
      ),
    });

    expect(
      edge(graph, 'element:clients.rename', 'invokes', 'function:src/Page.tsx#saveName')
        ?.confidence,
    ).toBe(CONFIDENCE.DIRECT_SYNTAX);
  });

  it('resolves an arrow calling a member of an imported object, across the import', async () => {
    const graph = await indexProject({
      ...BASE,
      'src/dialogs.ts': lines(
        'export const dialogService = {',
        '  open(): void { document.title = "open"; },',
        '  close(): void { document.title = "close"; },',
        '};',
      ),
      'src/Page.tsx': lines(
        "import { dialogService } from './dialogs';",
        'export function Page() {',
        '  return <button data-guide="clients.open" onClick={() => dialogService.open()}>Open</button>;',
        '}',
      ),
    });

    expect(
      edge(graph, 'element:clients.open', 'invokes', 'function:src/dialogs.ts#dialogService.open')
        ?.confidence,
    ).toBe(CONFIDENCE.RESOLVED_SYMBOL);
  });

  it('resolves an inline useCallback down to the one call in its body', async () => {
    const graph = await indexProject({
      ...BASE,
      'src/Page.tsx': lines(
        "import { useCallback } from 'react';",
        'export function Page() {',
        '  const reallyOpen = (): void => { document.title = "x"; };',
        '  return (',
        '    <button data-guide="clients.open" onClick={useCallback(() => reallyOpen(), [])}>',
        '      Open',
        '    </button>',
        '  );',
        '}',
      ),
    });

    expect(
      edge(graph, 'element:clients.open', 'invokes', 'function:src/Page.tsx#reallyOpen')
        ?.confidence,
    ).toBe(CONFIDENCE.STATIC_INFERENCE);
  });

  it('refuses a handler read off an object, wherever the object was declared', async () => {
    const graph = await indexProject({
      ...BASE,
      'src/module.tsx': lines(
        'export function createClient(): void { document.title = "a"; }',
        'const actions = { createClient };',
        'export function ModuleScopeObject() {',
        '  return <button data-guide="a.one" onClick={actions.createClient}>x</button>;',
        '}',
      ),
      'src/component.tsx': lines(
        'export function ComponentScopeObject() {',
        '  const save = (): void => { document.title = "b"; };',
        '  const actions = { save };',
        '  return <button data-guide="b.one" onClick={actions.save}>x</button>;',
        '}',
      ),
      'src/prop.tsx': lines(
        'export function PropBorne({ actions }: { actions: { save: () => void } }) {',
        '  return <button data-guide="c.one" onClick={actions.save}>x</button>;',
        '}',
      ),
    });

    // The module-scope object is the dangerous one: its member *is* provable
    // today, which makes the edge indistinguishable from one that is true by
    // construction — and the object may be reassigned, spread into, or built
    // from a member the next commit changes.
    expect(edgesOfType(graph, 'invokes')).toEqual([]);
    for (const element of ['a.one', 'b.one', 'c.one']) {
      expect(targets(graph, 'invokes', `element:${element}`)).toEqual([]);
    }
    expect(
      graph.diagnostics.filter(
        (diagnostic) =>
          diagnostic.code === 'UNRESOLVED_DYNAMIC_CALL' &&
          diagnostic.message.includes('arrives through an object'),
      ),
    ).toHaveLength(3);
  });

  it('still reads a call made on an object inside an inline handler', async () => {
    // The refusal above is about the handler *value* being a member read. A
    // member *call* in an arrow body names the function that runs, which is a
    // different fact and stays provable.
    const graph = await indexProject({
      ...BASE,
      'src/services.ts': lines(
        'export const dialogService = {',
        '  open(): void { document.title = "open"; },',
        '  close(): void { document.title = "close"; },',
        '};',
      ),
      'src/Page.tsx': lines(
        "import { dialogService } from './services';",
        'export function Page() {',
        '  return <button data-guide="clients.open" onClick={() => dialogService.open()}>o</button>;',
        '}',
      ),
    });

    expect(
      edge(graph, 'element:clients.open', 'invokes', 'function:src/services.ts#dialogService.open'),
    ).toBeDefined();
  });

  it('refuses a handler prop bound to a prop of the component it sits in', async () => {
    const graph = await indexProject({
      ...BASE,
      'src/Form.tsx': lines(
        'export function Form({ onCancel }: { onCancel: () => void }) {',
        '  return <button data-guide="clients.cancel" onClick={onCancel}>Cancel</button>;',
        '}',
      ),
    });

    expect(targets(graph, 'invokes', 'element:clients.cancel')).toEqual([]);
    expect(
      graph.diagnostics.some(
        (diagnostic) =>
          diagnostic.code === 'UNRESOLVED_DYNAMIC_CALL' && diagnostic.excerpt?.includes('onCancel'),
      ),
    ).toBe(true);
  });

  it('refuses an identifier that resolves to something other than a function', async () => {
    const graph = await indexProject({
      ...BASE,
      'src/Page.tsx': lines(
        'export function Page() {',
        '  const openCreateClient = "openCreateClient";',
        '  return <button data-guide="clients.create" onClick={openCreateClient}>New</button>;',
        '}',
      ),
    });

    expect(targets(graph, 'invokes', 'element:clients.create')).toEqual([]);
  });

  it('refuses an arrow body in which no single call dominates', async () => {
    const graph = await indexProject({
      ...BASE,
      'src/Page.tsx': lines(
        'export function Page() {',
        '  const first = (): void => { document.title = "1"; };',
        '  const second = (): void => { document.title = "2"; };',
        '  return (',
        '    <button data-guide="clients.both" onClick={() => { first(); second(); }}>Both</button>',
        '  );',
        '}',
      ),
    });

    expect(targets(graph, 'invokes', 'element:clients.both')).toEqual([]);
    expect(codes(graph)).toContain('UNRESOLVED_DYNAMIC_CALL');
  });

  it('refuses a body that binds one call to a name and then makes another', async () => {
    const graph = await indexProject({
      ...BASE,
      'src/Page.tsx': lines(
        'export function Page() {',
        '  const openDialog = (): string => "id";',
        '  const track = (_id: string): void => { document.title = _id; };',
        '  return (',
        '    <button',
        '      data-guide="clients.track"',
        '      onClick={() => { const id = openDialog(); track(id); }}',
        '    >',
        '      Track',
        '    </button>',
        '  );',
        '}',
      ),
    });

    expect(targets(graph, 'invokes', 'element:clients.track')).toEqual([]);
    expect(codes(graph)).toContain('UNRESOLVED_DYNAMIC_CALL');
  });

  it('reads nothing out of a spread prop', async () => {
    const graph = await indexProject({
      ...BASE,
      'src/Page.tsx': lines(
        'export function Page() {',
        '  const openCreateClient = (): void => { document.title = "x"; };',
        '  const handlers = { onClick: openCreateClient };',
        '  return <button data-guide="clients.create" {...handlers}>New</button>;',
        '}',
      ),
    });

    expect(targets(graph, 'invokes', 'element:clients.create')).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// 2. renders
// ---------------------------------------------------------------------------

describe('one component rendering another', () => {
  it('records a local tag as direct syntax and an imported one as a resolved symbol', async () => {
    const graph = await indexProject({
      ...BASE,
      'src/Dialog.tsx': lines('export function Dialog() {', '  return <div>dialog</div>;', '}'),
      'src/Page.tsx': lines(
        "import { Dialog } from './Dialog';",
        'export function Page() {',
        '  return <section><Local /><Dialog /></section>;',
        '}',
        'function Local() {',
        '  return <span>local</span>;',
        '}',
      ),
    });

    expect(
      edge(graph, 'component:src/Page.tsx#Page', 'renders', 'component:src/Page.tsx#Local')
        ?.confidence,
    ).toBe(CONFIDENCE.DIRECT_SYNTAX);
    expect(
      edge(graph, 'component:src/Page.tsx#Page', 'renders', 'component:src/Dialog.tsx#Dialog')
        ?.confidence,
    ).toBe(CONFIDENCE.RESOLVED_SYMBOL);
  });

  it('records a conditionally rendered component', async () => {
    const graph = await indexProject({
      ...BASE,
      'src/Page.tsx': lines(
        'export function Page({ open }: { open: boolean }) {',
        '  return <section>{open && <Panel />}</section>;',
        '}',
        'function Panel() {',
        '  return <div>panel</div>;',
        '}',
      ),
    });

    expect(
      edge(graph, 'component:src/Page.tsx#Page', 'renders', 'component:src/Page.tsx#Panel'),
    ).toBeDefined();
  });

  it('records the component a route renders, which is what makes a route reach an element', async () => {
    const graph = await indexProject({
      ...BASE,
      'src/Clients.tsx': lines(
        'export function Clients() {',
        '  return <button data-guide="clients.create">New</button>;',
        '}',
      ),
      'src/router.tsx': lines(
        "import { Route, Routes } from 'react-router-dom';",
        "import { Clients } from './Clients';",
        'export function Router() {',
        '  return <Routes><Route path="/clients" element={<Clients />} /></Routes>;',
        '}',
      ),
    });

    expect(
      edge(graph, 'route:/clients', 'renders', 'component:src/Clients.tsx#Clients'),
    ).toBeDefined();
  });

  it('records nothing for a tag that resolves to no component in the project', async () => {
    const graph = await indexProject({
      ...BASE,
      'src/Page.tsx': lines(
        "import { Tooltip } from 'some-ui-library';",
        'export function Page() {',
        '  return <div><Tooltip /><span /></div>;',
        '}',
      ),
    });

    expect(edgesOfType(graph, 'renders')).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// 3. Forms
// ---------------------------------------------------------------------------

describe('a form and the function it submits to', () => {
  it('resolves a native onSubmit naming a local identifier', async () => {
    const graph = await indexProject({
      ...BASE,
      'src/Settings.tsx': lines(
        'export function Settings() {',
        '  const saveSettings = async (): Promise<void> => { document.title = "saved"; };',
        '  return <form data-guide="settings.form" onSubmit={saveSettings} />;',
        '}',
      ),
    });

    const found = edge(
      graph,
      'element:settings.form',
      'submits_to',
      'function:src/Settings.tsx#saveSettings',
    );
    expect(found?.confidence).toBe(CONFIDENCE.DIRECT_SYNTAX);
    // The component edge is what keeps a chain walkable when a form carries no
    // semantic id of its own.
    expect(
      edge(
        graph,
        'component:src/Settings.tsx#Settings',
        'submits_to',
        'function:src/Settings.tsx#saveSettings',
      ),
    ).toBeDefined();
  });

  it('resolves through a react-hook-form wrapper to the handler it wraps', async () => {
    const graph = await indexProject({
      ...BASE,
      'src/ClientForm.tsx': lines(
        "import { useForm } from 'react-hook-form';",
        'export function ClientForm() {',
        '  const { handleSubmit } = useForm();',
        '  const submitClient = async (): Promise<void> => { document.title = "sent"; };',
        '  return <form data-guide="clients.form" onSubmit={handleSubmit(submitClient)} />;',
        '}',
      ),
    });

    const found = edge(
      graph,
      'element:clients.form',
      'submits_to',
      'function:src/ClientForm.tsx#submitClient',
    );
    expect(found?.confidence).toBe(CONFIDENCE.STATIC_INFERENCE);
    expect(found?.evidence[0]?.rule).toBe('form-submit-wrapper');
  });

  it('resolves an inline arrow that prevents the default and then submits', async () => {
    const graph = await indexProject({
      ...BASE,
      'src/Invoices.tsx': lines(
        "import type { FormEvent } from 'react';",
        'export function Invoices() {',
        '  const submitInvoice = async (): Promise<void> => { document.title = "sent"; };',
        '  return (',
        '    <form',
        '      data-guide="invoices.form"',
        '      onSubmit={(event: FormEvent) => { event.preventDefault(); submitInvoice(); }}',
        '    />',
        '  );',
        '}',
      ),
    });

    expect(
      edge(graph, 'element:invoices.form', 'submits_to', 'function:src/Invoices.tsx#submitInvoice'),
    ).toBeDefined();
  });

  it('records the component edge even when the form carries no semantic id', async () => {
    const graph = await indexProject({
      ...BASE,
      'src/Settings.tsx': lines(
        'export function Settings() {',
        '  const saveSettings = async (): Promise<void> => { document.title = "saved"; };',
        '  return <form onSubmit={saveSettings} />;',
        '}',
      ),
    });

    expect(edgesOfType(graph, 'submits_to')).toEqual([
      'component:src/Settings.tsx#Settings -> function:src/Settings.tsx#saveSettings',
    ]);
  });

  it('refuses a submit handler arriving on a prop, and says so', async () => {
    const graph = await indexProject({
      ...BASE,
      'src/Form.tsx': lines(
        'export function Form({ onSubmit }: { onSubmit: () => void }) {',
        '  return <form data-guide="clients.form" onSubmit={onSubmit} />;',
        '}',
      ),
    });

    expect(edgesOfType(graph, 'submits_to')).toEqual([]);
    expect(codes(graph)).toContain('UNSUPPORTED_FORM_PATTERN');
  });

  it('refuses a wrapper this project declares, because what it returns is unknown', async () => {
    const graph = await indexProject({
      ...BASE,
      'src/Form.tsx': lines(
        'function guard(handler: () => void): () => void {',
        '  return handler;',
        '}',
        'export function Form() {',
        '  const save = (): void => { document.title = "x"; };',
        '  return <form data-guide="clients.form" onSubmit={guard(save)} />;',
        '}',
      ),
    });

    expect(edgesOfType(graph, 'submits_to')).toEqual([]);
    expect(codes(graph)).toContain('UNSUPPORTED_FORM_PATTERN');
  });
});

// ---------------------------------------------------------------------------
// 4. Dialogs
// ---------------------------------------------------------------------------

/** The three facts `state-flag-gates-element` needs, each one removable. */
function dialogPage(options: { flag?: boolean; setter?: boolean; gate?: boolean } = {}): string {
  const flag = options.flag ?? true;
  const setter = options.setter ?? true;
  const gate = options.gate ?? true;
  return lines(
    "import { useState } from 'react';",
    "import { NewClientDialog } from './NewClientDialog';",
    "import { useDialog } from './useDialog';",
    'export function ClientsPage() {',
    flag
      ? '  const [isCreateOpen, setIsCreateOpen] = useState(false);'
      : '  const { isCreateOpen, setIsCreateOpen } = useDialog();',
    setter
      ? '  const openCreateClient = (): void => { setIsCreateOpen(true); };'
      : '  const openCreateClient = (): void => { setIsCreateOpen(false); };',
    '  return (',
    '    <section>',
    '      <button data-guide="clients.create" onClick={openCreateClient}>New</button>',
    gate ? '      {isCreateOpen ? <NewClientDialog /> : null}' : '      <NewClientDialog />',
    '    </section>',
    '  );',
    '}',
  );
}

const DIALOG_BASE: Record<string, string> = {
  ...BASE,
  'src/NewClientDialog.tsx': lines(
    'export function NewClientDialog() {',
    '  return <div role="dialog">new client</div>;',
    '}',
  ),
  'src/useDialog.ts': lines(
    'export function useDialog() {',
    '  return { isCreateOpen: false, setIsCreateOpen: (_next: boolean): void => undefined };',
    '}',
  ),
};

const OPENS = [
  'function:src/ClientsPage.tsx#openCreateClient',
  'opens',
  'component:src/NewClientDialog.tsx#NewClientDialog',
] as const;

describe('a function that opens a dialog', () => {
  it('records the edge when the flag, the setter and the gate are all present', async () => {
    const graph = await indexProject({ ...DIALOG_BASE, 'src/ClientsPage.tsx': dialogPage() });

    const found = edge(graph, OPENS[0], OPENS[1], OPENS[2]);
    expect(found?.confidence).toBe(CONFIDENCE.STATIC_INFERENCE);
    expect(found?.evidence[0]?.rule).toBe('state-flag-gates-element');
    // The dialog is rendered either way; only `opens` needs the inference.
    expect(
      edge(graph, 'component:src/ClientsPage.tsx#ClientsPage', 'renders', OPENS[2]),
    ).toBeDefined();
  });

  it('records nothing when the flag does not come from useState', async () => {
    const graph = await indexProject({
      ...DIALOG_BASE,
      'src/ClientsPage.tsx': dialogPage({ flag: false }),
    });

    expect(edgesOfType(graph, 'opens')).toEqual([]);
    expect(
      edge(graph, 'component:src/ClientsPage.tsx#ClientsPage', 'renders', OPENS[2]),
    ).toBeDefined();
  });

  it('records nothing when no function sets the flag to true', async () => {
    const graph = await indexProject({
      ...DIALOG_BASE,
      'src/ClientsPage.tsx': dialogPage({ setter: false }),
    });

    expect(edgesOfType(graph, 'opens')).toEqual([]);
  });

  it('records nothing when the flag gates no element', async () => {
    const graph = await indexProject({
      ...DIALOG_BASE,
      'src/ClientsPage.tsx': dialogPage({ gate: false }),
    });

    expect(edgesOfType(graph, 'opens')).toEqual([]);
  });

  it('records the edge when the flag is passed as the dialog’s open prop', async () => {
    const graph = await indexProject({
      ...DIALOG_BASE,
      'src/ClientsPage.tsx': lines(
        "import { useState } from 'react';",
        "import { NewClientDialog } from './NewClientDialog';",
        'export function ClientsPage() {',
        '  const [isCreateOpen, setIsCreateOpen] = useState(false);',
        '  const openCreateClient = (): void => { setIsCreateOpen(true); };',
        '  return (',
        '    <section>',
        '      <button data-guide="clients.create" onClick={openCreateClient}>New</button>',
        '      <NewClientDialog open={isCreateOpen} />',
        '    </section>',
        '  );',
        '}',
      ),
    });

    expect(edge(graph, OPENS[0], OPENS[1], OPENS[2])).toBeDefined();
  });

  it('records nothing for a flag one component sets and another gates', async () => {
    const graph = await indexProject({
      ...DIALOG_BASE,
      'src/ClientsPage.tsx': lines(
        "import { useState } from 'react';",
        "import { NewClientDialog } from './NewClientDialog';",
        'export function ClientsPage() {',
        '  const [isCreateOpen, setIsCreateOpen] = useState(false);',
        '  const openCreateClient = (): void => { setIsCreateOpen(true); };',
        '  return <button data-guide="clients.create" onClick={openCreateClient}>{isCreateOpen}</button>;',
        '}',
        'export function Elsewhere() {',
        '  const [isCreateOpen] = useState(false);',
        '  return <section>{isCreateOpen ? <NewClientDialog /> : null}</section>;',
        '}',
      ),
    });

    expect(edgesOfType(graph, 'opens')).toEqual([]);
  });

  it('refuses a modal named by a string, and reports the missing registry', async () => {
    const graph = await indexProject({
      ...DIALOG_BASE,
      'src/ClientsPage.tsx': lines(
        "import { modal } from './modal';",
        'export function ClientsPage() {',
        "  const openCreateClient = (): void => { modal.open('new-client-dialog'); };",
        '  return <button data-guide="clients.create" onClick={openCreateClient}>New</button>;',
        '}',
      ),
      'src/modal.ts': lines(
        'export const modal = {',
        '  open(_key: string): void { document.title = _key; },',
        '  close(): void { document.title = ""; },',
        '};',
      ),
    });

    expect(edgesOfType(graph, 'opens')).toEqual([]);
    expect(codes(graph)).toContain('UNRESOLVED_MODAL_REGISTRY');
  });
});

// ---------------------------------------------------------------------------
// 5. Navigation
// ---------------------------------------------------------------------------

const ROUTER: Record<string, string> = {
  ...BASE,
  'src/router.tsx': lines(
    "import { Route, Routes } from 'react-router-dom';",
    "import { Clients } from './Clients';",
    'export function Router() {',
    '  return (',
    '    <Routes>',
    '      <Route path="/clients" element={<Clients />} />',
    '      <Route path="/clients/:id" element={<Clients />} />',
    '      <Route path="/settings" element={<Clients />} />',
    '    </Routes>',
    '  );',
    '}',
  ),
  'src/Clients.tsx': lines('export function Clients() {', '  return <div>clients</div>;', '}'),
};

describe('navigation', () => {
  it('records a literal destination handed to the router’s own navigator', async () => {
    const graph = await indexProject({
      ...ROUTER,
      'src/Page.tsx': lines(
        "import { useNavigate } from 'react-router-dom';",
        'export function Page() {',
        '  const navigate = useNavigate();',
        '  const goToClients = (): void => { navigate("/clients"); };',
        '  return <button data-guide="nav.go" onClick={goToClients}>Go</button>;',
        '}',
      ),
    });

    expect(
      edge(graph, 'function:src/Page.tsx#goToClients', 'navigates_to', 'route:/clients')
        ?.confidence,
    ).toBe(CONFIDENCE.DIRECT_SYNTAX);
  });

  it('records nothing for a local function that merely shares the name `navigate`', async () => {
    const graph = await indexProject({
      ...ROUTER,
      'src/InvoiceList.tsx': lines(
        "import { useState } from 'react';",
        'export function InvoiceList() {',
        '  const [, setActive] = useState<string | null>(null);',
        '  const navigate = (to: string): void => { setActive(to); };',
        '  const clearSelection = (): void => { navigate("/clients"); };',
        '  return <button data-guide="invoices.clear" onClick={clearSelection}>Clear</button>;',
        '}',
      ),
    });

    expect(edgesOfType(graph, 'navigates_to')).toEqual([]);
  });

  it('records a router link’s destination against the element a user clicks', async () => {
    const graph = await indexProject({
      ...ROUTER,
      'src/Nav.tsx': lines(
        "import { Link, NavLink } from 'react-router-dom';",
        'export function Nav() {',
        '  return (',
        '    <nav>',
        '      <NavLink to="/clients" data-guide="nav.clients">Clients</NavLink>',
        '      <Link to="/settings" data-guide="nav.settings">Settings</Link>',
        '    </nav>',
        '  );',
        '}',
      ),
    });

    expect(edge(graph, 'element:nav.clients', 'navigates_to', 'route:/clients')).toBeDefined();
    expect(edge(graph, 'element:nav.settings', 'navigates_to', 'route:/settings')).toBeDefined();
  });

  it('records a push on a router object the router hook handed out', async () => {
    const graph = await indexProject({
      ...ROUTER,
      'src/Page.tsx': lines(
        "import { useRouter } from 'next/router';",
        'export function Page() {',
        '  const router = useRouter();',
        '  const goToClients = (): void => { router.push("/clients"); };',
        '  return <button data-guide="nav.go" onClick={goToClients}>Go</button>;',
        '}',
      ),
    });

    expect(
      edge(graph, 'function:src/Page.tsx#goToClients', 'navigates_to', 'route:/clients'),
    ).toBeDefined();
  });

  it('normalises a template whose interpolation is a plain identifier filling a segment', async () => {
    const graph = await indexProject({
      ...ROUTER,
      'src/Page.tsx': lines(
        "import { useNavigate } from 'react-router-dom';",
        'export function Page() {',
        '  const navigate = useNavigate();',
        '  const open = (id: string): void => { navigate(`/clients/${id}`); };',
        '  return <button data-guide="nav.open" onClick={() => open("1")}>Open</button>;',
        '}',
      ),
    });

    expect(
      edge(graph, 'function:src/Page.tsx#open', 'navigates_to', 'route:/clients/:id'),
    ).toBeDefined();
  });

  it('refuses a destination read at runtime, and says the route is not knowable', async () => {
    const graph = await indexProject({
      ...ROUTER,
      'src/Page.tsx': lines(
        "import { Link } from 'react-router-dom';",
        'export function Page({ backTo }: { backTo: string }) {',
        '  return <Link to={backTo} data-guide="nav.back">Back</Link>;',
        '}',
      ),
    });

    expect(edgesOfType(graph, 'navigates_to')).toEqual([]);
    expect(codes(graph)).toContain('UNRESOLVED_DYNAMIC_ROUTE');
  });

  it('refuses a destination no declared route matches, rather than inventing one', async () => {
    const graph = await indexProject({
      ...ROUTER,
      'src/Page.tsx': lines(
        "import { Link } from 'react-router-dom';",
        'export function Page() {',
        '  return <Link to="/nowhere" data-guide="nav.nowhere">Nowhere</Link>;',
        '}',
      ),
    });

    expect(nodeById(graph, 'route:/nowhere')).toBeUndefined();
    expect(edgesOfType(graph, 'navigates_to')).toEqual([]);
    expect(codes(graph)).toContain('UNRESOLVED_DYNAMIC_ROUTE');
  });

  it('records nothing for an absolute external URL', async () => {
    const graph = await indexProject({
      ...ROUTER,
      'src/Page.tsx': lines(
        "import { Link } from 'react-router-dom';",
        "export const HELP_URL = 'https://docs.example.com/clients';",
        'export function Page() {',
        '  return (',
        '    <nav>',
        '      <a href={HELP_URL} data-guide="nav.help">Help</a>',
        '      <Link to={HELP_URL} data-guide="nav.docs">Docs</Link>',
        '    </nav>',
        '  );',
        '}',
      ),
    });

    expect(edgesOfType(graph, 'navigates_to')).toEqual([]);
    expect(nodeById(graph, 'route:https://docs.example.com/clients')).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// 6. Permissions
// ---------------------------------------------------------------------------

describe('permissions', () => {
  it('gates the elements a configured gate component wraps', async () => {
    const graph = await indexProject({
      ...BASE,
      'src/Page.tsx': lines(
        "import { PermissionGate } from './PermissionGate';",
        'export function Page() {',
        '  return (',
        '    <PermissionGate permission="clients:create">',
        '      <button data-guide="clients.create">New</button>',
        '    </PermissionGate>',
        '  );',
        '}',
      ),
      'src/PermissionGate.tsx': lines(
        'export function PermissionGate({ children }: { permission: string; children: unknown }) {',
        '  return <>{children}</>;',
        '}',
      ),
    });

    expect(
      edge(graph, 'element:clients.create', 'requires_permission', 'permission:clients:create'),
    ).toBeDefined();
  });

  it('resolves a permission written as a member of a module-scope constant', async () => {
    const graph = await indexProject({
      ...BASE,
      'src/permissions.ts': lines(
        'export const Permissions = {',
        "  ClientCreate: 'clients:create',",
        '} as const;',
      ),
      'src/Page.tsx': lines(
        "import { PermissionGate } from './PermissionGate';",
        "import { Permissions } from './permissions';",
        'export function Page() {',
        '  return (',
        '    <PermissionGate permission={Permissions.ClientCreate}>',
        '      <button data-guide="clients.create">New</button>',
        '    </PermissionGate>',
        '  );',
        '}',
      ),
      'src/PermissionGate.tsx': lines(
        'export function PermissionGate({ children }: { permission: string; children: unknown }) {',
        '  return <>{children}</>;',
        '}',
      ),
    });

    expect(
      edge(graph, 'element:clients.create', 'requires_permission', 'permission:clients:create'),
    ).toBeDefined();
  });

  it('gates the function a configured recogniser is called inside', async () => {
    const graph = await indexProject({
      ...BASE,
      'src/table.ts': lines(
        "import { hasPermission } from './permissions';",
        'export function listClients(): boolean {',
        "  return hasPermission('clients:read');",
        '}',
      ),
      'src/permissions.ts': lines(
        'export function hasPermission(_permission: string): boolean {',
        '  return true;',
        '}',
      ),
    });

    expect(
      edge(
        graph,
        'function:src/table.ts#listClients',
        'requires_permission',
        'permission:clients:read',
      ),
    ).toBeDefined();
  });

  it('resolves a permission written as an enum member', async () => {
    const graph = await indexProject({
      ...BASE,
      'src/permissions.ts': lines(
        'export enum Permissions {',
        "  ClientDelete = 'clients:delete',",
        '}',
      ),
      'src/Page.tsx': lines(
        "import { Permissions } from './permissions';",
        'export function Page() {',
        '  return (',
        '    <PermissionGate permission={Permissions.ClientDelete}>',
        '      <button data-guide="clients.delete">Delete</button>',
        '    </PermissionGate>',
        '  );',
        '}',
        'export function PermissionGate({ children }: { permission: string; children: unknown }) {',
        '  return <>{children as never}</>;',
        '}',
      ),
    });

    expect(
      edge(graph, 'element:clients.delete', 'requires_permission', 'permission:clients:delete'),
    ).toBeDefined();
  });

  it('says so when a gate names a permission it cannot read', async () => {
    const graph = await indexProject({
      ...BASE,
      'src/Page.tsx': lines(
        'export function Page({ scope }: { scope: string }) {',
        '  return (',
        '    <PermissionGate permission={scope}>',
        '      <button data-guide="clients.delete">Delete</button>',
        '    </PermissionGate>',
        '  );',
        '}',
        'export function PermissionGate({ children }: { permission: string; children: unknown }) {',
        '  return <>{children as never}</>;',
        '}',
      ),
    });

    // The gate gates *something*; refusing in silence would be
    // indistinguishable from a gate that names no permission at all.
    expect(edgesOfType(graph, 'requires_permission')).toEqual([]);
    expect(
      graph.diagnostics.some(
        (diagnostic) =>
          diagnostic.code === 'UNRESOLVED_PERMISSION' &&
          diagnostic.excerpt?.includes('permission={scope}'),
      ),
    ).toBe(true);
  });

  it('sources a navigation from the control that ran it, never from the screen', async () => {
    const graph = await indexProject({
      ...BASE,
      'src/router.tsx': lines(
        "import { Route, Routes } from 'react-router-dom';",
        "import { NavReal } from './NavReal';",
        'export function AppRouter() {',
        '  return (',
        '    <Routes>',
        '      <Route path="/clients" element={<NavReal />} />',
        '    </Routes>',
        '  );',
        '}',
      ),
      'src/NavReal.tsx': lines(
        "import { useNavigate } from 'react-router-dom';",
        'export function NavReal() {',
        '  const navigate = useNavigate();',
        '  return <button data-guide="nav.real" onClick={() => navigate(\'/clients\')}>Go</button>;',
        '}',
      ),
    });

    // An inline arrow is not a function node, so walking owners alone lands on
    // the component — a coarser claim than the source supports, and a source
    // kind the contract does not allow.
    expect(edgesOfType(graph, 'navigates_to')).toEqual(['element:nav.real -> route:/clients']);
  });

  it('records nothing for a permission-shaped string passed to an unconfigured function', async () => {
    const graph = await indexProject({
      ...BASE,
      'statewave-guide.config.json': JSON.stringify({
        permissions: { functions: ['hasPermission'], components: ['Can'] },
      }),
      'src/analytics.ts': lines(
        'export function track(_event: string): void {}',
        'export function listClients(): void {',
        "  track('clients:read');",
        "  logEvent('clients:create');",
        '}',
        'export function logEvent(_event: string): void {}',
      ),
    });

    expect(nodesOfKind(graph, 'permission')).toEqual([]);
    expect(edgesOfType(graph, 'requires_permission')).toEqual([]);
  });

  it('honours a recogniser named only by the config', async () => {
    const files: Record<string, string> = {
      ...BASE,
      'src/page.ts': lines(
        'export function assertCan(_permission: string): void {}',
        'export function listClients(): void {',
        "  assertCan('clients:read');",
        '}',
      ),
    };

    const without = await indexProject(files);
    expect(nodesOfKind(without, 'permission')).toEqual([]);

    const withConfig = await indexProject({
      ...files,
      'statewave-guide.config.json': JSON.stringify({
        permissions: { functions: ['assertCan'], components: [] },
      }),
    });
    expect(
      edge(
        withConfig,
        'function:src/page.ts#listClients',
        'requires_permission',
        'permission:clients:read',
      ),
    ).toBeDefined();
  });

  it('records one edge, not two, for a permission on an express route', async () => {
    const graph = await indexProject({
      ...BASE,
      'statewave-guide.config.json': JSON.stringify({ include: ['src/**/*.ts'] }),
      'src/routes.ts': lines(
        "import { Router } from 'express';",
        "import { requirePermission } from './requirePermission';",
        "import { listClients } from './controller';",
        'export const router = Router();',
        "router.get('/clients', requirePermission('clients:read'), listClients);",
      ),
      'src/requirePermission.ts': lines(
        'export function requirePermission(_permission: string): () => void {',
        '  return () => undefined;',
        '}',
      ),
      'src/controller.ts': lines('export function listClients(): void {}'),
    });

    expect(edgesOfType(graph, 'requires_permission')).toEqual([
      'api:GET:/clients -> permission:clients:read',
    ]);
  });
});

// ---------------------------------------------------------------------------
// 7. Hooks
// ---------------------------------------------------------------------------

describe('hooks', () => {
  it('records React’s own hooks as builtin and the project’s as declared', async () => {
    const graph = await indexProject({
      ...BASE,
      'src/useClients.ts': lines(
        "import { useState } from 'react';",
        'export function useClients() {',
        '  const [clients] = useState<string[]>([]);',
        '  return clients;',
        '}',
      ),
      'src/Page.tsx': lines(
        "import { useClients } from './useClients';",
        'export function Page() {',
        '  const clients = useClients();',
        '  return <div>{clients.length}</div>;',
        '}',
      ),
    });

    expect(nodeById(graph, 'hook:react#useState')).toMatchObject({ builtin: true });
    expect(nodeById(graph, 'hook:src/useClients.ts#useClients')).toMatchObject({ builtin: false });
    expect(
      edge(graph, 'component:src/Page.tsx#Page', 'uses_hook', 'hook:src/useClients.ts#useClients'),
    ).toBeDefined();
    expect(
      edge(graph, 'hook:src/useClients.ts#useClients', 'uses_hook', 'hook:react#useState'),
    ).toBeDefined();
  });

  it('records nothing for a function whose name only starts with `use`', async () => {
    const graph = await indexProject({
      ...BASE,
      'src/user.ts': lines(
        'export function userName(): string {',
        '  return "x";',
        '}',
        'export function readIt(): string {',
        '  return userName();',
        '}',
      ),
    });

    expect(nodesOfKind(graph, 'hook')).toEqual([]);
    expect(edgesOfType(graph, 'uses_hook')).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// 8. Schemas
// ---------------------------------------------------------------------------

const ZOD_BASE: Record<string, string> = {
  ...BASE,
  'statewave-guide.config.json': JSON.stringify({ include: ['src/**/*.ts'] }),
  'src/schemas.ts': lines(
    "import { z } from 'zod';",
    'export const createClientSchema = z.object({ name: z.string() });',
    'export const updateClientSchema = createClientSchema.partial();',
    "export const notASchema = { name: 'string' };",
  ),
};

describe('validation schemas', () => {
  it('records a module-scope zod const, including one built from another schema', async () => {
    const graph = await indexProject(ZOD_BASE);

    expect(nodesOfKind(graph, 'schema').map((node) => node.id)).toEqual([
      'schema:src/schemas.ts#createClientSchema',
      'schema:src/schemas.ts#updateClientSchema',
    ]);
    expect(nodeById(graph, 'schema:src/schemas.ts#createClientSchema')).toMatchObject({
      library: 'zod',
    });
  });

  it('records the handler that parses with a schema', async () => {
    const graph = await indexProject({
      ...ZOD_BASE,
      'src/controller.ts': lines(
        "import { createClientSchema } from './schemas';",
        'export function createClient(body: unknown): unknown {',
        '  return createClientSchema.parse(body);',
        '}',
      ),
    });

    const found = edge(
      graph,
      'function:src/controller.ts#createClient',
      'validates_with',
      'schema:src/schemas.ts#createClientSchema',
    );
    expect(found?.confidence).toBe(CONFIDENCE.RESOLVED_SYMBOL);
    expect(found?.evidence[0]?.rule).toBe('import-symbol-resolution');
  });

  it('records the endpoint whose route middleware validates', async () => {
    const graph = await indexProject({
      ...ZOD_BASE,
      'src/routes.ts': lines(
        "import { Router } from 'express';",
        "import { createClientSchema } from './schemas';",
        "import { validate } from './validate';",
        "import { createClient } from './controller';",
        'export const router = Router();',
        "router.post('/clients', validate(createClientSchema), createClient);",
      ),
      'src/validate.ts': lines(
        'export function validate(_schema: unknown): () => void {',
        '  return () => undefined;',
        '}',
      ),
      'src/controller.ts': lines('export function createClient(): void {}'),
    });

    expect(
      edge(
        graph,
        'api:POST:/clients',
        'validates_with',
        'schema:src/schemas.ts#createClientSchema',
      ),
    ).toBeDefined();
  });

  it('records nothing for a `parse` that is not a schema’s', async () => {
    const graph = await indexProject({
      ...ZOD_BASE,
      'src/controller.ts': lines(
        "import { notASchema } from './schemas';",
        'export function readBody(body: string): unknown {',
        '  const parsed: unknown = JSON.parse(body);',
        '  return { parsed, name: notASchema.name };',
        '}',
      ),
    });

    expect(edgesOfType(graph, 'validates_with')).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// N. A submit control and the form it submits
//
// Paired like every rule above: the control inside the form gets the edge, the
// control that only *names* a form does not, and neither does a sibling that
// merely sits nearby. The last case is the one that matters — it is the shape
// that let `settings.new-key` borrow the settings form's submit capability.
// ---------------------------------------------------------------------------

describe('a submit control and the form it submits', () => {
  it('gives a type="submit" control inside a form the form\'s submits_to edge', async () => {
    const graph = await indexProject({
      ...BASE,
      'src/Page.tsx': lines(
        'export function Page() {',
        '  const save = async () => {};',
        '  return (',
        '    <form data-guide="settings.form" onSubmit={save}>',
        '      <button data-guide="settings.save" type="submit">Save</button>',
        '    </form>',
        '  );',
        '}',
      ),
    });
    expect(targets(graph, 'submits_to', 'element:settings.save')).toEqual([
      'function:src/Page.tsx#save',
    ]);
    // Derived from the form's edge, so it may never claim to be better evidence.
    const derived = edge(
      graph,
      'element:settings.save',
      'submits_to',
      'function:src/Page.tsx#save',
    );
    expect(derived?.confidence).toBe(CONFIDENCE.STATIC_INFERENCE);
    expect(derived?.evidence[0]?.rule).toBe('submit-control-in-form');
  });

  it('refuses a control that names a form it is not inside', async () => {
    // `form="settings-form"` is a real HTML association, but proving which form
    // means resolving an `id` this source never declares.
    const graph = await indexProject({
      ...BASE,
      'src/Page.tsx': lines(
        'export function Page() {',
        '  const save = async () => {};',
        '  return (',
        '    <div>',
        '      <form data-guide="settings.form" onSubmit={save} />',
        '      <button data-guide="settings.detached" type="submit" form="settings-form">Save</button>',
        '    </div>',
        '  );',
        '}',
      ),
    });
    expect(targets(graph, 'submits_to', 'element:settings.detached')).toEqual([]);
  });

  it('gives a passive sibling of the form nothing at all', async () => {
    // The regression. `settings.new-key` displays a value next to a form; it
    // submits nothing, and no edge may suggest otherwise.
    const graph = await indexProject({
      ...BASE,
      'src/Page.tsx': lines(
        'export function Page() {',
        '  const save = async () => {};',
        '  return (',
        '    <section>',
        '      <form data-guide="settings.form" onSubmit={save} />',
        '      <code data-guide="settings.new-key">abc</code>',
        '    </section>',
        '  );',
        '}',
      ),
    });
    expect(targets(graph, 'submits_to', 'element:settings.new-key')).toEqual([]);
    expect(graph.relationships.filter((r) => r.source === 'element:settings.new-key')).toHaveLength(
      0,
    );
  });

  it('does not treat a dynamic type as a submit control', async () => {
    const graph = await indexProject({
      ...BASE,
      'src/Page.tsx': lines(
        'export function Page({ kind }: { kind: "submit" | "button" }) {',
        '  const save = async () => {};',
        '  return (',
        '    <form data-guide="settings.form" onSubmit={save}>',
        '      <button data-guide="settings.maybe" type={kind}>Save</button>',
        '    </form>',
        '  );',
        '}',
      ),
    });
    expect(targets(graph, 'submits_to', 'element:settings.maybe')).toEqual([]);
  });
});
