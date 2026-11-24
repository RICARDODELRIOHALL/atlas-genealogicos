import type { Dataset, Issue, Person } from "./types";
import type { MergeReport } from "./importer";

export const SEQUENCE_SOURCE = "secuencia-parejas-imagen";
const FILE = "secuencia_parejas.json";

interface Reading { nombre: string; fechas: string; codigo: string }
export interface CoupleSequence {
  titulo: string;
  fuente: { tipo: string; archivo: string; alcance: string };
  criterio_transcripcion: string;
  secuencia_parejas: { orden: number; progenitores: Reading[]; descendiente: Reading }[];
  observaciones: string[];
}

// Correspondencias provisionales código-leído → ID existente (vacío en la plantilla).
export const TRANSCRIPTION_IDS: Readonly<Record<string, string>> = {};

export function integrateSequence(base: Dataset, input: CoupleSequence, src = SEQUENCE_SOURCE, file = FILE): { ds: Dataset; report: MergeReport } {
  if (!input.secuencia_parejas.length || input.secuencia_parejas.some((pair) =>
    !pair.descendiente?.codigo || !Array.isArray(pair.progenitores) || pair.progenitores.length !== 2 || pair.progenitores.some((p) => !p.codigo || !p.nombre)
  )) throw new Error("La secuencia debe contener dos progenitores y un descendiente identificado por pareja.");

  const ds = structuredClone(base);
  const byId = new Map(ds.persons.map((p) => [p.id, p]));
  const links = new Map(ds.links.map((l) => [`${l.child}>${l.parent}`, l]));
  const report: MergeReport = { newPersons: 0, updatedPersons: 0, newLinks: 0, conflicts: 0, issues: [] };
  const updated = new Set<string>();
  const seenPeople = new Set<string>();
  const initialIds = new Set(byId.keys());
  const existingIssues = new Set(ds.issues.map((i) => JSON.stringify(i)));
  const addIssue = (issue: Issue) => {
    const key = JSON.stringify(issue);
    if (existingIssues.has(key)) return;
    existingIssues.add(key); ds.issues.push(issue); report.issues.push(issue);
    if (issue.severity !== "info") report.conflicts++;
  };
  const resolveId = (id: string) => {
    if (byId.has(id)) return id;
    const candidate = TRANSCRIPTION_IDS[id];
    return candidate && byId.has(candidate) ? candidate : id;
  };
  const provenance = `${input.fuente.tipo}: ${input.fuente.archivo}. ${input.fuente.alcance}`;

  function record(reading: Reading, pair: CoupleSequence["secuencia_parejas"][number], position: string): string {
    const id = resolveId(reading.codigo);
    seenPeople.add(id);
    let person = byId.get(id);
    if (!person) {
      person = { id, fsId: id, name: reading.nombre, altNames: [], sex: "", birth: "", death: "", marriage: "", baptism: "", burial: "", notes: [], sources: [], originals: [], verification: "transcripcion-visual" };
      byId.set(id, person); ds.persons.push(person); report.newPersons++;
    }
    let changed = false;
    if (!person.sources.includes(src)) { person.sources.push(src); changed = true; }
    if (!person.notes.includes(provenance)) { person.notes.push(provenance); changed = true; }
    if (!person.name) { person.name = reading.nombre; changed = true; }
    else if (person.name !== reading.nombre && !person.altNames.includes(reading.nombre)) { person.altNames.push(reading.nombre); changed = true; }
    const original = { source: src, record: { ...reading, orden: pair.orden, posicion: position, pareja: pair, fuente: input.fuente, criterio_transcripcion: input.criterio_transcripcion } };
    if (!person.originals.some((o) => JSON.stringify(o) === JSON.stringify(original))) { person.originals.push(original); changed = true; }

    if (id !== reading.codigo) {
      const msg = `${id} ${person.name}: la imagen lee «${reading.codigo}». Correspondencia provisional por nombre, fechas y familia ya registrada; se conserva ${id}. Código pendiente de revisión, no confirmado como alias FamilySearch.`;
      if (!person.notes.includes(msg)) { person.notes.push(msg); changed = true; }
      addIssue({ kind: "código de transcripción", severity: "revisión", ids: [id], msg });
    }

    const [birth = "", death = ""] = reading.fechas.split(/\s*[–—]\s*/);
    for (const [field, value] of [["birth", birth], ["death", death]] as const) {
      if (!value || value === "Vive") continue;
      if (!person[field]) { person[field] = value; changed = true; }
      else {
        const oldYear = person[field].match(/\b\d{4}\b/)?.[0];
        const newYear = value.match(/^\d{4}$/)?.[0];
        if (oldYear && newYear && oldYear !== newYear) {
          const msg = `${id} ${person.name}: ${field === "birth" ? "nacimiento" : "fallecimiento"} leído como ${value} en la imagen frente a «${person[field]}» en el atlas. Ambas lecturas se conservan en los originales; requiere cotejo documental.`;
          if (!person.notes.includes(msg)) { person.notes.push(msg); changed = true; }
          addIssue({ kind: "fecha de transcripción", severity: "revisión", ids: [id], msg });
        }
      }
    }
    if (death === "Vive" && !person.notes.includes("La imagen indica: Vive.")) { person.notes.push("La imagen indica: Vive."); changed = true; }
    if (changed && initialIds.has(id)) updated.add(id);
    return id;
  }

  for (const pair of input.secuencia_parejas) {
    const child = record(pair.descendiente, pair, "descendiente");
    for (const [position, reading] of pair.progenitores.entries()) {
      const parent = record(reading, pair, `progenitor ${position + 1}`);
      if (child === parent) throw new Error(`La pareja ${pair.orden} contiene una relación consigo misma.`);
      const key = `${child}>${parent}`;
      const existing = links.get(key);
      if (existing) { if (!existing.sources.includes(src)) existing.sources.push(src); }
      else {
        // Position in an image is not evidence of sex or paternal/maternal role.
        const link = { child, parent, role: "" as const, sources: [src] };
        ds.links.push(link); links.set(key, link); report.newLinks++;
      }
    }
  }
  report.updatedPersons = updated.size;
  for (const observation of input.observaciones) addIssue({ kind: "observación de fuente", severity: "info", ids: [], msg: `${file}: ${observation}` });
  if (!ds.meta.sources.some((s) => s.id === src)) ds.meta.sources.push({ id: src, file, kind: "Transcripción visual de parejas", note: `${input.titulo}. ${provenance} ${input.criterio_transcripcion}` });
  addIssue({ kind: "secuencia incorporada", severity: "info", ids: [ds.meta.root], msg: `${file}: ${input.secuencia_parejas.length} parejas; ${input.secuencia_parejas.length * 3} registros de imagen conservados; ${seenPeople.size} personas únicas de la secuencia. Relaciones cotejadas estructuralmente, no verificadas documentalmente.` });
  return { ds, report };
}
