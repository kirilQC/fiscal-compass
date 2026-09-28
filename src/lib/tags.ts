import type { SupabaseClient } from "@supabase/supabase-js";
import { getPlanRows } from "./plan";
import { essentialPatterns, tagMemory, type Classifier } from "./spend";

// Everything spendClass needs: the plan's bill patterns and every tag Kiril has set by hand.
export async function loadClassifier(supabase: SupabaseClient, userId: string): Promise<Classifier> {
  const [planRows, { data: tagged }] = await Promise.all([
    getPlanRows(supabase, userId),
    supabase.from("transactions").select("merchant,spend_class,posted_on").eq("user_id", userId).not("spend_class", "is", null).limit(5000),
  ]);
  return { patterns: essentialPatterns(planRows), memory: tagMemory(tagged ?? []) };
}
