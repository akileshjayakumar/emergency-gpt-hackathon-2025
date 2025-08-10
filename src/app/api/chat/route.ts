import { NextRequest, NextResponse } from "next/server";
import { groq } from "@ai-sdk/groq";
import { streamText } from "ai";
import { z } from "zod";

export const runtime = "nodejs";

const ChatSchema = z.object({
  messages: z
    .array(
      z.object({
        role: z.enum(["system", "user", "assistant"]),
        content: z.string().min(1),
      })
    )
    .min(1),
  context: z
    .object({
      items: z
        .array(z.object({ name: z.string(), price: z.number() }))
        .optional(),
      conversationId: z.string().optional(),
    })
    .optional(),
});

export async function POST(req: NextRequest) {
  try {
    const json = await req.json();
    const parsed = ChatSchema.safeParse(json);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid payload", issues: parsed.error.issues },
        { status: 400 }
      );
    }

    const modelId = "openai/gpt-oss-20b"; // GPT OSS 20B on Groq

    const systemPrompt = [
      "You are a helpful nutrition and food assistant specialising in Singapore hawker centre food.",
      "You know common dish names, typical prices in SGD, healthier swaps, and rough calorie ranges.",
      "Always assume prices are in SGD and format as $ X.XX. Be concise and practical.",
      "You have NO tools or functions available. Never attempt tool calls or function calls. Respond only with plain text.",
      parsed.data.context?.items
        ? `Use these extracted menu items as context: ${JSON.stringify(
            parsed.data.context.items
          )}`
        : undefined,
    ]
      .filter(Boolean)
      .join("\n");

    const result = await streamText({
      model: groq(modelId),
      messages: [
        { role: "system", content: systemPrompt },
        ...parsed.data.messages,
      ],
      tools: [],
      providerOptions: {
        groq: {
          structuredOutputs: false,
          // Explicitly disable tool calls to avoid invalid tool JSON errors
          tool_choice: "none",
        },
      },
    });

    return result.toTextStreamResponse();
  } catch (error: unknown) {
    console.error("/api/chat error", error);
    const e = error as {
      message?: string;
      statusCode?: number;
      responseBody?: unknown;
    };
    return NextResponse.json(
      {
        error: "Unexpected server error",
        details: process.env.NODE_ENV === "production" ? undefined : e,
      },
      { status: 500 }
    );
  }
}
