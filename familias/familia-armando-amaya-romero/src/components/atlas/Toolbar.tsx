// @ts-nocheck -- strict indexed-access checks relaxed for genealogy graph code
import { useMemo, useRef, useState } from "react";
import { Search, Home, Maximize, Layers, BarChart3, Database, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DropdownMenu, DropdownMenuCheckboxItem, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import type { Dataset, Derived } from "@/lib/genealogy/types";
import type { LayoutResult } from "@/lib/genealogy/layout";
import { download, toGedcom, life } from "@/lib/genealogy/exporters";
import { seedDataset } from "@/lib/genealogy/store";
import { APP_CONFIG } from "@/lib/app-config";
import { StatsDialog, ImportDialog, type PendingImport } from "./dialogs";
import { merge, parseJson, parseRows } from "@/lib/genealogy/importer";

const norm = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();

export function Toolbar(props: {
  ds: Dataset; d: Derived; layout: LayoutResult; branchList: string[]; hidden: Set<string>; setHidden: (s: Set<string>) => void;
  goTo: (id: string) => void; goRoot: () => void; fitAll: () => void; goGen: (g: number) => void;
  mode: { kind: string; label?: string }; clearMode: () => void; setDs: (d: Dataset) => Promise<void>; selected: string | null;
}) {
  const { ds, d, layout } = props;
  const [q, setQ] = useState("");
  const [open, setOpen] = useState<null | "stats">(null);
  const [pending, setPending] = useState<PendingImport | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const index = useMemo(() => ds.persons.filter((p) => layout.byPerson.has(p.id)).map((p) => ({ p, k: norm(`${p.name} ${p.altNames.join(" ")} ${p.fsId}`) })), [ds, layout]);
  const results = useMemo(() => {
    const t = norm(q.trim()); if (!t) return [];
    const gm = t.match(/^g(\d+)$/);
    if (gm) return index.filter((x) => d.generation.get(x.p.id)?.includes(Number(gm[1]))).slice(0, 60).map((x) => x.p);
    const words = t.split(/\s+/);
    return index.filter((x) => words.every((w) => x.k.includes(w))).slice(0, 60).map((x) => x.p);
  }, [q, index, d]);

  async function onFile(f: File) {
    try {
      const src = `import:${f.name}:${Date.now()}`;
      let frag;
      if (/\.json$/i.test(f.name)) frag = parseJson(JSON.parse(await f.text()), src);
      else if (/\.csv$/i.test(f.name)) { const Papa = (await import("papaparse")).default; frag = parseRows(Papa.parse<Record<string, unknown>>(await f.text(), { header: true, skipEmptyLines: true }).data, src); }
      else if (/\.xlsx?$/i.test(f.name)) {
        const XLSX = await import("xlsx"); const wb = XLSX.read(await f.arrayBuffer());
        frag = parseRows(wb.SheetNames.flatMap((n) => XLSX.utils.sheet_to_json<Record<string, unknown>>(wb.Sheets[n], { defval: "", raw: false })), src);
      } else throw new Error("Formato no admitido (JSON, CSV o Excel).");
      const preview = merge(ds, frag, src, f.name);
      setPending({ file: f.name, frag, src, preview });
    } catch (e) { toast.error(`No se pudo leer ${f.name}: ${e instanceof Error ? e.message : e}`); }
  }

  return (
    <>
      <header className="pointer-events-none absolute inset-x-0 top-0 z-10 flex flex-col gap-2 p-3">
        <div className="pointer-events-auto relative w-full">
          <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar registro por nombre, apellido, ID o «G12»" className="h-10 w-full bg-card/95 pl-10 text-base backdrop-blur" aria-label="Buscar registro" />
          {results.length > 0 && (
            <div className="absolute mt-1 max-h-[60vh] w-full overflow-auto rounded-md border border-border bg-popover shadow-xl">
              {results.map((p) => (
                <button key={p.id} className="block w-full px-3 py-2 text-left hover:bg-accent" onClick={() => { props.goTo(p.id); setQ(""); }}>
                  <div className="font-serif text-[15px] font-semibold">{p.name}</div>
                  <div className="text-xs text-muted-foreground">{life(p) || "Sin fechas"} · <span className="font-mono">{p.fsId}</span> · {d.generation.get(p.id) ? `G${d.generation.get(p.id)!.join("/")}` : "sin conexión"}</div>
                </button>
              ))}
            </div>
          )}
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="pointer-events-auto mr-2 hidden rounded-md border border-border bg-card/90 px-3 py-1.5 backdrop-blur lg:block">
            <div className="font-serif text-lg font-semibold leading-none text-gold">{APP_CONFIG.appName}</div>
            <div className="text-[10px] uppercase tracking-[0.25em] text-muted-foreground">Plantilla reutilizable</div>
          </div>
          <div className="pointer-events-auto flex flex-wrap gap-1.5">
          <Button size="sm" variant="secondary" onClick={props.goRoot} title={`Volver a ${d.byId.get(ds.meta.root)?.name ?? "la persona central"}`}><Home className="h-4 w-4 sm:mr-1" /><span className="hidden sm:inline">Persona central</span></Button>
          <Button size="sm" variant="secondary" onClick={props.fitAll} title="Encuadrar todo"><Maximize className="h-4 w-4 sm:mr-1" /><span className="hidden sm:inline">Todo</span></Button>
          <Select onValueChange={(v) => props.goGen(Number(v))}>
            <SelectTrigger className="h-8 w-[92px] bg-secondary text-xs"><SelectValue placeholder="Gen." /></SelectTrigger>
            <SelectContent>{layout.columns.map((c) => <SelectItem key={c.gen} value={String(c.gen)}>G{c.gen} · {c.count}</SelectItem>)}</SelectContent>
          </Select>
          <DropdownMenu>
            <DropdownMenuTrigger asChild><Button size="sm" variant="secondary"><Layers className="h-4 w-4 sm:mr-1" /><span className="hidden sm:inline">Ramas</span></Button></DropdownMenuTrigger>
            <DropdownMenuContent>
              <DropdownMenuLabel>Mostrar ramas</DropdownMenuLabel>
              {props.branchList.map((b) => (
                <DropdownMenuCheckboxItem key={b} checked={!props.hidden.has(b)} onSelect={(e) => e.preventDefault()}
                  onCheckedChange={(c) => { const n = new Set(props.hidden); c ? n.delete(b) : n.add(b); props.setHidden(n); }}>{b}</DropdownMenuCheckboxItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
          <Button size="sm" variant="secondary" onClick={() => setOpen("stats")}><BarChart3 className="h-4 w-4 sm:mr-1" /><span className="hidden sm:inline">Estadísticas</span></Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild><Button size="sm" variant="secondary"><Database className="h-4 w-4 sm:mr-1" /><span className="hidden sm:inline">Datos</span></Button></DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onSelect={() => fileRef.current?.click()}>Importar JSON / CSV / Excel…</DropdownMenuItem>
              <DropdownMenuItem onSelect={() => fileRef.current?.click()}>Restaurar copia de seguridad JSON…</DropdownMenuItem>
              <DropdownMenuItem onSelect={async () => { const original = await seedDataset(); download(`${APP_CONFIG.id}_original.json`, JSON.stringify(original, null, 2), "application/json"); }}>Descargar JSON original incluido</DropdownMenuItem>
              <DropdownMenuItem onSelect={async () => {
                if (!window.confirm("Esto reemplazará tus datos locales por el árbol original incluido en esta aplicación. Descarga primero una copia de seguridad si quieres conservar tus cambios.")) return;
                await props.setDs(await seedDataset());
                toast.success("Se restauraron los datos originales de esta aplicación.");
              }}>Restaurar datos originales incluidos…</DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onSelect={() => download("atlas_completo.json", JSON.stringify(ds, null, 1), "application/json")}>Exportar todo (JSON)</DropdownMenuItem>
              <DropdownMenuItem onSelect={() => download("atlas.ged", toGedcom(ds, d), "text/plain")}>Exportar GEDCOM</DropdownMenuItem>
              <DropdownMenuItem onSelect={() => download(`copia_atlas_${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify(ds, null, 2), "application/json")}>Descargar copia de seguridad JSON</DropdownMenuItem>
              <DropdownMenuItem disabled={!props.selected} onSelect={async () => { const { branchPdf } = await import("@/lib/genealogy/exporters"); branchPdf(d, props.selected!); }}>Rama de la persona seleccionada (PDF)</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <input id="atlas-import-input" ref={fileRef} type="file" accept=".json,.csv,.xlsx,.xls" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) onFile(f); e.target.value = ""; }} />
          </div>
        </div>
      </header>
      {props.mode.kind !== "none" && (
        <div className="absolute bottom-4 left-1/2 z-10 flex -translate-x-1/2 items-center gap-2 rounded-full border border-gold/50 bg-card/95 px-4 py-1.5 text-sm text-gold shadow-lg max-md:bottom-auto max-md:top-28">
          {props.mode.label}
          <button onClick={props.clearMode} aria-label="Quitar resaltado"><X className="h-4 w-4" /></button>
        </div>
      )}
      <StatsDialog open={open === "stats"} onOpenChange={(o) => setOpen(o ? "stats" : null)} ds={ds} d={d} layout={layout} />
      <ImportDialog pending={pending} onClose={() => setPending(null)} ds={ds} setDs={props.setDs} />
    </>
  );
}
