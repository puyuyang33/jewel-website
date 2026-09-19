import { z } from "zod";

import { limits } from "@/config/limits";
import {
  MESSAGE_SENDER_ROLES,
  type MessageCursor,
  type MessagePosition,
} from "@/types/domain";

import { DomainError } from "./errors";
import {
  entityIdSchema,
  isoInstantSchema,
  normalizeInstant,
} from "./validation";

export const messageTextSchema = z
  .string()
  .max(limits.messageTextCharacters)
  .transform((value) => value.trim());

export const messageInputSchema = z
  .object({
    text: messageTextSchema.default(""),
    attachmentIds: z
      .array(entityIdSchema)
      .max(limits.imagesPerMessage)
      .default([]),
  })
  .strict()
  .superRefine((message, context) => {
    if (message.text.length === 0 && message.attachmentIds.length === 0) {
      context.addIssue({
        code: "custom",
        message: "A message must contain text or an attachment",
      });
    }
    if (new Set(message.attachmentIds).size !== message.attachmentIds.length) {
      context.addIssue({
        code: "custom",
        message: "Message attachment IDs must be unique",
        path: ["attachmentIds"],
      });
    }
  });

export const messageRecordSchema = z
  .object({
    id: entityIdSchema,
    commissionId: entityIdSchema,
    senderId: entityIdSchema.nullable(),
    senderRole: z.enum(MESSAGE_SENDER_ROLES),
    text: messageTextSchema,
    attachmentIds: z.array(entityIdSchema).max(limits.imagesPerMessage),
    createdAt: isoInstantSchema,
  })
  .strict()
  .superRefine((message, context) => {
    if (message.text.length === 0 && message.attachmentIds.length === 0) {
      context.addIssue({
        code: "custom",
        message: "A message must contain text or an attachment",
      });
    }
    if (new Set(message.attachmentIds).size !== message.attachmentIds.length) {
      context.addIssue({
        code: "custom",
        message: "Message attachment IDs must be unique",
        path: ["attachmentIds"],
      });
    }
    const validSender =
      (message.senderRole === "system" && message.senderId === null) ||
      (message.senderRole !== "system" && message.senderId !== null);
    if (!validSender) {
      context.addIssue({
        code: "custom",
        message: "System messages must not have a sender; user messages must",
        path: ["senderId"],
      });
    }
  });

export const messageCursorSchema = z
  .object({
    createdAt: isoInstantSchema,
    id: entityIdSchema,
  })
  .strict()
  .transform((cursor): MessageCursor =>
    Object.freeze({
      createdAt: normalizeInstant(cursor.createdAt),
      id: cursor.id.toLowerCase(),
    }),
  );

function parseMessagePosition(value: MessagePosition): MessageCursor {
  return messageCursorSchema.parse(value);
}

export function compareMessagePositionsNewestFirst(
  leftValue: MessagePosition,
  rightValue: MessagePosition,
): number {
  const left = parseMessagePosition(leftValue);
  const right = parseMessagePosition(rightValue);
  const leftTime = Date.parse(left.createdAt);
  const rightTime = Date.parse(right.createdAt);

  if (leftTime !== rightTime) {
    return leftTime > rightTime ? -1 : 1;
  }
  if (left.id === right.id) {
    return 0;
  }
  return left.id > right.id ? -1 : 1;
}

export function sortMessagePositionsNewestFirst(
  values: readonly MessagePosition[],
): readonly MessageCursor[] {
  const parsed = values.map(parseMessagePosition);
  parsed.sort(compareMessagePositionsNewestFirst);
  return Object.freeze(parsed);
}

export function createMessageCursor(position: MessagePosition): MessageCursor {
  return parseMessagePosition(position);
}

export function isMessageOlderThanCursor(
  message: MessagePosition,
  cursor: MessageCursor,
): boolean {
  return compareMessagePositionsNewestFirst(message, cursor) > 0;
}

export function encodeMessageCursor(cursorValue: MessageCursor): string {
  const cursor = messageCursorSchema.parse(cursorValue);
  return `${encodeURIComponent(cursor.createdAt)}~${encodeURIComponent(cursor.id)}`;
}

export function decodeMessageCursor(value: string): MessageCursor {
  const parts = value.split("~");
  if (parts.length !== 2) {
    throw new DomainError(
      "INVALID_MESSAGE_CURSOR",
      "Message cursor is malformed",
    );
  }

  const encodedCreatedAt = parts[0];
  const encodedId = parts[1];
  if (encodedCreatedAt === undefined || encodedId === undefined) {
    throw new DomainError(
      "INVALID_MESSAGE_CURSOR",
      "Message cursor is malformed",
    );
  }

  try {
    return messageCursorSchema.parse({
      createdAt: decodeURIComponent(encodedCreatedAt),
      id: decodeURIComponent(encodedId),
    });
  } catch (error: unknown) {
    throw new DomainError(
      "INVALID_MESSAGE_CURSOR",
      "Message cursor is invalid",
      { cause: error },
    );
  }
}
