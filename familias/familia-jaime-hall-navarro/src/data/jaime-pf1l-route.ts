import type { ParentLink, Person } from "@/lib/genealogy/types";

export const PF1L_ROUTE_UPDATE_ID = "jaime-pf1l-ancestors-v1";

export const PF1L_ROUTE_PERSONS: Person[] = [
  {
    id: "route-pf1l-ltb", fsId: "", name: "Cazonci Tangáxoan Tzíntzicha", altNames: [], sex: "M",
    birth: "D.+14800000..+00000000..", death: "D.+15300000..+00000000..", marriage: "", baptism: "", burial: "",
    notes: [], sources: [], originals: [],
  },
  {
    id: "route-pf1l-ccp", fsId: "", name: "Guatique Uacujane", altNames: [], sex: "F",
    birth: "D.+14900000..+00000000..", death: "", marriage: "", baptism: "", burial: "",
    notes: [], sources: [], originals: [],
  },
];

export const PF1L_ROUTE_LINKS: ParentLink[] = PF1L_ROUTE_PERSONS.map((parent) => ({
  child: "ancestor-1266",
  parent: parent.id,
  role: "",
  sources: [],
}));

