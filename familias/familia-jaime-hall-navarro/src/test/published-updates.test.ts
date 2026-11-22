import { describe, expect, it } from "vitest";
import type { Dataset, Person } from "@/lib/genealogy/types";
import { applyPublishedUpdates, PUBLISHED_UPDATE_ID } from "@/lib/genealogy/store";

const person = (id: string, name: string): Person => ({
  id, fsId: "", name, altNames: [], sex: "", birth: "", death: "", marriage: "", baptism: "", burial: "",
  notes: [], sources: [], originals: [],
});

describe("published additive route updates", () => {
  it("adds missing ancestors to an existing local database and applies the update once", async () => {
    const erendira = person("ancestor-1266", "Eréndira Ikikunari");
    const current = {
      meta: { root: "root", sources: [], generationAudit: { totalPersons: 10, includedPersons: 10, directAncestorsExcludingRoot: 9, ancestorsIncludingRoot: 10, totalRelationships: 8, includedRelationships: 8, includedParentLinkRecords: 8 } },
      persons: [person("root", "Jaime"), erendira],
      links: [], pendingRefs: [], issues: [],
    } as unknown as Dataset;

    const updated = await applyPublishedUpdates(current);
    expect(updated.persons.map((p) => p.id)).toContain("route-pf1l-ltb");
    expect(updated.persons.map((p) => p.id)).toContain("route-pf1l-ccp");
    expect(updated.links).toHaveLength(2);
    expect(updated.meta.appliedUpdates).toContain(PUBLISHED_UPDATE_ID);
    expect((updated.meta as unknown as { generationAudit: { totalPersons: number; totalRelationships: number } }).generationAudit).toMatchObject({ totalPersons: 12, totalRelationships: 10 });
    expect(await applyPublishedUpdates(updated)).toBe(updated);
  });
});

