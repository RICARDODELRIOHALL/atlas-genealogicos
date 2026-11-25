import type { ParentLink, Person, UnionRecord } from "@/lib/genealogy/types";

export const LHWP_BRANCH_UPDATE_ID = "jaime-familysearch-lhwp-6yx-branch-v1";
const source = "FamilySearch, árbol colaborativo; ruta de parentesco consultada desde LHWP-6YX: https://www.familysearch.org/es/tree/person/details/LHWP-6YX";

const person = (fsId: string, name: string, sex: "M" | "F", birth = "", death = ""): Person => ({
  id: `lhwp-${fsId.toLowerCase()}`, fsId, name, altNames: [], sex, birth, death,
  marriage: "", baptism: "", burial: "", notes: [], sources: [source], originals: [], verification: "familysearch",
});

export const LHWP_BRANCH_PERSONS: Person[] = [
  person("LTW4-NDB", "Juan Perez de Ulloa y Carvajal", "M", "D.+14190000..+00000000..", "D.+15090000..+00000000.."),
  person("G2NF-5MN", "Marina Gutierrez de Caceres", "F"),
  person("LTW4-NXP", "Hernán Pérez de Ulloa Señor de Malgarrida", "M", "D.+13780000..+00000000..", "D.+14510000..+00000000.."),
  person("LTW4-DQL", "Gracia de Carvajal i Bejarano", "F", "D.+13780000..+00000000.."),
  person("G4B3-F7B", "Mencia González de Carvajal i Villalobos", "F", "D.+13390000..+00000000.."),
  person("G4F6-GMH", "Alvar García de Orellana Bejarano de la Sierra i de Carvajal la Nueva", "M", "D.+13220000..+00000000.."),
  person("LDK8-S61", "Sevilla López de Villalobos y de La Cerda", "F"),
  person("GZZF-FMY", "Diego González de Carvajal y Vargas II", "M"),
  person("GZZF-XMV", "Inés Alfonso de la Cerda", "F"),
  person("GLHW-168", "Fernando I Rodríguez de Villalobos Alfonso de Asturias", "M"),
  person("G9B2-JDN", "Alfonso de la Cerda", "M"),
  person("GD27-W4N", "Mathilde de Brienne", "F"),
  person("LTKH-4WK", "Blanche de France", "F", "D.+12530000..+00000000..", "D.+13230000..+00000000.."),
  person("G9TV-WP9", "Infante Fernando de Castilla", "M"),
  person("LHWP-6YX", "Louis IX, roi de France", "M", "D.+12140000..+00000000..", "D.+12700825..+00000000.."),
  person("L8WY-WSB", "Marguerite de Provence, reine de France", "F", "D.+12210000..+00000000..", "D.+12950000..+00000000.."),
];

// Each pair below is the visible parent couple for the next person in the route.
export const LHWP_BRANCH_PARENT_PAIRS: Array<{ childFsId: string; fatherFsId: string; motherFsId: string }> = [
  { childFsId: "G2NF-4XW", fatherFsId: "LTW4-NDB", motherFsId: "G2NF-5MN" },
  { childFsId: "LTW4-NDB", fatherFsId: "LTW4-NXP", motherFsId: "LTW4-DQL" },
  { childFsId: "LTW4-DQL", fatherFsId: "G4F6-GMH", motherFsId: "G4B3-F7B" },
  { childFsId: "G4B3-F7B", fatherFsId: "GZZF-FMY", motherFsId: "LDK8-S61" },
  { childFsId: "LDK8-S61", fatherFsId: "GLHW-168", motherFsId: "GZZF-XMV" },
  { childFsId: "GZZF-XMV", fatherFsId: "G9B2-JDN", motherFsId: "GD27-W4N" },
  { childFsId: "G9B2-JDN", fatherFsId: "G9TV-WP9", motherFsId: "LTKH-4WK" },
  { childFsId: "LTKH-4WK", fatherFsId: "LHWP-6YX", motherFsId: "L8WY-WSB" },
];

export const LHWP_BRANCH_LINKS: ParentLink[] = LHWP_BRANCH_PARENT_PAIRS.flatMap(({ childFsId, fatherFsId, motherFsId }) => [
  { child: `lhwp-${childFsId.toLowerCase()}`, parent: `lhwp-${fatherFsId.toLowerCase()}`, role: "padre", sources: [source] },
  { child: `lhwp-${childFsId.toLowerCase()}`, parent: `lhwp-${motherFsId.toLowerCase()}`, role: "madre", sources: [source] },
]);

export const LHWP_BRANCH_UNIONS: UnionRecord[] = LHWP_BRANCH_PARENT_PAIRS.map(({ childFsId, fatherFsId, motherFsId }) => ({
  a: `lhwp-${fatherFsId.toLowerCase()}`, b: `lhwp-${motherFsId.toLowerCase()}`,
  children: [`lhwp-${childFsId.toLowerCase()}`],
  marriage: childFsId === "LTKH-4WK" ? "D.+12340529..+00000000.." : "",
  marriagePlace: childFsId === "LTKH-4WK" ? "Sens, Burgundy, France (Kingdom of France)" : "",
  sources: [source],
}));

