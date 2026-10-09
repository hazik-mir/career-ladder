# Career Ladder Game

A static job guessing game with two pages: a landing page at `index.html` and the game at `game.html`. The game starts with broad questions about digital and technical work, then chooses clues from a related work area. Its 162 phrasings cover 54 job traits, with Bayesian-style evidence weighting and expected information gain used to select questions. It makes a job guess after each ten answers. A short clock pauses while the player is choosing, can be extended, and includes a Go Back control that recalculates the candidate ranking.

The host is an original, expressive vector character with restrained transitions. There is no autoplay and no generated soundtrack. The game can run without Supabase; saving a scorecard is optional and requires the player to agree before the name, job, and answers are submitted.

## Supabase setup

`config.js` contains the public anon key, which is intended for browser use. Never put a `service_role` or secret key in the site. Row Level Security is enabled in the provided SQL.

1. Open the Supabase project that matches the URL in `config.js`.
2. In **SQL Editor**, run [`supabase/schema.sql`](supabase/schema.sql). If the tables already exist, run [`supabase/migrations/20261009_fix_game_save_permissions_and_clock.sql`](supabase/migrations/20261009_fix_game_save_permissions_and_clock.sql).
3. In **Project Settings → Data API**, make sure the `public` schema is exposed.
4. Refresh the site and check the database status in the game footer.

The game saves the player’s name, job, and answer list to `career_ladder_games` only after scorecard consent. The public API has no game-row read policy. `career_ladder_job_votes` stores a normalized job title and random browser voter ID to prevent duplicate votes from the same browser. A job requires four distinct IDs before it is treated as established; clearing browser storage can create a new ID.

If Supabase is unavailable, a submitted run is queued in browser storage and retried when the connection returns. The guessing game remains playable offline.

## Preview and deploy

Serve this folder with a static web server and open it over HTTP or HTTPS. Upload the folder contents to the repository configured for GitHub Pages, keeping `CNAME`. The canonical domain in the page metadata and sitemap is `careerladder.hazik.in`.

