import { runIngestion, type SyncResult } from "@/lib/rag/ingest";
import { db } from "@/lib/db";
import { syncLog } from "@/lib/db/schema";
import { desc } from "drizzle-orm";

export const maxDuration = 300; // 5 minutes — ingestion can be slow

/**
 * POST /api/sync-docs
 *
 * Triggers the n8n node documentation ingestion pipeline.
 * Protected by CRON_SECRET (for Vercel Cron) or the user's AI key (for manual trigger).
 */
export async function POST(req: Request) {
  // Authenticate: either Vercel Cron secret or manual trigger from settings
  const authHeader = req.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  const manualKey = req.headers.get("x-sync-key");

  const isVercelCron =
    cronSecret && authHeader === `Bearer ${cronSecret}`;
  const isManualTrigger =
    manualKey && manualKey.length > 0; // Manual trigger from settings page

  if (!isVercelCron && !isManualTrigger) {
    return Response.json(
      { error: "Unauthorized. Provide CRON_SECRET or a valid sync key." },
      { status: 401 }
    );
  }

  try {
    const result: SyncResult = await runIngestion();

    return Response.json({
      success: result.success,
      nodesProcessed: result.nodesProcessed,
      chunksCreated: result.chunksCreated,
      errors: result.errors.slice(0, 10), // Limit error output
      durationMs: result.duration,
    });
  } catch (err) {
    console.error("[sync-docs] Ingestion failed:", err);
    return Response.json(
      {
        success: false,
        error: err instanceof Error ? err.message : "Ingestion failed",
      },
      { status: 500 }
    );
  }
}

/**
 * GET /api/sync-docs
 *
 * Returns the latest sync status (for the settings UI).
 * Also serves as the Vercel Cron endpoint (Vercel cron sends GET requests).
 */
export async function GET(req: Request) {
  // Check if this is a Vercel Cron invocation
  const authHeader = req.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  const isVercelCron = cronSecret && authHeader === `Bearer ${cronSecret}`;

  if (isVercelCron) {
    // This is a cron trigger — run the ingestion
    try {
      const result: SyncResult = await runIngestion();
      return Response.json({
        success: result.success,
        nodesProcessed: result.nodesProcessed,
        chunksCreated: result.chunksCreated,
        durationMs: result.duration,
      });
    } catch (err) {
      return Response.json(
        {
          success: false,
          error: err instanceof Error ? err.message : "Cron ingestion failed",
        },
        { status: 500 }
      );
    }
  }

  // Regular GET: return latest sync status
  try {
    const latest = await db
      .select()
      .from(syncLog)
      .orderBy(desc(syncLog.syncedAt))
      .limit(1);

    if (latest.length === 0) {
      return Response.json({
        lastSync: null,
        message: "No sync has been performed yet.",
      });
    }

    const log = latest[0];
    return Response.json({
      lastSync: {
        status: log.status,
        source: log.source,
        nodesProcessed: log.nodesProcessed,
        error: log.error,
        syncedAt: log.syncedAt,
      },
    });
  } catch (err) {
    // Database might not be set up yet
    return Response.json({
      lastSync: null,
      message: "Database not configured yet.",
      error: err instanceof Error ? err.message : "Unknown error",
    });
  }
}
