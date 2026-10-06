# Brainrot Pack on Netlify (with "Everyone" admin broadcasts)

1. Put this whole folder in a GitHub repo.
2. Netlify -> Add new site -> Import from Git -> pick the repo (no build command needed; publish dir is `public`).
3. Site configuration -> Environment variables -> add BROADCAST_KEY = a long random string only you know.
4. Trigger a redeploy.
5. In the game: Admin panel -> "Everyone now" -> send something. The first time it asks for the broadcast key.

Players pick up broadcasts within ~10 seconds, only while the game tab is open and visible.
