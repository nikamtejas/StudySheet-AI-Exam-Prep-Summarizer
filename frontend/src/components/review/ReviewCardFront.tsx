import { parseCloze } from '@/lib/cloze';
import type { CardDTO } from '@/contracts';

// Cloze cards get their blank rendered specially; every other kind just
// shows `front` as-is (its own question/term/problem statement).
export function ReviewCardFront({ card, revealed }: { card: CardDTO; revealed: boolean }) {
  if (card.kind !== 'cloze') {
    return <p className="text-lg">{card.front}</p>;
  }

  const parsed = parseCloze(card.front);
  if (!parsed) return <p className="text-lg">{card.front}</p>;

  return (
    <p className="text-lg">
      {parsed.before}
      {revealed ? (
        <span className="text-teal font-semibold">{parsed.answer}</span>
      ) : (
        <span className="border-muted border-b-2 px-1" aria-label="hidden">
          &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;
        </span>
      )}
      {parsed.after}
    </p>
  );
}
