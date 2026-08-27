import { describe, expect, it } from 'vitest';
import {
  DEFAULT_MATRIX,
  PermissionError,
  createPermissions,
  defaultPermissions,
  type BaseMembership,
} from './permissions.js';

type Role = 'owner' | 'admin' | 'member';
type Capability = 'configure' | 'invite' | 'read';

const permissions = createPermissions<Role, Capability>({
  owner: ['configure', 'invite', 'read'],
  admin: ['invite', 'read'],
  member: ['read'],
});

function membership(overrides: Partial<BaseMembership<Role>> = {}): BaseMembership<Role> {
  return { userId: 'usr_1', roles: ['member'], status: 'active', ...overrides };
}

describe('capability checks', () => {
  it('grants what the matrix says and nothing more', () => {
    expect(permissions.roleHas('owner', 'configure')).toBe(true);
    expect(permissions.roleHas('admin', 'configure')).toBe(false);
    expect(permissions.roleHas('member', 'invite')).toBe(false);
  });

  it('unions capabilities across several roles', () => {
    expect(permissions.can(['member', 'admin'], 'invite')).toBe(true);
    expect(permissions.capabilitiesFor(['member', 'admin']).sort()).toEqual(['invite', 'read']);
  });

  it('de-duplicates overlapping roles', () => {
    expect(permissions.capabilitiesFor(['member', 'member'])).toEqual(['read']);
  });

  it('refuses an empty role list', () => {
    expect(permissions.can([], 'read')).toBe(false);
  });
});

describe('membership checks', () => {
  it('grants an active member their capabilities', () => {
    expect(permissions.memberCan(membership(), 'read')).toBe(true);
  });

  it('refuses a suspended membership everything, whatever its roles', () => {
    const suspended = membership({ roles: ['owner'], status: 'suspended' });
    expect(permissions.memberCan(suspended, 'read')).toBe(false);
    expect(permissions.memberCan(suspended, 'configure')).toBe(false);
  });

  it('refuses a removed membership', () => {
    expect(
      permissions.memberCan(membership({ roles: ['owner'], inviteStatus: 'removed' }), 'read'),
    ).toBe(false);
  });

  it('allows a membership that does not model invitations at all', () => {
    const { inviteStatus: _unused, ...withoutInvite } = membership();
    expect(permissions.memberCan(withoutInvite, 'read')).toBe(true);
  });

  it('refuses null, so an unresolved membership is never a pass', () => {
    expect(permissions.memberCan(null, 'read')).toBe(false);
    expect(permissions.memberCan(undefined, 'read')).toBe(false);
  });
});

describe('assertCan', () => {
  it('throws a typed error naming the capability', () => {
    expect(() => permissions.assertCan(['member'], 'configure')).toThrow(PermissionError);
    try {
      permissions.assertCan(['member'], 'configure');
    } catch (error) {
      expect((error as PermissionError).capability).toBe('configure');
    }
  });

  it('passes silently when allowed', () => {
    expect(() => permissions.assertCan(['owner'], 'configure')).not.toThrow();
  });
});

describe('the default starter matrix', () => {
  it('gives only the owner destructive and ownership powers', () => {
    expect(defaultPermissions.can(['owner'], 'workspace.delete')).toBe(true);
    expect(defaultPermissions.can(['admin'], 'workspace.delete')).toBe(false);
    expect(defaultPermissions.can(['admin'], 'roles.assign')).toBe(false);
  });

  it('lets an admin run the workspace day to day', () => {
    expect(defaultPermissions.can(['admin'], 'members.invite')).toBe(true);
    expect(defaultPermissions.can(['admin'], 'audit.view')).toBe(true);
  });

  it('keeps a plain member out of administration', () => {
    expect(defaultPermissions.can(['member'], 'members.manage')).toBe(false);
    expect(defaultPermissions.can(['member'], 'audit.view')).toBe(false);
    expect(defaultPermissions.can(['member'], 'content.write')).toBe(true);
  });

  it('defines every role in the union', () => {
    expect(Object.keys(DEFAULT_MATRIX).sort()).toEqual(['admin', 'member', 'owner']);
  });
});

describe('an unknown role', () => {
  it('grants nothing rather than throwing, so stale data cannot escalate', () => {
    const stale = membership({ roles: ['ghost' as Role] });
    expect(permissions.memberCan(stale, 'read')).toBe(false);
  });
});
