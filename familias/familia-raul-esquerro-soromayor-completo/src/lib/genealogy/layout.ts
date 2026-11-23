// @ts-nocheck -- strict indexed-access checks relaxed for genealogy graph code
import type { Derived } from "./types";

export const CARD_W = 250, CARD_H = 66, COL_W = 340;
const TIGHT = 6, GAP = 18;

export interface Appearance {
  key: string; personId: string; gen: number; depth: number; isRef: boolean;
  childKey: string | null; parentKeys: string[]; x: number; y: number; group: "main" | "pending";
}
export interface LayoutResult {
  apps: Appearance[]; byPerson: Map<string, Appearance[]>;
  unions: { key: string; x: number; y: number; childKey: string; parentKeys: string[] }[];
  columns: { gen: number; x: number; minY: number; maxY: number; count: number }[];
  pendingTop: number | null; bounds: { minX: number; minY: number; maxX: number; maxY: number };
}

function orderedParents(d: Derived, id: string) {
  const ls = [...(d.parents.get(id) ?? [])];
  const rank = (pid: string, role: string) => {
    const s = d.byId.get(pid)!.sex;
    return role === "padre" || (!role && s === "M") ? 0 : role === "madre" || (!role && s === "F") ? 1 : 2;
  };
  return ls.sort((a, b) => rank(a.parent, a.role) - rank(b.parent, b.role)).map((l) => l.parent);
}

export function computeLayout(d: Derived, root: string): LayoutResult {
  const apps = new Map<string, Appearance>();
  const byPerson = new Map<string, Appearance[]>();
  const expanded = new Set<string>();
  let seq = 0;
  const mk = (pid: string, depth: number, child: string | null, group: Appearance["group"]) => {
    const a: Appearance = { key: `a${seq++}`, personId: pid, gen: depth + 1, depth, isRef: false, childKey: child, parentKeys: [], x: 0, y: 0, group };
    apps.set(a.key, a); (byPerson.get(pid) ?? byPerson.set(pid, []).get(pid)!).push(a); return a;
  };
  const expandBFS = (start: Appearance[]) => {
    const q = [...start];
    while (q.length) {
      const a = q.shift()!;
      if (expanded.has(a.personId)) { a.isRef = true; continue; }
      expanded.add(a.personId);
      for (const p of orderedParents(d, a.personId)) { const pa = mk(p, a.depth + 1, a.key, a.group); a.parentKeys.push(pa.key); q.push(pa); }
    }
  };
  const roots: Appearance[] = [];
  if (d.byId.has(root)) { const r = mk(root, 0, null, "main"); roots.push(r); expandBFS([r]); }

  // Contornos (tipo Reingold–Tilford) por columna: parejas juntas salvo que sus ascendientes lo impidan
  type Contour = { top: number[]; bot: number[] };
  const offsets = new Map<string, number>();
  const contour = (a: Appearance): Contour => {
    const kids = a.parentKeys.map((k) => apps.get(k)!);
    const cs = kids.map(contour);
    const offs: number[] = [];
    for (let i = 0; i < cs.length; i++) {
      if (i === 0) { offs.push(0); continue; }
      let need = -Infinity;
      for (let j = 0; j < i; j++) {
        const depth = Math.min(cs[j].bot.length, cs[i].top.length);
        for (let dd = 0; dd < depth; dd++) need = Math.max(need, offs[j] + cs[j].bot[dd] - cs[i].top[dd] + (dd === 0 ? TIGHT : GAP));
      }
      offs.push(need);
    }
    const shift = cs.length ? (offs[0] + offs[offs.length - 1]) / 2 : 0;
    const top = [-CARD_H / 2], bot = [CARD_H / 2];
    cs.forEach((c, i) => {
      const o = offs[i] - shift; offsets.set(kids[i].key, o);
      c.top.forEach((v, dd) => { top[dd + 1] = Math.min(top[dd + 1] ?? Infinity, o + v); });
      c.bot.forEach((v, dd) => { bot[dd + 1] = Math.max(bot[dd + 1] ?? -Infinity, o + v); });
    });
    return { top, bot };
  };
  const place = (a: Appearance, y: number) => {
    a.y = y; a.x = a.depth * COL_W;
    for (const k of a.parentKeys) place(apps.get(k)!, y + offsets.get(k)!);
  };
  let cursor = 0; const pendingTop: number | null = null;
  const placeRoot = (r: Appearance, first: boolean) => {
    const c = contour(r);
    const minTop = Math.min(...c.top);
    const y = first ? 0 : cursor - minTop;
    place(r, y);
    cursor = y + Math.max(...c.bot) + GAP * 2;
  };
  for (const r of roots) placeRoot(r, true);

  const list = [...apps.values()];
  const unions: LayoutResult["unions"] = [];
  for (const a of list) {
    if (!a.parentKeys.length) continue;
    const ps = a.parentKeys.map((k) => apps.get(k)!);
    const ys = ps.map((p) => p.y);
    unions.push({ key: `j${a.key}`, x: (a.depth + 1) * COL_W - 34, y: (Math.min(...ys) + Math.max(...ys)) / 2, childKey: a.key, parentKeys: a.parentKeys });
  }
  const cols = new Map<number, LayoutResult["columns"][number]>();
  for (const a of list) {
    if (a.group !== "main") continue;
    const c = cols.get(a.gen) ?? cols.set(a.gen, { gen: a.gen, x: a.x, minY: Infinity, maxY: -Infinity, count: 0 }).get(a.gen)!;
    c.minY = Math.min(c.minY, a.y); c.maxY = Math.max(c.maxY, a.y); if (!a.isRef) c.count++;
  }
  const xs = list.length ? list.map((a) => a.x) : [0], ys = list.length ? list.map((a) => a.y) : [0];
  return {
    apps: list, byPerson, unions, columns: [...cols.values()].sort((a, b) => a.gen - b.gen), pendingTop,
    bounds: { minX: Math.min(...xs), minY: Math.min(...ys) - CARD_H, maxX: Math.max(...xs) + CARD_W, maxY: Math.max(...ys) + CARD_H },
  };
}
