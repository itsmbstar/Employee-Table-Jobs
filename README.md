# Employee Table — Next.js Static Export (SEO Migration)

## What changed
- **All jobs and blog posts** now get real `.html` files at build time
- **No more client-side data loading** for content — Googlebot can read everything
- **JobPosting + BlogPosting schema** on every job/post page
- **City landing pages** at `/jobs/city/mumbai/`, `/jobs/city/bangalore/`, etc.
- **Auto-generated sitemap.xml** with all pages
- **Core Web Vitals optimized** — no render-blocking scripts

---

## How to get your Firebase Service Account key

1. Go to [Firebase Console](https://console.firebase.google.com) → Your project
2. Click ⚙️ **Project Settings** → **Service Accounts** tab
3. Click **Generate new private key** → download JSON file
4. **DO NOT commit this file to GitHub**

---

## Local development

```bash
# 1. Install dependencies
npm install

# 2. Set env vars (copy and fill in values from serviceAccountKey.json)
cp .env.example .env.local
# Edit .env.local with your Firebase credentials

# 3. Run dev server
npm run dev
# → http://localhost:3000

# 4. Build static export
npm run build
# → generates /out folder

# 5. Preview the static export
npx serve out
```

---

## Environment variables

Create `.env.local` (never commit):

```
FIREBASE_PROJECT_ID=employee-table-dcac5
FIREBASE_CLIENT_EMAIL=firebase-adminsdk-xxxxx@employee-table-dcac5.iam.gserviceaccount.com
FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"
```

---

## Deploy to Render (static site)

1. Push this repo to GitHub
2. On Render dashboard: **New → Static Site**
3. Connect your GitHub repo
4. Set:
   - **Build Command:** `npm install && npm run build`
   - **Publish Directory:** `out`
5. Add the 3 environment variables above under **Environment**
6. Click **Deploy** ✅

---

## Firestore data requirements

### `jobs` collection — each document needs:
| Field | Type | Required |
|---|---|---|
| jobRole | string | ✅ |
| companyName | string | ✅ |
| workLocation | string | ✅ |
| experience | string | ✅ |
| qualification | string | ✅ |
| applyLink | string | ✅ |
| jobType | string | ✅ |
| companyLogo | string | optional |
| package | string | optional |
| skills | string | optional |
| slug | string | auto-generated if missing |
| timestamp | timestamp | ✅ |

### `posts` collection — each document needs:
| Field | Type | Required |
|---|---|---|
| title | string | ✅ |
| slug | string | ✅ |
| content | string (HTML) | ✅ |
| excerpt | string | optional |
| coverImage | string (URL) | optional |
| tags | string (comma-separated) | optional |
| timestamp | timestamp | ✅ |

---

## Firestore security rules (add to Firebase console)

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    // Public read for jobs and posts
    match /jobs/{document} {
      allow read: if true;
      allow write: if request.auth != null;
    }
    match /posts/{document} {
      allow read: if true;
      allow write: if request.auth != null;
    }
    // Subscribers — write only
    match /subscribers/{document} {
      allow create: if true;
      allow read, update, delete: if request.auth != null;
    }
  }
}
```
