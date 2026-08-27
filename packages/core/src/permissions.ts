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
export interface BaseMembership<TRole extends string = string> {
  userId: string;
  roles: TRole[];
  status: 'active' | 'suspended';
  /** Applications that model invitations set this; others may omit it. */
  inviteStatus?: 'invited' | 'joined' | 'removed';
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
  can(roles: readonly TRole[], capability: TCapability): boolean;
  /**
   * Does this membership grant it?
   *
   * Returns false for a suspended or removed membership regardless of roles —
   * revoking access must not require editing someone's role list.
   */
  memberCan(member: BaseMembership<TRole> | null | undefined, capability: TCapability): boolean;
  /** Throws `PermissionError` instead of returning false. */
  assertCan(roles: readonly TRole[], capability: TCapability): void;
  /** Every capability this set of roles grants, de-duplicated. */
  capabilitiesFor(roles: readonly TRole[]): TCapability[];
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

  return {
    roleHas,
    can,

    memberCan(member, capability) {
      if (!member) return false;
      if (member.status !== 'active') return false;
      if (member.inviteStatus === 'removed') return false;
      return can(member.roles, capability);
    },

    assertCan(roles, capability) {
      if (!can(roles, capability)) throw new PermissionError(capability);
    },

    capabilitiesFor(roles) {
      const set = new Set<TCapability>();
      for (const role of roles) {
        for (const capability of matrix[role] ?? []) set.add(capability);
      }
      return [...set];
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
