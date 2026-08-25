import { describe, expect, it } from 'vitest';
import {
  GUIDE_ATTRIBUTE,
  GUIDE_ATTRIBUTES,
  LEGACY_GUIDE_ATTRIBUTE,
  guideElementIdSegments,
  guideElementNamespace,
  isValidGuideElementId,
} from '../src/index.js';

describe('guide attributes', () => {
  it('prefers data-guide over the compatibility attribute', () => {
    expect(GUIDE_ATTRIBUTES[0]).toBe(GUIDE_ATTRIBUTE);
    expect(GUIDE_ATTRIBUTE).toBe('data-guide');
    expect(LEGACY_GUIDE_ATTRIBUTE).toBe('data-ai-id');
  });
});

describe('isValidGuideElementId', () => {
  it.each(['clients', 'clients.create', 'clients.create.submit-button', 'a', 'x1.y2.z3'])(
    'accepts %s',
    (id) => {
      expect(isValidGuideElementId(id)).toBe(true);
    },
  );

  // The whole safety model rests on these being rejected: if a selector could
  // pass as an id, an agent could smuggle arbitrary DOM targeting through a
  // field that every layer treats as an opaque name.
  it.each([
    ['#app > div:nth-child(4)', 'css selector'],
    ['.btn-primary', 'class selector'],
    ['div button', 'descendant selector'],
    ['[data-guide="x"]', 'attribute selector'],
    ['clients create', 'whitespace'],
    ['Clients.Create', 'uppercase'],
    ['clients..create', 'empty segment'],
    ['.clients', 'leading dot'],
    ['clients.', 'trailing dot'],
    ['-clients', 'leading hyphen'],
    ['clients/create', 'path separator'],
    ['', 'empty string'],
  ])('rejects %s (%s)', (id) => {
    expect(isValidGuideElementId(id)).toBe(false);
  });

  it('rejects ids that are too long or too deeply nested', () => {
    expect(isValidGuideElementId('a'.repeat(129))).toBe(false);
    expect(isValidGuideElementId(Array.from({ length: 9 }, () => 'a').join('.'))).toBe(false);
    expect(isValidGuideElementId(Array.from({ length: 8 }, () => 'a').join('.'))).toBe(true);
  });
});

describe('id decomposition', () => {
  it('splits into segments', () => {
    expect(guideElementIdSegments('clients.create')).toEqual(['clients', 'create']);
  });

  it('derives a namespace from all but the last segment', () => {
    expect(guideElementNamespace('clients.create')).toBe('clients');
    expect(guideElementNamespace('settings.profile.save')).toBe('settings.profile');
  });

  it('treats a single-segment id as its own namespace', () => {
    expect(guideElementNamespace('dashboard')).toBe('dashboard');
  });
});
