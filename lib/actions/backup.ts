"use server";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isAdmin } from "@/lib/admin";
import { revalidatePath } from "next/cache";
import { BACKUP_TABLES, type BackupTableName } from "@/lib/backup-tables";

export interface BackupSummary {
  id: string;
  name: string;
  source: "manual" | "import";
  tableCounts: Record<string, number>;
  sizeBytes: number;
  createdAt: string;
  createdByUsername: string | null;
}

export interface BackupExport {
  name: string;
  exportedAt: string;
  tables: Record<string, unknown[]>;
}

async function requireAdmin() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const { data: profile } = await supabase.from("profiles").select("username, role").eq("id", user.id).single();
  if (!isAdmin(profile)) return null;
  return user;
}

/** Best-effort per-table select — a table that doesn't exist yet (e.g.
 * shop_categories before that migration runs) just contributes an empty
 * array instead of failing the entire backup. */
async function selectAllRows(admin: ReturnType<typeof createAdminClient>, table: string): Promise<unknown[]> {
  try {
    const { data, error } = await admin.from(table).select("*");
    if (error || !data) return [];
    return data;
  } catch {
    return [];
  }
}

export async function createBackup(name?: string): Promise<{ success: boolean; error?: string; id?: string }> {
  const user = await requireAdmin();
  if (!user) return { success: false, error: "Kein Zugriff." };

  const admin = createAdminClient();
  const tables: Record<string, unknown[]> = {};
  const tableCounts: Record<string, number> = {};

  for (const table of BACKUP_TABLES) {
    const rows = await selectAllRows(admin, table);
    tables[table] = rows;
    tableCounts[table] = rows.length;
  }

  const json = JSON.stringify(tables);
  const sizeBytes = new TextEncoder().encode(json).length;
  const finalName = name?.trim() || `Backup ${new Date().toISOString().slice(0, 19).replace("T", " ")}`;

  const { data, error } = await admin
    .from("backups")
    .insert({
      name: finalName,
      created_by: user.id,
      source: "manual",
      tables,
      table_counts: tableCounts,
      size_bytes: sizeBytes,
    })
    .select("id")
    .single();

  if (error || !data) {
    return { success: false, error: "Backup konnte nicht erstellt werden — ist die Backup-Migration eingespielt?" };
  }

  revalidatePath("/admin");
  return { success: true, id: data.id };
}

export async function listBackups(): Promise<BackupSummary[]> {
  const user = await requireAdmin();
  if (!user) return [];

  const admin = createAdminClient();
  const { data } = await admin
    .from("backups")
    .select("id, name, source, table_counts, size_bytes, created_at, created_by")
    .order("created_at", { ascending: false })
    .limit(100);

  if (!data || data.length === 0) return [];

  const creatorIds = Array.from(new Set(data.map((b) => b.created_by).filter(Boolean)));
  const { data: profiles } =
    creatorIds.length > 0 ? await admin.from("profiles").select("id, username").in("id", creatorIds) : { data: [] };
  const usernames = new Map((profiles ?? []).map((p: { id: string; username: string }) => [p.id, p.username]));

  return data.map((b) => ({
    id: b.id,
    name: b.name,
    source: b.source as "manual" | "import",
    tableCounts: (b.table_counts as Record<string, number>) ?? {},
    sizeBytes: b.size_bytes,
    createdAt: b.created_at,
    createdByUsername: b.created_by ? usernames.get(b.created_by) ?? null : null,
  }));
}

export async function exportBackup(id: string): Promise<{ success: boolean; error?: string; data?: BackupExport }> {
  const user = await requireAdmin();
  if (!user) return { success: false, error: "Kein Zugriff." };

  const admin = createAdminClient();
  const { data: backup } = await admin.from("backups").select("name, tables, created_at").eq("id", id).single();
  if (!backup) return { success: false, error: "Backup nicht gefunden." };

  return {
    success: true,
    data: { name: backup.name, exportedAt: backup.created_at, tables: backup.tables as Record<string, unknown[]> },
  };
}

export async function importBackup(input: { name: string; tables: Record<string, unknown[]> }): Promise<{
  success: boolean;
  error?: string;
  id?: string;
}> {
  const user = await requireAdmin();
  if (!user) return { success: false, error: "Kein Zugriff." };

  if (!input.tables || typeof input.tables !== "object") {
    return { success: false, error: "Ungültiges Backup-Format." };
  }

  // Only keep keys this app actually knows how to restore — an imported
  // file with extra/foreign keys just has those silently dropped rather
  // than polluting the backups table with junk that restoreBackup()
  // wouldn't touch anyway.
  const tables: Record<string, unknown[]> = {};
  const tableCounts: Record<string, number> = {};
  for (const table of BACKUP_TABLES) {
    const rows = Array.isArray(input.tables[table]) ? input.tables[table] : [];
    tables[table] = rows;
    tableCounts[table] = rows.length;
  }

  const totalRows = Object.values(tableCounts).reduce((a, b) => a + b, 0);
  if (totalRows === 0) {
    return { success: false, error: "Die Datei enthält keine bekannten Tabellen." };
  }

  const admin = createAdminClient();
  const json = JSON.stringify(tables);
  const sizeBytes = new TextEncoder().encode(json).length;
  const finalName = input.name?.trim() || `Import ${new Date().toISOString().slice(0, 19).replace("T", " ")}`;

  const { data, error } = await admin
    .from("backups")
    .insert({
      name: finalName,
      created_by: user.id,
      source: "import",
      tables,
      table_counts: tableCounts,
      size_bytes: sizeBytes,
    })
    .select("id")
    .single();

  if (error || !data) return { success: false, error: "Import fehlgeschlagen." };

  revalidatePath("/admin");
  return { success: true, id: data.id };
}

export async function deleteBackup(id: string): Promise<{ success: boolean; error?: string }> {
  const user = await requireAdmin();
  if (!user) return { success: false, error: "Kein Zugriff." };

  const admin = createAdminClient();
  const { error } = await admin.from("backups").delete().eq("id", id);
  if (error) return { success: false, error: "Löschen fehlgeschlagen." };

  revalidatePath("/admin");
  return { success: true };
}

/**
 * THE destructive one. Deletes every row of every table this backup
 * snapshotted, then re-inserts exactly what was snapshotted — in
 * dependency order (parents before children on insert, the reverse on
 * delete) so a table with a foreign key to another in this same set never
 * sees a violation mid-restore. Each table that errors is reported but
 * does not abort the remaining tables — a partial failure should still
 * leave as much of the snapshot applied as possible rather than stopping
 * at the first problem and leaving things in a more confusing half state.
 */
export async function restoreBackup(id: string): Promise<{ success: boolean; error?: string; tableErrors?: string[] }> {
  const user = await requireAdmin();
  if (!user) return { success: false, error: "Kein Zugriff." };

  const admin = createAdminClient();
  const { data: backup } = await admin.from("backups").select("tables").eq("id", id).single();
  if (!backup) return { success: false, error: "Backup nicht gefunden." };

  const tables = backup.tables as Record<string, Array<Record<string, unknown>>>;
  const tableErrors: string[] = [];

  const deleteOrder = [...BACKUP_TABLES].reverse();
  for (const table of deleteOrder) {
    const rows = tables[table];
    if (!rows) continue;
    try {
      const { data: existing } = await admin.from(table).select("id");
      const ids = (existing ?? []).map((r: { id: string }) => r.id);
      if (ids.length > 0) {
        const { error } = await admin.from(table).delete().in("id", ids);
        if (error) tableErrors.push(`${table}: Löschen fehlgeschlagen — ${error.message}`);
      }
    } catch (e) {
      tableErrors.push(`${table}: ${e instanceof Error ? e.message : "unbekannter Fehler"}`);
    }
  }

  for (const table of BACKUP_TABLES as readonly BackupTableName[]) {
    const rows = tables[table];
    if (!rows || rows.length === 0) continue;
    try {
      const { error } = await admin.from(table).insert(rows);
      if (error) tableErrors.push(`${table}: Einfügen fehlgeschlagen — ${error.message}`);
    } catch (e) {
      tableErrors.push(`${table}: ${e instanceof Error ? e.message : "unbekannter Fehler"}`);
    }
  }

  revalidatePath("/admin");
  revalidatePath("/");
  revalidatePath("/shop");

  if (tableErrors.length > 0) {
    return { success: false, error: "Wiederherstellung teilweise fehlgeschlagen.", tableErrors };
  }
  return { success: true };
}
