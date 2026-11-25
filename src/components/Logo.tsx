/** A small sprout mark. public/favicon.svg is the same drawing. */
export function Logo({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden>
      <rect width="32" height="32" rx="9" fill="#2f5d46" />
      <path d="M16 25 V14" stroke="#f4efe3" strokeWidth="2.2" strokeLinecap="round" />
      <path d="M16 15 C 16 10, 12 7.5, 8 8 C 8 12, 11 15, 16 15 Z" fill="#a9c99a" />
      <path d="M16 13 C 16 8.5, 19.5 6, 24 6.5 C 24 10.5, 21 13, 16 13 Z" fill="#f4efe3" />
    </svg>
  );
}
