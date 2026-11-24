import type { Dataset } from "./types";
import { APP_CONFIG, databaseNameFor } from "@/lib/app-config";

// A fresh database name keeps this independent copy empty even if the Lovable
// template was previously opened in the same browser profile.
export const DB_NAME = databaseNameFor(APP_CONFIG.id);
const STORE = "kv";
const KEY = "dataset";

const ARM_START_PARENTS_UPDATE = "confirmed-parents-kk3d-6vr-2026-11-24";
const ARM_START_SOURCE_ID = "FamilySearch:X4Q6-SBSR";
const ARM_START_RECORD_URL = "https://www.familysearch.org/ark:/61903/1:1:X4Q6-SBSR?lang=es";

/** Add the user-confirmed parents of Ma. Virginia Alvarez to old saved copies. */
export function applyConfirmedVirginiaParents(saved: Dataset): { dataset: Dataset; changed: boolean } {
  if ((saved.meta.appliedUpdates ?? []).includes(ARM_START_PARENTS_UPDATE)) {
    return { dataset: saved, changed: false };
  }

  const dataset = structuredClone(saved) as Dataset;
  const virginia = dataset.persons.find((person) => person.fsId === "KK3D-6VR");
  if (!virginia) return { dataset: saved, changed: false };

  const knownPerson = (name: string) => dataset.persons.find((person) =>
    person.name.trim().toLocaleLowerCase("es") === name.toLocaleLowerCase("es")
  );
  const unusedId = (candidate: string) => dataset.persons.some((person) => person.id === candidate)
    ? `P${Math.max(0, ...dataset.persons.map((person) => Number(person.id.slice(1)) || 0)) + 1}`
    : candidate;
  const makeParent = (name: string, sex: "M" | "F", candidateId: string) => {
    const existing = knownPerson(name);
    if (existing) return existing;
    const person = {
      id: unusedId(candidateId), fsId: "", name, altNames: [], sex,
      birth: "", death: "", marriage: "", baptism: "", burial: "",
      notes: ["Progenitor de Ma. Virginia Alvarez; filiación confirmada por el usuario a partir de la partida de información matrimonial de 1894."],
      sources: [ARM_START_SOURCE_ID],
      originals: [{ source: ARM_START_SOURCE_ID, record: {
        title: "San Sebastián Mártir. Informaciones matrimoniales 1893–1900",
        date: "17 de mayo de 1894", place: "Venado, San Sebastián Mártir, San Luis Potosí",
        indexedName: name, relation: sex === "M" ? "Padre de Virginia Alvares" : "Madre de Virginia Alvares",
        familySearchRecord: ARM_START_RECORD_URL,
      } }],
    };
    dataset.persons.push(person);
    return person;
  };

  const father = makeParent("Jesus Alvares", "M", "P2435");
  const mother = makeParent("Ana Vega", "F", "P2436");
  const addLink = (parent: typeof father, role: "padre" | "madre") => {
    if (!dataset.links.some((link) => link.child === virginia.id && link.parent === parent.id)) {
      dataset.links.push({ child: virginia.id, parent: parent.id, role, sources: [ARM_START_SOURCE_ID] });
    }
  };
  addLink(father, "padre");
  addLink(mother, "madre");

  dataset.meta.sources ??= [];
  if (!dataset.meta.sources.some((source) => source.id === ARM_START_SOURCE_ID)) {
    dataset.meta.sources.push({
      id: ARM_START_SOURCE_ID, file: ARM_START_RECORD_URL,
      kind: "Partida de información matrimonial indexada en FamilySearch",
      note: "Entrada del 17 de mayo de 1894 para Virginia Alvares y Arturo A. Amaya; identifica a Jesus Alvares y Ana Vega como sus padres. La filiación se incorpora por confirmación del usuario.",
    });
  }
  dataset.meta.appliedUpdates = [...(dataset.meta.appliedUpdates ?? []), ARM_START_PARENTS_UPDATE];
  return { dataset, changed: true };
}

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

