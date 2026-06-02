'use strict';
const admin = require('firebase-admin');
const fs    = require('fs');
const path  = require('path');

const PROJECT_ID = 'employee-table-dcac5';
const DATA_DIR   = path.join(__dirname, 'data');

function slugify(text) {
  if (!text) return 'untitled-' + Date.now();
  return text.toString().toLowerCase().trim()
    .replace(/[\s_]+/g, '-').replace(/[^\w-]+/g, '')
    .replace(/--+/g, '-').replace(/^-+|-+$/g, '');
}

function initFirebase() {
  if (admin.apps.length) return;
  const keyPath = path.join(__dirname, 'serviceAccountKey.json');
  if (fs.existsSync(keyPath)) {
    admin.initializeApp({ credential: admin.credential.cert(require(keyPath)), projectId: PROJECT_ID });
    console.log('✅ Firebase initialized with serviceAccountKey.json');
  } else if (process.env.FIREBASE_CLIENT_EMAIL && process.env.FIREBASE_PRIVATE_KEY) {
    admin.initializeApp({ credential: admin.credential.cert({ projectId: PROJECT_ID, clientEmail: process.env.FIREBASE_CLIENT_EMAIL, privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n') }), projectId: PROJECT_ID });
    console.log('✅ Firebase initialized with env vars');
  } else {
    console.error('❌ No Firebase credentials found.\nPlace serviceAccountKey.json in this folder or set FIREBASE_CLIENT_EMAIL and FIREBASE_PRIVATE_KEY env vars.\nGet the key: Firebase Console → Project Settings → Service Accounts → Generate new private key');
    process.exit(1);
  }
}

function toMs(ts) {
  if (!ts) return Date.now();
  if (typeof ts.toMillis === 'function') return ts.toMillis();
  if (typeof ts === 'number') return ts;
  return Date.now();
}

async function migrateJobs(db) {
  console.log('\n📦 Fetching jobs from Firestore...');
  try {
    const snap = await db.collection('jobs').orderBy('timestamp', 'desc').get();
    if (snap.empty) { console.log('   ⚠️  No jobs found.'); return []; }
    const jobs = [];
    snap.forEach(doc => {
      const d = doc.data();
      let logo = d.companyLogo || '';
      if (logo.startsWith('data:')) logo = ''; // strip base64
      const baseSlug = d.slug ? slugify(d.slug) : slugify(`${d.jobRole||'job'}-${d.companyName||'company'}-${doc.id.slice(0,6)}`);
      let slug = baseSlug, i = 1;
      while (jobs.some(j => j.slug === slug)) slug = baseSlug + '-' + (i++);
      jobs.push({ id: doc.id, jobRole: d.jobRole||'Job Opening', companyName: d.companyName||'Company', companyLogo: logo, workLocation: d.workLocation||'India', jobType: d.jobType||'Full-Time', experience: d.experience||'Fresher', qualification: d.qualification||'Any Graduate', package: d.package||'', applyLink: d.applyLink||'', whatsappNumber: d.whatsappNumber||'', callNumber: d.callNumber||'', skills: d.skills||'', description: d.description||'', slug, timestamp: toMs(d.timestamp), clicks: d.clicks||0, verified: d.verified !== false });
    });
    console.log(`   ✅ Fetched ${jobs.length} jobs`);
    return jobs;
  } catch(e) { console.error('   ❌ Jobs error:', e.message); return []; }
}

async function migratePosts(db) {
  console.log('\n📝 Fetching blog posts from Firestore...');
  try {
    const snap = await db.collection('posts').orderBy('timestamp', 'desc').get();
    if (snap.empty) { console.log('   ⚠️  No posts found.'); return []; }
    const posts = [];
    snap.forEach(doc => {
      const d = doc.data();
      const baseSlug = d.slug ? slugify(d.slug) : slugify(d.title || doc.id);
      let slug = baseSlug, i = 1;
      while (posts.some(p => p.slug === slug)) slug = baseSlug + '-' + (i++);
      posts.push({ id: doc.id, title: d.title||'Blog Post', slug, excerpt: d.excerpt||'', content: d.content||'', coverImage: d.coverImage||'', tags: d.tags||'', metaTitle: d.metaTitle||'', metaDescription: d.metaDescription||'', timestamp: toMs(d.timestamp), views: d.views||0 });
    });
    console.log(`   ✅ Fetched ${posts.length} posts`);
    return posts;
  } catch(e) { console.error('   ❌ Posts error:', e.message); return []; }
}

async function migrateSubs(db) {
  console.log('\n📧 Fetching subscribers...');
  try {
    const snap = await db.collection('subscribers').get();
    if (snap.empty) { console.log('   ⚠️  No subscribers found.'); return []; }
    const subs = [];
    snap.forEach(doc => {
      const d = doc.data();
      subs.push({ id: doc.id, name: d.name||'', email: d.email||'', city: d.city||'Any', subscribedAt: toMs(d.subscribedAt), active: d.active !== false });
    });
    console.log(`   ✅ Fetched ${subs.length} subscribers`);
    return subs;
  } catch(e) { console.log('   ⚠️  Subscribers collection not found, skipping.'); return []; }
}

async function main() {
  console.log('═══════════════════════════════════════');
  console.log('  Employee Table — Firebase Migration');
  console.log('  Project: ' + PROJECT_ID);
  console.log('═══════════════════════════════════════');
  initFirebase();
  const db = admin.firestore();
  try {
    const [jobs, posts, subs] = await Promise.all([migrateJobs(db), migratePosts(db), migrateSubs(db)]);
    if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
    const save = (file, data) => {
      const fp = path.join(DATA_DIR, file);
      if (fs.existsSync(fp)) fs.copyFileSync(fp, fp + '.backup-' + Date.now());
      fs.writeFileSync(fp, JSON.stringify(data, null, 2));
      console.log(`   💾 Saved ${Array.isArray(data)?data.length:Object.keys(data).length} records → ${file}`);
    };
    console.log('\n💾 Writing files...');
    save('jobs.json', jobs);
    save('blog.json', posts);
    save('subscriptions.json', subs);
    if (!fs.existsSync(path.join(DATA_DIR,'users.json'))) save('users.json', []);
    if (!fs.existsSync(path.join(DATA_DIR,'views.json'))) fs.writeFileSync(path.join(DATA_DIR,'views.json'), '{}');
    console.log(`\n✅ Migration complete!\n   Jobs: ${jobs.length} | Posts: ${posts.length} | Subscribers: ${subs.length}\n\nNext: node server.js\n`);
  } catch(e) { console.error('\n❌ Migration failed:', e.message); process.exit(1); }
}
main();
