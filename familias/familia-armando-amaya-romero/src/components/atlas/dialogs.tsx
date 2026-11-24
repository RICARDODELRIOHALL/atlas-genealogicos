Warning: truncated output (original token count: 1412)
Total output lines: 78

import { useMemo, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import type { Dataset, Derived } from "@/lib/genealogy/types";
import type { LayoutResult } from "@/lib/genealogy/layout";
import { merge, type MergeReport, ensureRoot } from "@/lib/genealogy/importer";

export type PendingImport = { file: string; frag: any; src: string; preview: { ds: Dataset; report: MergeReport } };

const Stat = ({ k, v }: { k: string; v: number | string }) => (
  <div className="rounded-md border border-border p-3"><div className="font-serif text-3xl text-gold">{v}</div><div className="text-xs text-muted-foreground">{k}</div></div>
);

export function StatsDialog({ open, onOpenChange, ds, d, layout }: { open: boolean; onOpenChange: (o: boolean) => void; ds: Dataset; d: Derived; layout: LayoutResult }) {
  const branches = new Set([...d.branches.values()].flat());
  const pend = d.issues.filter((i) => i.severity !== "info").length;
  return (
    <Dialog open={open} onOpenChange={onOpenChange}><DialogContent className="max-w-2xl">
      <DialogHeader><DialogTitle className="font-serif text-2xl">Estadísticas</DialogTitle></DialogHeader>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat k="Personas en los datos" v={ds.persons.length} /><Stat k="Personas mostradas" v={layout.apps.length} />
        <Stat k="Generaciones" v={layout.columns.length} /><Stat k="Parejas" v={d.unions.length} />
        <Stat k="Vínculos padre/hijo" v={ds.links.length} /><Stat k="Ramas" v={branches.size} /><Stat k="Fuentes" v={ds.meta.sources.length} />
      </div>
    </DialogContent></Dialog>
  );
}

export function IntegrityDialog({ open, onOpenChange, ds, d, goTo }: { open: boolean; onOpenChange: (o: boolean) => void; ds: Dataset; d: Derived; goTo: (id: string) => void }) {
  const [kind, setKind] = useState<string | null>(null);
  const cou…412 tokens truncated…     </div>
    </DialogContent></Dialog>
  );
}

export function ImportDialog({ pending, onClose, ds, setDs }: { pending: PendingImport | null; onClose: () => void; ds: Dataset; setDs: (d: Dataset) => Promise<void> }) {
  const [confirmReplace, setConfirmReplace] = useState(false);
  if (!pending) return null;
  const r = pending.preview.report;
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}><DialogContent>
      <DialogHeader><DialogTitle className="font-serif text-2xl">Importar {pending.file}</DialogTitle>
        <DialogDescription>Nada se guarda hasta que confirmes. La fusión no borra datos existentes.</DialogDescription></DialogHeader>
      <ul className="text-sm"><li>Personas nuevas: {r.newPersons}</li><li>Personas con datos añadidos: {r.updatedPersons}</li><li>Vínculos nuevos: {r.newLinks}</li><li>Discrepancias registradas: {r.conflicts}</li></ul>
      <label className="flex items-center gap-2 text-sm text-warn"><input type="checkbox" checked={confirmReplace} onChange={(e) => setConfirmReplace(e.target.checked)} />Entiendo que «Reemplazar todo» borra los datos actuales</label>
      <div className="flex justify-end gap-2">
        <Button variant="outline" disabled={!confirmReplace} onClick={async () => {
          const base: Dataset = { meta: { ...ds.meta, sources: [] }, persons: [], links: [], pendingRefs: [], issues: [] };
          const incoming = pending.frag as Partial<Dataset>;
          const replacement = incoming.meta && Array.isArray(incoming.persons) && Array.isArray(incoming.links)
            ? structuredClone(incoming as Dataset)
            : merge(base, pending.frag, pending.src, pending.file).ds;
          await setDs(ensureRoot(replacement, incoming.meta?.root)); onClose();
        }}>Reemplazar todo</Button>
        <Button onClick={async () => { await setDs(ensureRoot(pending.preview.ds, (pending.frag as Dataset).meta?.root)); onClose(); }}>Fusionar</Button>
      </div>
    </DialogContent></Dialog>
  );
}

