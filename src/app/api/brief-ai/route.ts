import { NextResponse } from "next/server";
import { getDashboard } from "@/lib/data";
import { generateBrief, suggestedPrompts } from "@/lib/advisor";

export async function GET() {
  const d = await getDashboard();
  const brief = await generateBrief(d);
  return NextResponse.json({ asOf: d.asOf, brief, prompts: suggestedPrompts(d) });
}
