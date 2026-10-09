# Career Ladder Game

Static website for `careerladder.hazik.in`. Serve this folder from a static host with HTTPS and configure static hosting to return `404.html` for missing pages.

## Setup

1. Put `entry-music.mp3`, `happy.mp3`, `sad.mp3`, and `themesong.mp3` in `audio/`.
2. Run `supabase/schema.sql` in the Supabase SQL editor.
3. Set `supabaseUrl` and the public anon/publishable key in `config.js`. Do not put a service-role key in browser code.
4. Deploy the folder and configure the custom domain. The canonical URL, sitemap, and robots file already use `https://careerladder.hazik.in`.

The game has 120 distinct question phrasings. It picks the next work topic using weighted job candidates, then randomizes wording so rounds do not follow a fixed sequence. If the four MP3 files are missing, a built-in synthesized arcade melody plays instead. Anonymous question answers and optional job/name suggestions are written to Supabase after setup. A normalized job enters the trusted-job views only after at least four separate browser player IDs (one per browser profile); the game checks repeated question/answer patterns against those trusted jobs.

This is a prototype learning rule, not identity-verified voting: anonymous browser submissions can be duplicated or manipulated. The name field is optional. Configure retention/privacy information appropriate to the deployment before collecting real player data.
