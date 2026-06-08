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
          throw new Error('serviceAccountKey.json is not valid JSON. Use env vars on Render.');
        }
        const key = JSON.parse(raw);
        admin.initializeApp({ credential: admin.credential.cert(key), projectId: PROJECT_ID });
        console.log('✅ Firebase: using serviceAccountKey.json');
      } else {
        throw new Error('No Firebase credentials found. Set FIREBASE_CLIENT_EMAIL and FIREBASE_PRIVATE_KEY env vars on Render.');
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
  { name:'Mumbai',    slug:'mumbai',    emoji:'🏙️', industries:'Finance, IT, Media',    about:'Mumbai is India\'s financial capital with thousands of verified jobs.' },
  { name:'Bangalore', slug:'bangalore', emoji:'💻', industries:'Tech, Startups, IT',     about:'Bangalore is India\'s Silicon Valley — home to Infosys, Wipro, Flipkart.' },
  { name:'Delhi',     slug:'delhi',     emoji:'🏛️', industries:'Govt, Corporate, MNC',  about:'Delhi NCR covers Delhi, Gurgaon and Noida — a major corporate hub.' },
  { name:'Hyderabad', slug:'hyderabad', emoji:'🔬', industries:'IT, Pharma, FMCG',      about:'Hyderabad is a fast-growing tech and pharma hub.' },
  { name:'Pune',      slug:'pune',      emoji:'🎓', industries:'Auto, IT, Education',   about:'Pune has a strong mix of automotive, IT, and education sector jobs.' },
  { name:'Noida',     slug:'noida',     emoji:'📡', industries:'IT, BPO, Startups',     about:'Noida is Delhi\'s tech and BPO neighbour.' },
  { name:'Chennai',   slug:'chennai',   emoji:'🌊', industries:'Manufacturing, IT',     about:'Chennai combines strong manufacturing with a growing IT sector.' },
  { name:'Remote',    slug:'remote',    emoji:'🌐', industries:'Work from anywhere',    about:'Remote jobs let you work from any city in India.' },
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

// ── Helpers ─────────────────────────────────────────────────────────────────
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

function buildJobDescription(job) {
  if (job.description && job.description.trim().length > 50) return job.description;
  let d = `${job.jobRole} opportunity at ${job.companyName} in ${job.workLocation}. `;
  d += `This is a ${job.jobType} role for candidates with ${job.experience} experience. `;
  if (job.qualification) d += `Required qualification: ${job.qualification}. `;
  if (job.skills) d += `Key skills: ${job.skills}. `;
  if (job.package && !['competitive','as per','industry'].some(s => (job.package || '').toLowerCase().includes(s))) d += `Salary: ${job.package}. `;
  d += `Manually verified by Employee Table — free to apply, no registration fee.`;
  return d;
}

function buildJobTitle(job) {
  const r = job.jobRole.length > 38 ? job.jobRole.substring(0, 36) + '…' : job.jobRole;
  return `${r} at ${job.companyName} — ${job.workLocation} | Employee Table`;
}

function timeAgo(ts) {
  if (!ts) return 'Recently';
  const d = Math.floor((Date.now() - ts) / 86400000);
  if (d === 0) return 'Today';
  if (d === 1) return 'Yesterday';
  if (d < 7) return d + ' days ago';
  return new Date(ts).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

function makeSlug(t) { return slugify(t || 'untitled', { lower: true, strict: true }); }

function uniqueSlug(base, list) {
  let s = base, i = 1;
  while (list.some(x => x.slug === s)) s = base + '-' + (i++);
  return s;
}

function docToJob(doc) {
  const d = doc.data();
  return {
    id: doc.id,
    jobRole: d.jobRole || 'Job Opening',
    companyName: d.companyName || 'Company',
    companyLogo: (d.companyLogo || '').startsWith('data:') ? '' : (d.companyLogo || ''),
    workLocation: d.workLocation || 'India',
    jobType: d.jobType || 'Full-Time',
    experience: d.experience || 'Fresher',
    qualification: d.qualification || 'Any Graduate',
    package: d.package || '',
    applyLink: d.applyLink || '',
    whatsappNumber: d.whatsappNumber || '',
    callNumber: d.callNumber || '',
    skills: d.skills || '',
    description: d.description || '',
    slug: d.slug || makeSlug(`${d.jobRole || 'job'}-${doc.id.slice(0, 6)}`),
    timestamp: d.timestamp || Date.now(),
    clicks: d.clicks || 0,
    verified: d.verified !== false,
  };
}

function docToPost(doc) {
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
}

// ── Firestore DB Operations ──────────────────────────────────────────────
async function getJobs() {
  const snap = await db.collection('jobs').orderBy('timestamp', 'desc').get();
  return snap.docs.map(docToJob);
}

async function getJobBySlug(slug) {
  const snap = await db.collection('jobs').where('slug', '==', slug).limit(1).get();
  if (!snap.empty) return docToJob(snap.docs[0]);
  const ref = await db.collection('jobs').doc(slug).get();
  return ref.exists ? docToJob(ref) : null;
}

async function addJob(data) {
  const id = uuidv4();
  await db.collection('jobs').doc(id).set({ ...data, id });
  return id;
}

async function updateJob(id, data) { await db.collection('jobs').doc(id).update(data); }
async function deleteJob(id) { await db.collection('jobs').doc(id).delete(); }
async function incrementJobClicks(id) { await db.collection('jobs').doc(id).update({ clicks: FieldValue.increment(1) }); }

async function getPosts() {
  const snap = await db.collection('posts').orderBy('timestamp', 'desc').get();
  return snap.docs.map(docToPost);
}

async function getPostBySlug(slug) {
  const snap = await db.collection('posts').where('slug', '==', slug).limit(1).get();
  if (!snap.empty) return docToPost(snap.docs[0]);
  const ref = await db.collection('posts').doc(slug).get();
  return ref.exists ? docToPost(ref) : null;
}

async function addPost(data) {
  const id = uuidv4();
  await db.collection('posts').doc(id).set({ ...data, id });
  return id;
}

async function updatePost(id, data) { await db.collection('posts').doc(id).update(data); }
async function deletePost(id) { await db.collection('posts').doc(id).delete(); }

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

// ── Express setup ───────────────────────────────────────────────────────────
const app = express();
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));
app.use(session({ secret: SESSION_SECRET, resave: false, saveUninitialized: false, cookie: { maxAge: 7 * 24 * 60 * 60 * 1000 } }));
app.use(flash());

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

// ── PUBLIC ROUTES ──────────────────────────────────────────────────────────
app.get('/', async (req, res) => {
  try {
    let jobs = await getJobs();
    const { q, city, exp, dateRange, page: pg } = req.query;
    if (q && q.trim()) { const kw = getExpandedKeywords(q.trim()); jobs = jobs.filter(j => jobMatchesQuery(j, kw)); }
    if (city) jobs = jobs.filter(j => (j.workLocation || '').toLowerCase().includes(city.toLowerCase()));
    if (exp) jobs = jobs.filter(j => (j.experience || '').toLowerCase().includes(exp.toLowerCase()));
    if (dateRange) { const ms = { 1: 86400000, 3: 3 * 86400000, 7: 7 * 86400000 }[dateRange]; if (ms) jobs = jobs.filter(j => (Date.now() - (j.timestamp || 0)) <= ms); }
    const total = jobs.length, cur = Math.max(1, parseInt(pg) || 1), pages = Math.ceil(total / JOBS_PER_PAGE);
    const pageJobs = jobs.slice((cur - 1) * JOBS_PER_PAGE, cur * JOBS_PER_PAGE);
    const buildQuery = p => { const params = new URLSearchParams({ ...(q && { q }), ...(city && { city }), ...(exp && { exp }), ...(dateRange && { dateRange }), page: p }); return '?' + params; };
    res.render('index', {
      title: 'Verified Free Jobs for Freshers & Professionals in India | Employee Table',
      metaDescription: 'Find 100% verified free job opportunities for freshers and experienced professionals across India. No fees, no scams since 2021.',
      canonical: DOMAIN + '/', ogType: 'website', jobs: pageJobs, allJobCount: total, totalFiltered: total,
      filters: { q: q || '', city: city || '', exp: exp || '', dateRange: dateRange || '' },
      currentPage: cur, totalPages: pages, buildQuery
    });
  } catch (e) { console.error(e); res.status(500).send('Server error.'); }
});

app.get('/job/:slug', async (req, res) => {
  try {
    const job = await getJobBySlug(req.params.slug);
    if (!job) return res.status(404).render('404', { title: '404 | Employee Table', metaDescription: '', canonical: DOMAIN, ogType: 'website' });
    const views = await incrementView('job_' + job.id);
    const allJobs = await getJobs();
    const related = allJobs.filter(j => j.id !== job.id && j.workLocation === job.workLocation).slice(0, 3);
    const posted = new Date(job.timestamp).toISOString(), validTil = new Date(job.timestamp + 30 * 86400000).toISOString();
    const salaryNum = parseSalaryToNumber(job.package), jobDescription = buildJobDescription(job);
    const jobSchema = JSON.stringify({
      '@context': 'https://schema.org', '@type': 'JobPosting', title: job.jobRole, description: jobDescription,
      datePosted: posted, validThrough: validTil,
      hiringOrganization: { '@type': 'Organization', name: job.companyName, ...(job.companyLogo && job.companyLogo.startsWith('http') && { logo: job.companyLogo }) },
      jobLocation: { '@type': 'Place', address: { '@type': 'PostalAddress', addressLocality: job.workLocation, addressCountry: 'IN' } },
      employmentType: ({ 'Full-Time': 'FULL_TIME', 'Part-Time': 'PART_TIME', 'Internship': 'INTERN', 'Contract': 'CONTRACTOR', 'Remote': 'FULL_TIME' })[job.jobType] || 'FULL_TIME',
      ...(salaryNum && { baseSalary: { '@type': 'MonetaryAmount', currency: 'INR', value: { '@type': 'QuantitativeValue', value: salaryNum, unitText: 'YEAR' } } }),
      experienceRequirements: job.experience, educationRequirements: job.qualification, url: `${DOMAIN}/job/${job.slug}`, directApply: true
    });
    res.render('job-detail', { title: buildJobTitle(job), metaDescription: `Apply for ${job.jobRole} at ${job.companyName}. Free verified job.`.substring(0, 155), canonical: `${DOMAIN}/job/${job.slug}`, ogType: 'article', job, related, views, jobSchema, jobDescription });
  } catch (e) { console.error(e); res.status(500).send('Error loading job.'); }
});

app.post('/job/:slug/click', async (req, res) => {
  try { const job = await getJobBySlug(req.params.slug); if (job) await incrementJobClicks(job.id); res.json({ ok: true }); } catch (e) { res.json({ ok: false }); }
});

app.get('/jobs-in-:cityslug', async (req, res) => {
  try {
    const citySlug = req.params.cityslug.toLowerCase();
    const cityInfo = CITIES.find(c => c.slug === citySlug);
    if (!cityInfo) return res.status(404).render('404', { title: '404 | Employee Table', metaDescription: '', canonical: DOMAIN, ogType: 'website' });
    const all = await getJobs();
    const jobs = all.filter(j => (j.workLocation || '').toLowerCase().includes(cityInfo.name.toLowerCase()));
    res.render('city-jobs', { title: `Jobs in ${cityInfo.name} for Freshers ${new Date().getFullYear()} | Employee Table`, metaDescription: `Find ${jobs.length > 0 ? jobs.length + '+' : 'latest'} verified jobs in ${cityInfo.name}.`, canonical: `${DOMAIN}/jobs-in-${citySlug}`, ogType: 'website', cityInfo, jobs, h1: `Verified Jobs in ${cityInfo.name}` });
  } catch (e) { console.error(e); res.status(500).send('Error.'); }
});

app.get('/blog', async (req, res) => {
  try { const posts = await getPosts(); res.render('blog/list', { title: 'Career Blog — Resume Tips & Job Guides | Employee Table', metaDescription: 'Career tips, resume guides, interview prep and verified job news.', canonical: DOMAIN + '/blog', ogType: 'website', posts }); } catch (e) { console.error(e); res.status(500).send('Error loading blog.'); }
});

app.get('/blog/:slug', async (req, res) => {
  try {
    const post = await getPostBySlug(req.params.slug);
    if (!post) return res.status(404).render('404', { title: '404 | Employee Table', metaDescription: '', canonical: DOMAIN, ogType: 'website' });
    const views = await incrementView('blog_' + post.id);
    const all = await getPosts();
    const related = all.filter(p => p.id !== post.id).slice(0, 3);
    res.render('blog/post', { title: post.metaTitle || `${post.title} | Employee Table`, metaDescription: (post.metaDescription || post.excerpt || post.title).substring(0, 155), canonical: `${DOMAIN}/blog/${post.slug}`, ogType: 'article', ogImage: post.coverImage || '', post, related, views });
  } catch (e) { console.error(e); res.status(500).send('Error loading post.'); }
});

app.get('/sitemap.xml', async (req, res) => {
  try {
    const [jobs, posts] = await Promise.all([getJobs(), getPosts()]);
    const now = new Date().toISOString().split('T')[0];
    const urls = [
      { loc: DOMAIN + '/', changefreq: 'daily', priority: '1.0', lastmod: now },
      { loc: DOMAIN + '/blog', changefreq: 'weekly', priority: '0.8', lastmod: now },
      ...CITIES.map(c => ({ loc: `${DOMAIN}/jobs-in-${c.slug}`, changefreq: 'daily', priority: '0.9', lastmod: now })),
      ...jobs.map(j => ({ loc: `${DOMAIN}/job/${j.slug}`, changefreq: 'weekly', priority: '0.8', lastmod: new Date(j.timestamp).toISOString().split('T')[0] })),
      ...posts.map(p => ({ loc: `${DOMAIN}/blog/${p.slug}`, changefreq: 'monthly', priority: '0.7', lastmod: new Date(p.timestamp).toISOString().split('T')[0] })),
    ];
    res.set('Content-Type', 'application/xml');
    res.send('<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' + urls.map(u => `  <url>\n    <loc>${u.loc}</loc>\n    <lastmod>${u.lastmod}</lastmod>\n    <changefreq>${u.changefreq}</changefreq>\n    <priority>${u.priority}</priority>\n  </url>`).join('\n') + '\n</urlset>');
  } catch (e) { res.status(500).send('Sitemap error.'); }
});

app.get('/robots.txt', (req, res) => { res.type('text/plain'); res.send(`User-agent: *\nAllow: /\n\nSitemap: ${DOMAIN}/sitemap.xml\n`); });

app.post('/subscribe', async (req, res) => {
  try {
    const { name, email, city } = req.body;
    if (!name || !email) return res.json({ ok: false, message: 'Name and email required.' });
    if (await getSubByEmail(email)) return res.json({ ok: true, message: `${name}, you are already subscribed!` });
    await addSub({ name, email, city: city || 'Any', subscribedAt: Date.now(), active: true });
    res.json({ ok: true, message: `✅ Subscribed! Alerts will be sent to ${email}` });
  } catch (e) { console.error(e); res.json({ ok: false, message: 'Error. Try again.' }); }
});

// ── AUTH ROUTES ────────────────────────────────────────────────────────────
app.get('/login', (req, res) => { if (req.session.user) return res.redirect('/profile'); res.render('auth/login', { title: 'Login | Employee Table', metaDescription: '', canonical: DOMAIN + '/login', ogType: 'website' }); });
app.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    const u = await getUserByEmail(email);
    if (!u) { req.flash('error', 'No account found.'); return res.redirect('/login'); }
    if (!await bcrypt.compare(password, u.password)) { req.flash('error', 'Wrong password.'); return res.redirect('/login'); }
    req.session.user = { id: u.id, name: u.name, email: u.email };
    req.flash('success', `Welcome back, ${u.name}!`); res.redirect('/profile');
  } catch (e) { console.error(e); req.flash('error', 'Login error.'); res.redirect('/login'); }
});
app.get('/signup', (req, res) => { if (req.session.user) return res.redirect('/profile'); res.render('auth/signup', { title: 'Sign Up | Employee Table', metaDescription: '', canonical: DOMAIN + '/signup', ogType: 'website' }); });
app.post('/signup', async (req, res) => {
  try {
    const { name, email, password, city } = req.body;
    if (!name || !email || !password) { req.flash('error', 'All fields required.'); return res.redirect('/signup'); }
    if (await getUserByEmail(email)) { req.flash('error', 'Email already registered.'); return res.redirect('/signup'); }
    const hashed = await bcrypt.hash(password, 10);
    const u = { id: uuidv4(), name, email, password: hashed, city: city || '', savedJobs: [], createdAt: Date.now() };
    await addUser(u);
    req.session.user = { id: u.id, name: u.name, email: u.email };
    req.flash('success', `Welcome, ${name}!`); res.redirect('/profile');
  } catch (e) { console.error(e); req.flash('error', 'Signup error.'); res.redirect('/signup'); }
});
app.get('/profile', requireUser, async (req, res) => {
  try {
    const u = await getUserById(req.session.user.id);
    const allJobs = await getJobs();
    const saved = allJobs.filter(j => (u.savedJobs || []).includes(j.id));
    res.render('auth/profile', { title: 'My Profile | Employee Table', metaDescription: '', canonical: DOMAIN + '/profile', ogType: 'website', fullUser: u, savedJobs: saved });
  } catch (e) { console.error(e); res.redirect('/'); }
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
  } catch (e) { console.error(e); res.json({ ok: false }); }
});
app.get('/logout', (req, res) => { req.session.destroy(() => res.redirect('/')); });

// ── ADMIN ROUTES ────────────────────────────────────────────────────────────
app.get('/admin/login', (req, res) => { if (req.session.isAdmin) return res.redirect('/admin'); res.render('admin/login', { title: 'Admin Login | Employee Table', metaDescription: '', canonical: DOMAIN, ogType: 'website' }); });
app.post('/admin/login', (req, res) => { if (req.body.password === ADMIN_PASS) { req.session.isAdmin = true; return res.redirect('/admin'); } req.flash('error', 'Wrong password.'); res.redirect('/admin/login'); });
app.get('/admin/logout', (req, res) => { req.session.isAdmin = false; res.redirect('/admin/login'); });

app.get('/admin', requireAdmin, async (req, res) => {
  try {
    const [jobs, posts, subs, users, views] = await Promise.all([getJobs(), getPosts(), getSubs(), getUsers(), getAllViews()]);
    res.render('admin/dashboard', {
      title: 'Admin Dashboard | Employee Table', metaDescription: '', canonical: DOMAIN, ogType: 'website',
      jobs, posts, subs, users, views,
      stats: { jobs: jobs.length, posts: posts.length, subs: subs.length, users: users.length, clicks: jobs.reduce((s, j) => s + (j.clicks || 0), 0), views: Object.values(views).reduce((s, v) => s + (parseInt(v) || 0), 0) }
    });
  } catch (e) { console.error(e); res.status(500).send('Admin error: ' + e.message); }
});

app.post('/admin/job/add', requireAdmin, upload.single('companyLogoFile'), async (req, res) => {
  try {
    const { jobRole, companyName, workLocation, jobType, experience, qualification, package: pkg, applyLink, whatsappNumber, callNumber, skills, description, verified } = req.body;
    let logo = req.body.companyLogo || ''; if (req.file) logo = '/img/uploads/' + req.file.filename; if (logo.startsWith('data:')) logo = '';
    const all = await getJobs(); const slug = uniqueSlug(makeSlug(`${jobRole}-${companyName}`), all);
    await addJob({ jobRole, companyName, companyLogo: logo, workLocation, jobType, experience, qualification, package: pkg || '', applyLink: applyLink || '', whatsappNumber: whatsappNumber || '', callNumber: callNumber || '', skills: skills || '', description: description || '', slug, timestamp: Date.now(), clicks: 0, verified: verified === 'on' });
    req.flash('success', 'Job added!'); res.redirect('/admin');
  } catch (e) { console.error(e); req.flash('error', 'Error: ' + e.message); res.redirect('/admin'); }
});

app.post('/admin/job/edit/:id', requireAdmin, upload.single('companyLogoFile'), async (req, res) => {
  try {
    const { jobRole, companyName, workLocation, jobType, experience, qualification, package: pkg, applyLink, whatsappNumber, callNumber, skills, description, verified } = req.body;
    let logo = req.body.companyLogo || ''; if (req.file) logo = '/img/uploads/' + req.file.filename; if (logo.startsWith('data:')) logo = '';
    await updateJob(req.params.id, { jobRole, companyName, companyLogo: logo, workLocation, jobType, experience, qualification, package: pkg || '', applyLink: applyLink || '', whatsappNumber: whatsappNumber || '', callNumber: callNumber || '', skills: skills || '', description: description || '', verified: verified === 'on' });
    req.flash('success', 'Job updated!'); res.redirect('/admin');
  } catch (e) { req.flash('error', 'Error updating.'); res.redirect('/admin'); }
});

app.post('/admin/job/delete/:id', requireAdmin, async (req, res) => {
  try { await deleteJob(req.params.id); req.flash('success', 'Job deleted.'); res.redirect('/admin'); } catch (e) { req.flash('error', 'Error deleting.'); res.redirect('/admin'); }
});

app.post('/admin/blog/add', requireAdmin, upload.single('coverImageFile'), async (req, res) => {
  try {
    const { title, excerpt, content, metaTitle, metaDescription, tags } = req.body;
    let cover = req.body.coverImage || ''; if (req.file) cover = '/img/uploads/' + req.file.filename;
    const all = await getPosts(); const slug = uniqueSlug(makeSlug(title), all);
    await addPost({ title, slug, excerpt: excerpt || '', content: content || '', coverImage: cover, metaTitle: metaTitle || '', metaDescription: metaDescription || '', tags: tags || '', timestamp: Date.now(), views: 0 });
    req.flash('success', 'Post published!'); res.redirect('/admin');
  } catch (e) { console.error(e); req.flash('error', 'Error: ' + e.message); res.redirect('/admin'); }
});

app.post('/admin/blog/edit/:id', requireAdmin, upload.single('coverImageFile'), async (req, res) => {
  try {
    const { title, excerpt, content, metaTitle, metaDescription, tags } = req.body;
    let cover = req.body.coverImage || ''; if (req.file) cover = '/img/uploads/' + req.file.filename;
    await updatePost(req.params.id, { title, excerpt: excerpt || '', content: content || '', coverImage: cover, metaTitle: metaTitle || '', metaDescription: metaDescription || '', tags: tags || '' });
    req.flash('success', 'Post updated!'); res.redirect('/admin');
  } catch (e) { req.flash('error', 'Error updating.'); res.redirect('/admin'); }
});

app.post('/admin/blog/delete/:id', requireAdmin, async (req, res) => {
  try { await deletePost(req.params.id); req.flash('success', 'Deleted.'); res.redirect('/admin'); } catch (e) { req.flash('error', 'Error.'); res.redirect('/admin'); }
});

app.get('/admin/job/:id/json', requireAdmin, async (req, res) => {
  try { const all = await getJobs(); res.json(all.find(j => j.id === req.params.id) || {}); } catch (e) { res.json({}); }
});
app.get('/admin/blog/:id/json', requireAdmin, async (req, res) => {
  try { const all = await getPosts(); res.json(all.find(p => p.id === req.params.id) || {}); } catch (e) { res.json({}); }
});

app.use((req, res) => res.status(404).render('404', { title: '404 | Employee Table', metaDescription: '', canonical: DOMAIN, ogType: 'website' }));

app.listen(PORT, () => {
  console.log(`\n✅ Employee Table running on http://localhost:${PORT}`);
  console.log(`   Admin → http://localhost:${PORT}/admin (pass: ${ADMIN_PASS})`);
  console.log(`   Sitemap → http://localhost:${PORT}/sitemap.xml`);
  console.log(`   Storage: Firebase Firestore (permanent — data survives all restarts)\n`);
});