import type { FlowerKind } from '../lib/garden';
import { tint } from '../lib/color';

const STEM = '#5f7f57';
const LEAF = '#7c9e6c';
const LEAF_DARK = '#6a8c5c';

function Leaf({ y, side, scale = 1 }: { y: number; side: 1 | -1; scale?: number }) {
  return (
    <path
      d="M0 0 C 4 -6, 12 -7, 15 -2 C 10 1, 4 2, 0 0 Z"
      transform={`translate(0 ${y}) scale(${side * scale} ${scale})`}
      fill={side === 1 ? LEAF : LEAF_DARK}
    />
  );
}

function Head({ kind, color, open }: { kind: FlowerKind; color: string; open: number }) {
  const light = tint(color, 0.75);
  if (kind === 'tulip') {
    return (
      <g transform={`scale(${0.6 + open * 0.4})`}>
        <path d="M-7 -1 C -9 -10, -6 -16, -3 -17 L 0 -11 L 3 -17 C 6 -16, 9 -10, 7 -1 C 3 2, -3 2, -7 -1 Z" fill={color} />
        <path d="M-3 -17 L 0 -11 L 3 -17 C 1 -12, -1 -12, -3 -17 Z" fill={light} opacity="0.7" />
      </g>
    );
  }
  if (kind === 'bell') {
    return (
      <g transform={`scale(${0.6 + open * 0.4})`}>
        <path d="M0 -4 C -8 -4, -9 4, -8 9 C -5 7, -3 9, 0 7 C 3 9, 5 7, 8 9 C 9 4, 8 -4, 0 -4 Z" fill={color} />
        <circle cx="0" cy="9" r="1.4" fill={tint(color, 0.35)} />
      </g>
    );
  }
  if (kind === 'poppy') {
    const petals = [0, 72, 144, 216, 288];
    return (
      <g transform={`scale(${0.55 + open * 0.45})`}>
        {petals.map((a) => (
          <circle key={a} cx={Math.cos((a * Math.PI) / 180) * 4.6} cy={Math.sin((a * Math.PI) / 180) * 4.6} r="5.4" fill={color} />
        ))}
        <circle r="3.6" fill={light} opacity="0.55" />
        <circle r="2.2" fill="#3d3a33" />
      </g>
    );
  }
  // daisy
  const petals = [0, 45, 90, 135, 180, 225, 270, 315];
  return (
    <g transform={`scale(${0.55 + open * 0.45})`}>
      {petals.map((a) => (
        <ellipse key={a} cx="0" cy="-6.2" rx="2.9" ry="5.6" fill={color} transform={`rotate(${a})`} />
      ))}
      <circle r="3.6" fill="#e8b84b" />
      <circle r="3.6" fill="none" stroke="#c99a35" strokeWidth="0.8" />
    </g>
  );
}

interface Props {
  kind: FlowerKind;
  color: string;
  /** 0 = seedling, 1 = full bloom. */
  growth: number;
  /** Height multiplier. */
  size?: number;
}

/** A flower drawn with its base at (0,0), growing upwards. */
export function Flower({ kind, color, growth, size = 1 }: Props) {
  const g = Math.max(0, Math.min(1, growth));
  const height = (8 + 30 * Math.min(1, g / 0.7)) * size;
  const bend = kind === 'bell' ? 5 : 2;
  const top = { x: kind === 'bell' ? bend * 1.4 : 0, y: -height };
  return (
    <g>
      <path
        d={`M0 0 Q ${bend} ${-height / 2} ${top.x} ${top.y}`}
        stroke={STEM}
        strokeWidth={1.8 * Math.max(0.8, size)}
        fill="none"
        strokeLinecap="round"
      />
      <Leaf y={-Math.min(6, height * 0.25)} side={1} scale={0.55 + 0.45 * Math.min(1, g * 2) * size} />
      {g > 0.25 && <Leaf y={-height * 0.48} side={-1} scale={(0.5 + 0.3 * g) * size} />}
      {g >= 0.7 && (
        <g transform={`translate(${top.x} ${top.y}) scale(${size})`}>
          <Head kind={kind} color={color} open={(g - 0.7) / 0.3} />
        </g>
      )}
      {g > 0.45 && g < 0.7 && <circle cx={top.x} cy={top.y} r={2.4 * size} fill={tint(color, 0.6)} stroke={STEM} strokeWidth="0.8" />}
    </g>
  );
}

/** A small sprout for planned-but-not-done sessions. */
export function Sprout({ size = 1 }: { size?: number }) {
  return (
    <g transform={`scale(${size})`}>
      <path d="M0 0 L0 -9" stroke={STEM} strokeWidth="1.6" strokeLinecap="round" />
      <path d="M0 -8 C -2 -12, -7 -12, -8 -9 C -5 -7, -2 -7, 0 -8 Z" fill={LEAF} />
      <path d="M0 -9 C 2 -13, 7 -13, 8 -10 C 5 -8, 2 -8, 0 -9 Z" fill={LEAF_DARK} />
    </g>
  );
}
