import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { GripVertical, Play, Sparkles } from 'lucide-react';
import { Flower } from './Flower';

interface Step {
  /** `data-tour` value of the element to highlight; none = a centred card. */
  target?: string;
  title: string;
  body: ReactNode;
}

const STEPS: Step[] = [
  {
    title: 'Welcome to studycal',
    body: (
      <>
        <p>Plan your study around your timetable: see when you’re actually free, fit your revision into those gaps, then get through it with a focus timer.</p>
        <p className="muted">Here’s a quick tour. It takes under a minute.</p>
      </>
    ),
  },
  {
    target: 'calendars',
    title: 'Bring in your timetable',
    body: (
      <p>
        Open <b>Calendars</b> to add your uni timetable or another calendar (an <code>.ics</code> file or link). Lectures show up in grey, and you
        can click any one to skip just that week.
      </p>
    ),
  },
  {
    target: 'tasks',
    title: 'Add what you need to study',
    body: (
      <>
        <p>
          Type a task here, e.g. “Anatomy, 10 hours” or “Past papers, 6 × 50 min”, and add a due date if it has one. Then <b>drag a task onto the
          calendar</b> to book a session.
        </p>
        <p className="muted">
          <GripVertical size={13} className="inline-icon" /> Drag the handle on a task to change its priority.
        </p>
      </>
    ),
  },
  {
    target: 'plan',
    title: 'Or let studycal plan it',
    body: (
      <p>
        <Sparkles size={13} className="inline-icon" /> <b>Plan my week</b> fills your free time around classes and meals, mixes your subjects
        and makes sure everything is done before it’s due. You’ll see a preview first.
      </p>
    ),
  },
  {
    target: 'calendar',
    title: 'Study, tick off, grow',
    body: (
      <>
        <p>
          Click a study session and choose <b>Start focus</b> (or press <Play size={11} className="inline-icon" fill="currentColor" /> on it) to
          start the timer. Tick it off when you’re done and a flower grows in this week’s garden.
        </p>
        <p className="muted">
          Click any empty time to add an event or reminder. You can sign in (top right) to sync between devices, and replay this tour from
          Settings.
        </p>
      </>
    ),
  },
];

const GAP = 12;
const PAD = 6;
const CARD_W = 340;

function placeCard(rect: DOMRect | null, card: { w: number; h: number }): { top: number; left: number } {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  if (!rect) return { top: Math.max(GAP, (vh - card.h) / 2), left: Math.max(GAP, (vw - card.w) / 2) };
  const clampX = (x: number) => Math.min(Math.max(GAP, x), vw - card.w - GAP);
  const clampY = (y: number) => Math.min(Math.max(GAP, y), vh - card.h - GAP);
  // Prefer below, then above, then beside (for tall targets like the calendar or task list).
  if (rect.bottom + PAD + GAP + card.h <= vh) return { top: rect.bottom + PAD + GAP, left: clampX(rect.left) };
  if (rect.top - PAD - GAP - card.h >= 0) return { top: rect.top - PAD - GAP - card.h, left: clampX(rect.left) };
  if (rect.right + PAD + GAP + card.w <= vw) return { top: clampY(rect.top), left: rect.right + PAD + GAP };
  if (rect.left - PAD - GAP - card.w >= 0) return { top: clampY(rect.top), left: rect.left - PAD - GAP - card.w };
  return { top: clampY(rect.top + rect.height / 2 - card.h / 2), left: clampX(rect.left + rect.width / 2 - card.w / 2) };
}

/** First-visit guided tour: dims the page, highlights one part at a time and explains it. */
export function Tour({ onDone }: { onDone(): void }) {
  const [index, setIndex] = useState(0);
  const [rect, setRect] = useState<DOMRect | null>(null);
  const [card, setCard] = useState({ w: CARD_W, h: 220 });
  const cardRef = useRef<HTMLDivElement>(null);
  const nextRef = useRef<HTMLButtonElement>(null);
  const step = STEPS[index];
  const last = index === STEPS.length - 1;

  // Find, scroll to and track the highlighted element.
  useLayoutEffect(() => {
    const el = step.target ? document.querySelector<HTMLElement>(`[data-tour="${step.target}"]`) : null;
    const visible = el && el.offsetParent !== null;
    if (!el || !visible) {
      setRect(null);
      return;
    }
    // On phones the card is a sheet along the bottom, so bring the target to the top where it stays visible.
    el.scrollIntoView({ block: window.innerWidth < 560 ? 'start' : 'nearest' });
    const update = () => setRect(el.getBoundingClientRect());
    update();
    window.addEventListener('resize', update);
    window.addEventListener('scroll', update, true);
    return () => {
      window.removeEventListener('resize', update);
      window.removeEventListener('scroll', update, true);
    };
  }, [step.target]);

  // Measure the card so it can be placed without running off screen.
  useLayoutEffect(() => {
    if (cardRef.current) setCard({ w: cardRef.current.offsetWidth, h: cardRef.current.offsetHeight });
  }, [index, rect]);

  useEffect(() => nextRef.current?.focus(), [index]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onDone();
      else if (e.key === 'ArrowRight') setIndex((i) => Math.min(i + 1, STEPS.length - 1));
      else if (e.key === 'ArrowLeft') setIndex((i) => Math.max(i - 1, 0));
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onDone]);

  const small = typeof window !== 'undefined' && window.innerWidth < 560;
  const pos = small ? null : placeCard(rect, card);
  // Phones: the card is a full-width sheet, on whichever half of the screen the highlight isn't.
  const sheetAtTop = small && rect !== null && rect.top + rect.height / 2 > window.innerHeight / 2;
  const cardClass = small ? (sheetAtTop ? 'tour-card sheet top' : 'tour-card sheet') : 'tour-card';

  return (
    <div className="tour" role="dialog" aria-modal="true" aria-labelledby="tour-title">
      {/* Blocks clicks on the page while the tour is open. */}
      <div className={rect ? 'tour-blocker' : 'tour-blocker dim'} />
      {rect && (
        <div
          className="tour-spotlight"
          style={{ top: rect.top - PAD, left: rect.left - PAD, width: rect.width + PAD * 2, height: rect.height + PAD * 2 }}
        />
      )}
      <div ref={cardRef} className={cardClass} style={pos ? { top: pos.top, left: pos.left } : undefined} key={index}>
        {index === 0 && (
          <svg className="tour-flower" viewBox="-30 -50 60 56" aria-hidden>
            <ellipse cx="0" cy="2" rx="18" ry="3.5" fill="#e3d8c0" />
            <Flower kind="daisy" color="#5b8c5a" growth={1} />
          </svg>
        )}
        <p className="tour-count">
          {index + 1} of {STEPS.length}
        </p>
        <h2 id="tour-title">{step.title}</h2>
        <div className="tour-body">{step.body}</div>
        <div className="tour-actions">
          <div className="tour-dots" aria-hidden>
            {STEPS.map((_, i) => (
              <span key={i} className={i === index ? 'on' : ''} />
            ))}
          </div>
          <span className="spacer" />
          {!last && (
            <button className="ghost" onClick={onDone}>
              Skip tour
            </button>
          )}
          {index > 0 && (
            <button className="ghost" onClick={() => setIndex(index - 1)}>
              Back
            </button>
          )}
          <button ref={nextRef} className="primary" onClick={() => (last ? onDone() : setIndex(index + 1))}>
            {last ? 'Get started' : 'Next'}
          </button>
        </div>
      </div>
    </div>
  );
}
