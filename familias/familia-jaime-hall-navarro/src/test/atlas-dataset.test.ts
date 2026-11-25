import type { Dataset } from "@/lib/genealogy/types";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ancestorsOf, derive, findPath } from "@/lib/genealogy/derive";
import { computeLayout } from "@/lib/genealogy/layout";
import { loadDataset, seedDataset, DB_NAME, PUBLISHED_UPDATE_ID } from "@/lib/genealogy/store";
import { ensureRoot, merge, parseJson, parseRows } from "@/lib/genealogy/importer";
import { integrateSequence } from "@/lib/genealogy/sequence";
import { displayDate, toGedcom } from "@/lib/genealogy/exporters";
import { APP_CONFIG, cachePrefixFor, databaseNameFor, viewportKeyFor } from "@/lib/app-config";

const blankDataset = (): Dataset => ({ meta: { root: "", sources: [] }, persons: [], links: [], pendingRefs: [], issues: [] });

describe("RootsMagic date display", () => {
  it("formats full coded dates for people cards", () => {
    expect(displayDate("D.+19600628..+00000000..")).toBe("28 de junio de 1960");
  });
  it("keeps only the known precision of partial dates", () => {
    expect(displayDate("D.+18910000..+00000000..")).toBe("1891");
    expect(displayDate("D.+18770500..+00000000..")).toBe("mayo de 1877");
  });
});

afterEach(() => vi.unstubAllGlobals());

describe("Generated genealogy application", () => {
  it("ships the complete Atlas plus the requested PF1L ancestor route", async () => {
    const ds = await seedDataset();
    const mod = await import("@/data/atlas.json");
    const base = structuredClone((mod.default ?? mod) as unknown as Dataset);
    expect(ds.persons).toHaveLength(base.persons.length + 18);
    expect(ds.links).toHaveLength(base.links.length + 18);
    expect(ds.persons.map((person) => person.id)).toContain("route-pf1l-ltb");
    expect(ds.persons.map((person) => person.id)).toContain("route-pf1l-ccp");
    expect(ds.links).toContainEqual({ child: "ancestor-1266", parent: "route-pf1l-ltb", role: "", sources: [] });
    expect(ds.links).toContainEqual({ child: "ancestor-1266", parent: "route-pf1l-ccp", role: "", sources: [] });
    expect(ds.meta.appliedUpdates).toContain(PUBLISHED_UPDATE_ID);
    expect((ds.meta as typeof ds.meta & { generationAudit: Record<string, unknown> }).generationAudit).toMatchObject({ totalPersons: 5912, includedPersons: 1881, directAncestorsExcludingRoot: 1877, includedParentLinkRecords: 1998, includedUnionRecords: 1548 });
    expect(ds.persons.find((person) => person.id === "ancestor-0003")?.name).toBe("Jaime Rafael Hall Huidobro");
    expect(ds.persons.map((person) => person.name)).not.toContain("Ricardo del Río Hall");
    const ancestors = ancestorsOf(derive(ds), ds.meta.root);
    expect(ancestors.has("hallroute-9ss7-5bt")).toBe(true);
    expect(ancestors.has("hallroute-9hd3-mc1")).toBe(true);
    expect(ds.links).toContainEqual(expect.objectContaining({ child: "hallbranch-i3469", parent: "hallroute-lbgd-p8s" }));
    expect(ds.links).toContainEqual(expect.objectContaining({ child: "hallbranch-i3468", parent: "hallroute-lhv5-dyd" }));
    expect(ds.persons.map((person) => person.id)).toContain(ds.meta.root);
  });

  it("derives and lays out the generated tree without errors", async () => {
    const ds = await seedDataset();
    const d = derive(ds);
    expect(d.byId.size).toBe(ds.persons.length);
    const layout = computeLayout(d, ds.meta.root);
    expect(layout.apps.length).toBeGreaterThan(0);
    expect(layout.columns.length).toBeGreaterThan(0);
    expect(Object.values(layout.bounds).every(Number.isFinite)).toBe(true);
    expect(toGedcom(ds, d)).toContain("0 TRLR");
  });

  it("uses the four requested family surnames for the colored grandparent branches", async () => {
    const d = derive(await seedDataset());
    expect(d.branches.get("hallbranch-i4")).toContain("Hall");
    expect(d.branches.get("ancestor-0005")).toContain("Navarro");
    expect(d.branches.get("hallbranch-i6")).toContain("Huidobro");
    expect(d.branches.get("ancestor-0004")).toContain("Llamas");
  });

  it("imports rows, picks a child as root and traces kinship", async () => {
    const base = blankDataset();
    const frag = parseRows([
      { id: "C1", nombre: "Hija", "Código padre": "P1", "Código madre": "M1" },
      { id: "P1", nombre: "Padre", Sexo: "M" }, { id: "M1", nombre: "Madre", Sexo: "F" },
    ], "import:test");
    const ds = ensureRoot(merge(base, frag, "import:test", "t.csv").ds);
    expect(ds.persons).toHaveLength(3); expect(ds.links).toHaveLength(2);
    expect(ds.meta.root).toBe("C1");
    const d = derive(ds);
    expect(d.generation.get("P1")).toEqual([2]);
    expect(findPath(d, "P1", "M1")).toEqual(["P1", "C1", "M1"]);
    expect(computeLayout(d, ds.meta.root).apps.find((a) => a.depth === 0)?.personId).toBe("C1");
    const backup = JSON.parse(JSON.stringify(ds));
    const restored = ensureRoot(parseJson(backup, "backup:test") as typeof ds);
    expect(restored.persons.map((p) => p.id)).toEqual(ds.persons.map((p) => p.id));
    expect(restored.links).toEqual(ds.links);
    expect(toGedcom(restored, derive(restored))).toContain("1 CHIL @I1@");
  });

  it("reads CSV rows without dropping parent relationships", async () => {
    const Papa = (await import("papaparse")).default;
    const csv = Papa.parse<Record<string, unknown>>("id,nombre,Sexo,Código padre,Código madre,Lugar de nacimiento,Lugar de matrimonio\nC1,Hija,,P1,M1,Ciudad ficticia,\nP1,Padre,M,,,,Villa ficticia\nM1,Madre,F,,,,Villa ficticia", { header: true, skipEmptyLines: true });
    const fromCsv = ensureRoot(merge(blankDataset(), parseRows(csv.data, "import:csv"), "import:csv", "test.csv").ds);
    expect(fromCsv.links.map((link) => `${link.child}>${link.parent}`).sort()).toEqual(["C1>M1", "C1>P1"]);
    expect(fromCsv.persons.find((person) => person.id === "C1")?.birthPlace).toBe("Ciudad ficticia");
    const gedcom = toGedcom(fromCsv, derive(fromCsv));
    expect(gedcom).toContain("2 PLAC Ciudad ficticia");
    expect(gedcom).toContain("2 PLAC Villa ficticia");
  });

  it("preserves metadata and person provenance when merging a JSON backup", async () => {
    const person = parseRows([{ id: "P1", nombre: "Persona" }], "old").persons.get("P1")!;
    const base = { ...blankDataset(), persons: [person] };
    const incoming = structuredClone(base);
    incoming.persons[0]!.verification = "transcripcion-visual";
    incoming.persons[0]!.notes = ["Nota de prueba"];
    incoming.meta.note = "Metadatos de respaldo";
    incoming.meta.sources = [{ id: "archive", file: "backup.json", kind: "Archivo", note: "original" }];
    incoming.issues = [{ kind: "revisión", msg: "Caso conservado", ids: ["P1"], severity: "info" }];
    const merged = merge(base, incoming, "backup:merge", "backup.json").ds;
    expect(merged.persons[0]!.verification).toBe("transcripcion-visual");
    expect(merged.persons[0]!.notes).toEqual(["Nota de prueba"]);
    expect(merged.meta.sources.some((source) => source.id === "archive")).toBe(true);
    expect(merged.meta.note).toContain("Metadatos de respaldo");
    expect(merged.issues).toEqual(incoming.issues);
  });

  it("keeps a valid chosen root and adopts an imported dataset's root", () => {
    const ds = { meta: { root: "B", sources: [] }, persons: [...parseRows([{ id: "A", nombre: "Persona A" }, { id: "B", nombre: "Persona B" }], "test").persons.values()], links: [], pendingRefs: [], issues: [] };
    expect(ensureRoot(ds).meta.root).toBe("B");
    expect(ensureRoot({ ...ds, meta: { root: "", sources: [] } }, "A").meta.root).toBe("A");
  });

  it("lays out at least 18 generations when the imported tree contains them", () => {
    const persons = Array.from({ length: 20 }, (_, index) => ({ id: `P${index}`, fsId: `P${index}`, name: `Persona ficticia ${index}`, altNames: [], sex: "" as const, birth: "", death: "", marriage: "", baptism: "", burial: "", notes: [], sources: [], originals: [] }));
    const links = persons.slice(0, -1).map((person, index) => ({ child: person.id, parent: persons[index + 1]!.id, role: "" as const, sources: [] }));
    const data = { meta: { root: "P0", sources: [] }, persons, links, pendingRefs: [], issues: [] };
    expect(computeLayout(derive(data), data.meta.root).columns.length).toBeGreaterThanOrEqual(19);
  });

  it("excludes detached components from the tree layout without changing the source dataset", () => {
    const persons = [...parseRows([
      { id: "ROOT", nombre: "Persona central" },
      { id: "OFF1", nombre: "Pariente desconectado" },
      { id: "OFF2", nombre: "Progenitor desconectado" },
    ], "test").persons.values()];
    const data = { meta: { root: "ROOT", sources: [] }, persons,
      links: [{ child: "OFF1", parent: "OFF2", role: "" as const, sources: [] }], pendingRefs: [], issues: [] };
    const layout = computeLayout(derive(data), data.meta.root);
    expect(layout.apps.map((a) => a.personId)).toEqual(["ROOT"]);
    expect(persons).toHaveLength(3);
    expect(data.links).toHaveLength(1);
  });

  it("marks couple-sequence imports as visual transcriptions, not verified documents", async () => {
    const { ds } = integrateSequence(blankDataset(), {
      titulo: "t", fuente: { tipo: "imagen", archivo: "x.png", alcance: "Transcripción visual" }, criterio_transcripcion: "literal",
      secuencia_parejas: [{ orden: 1, progenitores: [{ nombre: "A", fechas: "1900–1950", codigo: "A1" }, { nombre: "B", fechas: "1901–1960", codigo: "B1" }], descendiente: { nombre: "C", fechas: "1930–Vive", codigo: "C1" } }],
      observaciones: [],
    });
    expect(ds.persons.map((p) => p.verification)).toEqual(["transcripcion-visual", "transcripcion-visual", "transcripcion-visual"]);
  });

  it("uses a neutral template storage key and does not read previous atlas databases", async () => {
    const request: { onsuccess?: () => void; result?: { close: () => void; transaction: () => { objectStore: () => { get: () => object } } } } = {};
    const open = vi.fn(() => {
      queueMicrotask(() => {
        request.result = { close: () => {}, transaction: () => ({ objectStore: () => ({ get: () => {
          const read: { onsuccess?: () => void; result: null } = { result: null };
          queueMicrotask(() => read.onsuccess?.()); return read;
        } }) }) };
        request.onsuccess?.();
      });
      return request;
    });
    vi.stubGlobal("indexedDB", { open });
    expect(await loadDataset()).toBeNull();
    expect(DB_NAME).toBe(databaseNameFor(APP_CONFIG.id));
    expect(open).toHaveBeenCalledTimes(1);
    expect(open).toHaveBeenCalledWith(DB_NAME, 1);
  });

  it("keeps database, viewport, and service worker identities separate per generated app", () => {
    const ids = ["familia-hall", "familia-garcia"];
    expect(databaseNameFor(ids[0]!)).not.toBe(databaseNameFor(ids[1]!));
    expect(viewportKeyFor(ids[0]!)).not.toBe(viewportKeyFor(ids[1]!));
    expect(cachePrefixFor(ids[0]!)).not.toBe(cachePrefixFor(ids[1]!));
  });

  it("preserves and exports a childless couple", () => {
    const persons = [...parseRows([{ id: "A", nombre: "Ana" }, { id: "B", nombre: "Luis" }], "test").persons.values()];
    const ds = { meta: { root: "A", sources: [] }, persons, links: [], pendingRefs: [], issues: [], unions: [{ a: "A", b: "B", marriage: "1901", marriagePlace: "Madrid" }] };
    const d = derive(ds);
    expect(d.unions).toHaveLength(1);
    const gedcom = toGedcom(ds, d);
    expect(gedcom).toContain("0 @F1@ FAM");
    expect(gedcom).toContain("2 DATE 1901");
    expect(gedcom).toContain("2 PLAC Madrid");
  });
});
