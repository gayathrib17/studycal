# studycal
Website to help plan studying around a timetable. Starts with a todo list and you can drag tasks onto a calendar and a pomodoro feature. 


features:
- write to do list
- items on to do list can be 1 session worth, or 5 x 30 min slots or 9 x50 min e.g. or you just enter how long total item will take and can split by time later. e.g. MLT Learn Content set 20 hours 
- then from todo list you are able to see on left and calendar on the right, options to import ms cal or google cal, similar to notion, maybe we can integrate. 

then u can see when u are free, and drag 1 of the to do list onto the t calendar and default time is 50 mins but u can edit it. and automatically designed so that the item on the todo list changes colour when it is fully scheduled or could say 4/20 sessions done or soemhthing. and each element/slot u drag onto the calendar will also have a tick box kinda like a sub to do. so once u finish that session of studying on said topic, u can tick it off. 

and once the whole task is done then u tick off the item in to do list. each item can have different colours on calendar. also each element on calendar could have like options to start work, or like a reminder to start. and then a cute pomodoro timer could start for the session. it should be easy to change around anything by simply dragging to new time. also should be an AI optimize option where if u cant decide, there shoudl be an algorthim or agent to organise the schedule. like if user cant think of how to schedule or plan out their tasks in drag and drop, then an llm can help optimally plan it out. maybe if there is an option for user to rearrange the items in todo list by dragging them in order and that priority cfan be used while the ai can plan the schedule. they can also import their uni calendar or google calender so gthey can plan aroudn it,. 

### Round 2 brief: from prototype to a real website

- Deployable (e.g. GitLab) so friends can use it as an actual website, and it should feel like a real, usable site.
- Imported uni timetable: delete just this week's lecture without deleting all future ones.
- Click an empty slot to add an event, like a normal calendar. Not everything should go through the task list (tedious for short tasks/reminders).
- Smarter planner: some days should be chill, and leave gaps for lunch and dinner.
- Prettier and smoother, inspired by Pomofocus / Flora / Forest. Not cringe, not "vibe-coded", no purple, nicer than emoji.
- A little garden of flowers that grows with how much work you do, starting fresh each week.

---

## v1 plan: a deployable version

Status: ✅ done · 🔜 next · 💡 later

### This round

| | Feature | How |
| --- | --- | --- |
| ✅ | **Deploy as a website** | Ready-to-go pipelines for GitLab Pages (`.gitlab-ci.yml`) and GitHub Pages (`.github/workflows/deploy.yml`). Tests run first and the site only deploys if they pass. It goes live when you push (see *Putting it online*). |
| ✅ | **Skip a single lecture** | Click any imported event: *Skip this one* (just that occurrence), *Hide all "Biochem lecture"* (the whole series), or undo. Hidden events can be restored from *Calendars*. |
| ✅ | **Click to add events** | Click (or drag across) an empty slot to add a quick event or reminder with its own tick box. It can also be a study session for a task. |
| ✅ | **Calmer planner** | Lunch and dinner breaks, a per-weekday rhythm (Off / Light / Normal), spreading work evenly across the fortnight instead of front-loading it, and optional due dates. |
| ✅ | **Weekly garden** | Every study session you finish grows a flower in the task's colour, sized by how long you studied. Sessions planned but not finished show as sprouts. A new garden starts each Monday, and past weeks can be browsed. The focus timer grows a flower as you work. |
| ✅ | **Redesign** | Calm, paper-and-forest palette, real icon set, editorial headings, custom calendar toolbar, mobile layout. See "Making it not look vibe-coded" below. |
| ✅ | **Undo** | Deleting or hiding anything shows an *Undo* toast. |
| ✅ | **Backup** | Settings → *Your data*: export and import a backup file, since data lives in your browser. |
| ✅ | **Calendar links** | Paste a calendar subscription link (`webcal://` / `https://…ics`) and refresh it later. Some servers block websites from reading them (CORS), in which case the app says so and you download the file instead. |

### Needed before it's a "real" product

| | Feature | Why it matters |
| --- | --- | --- |
| 🔜 | **Accounts + cloud sync** (e.g. Supabase: Postgres + auth, generous free tier) | Right now each browser has its own data, so your phone and laptop don't match, and clearing site data wipes everything. |
| 🔜 | **Live Google / Outlook calendar sync** (OAuth) | Imports are snapshots. Needs a registered Google/Microsoft app, plus Google's verification process for public use. |
| 🔜 | **Server-side calendar fetching** | A tiny serverless function to fetch uni `webcal://` links that block browsers, and refresh them daily. |
| 🔜 | **Installable app + real notifications** (PWA, service worker, Web Push) | Reminders currently only fire while the tab is open. |
| 🔜 | **LLM planning assistant** (serverless function holding the API key) | "Keep Friday light, I have a deadline Tuesday" in plain English. It would call the same planner as a tool, so suggestions still respect your timetable. |
| 💡 | Recurring events and tasks (e.g. weekly flashcards) | |
| 💡 | Dark mode | |
| 💡 | Study with friends: shared gardens, weekly streaks | Social motivation (Forest's best feature) |
| 💡 | Stats page: hours per subject over the term | |
| 💡 | Keyboard shortcuts, drag-select multiple events | |
| 💡 | Privacy policy + terms (required once accounts exist), basic error monitoring (e.g. Sentry) | |
| 💡 | Accessibility audit (screen reader labels on the calendar, focus order) | |

### Making it not look vibe-coded

"Vibe-coded" sites share a few tells: purple-to-pink gradients, emoji used as icons, glassy blur everywhere, every element with a shadow and a badge, and default component-library looks. What we do instead:

1. **A real palette with a reason.** Paper cream, forest green and soft clay, taken from gardens and notebooks to match the garden idea. One accent colour, no gradients.
2. **Icons from one consistent set** (Lucide, thin strokes), never emoji in the interface.
3. **Typography with character.** A serif (Fraunces) only for headings and numbers, a clean sans (DM Sans) for everything else. Fewer sizes, used consistently.
4. **Restraint.** Shadows only on things that float (dialogs, timer, dragged items). Cards use hairline borders. No badges unless they carry information.
5. **Custom illustration where it counts** (the garden), drawn in the same flat style as the rest, instead of stock decoration.
6. **Motion with purpose.** Short ease-out transitions on state changes (a flower growing, a dialog opening) and nothing that loops for no reason. Respects "reduce motion".
7. **Real-app details.** Proper empty states, undo instead of "are you sure?" dialogs, keyboard focus styles, a layout that works on a phone.

---

## Running it locally

Requires Node.js 22.12+ (24 recommended; 23 works with a harmless engine warning from Vitest).

```bash
npm install        # first time only
npm run dev        # then open http://localhost:5173
```

| Command | What it does |
| --- | --- |
| `npm run dev` | Dev server with hot reload |
| `npm test` | Unit tests (Vitest) |
| `npx vitest run src/lib/scheduler.test.ts` | One test file |
| `npx vitest run -t "keeps lunch free"` | Tests whose name matches |
| `npm run typecheck` | TypeScript check |
| `npm run build` / `npm run preview` | Production build / serve it at http://localhost:4173 |

## Putting it online for friends

The app is a static website (no server), so free static hosting works. Both pipelines run the type check and tests first and only publish if they pass. The build uses relative paths, so it works at any sub-path.

**GitLab Pages** (`.gitlab-ci.yml`)
1. Create a project on gitlab.com and push this repo to it (`git remote add gitlab git@gitlab.com:<you>/studycal.git && git push gitlab main`).
2. The pipeline runs automatically. When it's green, the link is under **Deploy → Pages**, usually `https://<you>.gitlab.io/studycal/`.
3. In **Deploy → Pages**, untick "Use unique domain" if you want the shorter link, and make sure Pages visibility is "Everyone" so friends can open it.

**GitHub Pages** (`.github/workflows/deploy.yml`). The repo already lives on GitHub.
1. Repo **Settings → Pages → Source: GitHub Actions** (one time).
2. Push to `main`. The site appears at `https://<you>.github.io/studycal/`.

Each friend's data stays in their own browser. Nobody can see anyone else's tasks, and there's nothing to secure on a server yet. The flip side is that there's no sync between their devices (see "Needed before it's a real product" above).

## What it does today

| Area | How it works |
| --- | --- |
| Tasks | Add a task with **total hours** (e.g. MLT Learn Content, 20 h in 50 min sessions) or **sessions** (e.g. 9 × 50 min), an optional due date and a colour. Progress reads "3h 20m of 20h planned · 1h 40m done" or "4/9 sessions planned · 2 done". The card fills with the task's colour once it's fully planned. Tick the circle to complete the whole task. |
| Calendar | Week / day / month views. Drag a task onto a slot to book a session. Drag blocks to move them, and drag the bottom edge to resize. **Click or drag across empty time** to add an event or reminder, or to book a study session for a task. Every block has its own tick box. |
| Timetable | *Calendars*: upload an `.ics` file or paste a subscription link (refreshable). Pick a colour per calendar. Click any lecture to **skip just that one** or hide the whole series. Restore hidden events at any time. |
| Planner | *Plan my week* fills the next 14 days around classes, your own events, lunch and dinner. It follows the weekly rhythm (Normal / Light / Off per weekday), spreads work evenly, respects due dates, and shows a dashed preview you add or discard. |
| Focus timer | ▶ on a session (or *Start focus*) opens a focus/break timer that adds up to the session length (50 min → 25 focus, 5 break, 20 focus). A flower grows as you focus, and you tick off the session at the end to plant it. |
| Garden | Each finished session grows a flower (subject = flower type and colour, size = session length). Planned sessions are sprouts. A fresh garden starts every Monday, and you can browse past weeks. |
| Reminders | A toast (and a desktop notification, if allowed) when a session or event starts, while the page is open. |
| Safety nets | Undo after every delete or hide. Backup download and restore in Settings. A warning if you leave with an un-added plan. |

## Decisions and why

**Stack: Vite + React + TypeScript.** React is the most common choice for an interactive, drag-heavy UI, with the biggest ecosystem and the most help available. Vite gives instant reloads with almost no config. TypeScript catches mistakes in the data model (tasks, sessions, times) before they reach the browser.

**Calendar: FullCalendar v6 (MIT-licensed parts only).** Building a week view with drag, drop, resize, snapping, time zones and a "now" line from scratch would take weeks and be full of edge cases. FullCalendar handles all of it and supports dropping items from outside the calendar (our task list). We hide its default toolbar and draw our own, so it looks like part of the app rather than a library. v6 rather than v7 because v7 had only just come out, and only the free MIT plugins are used.

**Data stays in the browser (localStorage) for now.** Friends can start instantly with no sign-up, there's no server to run or pay for, and there's no personal data held anywhere central. The store (`zustand` with `persist`) is the only place data is saved, so moving to a real backend later means changing one file. The downsides: no sync between devices, and localStorage only holds a few MB (calendar imports are capped at 2 MB). Backups cover the gap for now.

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

**Look and feel.** See "Making it not look vibe-coded" above. Fonts (Fraunces, DM Sans) are bundled with the app instead of loaded from Google Fonts, so the site works offline and doesn't send visitors' IPs to a third party.

**Reminders only while the page is open.** Background reminders need a service worker and a push server (on the roadmap). The app checks every 20 s while open, and also reminds you if you open the page within 10 minutes of a start time.

## Known limitations

- No accounts or sync between devices (browser storage only; use backups).
- Calendar links only work when the calendar's server allows browsers to fetch them. Otherwise, upload the file.
- All-day imported events (holidays, birthdays) are shown but don't block study time.
- Changing Settings doesn't move sessions already on the calendar by itself. *Plan my week* re-arranges the upcoming sessions it planned (on by default), but never moves ones you placed by hand or have finished.
- Reminders need the tab open.
