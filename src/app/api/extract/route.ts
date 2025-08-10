import { NextRequest, NextResponse } from "next/server";
// Ensure Node globals like Buffer are available for typing
import { groq } from "@ai-sdk/groq";
import { generateObject } from "ai";
import { z } from "zod";

export const runtime = "nodejs";

const OCR_PROMPT = `You are a precise OCR parser for hawker stall menus in Singapore.
Return JSON with this exact shape: {"items":[{"name":string,"price":number}]}.
Rules:
- Extract full dish names with key qualifiers (e.g. protein, style, sauce, size) to improve calorie accuracy.
- Example: prefer "grilled chicken rice (large)" over "chicken rice" if visible.
- Exclude blanks, unknown placeholders, and items without names.
- Prices must be numbers in SGD (e.g. 3.5). If price is shown as market price/MP or unclear, set price to null or skip the item.
- Ignore phone numbers, addresses, unit prices, QR codes, and promotions.
Do not add explanations or code fences.`;

// Relaxed schema for model output so generation doesn't fail on empty strings
// or market-price entries. We will clean and validate after generation.
const RawItemsSchema = z.object({
  items: z
    .array(
      z.object({
        name: z.string().transform((s: string) => s.trim()),
        price: z.union([z.number().min(0).finite(), z.null()]),
      })
    )
    .default([]),
});

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  const len = bytes.byteLength;
  for (let i = 0; i < len; i += 1) {
    binary += String.fromCharCode(bytes[i]);
  }
  // btoa is available in Edge runtime; fallback to Buffer if present
  if (typeof btoa === "function") {
    return btoa(binary);
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const NodeBuffer = (globalThis as any).Buffer;
  if (NodeBuffer) {
    return NodeBuffer.from(buffer).toString("base64");
  }
  throw new Error("Base64 encoding not supported in this environment");
}

export async function POST(req: NextRequest) {
  try {
    const contentType = req.headers.get("content-type") || "";
    if (!contentType.includes("multipart/form-data")) {
      return NextResponse.json(
        { error: "Expected multipart/form-data with an 'image' field" },
        { status: 400 }
      );
    }

    const form = await req.formData();
    const imageFile = form.get("image");

    if (!imageFile || !(imageFile instanceof File)) {
      return NextResponse.json(
        { error: "Missing image file under field 'image'" },
        { status: 400 }
      );
    }

    const arrayBuffer = await imageFile.arrayBuffer();
    const base64 = arrayBufferToBase64(arrayBuffer);
    // Normalise and guard accepted mime types
    const rawType = (imageFile as File).type || "";
    const mimeType =
      rawType === "image/jpg" ? "image/jpeg" : rawType || "image/jpeg";
    const allowed = new Set(["image/png", "image/jpeg"]);
    if (!allowed.has(mimeType)) {
      return NextResponse.json(
        { error: "Unsupported file type. Please upload a PNG or JPEG image." },
        { status: 400 }
      );
    }
    // Groq JSON mode with base64 data URLs recommends keeping payloads small.
    // Enforce ~4MB request limit for base64 images (per Groq docs).
    const approxBytes = arrayBuffer.byteLength;
    const fourMB = 4 * 1024 * 1024;
    if (approxBytes > fourMB) {
      return NextResponse.json(
        {
          error:
            "Image too large (> 4MB). Please upload a smaller photo or try again.",
        },
        { status: 413 }
      );
    }

    const imageDataUrl = `data:${mimeType};base64,${base64}`;

    const modelName =
      process.env.GROQ_VISION_MODEL ||
      "meta-llama/llama-4-scout-17b-16e-instruct";

    const result = await generateObject({
      model: groq(modelName),
      schema: RawItemsSchema,
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: OCR_PROMPT },
            { type: "image", image: imageDataUrl },
          ],
        },
      ],
      temperature: 0,
    });

    const cleaned = (result.object.items || [])
      .map((it: { name: string; price: number | null }) => ({
        name: it.name.trim(),
        price: it.price as number | null,
      }))
      .filter(
        (it: { name: string; price: number | null }) =>
          it.name.length > 0 &&
          typeof it.price === "number" &&
          Number.isFinite(it.price) &&
          (it.price as number) >= 0
      );

    return NextResponse.json({ items: cleaned });
  } catch (error: unknown) {
    console.error("/api/extract error", error);
    const isProd = process.env.NODE_ENV === "production";
    const err = error as {
      message?: string;
      statusCode?: number;
      url?: string;
      responseBody?: unknown;
    };
    const details = isProd
      ? undefined
      : {
          message: String(err?.message || ""),
          statusCode: err?.statusCode,
          url: err?.url,
          responseBody: err?.responseBody,
        };
    return NextResponse.json(
      { error: "Unexpected server error", details },
      { status: 500 }
    );
  }
}
