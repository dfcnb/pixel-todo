# Pixel Todo

**A pixel-art todo app where saving money is the main quest.**

No framework. No build step. No backend. No account. One `python -m http.server` and it runs.

<p align="center">
  <img src="docs/01-today.png" width="19%" />
  <img src="docs/03-year.png" width="19%" />
  <img src="docs/04-review.png" width="19%" />
  <img src="docs/06-opps.png" width="19%" />
  <img src="docs/08-feed-zh.png" width="19%" />
</p>

---

## Why

Every finance app I tried wanted a bank login, a subscription, or my data on their server. Every todo app I tried was a list — a very polite, very forgettable list.

So the goal lives in the same place as the chores. Saving money isn't a separate dashboard you visit once a month; it's the health bar sitting above today's tasks. Skip your dailies, lose HP. Log income, watch the progress bar move.

The whole thing is one HTML page and three JS files, because I wanted to still understand it in a year.

## What's in it

| | |
|---|---|
| **Today** | Main quest card (saved / target / days left / progress) + RPG status bar (LV / HP / EXP / leave tokens) + today's tasks |
| **Calendar** | Month view, schedule tasks ahead, mark important dates, optional external event feed |
| **Review** | Savings progress, projected finish date, this month's income vs. target, **per-channel breakdown**, 6-month bar chart |
| **More** | Opportunity pipeline, inbox for stray ideas, settings, JSON export/import |
| **News** | Optional: a card that pulls fresh tech news, bilingual, with a "what this could be used for" note |

### The RPG layer

| Action | Effect |
|---|---|
| Finish a task | +12 EXP, +4 HP |
| Finish a daily task | +8 EXP, +4 HP |
| Miss a daily task | −15 HP each |
| HP hits zero | Drop a level, revive at half HP, **no data lost** |
| EXP full | Level up, +10 max HP, full heal |
| Take a leave day | 2 tokens/month, stacks up to 999, no HP loss, streak preserved |

Leave tokens only block the daily-task penalty. An unfinished one-off task just turns red and waits.

### The money side

Your target isn't one big number, it's the sum of a few legs.

| | |
|---|---|
| Default channels | Salary / Side gig / Investment — rename, delete, add up to 6 |
| Logging income | Pick a channel, the amount is stored with it |
| Review page | This month per channel + a share bar; if you set a monthly target it shows the gap |
| Old data | Income logged before channels existed lands in "Uncategorized". Nothing is dropped |

### Opportunity pipeline

One card = one way to make money. Five states, forward only:

```
idea → trying → feedback → landed / dead
```

Dead ones are kept, not deleted. After a year that column tells you how many things you actually tried, and how many worked.

## Run it

```bash
git clone https://github.com/<you>/pixel-todo.git
cd pixel-todo
python -m http.server 8765 --bind 127.0.0.1
# open http://127.0.0.1:8765
```

> On Windows, Python's `http.server` sometimes reports `.js` as `text/plain`, which blocks Service Worker registration. That's a local-dev quirk — it works fine on any static host.

To use it on a phone: open the page, then "Add to Home Screen". It runs fullscreen with no address bar.

## Data

Everything lives in `localStorage` under `pixel-todo-v2`. No sync, no cloud, no telemetry.

A fresh install starts from an empty sheet — no sample data, no demo account, no seed file:

<p align="center"><img src="docs/00-fresh-install.png" width="240" /></p>

That means **clearing your browser data deletes your data**. Settings has JSON export — use it. The loader is defensive: if it can't parse what's stored, it copies the raw string to a rescue key before falling back to a blank state, so a corrupt read never silently overwrites good data.

## How it's built

- Pure static PWA. Native JS, no dependencies, no bundler.
- Service Worker for offline caching.
- Design system in `styles.css`: zero border-radius, hard borders, segmented bars. Every pixel is on purpose.
- The character in `hero.js` is drawn on a 20×20 canvas grid — no sprite sheet, no image files.

## Files

| File | What it does |
|---|---|
| `index.html` | Skeleton for all six views |
| `styles.css` | Pixel design system |
| `hero.js` | Draws the pixel character on canvas |
| `app.js` | State, day rollover, quest progress, income, news fetching, heatmap |
| `sw.js` | Offline cache |
| `manifest.webmanifest` | PWA manifest |
| `tools/shot.js` | Screenshot and run JS in a page via the DevTools protocol — used for self-checks |
| `tools/version.py` | Snapshot / restore: `list` · `snap <ver>` · `restore <ver>` |
| `tools/gen_icon.py` | Generates PNG icons with the standard library only, no PIL |
| `tools/fetch_gsw.py` | Pulls an NBA schedule + injury list into `assets/` |

## Design decisions

- **The character got smaller.** A full-body hero ate the first screen. The savings target is the protagonist.
- **One task list.** The old "must-do dailies" and "today's tasks" split was merged — a `daily` toggle covers it.
- **The health bar survived a quest change.** The main quest moved from leveling up to saving money; the HP bar stayed on as a daily rhythm keeper. Missing a daily costs HP, which doesn't conflict with the money goal.
- **Finished tasks sink.** Once a list gets long, completed items at the top are just obstacles.

## License

MIT
