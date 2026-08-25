import { describe, expect, expectTypeOf, it } from 'vitest';
import {
  appContextSchema,
  builtinActionSchemas,
  guideActionRequestSchema,
  guideElementIdSchema,
  highlightInputSchema,
  navigateInputSchema,
  productElementSchema,
  productFeatureSchema,
  productModelSchema,
  provenanceReferenceSchema,
  scrollInputSchema,
  type AppContext,
  type ProductElement,
  type ProductFeature,
  type ProductModel,
  type ProvenanceReference,
} from '../src/index.js';

describe('guideElementIdSchema', () => {
  it('accepts a conventional id', () => {
    expect(guideElementIdSchema.parse('clients.create')).toBe('clients.create');
  });

  it('rejects a CSS selector with an explanatory message', () => {
    const result = guideElementIdSchema.safeParse('#app > div:nth-child(4)');
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.message).toMatch(/CSS selectors/);
  });
});

describe('product model schemas', () => {
  const provenance: ProvenanceReference = {
    source: 'source-code',
    file: 'src/pages/Clients.tsx',
    symbol: 'Clients',
    line: 82,
  };

  it('validates a provenance reference and rejects an unknown source', () => {
    expect(provenanceReferenceSchema.parse(provenance)).toEqual(provenance);
    expect(provenanceReferenceSchema.safeParse({ source: 'vibes' }).success).toBe(false);
  });

  it('rejects a non-positive line number', () => {
    expect(provenanceReferenceSchema.safeParse({ source: 'source-code', line: 0 }).success).toBe(
      false,
    );
  });

  it('validates an element and enforces the id convention on it', () => {
    const element: ProductElement = {
      id: 'clients.create',
      type: 'button',
      label: 'New Client',
      featureId: 'clients',
      provenance: [provenance],
    };
    expect(productElementSchema.parse(element)).toEqual(element);
    expect(productElementSchema.safeParse({ ...element, id: 'div > button' }).success).toBe(false);
    expect(productElementSchema.safeParse({ ...element, type: 'widget' }).success).toBe(false);
  });

  it('validates a feature and requires the kind discriminator', () => {
    const feature: ProductFeature = {
      id: 'clients',
      kind: 'feature',
      title: 'Clients',
      routes: ['/clients', '/clients/:id'],
      elements: [{ id: 'clients.create', type: 'button' }],
    };
    expect(productFeatureSchema.parse(feature)).toEqual(feature);
    expect(productFeatureSchema.safeParse({ ...feature, kind: 'screen' }).success).toBe(false);
    expect(productFeatureSchema.safeParse({ ...feature, title: '' }).success).toBe(false);
  });

  it('validates a whole product model', () => {
    const model: ProductModel = {
      version: 1,
      application: 'demo',
      features: [{ id: 'clients', kind: 'feature', title: 'Clients' }],
    };
    expect(productModelSchema.parse(model)).toEqual(model);
    expect(productModelSchema.safeParse({ version: 2, features: [] }).success).toBe(false);
  });
});

describe('appContextSchema', () => {
  it('accepts an empty context — every field is optional', () => {
    expect(appContextSchema.parse({})).toEqual({});
  });

  it('validates a fully populated context', () => {
    const context: AppContext = {
      route: '/clients/42',
      screen: 'ClientDetails',
      userId: 'u_1',
      workspaceId: 'w_1',
      permissions: ['clients.read'],
      selectedEntity: { type: 'client', id: '42' },
      visibleElements: ['clients.create'],
      metadata: { theme: 'dark' },
    };
    expect(appContextSchema.parse(context)).toEqual(context);
  });

  it('rejects a selected entity missing its id', () => {
    expect(appContextSchema.safeParse({ selectedEntity: { type: 'client' } }).success).toBe(false);
  });

  it('strips unknown keys rather than failing', () => {
    expect(appContextSchema.parse({ route: '/x', nope: 1 })).toEqual({ route: '/x' });
  });
});

describe('built-in action input schemas', () => {
  it('covers exactly the built-in action vocabulary', () => {
    expect(Object.keys(builtinActionSchemas).sort()).toEqual([
      'highlight',
      'navigate',
      'open',
      'scroll',
      'startGuide',
    ]);
  });

  it('requires a route to navigate', () => {
    expect(navigateInputSchema.parse({ route: '/clients' })).toEqual({ route: '/clients' });
    expect(navigateInputSchema.safeParse({ route: '' }).success).toBe(false);
    expect(navigateInputSchema.safeParse({}).success).toBe(false);
  });

  it('refuses to highlight anything but a semantic element id', () => {
    expect(highlightInputSchema.parse({ elementId: 'clients.create' }).elementId).toBe(
      'clients.create',
    );
    expect(highlightInputSchema.safeParse({ elementId: '#app > div' }).success).toBe(false);
    expect(
      highlightInputSchema.safeParse({ elementId: 'clients.create', durationMs: 0 }).success,
    ).toBe(false);
  });

  it('constrains scroll alignment to the DOM vocabulary', () => {
    expect(scrollInputSchema.parse({ elementId: 'settings.profile' }).block).toBeUndefined();
    expect(
      scrollInputSchema.safeParse({ elementId: 'settings.profile', block: 'middle' }).success,
    ).toBe(false);
  });

  it('infers the input type from the schema', () => {
    expectTypeOf(navigateInputSchema.parse({ route: '/x' })).toEqualTypeOf<{
      route: string;
      replace?: boolean | undefined;
    }>();
  });
});

describe('guideActionRequestSchema', () => {
  it('keeps input opaque so the action schema owns validation', () => {
    const parsed = guideActionRequestSchema.parse({
      action: 'highlight',
      input: { elementId: 'clients.create' },
      source: 'agent',
      reason: 'showing the user where to click',
    });
    expect(parsed.action).toBe('highlight');
    expect(parsed.input).toEqual({ elementId: 'clients.create' });
  });

  it('rejects an unnamed action and an unknown source', () => {
    expect(guideActionRequestSchema.safeParse({ action: '' }).success).toBe(false);
    expect(guideActionRequestSchema.safeParse({ action: 'x', source: 'robot' }).success).toBe(
      false,
    );
  });
});
