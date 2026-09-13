import { db } from '@/db/client';
import { sql } from 'drizzle-orm';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Liveness probe for Docker. Touches the database, so a broken volume mount
 *  shows up as an unhealthy container rather than as a 500 at dinner time. */
export async function GET() {
  try {
    await db.get(sql`select 1`);
    return Response.json({ status: 'ok', time: new Date().toISOString() });
  } catch (error) {
    return Response.json(
      { status: 'error', error: error instanceof Error ? error.message : 'unbekannt' },
      { status: 503 },
    );
  }
}
