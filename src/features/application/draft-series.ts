import type { DraftRevisionDto } from "@/lib/data/types";

export function eligibleWorkingDraftRevisions(
  revisions: readonly DraftRevisionDto[],
): DraftRevisionDto[] {
  const latestByDraft = new Map<string, DraftRevisionDto>();
  for (const revision of revisions) {
    const current = latestByDraft.get(revision.draftId);
    if (!current || revision.revisionNumber > current.revisionNumber) {
      latestByDraft.set(revision.draftId, revision);
    }
  }
  return [...latestByDraft.values()].filter(
    (revision) =>
      revision.parentStatus === "working" &&
      revision.parentPublishedAt === null &&
      revision.status === "working" &&
      revision.publishedAt === null,
  );
}
