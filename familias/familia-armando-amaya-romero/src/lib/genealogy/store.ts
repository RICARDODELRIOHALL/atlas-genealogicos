import type { Dataset } from "./types";
import { APP_CONFIG, databaseNameFor } from "@/lib/app-config";

// A fresh database name keeps this independent copy empty even if the Lovable
// template was previously opened in the same browser profile.
export const DB_NAME = databaseNameFor(APP_CONFIG.id);
const STORE = "kv";
const KEY = "dataset";

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function loadDataset(): Promise<Dataset | null> {
  const db = await open();
  return new Promise((resolve, reject) => {
    const request = db.transaction(STORE).objectStore(STORE).get(KEY);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => { resolve((request.result as Dataset) ?? null); db.close(); };
  });
}

export async function saveDataset(ds: Dataset): Promise<void> {
  const db = await open();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).put({ ...ds, meta: { ...ds.meta, savedAt: new Date().toISOString() } }, KEY);
    tx.oncomplete = () => { db.close(); resolve(); };
    tx.onerror = () => { db.close(); reject(tx.error); };
  });
}

export async function seedDataset(): Promise<Dataset> {
  const mod = await import("@/data/atlas.json");
  return structuredClone((mod.default ?? mod) as unknown as Dataset);
}

/** Merge the published FamilySearch branch into a browser's previously saved copy.
 * Keep existing local edits and add only the branch records that are missing.
 */
export function mergePublishedBranch(saved: Dataset, seed: Dataset): { dataset: Dataset; changed: boolean } {
  const audit = (seed.meta as any).branchIntegrationAudit;
  if (!audit) return { dataset: saved, changed: false };

  const dataset = structuredClone(saved) as Dataset;
  const currentUnions = dataset.unions ?? [];
  const seedUnions = seed.unions ?? [];
  dataset.unions = currentUnions;
  const currentByFsId = new Map(dataset.persons.map((person) => [person.fsId, person]));
  const currentById = new Map(dataset.persons.map((person) => [person.id, person]));
  const seedByFsId = new Map(seed.persons.map((person) => [person.fsId, person]));
  const fsIds = [
    ...(audit.addedFamilySearchProfiles ?? []).map((profile: { fsId: string }) => profile.fsId),
    ...(audit.restoredSourceProfiles ?? []),
  ];
  let changed = false;

  for (const fsId of fsIds) {
    if (currentByFsId.has(fsId)) continue;
    const person = seedByFsId.get(fsId);
    if (!person || currentById.has(person.id)) continue;
    const copy = structuredClone(person);
    dataset.persons.push(copy);
    currentByFsId.set(copy.fsId, copy);
    currentById.set(copy.id, copy);
    changed = true;
  }

  for (const link of audit.addedParentLinks ?? []) {
    const child = currentByFsId.get(link.child);
    const parent = currentByFsId.get(link.parent);
    if (!child || !parent || dataset.links.some((item) => item.child === child.id && item.parent === parent.id)) continue;
    const seedChild = seedByFsId.get(link.child);
    const seedParent = seedByFsId.get(link.parent);
    const sourceLink = seed.links.find((item) => item.child === seedChild?.id && item.parent === seedParent?.id);
    if (sourceLink) { dataset.links.push(structuredClone(sourceLink)); changed = true; }
  }

  for (const couple of audit.addedCouples ?? []) {
    const a = currentByFsId.get(couple.a);
    const b = currentByFsId.get(couple.b);
    if (!a || !b || currentUnions.some((item) => (item.a === a.id && item.b === b.id) || (item.a === b.id && item.b === a.id))) continue;
    const seedA = seedByFsId.get(couple.a);
    const seedB = seedByFsId.get(couple.b);
    const sourceUnion = seedUnions.find((item) => (item.a === seedA?.id && item.b === seedB?.id) || (item.a === seedB?.id && item.b === seedA?.id));
    if (sourceUnion) { currentUnions.push(structuredClone(sourceUnion)); changed = true; }
  }

  if (!changed) return { dataset: saved, changed: false };
  const sourceIds = new Set((dataset.meta.sources ?? []).map((source) => source.id));
  for (const source of seed.meta.sources ?? []) if (!sourceIds.has(source.id)) dataset.meta.sources.push(structuredClone(source));
  (dataset.meta as any).generationAudit = structuredClone((seed.meta as any).generationAudit);
  (dataset.meta as any).branchIntegrationAudit = structuredClone(audit);
  return { dataset, changed: true };
}
