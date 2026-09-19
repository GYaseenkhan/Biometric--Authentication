import { lt, or, isNotNull } from "drizzle-orm";
import { db, passwordResetTokensTable, parentConsentTokensTable, securityLogsTable, paymentsTable } from "@workspace/db";
import { logger } from "./logger";

// Used/expired tokens have no further purpose once the audit log has
// captured the event, so purge them unconditionally — this isn't a policy
// call. Audit logs, payments, and uploads are NOT purged unconditionally —
// see below.
const CLEANUP_INTERVAL_MS = 60 * 60 * 1000; // hourly

export async function purgeExpiredResetTokens(): Promise<number> {
  const deleted = await db
    .delete(passwordResetTokensTable)
    .where(or(isNotNull(passwordResetTokensTable.usedAt), lt(passwordResetTokensTable.expiresAt, new Date())))
    .returning({ id: passwordResetTokensTable.id });
  return deleted.length;
}

// A used/expired parent-consent token is a spent bearer credential, not
// forensic evidence — the event is already captured in security_logs.
export async function purgeExpiredParentConsentTokens(): Promise<number> {
  const deleted = await db
    .delete(parentConsentTokensTable)
    .where(or(isNotNull(parentConsentTokensTable.usedAt), lt(parentConsentTokensTable.expiresAt, new Date())))
    .returning({ id: parentConsentTokensTable.id });
  return deleted.length;
}

/**
 * Security logs and payments have NO default retention ceiling — disposal
 * duration for these two is a policy call, not a number to invent. Gated
 * behind env vars that default to unset (no ceiling, today's behavior
 * unchanged); setting SECURITY_LOGS_RETENTION_DAYS / PAYMENTS_RETENTION_DAYS
 * turns the ceiling on without further code changes.
 */
export interface RetentionPolicy {
  securityLogsMaxAgeDays: number | null;
  paymentsMaxAgeDays: number | null;
}

function parsePositiveDays(raw: string | undefined): number | null {
  if (!raw) return null;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : null;
}

export function readRetentionPolicyFromEnv(): RetentionPolicy {
  return {
    securityLogsMaxAgeDays: parsePositiveDays(process.env["SECURITY_LOGS_RETENTION_DAYS"]),
    paymentsMaxAgeDays: parsePositiveDays(process.env["PAYMENTS_RETENTION_DAYS"]),
  };
}

function cutoffFor(maxAgeDays: number): Date {
  return new Date(Date.now() - maxAgeDays * 24 * 60 * 60 * 1000);
}

// Runs through the existing deletion-audit trigger like any other
// deletion — a policy-driven purge doesn't bypass the tamper-evidence mechanism.
export async function purgeAgedSecurityLogs(maxAgeDays: number): Promise<number> {
  const deleted = await db
    .delete(securityLogsTable)
    .where(lt(securityLogsTable.timestamp, cutoffFor(maxAgeDays)))
    .returning({ id: securityLogsTable.id });
  return deleted.length;
}

export async function purgeAgedPayments(maxAgeDays: number): Promise<number> {
  const deleted = await db
    .delete(paymentsTable)
    .where(lt(paymentsTable.createdAt, cutoffFor(maxAgeDays)))
    .returning({ id: paymentsTable.id });
  return deleted.length;
}

async function runRetentionPass(): Promise<void> {
  const resetCount = await purgeExpiredResetTokens();
  if (resetCount > 0) logger.info({ count: resetCount }, "Retention: purged expired/used password reset tokens");

  const parentConsentCount = await purgeExpiredParentConsentTokens();
  if (parentConsentCount > 0) logger.info({ count: parentConsentCount }, "Retention: purged expired/used parent consent tokens");

  const policy = readRetentionPolicyFromEnv();
  if (policy.securityLogsMaxAgeDays !== null) {
    const count = await purgeAgedSecurityLogs(policy.securityLogsMaxAgeDays);
    if (count > 0) logger.info({ count, maxAgeDays: policy.securityLogsMaxAgeDays }, "Retention: purged aged security logs (SECURITY_LOGS_RETENTION_DAYS configured)");
  }
  if (policy.paymentsMaxAgeDays !== null) {
    const count = await purgeAgedPayments(policy.paymentsMaxAgeDays);
    if (count > 0) logger.info({ count, maxAgeDays: policy.paymentsMaxAgeDays }, "Retention: purged aged payments (PAYMENTS_RETENTION_DAYS configured)");
  }
}

// Runs once immediately, then hourly. unref() so it never blocks shutdown.
export function startRetentionJob(): void {
  const policy = readRetentionPolicyFromEnv();
  logger.info(
    { securityLogsMaxAgeDays: policy.securityLogsMaxAgeDays, paymentsMaxAgeDays: policy.paymentsMaxAgeDays },
    "Retention: job starting — null means no ceiling configured (Team 2 policy pending), not a bug",
  );

  runRetentionPass().catch((err) => logger.warn({ err }, "Retention: initial purge pass failed"));

  setInterval(() => {
    runRetentionPass().catch((err) => logger.warn({ err }, "Retention: scheduled purge pass failed"));
  }, CLEANUP_INTERVAL_MS).unref();
}
