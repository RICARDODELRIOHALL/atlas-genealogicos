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

const PIMENTEL_G20_UPDATE = "familysearch-pimentel-parents-of-lypr-ssp-2026-11-24";
const PIMENTEL_SOURCE_ID = "FamilySearch: vista horizontal de armando amaya romero (transcripción visual, 2026-11-24)";
const PIMENTEL_TREE_URL = "https://www.familysearch.org/es/tree/pedigree/landscape/PX7L-M8G";

/** Add the two FamilySearch profiles shown as parents of LYPR-SSP at G20. */
export function applyPimentelGeneration20(saved: Dataset): { dataset: Dataset; changed: boolean } {
  if ((saved.meta.appliedUpdates ?? []).includes(PIMENTEL_G20_UPDATE)) {
    return { dataset: saved, changed: false };
  }
  const savedChild = saved.persons.find((person) => person.fsId === "LYPR-SSP");
  if (!savedChild) return { dataset: saved, changed: false };

  const dataset = structuredClone(saved) as Dataset;
  const child = dataset.persons.find((person) => person.fsId === "LYPR-SSP")!;
  const makeParent = (fsId: string, name: string, sex: "M" | "F", birth: string, death: string) => {
    const found = dataset.persons.find((person) => person.fsId === fsId);
    if (found) return found;
    const maxId = Math.max(0, ...dataset.persons.map((person) => Number(person.id.slice(1)) || 0));
    const preferredId = fsId === "P35C-GVN" ? "P2437" : "P2438";
    const id = dataset.persons.some((person) => person.id === preferredId) ? `P${maxId + 1}` : preferredId;
    const person = {
      id, fsId, name, altNames: [], sex, birth, death,
      marriage: "", baptism: "", burial: "",
      notes: ["Perfil y vínculo familiar transcritos de la vista horizontal de FamilySearch del árbol de Armando Amaya Romero."],
      sources: [PIMENTEL_SOURCE_ID], verification: "familysearch" as const,
      originals: [{ source: PIMENTEL_SOURCE_ID, record: {
        familySearchId: fsId,
        familySearchPerson: `https://www.familysearch.org/es/tree/person/${fsId}`,
        name, birth, death,
        relationship: sex === "M" ? "Padre de II Conde Rodrigo Alfonso de Pimentel" : "Madre de II Conde Rodrigo Alfonso de Pimentel",
        familySearchTree: PIMENTEL_TREE_URL,
      } }],
    };
    dataset.persons.push(person);
    return person;
  };

  const father = makeParent("P35C-GVN", "Conde João Afonso Pimentel", "M", "1350", "1419");
  const mother = makeParent("LKMQ-LWD", "Joanna Telles de Menezes", "F", "1355", "1420");
  if (!dataset.links.some((link) => link.child === child.id && link.parent === father.id)) {
    dataset.links.push({ child: child.id, parent: father.id, role: "padre", sources: [PIMENTEL_SOURCE_ID] });
  }
  if (!dataset.links.some((link) => link.child === child.id && link.parent === mother.id)) {
    dataset.links.push({ child: child.id, parent: mother.id, role: "madre", sources: [PIMENTEL_SOURCE_ID] });
  }

  dataset.unions ??= [];
  const hasUnion = dataset.unions.some((union) =>
    (union.a === father.id && union.b === mother.id) || (union.a === mother.id && union.b === father.id)
  );
  if (!hasUnion) {
    dataset.unions.push({
      id: "FS-P35C-GVN-LKMQ-LWD", a: father.id, b: mother.id,
      children: [child.id], marriage: "1377", marriagePlace: "Castilla, España",
      sources: [PIMENTEL_SOURCE_ID],
      originalRecord: { source: PIMENTEL_SOURCE_ID, spouses: ["P35C-GVN", "LKMQ-LWD"], children: ["LYPR-SSP"], dateText: "1377", placeText: "Castilla, España" },
    });
  }

  dataset.meta.sources ??= [];
  if (!dataset.meta.sources.some((source) => source.id === PIMENTEL_SOURCE_ID)) {
    dataset.meta.sources.push({
      id: PIMENTEL_SOURCE_ID, file: PIMENTEL_TREE_URL,
      kind: "Vista horizontal del árbol familiar de FamilySearch",
      note: "Muestra a Conde João Afonso Pimentel (1350–1419) y Joanna Telles de Menezes (1355–1420) como padres de II Conde Rodrigo Alfonso de Pimentel (LYPR-SSP); la unión aparece fechada en 1377 en Castilla, España.",
    });
  }
  dataset.meta.appliedUpdates = [...(dataset.meta.appliedUpdates ?? []), PIMENTEL_G20_UPDATE];
  return { dataset, changed: true };
}

const ARM_G22_UPDATE = "familysearch-ancestors-through-generation-22-2026-11-24";
const ARM_G22_SOURCE_ID = "FamilySearch: vista horizontal del árbol de Armando Amaya Romero G21-G22 (transcripción visual, 2026-11-24)";

/** Add the visible FamilySearch ancestors and couples through the requested G22 view. */
export function applyAncestorsThroughGeneration22(saved: Dataset): { dataset: Dataset; changed: boolean } {
  if ((saved.meta.appliedUpdates ?? []).includes(ARM_G22_UPDATE)) return { dataset: saved, changed: false };
  const dataset = structuredClone(saved) as Dataset;
  const treeUrl = "https://www.familysearch.org/es/tree/pedigree/landscape/PX7L-M8G";
  const profiles: Array<{ fsId: string; name: string; sex: "M" | "F"; birth: string; death: string }> = [
    { fsId: "P35C-54S", name: "Rodrigo Afonso Pimentel, O Braganção", sex: "M", birth: "1310", death: "" },
    { fsId: "KC3R-727", name: "Lourença Vasques da Fonseca", sex: "F", birth: "1328", death: "1370" },
    { fsId: "L15Q-6ZJ", name: "Martim Afonso Telo de Menezes", sex: "M", birth: "1310", death: "1356" },
    { fsId: "GMTQ-LYG", name: "Aldonça Annes de Vasconcellos", sex: "F", birth: "1310", death: "1370" },
    { fsId: "GSM1-S13", name: "Fadrique de Castilla Guzmán, infante de Castilla y Maestre de la Orden de Santiago", sex: "M", birth: "1333", death: "1358" },
    { fsId: "LT84-KP1", name: "Yonati «Paloma» bat Gedaliah ibn Yahya", sex: "F", birth: "1335", death: "1429" },
    { fsId: "GNWP-195", name: "Pedro González de Mendoza Orozco, I Señor de Hita y de Buitrago", sex: "M", birth: "1335", death: "1385" },
    { fsId: "GT2B-TGS", name: "Aldonza Fernández de Ayala", sex: "F", birth: "1337", death: "1404" },
    { fsId: "LT8C-WDN", name: "Gedalia ben Shlomo ibn Yaḥyā", sex: "M", birth: "1295", death: "1385" },
    { fsId: "GZPW-4W7", name: "Tamar Bat Ibn Yahya Maria Benveniste", sex: "F", birth: "1315", death: "1385" },
    { fsId: "G6Z3-WTF", name: "Don Pedro Núñez de Guzmán y Girón", sex: "M", birth: "1280", death: "1338" },
    { fsId: "G2B7-M3F", name: "Doña Juana Ponce de León y Meneses", sex: "F", birth: "1276", death: "" },
    { fsId: "L15M-MKC", name: "Shlomo Ha-Zaken ben Yosef ben Yahya", sex: "M", birth: "1245", death: "1299" },
    { fsId: "GZPW-GDT", name: "Reyna Abravanel", sex: "F", birth: "1260", death: "" },
  ];
  const byFsId = new Map(dataset.persons.filter((person) => person.fsId).map((person) => [person.fsId, person]));
  let nextId = Math.max(0, ...dataset.persons.map((person) => Number(person.id.slice(1)) || 0)) + 1;
  let changed = false;
  for (const profile of profiles) {
    if (byFsId.has(profile.fsId)) continue;
    const person = {
      id: `P${nextId++}`, ...profile, altNames: [], marriage: "", baptism: "", burial: "",
      notes: ["Perfil y relaciones transcritos de la vista horizontal del árbol de Armando Amaya Romero en FamilySearch."],
      sources: [ARM_G22_SOURCE_ID], verification: "familysearch" as const,
      originals: [{ source: ARM_G22_SOURCE_ID, record: {
        familySearchId: profile.fsId,
        familySearchPerson: `https://www.familysearch.org/es/tree/person/${profile.fsId}`,
        name: profile.name, birth: profile.birth, death: profile.death, familySearchTree: treeUrl,
      } }],
    };
    dataset.persons.push(person);
    byFsId.set(profile.fsId, person);
    changed = true;
  }

  const parentPairs: Array<[string, string, string]> = [
    ["P35C-GVN", "P35C-54S", "padre"], ["P35C-GVN", "KC3R-727", "madre"],
    ["LKMQ-LWD", "L15Q-6ZJ", "padre"], ["LKMQ-LWD", "GMTQ-LYG", "madre"],
    ["L8BR-9FP", "GSM1-S13", "padre"], ["L8BR-9FP", "LT84-KP1", "madre"],
    ["LTT1-ZXM", "GNWP-195", "padre"], ["LTT1-ZXM", "GT2B-TGS", "madre"],
    ["GSM1-S13", "M6FB-J43", "padre"], ["GSM1-S13", "GG1T-CBH", "madre"],
    ["LT84-KP1", "LT8C-WDN", "padre"], ["LT84-KP1", "GZPW-4W7", "madre"],
    ["KC3R-727", "G6Z3-WTF", "padre"], ["KC3R-727", "G2B7-M3F", "madre"],
    ["LT8C-WDN", "L15M-MKC", "padre"], ["LT8C-WDN", "GZPW-GDT", "madre"],
  ];
  for (const [childFsId, parentFsId, role] of parentPairs) {
    const child = byFsId.get(childFsId);
    const parent = byFsId.get(parentFsId);
    if (!child || !parent || dataset.links.some((link) => link.child === child.id && link.parent === parent.id)) continue;
    dataset.links.push({ child: child.id, parent: parent.id, role: role as "padre" | "madre", sources: [ARM_G22_SOURCE_ID] });
    changed = true;
  }

  const marriages = [
    { a: "GNWP-195", b: "GT2B-TGS", marriage: "1360", place: "" },
    { a: "LT8C-WDN", b: "GZPW-4W7", marriage: "1330", place: "Portugal" },
    { a: "G6Z3-WTF", b: "G2B7-M3F", marriage: "1300", place: "" },
    { a: "L15M-MKC", b: "GZPW-GDT", marriage: "antes de 1278", place: "Lisboa, Portugal" },
  ];
  dataset.unions ??= [];
  for (const couple of marriages) {
    const a = byFsId.get(couple.a);
    const b = byFsId.get(couple.b);
    if (!a || !b || dataset.unions.some((union) => (union.a === a.id && union.b === b.id) || (union.a === b.id && union.b === a.id))) continue;
    dataset.unions.push({
      id: `FS-${couple.a}-${couple.b}`, a: a.id, b: b.id, children: [], marriage: couple.marriage,
      marriagePlace: couple.place, sources: [ARM_G22_SOURCE_ID],
      originalRecord: { source: ARM_G22_SOURCE_ID, spouses: [couple.a, couple.b], dateText: couple.marriage, placeText: couple.place },
    });
    changed = true;
  }

  dataset.meta.sources ??= [];
  if (!dataset.meta.sources.some((source) => source.id === ARM_G22_SOURCE_ID)) {
    dataset.meta.sources.push({
      id: ARM_G22_SOURCE_ID, file: treeUrl, kind: "Vista horizontal del árbol familiar de FamilySearch",
      note: "Vista del árbol de Armando Amaya Romero; perfiles visibles en generaciones G21 y G22 y relaciones familiares mostradas en esa rama.",
    });
    changed = true;
  }
  if (!changed) return { dataset: saved, changed: false };
  dataset.meta.appliedUpdates = [...(dataset.meta.appliedUpdates ?? []), ARM_G22_UPDATE];
  return { dataset, changed: true };
}

