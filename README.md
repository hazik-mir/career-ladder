# Career Ladder Game

A static career guessing arcade with a still, expressive voxel host, a shuffled adaptive bank of 162 question phrasings, five answer choices, a two-minute clock, Go Back, local retry for offline saves, SEO metadata, sitemap, robots file, and a custom 404 page. The interface has no intro or motion animations. Its original chiptune is synthesized locally after the player clicks Start.

## Supabase setup

`config.js` contains the public anon key, which is intended for browser use. Never put a `service_role` or secret key in the site. Row Level Security is enabled in the provided SQL.

1. Open the Supabase project that matches the URL in `config.js`.
2. In **SQL Editor**, run [`supabase/schema.sql`](supabase/schema.sql).
3. In **Project Settings → Data API**, make sure the `public` schema is exposed.
4. Refresh the site. The top status should say **DATABASE CONNECTED**.

The game saves the name, job, and full answer list to `career_ladder_games` after the scorecard is submitted. Those records are insert-only from the public site. The separate `career_ladder_job_votes` table stores only normalized job titles and random browser voter IDs. A job is treated as established after four distinct browser IDs vote for it. This is a casual signal; clearing browser storage can create a new ID.

If the site says **RUN DATABASE SETUP**, the tables are missing or the schema is not exposed. **DATABASE UNAVAILABLE** means the connection or key was rejected. **OFFLINE SAVE QUEUED** means the run is stored in browser storage and will retry when the database is reachable. The game still works if Supabase is unavailable.

## Preview and deploy

Serve this folder with any static web server and open it over HTTP or HTTPS. Upload the folder contents to the repository configured for GitHub Pages, keeping `CNAME`. The canonical domain in metadata and the sitemap is `careerladder.hazik.in`.
