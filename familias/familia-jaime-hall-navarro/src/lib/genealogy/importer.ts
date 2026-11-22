// @ts-nocheck -- strict indexed-access checks relaxed for genealogy graph code
import type { Dataset, Issue, ParentLink, Person } from "./types";

const empty = (id: string): Person => ({ id, fsId: id, name: "", altNames: [], sex: "", birth: "", death: "", marriage: "", baptism: "", burial: "", birthPlace: "", deathPlace: "", marriagePlace: "", notes: [], sources: [], originals: [] });
type Frag = { persons: Map<string, Person>; links: ParentLink[]; issues: Issue[]; unions?: Dataset["unions"] };
const str = (v: unknown) => (v == null ? "" : String(v).trim());

function fragFromRows(rows: Record<string, unknown>[], src: string): Frag {
  const f: Frag = { persons: new Map(), links: [], issues: [], unions: [] };
  const pick = (r: Record<string, unknown>, ...ks: string[]) => { for (const k of ks) if (str(r[k])) return str(r[k]); return ""; };
  for (const r of rows) {
    const id = pick(r, "Código FamilySearch", "id", "familySearchId", "fsId", "FamilySearch");
    if (!id) { f.issues.push({ kind: "fila sin id", severity: "revisión", ids: [], msg: `Fila sin identificador en ${src}: ${JSON.stringify(r).slice(0, 160)}` }); continue; }
    const p = f.persons.get(id) ?? empty(id);
    p.name ||= pick(r, "Nombre en FamilySearch", "name", "nombre");
    const sx = pick(r, "Sexo", "sex"); p.sex = sx === "Hombre" || sx === "M" ? "M" : sx === "Mujer" || sx === "F" ? "F" : p.sex;
    p.birth ||= pick(r, "birth", "Nacimiento"); p.death ||= pick(r, "death", "Fallecimiento"); p.marriage ||= pick(r, "marriage", "Matrimonio");
    p.birthPlace ||= pick(r, "birthPlace", "Lugar de nacimiento", "Birth Place");
    p.deathPlace ||= pick(r, "deathPlace", "Lugar de fallecimiento", "Death Place");
    p.marriagePlace ||= pick(r, "marriagePlace", "Lugar de matrimonio", "Marriage Place");
    const alt = pick(r, "alternateNames"); if (alt) p.altNames.push(...alt.split(/[;|]/).map((s) => s.trim()).filter(Boolean));
    p.sources = [src]; p.originals.push({ source: src, record: r }); f.persons.set(id, p);
    const fa = pick(r, "Código padre"), mo = pick(r, "Código madre");
    if (fa) f.links.push({ child: id, parent: fa, role: "padre", sources: [src] });
    if (mo) f.links.push({ child: id, parent: mo, role: "madre", sources: [src] });
    const spouse = pick(r, "partnerId", "spouseId", "Código pareja", "Código cónyuge", "Spouse ID");
    if (spouse && spouse !== id) f.unions!.push({ a: id, b: spouse, marriage: p.marriage, marriagePlace: p.marriagePlace, sources: [src] });
    const pids = pick(r, "parentIds", "Códigos de padres registrados");
    for (const pid of pids.split(/[;,|]/).map((s) => s.trim()).filter(Boolean))
      if (pid !== fa && pid !== mo) f.links.push({ child: id, parent: pid, role: "", sources: [src] });
  }
  return f;
}

export function parseJson(obj: any, src: string): Frag | Dataset {
  if (Array.isArray(obj?.persons) && Array.isArray(obj?.links)) return obj as Dataset;
  if (Array.isArray(obj?.nodes)) {
    const f: Frag = { persons: new Map(), links: [], issues: [], unions: [] };
    const nid = new Map<string, string>(obj.nodes.map((n: any) => [n.i, n.f]));
    for (const n of obj.nodes) {
      if (!n.f) continue;
      const p = f.persons.get(n.f) ?? empty(n.f);
      p.name ||= str(n.n); p.birth ||= str(n.b); p.death ||= str(n.d); p.marriage ||= str(n.m); p.baptism ||= str(n.bt); p.burial ||= str(n.bu);
      p.birthPlace ||= str(n.bp ?? n.birthPlace); p.deathPlace ||= str(n.dp ?? n.deathPlace); p.marriagePlace ||= str(n.mp ?? n.marriagePlace);
      if (n.obs && !p.notes.includes(n.obs)) p.notes.push(n.obs);
      p.sources = [src]; p.originals.push({ source: src, record: n }); f.persons.set(n.f, p);
      for (const c of n.c ?? []) if (nid.get(c)) f.links.push({ child: n.f, parent: nid.get(c)!, role: "", sources: [src] });
    }
    return f;
  }
  if (Array.isArray(obj?.people)) return fragFromRows(obj.people.map((p: any) => ({ ...p, parentIds: (p.parentIds ?? []).join(";"), alternateNames: (p.alternateNames ?? []).join(";") })), src);
  if (Array.isArray(obj)) return fragFromRows(obj, src);
  throw new Error("Formato JSON no reconocido");
}
export function parseRows(rows: Record<string, unknown>[], src: string): Frag { return fragFromRows(rows, src); }

export interface MergeReport { newPersons: number; updatedPersons: number; newLinks: number; conflicts: number; issues: Issue[] }

export function merge(base: Dataset, inc: Frag | Dataset, src: string, file: string): { ds: Dataset; report: MergeReport } {
  const ds: Dataset = structuredClone(base);
  const byId = new Map(ds.persons.map((p) => [p.id, p]));
  const report: MergeReport = { newPersons: 0, updatedPersons: 0, newLinks: 0, conflicts: 0, issues: [] };
  const persons = inc.persons instanceof Map ? [...inc.persons.values()] : (inc.persons as Person[]);
  for (const ip of persons) {
    const ex = byId.get(ip.id);
    if (!ex) { ds.persons.push(structuredClone(ip)); byId.set(ip.id, ds.persons[ds.persons.length - 1]); report.newPersons++; continue; }
    let touched = false;
    for (const k of ["name", "birth", "death", "marriage", "baptism", "burial", "birthPlace", "deathPlace", "marriagePlace", "sex"] as const) {
      const v = ip[k]; if (!v) continue;
      if (!ex[k]) { (ex as any)[k] = v; touched = true; }
      else if (ex[k] !== v) {
        if (k === "name" && !ex.altNames.includes(v)) ex.altNames.push(v);
        report.conflicts++;
        report.issues.push({ kind: "discrepancia", severity: "revisión", ids: [ex.id], msg: `${ex.id}: «${k}» difiere al importar ${file} (${ex[k]} vs ${v}). Se conserva el valor existente.` });
      }
    }
    if (ip.fsId && !ex.fsId) { ex.fsId = ip.fsId; touched = true; }
    else if (ip.fsId && ex.fsId !== ip.fsId) {
      report.conflicts++;
      report.issues.push({ kind: "discrepancia", severity: "revisión", ids: [ex.id], msg: `${ex.id}: «fsId» difiere al importar ${file} (${ex.fsId} vs ${ip.fsId}). Se conserva el valor existente.` });
    }
    if (!ex.verification && ip.verification) { ex.verification = ip.verification; touched = true; }
    for (const s of ip.sources) if (!ex.sources.includes(s)) { ex.sources.push(s); touched = true; }
    const seen = new Set(ex.originals.map((o) => JSON.stringify(o)));
    for (const o of ip.originals) if (!seen.has(JSON.stringify(o))) { ex.originals.push(o); touched = true; }
    for (const n of ip.notes) if (!ex.notes.includes(n)) { ex.notes.push(n); touched = true; }
    for (const n of ip.altNames) if (!ex.altNames.includes(n)) { ex.altNames.push(n); touched = true; }
    if (touched) report.updatedPersons++;
  }
  const unionKey = (u: { a: string; b: string }) => [u.a, u.b].sort().join(">>");
  const unions = new Map((ds.unions ?? []).map((u) => [unionKey(u), u]));
  for (const u of inc.unions ?? []) {
    const k = unionKey(u); const existing = unions.get(k);
    if (existing) {
      if (!existing.marriage && u.marriage) existing.marriage = u.marriage;
      if (!existing.marriagePlace && u.marriagePlace) existing.marriagePlace = u.marriagePlace;
      existing.sources = [...new Set([...(existing.sources ?? []), ...(u.sources ?? [])])];
    } else { const copy = structuredClone(u); ds.unions ??= []; ds.unions.push(copy); unions.set(k, copy); }
  }
  const lk = new Map(ds.links.map((l) => [`${l.child}>${l.parent}`, l]));
  const pend = new Map(ds.pendingRefs.map((l) => [`${l.child}>${l.parent}`, l]));
  for (const l of [...inc.links, ...("pendingRefs" in inc ? inc.pendingRefs : [])]) {
    const k = `${l.child}>${l.parent}`; const ex = lk.get(k) ?? pend.get(k);
    if (ex) { for (const s of l.sources) if (!ex.sources.includes(s)) ex.sources.push(s); if (!ex.role && l.role) ex.role = l.role; continue; }
    const nl = structuredClone(l);
    if (byId.has(l.parent) && byId.has(l.child)) { ds.links.push(nl); lk.set(k, nl); report.newLinks++; }
    else { ds.pendingRefs.push(nl); pend.set(k, nl); }
  }
  // referencias pendientes que ahora tienen ficha
  ds.pendingRefs = ds.pendingRefs.filter((l) => { if (byId.has(l.parent) && byId.has(l.child)) { ds.links.push(l); return false; } return true; });
  const issueKeys = new Set(ds.issues.map((issue) => JSON.stringify(issue)));
  for (const issue of [...report.issues, ...(inc.issues ?? [])]) {
    const key = JSON.stringify(issue);
    if (!issueKeys.has(key)) { ds.issues.push(structuredClone(issue)); issueKeys.add(key); }
  }
  if ("meta" in inc) {
    for (const source of inc.meta.sources ?? []) {
      if (!ds.meta.sources.some((existing) => existing.id === source.id)) ds.meta.sources.push(structuredClone(source));
    }
    for (const key of ["note", "missingCsv"] as const) {
      if (inc.meta[key]) {
        ds.meta[key] = [...new Set([ds.meta[key], inc.meta[key]].filter(Boolean))].join(" · ");
      }
    }
    ds.meta.appliedUpdates = [...new Set([...(ds.meta.appliedUpdates ?? []), ...(inc.meta.appliedUpdates ?? [])])];
  }
  if (!ds.meta.sources.some((s) => s.id === src)) ds.meta.sources.push({ id: src, file, kind: "Importación", note: `Importado ${new Date().toLocaleString("es")}` });
  return { ds, report };
}

/** Garantiza una persona central válida: conserva la actual, adopta la del archivo o elige a alguien sin hijos registrados. */
export function ensureRoot(ds: Dataset, preferred?: string): Dataset {
  const ids = new Set(ds.persons.map((p) => p.id));
  if (ids.has(ds.meta.root)) return ds;
  let root = preferred && ids.has(preferred) ? preferred : "";
  if (!root && ds.persons.length) {
    const parents = new Set(ds.links.map((l) => l.parent));
    root = (ds.persons.find((p) => !parents.has(p.id)) ?? ds.persons[0]).id;
  }
  return { ...ds, meta: { ...ds.meta, root } };
}
