# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev                                   # Vite dev server, http://localhost:5173
npm test                                      # all unit tests (Vitest)
npx vitest run src/lib/scheduler.test.ts      # one test file
npx vitest run -t "keeps lunch free"          # tests matching a name
npm run typecheck                             # tsc -p . (TypeScript 7, noEmit)
npm run build && npm run preview              # production build, served on :4173
```

There is no linter. The local global npm (10.9.2) crashes resolving Vitest 5's optional peers (`Cannot read properties of null (reading 'edgesOut')`); use `npx -y npm@11 install …` locally. CI uses Node 24 (npm 11). FullCalendar packages are pinned to exactly `6.1.22` and must stay in lockstep (v7 restructured them). `ical.js` is pinned to 1.x and has no types (`src/ical.d.ts`).

Deployment: static site. `.gitlab-ci.yml` (GitLab Pages, moves `dist` → `public`) and `.github/workflows/deploy.yml` (GitHub Pages) both run typecheck + tests before building. `vite.config.ts` uses `base: './'` so the build works under any sub-path; keep asset references relative and don't add client-side routes without revisiting this.

## Architecture

Client-only React app. All state lives in one zustand store (`src/store.ts`) persisted to localStorage key `studycal`. Persisted: `tasks`, `sessions`, `events`, `calendars`, `settings`. In-memory only: `proposal` (unaccepted planner output), `timer`, `toasts`. The persist `merge` fills new fields (`events`, every key of `DEFAULT_SETTINGS`), so new settings must get a default there rather than bumping `version` (a version bump without `migrate` discards saved data).

Data model (`src/types.ts`):
- **Task** stores `targetMinutes` + `sessionMinutes` in both plan modes. `planMode` only decides whether progress counts sessions or minutes. `src/lib/progress.ts` is the single source of progress and "fully scheduled".
- **Session** is a study block for a task.
- **CalEvent** is a user-created event or reminder (click on empty calendar time). It counts as busy time for the planner.
- **ImportedCalendar** stores raw `.ics` text plus `hidden` (occurrence keys `uid|recurrence-id`) and `hiddenSeries` (UIDs). Occurrences are expanded on demand for the visible range by `expandCalendars` in `src/lib/ics.ts`, which applies the hides and caches parses per calendar id + text. They are never persisted.

Cloud sync (optional; on when `src/config.ts` has a Supabase URL + publishable key):
- `src/lib/sync.ts` is a pure `SyncEngine` (unit-tested with an in-memory backend). It handles version-guarded saves, a "choose" status instead of overwriting when both sides changed, and offline retry. Backends throw `SyncServerError` for server refusals; anything else counts as offline.
- `src/lib/syncBackend.ts` is the Supabase adapter (table `planner_state`, schema and row-level security in `supabase/schema.sql`).
- `src/useSync.ts` wires sync to the store: it subscribes to the persisted slices and suppresses echoes while applying remote data. On sign-out it must flush and stop the engine **before** clearing local data, or the cleared planner is uploaded over the cloud copy.
- Per-device sync metadata lives in localStorage key `studycal-sync`, and the auth session in `studycal-auth`.
- Never put a secret or service_role key in the code.

Undo: destructive store actions go through `withUndo(message, change, undo)`, where `undo` must reverse only that action (use `restoreAt` / `restoreAll`). Don't restore whole snapshots: an older toast's Undo would wipe later edits (covered by `src/store.test.ts`). The one exception is `importData`, which replaces everything by design.

Pure logic in `src/lib/` is what the unit tests cover:
- `scheduler.ts`: the planner. Free time is the study window minus busy blocks, sessions and meals, padded by `gapMinutes`. Day caps come from `dayLoad` (indexed by `Date.getDay()`). With `spreadEvenly`, a fair-share pass runs first and then a full-cap pass. Due dates are exclusive. Priority is the array order of `tasks`.
- `garden.ts`: derives the weekly garden from sessions. Use the unsigned `>>>` on hashes, because a signed shift once produced negative rows.
- Also `ics.ts`, `pomodoro.ts`, `progress.ts` and `time.ts`.

Tests build dates in local time and pass in any `TZ`.

Calendar (`src/components/CalendarView.tsx`):
- Events are fully controlled from the store.
- `extendedProps.kind` is one of `session`, `event`, `busy`, `proposal` or `incoming`. `refId` is the store id. Only `session` and `event` are editable.
- External drops (`eventReceive`) remove FullCalendar's temp event and add a session to the store.
- In-block tick boxes and ▶ are handled in `eventClick` via `data-action` attributes. React `stopPropagation` doesn't work because FullCalendar's delegated listener fires first.
- The toolbar is custom (`headerToolbar={false}`) and drives the calendar through a ref.

Task cards (`TaskList.tsx`) carry two drag systems on separate elements:
- `.cal-drag` body: FullCalendar `Draggable`, which reads `data-*` at drag time.
- `.grip`: native HTML5 drag and drop for priority reordering.

zustand v5: selectors must not return fresh arrays or objects (e.g. `s.tasks.filter(...)`). That loops renders. Select the stable value and derive outside.

## Design rules (see docs/DESIGN.md "Design principles")

- Use the CSS tokens in `src/styles.css` (paper / forest palette, one accent, no purple, no gradients).
- Lucide icons only, never emoji in the UI.
- Fraunces for headings and numbers, DM Sans for everything else.
- Shadows only on floating elements.
- Keep docs/DESIGN.md "Decisions and why" up to date when changing an approach. README.md is the public, user-facing page: keep it free of internal notes.
