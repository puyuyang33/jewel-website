import type { Quote, QuoteOption } from "@/types/domain";

export const ids = {
  quote: "00000000-0000-4000-8000-000000000001",
  request: "00000000-0000-4000-8000-000000000002",
  optionOne: "00000000-0000-4000-8000-000000000003",
  optionTwo: "00000000-0000-4000-8000-000000000004",
  commission: "00000000-0000-4000-8000-000000000005",
  messageOne: "00000000-0000-4000-8000-000000000006",
  messageTwo: "00000000-0000-4000-8000-000000000007",
  messageThree: "00000000-0000-4000-8000-000000000008",
  sender: "00000000-0000-4000-8000-000000000009",
  attachmentOne: "00000000-0000-4000-8000-000000000010",
  attachmentTwo: "00000000-0000-4000-8000-000000000011",
  draft: "00000000-0000-4000-8000-000000000012",
} as const;

export function makeQuote(): Quote {
  return {
    id: ids.quote,
    designRequestId: ids.request,
    version: 3,
    status: "sent",
    createdAt: "2026-09-01T12:00:00.000Z",
    expiresAt: "2026-09-15T12:00:00.000Z",
    terms: "A fifty percent deposit begins production.",
    options: [
      {
        id: ids.optionOne,
        title: "Sculpted solitaire",
        description: "Recycled gold with a bezel-set sapphire.",
        price: { amountMinor: 500_000, currency: "USD" },
        includedRevisionRounds: 2,
        estimatedCompletionDays: 56,
        lineItems: [
          {
            description: "Design and fabrication",
            amount: { amountMinor: 350_000, currency: "USD" },
          },
          {
            description: "Sapphire",
            amount: { amountMinor: 150_000, currency: "USD" },
          },
        ],
      },
      {
        id: ids.optionTwo,
        title: "Diamond variation",
        description: "Recycled gold with an antique-cut diamond.",
        price: { amountMinor: 650_000, currency: "USD" },
        includedRevisionRounds: 1,
        estimatedCompletionDays: 63,
        lineItems: [],
      },
    ],
  };
}

export function quoteOptionAt(quote: Quote, index: number): QuoteOption {
  const option = quote.options[index];
  if (option === undefined) {
    throw new RangeError(`Quote option ${index} does not exist`);
  }
  return option;
}
