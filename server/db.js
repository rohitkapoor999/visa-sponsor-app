import { createClient } from "@supabase/supabase-js";
import "dotenv/config";

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.warn("⚠️  SUPABASE_URL or SUPABASE_SERVICE_KEY not set — database features will fail.");
}

export const supabase = createClient(supabaseUrl, supabaseKey);

export async function enforceLimit(table, scopeColumn, scopeValue, max, hasPinned = true) {
  let query = supabase.from(table).select("id, created_at" + (hasPinned ? ", pinned" : "")).order("created_at", { ascending: true });
  if (scopeColumn) query = query.eq(scopeColumn, scopeValue);
  const { data: rows, error } = await query;
  if (error || !rows || rows.length <= max) return;

  const excess = rows.length - max;
  const deletable = hasPinned ? rows.filter((r) => !r.pinned) : rows;
  const toDelete = deletable.slice(0, excess).map((r) => r.id);
  if (toDelete.length === 0) return;

  await supabase.from(table).delete().in("id", toDelete);
}

export default supabase;
