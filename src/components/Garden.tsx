import { useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useStore } from '../store';
import { buildGarden, startOfWeek } from '../lib/garden';
import { addDays, formatMinutes } from '../lib/time';
import { Flower, Sprout } from './Flower';

const W = 320;
const H = 132;
const ROW_Y = [96, 108, 120];
const ROW_SCALE = [1.08, 1.2, 1.32];
/** Crop the empty sky so the flowers fill the card. */
const TOP = 34;

function weekLabel(offset: number, start: Date): string {
  if (offset === 0) return 'This week';
  if (offset === -1) return 'Last week';
  if (offset === 1) return 'Next week';
  const end = addDays(start, 6);
  const fmt = (d: Date) => d.toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
  return `${fmt(start)} – ${fmt(end)}`;
}

/** A garden that grows a flower for every finished study session. It starts fresh each Monday. */
export function Garden() {
  const sessions = useStore((s) => s.sessions);
  const tasks = useStore((s) => s.tasks);
  const [offset, setOffset] = useState(0);
  const weekStartMs = addDays(startOfWeek(new Date()), offset * 7).getTime();
  const weekStart = new Date(weekStartMs);
  const garden = useMemo(() => buildGarden(sessions, tasks, new Date(weekStartMs)), [sessions, tasks, weekStartMs]);

  const plants = [...garden.plants].sort((a, b) => a.row - b.row);

  return (
    <section className="garden" aria-label="Weekly garden">
      <header className="garden-head">
        <div>
          <h2 className="garden-title">{weekLabel(offset, weekStart)}</h2>
          <p className="garden-sub">
            {garden.flowers === 0 && garden.sprouts === 0
              ? 'Finish a study session to plant your first flower'
              : `${formatMinutes(garden.minutesDone)} studied · ${garden.flowers} of ${garden.flowers + garden.sprouts} grown`}
          </p>
        </div>
        <div className="garden-nav">
          <button className="icon-btn" onClick={() => setOffset(offset - 1)} aria-label="Previous week">
            <ChevronLeft size={16} />
          </button>
          <button className="icon-btn" onClick={() => setOffset(offset + 1)} aria-label="Next week" disabled={offset >= 1}>
            <ChevronRight size={16} />
          </button>
        </div>
      </header>
      <svg className="garden-svg" viewBox={`0 ${TOP} ${W} ${H - TOP}`} role="img" aria-label={`${garden.flowers} flowers and ${garden.sprouts} sprouts`}>
        <path d={`M0 ${H} L0 92 C 60 84, 110 90, 160 88 C 215 86, 265 82, ${W} 90 L${W} ${H} Z`} fill="#e6dcc6" />
        <path d={`M0 ${H} L0 104 C 70 98, 140 104, 200 101 C 250 99, 290 100, ${W} 104 L${W} ${H} Z`} fill="#dccfb3" />
        {[30, 88, 150, 214, 276].map((x, i) => (
          <ellipse key={x} cx={x} cy={112 + (i % 2) * 9} rx="1.6" ry="1" fill="#c6b693" />
        ))}
        {plants.map((p) => (
          <g key={p.id} transform={`translate(${12 + p.x * (W - 24)} ${ROW_Y[p.row]}) scale(${ROW_SCALE[p.row]})`}>
            <g className="plant">
              {p.stage === 'bloom' ? <Flower kind={p.kind} color={p.color} growth={1} size={p.size} /> : <Sprout size={0.9} />}
            </g>
          </g>
        ))}
      </svg>
    </section>
  );
}
