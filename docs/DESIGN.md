# studycal: design notes

How studycal works under the hood and why it's built the way it is. For using the site, see the [README](../README.md).

## Architecture

- **React app** (Vite + React + TypeScript), served as static files. Everything a person creates is kept in their browser's local storage through one [zustand](https://github.com/pmndrs/zustand) store, `src/store.ts`. Signed-in people's planners are also synced to Supabase. See *Cloud sync* below.
- **Pure logic lives in `src/lib/`** and is what the unit tests cover:
  - `scheduler.ts`: the planner.
  - `ics.ts`: calendar import and recurrence expansion.
  - `garden.ts`, `pomodoro.ts`, `progress.ts`, `snap.ts` and `time.ts`.
- **The calendar** is [FullCalendar](https://fullcalendar.io/) v6 (MIT parts only), fully controlled from the store. See `src/components/CalendarView.tsx`.

## Decisions and why

**Stack: Vite + React + TypeScript.** React is the most common choice for an interactive, drag-heavy UI, with the biggest ecosystem and the most help available. Vite gives instant reloads with almost no config. TypeScript catches mistakes in the data model (tasks, sessions, times) before they reach the browser.

**Calendar: FullCalendar v6 (MIT-licensed parts only).** Building a week view with drag, drop, resize, snapping, time zones and a "now" line from scratch would take weeks and be full of edge cases. FullCalendar handles all of it and supports dropping items from outside the calendar (our task list). We hide its default toolbar and draw our own, so it looks like part of the app rather than a library. v6 rather than v7 because v7 had only just come out, and only the free MIT plugins are used.

**Browser first.** People can start instantly with no sign-up and nothing to run on a server. The store (`zustand` with `persist`) is the single place data lives on a device. Cloud sync sits beside it for people who sign in. localStorage only holds a few MB, so calendar imports are capped at 2 MB.

**Cloud sync: optional, one row per person, never silently overwritten.**
- **Optional.** Signing in is never required. Without an account the app behaves exactly as before, and the browser stays the source of truth on each device.
- **Storage.** Each signed-in person has one row in `planner_state` holding their whole planner as JSON. Row-level security (`supabase/schema.sql`) lets a person read and write only their own row, and anonymous visitors get nothing. That's why the Supabase URL and *publishable* key can live in the public code (`src/config.ts`).
- **Saving.** Edits are saved 1.5 s after the last change. Every save carries a version number and only succeeds if nobody else saved in between (optimistic concurrency).
- **Conflicts.** If two devices change things at the same time, the person is asked which copy to keep, rather than one quietly overwriting the other.
- **Picking up changes.** Other devices pull new data when the tab regains focus, comes back online, or every 30 s while visible.
- **Offline.** Edits are kept and sent once the connection returns.
- **Sign-in.** Email + password rather than email login links, because Supabase's free plan only sends a few emails an hour.
- **Code.** The sync rules live in `src/lib/sync.ts` (pure and unit-tested against an in-memory database); `src/lib/syncBackend.ts` is the Supabase adapter and `src/useSync.ts` wires it to the app.

**Calendars via `.ics` files and links, not Google/Microsoft sign-in (yet).** Every calendar app, including university timetable systems, can export `.ics`, so one feature covers Google, Outlook, Apple and uni timetables. Subscription links work when the calendar server allows websites to read them. Many uni servers don't (a browser rule called CORS), and the app explains this and suggests downloading the file instead. A tiny server-side fetcher would remove that limit. Parsing uses `ical.js` (from Mozilla's Thunderbird team), which correctly handles repeating events, skipped weeks, moved lectures and time zones.

**Skipping one lecture without touching the rest.** Every occurrence of a repeating event has a stable ID (event UID + the original date/time). "Skip this one" stores that ID and "Hide every…" stores the UID. The imported file itself is never edited, so re-importing or refreshing the calendar keeps your skips.

**Click-to-add events count as busy time.** Quick events like "Gym" or "Call mum" have their own tick box and reminder, and the planner treats them like classes. Short to-dos no longer need to go through the task list.

**"Plan my week" is a transparent algorithm, not an LLM call (yet).** Calling an LLM from the browser would expose the API key to anyone, so it needs a backend. The algorithm is instant, free, works offline, gives the same answer every time, and is covered by tests. It aims for days that are varied, calm, and still hit every due date:

1. **Free time.** Your study day (default 09:00–21:00) minus classes, your own events, existing sessions, and lunch and dinner, with a 10-min gap around each. Each weekday's **rhythm** caps it: Normal (up to 5 h of study), Light (half) or Off.
2. **A daily quota per task, worked backwards from its due date.** Each morning: *sessions still needed ÷ study days left before it's due* (or before the end of the 14 days if it has no due date). A task due in two days automatically gets a bigger share of today than one due next week.
3. **Priority is a weight, not a queue.** The higher a task is in your list, the sooner it aims to finish (the top task plans to be done about a third earlier). It also wins ties, but it doesn't take over whole days.
4. **Variety within the day.** Each free slot goes to the task with the most of today's quota left. Tasks due within two days get a boost, and the task you just did gets a penalty. Two subjects due at the same time come out as A, B, A, B instead of A, A, A, A.
5. **Deadlines win.** Anything the quotas couldn't place goes in the earliest free time, earliest due date first. If a task still wouldn't make its due date, the "max sessions of one task a day" limit is lifted for it. Anything that truly can't fit is listed in the preview.
6. **Spread evenly** (on by default) uses all the days a task has. Turning it off makes every task aim to finish in the first half of its time (getting ahead).
7. **Readable times.** Planned sessions start on quarter hours (9:00, 10:15…).
8. **Preview and re-plan.** You see a dashed preview and choose *Add to calendar* or *Discard*. Re-planning moves upcoming sessions the planner placed earlier, so new settings take effect. Sessions you dragged in yourself, and finished ones, are never moved. Changing settings also discards any preview made with the old settings.

`planSchedule()` in `src/lib/scheduler.ts` takes tasks and free time in and returns sessions. A future LLM assistant should call it as a tool rather than replace it, so suggestions still respect the timetable.

**Dragging snaps to the clock.** FullCalendar snaps how *far* you drag, so a block starting at 1:40 could only land on 7:55 or 8:10. After a drop, the block's start is snapped to the nearest quarter hour on the clock (length kept). After a resize, the end is snapped instead.

**Undo instead of "Are you sure?".** Confirmation dialogs get clicked through on autopilot. Undo is safer and faster. Each Undo reverses only its own action (re-adds what was deleted, un-hides that one lecture), so pressing Undo on an older notification never wipes changes made since. An earlier version restored a full snapshot, and a test caught it deleting a newer event.

**Garden from real data, not a separate score.** Flowers come straight from finished sessions, so the garden can't drift out of sync with your calendar, and past weeks' gardens come for free. Each subject keeps the same flower type, so you can see which subjects you've been tending.

**Look and feel.** See [Design principles](#design-principles) below. Fonts (Fraunces, DM Sans) are bundled with the app instead of loaded from Google Fonts, so the site works offline and doesn't send visitors' IPs to a third party.

**Reminders only while the page is open.** Background reminders need a service worker and a push server (on the roadmap). The app checks every 20 s while open, and also reminds you if you open the page within 10 minutes of a start time.

## Design principles

Generic AI-generated sites share a few tells: purple-to-pink gradients, emoji used as icons, glassy blur everywhere, every element with a shadow and a badge, and default component-library looks. studycal deliberately avoids them:

1. **A real palette with a reason.** Paper cream, forest green and soft clay, taken from gardens and notebooks to match the garden idea. One accent colour, no gradients.
2. **Icons from one consistent set** (Lucide, thin strokes), never emoji in the interface.
3. **Typography with character.** A serif (Fraunces) only for headings and numbers, a clean sans (DM Sans) for everything else. Fewer sizes, used consistently.
4. **Restraint.** Shadows only on things that float (dialogs, timer, dragged items). Cards use hairline borders. No badges unless they carry information.
5. **Custom illustration where it counts** (the garden), drawn in the same flat style as the rest, instead of stock decoration.
6. **Motion with purpose.** Short ease-out transitions on state changes (a flower growing, a dialog opening) and nothing that loops for no reason. Respects "reduce motion".
7. **Real-app details.** Proper empty states, undo instead of "are you sure?" dialogs, keyboard focus styles, a layout that works on a phone.

## Roadmap

| When | Feature | Why it matters |
| --- | --- | --- |
| Done | **Accounts + cloud sync** (Supabase) | Planner follows you between devices. See *Cloud sync* above. |
| Next | **Password reset and self-service account deletion** | Both need the sign-in service to send emails reliably, so a custom email provider first. |
| Next | **Live Google / Outlook calendar sync** (OAuth) | Imports are snapshots. Needs a registered Google/Microsoft app, plus Google's verification process for public use. |
| Next | **Server-side calendar fetching** | A tiny serverless function to fetch uni `webcal://` links that block browsers, and refresh them daily. |
| Next | **Installable app + real notifications** (PWA, service worker, Web Push) | Reminders currently only fire while the tab is open. |
| Next | **LLM planning assistant** (serverless function holding the API key) | "Keep Friday light, I have a deadline Tuesday" in plain English. It would call the same planner as a tool, so suggestions still respect your timetable. |
| Later | Recurring events and tasks (e.g. weekly flashcards) | |
| Later | Dark mode | |
| Later | Study with friends: shared gardens, weekly streaks | Social motivation (Forest's best feature) |
| Later | Stats page: hours per subject over the term | |
| Later | Keyboard shortcuts, drag-select multiple events | |
| Later | Privacy policy + terms (required once accounts exist), basic error monitoring (e.g. Sentry) | |
| Later | Accessibility audit (screen reader labels on the calendar, focus order) | |
