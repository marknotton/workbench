/**
 * Idempotency for callables.
 *
 * A command carries a caller-generated `requestId`. The first time it is seen
 * the work is done and the result recorded; a replay returns the recorded
 * result without repeating anything. That is what stops a double-tapped confirm
 * button becoming two records, or a retried operation becoming two writes.
 *
 * The read and the write must happen inside the *same* transaction as the work
 * itself, or the guarantee is lost: two concurrent replays could both read
 * "not seen yet" before either wrote.
 *
 * Where the ledger lives is the application's decision, so the document path is
 * supplied rather than assumed.
 */

import type { Firestore, Transaction } from 'firebase-admin/firestore';

export interface RequestRecord<T> {
  requestId: string;
  completedAt: string;
  result: T;
}

export interface IdempotencyOptions {
  db: Firestore;
  /**
   * Full document path for a request record, e.g.
   * `(scopeId, requestId) => \`workspaces/${scopeId}/requests/${requestId}\``.
   */
  requestPath: (scopeId: string, requestId: string) => string;
}

export interface Idempotency {
  /** The recorded result of a previous run, or null if this is the first. */
  read<T>(tx: Transaction, scopeId: string, requestId: string): Promise<T | null>;
  /** Record the result. Call inside the same transaction as the work. */
  write<T>(tx: Transaction, scopeId: string, requestId: string, result: T): void;
}

export function createIdempotency(options: IdempotencyOptions): Idempotency {
  const { db, requestPath } = options;

  return {
    async read<T>(tx: Transaction, scopeId: string, requestId: string): Promise<T | null> {
      const snap = await tx.get(db.doc(requestPath(scopeId, requestId)));
      return snap.exists ? ((snap.data() as RequestRecord<T>).result ?? null) : null;
    },

    write<T>(tx: Transaction, scopeId: string, requestId: string, result: T): void {
      tx.set(db.doc(requestPath(scopeId, requestId)), {
        requestId,
        completedAt: new Date().toISOString(),
        result,
      });
    },
  };
}
