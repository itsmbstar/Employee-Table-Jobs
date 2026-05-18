// src/lib/firebase-admin.js
// ─────────────────────────────────────────────────────────────────
// This runs ONLY at build time (Node.js). Never ships to the browser.
// Uses firebase-admin to read Firestore without needing browser auth.
// ─────────────────────────────────────────────────────────────────

const admin = require('firebase-admin');

// Prevent re-initialising on hot reload in dev
if (!admin.apps.length) {
  // Option A — Service Account JSON file (recommended for production)
  // Place your serviceAccountKey.json in the project root and set:
  //   GOOGLE_APPLICATION_CREDENTIALS=./serviceAccountKey.json
  //
  // Option B — Inline env vars (for Render / CI/CD where you can't commit files)
  // Set these env vars in Render dashboard:
  //   FIREBASE_PROJECT_ID
  //   FIREBASE_CLIENT_EMAIL
  //   FIREBASE_PRIVATE_KEY  (paste the full key including \n chars)

  const credential = process.env.FIREBASE_CLIENT_EMAIL
    ? admin.credential.cert({
        projectId: process.env.FIREBASE_PROJECT_ID || 'employee-table-dcac5',
        clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
        // Render stores newlines as literal \n — this converts them back
        privateKey: process.env.FIREBASE_PRIVATE_KEY
          ? process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n')
          : undefined,
      })
    : admin.credential.applicationDefault();

  admin.initializeApp({
    credential,
    projectId: process.env.FIREBASE_PROJECT_ID || 'employee-table-dcac5',
  });
}

const db = admin.firestore();

// ─── Helper: slugify a string for SEO-friendly URLs ───────────────
function slugify(text) {
  if (!text) return 'untitled';
  return text
    .toString()
    .toLowerCase()
    .trim()
    .replace(/[\s_]+/g, '-')
    .replace(/[^\w-]+/g, '')
    .replace(/--+/g, '-')
    .replace(/^-+|-+$/g, '');
}

// ─── Fetch all published jobs ──────────────────────────────────────
async function getAllJobs() {
  try {
    const snap = await db
      .collection('jobs')
      .orderBy('timestamp', 'desc')
      .get();

    return snap.docs.map((doc) => {
      const d = doc.data();
      return {
        id: doc.id,
        jobRole: d.jobRole || 'Job Opening',
        companyName: d.companyName || 'Company',
        companyLogo: d.companyLogo || '',
        workLocation: d.workLocation || 'India',
        experience: d.experience || 'Fresher',
        qualification: d.qualification || 'Any Graduate',
        package: d.package || '',
        jobType: d.jobType || 'Full-Time',
        applyLink: d.applyLink || '#',
        skills: d.skills || '',
        // Build a clean slug: role-company e.g. "software-engineer-tcs"
        slug:
          d.slug ||
          slugify(`${d.jobRole || 'job'}-${d.companyName || 'company'}-${doc.id.slice(0, 6)}`),
        timestamp: d.timestamp ? d.timestamp.toMillis() : Date.now(),
        clicks: d.clicks || 0,
      };
    });
  } catch (err) {
    console.error('getAllJobs error:', err.message);
    return [];
  }
}

// ─── Fetch all published blog posts ───────────────────────────────
async function getAllPosts() {
  try {
    const snap = await db
      .collection('posts')
      .orderBy('timestamp', 'desc')
      .get();

    return snap.docs.map((doc) => {
      const d = doc.data();
      return {
        id: doc.id,
        title: d.title || 'Blog Post',
        slug: d.slug || slugify(d.title || doc.id),
        excerpt: d.excerpt || '',
        content: d.content || '',
        coverImage: d.coverImage || '',
        tags: d.tags || '',
        timestamp: d.timestamp ? d.timestamp.toMillis() : Date.now(),
      };
    });
  } catch (err) {
    console.error('getAllPosts error:', err.message);
    return [];
  }
}

module.exports = { db, getAllJobs, getAllPosts, slugify };
