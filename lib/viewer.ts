// Bridges the session cookie to the store's visibility model (Node runtime).
import { getCurrentSession, type SessionPayload } from '@/lib/admin-session';
import type { Viewer } from '@/lib/store';

export function sessionToViewer(session: SessionPayload): Viewer {
  if (session.scope === 'worker' && session.workerId) {
    return { role: 'worker', workerId: session.workerId };
  }
  return { role: 'admin' };
}

/** Current session + viewer, or null when unauthenticated (middleware normally prevents that). */
export async function getViewer(): Promise<{ session: SessionPayload; viewer: Viewer } | null> {
  const session = await getCurrentSession();
  if (!session) return null;
  return { session, viewer: sessionToViewer(session) };
}

/** The id recorded in openedBy/createdBy fields for the current session. */
export function actorId(session: SessionPayload) {
  return session.scope === 'worker' && session.workerId ? session.workerId : 'admin';
}
