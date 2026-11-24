// @ts-nocheck -- strict indexed-access checks relaxed for genealogy graph code
import { X, ExternalLink, GitBranch, ArrowDownToLine, Route, Crosshair, FileDown, Flag } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { toast } from "sonner";
import type { Derived } from "@/lib/genealogy/types";
import { branchPdf, download, fsUrl, personLines, personPdf } from "@/lib/genealogy/exporters";
import { describeStep } from "@/lib/genealogy/derive";
import { useState } from "react";

type Actions = { anc: (id: string) => void; desc: (id: string) => void; toRoot: (id: string) => void; path: (a: string, b: string) => string[] | null; setRoot?: (id: string) => void; rootId?: string };

export function PersonPanel({ d, id, appCount, onClose, goTo, actions, pathFrom, setPathFrom }: {
  d: Derived; id: string; appCount: number; onClose: () => void; goTo: (id: string) => void; actions: Actions;
  pathFrom: string | null; setPathFrom: (s: string | null) => void;
}) {
  const p = d.byId.get(id)!;
  const [route, setRoute] = useState<string[] | null>(null);
  const PersonLink = ({ pid, extra }: { pid: string; extra?: string }) => (
    <button className="block text-left text-sm hover:text-gold" onClick={() => goTo(pid)}>
      {d.byId.get(pid)!.name} <span className="font-mono text-xs text-muted-foreground">{pid}{extra ? ` · ${extra}` : ""}</span>
    </button>
  );
  const parents = d.parents.get(id) ?? [];
  const kids = d.children.get(id) ?? [];
  const unions = d.unionOf.get(id) ?? [];
  // El panel resume las relaciones por persona/unión; las listas originales
  // siguen intactas para fichas exportadas y para el dataset.
  const displayParents = [...new Map(parents.map((link) => [link.parent, link])).values()];
  const displayKids = [...new Set(kids)];
  const displayUnions = [...new Map(unions.map((union) => [union.id, union])).values()];
  const issues = d.issues.filter((i) => i.ids.includes(id));
  const lines = Object.fromEntries(personLines(d, p));
  const recordLinks = ([
    ["birth", "Registro de nacimiento"],
    ["baptism", "Registro de bautismo"],
    ["death", "Registro de defunción"],
    ["marriage", "Registro de matrimonio"],
  ] as const).flatMap(([key, label]) => {
    const value = p.recordLinks?.[key];
    if (!value) return [];
    try {
      const url = new URL(value);
      if (url.protocol !== "https:" && url.protocol !== "http:") return [];
      return [{ label, href: url.href }];
    } catch { return []; }
  });
  const Field = ({ k, v }: { k: string; v?: string }) => (
    <div className="grid grid-cols-[120px_1fr] gap-2 py-1 text-sm">
      <div className="text-muted-foreground">{k}</div><div className={v ? "" : "italic text-muted-foreground/70"}>{v || "Sin información"}</div>
    </div>
  );
  return (
    <aside className="absolute inset-x-0 bottom-0 z-20 flex max-h-[70dvh] flex-col border-t border-border bg-card/95 backdrop-blur md:inset-y-0 md:left-auto md:right-0 md:max-h-none md:w-[420px] md:border-l md:border-t-0">
      <div className="flex items-start justify-between gap-2 border-b border-border p-4">
        <div>
          <div className="text-xs uppercase tracking-[0.2em] text-gold">{lines["Generación"] || "Sin generación"} · {lines["Rama"] || "Sin rama"}</div>
          <h2 className="mt-1 font-serif text-2xl font-semibold leading-tight">{p.name || "Sin nombre registrado"}</h2>
          {p.fsId ? <a href={fsUrl(p.fsId)} target="_blank" rel="noreferrer" className="mt-1 inline-flex items-center gap-1 font-mono text-xs text-muted-foreground hover:text-gold">
            FamilySearch {p.fsId} <ExternalLink className="h-3 w-3" />
          </a> : <div className="mt-1 font-mono text-xs text-muted-foreground">Sin ID de FamilySearch</div>}
        </div>
        <Button variant="ghost" size="icon" onClick={onClose} aria-label="Cerrar ficha"><X className="h-4 w-4" /></Button>
      </div>
      <ScrollArea className="flex-1">
        <div className="space-y-5 p-4">
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="secondary" onClick={() => goTo(id)}><Crosshair className="mr-1 h-3.5 w-3.5" />Localizar</Button>
            <Button size="sm" variant="secondary" onClick={() => actions.anc(id)}><GitBranch className="mr-1 h-3.5 w-3.5" />Ascendencia</Button>
            <Button size="sm" variant="secondary" onClick={() => actions.desc(id)}><ArrowDownToLine className="mr-1 h-3.5 w-3.5" />Descendencia</Button>
            <Button size="sm" variant="secondary" onClick={() => actions.toRoot(id)}><Route className="mr-1 h-3.5 w-3.5" />Hasta la persona central</Button>
            {actions.setRoot && actions.rootId !== id && <Button size="sm" variant="secondary" onClick={() => actions.setRoot!(id)}><Flag className="mr-1 h-3.5 w-3.5" />Fijar como persona central</Button>}
            {pathFrom && pathFrom !== id ? (
              <Button size="sm" onClick={() => { const r = actions.path(pathFrom, id); setRoute(r); }}><Flag className="mr-1 h-3.5 w-3.5" />Ruta desde {d.byId.get(pathFrom)?.name.split(" ")[0]}</Button>
            ) : (
              <Button size="sm" variant="outline" onClick={() => { setPathFrom(id); toast.info("Origen fijado. Selecciona otra persona y pulsa «Ruta desde…»."); }}><Flag className="mr-1 h-3.5 w-3.5" />Fijar como origen de ruta</Button>
            )}
          </div>
          {route && (
            <section className="rounded-md border border-gold/40 p-3">
              <h3 className="mb-2 text-xs uppercase tracking-widest text-gold">Ruta demostrable ({route.length - 1} vínculos)</h3>
              {route.map((pid, i) => <div key={pid} className="text-sm">{i > 0 && <span className="mr-1 text-xs text-muted-foreground">↳ {describeStep(d, route[i - 1], pid)}:</span>}<PersonLink pid={pid} /></div>)}
            </section>
          )}
          <section>
            <Field k="Nombres alternativos" v={lines["Nombres alternativos"]} />
            <Field k="Nacimiento" v={p.birth} /><Field k="Lugar de nacimiento" v={p.birthPlace} /><Field k="Bautizo" v={p.baptism} />
            <Field k="Fallecimiento" v={p.death} /><Field k="Lugar de fallecimiento" v={p.deathPlace} /><Field k="Entierro" v={p.burial} />
            <Field k="Matrimonio" v={p.marriage} /><Field k="Lugar de matrimonio" v={p.marriagePlace} />
            <Field k="Sexo" v={p.sex === "M" ? "Hombre" : p.sex === "F" ? "Mujer" : ""} />
            <Field k="Apariciones" v={`${appCount} en el lienzo`} />
          </section>
          {recordLinks.length > 0 && <section>
            <h3 className="mb-2 text-xs uppercase tracking-widest text-gold">Registros vinculados</h3>
            <div className="flex flex-wrap gap-2">
              {recordLinks.map(({ label, href }) => <Button key={label} asChild size="sm" variant="outline">
                <a href={href} target="_blank" rel="noopener noreferrer">{label} <ExternalLink className="ml-1 h-3.5 w-3.5" /></a>
              </Button>)}
            </div>
          </section>}
          <section>
            <h3 className="mb-1 text-xs uppercase tracking-widest text-gold">Progenitores</h3>
            {displayParents.length ? displayParents.map((l) => <PersonLink key={l.parent} pid={l.parent} extra={l.role || "rol no indicado"} />) : <p className="text-sm italic text-muted-foreground">Sin información</p>}
          </section>
          <section>
            <h3 className="mb-1 text-xs uppercase tracking-widest text-gold">Uniones</h3>
            {displayUnions.length ? displayUnions.map((u) => { const o = u.a === id ? u.b : u.a; return <div key={u.id} className="mb-1"><PersonLink pid={o} />
              <div className="text-xs text-muted-foreground">{u.marriage || (u.marriageVariants ? `Variantes: ${u.marriageVariants.join(" | ")}` : "Matrimonio sin información")}{u.marriagePlace ? ` · ${u.marriagePlace}` : u.marriagePlaceVariants ? ` · Lugares: ${u.marriagePlaceVariants.join(" | ")}` : ""} · {u.children.length} hijo/a(s) en común</div></div>; })
              : <p className="text-sm italic text-muted-foreground">Sin información</p>}
          </section>
          <section>
            <h3 className="mb-1 text-xs uppercase tracking-widest text-gold">Hijos registrados</h3>
            {displayKids.length ? displayKids.map((k) => <PersonLink key={k} pid={k} />) : <p className="text-sm italic text-muted-foreground">Sin información</p>}
          </section>
          <section className="rounded-md bg-secondary/60 p-3 text-sm">
            <h3 className="mb-1 text-xs uppercase tracking-widest text-gold">Fuentes</h3>
            <p>Fuentes: {p.sources.join(", ")}</p>
            {p.notes.map((n) => <p key={n} className="mt-1 text-muted-foreground">Observación: {n}</p>)}
          </section>
          <details className="text-xs">
            <summary className="cursor-pointer text-muted-foreground">Registros originales ({p.originals.length})</summary>
            <pre className="mt-2 whitespace-pre-wrap break-all rounded bg-secondary p-2 font-mono text-[11px]">{JSON.stringify(p.originals, null, 1)}</pre>
          </details>
          <div className="flex flex-wrap gap-2 border-t border-border pt-3">
            <Button size="sm" variant="outline" onClick={() => personPdf(d, p)}><FileDown className="mr-1 h-3.5 w-3.5" />Ficha PDF</Button>
            <Button size="sm" variant="outline" onClick={() => download(`ficha_${p.fsId}.json`, JSON.stringify({ person: p, parents, children: kids, unions }, null, 2), "application/json")}><FileDown className="mr-1 h-3.5 w-3.5" />Ficha JSON</Button>
            <Button size="sm" variant="outline" onClick={() => branchPdf(d, id)}><FileDown className="mr-1 h-3.5 w-3.5" />Rama PDF</Button>
          </div>
        </div>
      </ScrollArea>
    </aside>
  );
}

