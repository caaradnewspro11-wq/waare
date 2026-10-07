# Deployment: GitHub -> Railway (API) + Netlify (site)

## 1. Push to GitHub
    git remote add origin https://github.com/<you>/ali-sheelare-documents.git
    git branch -M main && git push -u origin main

## 2. MongoDB
Create a free cluster at MongoDB Atlas, add a database user, allow network access (0.0.0.0/0 or Railway egress), copy the connection string, e.g.
`mongodb+srv://USER:PASS@cluster.mongodb.net/ali-docs`.
(Or add Railway's MongoDB plugin and use its `MONGO_URL`.)

## 3. Railway (backend)
1. New Project -> Deploy from GitHub repo -> pick the repo.
2. Service Settings -> **Root Directory = `server`** (Railway then builds `server/Dockerfile`, which installs LibreOffice).
3. Variables:
   - `MONGO_URI` = your Atlas string
   - `JWT_SECRET` = long random (`openssl rand -hex 48`)
   - `CLIENT_ORIGIN` = your Netlify URL (no trailing slash; several allowed, comma-separated)
   - `MAX_FILE_MB` = 20 (optional). Do NOT set PORT; Railway provides it.
4. Settings -> Networking -> **Generate Domain**. Check `https://<domain>/api/health` returns `{"ok":true}`.
Health check path is preconfigured in `server/railway.json`.

## 4. Netlify (frontend)
1. Add new site -> Import from GitHub -> pick the repo. Build settings are read from `netlify.toml` (base `client`, publish `dist`).
2. Site settings -> Environment variables: `VITE_API_URL` = your Railway URL (e.g. `https://xxx.up.railway.app`, no trailing slash).
3. Deploy. Then put the final Netlify URL into Railway's `CLIENT_ORIGIN` and redeploy the API.

## 5. Before going live
- Replace the photo `client/public/images/ali-sheelare.jpg` if needed and the contact email in `client/src/pages/Home.jsx`.
- Have Privacy/Terms text reviewed.
- Railway's disk is ephemeral: converted files vanish on redeploy/restart (already the intended 30-minute lifetime).
- Smoke test on the live URLs: all four conversions, register/login, history, download.

## Admin
Set `ADMIN_EMAILS` (comma-separated) on Railway. An account registering or signing in with one of those emails becomes admin and sees **Admin** in the header (`/admin`: stats, users, conversions). Register that account right after setting the variable.
