# Ali Sheelare Documents
Full-stack document converter: Word->PDF, PDF->Word, PDF->Excel, Excel->PDF. React + Vite client, Express + MongoDB server.

## Requirements
- Node 18+ (tested on 22)
- **LibreOffice** (`soffice` on PATH) for Word/Excel -> PDF: `sudo apt install libreoffice-writer libreoffice-calc`
- **MongoDB** (optional; needed only for accounts & history). Local: `mongod`, or a free MongoDB Atlas URI.

- Optional OCR (Scan to Word): `sudo apt install tesseract-ocr tesseract-ocr-eng tesseract-ocr-ara poppler-utils`. The Docker image already includes all of this.

## Run locally
    cd server && cp .env.example .env && npm install && npm start     # http://localhost:4000
    cd client && npm install && npm run dev                           # http://localhost:5173 (proxies /api)
Tests: `cd server && npm test` (includes a real xlsx->pdf->docx/xlsx round trip; skipped if LibreOffice is missing).

## Your photo
Replace `client/public/images/ali-sheelare.jpg`. Update the contact email in `client/src/pages/Home.jsx`.

## API
| Method | Path | Notes |
|---|---|---|
| POST | /api/convert/{word-to-pdf, pdf-to-word, pdf-to-excel, excel-to-pdf, scan-to-word (optional `lang`: eng, ara, eng+ara)} | multipart `file`; optional Bearer token; returns `{id, downloadUrl}` |
| GET | /api/convert/download/:id | UUID only |
| POST | /api/auth/register, /api/auth/login | JSON; returns `{token, user}` |
| GET | /api/history | Bearer token required |
| GET | /api/health | |

## File retention
Upload deleted immediately after each conversion (success or failure). Converted files are in the OS temp dir and a sweep every 5 minutes deletes files older than 30 minutes. History stores only metadata (never file contents), only for signed-in users.

## Deployment
Step-by-step Railway + Netlify guide: see **DEPLOY.md**. Summary:
- **Server** (VPS/Docker with LibreOffice installed): set `NODE_ENV=production`, `PORT`, `CLIENT_ORIGIN` (your frontend URL), `MONGO_URI`, `JWT_SECRET` (long random). Run behind HTTPS (nginx/Caddy) and set `app.set('trust proxy', 1)` if behind a proxy so rate limiting sees real IPs. Platforms without system packages (e.g. plain serverless) cannot run LibreOffice; use Docker.
- **Client** (Netlify/Vercel/Cloudflare Pages): set `VITE_API_URL` to the server URL, `npm run build`, publish `dist/`, and add an SPA fallback rewrite (`/* -> /index.html`).

## Limitations
PDF->Word/Excel use text extraction: no OCR (scanned PDFs are rejected), tables are inferred from spacing, images are not carried over.
