import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

export const runtime = "edge";

const ItemsSchema = z.object({
  items: z
    .array(
      z.object({
        name: z.string(),
        price: z.number().min(0).finite(),
      })
    )
    .min(1, "At least one item is required"),
});

type Item = z.infer<typeof ItemsSchema>["items"][number];

function canonicaliseName(name: string): string {
  const lower = name.toLowerCase();
  return lower
    .replace(/\bmee\b/g, "noodle")
    .replace(/\bnasi\b/g, "rice")
    .replace(/\bbee hoon\b/g, "rice vermicelli")
    .replace(/\s+/g, " ")
    .trim();
}

function estimateCalories(name: string): [number, number] {
  const n = canonicaliseName(name);
  // Very rough ranges for common SG hawker dishes
  if (/(chicken\s+rice|hainanese\s+chicken)/.test(n)) return [550, 700];
  if (/(fish\s*soup)/.test(n)) return [250, 380];
  if (/(yong\s*tau\s*foo)/.test(n)) return [300, 500];
  if (/(ban\s*mian|noodle\s*soup)/.test(n)) return [450, 650];
  if (/(laksa)/.test(n)) return [600, 900];
  if (/(char\s*kway\s*teow)/.test(n)) return [740, 950];
  if (/(economic\s*rice|mixed\s*veg)/.test(n)) return [500, 800];
  if (/(fishball\s*noodle)/.test(n)) return [400, 600];
  if (/(duck\s*rice)/.test(n)) return [600, 800];
  return [350, 700];
}

function isFilling(calories: [number, number]): boolean {
  return calories[0] >= 450; // crude heuristic: meals >= 450 kcal lower bound
}

export async function POST(req: NextRequest) {
  try {
    const json = await req.json();
    const parsed = ItemsSchema.safeParse(json);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid payload", issues: parsed.error.issues },
        { status: 400 }
      );
    }

    const items = parsed.data.items.map((it) => ({
      name: canonicaliseName(it.name),
      price: it.price,
      calories: estimateCalories(it.name),
    }));

    let cheapest: Array<Item & { calories: [number, number] }> = [];
    let mostExpensive: Array<Item & { calories: [number, number] }> = [];
    let healthiest: (Item & { calories: [number, number] }) | null = null;
    let mostFilling: (Item & { calories: [number, number] }) | null = null;

    // Ties for cheapest/most expensive should list all
    let minPrice = Infinity;
    let maxPrice = -Infinity;

    for (const item of items) {
      if (item.price < minPrice) {
        minPrice = item.price;
      }
      if (item.price > maxPrice) {
        maxPrice = item.price;
      }
      if (!healthiest || item.calories[1] < healthiest.calories[1]) {
        healthiest = item;
      }
      if (!mostFilling || item.calories[1] > mostFilling.calories[1]) {
        mostFilling = item;
      }
    }

    cheapest = items.filter((it) => it.price === minPrice);
    mostExpensive = items.filter((it) => it.price === maxPrice);

    const response = {
      cheapest: cheapest.map((c) => ({
        name: c.name,
        price: c.price,
        calories: c.calories,
      })),
      most_expensive: mostExpensive.map((m) => ({
        name: m.name,
        price: m.price,
        calories: m.calories,
      })),
      healthiest: healthiest
        ? {
            name: healthiest.name,
            price: healthiest.price,
            calories: healthiest.calories,
          }
        : null,
      most_filling: mostFilling
        ? {
            name: mostFilling.name,
            price: mostFilling.price,
            calories: mostFilling.calories,
          }
        : null,
      follow_up_questions: [
        "Show me the cheapest and most expensive again.",
        "Which options are vegetarian?",
        "How can I make the healthiest option more filling?",
      ],
    };

    return NextResponse.json(response);
  } catch (error: unknown) {
    console.error("/api/analyse error", error);
    return NextResponse.json(
      { error: "Unexpected server error" },
      { status: 500 }
    );
  }
}
