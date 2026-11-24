// @ts-nocheck -- strict indexed-access checks relaxed for genealogy graph code
import { jsPDF } from "jspdf";
import type { Dataset, Derived, Person } from "./types";
import { ancestorsOf } from "./derive";

export function download(name: string, content: BlobPart, type: string) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const a = document.createElement("a"); a.href = url; a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
export const fsUrl = (id: string) => `https://www.familysearch.org/es/tree/person/${id}`;
export const displayDate = (value: string) => {
  const coded = value.match(/^D([ABRS]?)[.]?([+-])(\d{8})\.([A-Z]?)\.?([+-])(\d{8})\.\.$/);
  if (coded) {
    const [, modifier, sign, rawDate, qualifier, secondSign, rawSecond] = coded;
    const formatPart = (partSign: string, digits: string): string | null => {
      const y = Number(digits.slice(0, 4)), m = Number(digits.slice(4, 6)), d = Number(digits.slice(6, 8));
      if (!y) return null;
      const yearText = partSign === "-" ? `${y} a. C.` : String(y);
      if (m === 0) return yearText;
      if (m > 12) return null;
      if (d === 0) return new Intl.DateTimeFormat("es-MX", { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(Date.UTC(y, m - 1, 1)));
      if (d > 31) return null;
      const date = new Date(Date.UTC(y, m - 1, d));
      if (date.getUTCMonth() !== m - 1 || date.getUTCDate() !== d) return null;
      return new Intl.DateTimeFormat("es-MX", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }).format(date);
    };
    const first = formatPart(sign, rawDate);
    const second = formatPart(secondSign, rawSecond);
    if (!first || (qualifier && qualifier !== "A") || (rawSecond !== "00000000" && !second)) return value;
    const qualifierText = qualifier === "A" ? "aprox. " : "";
    if (modifier === "B") return `${qualifierText}antes de ${first}`;
    if (modifier === "A") return `${qualifierText}después de ${first}`;
    if ((modifier === "R" || modifier === "S" || rawSecond !== "00000000") && second) return `${qualifierText}entre ${first} y ${second}`;
    return `${qualifierText}${first}`;
  }
  const december = value.match(/^DEC\s+(\d{1,4})$/i);
  if (december) return `diciembre de ${december[1]}`;
  return value;
};
export const life = (p: Person) => (p.birth || p.death ? `${p.birth ? displayDate(p.birth) : "?"} – ${p.death ? displayDate(p.death) : "?"}` : "");

export function toGedcom(ds: Dataset, d: Derived): string {
  const L: string[] = ["0 HEAD", "1 SOUR PLANTILLA_GENEALOGICA", "1 GEDC", "2 VERS 5.5.1", "2 FORM LINEAGE-LINKED", "1 CHAR UTF-8"];
  const xref = new Map(ds.persons.map((p, i) => [p.id, `@I${i + 1}@`]));
  const fams: { id: string; parents: string[]; children: string[]; marr: string; marriagePlace?: string; marriagePlaceVariants?: string[] }[] = [];
  const famKey = new Map<string, number>();
  for (const [child, ls] of d.parents) {
    const ps = ls.map((l) => l.parent).sort(); const k = ps.join("+");
    if (!famKey.has(k)) { famKey.set(k, fams.length); const u = d.unions.find((u) => u.a === ps[0] && u.b === ps[1]); fams.push({ id: `@F${fams.length + 1}@`, parents: ps, children: [], marr: u?.marriage ?? "", marriagePlace: u?.marriagePlace, marriagePlaceVariants: u?.marriagePlaceVariants }); }
    fams[famKey.get(k)!].children.push(child);
  }
  // GEDCOM also needs family records for couples without registered children.
  for (const u of d.unions) {
    const k = [u.a, u.b].sort().join("+");
    if (famKey.has(k)) continue;
    famKey.set(k, fams.length);
    fams.push({ id: `@F${fams.length + 1}@`, parents: [u.a, u.b], children: [], marr: u.marriage, marriagePlace: u.marriagePlace, marriagePlaceVariants: u.marriagePlaceVariants });
  }
  const ev = (tag: string, v: string, place = "") => (v || place ? [`1 ${tag}`, ...(v ? [`2 DATE ${v}`] : []), ...(place ? [`2 PLAC ${place}`] : [])] : []);
  for (const p of ds.persons) {
    L.push(`0 ${xref.get(p.id)} INDI`, `1 NAME ${p.name}`);
    for (const n of p.altNames) L.push(`1 NAME ${n}`, "2 TYPE aka");
    if (p.sex) L.push(`1 SEX ${p.sex}`);
    L.push(...ev("BIRT", p.birth, p.birthPlace), ...ev("DEAT", p.death, p.deathPlace), ...ev("BAPM", p.baptism), ...ev("BURI", p.burial));
    L.push(`1 _FSFTID ${p.fsId}`, `1 REFN ${p.fsId}`, "2 TYPE FamilySearch", `1 NOTE Fuentes: ${p.sources.join(", ")}. Sin verificación documental original.`);
    for (const n of p.notes) L.push(`1 NOTE ${n}`);
    fams.forEach((f) => { if (f.children.includes(p.id)) L.push(`1 FAMC ${f.id}`); if (f.parents.includes(p.id)) L.push(`1 FAMS ${f.id}`); });
  }
  for (const f of fams) {
    L.push(`0 ${f.id} FAM`);
    const sexes = f.parents.map((id) => d.byId.get(id)!.sex);
    f.parents.forEach((id, i) => {
      const s = sexes[i];
      const tag = s === "M" ? "HUSB" : s === "F" ? "WIFE" : sexes.includes("M") ? "WIFE" : sexes.includes("F") ? "HUSB" : i === 0 ? "HUSB" : "WIFE";
      L.push(`1 ${tag} ${xref.get(id)}`);
      if (!s) L.push(`2 NOTE Sexo no registrado en las fuentes; etiqueta GEDCOM asignada solo por formato.`);
    });
    if (f.marr || f.marriagePlace || f.marriagePlaceVariants?.length) {
      L.push("1 MARR");
      if (f.marr) L.push(`2 DATE ${f.marr}`);
      if (f.marriagePlace) L.push(`2 PLAC ${f.marriagePlace}`);
      if (f.marriagePlaceVariants?.length) L.push(`2 NOTE Variantes de lugar: ${f.marriagePlaceVariants.join(" | ")}`);
    }
    for (const c of f.children) L.push(`1 CHIL ${xref.get(c)}`);
  }
  L.push("0 TRLR");
  return L.join("\n");
}

function pdfWriter(title: string) {
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  let y = 56; const W = doc.internal.pageSize.getWidth() - 96;
  doc.setFont("times", "bold"); doc.setFontSize(18); doc.text(title, 48, y); y += 26;
  const line = (t: string, size = 10, bold = false, indent = 0) => {
    doc.setFont("helvetica", bold ? "bold" : "normal"); doc.setFontSize(size);
    for (const ln of doc.splitTextToSize(t, W - indent)) { if (y > 800) { doc.addPage(); y = 56; } doc.text(ln, 48 + indent, y); y += size * 1.35; }
  };
  return { doc, line, gap: (n = 8) => { y += n; } };
}

export function personLines(d: Derived, p: Person): [string, string][] {
  const ps = (d.parents.get(p.id) ?? []).map((l) => `${d.byId.get(l.parent)!.name} (${l.parent})${l.role ? ` – ${l.role}` : ""}`);
  const kids = (d.children.get(p.id) ?? []).map((c) => `${d.byId.get(c)!.name} (${c})`);
  const sp = (d.unionOf.get(p.id) ?? []).map((u) => { const o = u.a === p.id ? u.b : u.a; return `${d.byId.get(o)!.name} (${o})`; });
  const g = d.generation.get(p.id);
  return [
    ["Nombres alternativos", p.altNames.join("; ")], ["Nacimiento", p.birth], ["Lugar de nacimiento", p.birthPlace ?? ""], ["Bautizo", p.baptism], ["Fallecimiento", p.death], ["Lugar de fallecimiento", p.deathPlace ?? ""], ["Entierro", p.burial],
    ["Matrimonio", p.marriage], ["Lugar de matrimonio", p.marriagePlace ?? ""], ["Cónyuge(s)", sp.join("; ")], ["Progenitores", ps.join("; ")], ["Hijos registrados", kids.join("; ")],
    ["Generación", g ? `G${g.join(", G")}` : ""], ["Rama", (d.branches.get(p.id) ?? []).join(", ")], ["FamilySearch", `${p.fsId} – ${fsUrl(p.fsId)}`],
    ["Fuentes", p.sources.join(", ")], ["Verificación", p.verification === "documento-original" ? "Verificado con documento original" : p.verification === "transcripcion-visual" ? "Transcripción visual; sin verificación documental" : p.sources.includes("secuencia-parejas-imagen") ? "FamilySearch y transcripción visual; pendiente de cotejo documental" : "Solo FamilySearch; pendiente de cotejo documental"],
    ["Observaciones", p.notes.join(" ")],
  ];
}

export function personPdf(d: Derived, p: Person) {
  const w = pdfWriter(p.name);
  for (const [k, v] of personLines(d, p)) w.line(`${k}: ${v || "Sin información"}`);
  w.doc.save(`ficha_${p.fsId}.pdf`);
}

export function branchPdf(d: Derived, id: string) {
  const p = d.byId.get(id)!; const anc = ancestorsOf(d, id);
  const w = pdfWriter(`Ascendencia de ${p.name} (${p.fsId})`);
  w.line(`${anc.size} antepasados registrados. Datos procedentes de FamilySearch; sin verificación documental original.`, 9);
  const dist = new Map<string, number>([[id, 0]]); const q = [id];
  while (q.length) { const x = q.shift()!; for (const l of d.parents.get(x) ?? []) if (!dist.has(l.parent)) { dist.set(l.parent, dist.get(x)! + 1); q.push(l.parent); } }
  const byG = new Map<number, string[]>();
  for (const [k, g] of dist) (byG.get(g) ?? byG.set(g, []).get(g)!).push(k);
  for (const g of [...byG.keys()].sort((a, b) => a - b)) {
    w.gap(); w.line(`Generación +${g} (${byG.get(g)!.length})`, 13, true);
    for (const k of byG.get(g)!) {
      const q2 = d.byId.get(k)!;
      const par = (d.parents.get(k) ?? []).map((l) => l.parent).join(", ");
      w.line(`${q2.name} · ${q2.fsId}${life(q2) ? ` · ${life(q2)}` : ""}${par ? ` · progenitores: ${par}` : ""}`, 9, false, 10);
    }
  }
  w.doc.save(`rama_${p.fsId}.pdf`);
}
