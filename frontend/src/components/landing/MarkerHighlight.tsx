'use client';

import { useEffect, useRef, useState } from 'react';

// The one animated moment in the app (docs/studysheet-build-prompt.md §9):
// a highlighter stroke sweeps left-to-right once, when the section holding
// it scrolls into view. Respects prefers-reduced-motion via a CSS media
// query (globals.css) that shows the final highlighted state with no
// animation at all, rather than trying to skip the animation in JS.
export function MarkerHighlight({
  children,
  kind,
}: {
  children: React.ReactNode;
  kind: 'definition' | 'exam-critical';
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const [revealed, setRevealed] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) {
          setRevealed(true);
          observer.disconnect();
        }
      },
      { threshold: 0.4 },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <span className={`marker-highlight marker-${kind} ${revealed ? 'marker-revealed' : ''}`} ref={ref}>
      {children}
    </span>
  );
}
