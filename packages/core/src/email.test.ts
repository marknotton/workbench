import { describe, expect, it } from 'vitest';
import {
  DEFAULT_PROVIDER_RULES,
  EmailError,
  emailsEquivalent,
  findEmailCollision,
  normaliseEmail,
} from './email.js';

describe('gmail', () => {
  it('treats dotted and undotted local parts as one mailbox', () => {
    // The case that caused a duplicate account in practice.
    expect(emailsEquivalent('mark.notton@gmail.com', 'marknotton@gmail.com')).toBe(true);
  });

  it('ignores plus tags', () => {
    expect(emailsEquivalent('mark+games@gmail.com', 'mark@gmail.com')).toBe(true);
  });

  it('applies both rules together', () => {
    expect(emailsEquivalent('m.a.r.k+test@gmail.com', 'mark@gmail.com')).toBe(true);
  });

  it('treats googlemail.com as gmail.com', () => {
    expect(emailsEquivalent('mark.notton@googlemail.com', 'marknotton@gmail.com')).toBe(true);
  });

  it('still distinguishes genuinely different people', () => {
    expect(emailsEquivalent('mark@gmail.com', 'sarah@gmail.com')).toBe(false);
  });
});

describe('providers that do not ignore dots', () => {
  it('keeps dotted addresses distinct outside gmail', () => {
    // The important negative: merging these would be worse than the bug.
    expect(emailsEquivalent('a.b@outlook.com', 'ab@outlook.com')).toBe(false);
    expect(emailsEquivalent('a.b@example.com', 'ab@example.com')).toBe(false);
  });

  it('honours plus tags where the provider does', () => {
    expect(emailsEquivalent('mark+x@outlook.com', 'mark@outlook.com')).toBe(true);
  });

  it('leaves plus tags alone on unknown domains by default', () => {
    expect(emailsEquivalent('mark+x@example.com', 'mark@example.com')).toBe(false);
  });

  it('can be told to assume plus tags everywhere', () => {
    expect(
      emailsEquivalent('mark+x@example.com', 'mark@example.com', {
        assumePlusTagsEverywhere: true,
      }),
    ).toBe(true);
  });
});

describe('case', () => {
  it('folds case on both parts', () => {
    expect(emailsEquivalent('Mark.Notton@Gmail.com', 'marknotton@gmail.com')).toBe(true);
  });
});

describe('normaliseEmail', () => {
  it('preserves the original for display and sending', () => {
    const result = normaliseEmail('  Mark.Notton@Gmail.com  ');
    expect(result.original).toBe('Mark.Notton@Gmail.com');
    expect(result.normalised).toBe('marknotton@gmail.com');
  });

  it('reports which rules it applied, so a collision can be explained', () => {
    expect(normaliseEmail('m.a.r.k+tag@gmail.com').appliedRules).toEqual([
      'plus tag removed',
      'dots removed',
    ]);
    expect(normaliseEmail('mark@example.com').appliedRules).toEqual([]);
  });

  it('rejects malformed addresses rather than guessing', () => {
    for (const bad of ['', 'nope', '@example.com', 'mark@', '   ']) {
      expect(() => normaliseEmail(bad)).toThrow(EmailError);
    }
  });

  it('splits on the last @, so a quoted local part does not break it', () => {
    expect(normaliseEmail('a@b@example.com').domain).toBe('example.com');
  });
});

describe('findEmailCollision', () => {
  const existing = ['marknotton@gmail.com', 'sarah@outlook.com'];

  it('finds an equivalent address and explains why', () => {
    const hit = findEmailCollision('mark.notton@gmail.com', existing);
    expect(hit).not.toBeNull();
    expect(hit!.exact).toBe(false);
    expect(hit!.explanation).toContain('same mailbox');
    expect(hit!.explanation).toContain('dots removed');
  });

  it('marks a byte-identical match as exact', () => {
    const hit = findEmailCollision('marknotton@gmail.com', existing);
    expect(hit!.exact).toBe(true);
    expect(hit!.explanation).toContain('already exists');
  });

  it('returns null when there is no clash', () => {
    expect(findEmailCollision('someone@example.com', existing)).toBeNull();
  });

  it('ignores malformed entries in the existing list rather than throwing', () => {
    expect(findEmailCollision('mark.notton@gmail.com', ['', 'broken', ...existing])).not.toBeNull();
  });

  it('returns null for a malformed candidate', () => {
    expect(findEmailCollision('nonsense', existing)).toBeNull();
  });

  it('does not leak anything beyond the two addresses into the log line', () => {
    const hit = findEmailCollision('mark.notton@gmail.com', existing);
    expect(hit!.explanation.split('\n')).toHaveLength(1);
  });
});

describe('the provider table', () => {
  it('only claims dot-insensitivity for Google domains', () => {
    const dotless = Object.entries(DEFAULT_PROVIDER_RULES)
      .filter(([, rules]) => rules.ignoresDots)
      .map(([domain]) => domain)
      .sort();
    expect(dotless).toEqual(['gmail.com', 'googlemail.com']);
  });

  it('can be replaced wholesale by an application', () => {
    const rules = { 'corp.example': { ignoresDots: true } };
    expect(emailsEquivalent('a.b@corp.example', 'ab@corp.example', { rules })).toBe(true);
    // And the built-in table no longer applies.
    expect(emailsEquivalent('a.b@gmail.com', 'ab@gmail.com', { rules })).toBe(false);
  });
});
