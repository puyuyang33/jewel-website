export interface MessagePositionTuple {
  sentAt: string;
  messageId: string;
}

const LOWEST_UUID = "00000000-0000-0000-0000-000000000000";

export function unreadMessagesAfterFilter(marker: {
  sentAt: string;
  messageId: string | null;
}): string {
  return `sent_at.gt.${marker.sentAt},and(sent_at.eq.${marker.sentAt},id.gt.${marker.messageId ?? LOWEST_UUID})`;
}

export function isMessagePositionNewer(
  candidate: MessagePositionTuple,
  current: MessagePositionTuple | null,
): boolean {
  if (!current) {
    return true;
  }
  const candidateTime = Date.parse(candidate.sentAt);
  const currentTime = Date.parse(current.sentAt);
  if (candidateTime !== currentTime) {
    return candidateTime > currentTime;
  }
  return candidate.messageId.localeCompare(current.messageId) > 0;
}
