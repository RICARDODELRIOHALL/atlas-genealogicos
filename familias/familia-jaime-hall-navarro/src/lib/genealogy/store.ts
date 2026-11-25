import type { Dataset } from "./types";
import { APP_CONFIG, databaseNameFor } from "@/lib/app-config";
import { PF1L_ROUTE_LINKS, PF1L_ROUTE_PERSONS, PF1L_ROUTE_UPDATE_ID } from "@/data/jaime-pf1l-route";
import { LHWP_BRANCH_LINKS, LHWP_BRANCH_PERSONS, LHWP_BRANCH_UNIONS, LHWP_BRANCH_UPDATE_ID } from "@/data/familysearch-lhwp-6yx-branch";

// A fresh database name keeps this independent copy empty even if the Lovable
// template was previously opened in the same browser profile.
export const DB_NAME = databaseNameFor(APP_CONFIG.id);
const STORE = "kv";
const KEY = "dataset";
export const PUBLISHED_UPDATE_ID = PF1L_ROUTE_UPDATE_ID;
export const HALL_BRANCH_UPDATE_ID = "jaime-hall-huidobro-shared-ancestors-v1";
export const HALL_ROUTES_UPDATE_ID = "jaime-hall-royal-routes-v1";
export const FAMILYSEARCH_IDS_UPDATE_ID = "jaime-familysearch-ids-v1";
export const ALICE_BOOTH_PARENT_PAIR_UPDATE_ID = "jaime-hall-alice-booth-parent-pair-v1";
export { LHWP_BRANCH_UPDATE_ID };

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
  return applyPublishedUpdates(structuredClone((mod.default ?? mod) as unknown as Dataset));
}

/** Merge this release's additive route update into older browser databases without replacing local edits. */
export async function applyPublishedUpdates(current: Dataset): Promise<Dataset> {
  const existingUpdates = current.meta.appliedUpdates ?? [];
  if (existingUpdates.includes(HALL_BRANCH_UPDATE_ID) && existingUpdates.includes(HALL_ROUTES_UPDATE_ID) && existingUpdates.includes(PUBLISHED_UPDATE_ID) && existingUpdates.includes(FAMILYSEARCH_IDS_UPDATE_ID) && existingUpdates.includes(ALICE_BOOTH_PARENT_PAIR_UPDATE_ID) && existingUpdates.includes(LHWP_BRANCH_UPDATE_ID)) return current;
  const next = structuredClone(current);
  const applied = new Set(next.meta.appliedUpdates ?? []);
  if (!applied.has(FAMILYSEARCH_IDS_UPDATE_ID)) {
    const targetModule = await import("@/data/atlas.json");
    const target = (targetModule.default ?? targetModule) as unknown as Dataset;
    const targetById = new Map(target.persons.map((person) => [person.id, person]));
    for (const person of next.persons) {
      const targetPerson = targetById.get(person.id);
      if (!person.fsId && targetPerson?.fsId) person.fsId = targetPerson.fsId;
    }
    applied.add(FAMILYSEARCH_IDS_UPDATE_ID);
  }
  if (!applied.has(HALL_BRANCH_UPDATE_ID) && next.meta.root === "person-root") {
    // Migrate only the father's ancestor component in older IndexedDB copies.
    // Maternal ancestry, root, sibling cards, and maternal route additions stay intact.
    const targetModule = await import("@/data/atlas.json");
    const target = (targetModule.default ?? targetModule) as unknown as Dataset;
    const targetParents = new Map<string, string[]>();
    for (const link of target.links) (targetParents.get(link.child) ?? targetParents.set(link.child, []).get(link.child)!).push(link.parent);
    const targetBranch = new Set<string>();
    const targetStack = ["ancestor-0003"];
    while (targetStack.length) {
      const id = targetStack.pop()!;
      if (targetBranch.has(id)) continue;
      targetBranch.add(id);
      targetStack.push(...(targetParents.get(id) ?? []));
    }
    const currentParents = new Map<string, string[]>();
    for (const link of next.links) (currentParents.get(link.child) ?? currentParents.set(link.child, []).get(link.child)!).push(link.parent);
    const oldBranch = new Set<string>();
    const oldStack = ["ancestor-0003"];
    while (oldStack.length) {
      const id = oldStack.pop()!;
      if (oldBranch.has(id)) continue;
      oldBranch.add(id);
      oldStack.push(...(currentParents.get(id) ?? []));
    }
    const replacementIds = new Set([...targetBranch].filter((id) => id !== "person-root"));
    const keepLinks = next.links.filter((link) => !oldBranch.has(link.child) && !oldBranch.has(link.parent) || link.child === "person-root" && link.parent === "ancestor-0003");
    const keepUnions = (next.unions ?? []).filter((union) => !oldBranch.has(union.a) || !oldBranch.has(union.b));
    next.persons = next.persons.filter((person) => !oldBranch.has(person.id));
    const currentIds = new Set(next.persons.map((person) => person.id));
    for (const person of target.persons) if (replacementIds.has(person.id) && !currentIds.has(person.id)) next.persons.push(structuredClone(person));
    const targetLinks = target.links.filter((link) => replacementIds.has(link.child) && replacementIds.has(link.parent));
    const linkKeys = new Set(keepLinks.map((link) => `${link.child}>${link.parent}`));
    next.links = [...keepLinks, ...targetLinks.filter((link) => { const key = `${link.child}>${link.parent}`; if (linkKeys.has(key)) return false; linkKeys.add(key); return true; })];
    const targetUnions = (target.unions ?? []).filter((union) => replacementIds.has(union.a) && replacementIds.has(union.b));
    next.unions = [...keepUnions, ...targetUnions];
    (next.meta as typeof next.meta & { generationAudit?: Record<string, unknown> }).generationAudit = structuredClone((target.meta as typeof target.meta & { generationAudit?: Record<string, unknown> }).generationAudit!);
    applied.add(HALL_BRANCH_UPDATE_ID);
    applied.add(HALL_ROUTES_UPDATE_ID);
  }
  if (!applied.has(HALL_BRANCH_UPDATE_ID) && next.meta.root !== "person-root") applied.add(HALL_BRANCH_UPDATE_ID);
  if (!applied.has(HALL_ROUTES_UPDATE_ID) && next.meta.root !== "person-root") applied.add(HALL_ROUTES_UPDATE_ID);

  if (!applied.has(HALL_ROUTES_UPDATE_ID) && next.meta.root === "person-root") {
    const targetModule = await import("@/data/atlas.json");
    const target = (targetModule.default ?? targetModule) as unknown as Dataset;
    const routePersons = target.persons.filter((person) => person.id.startsWith("hallroute-"));
    const personIds = new Set(next.persons.map((person) => person.id));
    for (const person of routePersons) if (!personIds.has(person.id)) {
      next.persons.push(structuredClone(person));
      personIds.add(person.id);
    }
    const targetLinks = target.links.filter((link) => link.child.startsWith("hallroute-") || link.parent.startsWith("hallroute-"));
    const linkKeys = new Set(next.links.map((link) => `${link.child}>${link.parent}`));
    for (const link of targetLinks) {
      const key = `${link.child}>${link.parent}`;
      if (linkKeys.has(key)) continue;
      next.links.push(structuredClone(link));
      linkKeys.add(key);
    }
    const routeUnions = (target.unions ?? []).filter((union) => String(union["id"]).startsWith("hallroute-union-"));
    next.unions ??= [];
    for (const union of routeUnions) {
      const existing = next.unions.find((item) => [item.a, item.b].sort().join("+") === [union.a, union.b].sort().join("+"));
      if (!existing) { next.unions.push(structuredClone(union)); continue; }
    }
    (next.meta as typeof next.meta & { generationAudit?: Record<string, unknown> }).generationAudit = structuredClone((target.meta as typeof target.meta & { generationAudit?: Record<string, unknown> }).generationAudit!);
    applied.add(HALL_ROUTES_UPDATE_ID);
  }

  if (!applied.has(ALICE_BOOTH_PARENT_PAIR_UPDATE_ID) && next.meta.root === "person-root") {
    const targetModule = await import("@/data/atlas.json");
    const target = (targetModule.default ?? targetModule) as unknown as Dataset;
    const alice = target.persons.find((person) => person.fsId === "G88R-D2R");
    const father = target.persons.find((person) => person.fsId === "LRSD-ML7");
    const mother = target.persons.find((person) => person.fsId === "LDBB-8WN");
    if (alice && father && mother) {
      let addedLinks = 0;
      const parents = target.links.filter((link) => link.child === alice.id && [father.id, mother.id].includes(link.parent));
      for (const link of parents) {
        const existingIndex = next.links.findIndex((item) => {
          if (item.child !== alice.id) return false;
          if (item.parent === link.parent) return true;
          const existingParent = next.persons.find((person) => person.id === item.parent);
          return link.parent === father.id && existingParent?.fsId === "G91F-ZVY";
        });
        if (existingIndex >= 0) {
          const existing = next.links[existingIndex]!;
          next.links[existingIndex] = {
            ...existing,
            parent: link.parent,
            role: link.role,
            sources: [...new Set([...(existing.sources ?? []), ...(link.sources ?? []), "FamilySearch merge G91F-ZVY to LRSD-ML7"])],
          };
        } else {
          next.links.push(structuredClone(link));
          addedLinks++;
        }
      }

      next.unions ??= [];
      const targetUnion = (target.unions ?? []).find((union) => [union.a, union.b].includes(father.id) && [union.a, union.b].includes(mother.id));
      const currentUnion = next.unions.find((union) => [union.a, union.b].sort().join("+") === [father.id, mother.id].sort().join("+"));
      if (currentUnion) currentUnion["children"] = [...new Set([...(currentUnion["children"] as string[] ?? []), alice.id])];
      else if (targetUnion) next.unions.push(structuredClone({ ...targetUnion, children: [...new Set([...(targetUnion["children"] as string[] ?? []), alice.id])] }));

      const audit = (next.meta as typeof next.meta & { generationAudit?: Record<string, unknown> }).generationAudit;
      const targetAudit = (target.meta as typeof target.meta & { generationAudit?: Record<string, unknown> }).generationAudit;
      if (audit && targetAudit) {
        for (const field of ["totalRelationships", "includedRelationships", "includedParentLinkRecords"]) {
          const currentCount = audit[field];
          const targetCount = targetAudit[field];
          if (typeof targetCount === "number") audit[field] = typeof currentCount === "number" && currentCount > targetCount ? currentCount + addedLinks : targetCount;
        }
      }
    }
    applied.add(ALICE_BOOTH_PARENT_PAIR_UPDATE_ID);
  }

  if (!applied.has(ALICE_BOOTH_PARENT_PAIR_UPDATE_ID) && next.meta.root !== "person-root") applied.add(ALICE_BOOTH_PARENT_PAIR_UPDATE_ID);

  if (!applied.has(LHWP_BRANCH_UPDATE_ID) && next.meta.root === "person-root") {
    const idsByFsId = new Map(next.persons.filter((person) => person.fsId).map((person) => [person.fsId, person.id]));
    const remap = new Map<string, string>();
    let addedPeople = 0;
    for (const person of LHWP_BRANCH_PERSONS) {
      const existingId = idsByFsId.get(person.fsId);
      if (existingId) { remap.set(person.id, existingId); continue; }
      const sameId = next.persons.find((item) => item.id === person.id);
      const id = sameId ? `${person.id}-new` : person.id;
      next.persons.push({ ...structuredClone(person), id });
      idsByFsId.set(person.fsId, id);
      remap.set(person.id, id);
      addedPeople++;
    }
    // Include existing endpoint IDs in the remap so every new link attaches to the existing tree.
    for (const person of next.persons) if (person.fsId) remap.set(`lhwp-${person.fsId.toLowerCase()}`, person.id);
    const linkKeys = new Set(next.links.map((link) => `${link.child}>${link.parent}`));
    let addedParentLinks = 0;
    for (const link of LHWP_BRANCH_LINKS) {
      const child = remap.get(link.child) ?? link.child;
      const parent = remap.get(link.parent) ?? link.parent;
      const key = `${child}>${parent}`;
      if (linkKeys.has(key)) continue;
      next.links.push({ ...structuredClone(link), child, parent });
      linkKeys.add(key);
      addedParentLinks++;
    }
    next.unions ??= [];
    let addedUnions = 0;
    for (const union of LHWP_BRANCH_UNIONS) {
      const a = remap.get(union.a) ?? union.a;
      const b = remap.get(union.b) ?? union.b;
      const children = (union["children"] as string[]).map((id) => remap.get(id) ?? id);
      const existing = next.unions.find((item) => [item.a, item.b].sort().join("+") === [a, b].sort().join("+"));
      if (existing) existing["children"] = [...new Set([...(existing["children"] as string[] ?? []), ...children])];
      else { next.unions.push({ ...structuredClone(union), a, b, children }); addedUnions++; }
    }
    const audit = (next.meta as typeof next.meta & { generationAudit?: Record<string, unknown> }).generationAudit;
    if (audit) {
      for (const field of ["totalPersons", "includedPersons", "directAncestorsExcludingRoot", "ancestorsIncludingRoot"]) {
        if (typeof audit[field] === "number") audit[field] = (audit[field] as number) + addedPeople;
      }
      for (const field of ["totalRelationships", "includedRelationships", "includedParentLinkRecords"]) {
        if (typeof audit[field] === "number") audit[field] = (audit[field] as number) + addedParentLinks;
      }
      if (typeof audit["includedUnionRecords"] === "number") audit["includedUnionRecords"] = (audit["includedUnionRecords"] as number) + addedUnions;
    }
    applied.add(LHWP_BRANCH_UPDATE_ID);
  }
  if (!applied.has(LHWP_BRANCH_UPDATE_ID) && next.meta.root !== "person-root") applied.add(LHWP_BRANCH_UPDATE_ID);

  const personIds = new Set(next.persons.map((person) => person.id));
  const addedIds = new Set<string>();
  for (const person of PF1L_ROUTE_PERSONS) {
    if (personIds.has(person.id)) continue;
    next.persons.push(structuredClone(person));
    personIds.add(person.id);
    addedIds.add(person.id);
  }

  const linkKeys = new Set(next.links.map((link) => `${link.child}>${link.parent}`));
  let addedLinks = 0;
  for (const link of PF1L_ROUTE_LINKS) {
    const key = `${link.child}>${link.parent}`;
    if (linkKeys.has(key)) continue;
    next.links.push(structuredClone(link));
    linkKeys.add(key);
    addedLinks++;
  }

  if (!applied.has(PUBLISHED_UPDATE_ID)) applied.add(PUBLISHED_UPDATE_ID);
  next.meta.appliedUpdates = [...applied];

  const meta = next.meta as typeof next.meta & { generationAudit?: Record<string, unknown> };
  const audit = meta.generationAudit;
  if (audit) {
    audit["sourcePersons"] ??= audit["totalPersons"];
    audit["sourceRelationships"] ??= audit["totalRelationships"];
    const increment = (field: string, amount: number) => {
      if (typeof audit[field] === "number") audit[field] = (audit[field] as number) + amount;
    };
    increment("totalPersons", addedIds.size);
    increment("includedPersons", addedIds.size);
    increment("directAncestorsExcludingRoot", addedIds.size);
    increment("ancestorsIncludingRoot", addedIds.size);
    increment("totalRelationships", addedLinks);
    increment("includedRelationships", addedLinks);
    increment("includedParentLinkRecords", addedLinks);
    audit["supplementalRoutePersons"] = (typeof audit["supplementalRoutePersons"] === "number" ? audit["supplementalRoutePersons"] as number : 0) + addedIds.size;
    audit["supplementalRouteRelationships"] = (typeof audit["supplementalRouteRelationships"] === "number" ? audit["supplementalRouteRelationships"] as number : 0) + addedLinks;
  }

  return next;
}
