// ical.js 1.x ships without TypeScript types. Only the parts we call are used, via `any`.
declare module 'ical.js' {
  const ICAL: any;
  export default ICAL;
}
