import { GoogleGenerativeAI } from "@google/generative-ai";
import { NextResponse } from "next/server";

const SYSTEM_PROMPT = `You are a business intelligence analyst observing data from a Philippine retail apparel chain called "Redbox Apparel".

Your job is to surface notable patterns, anomalies, and correlations as factual INSIGHTS — NOT advice or recommendations.

Rules:
- State observations only, never tell the user what to do
- Use ₱ for Philippine Peso currency (the data uses centavos — divide by 100 for pesos)
- Be concise — produce 6-8 bullet points maximum
- Group insights under these markdown headers: **Revenue**, **Inventory**, **Customer Behavior**, **Operations**
- Skip a section entirely if the data shows nothing noteworthy
- Flag significant period-over-period changes (>15%) explicitly with the percentage
- If data is sparse or zero, note that briefly rather than fabricating insights
- Use plain language, no jargon
- Do not repeat raw numbers — interpret what they mean`;

export async function POST(request: Request) {
  const apiKey = process.env.GOOGLE_AI_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "GOOGLE_AI_API_KEY is not configured. Set it in .env.local to enable AI insights." },
      { status: 503 }
    );
  }

  let snapshot: unknown;
  try {
    snapshot = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

  const userPrompt = `Here is the analytics data snapshot for the selected period:\n\n${JSON.stringify(snapshot, null, 2)}\n\nGenerate business insights based on this data.`;

  try {
    const result = await model.generateContentStream({
      contents: [
        { role: "user", parts: [{ text: SYSTEM_PROMPT + "\n\n" + userPrompt }] },
      ],
    });

    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        try {
          for await (const chunk of result.stream) {
            const text = chunk.text();
            if (text) {
              controller.enqueue(encoder.encode(text));
            }
          }
          controller.close();
        } catch (err) {
          controller.error(err);
        }
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Cache-Control": "no-cache",
      },
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "AI generation failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
