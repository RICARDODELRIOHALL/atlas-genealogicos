export type SourceId = string;
export interface OriginalRecord { source: SourceId; record: Record<string, unknown> }
export interface Person {
  id: string; fsId: string; name: string; altNames: string[]; sex: "" | "M" | "F";
  birth: string; death: string; marriage: string; baptism: string; burial: string;
  birthPlace?: string; deathPlace?: string; marriagePlace?: string;
  /** Enlaces a registros de nacimiento, bautismo, defunción o matrimonio. */
  recordLinks?: Partial<Record<"birth" | "baptism" | "death" | "marriage", string>>;
  notes: string[]; sources: SourceId[]; originals: OriginalRecord[];
  /** Estado documental: FamilySearch nunca equivale a verificación original */
  verification?: "familysearch" | "documento-original" | "transcripcion-visual";
}
export interface ParentLink { child: string; parent: string; role: "" | "padre" | "madre"; sources: SourceId[] }
export interface UnionRecord { a: string; b: string; marriage?: string; marriagePlace?: string; marriageVariants?: string[]; marriagePlaceVariants?: string[]; sources?: SourceId[]; [key: string]: unknown }
export interface SourceInfo { id: SourceId; file: string; kind: string; note: string }
export interface Issue { kind: string; msg: string; ids: string[]; severity: "info" | "revisión" | "grave" }
export interface Dataset {
  meta: { root: string; sources: SourceInfo[]; note?: string; missingCsv?: string; savedAt?: string; appliedUpdates?: string[] };
  persons: Person[]; links: ParentLink[]; pendingRefs: ParentLink[]; issues: Issue[]; unions?: UnionRecord[];
}
export interface Union { id: string; a: string; b: string; children: string[]; marriage: string; marriageVariants?: string[]; marriagePlace?: string; marriagePlaceVariants?: string[] }
export interface Derived {
  byId: Map<string, Person>;
  parents: Map<string, ParentLink[]>;
  children: Map<string, string[]>;
  unions: Union[];
  unionOf: Map<string, Union[]>;
  generation: Map<string, number[]>;
  branches: Map<string, string[]>;
  issues: Issue[];
}
