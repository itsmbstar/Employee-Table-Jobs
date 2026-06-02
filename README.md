# Employee Table — Node.js SSR Job Portal v3

## Run locally (Windows/Mac/Linux)

```bash
# 1. Install dependencies
npm install

# 2. (Optional) Migrate your Firebase data
#    Place serviceAccountKey.json in this folder first
node migrate-from-firebase.js

# 3. Start server
node server.js
```

Open: http://localhost:3000
Admin: http://localhost:3000/admin (password: admin123)

## Deploy to Render (Web Service)

| Setting | Value |
|---|---|
| Build Command | `npm install` |
| Start Command | `node server.js` |
| Environment Variable | `DOMAIN=https://www.employeetable.in` |

## After deploying — SEO checklist

1. Submit sitemap: https://search.google.com/search-console → Sitemaps → `https://www.employeetable.in/sitemap.xml`
2. Request indexing for homepage + 5 best job pages using URL Inspection tool
3. Add job descriptions in Admin panel (required for Google for Jobs)
4. Replace any base64 logos with real HTTP image URLs in Admin panel

## Environment variables

| Variable | Default | Description |
|---|---|---|
| PORT | 3000 | Server port |
| DOMAIN | https://www.employeetable.in | Used in canonical tags and sitemap |
| ADMIN_PASS | admin123 | Admin panel password — CHANGE THIS |
| SESSION_SECRET | et-secret-2025 | Session key — CHANGE THIS |
