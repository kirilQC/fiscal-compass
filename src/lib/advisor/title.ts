import { openai } from "../advisor";

// Conversation titles are a short summary of what the conversation is about, written by a small fast model
// after the first exchange, never the question word for word.

export async function summarizeTitle(question: string, reply: string): Promise<string | null> {
  const ai = openai();
  if (!ai) return null;
  try {
    const res = await ai.responses.create({
      model: process.env.ADVISOR_TITLE_MODEL || "gpt-5.4-mini",
      reasoning: { effort: "low" },
      instructions: "Write a title of 2 to 5 words that summarizes what this personal-finance conversation is about, like a notes app would: 'Net worth check', 'August spending breakdown', 'Uber and Lime trend', 'Wedding venue payments'. Sentence case. No quotes, no punctuation at the end, no dashes, no emojis. Reply with the title only.",
      input: `Kiril asked: ${question.slice(0, 600)}\n\nSterling answered: ${reply.replace(/```chart[\s\S]*?```/g, "").slice(0, 900)}`,
    });
    const t = (res.output_text ?? "").replace(/["“”]/g, "").replace(/[–—]/g, " ").replace(/[.!?]+$/, "").replace(/\s+/g, " ").trim();
    return t && t.length <= 60 ? t : null;
  } catch {
    return null;
  }
}
