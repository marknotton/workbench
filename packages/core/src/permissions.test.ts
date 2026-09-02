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

function membership(
  overrides: Partial<BaseMembership<Role, Capability>> = {},
): BaseMembership<Role, Capability> {
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

describe('per-user grants — the moderator mechanism', () => {
  it('adds a capability the roles do not give', () => {
    const mod = membership({ roles: ['member'], grants: ['invite'] });
    expect(permissions.memberCan(mod, 'invite')).toBe(true);
    // And nothing else came with it.
    expect(permissions.memberCan(mod, 'configure')).toBe(false);
  });

  it('lets two moderators hold different powers', () => {
    const one = membership({ roles: ['member'], grants: ['invite'] });
    const two = membership({ roles: ['member'], grants: ['configure'] });
    expect(permissions.memberCan(one, 'invite')).toBe(true);
    expect(permissions.memberCan(two, 'invite')).toBe(false);
    expect(permissions.memberCan(two, 'configure')).toBe(true);
  });

  it('is additive only, so removing a power means removing the grant', () => {
    const stripped = membership({ roles: ['member'], grants: [] });
    expect(permissions.memberCan(stripped, 'read')).toBe(true);
  });

  it('does not rescue a suspended or removed membership', () => {
    expect(
      permissions.memberCan(
        membership({ roles: ['member'], grants: ['configure'], status: 'suspended' }),
        'configure',
      ),
    ).toBe(false);
    expect(
      permissions.memberCan(
        membership({ roles: ['member'], grants: ['configure'], inviteStatus: 'removed' }),
        'configure',
      ),
    ).toBe(false);
  });

  it('reports roles and grants together', () => {
    const mod = membership({ roles: ['member'], grants: ['invite'] });
    expect(permissions.capabilitiesForMember(mod).sort()).toEqual(['invite', 'read']);
  });
});

describe('emulation only ever narrows', () => {
  const owner = membership({ roles: ['owner'] });

  it('limits an owner to what the emulated role holds', () => {
    expect(permissions.memberCan(owner, 'configure')).toBe(true);
    expect(permissions.memberCan(owner, 'configure', { emulateRole: 'member' })).toBe(false);
    expect(permissions.memberCan(owner, 'read', { emulateRole: 'member' })).toBe(true);
  });

  it('cannot grant anything — the property the whole design rests on', () => {
    // A member claiming to be an owner gains nothing, which is why the
    // emulated role is safe to accept from the client.
    const plain = membership({ roles: ['member'] });
    expect(permissions.memberCan(plain, 'configure', { emulateRole: 'owner' })).toBe(false);
    expect(permissions.can(['member'], 'configure', { emulateRole: 'owner' })).toBe(false);
  });

  it('narrows grants as well as roles', () => {
    const mod = membership({ roles: ['member'], grants: ['invite'] });
    expect(permissions.memberCan(mod, 'invite')).toBe(true);
    expect(permissions.memberCan(mod, 'invite', { emulateRole: 'member' })).toBe(false);
  });

  it('reports the narrowed capability list', () => {
    expect(permissions.capabilitiesForMember(owner, { emulateRole: 'member' })).toEqual(['read']);
  });

  it('is a no-op when no role is being emulated', () => {
    expect(permissions.memberCan(owner, 'configure', {})).toBe(true);
  });
});
