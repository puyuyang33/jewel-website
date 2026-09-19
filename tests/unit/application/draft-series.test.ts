import { describe, expect, it } from "vitest";

import { eligibleWorkingDraftRevisions } from "@/features/application/draft-series";
import type { DraftRevisionDto } from "@/lib/data/types";

function revision(
  overrides: Partial<DraftRevisionDto> &
    Pick<DraftRevisionDto, "id" | "draftId">,
): DraftRevisionDto {
  const { id, draftId, ...rest } = overrides;
  return {
    id,
    draftId,
    draftSequence: 1,
    revisionNumber: 1,
    parentStatus: "working",
    parentPublishedAt: null,
    stage: "concept",
    title: "Orbit ring",
    status: "working",
    summary: "Working concept",
    specifications: {},
    customerMessage: null,
    publishedAt: null,
    assets: [],
    feedback: [],
    ...rest,
  };
}

describe("eligible working draft series", () => {
  it("selects only the latest working unpublished revision per working parent", () => {
    const eligible = eligibleWorkingDraftRevisions([
      revision({
        id: "10000000-0000-4000-8000-000000000001",
        draftId: "10000000-0000-4000-8000-000000000011",
        revisionNumber: 1,
      }),
      revision({
        id: "10000000-0000-4000-8000-000000000002",
        draftId: "10000000-0000-4000-8000-000000000011",
        revisionNumber: 2,
      }),
    ]);

    expect(eligible.map((item) => item.id)).toEqual([
      "10000000-0000-4000-8000-000000000002",
    ]);
  });

  it("keeps shared, superseded, and published series out of the mutable selector", () => {
    const eligible = eligibleWorkingDraftRevisions([
      revision({
        id: "10000000-0000-4000-8000-000000000021",
        draftId: "10000000-0000-4000-8000-000000000031",
        parentStatus: "shared",
      }),
      revision({
        id: "10000000-0000-4000-8000-000000000022",
        draftId: "10000000-0000-4000-8000-000000000032",
        status: "superseded",
      }),
      revision({
        id: "10000000-0000-4000-8000-000000000023",
        draftId: "10000000-0000-4000-8000-000000000033",
        publishedAt: "2026-09-17T12:00:00.000Z",
      }),
    ]);

    expect(eligible).toEqual([]);
  });
});
