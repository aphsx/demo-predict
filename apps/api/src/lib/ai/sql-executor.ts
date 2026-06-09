import { sqlClient } from "../../db/client";

export type QueryRow = Record<string, unknown>;

export type QueryResultPreview = {
  columns: string[];
  rows: QueryRow[];
  row_count: number;
};

const QUERY_TIMEOUT_MS = 5_000;

function serializeValue(value: unknown): unknown {
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "bigint") return Number(value);
  return value;
}

function serializeRow(row: Record<string, unknown>): QueryRow {
  return Object.fromEntries(
    Object.entries(row).map(([key, value]) => [key, serializeValue(value)])
  );
}

export async function executeReadOnlySql(sql: string): Promise<QueryResultPreview> {
  const rows = await sqlClient.begin(async (tx) => {
    await tx`SET TRANSACTION READ ONLY`;
    await tx.unsafe(`SET LOCAL statement_timeout = '${QUERY_TIMEOUT_MS}ms'`);
    return tx.unsafe(sql);
  });

  const serializedRows = rows.map((row) => serializeRow(row as Record<string, unknown>));
  return {
    columns: Object.keys(serializedRows[0] ?? {}),
    rows: serializedRows,
    row_count: serializedRows.length,
  };
}
