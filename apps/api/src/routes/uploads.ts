import Elysia, { t } from "elysia";
import * as XLSX from "xlsx";
import { eq, max, min, sql } from "drizzle-orm";
import { db } from "../db/client";
import { predictionRuns, rawCustomers, rawPayments, rawUsage } from "../db/schema";
import { requireUser } from "../lib/auth-middleware";
import { verifyRunOwnership } from "../lib/run-guard";
import { enqueueArqJob } from "../services/job-producer";

const MODEL_DIR = process.env.MODEL_DIR ?? "/app/models";
const BATCH_SIZE = 500;

// Column renames for Users+User_profile sheet — matches FastAPI's _insert_raw mapping
const USER_RENAMES: Record<string, string> = {
  "status (SMS)":                      "status_sms",
  "user.credit + user.credit_premium": "credit_sms",
  "credit_email":                      "credit_email",
  "expire":                            "expire_sms",
  "expire_email":                      "expire_email",
  "status (Email)":                    "status_email",
  "join_date":                         "join_date",
  "last_access":                       "last_access",
  "last_send":                         "last_send",
};

// Usage sheet name → (channel, source)
const USAGE_SHEETS: Record<string, [string, string]> = {
  "SMS_usage (BC)":    ["sms", "bc"],
  "SMS_usage (API)":   ["sms", "api"],
  "SMS_usage (OTP)":   ["sms", "otp"],
  "Email_usage (BC)":  ["email", "bc"],
  "Email_usage (API)": ["email", "api"],
  "Email_usage (OTP)": ["email", "otp"],
};

type RawRow = Record<string, unknown>;

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

function safeInt(v: unknown): number | null {
  if (v == null) return null;
  const n = Number(v);
  return Number.isFinite(n) ? Math.trunc(n) : null;
}

function safeNumStr(v: unknown): string | null {
  if (v == null) return null;
  const n = Number(v);
  return Number.isFinite(n) ? String(n) : null;
}

function safeDate(v: unknown): string | null {
  if (v == null) return null;
  if (v instanceof Date) return Number.isFinite(v.getTime()) ? v.toISOString().split("T")[0] : null;
  const s = String(v).trim();
  if (!s) return null;
  const d = new Date(s);
  return Number.isFinite(d.getTime()) ? d.toISOString().split("T")[0] : null;
}

function safeTs(v: unknown): Date | null {
  if (v == null) return null;
  if (v instanceof Date) return Number.isFinite(v.getTime()) ? v : null;
  const s = String(v).trim();
  if (!s) return null;
  const d = new Date(s);
  return Number.isFinite(d.getTime()) ? d : null;
}

function renameRow(row: RawRow, map: Record<string, string>): RawRow {
  const out: RawRow = {};
  for (const [k, v] of Object.entries(row)) {
    const key = k.trim();
    // Drop Excel ghost columns (e.g. __EMPTY, __EMPTY_1, ... artifacts from merged cells)
    if (key.startsWith("__EMPTY")) continue;
    out[map[key] ?? key] = v;
  }
  return out;
}

async function setRunStatus(runId: string, status: string, error?: string) {
  await db
    .update(predictionRuns)
    .set({ status, errorMessage: error ?? null })
    .where(eq(predictionRuns.id, runId));
}

export const uploadsRoutes = new Elysia()
  .use(requireUser)
  .post(
    "/runs/:id/upload",
    async ({ params, body, userId, set }) => {
      const guard = await verifyRunOwnership(params.id, userId!);
      if (!guard.ok) { set.status = guard.status; return { message: guard.message }; }

      const [run] = await db
        .select({ status: predictionRuns.status })
        .from(predictionRuns)
        .where(eq(predictionRuns.id, params.id))
        .limit(1);

      if (!run || !["pending", "failed", "processing", "validating"].includes(run.status)) {
        set.status = 400;
        return { message: `Run status is '${run?.status}' — cannot re-upload` };
      }

      // ── Parse file ───────────────────────────────────────────────
      const buffer = Buffer.from(await body.file.arrayBuffer());
      let sheetMap: Record<string, RawRow[]>;
      try {
        const wb = XLSX.read(buffer, { type: "buffer", cellDates: true });
        if (body.file.name?.toLowerCase().endsWith(".csv")) {
          const firstSheet = Object.values(wb.Sheets)[0];
          sheetMap = {
            "Users+User_profile": XLSX.utils.sheet_to_json<RawRow>(firstSheet, { defval: null }),
          };
        } else {
          sheetMap = {};
          for (const name of wb.SheetNames) {
            sheetMap[name] = XLSX.utils.sheet_to_json<RawRow>(wb.Sheets[name], { defval: null });
          }
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        await setRunStatus(params.id, "failed", msg);
        set.status = 400;
        return { message: `Cannot parse file: ${msg}` };
      }

      // ── Validate required sheets ─────────────────────────────────
      const required = ["Users+User_profile", "Backend_payment"];
      const missing = required.filter(s => !(s in sheetMap));
      if (missing.length > 0) {
        const msg = `Missing sheets: ${missing.join(", ")}`;
        await setRunStatus(params.id, "failed", msg);
        set.status = 422;
        return { message: msg };
      }

      await setRunStatus(params.id, "validating");

      // ── Batch insert ─────────────────────────────────────────────
      try {
        const runId = params.id;

        await Promise.all([
          db.delete(rawUsage).where(eq(rawUsage.runId, runId)),
          db.delete(rawPayments).where(eq(rawPayments.runId, runId)),
          db.delete(rawCustomers).where(eq(rawCustomers.runId, runId)),
        ]);

        // Users → raw_customers
        const userRows = sheetMap["Users+User_profile"].map(r => renameRow(r, USER_RENAMES));
        for (const batch of chunk(userRows, BATCH_SIZE)) {
          await db.insert(rawCustomers).values(
            batch.map(r => ({
              runId,
              accId: safeInt(r.acc_id) ?? 0,
              statusSms:   r.status_sms   != null ? String(r.status_sms)  : null,
              creditSms:   safeNumStr(r.credit_sms),
              creditEmail: safeNumStr(r.credit_email),
              expireSms:   safeDate(r.expire_sms),
              expireEmail: safeDate(r.expire_email),
              statusEmail: r.status_email != null ? String(r.status_email) : null,
              joinDate:    safeDate(r.join_date),
              lastAccess:  safeTs(r.last_access),
              lastSend:    safeTs(r.last_send),
            }))
          );
        }

        // Payments → raw_payments (skip rows with no payment_date)
        const payRows = sheetMap["Backend_payment"]
          .filter(r => safeTs(r.payment_date) != null);
        for (const batch of chunk(payRows, BATCH_SIZE)) {
          await db.insert(rawPayments).values(
            batch.map(r => ({
              runId,
              accId:       safeInt(r.acc_id) ?? 0,
              paymentUid:  safeInt(r.uid),                // preserve original transaction ID
              paymentDate: safeTs(r.payment_date) as Date,
              amount:      safeNumStr(r.amount),
              creditAdd:   safeNumStr(r.credit_add),
              creditType:  r.credit_type != null ? String(r.credit_type) : null,
            }))
          );
        }

        // Usage → raw_usage (6 optional sheets)
        for (const [sheetName, [channel, source]] of Object.entries(USAGE_SHEETS)) {
          if (!(sheetName in sheetMap)) continue;
          for (const batch of chunk(sheetMap[sheetName], BATCH_SIZE)) {
            // onConflictDoNothing: the unique constraint (run_id,acc_id,year,month,channel,source)
          // silently deduplicates if the source Excel has duplicate rows.
          await db.insert(rawUsage).values(
              batch.map(r => ({
                runId,
                accId:   safeInt(r.acc_id) ?? 0,
                year:    safeInt(r.year),
                month:   safeInt(r.month),
                usage:   safeNumStr(r.usage),
                channel,
                source,
              }))
            ).onConflictDoNothing();
          }
        }

        // Record data date range from payment history (min/max payment_date)
        const [dateRange] = await db
          .select({
            start: sql<string>`MIN(${rawPayments.paymentDate})::date`,
            end:   sql<string>`MAX(${rawPayments.paymentDate})::date`,
          })
          .from(rawPayments)
          .where(eq(rawPayments.runId, runId));

        await db
          .update(predictionRuns)
          .set({
            dataStartDate: dateRange?.start ?? null,
            dataEndDate:   dateRange?.end   ?? null,
          })
          .where(eq(predictionRuns.id, runId));

        await setRunStatus(runId, "processing");
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        await setRunStatus(params.id, "failed", msg);
        set.status = 500;
        return { message: `DB insert error: ${msg}` };
      }

      try {
        await enqueueArqJob("run_prediction_pipeline", params.id, MODEL_DIR);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        await setRunStatus(params.id, "failed", `Queue error: ${msg}`);
        set.status = 500;
        return { message: `Failed to enqueue prediction job: ${msg}` };
      }

      return { run_id: params.id, status: "processing", message: "Prediction queued" };
    },
    {
      params: t.Object({ id: t.String() }),
      body: t.Object({ file: t.File() }),
    }
  );
