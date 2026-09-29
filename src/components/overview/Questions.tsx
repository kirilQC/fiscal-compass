import type { Question } from "@/lib/advisor/questions";
import { QuestionCards } from "@/components/QuestionCards";
import s from "./Flags.module.css";

// Sterling's questions for Kiril, right under what he flagged: short answers that make the numbers truer.
export function Questions({ questions }: { questions: Question[] }) {
  if (!questions.length) return null;
  return (
    <section className={s.wrap} aria-labelledby="questions-title">
      <div className={s.head}>
        <div>
          <h2 id="questions-title" className={s.title}>Sterling has a few questions</h2>
          <p className={s.sub}>answer right here · a line or two makes the numbers, and his advice, more accurate · he remembers what you tell him</p>
        </div>
      </div>
      <QuestionCards questions={questions} />
    </section>
  );
}
