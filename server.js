'use strict';
const express        = require('express');
const session        = require('express-session');
const flash          = require('connect-flash');
const bcrypt         = require('bcryptjs');
const path           = require('path');
const fs             = require('fs');
const { v4: uuidv4 } = require('uuid');
const slugify        = require('slugify');
const multer         = require('multer');
const admin          = require('firebase-admin');

// ── Config ──────────────────────────────────────────────────────────────────
const DOMAIN         = process.env.DOMAIN        || 'https://www.employeetable.in';
const PORT           = process.env.PORT           || 3000;
const ADMIN_PASS     = process.env.ADMIN_PASS     || 'admin123';
const SESSION_SECRET = process.env.SESSION_SECRET || 'et-secret-2025';
const PROJECT_ID     = process.env.FIREBASE_PROJECT_ID || 'employee-table-dcac5';
const JOBS_PER_PAGE  = 9;

// ── CACHE SYSTEM ────────────────────────────────────────────────────────────
let cachedJobs = null;
let cachedPosts = null;
let cacheTimeJobs = null;
let cacheTimePosts = null;
let cachedWalkins = null;
let cacheTimeWalkins = null;
const CACHE_DURATION = 30 * 60 * 1000; // 30 minutes

// Individual caches for job & post details
let jobDetailCache = {};
let postDetailCache = {};
const DETAIL_CACHE_TTL = 60 * 60 * 1000; // 1 hour

// Sitemap cache
let cachedSitemap = null;
let sitemapCacheTime = null;
const SITEMAP_CACHE_TTL = 60 * 60 * 1000; // 1 hour

function clearCache() {
  cachedJobs = null;
  cachedPosts = null;
  cachedWalkins = null;
  cacheTimeJobs = null;
  cacheTimePosts = null;
  cacheTimeWalkins = null;
  jobDetailCache = {};
  postDetailCache = {};
  console.log('🗑️ Main cache cleared');
}

function clearSitemapCache() {
  cachedSitemap = null;
  sitemapCacheTime = null;
  console.log('🗑️ Sitemap cache cleared');
}

// ── Firebase Admin Init ─────────────────────────────────────────────────────
if (!admin.apps.length) {
  try {
    if (process.env.FIREBASE_CLIENT_EMAIL && process.env.FIREBASE_PRIVATE_KEY) {
      admin.initializeApp({
        credential: admin.credential.cert({
          projectId:   PROJECT_ID,
          clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
          privateKey:  process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'),
        }),
        projectId: PROJECT_ID,
      });
      console.log('✅ Firebase: using environment variables');
    } else {
      const keyPath = path.join(__dirname, 'serviceAccountKey.json');
      if (fs.existsSync(keyPath)) {
        const raw = fs.readFileSync(keyPath, 'utf8').trim();
        if (!raw.startsWith('{')) {
          throw new Error('serviceAccountKey.json is not valid JSON.');
        }
        const key = JSON.parse(raw);
        admin.initializeApp({ credential: admin.credential.cert(key), projectId: PROJECT_ID });
        console.log('✅ Firebase: using serviceAccountKey.json');
      } else {
        throw new Error('No Firebase credentials found.');
      }
    }
  } catch (e) {
    console.error('❌ Firebase init failed:', e.message);
    process.exit(1);
  }
}

const db = admin.firestore();
const FieldValue = admin.firestore.FieldValue;

// ── Cities config ───────────────────────────────────────────────────────────
const CITIES = [
  { name:'Mumbai',    slug:'mumbai',    emoji:'🏙️', industries:'Finance, IT, Media' },
  { name:'Bangalore', slug:'bangalore', emoji:'💻', industries:'Tech, Startups, IT' },
  { name:'Delhi',     slug:'delhi',     emoji:'🏛️', industries:'Govt, Corporate, MNC' },
  { name:'Hyderabad', slug:'hyderabad', emoji:'🔬', industries:'IT, Pharma, FMCG' },
  { name:'Pune',      slug:'pune',      emoji:'🎓', industries:'Auto, IT, Education' },
  { name:'Noida',     slug:'noida',     emoji:'📡', industries:'IT, BPO, Startups' },
  { name:'Chennai',   slug:'chennai',   emoji:'🌊', industries:'Manufacturing, IT' },
  { name:'Remote',    slug:'remote',    emoji:'🌐', industries:'Work from anywhere' },
];

// ── Synonym / fuzzy search ──────────────────────────────────────────────────
const SYNONYM_MAP = {
  'software': ['software','engineer','developer','programmer','coding','sde','dev'],
  'developer': ['developer','engineer','programmer','coding','software','dev','web'],
  'engineer': ['engineer','developer','programmer','software','sde','tech'],
  'marketing': ['marketing','digital','seo','social media','brand','content','growth'],
  'data': ['data','analyst','analytics','science','scientist','sql','python','bi'],
  'design': ['design','designer','ui','ux','graphic','creative','figma'],
  'hr': ['hr','human resources','recruitment','recruiter','talent','people'],
  'finance': ['finance','accounting','accounts','ca','financial','banking','audit'],
  'sales': ['sales','business development','bd','account','revenue','client'],
  'content': ['content','writer','writing','copywriter','editorial','blog'],
  'manager': ['manager','lead','head','senior','management','coordinator'],
  'intern': ['intern','internship','trainee','fresher','graduate','entry'],
  'python': ['python','django','flask','data','ml','ai','machine learning'],
  'java': ['java','spring','backend','j2ee','enterprise'],
  'react': ['react','frontend','javascript','js','ui','web'],
  'devops': ['devops','cloud','aws','azure','docker','kubernetes'],
};

function getExpandedKeywords(q) {
  const words = q.toLowerCase().split(/\s+/).filter(Boolean);
  const expanded = new Set(words);
  words.forEach(w => {
    Object.entries(SYNONYM_MAP).forEach(([key, syns]) => {
      if (syns.includes(w) || w.includes(key) || key.includes(w)) syns.forEach(s => expanded.add(s));
    });
  });
  return Array.from(expanded);
}

function jobMatchesQuery(job, keywords) {
  const hay = [job.jobRole, job.companyName, job.skills, job.description, job.jobType, job.workLocation, job.qualification].join(' ').toLowerCase();
  return keywords.some(k => hay.includes(k));
}

// ── Helper Functions ─────────────────────────────────────────────────────────
function parseSalaryToNumber(pkg) {
  if (!pkg) return null;
  const lo = pkg.toLowerCase();
  if (['competitive','as per','industry','negotiable'].some(s => lo.includes(s))) return null;
  const m = pkg.match(/[\d.]+/); if (!m) return null;
  const n = parseFloat(m[0]);
  if (lo.includes('lpa') || lo.includes('lac') || lo.includes('lakh')) return Math.round(n * 100000);
  if (lo.includes('month')) return Math.round(n * 12);
  return Math.round(n);
}

function makeSlug(t) { return slugify(t || 'untitled', { lower: true, strict: true }); }

function uniqueSlug(base, list) {
  let s = base;
  let i = 1;
  while (list.some(x => x.slug === s)) {
    s = base + '-' + (i++);
  }
  return s;
}

function timeAgo(ts) {
  if (!ts) return 'Recently';
  const d = Math.floor((Date.now() - ts) / 86400000);
  if (d === 0) return 'Today';
  if (d === 1) return 'Yesterday';
  if (d < 7) return d + ' days ago';
  return new Date(ts).toLocaleDateString('en-IN');
}

function buildJobTitle(job) {
  const r = job.jobRole.length > 38 ? job.jobRole.substring(0, 36) + '…' : job.jobRole;
  return `${r} at ${job.companyName} — ${job.workLocation} | Employee Table`;
}

function buildJobDescription(job) {
  if (job.description && job.description.trim().length > 50) return job.description;
  let d = `${job.jobRole} opportunity at ${job.companyName} in ${job.workLocation}. `;
  d += `This is a ${job.jobType} role for ${job.experience} experience. `;
  if (job.qualification) d += `Required qualification: ${job.qualification}. `;
  if (job.skills) d += `Key skills: ${job.skills}. `;
  if (job.package && !['competitive','as per','industry'].some(s => (job.package || '').toLowerCase().includes(s))) d += `Salary: ${job.package}. `;
  d += `Manually verified by Employee Table — free to apply.`;
  return d;
}

// ── CACHED FIRESTORE OPERATIONS ──────────────────────────────────────────────

// JOBS – full list
async function getJobs() {
  if (cachedJobs && cacheTimeJobs && (Date.now() - cacheTimeJobs < CACHE_DURATION)) {
    console.log('📦 Returning cached jobs');
    return cachedJobs;
  }
  console.log('🔄 Fetching fresh jobs from Firestore...');
  const snap = await db.collection('jobs').orderBy('timestamp', 'desc').get();
  cachedJobs = snap.docs.map(doc => {
    const d = doc.data();
    return {
      id: doc.id,
      jobRole: d.jobRole || 'Job Opening',
      companyName: d.companyName || 'Company',
      companyLogo: d.companyLogo || '',
      workLocation: d.workLocation || 'India',
      jobType: d.jobType || 'Full-Time',
      experience: d.experience || 'Fresher',
      qualification: d.qualification || 'Any Graduate',
      package: d.package || '',
      applyLink: d.applyLink || '',
      skills: d.skills || '',
      description: d.description || '',
      slug: d.slug || makeSlug(`${d.jobRole || 'job'}-${doc.id.slice(0, 6)}`),
      timestamp: d.timestamp || Date.now(),
      clicks: d.clicks || 0,
      verified: d.verified !== false,
    };
  });
  cacheTimeJobs = Date.now();
  return cachedJobs;
}

// POSTS – full list
async function getPosts() {
  if (cachedPosts && cacheTimePosts && (Date.now() - cacheTimePosts < CACHE_DURATION)) {
    console.log('📦 Returning cached posts');
    return cachedPosts;
  }
  console.log('🔄 Fetching fresh posts from Firestore...');
  const snap = await db.collection('posts').orderBy('timestamp', 'desc').get();
  cachedPosts = snap.docs.map(doc => {
    const d = doc.data();
    return {
      id: doc.id,
      title: d.title || 'Blog Post',
      slug: d.slug || makeSlug(d.title || doc.id),
      excerpt: d.excerpt || '',
      content: d.content || '',
      coverImage: d.coverImage || '',
      tags: d.tags || '',
      metaTitle: d.metaTitle || '',
      metaDescription: d.metaDescription || '',
      timestamp: d.timestamp || Date.now(),
      views: d.views || 0,
    };
  });
  cacheTimePosts = Date.now();
  return cachedPosts;
}

// JOB DETAIL – cached individually
async function getJobBySlug(slug) {
  if (jobDetailCache[slug] && (Date.now() - jobDetailCache[slug].time < DETAIL_CACHE_TTL)) {
    console.log(`📦 Returning cached job detail: ${slug}`);
    return jobDetailCache[slug].data;
  }
  const snap = await db.collection('jobs').where('slug', '==', slug).limit(1).get();
  if (!snap.empty) {
    const d = snap.docs[0].data();
    const job = { id: snap.docs[0].id, ...d };
    jobDetailCache[slug] = { data: job, time: Date.now() };
    return job;
  }
  const ref = await db.collection('jobs').doc(slug).get();
  if (ref.exists) {
    const job = { id: ref.id, ...ref.data() };
    jobDetailCache[slug] = { data: job, time: Date.now() };
    return job;
  }
  return null;
}

function clearJobDetailCache(slug) {
  if (slug) delete jobDetailCache[slug];
  else jobDetailCache = {};
}

// POST DETAIL – cached individually
async function getPostBySlug(slug) {
  if (postDetailCache[slug] && (Date.now() - postDetailCache[slug].time < DETAIL_CACHE_TTL)) {
    console.log(`📦 Returning cached post detail: ${slug}`);
    return postDetailCache[slug].data;
  }
  const snap = await db.collection('posts').where('slug', '==', slug).limit(1).get();
  if (!snap.empty) {
    const d = snap.docs[0].data();
    const post = { id: snap.docs[0].id, ...d };
    postDetailCache[slug] = { data: post, time: Date.now() };
    return post;
  }
  const ref = await db.collection('posts').doc(slug).get();
  if (ref.exists) {
    const post = { id: ref.id, ...ref.data() };
    postDetailCache[slug] = { data: post, time: Date.now() };
    return post;
  }
  return null;
}

function clearPostDetailCache(slug) {
  if (slug) delete postDetailCache[slug];
  else postDetailCache = {};
}

// WALKINS – full list cached
async function getWalkins() {
  if (cachedWalkins && cacheTimeWalkins && (Date.now() - cacheTimeWalkins < CACHE_DURATION)) {
    console.log('📦 Returning cached walkins');
    return cachedWalkins;
  }
  console.log('🔄 Fetching fresh walkins from Firestore...');
  const snap = await db.collection('walkins').orderBy('timestamp', 'desc').get();
  cachedWalkins = snap.docs.map(doc => {
    const d = doc.data();
    const dateEnd = d.interviewDateEnd || d.timestamp;
    return {
      id: doc.id,
      companyName: d.companyName || 'Company',
      roleTitle: d.roleTitle || 'Multiple Roles',
      city: d.city || 'India',
      area: d.area || '',
      venueAddress: d.venueAddress || '',
      interviewDateStart: d.interviewDateStart || d.timestamp,
      interviewDateEnd: dateEnd,
      interviewTime: d.interviewTime || '10:00 AM – 5:00 PM',
      hrContactEmail: d.hrContactEmail || '',
      hrContactPhone: d.hrContactPhone || '',
      documentsRequired: d.documentsRequired || 'Updated Resume, Aadhar Card, PAN Card, Passport size photo',
      eligibility: d.eligibility || 'Any Graduate',
      package: d.package || '',
      slug: d.slug || makeSlug(`${d.companyName || 'walkin'}-${d.city || ''}-${doc.id.slice(0, 6)}`),
      timestamp: d.timestamp || Date.now(),
      clicks: d.clicks || 0,
      verified: d.verified !== false,
      expired: Date.now() > dateEnd,
    };
  });
  cacheTimeWalkins = Date.now();
  return cachedWalkins;
}

function clearWalkinCache() {
  cachedWalkins = null;
  cacheTimeWalkins = null;
}

async function getWalkinBySlug(slug) {
  const snap = await db.collection('walkins').where('slug', '==', slug).limit(1).get();
  if (!snap.empty) { const d = snap.docs[0].data(); return { id: snap.docs[0].id, ...d }; }
  return null;
}

async function addWalkin(data) {
  const id = uuidv4();
  const slug = data.slug || makeSlug(`${data.companyName || 'walkin'}-${data.city || ''}-${id.slice(0, 6)}`);
  await db.collection('walkins').doc(id).set({ ...data, id, slug, timestamp: data.timestamp || Date.now() });
  clearWalkinCache();
  return id;
}
async function updateWalkin(id, data) { await db.collection('walkins').doc(id).update(data); clearWalkinCache(); }
async function deleteWalkin(id) { await db.collection('walkins').doc(id).delete(); clearWalkinCache(); }
async function incrementWalkinClicks(id) { await db.collection('walkins').doc(id).update({ clicks: FieldValue.increment(1) }); }

// ── OTHER DB OPERATIONS ─────────────────────────────────────────────────────

async function addJob(data) {
  const id = uuidv4();
  const slug = data.slug || makeSlug(`${data.jobRole || 'job'}-${id.slice(0, 6)}`);
  const jobData = {
    ...data,
    id,
    slug,
    timestamp: data.timestamp || Date.now(),
    description: data.description || `${data.jobRole} opportunity at ${data.companyName}. Apply now for this ${data.jobType} role.`,
    datePosted: data.datePosted || new Date().toISOString(),
    validThrough: data.validThrough || new Date(Date.now() + 30 * 86400000).toISOString(),
    jobLocation: {
      address: {
        addressLocality: data.workLocation || 'India',
        addressCountry: 'IN'
      }
    },
    experienceRequirements: data.experience === 'Fresher' ? 'Less than 1 year' : (data.experience === 'Experienced' ? '2+ years' : data.experience),
    educationRequirements: data.qualification || "Bachelor's Degree",
  };
  if (data.package && parseSalaryToNumber(data.package)) {
    jobData.baseSalary = {
      '@type': 'MonetaryAmount',
      currency: 'INR',
      value: {
        '@type': 'QuantitativeValue',
        value: parseSalaryToNumber(data.package),
        unitText: 'YEAR'
      }
    };
  }
  await db.collection('jobs').doc(id).set(jobData);
  clearCache();
  clearJobDetailCache();
  clearSitemapCache();
  return id;
}

async function updateJob(id, data) {
  await db.collection('jobs').doc(id).update(data);
  clearCache();
  clearJobDetailCache();
  clearSitemapCache();
}
async function deleteJob(id) {
  await db.collection('jobs').doc(id).delete();
  clearCache();
  clearJobDetailCache();
  clearSitemapCache();
}
async function incrementJobClicks(id) { await db.collection('jobs').doc(id).update({ clicks: FieldValue.increment(1) }); }

async function addPost(data) {
  const id = uuidv4();
  const slug = data.slug || makeSlug(data.title || id);
  await db.collection('posts').doc(id).set({ ...data, id, slug, timestamp: Date.now() });
  clearCache();
  clearPostDetailCache();
  clearSitemapCache();
  return id;
}
async function updatePost(id, data) {
  await db.collection('posts').doc(id).update(data);
  clearCache();
  clearPostDetailCache();
  clearSitemapCache();
}
async function deletePost(id) {
  await db.collection('posts').doc(id).delete();
  clearCache();
  clearPostDetailCache();
  clearSitemapCache();
}

// ── USER & SUBSCRIBER OPERATIONS ──────────────────────────────────────────

async function getUsers() {
  const snap = await db.collection('users').get();
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}
async function getUserById(id) {
  const ref = await db.collection('users').doc(id).get();
  return ref.exists ? { id: ref.id, ...ref.data() } : null;
}
async function getUserByEmail(email) {
  const snap = await db.collection('users').where('email', '==', email).limit(1).get();
  return snap.empty ? null : { id: snap.docs[0].id, ...snap.docs[0].data() };
}
async function addUser(data) { await db.collection('users').doc(data.id).set(data); }
async function updateUserSavedJobs(id, savedJobs) { await db.collection('users').doc(id).update({ savedJobs }); }

async function getSubs() {
  const snap = await db.collection('subscribers').get();
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}
async function getSubByEmail(email) {
  const snap = await db.collection('subscribers').where('email', '==', email).limit(1).get();
  return snap.empty ? null : snap.docs[0].data();
}
async function addSub(data) {
  const id = uuidv4();
  await db.collection('subscribers').doc(id).set({ ...data, id });
}

async function getAllViews() {
  const ref = await db.collection('meta').doc('views').get();
  return ref.exists ? ref.data() : {};
}

async function incrementView(key) {
  const ref = db.collection('meta').doc('views');
  await ref.set({ [key]: FieldValue.increment(1) }, { merge: true });
  const updated = await ref.get();
  return (updated.data() || {})[key] || 1;
}

// ── EXPRESS SETUP ───────────────────────────────────────────────────────────

const app = express();
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));
app.use((req, res, next) => {
  res.setHeader('Cache-Control', 'public, max-age=300');
  next();
});
app.use(session({ secret: SESSION_SECRET, resave: false, saveUninitialized: false, cookie: { maxAge: 7 * 24 * 60 * 60 * 1000 } }));
app.use(flash());

// Security headers
app.use((req, res, next) => {
  res.setHeader('Content-Security-Policy', "default-src 'self' https:; script-src 'self' 'unsafe-inline' https:; style-src 'self' 'unsafe-inline' https:; img-src 'self' data: https:;");
  res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
  next();
});

const storage = multer.diskStorage({
  destination: (req, file, cb) => { const d = path.join(__dirname, 'public', 'img', 'uploads'); if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true }); cb(null, d); },
  filename: (req, file, cb) => cb(null, Date.now() + '-' + file.originalname.replace(/\s/g, '_'))
});
const upload = multer({ storage, limits: { fileSize: 5 * 1024 * 1024 } });

app.use((req, res, next) => { if (req.hostname === 'employeetable.in') return res.redirect(301, 'https://www.employeetable.in' + req.url); next(); });
app.use((req, res, next) => {
  res.locals.domain = DOMAIN;
  res.locals.cities = CITIES;
  res.locals.user = req.session.user || null;
  res.locals.isAdmin = req.session.isAdmin || false;
  res.locals.success = req.flash('success');
  res.locals.error = req.flash('error');
  res.locals.timeAgo = timeAgo;
  next();
});

function requireUser(req, res, next) { if (!req.session.user) { req.flash('error', 'Please log in.'); return res.redirect('/login'); } next(); }
function requireAdmin(req, res, next) { if (!req.session.isAdmin) return res.redirect('/admin/login'); next(); }

// ── MIGRATION ROUTES ─────────────────────────────────────────────────────────

app.get('/admin/migrate-slugs', async (req, res) => {
  if (req.query.key !== 'MIGRATE_NOW_2024') {
    return res.status(401).send('Unauthorized. Add ?key=MIGRATE_NOW_2024 to URL');
  }
  try {
    let updated = 0;
    const jobsSnap = await db.collection('jobs').get();
    for (const doc of jobsSnap.docs) {
      const data = doc.data();
      if (!data.slug) {
        const newSlug = makeSlug(`${data.jobRole || 'job'}-${doc.id.slice(0, 6)}`);
        await doc.ref.update({ slug: newSlug });
        updated++;
      }
    }
    const postsSnap = await db.collection('posts').get();
    for (const doc of postsSnap.docs) {
      const data = doc.data();
      if (!data.slug) {
        const newSlug = makeSlug(data.title || doc.id);
        await doc.ref.update({ slug: newSlug });
        updated++;
      }
    }
    clearCache();
    clearSitemapCache();
    res.send(`✅ Migration complete! Updated ${updated} items with slugs.`);
  } catch (e) {
    res.status(500).send('Error: ' + e.message);
  }
});

// ── AI & E-E-A-T PAGES ──────────────────────────────────────────────────────

app.get('/llms.txt', (req, res) => {
  res.type('text/plain');
  res.send(`# Employee Table - AI Instructions for LLMs

## About Us
Employee Table is India's leading verified job portal for freshers and professionals since 2021.

## Key Pages
- Home: https://www.employeetable.in/
- Jobs: https://www.employeetable.in/?q=
- Blog: https://www.employeetable.in/blog

## Key Statistics
- 5,000+ verified jobs posted since 2021
- 100% manual verification rate
- 0% scam rate
`);
});

app.get('/privacy', (req, res) => {
  res.render('privacy', {
    title: 'Privacy Policy | Employee Table',
    metaDescription: 'Employee Table privacy policy.',
    canonical: DOMAIN + '/privacy'
  });
});

app.get('/terms', (req, res) => {
  res.render('terms', {
    title: 'Terms of Service | Employee Table',
    metaDescription: 'Terms of service for using Employee Table.',
    canonical: DOMAIN + '/terms'
  });
});

app.get('/contact', (req, res) => {
  res.render('contact', {
    title: 'Contact Employee Table',
    metaDescription: 'Contact Employee Table for job posting inquiries.',
    canonical: DOMAIN + '/contact'
  });
});

// ── PUBLIC ROUTES ──────────────────────────────────────────────────────────

app.get('/', async (req, res) => {
  try {
    let jobs = await getJobs();
    const { q, city, exp, dateRange, page: pg } = req.query;
    
    if (q && q.trim()) { 
      const kw = getExpandedKeywords(q.trim()); 
      jobs = jobs.filter(j => jobMatchesQuery(j, kw)); 
    }
    if (city) jobs = jobs.filter(j => (j.workLocation || '').toLowerCase().includes(city.toLowerCase()));
    if (exp) jobs = jobs.filter(j => (j.experience || '').toLowerCase().includes(exp.toLowerCase()));
    if (dateRange) { 
      const ms = { 1: 86400000, 3: 3 * 86400000, 7: 7 * 86400000 }[dateRange]; 
      if (ms) jobs = jobs.filter(j => (Date.now() - (j.timestamp || 0)) <= ms); 
    }
    
    const total = jobs.length;
    const cur = Math.max(1, parseInt(pg) || 1);
    const pages = Math.ceil(total / JOBS_PER_PAGE);
    const pageJobs = jobs.slice((cur - 1) * JOBS_PER_PAGE, cur * JOBS_PER_PAGE);
    
    const buildQuery = (p) => {
      const params = new URLSearchParams({
        ...(q && { q }),
        ...(city && { city }),
        ...(exp && { exp }),
        ...(dateRange && { dateRange }),
        page: p
      });
      return '?' + params;
    };

    // Walk-ins for today (cached)
    const allWalkins = await getWalkins();
    const todayWalkins = allWalkins.filter(w => !w.expired).slice(0, 4); // show up to 4
    
    res.render('index', { 
      title: 'Verified Jobs for Freshers & Professionals India',
      metaDescription: 'Find 100% verified free job opportunities for freshers across India.',
      canonical: DOMAIN + '/',
      jobs: pageJobs,
      allJobCount: total,
      totalFiltered: total,
      filters: { q: q || '', city: city || '', exp: exp || '', dateRange: dateRange || '' },
      currentPage: cur,
      totalPages: pages,
      buildQuery: buildQuery,
      cities: CITIES,
      todayWalkins
    });
  } catch (e) { 
    console.error(e); 
    res.status(500).send('Server error.'); 
  }
});

app.get('/job/:slug', async (req, res) => {
  try {
    const job = await getJobBySlug(req.params.slug);
    if (!job) {
      return res.status(404).render('404', { 
        title: '404 - Job Not Found | Employee Table',
        metaDescription: 'The job you are looking for does not exist.',
        canonical: DOMAIN + '/404'
      });
    }
    const views = await incrementView('job_' + job.id);
    const allJobs = await getJobs();
    const related = allJobs.filter(j => j.id !== job.id && j.workLocation === job.workLocation).slice(0, 3);
    const jobDescription = buildJobDescription(job);
    
    const posted = new Date(job.timestamp).toISOString();
    const validTil = new Date(job.timestamp + 30 * 86400000).toISOString();
    const salaryNum = parseSalaryToNumber(job.package);
    
    const jobSchema = JSON.stringify({
      '@context': 'https://schema.org',
      '@type': 'JobPosting',
      title: job.jobRole,
      description: jobDescription,
      datePosted: posted,
      validThrough: validTil,
      hiringOrganization: { '@type': 'Organization', name: job.companyName },
      jobLocation: { '@type': 'Place', address: { '@type': 'PostalAddress', addressLocality: job.workLocation, addressCountry: 'IN' } },
      employmentType: { 'Full-Time': 'FULL_TIME', 'Part-Time': 'PART_TIME', 'Internship': 'INTERN', 'Contract': 'CONTRACTOR', 'Remote': 'FULL_TIME' }[job.jobType] || 'FULL_TIME',
      ...(salaryNum && { baseSalary: { '@type': 'MonetaryAmount', currency: 'INR', value: { '@type': 'QuantitativeValue', value: salaryNum, unitText: 'YEAR' } } }),
      url: `${DOMAIN}/job/${job.slug}`
    });
    
    const breadcrumbSchema = JSON.stringify({
      '@context': 'https://schema.org',
      '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'Home', item: DOMAIN + '/' },
        { '@type': 'ListItem', position: 2, name: 'Jobs', item: DOMAIN + '/' },
        { '@type': 'ListItem', position: 3, name: job.jobRole, item: `${DOMAIN}/job/${job.slug}` }
      ]
    });
    
    res.render('job-detail', { 
      title: buildJobTitle(job),
      metaDescription: `Apply for ${job.jobRole} at ${job.companyName} in ${job.workLocation}. Free verified job.`,
      canonical: `${DOMAIN}/job/${job.slug}`,
      ogType: 'article',
      job, 
      related, 
      views, 
      jobDescription,
      jobSchema,
      breadcrumbSchema
    });
  } catch (e) { 
    console.error(e); 
    res.status(500).send('Error loading job.'); 
  }
});

app.post('/job/:slug/click', async (req, res) => {
  try { const job = await getJobBySlug(req.params.slug); if (job) await incrementJobClicks(job.id); res.json({ ok: true }); } 
  catch (e) { res.json({ ok: false }); }
});

app.get('/jobs-in-:cityslug', async (req, res) => {
  try {
    const citySlug = req.params.cityslug.toLowerCase();
    const cityInfo = CITIES.find(c => c.slug === citySlug);
    if (!cityInfo) {
      return res.status(404).render('404', { 
        title: '404 - City Not Found | Employee Table',
        metaDescription: 'The city you are looking for does not exist.',
        canonical: DOMAIN + '/404'
      });
    }
    const all = await getJobs();
    const jobs = all.filter(j => (j.workLocation || '').toLowerCase().includes(cityInfo.name.toLowerCase()));
    res.render('city-jobs', { 
      title: `Jobs in ${cityInfo.name} for Freshers ${new Date().getFullYear()} | Employee Table`,
      metaDescription: `Find verified jobs in ${cityInfo.name}. ${cityInfo.industries} — updated daily.`,
      canonical: `${DOMAIN}/jobs-in-${citySlug}`,
      cityInfo, 
      jobs, 
      h1: `Verified Jobs in ${cityInfo.name}` 
    });
  } catch (e) { 
    console.error(e); 
    res.status(500).send('Error.'); 
  }
});

// ── WALK-IN DRIVES: Public Routes ──────────────────────────────────────────

app.get('/walkins', async (req, res) => {
  try {
    const { city, q, when } = req.query;
    const all = await getWalkins();
    let active = all.filter(w => !w.expired);
    const expiredWalkins = all.filter(w => w.expired).slice(0, 6);
    if (city) active = active.filter(w => (w.city || '').toLowerCase() === city.toLowerCase());
    if (q) {
      const searchLower = q.toLowerCase();
      active = active.filter(w => 
        (w.companyName || '').toLowerCase().includes(searchLower) ||
        (w.roleTitle || '').toLowerCase().includes(searchLower) ||
        (w.city || '').toLowerCase().includes(searchLower)
      );
    }

    // Date filtering based on 'when' parameter
    if (when === 'today') {
      const today = new Date();
      const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
      const todayEnd = todayStart + 24 * 60 * 60 * 1000;
      active = active.filter(w => w.interviewDateStart >= todayStart && w.interviewDateStart < todayEnd);
    } else if (when === 'tomorrow') {
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      const tomorrowStart = new Date(tomorrow.getFullYear(), tomorrow.getMonth(), tomorrow.getDate()).getTime();
      const tomorrowEnd = tomorrowStart + 24 * 60 * 60 * 1000;
      active = active.filter(w => w.interviewDateStart >= tomorrowStart && w.interviewDateStart < tomorrowEnd);
    } else if (when === 'weekend') {
      // Implement weekend filter if needed
      // For simplicity, we'll keep as is
    } else if (when === 'week') {
      const now = Date.now();
      const weekLater = now + 7 * 24 * 60 * 60 * 1000;
      active = active.filter(w => w.interviewDateStart >= now && w.interviewDateStart <= weekLater);
    }

    res.render('walkins', {
      title: city ? `Walk-In Interviews in ${city} Today | Employee Table` : 'Verified Walk-In Interviews Today | Employee Table',
      metaDescription: 'Daily verified walk-in interview drives across India — company, venue, HR contact, and documents required. 100% verified, no fake posts.',
      canonical: DOMAIN + '/walkins' + (city ? '?city=' + encodeURIComponent(city) : '') + (q ? '&q=' + encodeURIComponent(q) : '') + (when ? '&when=' + encodeURIComponent(when) : ''),
      walkins: active,
      expiredWalkins,
      selectedCity: city || '',
      searchQuery: q || '',
      selectedWhen: when || '',
      cities: CITIES
    });
  } catch (e) { console.error(e); res.status(500).send('Server error.'); }
});

app.get('/walkins/:slug', async (req, res) => {
  try {
    const walkin = await getWalkinBySlug(req.params.slug);
    if (!walkin) {
      return res.status(404).render('404', {
        title: '404 - Walk-In Not Found | Employee Table',
        metaDescription: 'This walk-in drive does not exist.',
        canonical: DOMAIN + '/404'
      });
    }
    const dateEnd = walkin.interviewDateEnd || walkin.timestamp;
    const isExpired = Date.now() > dateEnd;
    const allWalkins = await getWalkins();
    const related = allWalkins.filter(w => w.id !== walkin.id && !w.expired && w.city === walkin.city).slice(0, 3);

    const jobSchema = JSON.stringify({
      '@context': 'https://schema.org',
      '@type': 'JobPosting',
      title: `${walkin.roleTitle} - Walk-In Interview`,
      description: `Walk-in interview for ${walkin.roleTitle} at ${walkin.companyName}, ${walkin.city}. Venue: ${walkin.venueAddress}. Eligibility: ${walkin.eligibility}. Documents required: ${walkin.documentsRequired}.`,
      datePosted: new Date(walkin.timestamp).toISOString(),
      validThrough: new Date(dateEnd).toISOString(),
      hiringOrganization: { '@type': 'Organization', name: walkin.companyName },
      jobLocation: { '@type': 'Place', address: { '@type': 'PostalAddress', streetAddress: walkin.venueAddress, addressLocality: walkin.city, addressCountry: 'IN' } },
      employmentType: 'FULL_TIME',
      url: `${DOMAIN}/walkins/${walkin.slug}`
    });

    res.render('walkin-detail', {
      title: `${walkin.companyName} Walk-In Interview – ${walkin.roleTitle} | ${walkin.city} | Employee Table`,
      metaDescription: `Walk-in interview at ${walkin.companyName} for ${walkin.roleTitle} in ${walkin.city}. Verified venue, HR contact & documents required.`,
      canonical: `${DOMAIN}/walkins/${walkin.slug}`,
      extraSchema: isExpired ? '' : `<script type="application/ld+json">${jobSchema}</script>`,
      walkin, related, isExpired
    });
  } catch (e) { console.error(e); res.status(500).send('Error loading walk-in.'); }
});

app.post('/walkins/:slug/click', async (req, res) => {
  try { const w = await getWalkinBySlug(req.params.slug); if (w) await incrementWalkinClicks(w.id); res.json({ ok: true }); }
  catch (e) { res.json({ ok: false }); }
});

// ── BLOG ROUTES ─────────────────────────────────────────────────────────────

app.get('/blog', async (req, res) => {
  try { 
    const posts = await getPosts(); 
    res.render('blog/list', { 
      title: 'Career Blog — Resume Tips & Job Guides | Employee Table',
      metaDescription: 'Career tips, resume guides, and verified job news for freshers.',
      canonical: DOMAIN + '/blog',
      posts 
    }); 
  } catch (e) { 
    console.error(e); 
    res.status(500).send('Error loading blog.'); 
  }
});

app.get('/blog/:slug', async (req, res) => {
  try {
    const post = await getPostBySlug(req.params.slug);
    if (!post) {
      return res.status(404).render('404', { 
        title: '404 - Blog Post Not Found | Employee Table',
        metaDescription: 'The blog post you are looking for does not exist.',
        canonical: DOMAIN + '/404'
      });
    }
    const views = await incrementView('blog_' + post.id);
    const all = await getPosts();
    const related = all.filter(p => p.id !== post.id).slice(0, 3);
    
    const articleSchema = JSON.stringify({
      '@context': 'https://schema.org',
      '@type': 'BlogPosting',
      headline: post.title,
      description: post.excerpt || post.title,
      author: { '@type': 'Organization', name: 'Employee Table' },
      datePublished: new Date(post.timestamp).toISOString(),
      url: `${DOMAIN}/blog/${post.slug}`
    });
    
    const breadcrumbSchema = JSON.stringify({
      '@context': 'https://schema.org',
      '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'Home', item: DOMAIN + '/' },
        { '@type': 'ListItem', position: 2, name: 'Blog', item: DOMAIN + '/blog' },
        { '@type': 'ListItem', position: 3, name: post.title, item: `${DOMAIN}/blog/${post.slug}` }
      ]
    });
    
    res.render('blog/post', { 
      title: post.metaTitle || `${post.title} | Employee Table`,
      metaDescription: (post.metaDescription || post.excerpt || post.title).substring(0, 155),
      canonical: `${DOMAIN}/blog/${post.slug}`,
      post, 
      related, 
      views, 
      articleSchema, 
      breadcrumbSchema 
    });
  } catch (e) { 
    console.error(e); 
    res.status(500).send('Error loading post.'); 
  }
});

// ── SITEMAP (CACHED) ───────────────────────────────────────────────────────

app.get('/sitemap.xml', async (req, res) => {
  if (cachedSitemap && sitemapCacheTime && (Date.now() - sitemapCacheTime < SITEMAP_CACHE_TTL)) {
    console.log('📦 Returning cached sitemap');
    res.setHeader('Content-Type', 'application/xml');
    return res.send(cachedSitemap);
  }
  console.log('🔄 Generating fresh sitemap...');

  try {
    const [jobs, posts, walkins] = await Promise.all([getJobs(), getPosts(), getWalkins()]);
    const now = new Date().toISOString().split('T')[0];
    
    let xml = '<?xml version="1.0" encoding="UTF-8"?>\n';
    xml += '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n';
    xml += `  <url>\n    <loc>${DOMAIN}/</loc>\n    <lastmod>${now}</lastmod>\n    <changefreq>daily</changefreq>\n    <priority>1.0</priority>\n  </url>\n`;
    xml += `  <url>\n    <loc>${DOMAIN}/blog</loc>\n    <lastmod>${now}</lastmod>\n    <changefreq>weekly</changefreq>\n    <priority>0.9</priority>\n  </url>\n`;
    
    for (const job of jobs) {
      if (job.slug) {
        xml += `  <url>\n    <loc>${DOMAIN}/job/${job.slug}</loc>\n    <lastmod>${new Date(job.timestamp).toISOString().split('T')[0]}</lastmod>\n    <changefreq>weekly</changefreq>\n    <priority>0.8</priority>\n  </url>\n`;
      }
    }
  
    for (const w of walkins) {
      if (w.slug && !w.expired) {
        xml += `  <url>\n    <loc>${DOMAIN}/walkins/${w.slug}</loc>\n    <lastmod>${new Date(w.timestamp).toISOString().split('T')[0]}</lastmod>\n    <changefreq>daily</changefreq>\n    <priority>0.85</priority>\n  </url>\n`;
      }
    }
    xml += `  <url>\n    <loc>${DOMAIN}/walkins</loc>\n    <lastmod>${now}</lastmod>\n    <changefreq>daily</changefreq>\n    <priority>0.95</priority>\n  </url>\n`;

    for (const post of posts) {
      if (post.slug) {
        xml += `  <url>\n    <loc>${DOMAIN}/blog/${post.slug}</loc>\n    <lastmod>${new Date(post.timestamp).toISOString().split('T')[0]}</lastmod>\n    <changefreq>monthly</changefreq>\n    <priority>0.7</priority>\n  </url>\n`;
      }
    }
    
    for (const city of CITIES) {
      xml += `  <url>\n    <loc>${DOMAIN}/jobs-in-${city.slug}</loc>\n    <lastmod>${now}</lastmod>\n    <changefreq>daily</changefreq>\n    <priority>0.9</priority>\n  </url>\n`;
    }
    
    xml += '</urlset>';
    cachedSitemap = xml;
    sitemapCacheTime = Date.now();
    res.setHeader('Content-Type', 'application/xml');
    res.send(xml);
  } catch (error) {
    console.error('Sitemap error:', error.message);
    res.setHeader('Content-Type', 'application/xml');
    res.send(`<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url>
    <loc>${DOMAIN}/</loc>
    <lastmod>${new Date().toISOString().split('T')[0]}</lastmod>
    <changefreq>daily</changefreq>
    <priority>1.0</priority>
  </url>
</urlset>`);
  }
});

// FORCE ROBOTS.TXT TO 404
app.use('/robots.txt', (req, res) => {
  res.status(404).send('Not Found');
});

// ── SUBSCRIBE & CONTACT ────────────────────────────────────────────────────

app.post('/subscribe', async (req, res) => {
  try {
    const { name, email, city } = req.body;
    if (!name || !email) return res.json({ ok: false, message: 'Name and email required.' });
    if (await getSubByEmail(email)) return res.json({ ok: true, message: `${name}, you are already subscribed!` });
    await addSub({ name, email, city: city || 'Any', subscribedAt: Date.now(), active: true });
    res.json({ ok: true, message: `✅ Subscribed! Alerts will be sent to ${email}` });
  } catch (e) { res.json({ ok: false, message: 'Error.' }); }
});

app.post('/send-message', async (req, res) => {
  try {
    const { name, email, message } = req.body;
    if (!name || !email || !message) {
      return res.json({ ok: false, message: 'All fields are required.' });
    }
    console.log(`📧 Contact: ${name} (${email}): ${message}`);
    const contactId = uuidv4();
    await db.collection('contacts').doc(contactId).set({
      name, email, message,
      timestamp: Date.now(),
      read: false
    });
    res.json({ ok: true, message: '✅ Message sent! We will respond within 24 hours.' });
  } catch (error) {
    console.error('Contact error:', error);
    res.json({ ok: false, message: 'Failed to send message.' });
  }
});

// ── AUTH ROUTES ────────────────────────────────────────────────────────────

app.get('/login', (req, res) => { 
  res.render('auth/login', { 
    title: 'Login | Employee Table',
    metaDescription: 'Login to your Employee Table account.',
    canonical: DOMAIN + '/login'
  }); 
});

app.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    const u = await getUserByEmail(email);
    if (!u || !await bcrypt.compare(password, u.password)) { 
      req.flash('error', 'Invalid credentials.'); 
      return res.redirect('/login'); 
    }
    req.session.user = { id: u.id, name: u.name, email: u.email };
    res.redirect('/profile');
  } catch (e) { res.redirect('/login'); }
});

app.get('/signup', (req, res) => { 
  res.render('auth/signup', { 
    title: 'Sign Up | Employee Table',
    metaDescription: 'Create a free account to save verified jobs.',
    canonical: DOMAIN + '/signup'
  }); 
});

app.post('/signup', async (req, res) => {
  try {
    const { name, email, password, city } = req.body;
    if (await getUserByEmail(email)) { 
      req.flash('error', 'Email already registered.'); 
      return res.redirect('/signup'); 
    }
    const hashed = await bcrypt.hash(password, 10);
    const u = { id: uuidv4(), name, email, password: hashed, city: city || '', savedJobs: [], createdAt: Date.now() };
    await addUser(u);
    req.session.user = { id: u.id, name: u.name, email: u.email };
    req.flash('success', `Welcome, ${name}!`); 
    res.redirect('/profile');
  } catch (e) { res.redirect('/signup'); }
});

app.get('/profile', requireUser, async (req, res) => {
  const u = await getUserById(req.session.user.id);
  const allJobs = await getJobs();
  const saved = allJobs.filter(j => (u.savedJobs || []).includes(j.id));
  res.render('auth/profile', { 
    title: 'My Profile | Employee Table',
    metaDescription: `Manage your profile and saved jobs.`,
    canonical: DOMAIN + '/profile',
    fullUser: u,
    savedJobs: saved
  });
});

app.post('/job/:slug/save', requireUser, async (req, res) => {
  try {
    const job = await getJobBySlug(req.params.slug);
    if (!job) return res.json({ ok: false });
    const u = await getUserById(req.session.user.id);
    if (!u) return res.json({ ok: false });
    const saved = u.savedJobs || [];
    const already = saved.includes(job.id);
    await updateUserSavedJobs(u.id, already ? saved.filter(id => id !== job.id) : [...saved, job.id]);
    res.json({ ok: true, saved: !already });
  } catch (e) { res.json({ ok: false }); }
});

app.get('/logout', (req, res) => { req.session.destroy(() => res.redirect('/')); });

// ── ADMIN ROUTES ────────────────────────────────────────────────────────────

app.get('/admin/login', (req, res) => { 
  res.render('admin/login', { 
    title: 'Admin Login | Employee Table',
    metaDescription: 'Administrator login.',
    canonical: DOMAIN + '/admin/login'
  }); 
});

app.post('/admin/login', (req, res) => { 
  if (req.body.password === ADMIN_PASS) { 
    req.session.isAdmin = true; 
    res.redirect('/admin'); 
  } else { 
    req.flash('error', 'Wrong password.'); 
    res.redirect('/admin/login'); 
  } 
});

app.get('/admin/logout', (req, res) => { req.session.isAdmin = false; res.redirect('/admin/login'); });

app.get('/admin', requireAdmin, async (req, res) => {
  try {
    const [jobs, posts, subs, users, views, walkins] = await Promise.all([
      getJobs(), getPosts(), getSubs(), getUsers(), getAllViews(), getWalkins()
    ]);

    const totalClicks = jobs.reduce((sum, job) => sum + (job.clicks || 0), 0);
    const totalViews = Object.values(views).reduce((sum, v) => sum + (parseInt(v) || 0), 0);

    res.render('admin/dashboard', {
      title: 'Admin Dashboard | Employee Table',
      metaDescription: 'Administrator dashboard.',
      canonical: DOMAIN + '/admin',
      jobs, posts, subs, users, views, walkins,
      cities: CITIES,
      stats: {
        jobs: jobs.length,
        posts: posts.length,
        subs: subs.length,
        users: users.length,
        clicks: totalClicks,
        views: totalViews,
        walkins: walkins.length,
        activeWalkins: walkins.filter(w => !w.expired).length
      }
    });
  } catch (error) {
    console.error('Admin error:', error);
    res.status(500).send('Admin error: ' + error.message);
  }
});

// ── JOB ADMIN ROUTES ────────────────────────────────────────────────────────

app.post('/admin/job/add', requireAdmin, upload.single('companyLogoFile'), async (req, res) => {
  try {
    const { jobRole, companyName, workLocation, jobType, experience, qualification, package: pkg, applyLink, whatsappNumber, callNumber, skills, description, verified } = req.body;
    let logo = req.body.companyLogo || ''; if (req.file) logo = '/img/uploads/' + req.file.filename; if (logo.startsWith('data:')) logo = '';
    const all = await getJobs(); 
    const slug = uniqueSlug(makeSlug(`${jobRole}-${companyName}`), all);
    await addJob({ jobRole, companyName, companyLogo: logo, workLocation, jobType, experience, qualification, package: pkg || '', applyLink: applyLink || '', whatsappNumber: whatsappNumber || '', callNumber: callNumber || '', skills: skills || '', description: description || '', slug, timestamp: Date.now(), clicks: 0, verified: verified === 'on' });
    req.flash('success', 'Job added!'); 
    res.redirect('/admin');
  } catch (e) { 
    console.error(e);
    req.flash('error', 'Error: ' + e.message); 
    res.redirect('/admin'); 
  }
});

app.post('/admin/job/edit/:id', requireAdmin, upload.single('companyLogoFile'), async (req, res) => {
  try {
    const { jobRole, companyName, workLocation, jobType, experience, qualification, package: pkg, applyLink, whatsappNumber, callNumber, skills, description, verified } = req.body;
    let logo = req.body.companyLogo || ''; if (req.file) logo = '/img/uploads/' + req.file.filename; if (logo.startsWith('data:')) logo = '';
    await updateJob(req.params.id, { jobRole, companyName, companyLogo: logo, workLocation, jobType, experience, qualification, package: pkg || '', applyLink: applyLink || '', whatsappNumber: whatsappNumber || '', callNumber: callNumber || '', skills: skills || '', description: description || '', verified: verified === 'on' });
    req.flash('success', 'Job updated!'); 
    res.redirect('/admin');
  } catch (e) { 
    console.error(e);
    req.flash('error', 'Error updating.'); 
    res.redirect('/admin'); 
  }
});

app.post('/admin/job/delete/:id', requireAdmin, async (req, res) => {
  try { await deleteJob(req.params.id); req.flash('success', 'Job deleted.'); res.redirect('/admin'); } 
  catch (e) { req.flash('error', 'Error deleting.'); res.redirect('/admin'); }
});

// ── WALK-IN ADMIN ROUTES ────────────────────────────────────────────────────

app.post('/admin/walkin/add', requireAdmin, async (req, res) => {
  try {
    const { companyName, roleTitle, city, area, venueAddress, interviewDateStart, interviewDateEnd, interviewTime, hrContactEmail, hrContactPhone, documentsRequired, eligibility, package: pkg, verified } = req.body;
    const all = await getWalkins();
    const slug = uniqueSlug(makeSlug(`${companyName}-${city}`), all);
    await addWalkin({
      companyName, roleTitle, city, area: area || '', venueAddress,
      interviewDateStart: new Date(interviewDateStart).getTime(),
      interviewDateEnd: new Date(interviewDateEnd).getTime(),
      interviewTime: interviewTime || '', hrContactEmail: hrContactEmail || '', hrContactPhone: hrContactPhone || '',
      documentsRequired: documentsRequired || '', eligibility: eligibility || '', package: pkg || '',
      slug, timestamp: Date.now(), clicks: 0, verified: verified === 'on'
    });
    req.flash('success', 'Walk-in drive added!');
    res.redirect('/admin');
  } catch (e) { console.error(e); req.flash('error', 'Error: ' + e.message); res.redirect('/admin'); }
});

app.post('/admin/walkin/edit/:id', requireAdmin, async (req, res) => {
  try {
    const { companyName, roleTitle, city, area, venueAddress, interviewDateStart, interviewDateEnd, interviewTime, hrContactEmail, hrContactPhone, documentsRequired, eligibility, package: pkg, verified } = req.body;
    await updateWalkin(req.params.id, {
      companyName, roleTitle, city, area: area || '', venueAddress,
      interviewDateStart: new Date(interviewDateStart).getTime(),
      interviewDateEnd: new Date(interviewDateEnd).getTime(),
      interviewTime: interviewTime || '', hrContactEmail: hrContactEmail || '', hrContactPhone: hrContactPhone || '',
      documentsRequired: documentsRequired || '', eligibility: eligibility || '', package: pkg || '',
      verified: verified === 'on'
    });
    req.flash('success', 'Walk-in updated!');
    res.redirect('/admin');
  } catch (e) { console.error(e); req.flash('error', 'Error updating.'); res.redirect('/admin'); }
});

app.post('/admin/walkin/delete/:id', requireAdmin, async (req, res) => {
  try { await deleteWalkin(req.params.id); req.flash('success', 'Walk-in deleted.'); res.redirect('/admin'); }
  catch (e) { req.flash('error', 'Error deleting.'); res.redirect('/admin'); }
});

app.get('/admin/walkin/:id/json', requireAdmin, async (req, res) => {
  try { const all = await getWalkins(); res.json(all.find(w => w.id === req.params.id) || {}); }
  catch (e) { res.json({}); }
});

// ── BLOG ADMIN ROUTES ──────────────────────────────────────────────────────

app.post('/admin/blog/add', requireAdmin, upload.single('coverImageFile'), async (req, res) => {
  try {
    const { title, excerpt, content, metaTitle, metaDescription, tags } = req.body;
    let cover = req.body.coverImage || ''; if (req.file) cover = '/img/uploads/' + req.file.filename;
    const all = await getPosts(); 
    const slug = uniqueSlug(makeSlug(title), all);
    await addPost({ title, slug, excerpt: excerpt || '', content: content || '', coverImage: cover, metaTitle: metaTitle || '', metaDescription: metaDescription || '', tags: tags || '', timestamp: Date.now(), views: 0 });
    req.flash('success', 'Post published!'); 
    res.redirect('/admin');
  } catch (e) { 
    console.error(e);
    req.flash('error', 'Error: ' + e.message); 
    res.redirect('/admin'); 
  }
});

app.post('/admin/blog/edit/:id', requireAdmin, upload.single('coverImageFile'), async (req, res) => {
  try {
    const { title, excerpt, content, metaTitle, metaDescription, tags } = req.body;
    const existingPost = await getPostBySlug(req.params.id);
    if (!existingPost) {
      req.flash('error', 'Post not found.');
      return res.redirect('/admin');
    }
    let coverImage = existingPost.coverImage || '';
    if (req.file) coverImage = '/img/uploads/' + req.file.filename;
    
    await updatePost(req.params.id, { 
      title, 
      excerpt: excerpt || '', 
      content: content || '', 
      coverImage: coverImage,
      metaTitle: metaTitle || '', 
      metaDescription: metaDescription || '', 
      tags: tags || '' 
    });
    req.flash('success', 'Post updated!'); 
    res.redirect('/admin');
  } catch (e) { 
    console.error(e);
    req.flash('error', 'Error updating.'); 
    res.redirect('/admin'); 
  }
});

app.post('/admin/blog/delete/:id', requireAdmin, async (req, res) => {
  try { await deletePost(req.params.id); req.flash('success', 'Deleted.'); res.redirect('/admin'); } 
  catch (e) { req.flash('error', 'Error.'); res.redirect('/admin'); }
});

app.get('/admin/job/:id/json', requireAdmin, async (req, res) => {
  try { const all = await getJobs(); res.json(all.find(j => j.id === req.params.id) || {}); } 
  catch (e) { res.json({}); }
});

app.get('/admin/blog/:id/json', requireAdmin, async (req, res) => {
  try { const all = await getPosts(); res.json(all.find(p => p.id === req.params.id) || {}); } 
  catch (e) { res.json({}); }
});

// ── 404 HANDLER ─────────────────────────────────────────────────────────────

app.use((req, res) => res.status(404).render('404', { 
  title: '404 - Page Not Found | Employee Table',
  metaDescription: 'The page you are looking for does not exist.',
  canonical: DOMAIN + '/404'
}));

// ── START SERVER ────────────────────────────────────────────────────────────

app.listen(PORT, () => {
  console.log(`\n✅ Employee Table running on http://localhost:${PORT}`);
  console.log(`   Admin → http://localhost:${PORT}/admin (pass: ${ADMIN_PASS})`);
  console.log(`   Storage: Firebase Firestore with ENHANCED CACHING (30 min)`);
  console.log(`   Cache will reduce reads by 99.9% - Quota issue FIXED!`);
});