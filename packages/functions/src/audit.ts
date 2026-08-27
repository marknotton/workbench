/**
 * Administrative audit trail.
 *
 * Separate from any financial or domain ledger on purpose: this records
 * *decisions* — configuration edits, role changes, status transitions — with
 * who made them and what changed. Append-only, like everything else that exists
 * to be trusted later.
 */

import type { Firestore, Transaction } from 'firebase-admin/firestore';

export interface AuditInput {
  actorUserId?: string;
  /** Dotted and stable, e.g. `member.roles`. Read by humans and by filters. */
  action: string;
  entityKind: string;
  entityId: string;
  before?: unknown;
  after?: unknown;
  note?: string;
}

export interface AuditOptions {
  db: Firestore;
  /** Collection path for audit entries, e.g. `(scopeId) => \`workspaces/${scopeId}/auditLog\``. */
  auditPath: (scopeId: string) => string;
  /**
   * Field name the scope id is written under. Defaults to `scopeId`.
   *
   * Configurable so an application with an established audit shape — one that
   * already calls it `eventId` or `tenantId` — can adopt this writer without
   * rewriting documents or the queries that read them.
   */
  scopeField?: string;
}

export interface AuditWriter {
  write(tx: Transaction, scopeId: string, input: AuditInput): void;
}

export function createAuditWriter(options: AuditOptions): AuditWriter {
  const { db, auditPath } = options;
  const scopeField = options.scopeField ?? 'scopeId';

  return {
    write(tx: Transaction, scopeId: string, input: AuditInput): void {
      const ref = db.collection(auditPath(scopeId)).doc();
      tx.set(ref, {
        id: ref.id,
        [scopeField]: scopeId,
        ...(input.actorUserId ? { actorUserId: input.actorUserId } : {}),
        action: input.action,
        entityKind: input.entityKind,
        entityId: input.entityId,
        // Undefined fields are omitted rather than written as null: Firestore
        // rejects undefined, and a null "before" reads as a real prior value.
        ...(input.before !== undefined ? { before: input.before } : {}),
        ...(input.after !== undefined ? { after: input.after } : {}),
        ...(input.note ? { note: input.note } : {}),
        createdAt: new Date().toISOString(),
      });
    },
  };
}
