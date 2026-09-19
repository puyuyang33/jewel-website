export function createMessageRpcCommand(input: {
  conversationId: string;
  clientMessageId: string;
  body: string;
  attachmentIds: string[];
}) {
  return {
    name: "send_message" as const,
    args: {
      p_conversation_id: input.conversationId,
      p_client_message_id: input.clientMessageId,
      p_body: input.body,
      p_attachment_ids: input.attachmentIds,
    },
  };
}
