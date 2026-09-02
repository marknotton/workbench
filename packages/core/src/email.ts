/**
 * Email identity — deciding when two addresses are the same person.
 *
 * Firebase Authentication treats `mark.notton@gmail.com` and
 * `marknotton@gmail.com` as two different accounts. Gmail delivers both to the
 * same mailbox. So somebody can register with a password, then sign in with
 * Google, and end up with two accounts, two profiles and two sets of
 * memberships — having done nothing wrong and seen no warning.
 *
 * The rules that make two addresses equivalent are **provider-specific**, and
 * that is the whole difficulty. Gmail ignores dots; almost nobody else does.
 * Applying Gmail's rules everywhere would merge genuinely distinct accounts at
 * providers where `a.b@` and `ab@` are different people — a far worse failure
 * than the one being fixed. So normalisation is conservative by default and
 * only applies a rule where the provider is known to work that way.
 *
 * Store the address as the person typed it, for display and for sending.
 * Use the normalised form for comparison and collision detection only.
 */

/** Local-part rules a provider applies. */
export interface ProviderRules {
  /** `a.b@x` and `ab@x` are the same mailbox. Gmail does this; most do not. */
  ignoresDots?: boolean;
  /** Everything from `+` to `@` is a tag and is ignored. */
  ignoresPlusTag?: boolean;
  /** Domains that are aliases of the canonical one. */
  aliasOf?: string;
}

/**
 * Deliberately short. Every entry is a documented provider behaviour, not a
 * guess — an incorrect entry silently merges two people's accounts.
 */
export const DEFAULT_PROVIDER_RULES: Record<string, ProviderRules> = {
  'gmail.com': { ignoresDots: true, ignoresPlusTag: true },
  'googlemail.com': { ignoresDots: true, ignoresPlusTag: true, aliasOf: 'gmail.com' },
  // Microsoft consumer domains honour plus-tags but treat dots as significant.
  'outlook.com': { ignoresPlusTag: true },
  'hotmail.com': { ignoresPlusTag: true },
  'live.com': { ignoresPlusTag: true },
  'yahoo.com': {},
  'icloud.com': { ignoresPlusTag: true },
  'proton.me': { ignoresPlusTag: true },
  'protonmail.com': { ignoresPlusTag: true, aliasOf: 'proton.me' },
};

export interface NormaliseOptions {
  /** Override or extend the provider table. */
  rules?: Record<string, ProviderRules>;
  /**
   * Apply plus-tag stripping to unknown domains too.
   *
   * Off by default: plus-addressing is widespread but not universal, and a
   * provider that treats `+` as an ordinary character would have two distinct
   * users merged. Turn it on only if you know your audience.
   */
  assumePlusTagsEverywhere?: boolean;
}

export interface NormalisedEmail {
  /** Exactly what was supplied, trimmed. Use this for display and sending. */
  original: string;
  /** Comparison key. Never show this to anyone or send to it. */
  normalised: string;
  localPart: string;
  domain: string;
  /** Which rules were applied, for logging a collision comprehensibly. */
  appliedRules: string[];
}

export class EmailError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'EmailError';
  }
}

/**
 * Reduce an address to a comparison key.
 *
 * Case is folded on both parts. In the standard the local part is technically
 * case-sensitive, but no provider in practice treats it that way, and treating
 * it as sensitive would let `Mark@` and `mark@` register separately — which is
 * the bug, not the fix.
 */
export function normaliseEmail(email: string, options: NormaliseOptions = {}): NormalisedEmail {
  const trimmed = email.trim();
  const at = trimmed.lastIndexOf('@');

  if (at <= 0 || at === trimmed.length - 1) {
    throw new EmailError(`Not a valid email address: ${email}`);
  }

  let localPart = trimmed.slice(0, at).toLowerCase();
  let domain = trimmed.slice(at + 1).toLowerCase();
  const appliedRules: string[] = [];

  const table = options.rules ?? DEFAULT_PROVIDER_RULES;
  const rules = table[domain];

  if (rules?.aliasOf) {
    domain = rules.aliasOf;
    appliedRules.push(`domain alias -> ${domain}`);
  }

  const plusTags = rules?.ignoresPlusTag ?? options.assumePlusTagsEverywhere ?? false;
  if (plusTags) {
    const plus = localPart.indexOf('+');
    if (plus > 0) {
      localPart = localPart.slice(0, plus);
      appliedRules.push('plus tag removed');
    }
  }

  if (rules?.ignoresDots) {
    if (localPart.includes('.')) {
      localPart = localPart.replaceAll('.', '');
      appliedRules.push('dots removed');
    }
  }

  return {
    original: trimmed,
    normalised: `${localPart}@${domain}`,
    localPart,
    domain,
    appliedRules,
  };
}

/** Whether two addresses reach the same mailbox, under the known rules. */
export function emailsEquivalent(
  a: string,
  b: string,
  options: NormaliseOptions = {},
): boolean {
  try {
    return normaliseEmail(a, options).normalised === normaliseEmail(b, options).normalised;
  } catch {
    return false;
  }
}

export interface EmailCollision {
  /** The address being registered. */
  candidate: NormalisedEmail;
  /** The existing address it collides with. */
  existing: NormalisedEmail;
  /** True when the two are byte-identical rather than merely equivalent. */
  exact: boolean;
  /** One line, safe to log: says why they matched without dumping state. */
  explanation: string;
}

/**
 * Find an existing address that reaches the same mailbox as `candidate`.
 *
 * Returns the collision rather than throwing, because what to *do* about it is
 * the application's decision: refuse the registration, offer to sign in
 * instead, or link the credentials to the existing account. Refusing outright
 * is usually wrong — the person is not doing anything suspicious, and telling
 * them the address is taken when they believe it is theirs is baffling.
 */
export function findEmailCollision(
  candidate: string,
  existing: readonly string[],
  options: NormaliseOptions = {},
): EmailCollision | null {
  let normalisedCandidate: NormalisedEmail;
  try {
    normalisedCandidate = normaliseEmail(candidate, options);
  } catch {
    return null;
  }

  for (const other of existing) {
    let normalisedOther: NormalisedEmail;
    try {
      normalisedOther = normaliseEmail(other, options);
    } catch {
      continue;
    }

    if (normalisedOther.normalised !== normalisedCandidate.normalised) continue;

    const exact = normalisedOther.original.toLowerCase() === normalisedCandidate.original.toLowerCase();
    const why = normalisedCandidate.appliedRules.length
      ? normalisedCandidate.appliedRules.join(', ')
      : 'case folding';

    return {
      candidate: normalisedCandidate,
      existing: normalisedOther,
      exact,
      explanation: exact
        ? `"${normalisedCandidate.original}" already exists.`
        : `"${normalisedCandidate.original}" reaches the same mailbox as the existing ` +
          `"${normalisedOther.original}" (${normalisedCandidate.domain}: ${why}).`,
    };
  }

  return null;
}
