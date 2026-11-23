import { describe, expect, it } from "vitest";
import type { Dataset, Person } from "@/lib/genealogy/types";
import { applyPublishedUpdates, HALL_ROUTES_UPDATE_ID, PUBLISHED_UPDATE_ID } from "@/lib/genealogy/store";

const person = (id: string, name: string): Person => ({
  id, fsId: "", name, altNames: [], sex: "", birth: "", death: "", marriage: "", baptism: "", burial: "",
  notes: [], sources: [], originals: [],
});

describe("published additive route updates", () => {
  it("migrates the two Hall-to-Henry-III routes into an already-open Atlas", async () => {
    const mod = await import("@/data/atlas.json");
    const older = structuredClone((mod.default ?? mod) as unknown as Dataset);
    older.persons = older.persons.filter((person) => !person.id.startsWith("hallroute-"));
    older.links = older.links.filter((link) => !link.child.startsWith("hallroute-") && !link.parent.startsWith("hallroute-"));
    older.unions = (older.unions ?? []).filter((union) => !String(union["id"]).startsWith("hallroute-union-"));
    older.meta.appliedUpdates = (older.meta.appliedUpdates ?? []).filter((id) => id !== HALL_ROUTES_UPDATE_ID);

    const migrated = await applyPublishedUpdates(older);
    expect(migrated.persons.map((p) => p.id)).toContain("hallroute-9ss7-5bt");
    expect(migrated.persons.map((p) => p.id)).toContain("hallroute-9hd3-mc1");
    expect(migrated.links).toContainEqual(expect.objectContaining({ child: "hallroute-lywx-cbr", parent: "hallroute-9ss7-5bt" }));
    expect(migrated.meta.appliedUpdates).toContain(HALL_ROUTES_UPDATE_ID);
    expect(await applyPublishedUpdates(migrated)).toBe(migrated);
  });

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
