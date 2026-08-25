import { describe, expect, it } from 'vitest';
import type { ProductModel } from '@statewavedev/guide-shared';
import {
  createInMemoryMemoryProvider,
  createStaticKnowledgeProvider,
  scoreFields,
  tokenize,
} from '../src/index.js';

const model: ProductModel = {
  version: 1,
  features: [
    {
      id: 'clients',
      kind: 'feature',
      title: 'Clients',
      description: 'Create and manage the clients in your workspace.',
      routes: ['/clients', '/clients/:id'],
      elements: [
        { id: 'clients.create', type: 'button', label: 'New Client' },
        { id: 'clients.table', type: 'table', label: 'Client list' },
      ],
    },
    {
      id: 'settings',
      kind: 'feature',
      title: 'Settings',
      description: 'Workspace preferences and notifications.',
      routes: ['/settings'],
      elements: [{ id: 'settings.profile', type: 'section', label: 'Profile' }],
    },
    {
      id: 'dashboard',
      kind: 'feature',
      title: 'Dashboard',
      description: 'An overview of recent activity.',
      routes: ['/'],
    },
  ],
};

describe('tokenize', () => {
  it('treats dots and hyphens as separators so ids are searchable', () => {
    expect(tokenize('clients.create')).toEqual(['clients', 'create']);
    expect(tokenize('submit-button')).toEqual(['submit', 'button']);
    expect(tokenize('How do I add a Client?')).toEqual(['how', 'do', 'i', 'add', 'a', 'client']);
  });
});

describe('scoreFields', () => {
  it('scores nothing for an empty query or empty fields', () => {
    expect(scoreFields([], [{ text: 'clients', weight: 1 }])).toBe(0);
    expect(scoreFields(['clients'], [])).toBe(0);
  });

  it('ranks a high-weight match above a low-weight one', () => {
    const inTitle = scoreFields(['clients'], [{ text: 'Clients', weight: 3 }]);
    const inBody = scoreFields(
      ['clients'],
      [
        { text: 'Something else', weight: 3 },
        { text: 'mentions clients', weight: 1 },
      ],
    );
    expect(inTitle).toBeGreaterThan(inBody);
  });

  it('counts a prefix match for less than an exact one', () => {
    const exact = scoreFields(['clients'], [{ text: 'clients', weight: 1 }]);
    const prefix = scoreFields(['client'], [{ text: 'clients', weight: 1 }]);
    expect(prefix).toBeGreaterThan(0);
    expect(prefix).toBeLessThan(exact);
  });

  it('never exceeds 1', () => {
    expect(scoreFields(['clients'], [{ text: 'clients clients', weight: 5 }])).toBeLessThanOrEqual(
      1,
    );
  });
});

describe('createStaticKnowledgeProvider', () => {
  const knowledge = createStaticKnowledgeProvider(model);

  it('finds a feature by title', async () => {
    const results = await knowledge.search('settings');
    expect(results[0]?.id).toBe('settings');
  });

  it('finds a feature through one of its element labels', async () => {
    const results = await knowledge.search('new client');
    expect(results[0]?.id).toBe('clients');
    // Both client elements legitimately mention "client"; only one mentions "new".
    expect(results[0]?.matchedElements?.map((e) => e.id)).toEqual([
      'clients.create',
      'clients.table',
    ]);

    const narrower = await knowledge.search('new');
    expect(narrower[0]?.matchedElements?.map((e) => e.id)).toEqual(['clients.create']);
  });

  it('returns nothing for a query that matches nothing', async () => {
    await expect(knowledge.search('quantum chromodynamics')).resolves.toEqual([]);
  });

  it('returns nothing for an empty query', async () => {
    await expect(knowledge.search('   ')).resolves.toEqual([]);
  });

  it('prefers the feature the user is currently looking at', async () => {
    const neutral = await knowledge.search('overview activity settings preferences');
    const onSettings = await knowledge.search('overview activity settings preferences', {
      route: '/settings',
    });

    const settingsScore = (results: typeof neutral) =>
      results.find((r) => r.id === 'settings')?.score ?? 0;
    expect(settingsScore(onSettings)).toBeGreaterThan(settingsScore(neutral));
  });

  it('matches a parameterised route against a concrete one', async () => {
    const results = await knowledge.search('client', { route: '/clients/42' });
    expect(results[0]?.id).toBe('clients');
  });

  it('honours the result limit', async () => {
    const limited = createStaticKnowledgeProvider(model, { limit: 1 });
    expect(await limited.search('clients settings dashboard')).toHaveLength(1);
    expect(
      await limited.search('clients settings dashboard', undefined, { limit: 2 }),
    ).toHaveLength(2);
  });

  it('is deterministic — the same query always yields the same order', async () => {
    const once = await knowledge.search('client settings');
    const twice = await knowledge.search('client settings');
    expect(once.map((r) => r.id)).toEqual(twice.map((r) => r.id));
  });

  it('supports direct lookup by feature and element id', async () => {
    expect((await knowledge.getFeature?.('clients'))?.title).toBe('Clients');
    expect((await knowledge.getElement?.('clients.create'))?.label).toBe('New Client');
    expect(await knowledge.getFeature?.('nope')).toBeUndefined();
  });
});

describe('createInMemoryMemoryProvider', () => {
  it('remembers and recalls', async () => {
    const memory = createInMemoryMemoryProvider();
    await memory.remember({ text: 'Sam prefers keyboard shortcuts' });

    const results = await memory.retrieve({ query: 'shortcuts' });

    expect(results).toHaveLength(1);
    expect(results[0]?.text).toBe('Sam prefers keyboard shortcuts');
    expect(results[0]?.score).toBeGreaterThan(0);
  });

  it('namespaces by subject', async () => {
    const memory = createInMemoryMemoryProvider();
    await memory.remember({ text: 'likes dark mode', subject: 'user:1' });
    await memory.remember({ text: 'likes dark mode', subject: 'user:2' });

    expect(await memory.retrieve({ query: 'dark mode', subject: 'user:1' })).toHaveLength(1);
    expect(await memory.retrieve({ query: 'dark mode' })).toHaveLength(2);
  });

  it('stamps an ISO timestamp from an injectable clock', async () => {
    const memory = createInMemoryMemoryProvider({
      now: () => new Date('2026-08-25T00:00:00.000Z'),
    });
    await memory.remember({ text: 'x' });
    expect(memory.all()[0]?.createdAt).toBe('2026-08-25T00:00:00.000Z');
  });

  it('accepts seed records and can be cleared', async () => {
    const memory = createInMemoryMemoryProvider({
      initial: [{ text: 'seeded fact about clients' }],
    });
    expect(memory.all()).toHaveLength(1);

    memory.clear();
    expect(memory.all()).toEqual([]);
    await expect(memory.retrieve({ query: 'clients' })).resolves.toEqual([]);
  });

  it('returns copies so callers cannot mutate the store', async () => {
    const memory = createInMemoryMemoryProvider({ initial: [{ text: 'a fact' }] });
    const record = memory.all()[0];
    if (record) record.text = 'tampered';
    expect(memory.all()[0]?.text).toBe('a fact');
  });

  it('honours the limit and returns nothing for an empty query', async () => {
    const memory = createInMemoryMemoryProvider({
      initial: [{ text: 'client one' }, { text: 'client two' }, { text: 'client three' }],
    });

    expect(await memory.retrieve({ query: 'client', limit: 2 })).toHaveLength(2);
    expect(await memory.retrieve({ query: '' })).toEqual([]);
  });
});
