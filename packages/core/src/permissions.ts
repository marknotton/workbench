/**
 * Role and capability model.
 *
 * Two ideas kept apart on purpose:
 *
 *  - **Roles** are what you call people. Every application invents its own, and
 *    Workbench must not have opinions about them beyond a sensible default set.
 *  - **Capabilities** are what the code actually checks. Handlers ask "may this
 *    person do X", never "is this person an admin", so adding a role is a
 *    configuration change rather than a hunt through call sites.
 *
 * The engine below is generic over both. An application supplies its own unions
 * and gets type-safe checks with no mapping layer.
 *
 * The same matrix is meant to be used on the client *and* inside trusted server
 * code. Hiding a button the user cannot use is a courtesy; the server check is
 * the enforcement, and the two agreeing is what stops them drifting apart.
 */

/** The minimum a membership record must expose for a permission check. */
export interface BaseMembership<
  TRole extends string = string,
  TCapability extends string = string,
> {
  userId: string;
  roles: TRole[];
  status: 'active' | 'suspended';
  /** Applications that model invitations set this; others may omit it. */
  inviteStatus?: 'invited' | 'joined' | 'removed';

  /**
   * Capabilities granted to this person specifically, on top of whatever their
   * roles give them.
   *
   * This is what makes a "moderator" tractable. A moderator is not a fixed set
   * of powers — every one of them is trusted with something slightly
   * different, decided by whoever promoted them. Modelling that as roles would
   * mean inventing a role per combination. Grants are additive and never
   * subtractive: removing a power means removing the grant, not adding a
   * negative one, so there is no precedence puzzle to reason about.
   */
  grants?: TCapability[];
}

/**
 * Emulation: seeing the product as a less privileged role would.
 *
 * The safety property that makes this cheap to trust is that emulation only
 * ever **narrows**. The effective answer is the intersection of what you
 * actually hold and what the emulated role holds, so asserting a role can
 * never grant anything — which is why the emulated role can travel as an
 * ordinary request field rather than needing a signed claim.
 */
export interface EmulationOptions<TRole extends string = string> {
  /** Role to be limited to. Omit for no emulation. */
  emulateRole?: TRole;
}

/** Maps each role to the capabilities it grants. */
export type CapabilityMatrix<TRole extends string, TCapability extends string> = Record<
  TRole,
  readonly TCapability[]
>;

export class PermissionError extends Error {
  constructor(readonly capability: string) {
    super(`Missing capability: ${capability}`);
    this.name = 'PermissionError';
  }
}

export interface PermissionChecker<TRole extends string, TCapability extends string> {
  /** Does this single role grant the capability? */
  roleHas(role: TRole, capability: TCapability): boolean;
  /** Does any of these roles grant it? */
  can(
    roles: readonly TRole[],
    capability: TCapability,
    options?: EmulationOptions<TRole>,
  ): boolean;
  /**
   * Does this membership grant it?
   *
   * Considers roles and any per-user grants together. Returns false for a
   * suspended or removed membership regardless of either — revoking access
   * must not require editing someone's role list.
   */
  memberCan(
    member: BaseMembership<TRole, TCapability> | null | undefined,
    capability: TCapability,
    options?: EmulationOptions<TRole>,
  ): boolean;
  /** Throws `PermissionError` instead of returning false. */
  assertCan(roles: readonly TRole[], capability: TCapability): void;
  /** Every capability this set of roles grants, de-duplicated. */
  capabilitiesFor(roles: readonly TRole[]): TCapability[];
  /** Everything a membership can do, roles and grants together. */
  capabilitiesForMember(
    member: BaseMembership<TRole, TCapability> | null | undefined,
    options?: EmulationOptions<TRole>,
  ): TCapability[];
}

/**
 * Build a checker from a matrix.
 *
 * ```ts
 * const permissions = createPermissions<MyRole, MyCapability>({
 *   owner:  ['workspace.configure', 'members.manage'],
 *   admin:  ['members.manage'],
 *   member: [],
 * });
 *
 * permissions.memberCan(membership, 'members.manage');
 * ```
 */
export function createPermissions<TRole extends string, TCapability extends string>(
  matrix: CapabilityMatrix<TRole, TCapability>,
): PermissionChecker<TRole, TCapability> {
  const roleHas = (role: TRole, capability: TCapability): boolean =>
    (matrix[role] ?? []).includes(capability);

  const can = (roles: readonly TRole[], capability: TCapability): boolean =>
    roles.some((role) => roleHas(role, capability));

  const capabilitiesFor = (roles: readonly TRole[]): TCapability[] => {
    const set = new Set<TCapability>();
    for (const role of roles) {
      for (const capability of matrix[role] ?? []) set.add(capability);
    }
    return [...set];
  };

  // Intersection, always. Emulation cannot add.
  const allowedWhileEmulating = (
    capability: TCapability,
    options?: EmulationOptions<TRole>,
  ): boolean => (options?.emulateRole ? roleHas(options.emulateRole, capability) : true);

  return {
    roleHas,

    can(roles, capability, options) {
      return can(roles, capability) && allowedWhileEmulating(capability, options);
    },

    memberCan(member, capability, options) {
      if (!member) return false;
      if (member.status !== 'active') return false;
      if (member.inviteStatus === 'removed') return false;

      const held =
        can(member.roles, capability) || (member.grants?.includes(capability) ?? false);

      return held && allowedWhileEmulating(capability, options);
    },

    assertCan(roles, capability) {
      if (!can(roles, capability)) throw new PermissionError(capability);
    },

    capabilitiesFor,

    capabilitiesForMember(member, options) {
      if (!member) return [];
      if (member.status !== 'active' || member.inviteStatus === 'removed') return [];

      const held = new Set<TCapability>([
        ...capabilitiesFor(member.roles),
        ...(member.grants ?? []),
      ]);

      if (!options?.emulateRole) return [...held];

      const emulated = new Set(capabilitiesFor([options.emulateRole]));
      return [...held].filter((capability) => emulated.has(capability));
    },
  };
}

// ---------------------------------------------------------------------------
// A starter set, for applications with no opinion yet
// ---------------------------------------------------------------------------

/** The conventional three. Applications are free to ignore these entirely. */
export type DefaultRole = 'owner' | 'admin' | 'member';

export type DefaultCapability =
  | 'workspace.configure'
  | 'workspace.delete'
  | 'members.invite'
  | 'members.manage'
  | 'roles.assign'
  | 'content.read'
  | 'content.write'
  | 'files.upload'
  | 'audit.view';

export const DEFAULT_MATRIX: CapabilityMatrix<DefaultRole, DefaultCapability> = {
  owner: [
    'workspace.configure',
    'workspace.delete',
    'members.invite',
    'members.manage',
    'roles.assign',
    'content.read',
    'content.write',
    'files.upload',
    'audit.view',
  ],
  // Everything an owner can do except ending the workspace or changing who owns it.
  admin: [
    'workspace.configure',
    'members.invite',
    'members.manage',
    'content.read',
    'content.write',
    'files.upload',
    'audit.view',
  ],
  member: ['content.read', 'content.write', 'files.upload'],
};

export const defaultPermissions = createPermissions(DEFAULT_MATRIX);
