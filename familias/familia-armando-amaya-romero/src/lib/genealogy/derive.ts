// @ts-nocheck -- strict indexed-access checks relaxed for genealogy graph code
import type { Dataset, Derived, Issue, ParentLink, Person, Union } from "./types";

/** Etiquetas de rama por abuelo/a de la persona central (solo etiquetas; la estructura sale de los datos). */
export const BRANCH_LABELS: Record<string, string> = {};
export const DERIVED_KINDS = new Set(["varias generaciones", "sin conexión", "cronología", "ciclo", "más de dos progenitores", "rol/sexo"]);

export function year(s?: string): number | null {
  const m = (s ?? "").match(/(1[0-9]{3}|20[0-2][0-9])/);
  return m ? Number(m[1]) : null;
}
function fallbackLabel(name: string) {
  const w = name.split(/\s+/); return w.length >= 3 ? w[w.length - 2] : w[w.length - 1] ?? name;
}

export function derive(ds: Dataset): Derived {
  const byId = new Map<string, Person>(ds.persons.map((p) => [p.id, p]));
  const parents = new Map<string, ParentLink[]>();
  const children = new Map<string, string[]>();
  for (const l of ds.links) {
    if (!byId.has(l.child) || !byId.has(l.parent)) continue;
    (parents.get(l.child) ?? parents.set(l.child, []).get(l.child)!).push(l);
    (children.get(l.parent) ?? children.set(l.parent, []).get(l.parent)!).push(l.child);
  }
  const issues: Issue[] = ds.issues.filter((i) => !DERIVED_KINDS.has(i.kind));
  // Uniones: dos progenitores que comparten hijo/a
  const um = new Map<string, Union>();
  const unionKey = (a: string, b: string) => [a, b].sort().join("+");
  for (const record of ds.unions ?? []) {
    const a = record.a, b = record.b;
    if (!a || !b || a === b) {
      issues.push({ kind: "unión no válida", severity: "revisión", ids: [a, b].filter(Boolean), msg: `Se omitió una unión con identificadores inválidos: ${a} / ${b}.` });
      continue;
    }
    if (!byId.has(a) || !byId.has(b)) {
      issues.push({ kind: "referencia de pareja sin ficha", severity: "revisión", ids: [a, b], msg: `La unión ${a} / ${b} se conserva en los datos, pero falta una ficha.` });
      continue;
    }
    const [first, second] = [a, b].sort(); const id = `u:${unionKey(a, b)}`;
    const existing = um.get(id);
    if (existing) {
      if (record.marriage && !existing.marriage) existing.marriage = record.marriage;
      if (record.marriagePlace && !existing.marriagePlace) existing.marriagePlace = record.marriagePlace;
      if (record.marriageVariants) existing.marriageVariants = [...new Set([...(existing.marriageVariants ?? []), ...record.marriageVariants])];
      if (record.marriagePlaceVariants) existing.marriagePlaceVariants = [...new Set([...(existing.marriagePlaceVariants ?? []), ...record.marriagePlaceVariants])];
    } else {
      um.set(id, { id, a: first, b: second, children: [], marriage: record.marriage ?? "", marriagePlace: record.marriagePlace, marriageVariants: record.marriageVariants, marriagePlaceVariants: record.marriagePlaceVariants });
    }
  }
  for (const [c, ls] of parents) {
    const ps = ls.map((l) => l.parent).sort();
    if (ps.length > 2) issues.push({ kind: "más de dos progenitores", severity: "revisión", ids: [c, ...ps],
      msg: `${c} ${byId.get(c)!.name} tiene ${ps.length} progenitores registrados: ${ps.map((p) => `${p} (${byId.get(p)!.name})`).join(", ")}` });
    for (const l of ls) {
      const s = byId.get(l.parent)!.sex;
      if ((l.role === "padre" && s === "F") || (l.role === "madre" && s === "M"))
        issues.push({ kind: "rol/sexo", severity: "revisión", ids: [c, l.parent], msg: `${l.parent} figura como ${l.role} de ${c} pero su sexo registrado no coincide.` });
    }
    for (let i = 0; i < ps.length; i++) for (let j = i + 1; j < ps.length; j++) {
      const id = `u:${unionKey(ps[i], ps[j])}`;
      const u = um.get(id) ?? um.set(id, { id, a: ps[i], b: ps[j], children: [], marriage: "" }).get(id)!;
      if (!u.children.includes(c)) u.children.push(c);
    }
  }
  const unions = [...um.values()];
  const unionOf = new Map<string, Union[]>();
  for (const u of unions) {
    const spouseA = byId.get(u.a)!; const spouseB = byId.get(u.b)!;
    const marriages = [...new Set([u.marriage, spouseA.marriage, spouseB.marriage, ...(u.marriageVariants ?? [])].filter(Boolean))];
    if (marriages.length === 1) u.marriage = marriages[0];
    else if (marriages.length > 1) { u.marriage = marriages[0]; u.marriageVariants = marriages; }
    const places = [...new Set([u.marriagePlace, spouseA.marriagePlace, spouseB.marriagePlace, ...(u.marriagePlaceVariants ?? [])].filter(Boolean))];
    if (places.length === 1) u.marriagePlace = places[0];
    else if (places.length > 1) { u.marriagePlace = places[0]; u.marriagePlaceVariants = places; }
    for (const p of [u.a, u.b]) (unionOf.get(p) ?? unionOf.set(p, []).get(p)!).push(u);
  }
  // Generaciones: todas las longitudes de ruta hacia la persona central
  const root = ds.meta.root;
  const generation = new Map<string, number[]>();
  const cycleSeen = new Set<string>();
  if (byId.has(root)) {
    const gsets = new Map<string, Set<number>>();
    const stack: [string, number, string[]][] = [[root, 1, [root]]];
    while (stack.length) {
      const [x, g, path] = stack.pop()!;
      const set = gsets.get(x) ?? gsets.set(x, new Set()).get(x)!;
      if (set.has(g)) continue;
      set.add(g);
      for (const l of parents.get(x) ?? []) {
        if (path.includes(l.parent)) {
          const key = [...path, l.parent].join(">");
          if (!cycleSeen.has(key)) { cycleSeen.add(key); issues.push({ kind: "ciclo", severity: "grave", ids: [...path, l.parent], msg: `Ciclo genealógico imposible: ${[...path, l.parent].join(" → ")}` }); }
          continue;
        }
        stack.push([l.parent, g + 1, path.length < 64 ? [...path, l.parent] : [l.parent]]);
      }
    }
    for (const [k, s] of gsets) generation.set(k, [...s].sort((a, b) => a - b));
  }
  const rootParentIds = (parents.get(root) ?? []).map((link) => link.parent).sort();
  const rootPeers = new Set<string>();
  if (rootParentIds.length) for (const person of ds.persons) {
    const parentIds = (parents.get(person.id) ?? []).map((link) => link.parent).sort();
    if (parentIds.length === rootParentIds.length && parentIds.every((id, index) => id === rootParentIds[index])) {
      rootPeers.add(person.id);
      generation.set(person.id, [1]);
    }
  }
  // Ramas por cuadrante de abuelos
  const branches = new Map<string, string[]>();
  const bsets = new Map<string, Set<string>>();
  for (const pl of parents.get(root) ?? []) for (const gl of parents.get(pl.parent) ?? []) {
    const lab = BRANCH_LABELS[gl.parent] ?? fallbackLabel(byId.get(gl.parent)!.name);
    const st = [gl.parent];
    while (st.length) {
      const x = st.pop()!; const s = bsets.get(x) ?? bsets.set(x, new Set()).get(x)!;
      if (s.has(lab)) continue; s.add(lab);
      for (const l of parents.get(x) ?? []) st.push(l.parent);
    }
  }
  for (const p of ds.persons) {
    if (p.id === root) branches.set(p.id, ["Central"]);
    else if (rootPeers.has(p.id)) branches.set(p.id, ["Central"]);
    else if ((parents.get(root) ?? []).some((l) => l.parent === p.id)) branches.set(p.id, ["Padres"]);
    else branches.set(p.id, [...(bsets.get(p.id) ?? [])].sort());
    const gs = generation.get(p.id);
    if (!gs) issues.push({ kind: "sin conexión", severity: "revisión", ids: [p.id], msg: `${p.fsId} ${p.name} no tiene ruta demostrable hasta la persona central; se muestra aparte.` });
    else if (gs.length > 1) issues.push({ kind: "varias generaciones", severity: "info", ids: [p.id], msg: `${p.fsId} ${p.name} enlaza con la persona central por rutas de distinta longitud: G${gs.join(", G")}.` });
    const yb = year(p.birth), yd = year(p.death);
    if (yb && yd && yd < yb) issues.push({ kind: "cronología", severity: "revisión", ids: [p.id], msg: `${p.fsId} ${p.name}: defunción (${yd}) anterior al nacimiento (${yb}).` });
  }
  for (const l of ds.links) {
    const c = byId.get(l.child), p = byId.get(l.parent);
    if (!c || !p) continue;
    const yc = year(c.birth), yp = year(p.birth);
    if (yc && yp && (yc - yp < 12 || yc - yp > 75))
      issues.push({ kind: "cronología", severity: "revisión", ids: [p.id, c.id], msg: `${p.fsId} ${p.name} (n. ${yp}) y su hijo/a ${c.fsId} ${c.name} (n. ${yc}): diferencia de ${yc - yp} años.` });
  }
  return { byId, parents, children, unions, unionOf, generation, branches, issues };
}

export function ancestorsOf(d: Derived, id: string): Set<string> {
  const out = new Set<string>(); const st = [id];
  while (st.length) { const x = st.pop()!; for (const l of d.parents.get(x) ?? []) if (!out.has(l.parent)) { out.add(l.parent); st.push(l.parent); } }
  return out;
}
export function descendantsOf(d: Derived, id: string): Set<string> {
  const out = new Set<string>(); const st = [id];
  while (st.length) { const x = st.pop()!; for (const c of d.children.get(x) ?? []) if (!out.has(c)) { out.add(c); st.push(c); } }
  return out;
}
/** Ruta más corta por vínculos padre/hijo registrados; null si no existe. */
export function findPath(d: Derived, from: string, to: string): string[] | null {
  if (from === to) return [from];
  const prev = new Map<string, string>([[from, ""]]); const q = [from];
  while (q.length) {
    const x = q.shift()!;
    const nb = [...(d.parents.get(x) ?? []).map((l) => l.parent), ...(d.children.get(x) ?? [])];
    for (const y of nb) {
      if (prev.has(y)) continue; prev.set(y, x);
      if (y === to) { const path = [y]; let c = x; while (c) { path.push(c); c = prev.get(c)!; } return path.reverse(); }
      q.push(y);
    }
  }
  return null;
}
/** Describe cada paso de una ruta (padre/madre/hijo). */
export function describeStep(d: Derived, a: string, b: string): string {
  const up = (d.parents.get(a) ?? []).find((l) => l.parent === b);
  if (up) return up.role || (d.byId.get(b)!.sex === "M" ? "padre" : d.byId.get(b)!.sex === "F" ? "madre" : "progenitor/a");
  return d.byId.get(b)!.sex === "M" ? "hijo" : d.byId.get(b)!.sex === "F" ? "hija" : "hijo/a";
}
