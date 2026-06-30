import { JSONFilePreset } from "lowdb/node";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dbPath = path.join(__dirname, "data", "db.json");

const defaultData = { cvs: [], employer_lists: [], search_results: [] };

export const db = await JSONFilePreset(dbPath, defaultData);

// Keep only maxCount rows in a collection, deleting oldest unpinned first.
// `predicate` filters which rows belong to the relevant scope (e.g. same country).
export async function enforceLimit(collectionName, predicate, maxCount, hasPinned = true) {
  const all = db.data[collectionName];
  const scoped = all.filter(predicate).sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
  if (scoped.length <= maxCount) return;

  const excess = scoped.length - maxCount;
  const deletable = hasPinned ? scoped.filter((r) => !r.pinned) : scoped;
  const idsToDelete = new Set(deletable.slice(0, excess).map((r) => r.id));

  db.data[collectionName] = all.filter((r) => !idsToDelete.has(r.id));
  await db.write();
}

export default db;
