# Career Ladder Game

A small static arcade game. It has a block-built host, a shuffled adaptive question pool, the five Akinator-style answers, a two-minute timer, Go Back, local offline-save queue, SEO metadata, sitemap, robots file, and 404 page.

## Supabase setup

The browser key in `config.js` is the public anon key and is safe to ship in a browser when Row Level Security is enabled. Never replace it with a `service_role` or secret key.

1. Open the Supabase project matching the URL in `config.js`.
2. In **SQL Editor**, run [`supabase/schema.sql`](supabase/schema.sql).
3. In **Project Settings → Data API**, make sure the `public` schema is exposed. The SQL grants the required table permissions and enables RLS.
4. Refresh the site. The status should change from setup-needed to database-connected.

Completed game runs are inserted into `career_ladder_games`. Names and full answers are insert-only and cannot be read from the public site. The separate `career_ladder_job_votes` table contains only a normalized job title and a random browser voter ID. A job reaches the game’s accepted threshold after four distinct browser IDs vote for it. These votes are a casual popularity signal, not verified unique people; a visitor can reset browser storage.

If the game shows **RUN DATABASE SETUP**, the tables are missing or not exposed. **CHECK DATABASE ACCESS** means Supabase rejected the anon role or the RLS policy. The game still runs and queues a completed run in local storage when the database is offline. Exact network errors are written to the browser developer console.

## Local preview

Serve this folder over HTTP (for example, with a local static file server) and open it in a browser. Audio begins after the Start button because browsers block unsolicited autoplay. The chiptune is synthesized locally, so no MP3 files or external audio service are required.

## Deploy

Upload the folder contents to the repository configured for GitHub Pages. Keep the domain’s `CNAME` file if the repository already has one. `careerladder.hazik.in` is already the canonical URL used by the metadata and sitemap.
