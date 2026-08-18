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

const DOMAIN         = process.env.DOMAIN        || 'https://www.employeetable.in';
const PORT           = process.env.PORT           || 3000;
const ADMIN_PASS     = process.env.ADMIN_PASS     || 'admin123';
const SESSION_SECRET = process.env.SESSION_SECRET || 'et-secret-2025';
const PROJECT_ID     = process.env.FIREBASE_PROJECT_ID || 'employee-table-dcac5';
const JOBS_PER_PAGE  = 9;

let cachedJobs = null, cachedPosts = null, cacheTimeJobs = null, cacheTimePosts = null;
let cachedWalkins = null, cacheTimeWalkins = null;
const CACHE_DURATION = 30 * 60 * 1000;
let jobDetailCache = {}, postDetailCache = {};
const DETAIL_CACHE_TTL = 60 * 60 * 1000;
let cachedSitemap = null, sitemapCacheTime = null;
const SITEMAP_CACHE_TTL = 60 * 60 * 1000;

function clearCache() {
  cachedJobs = null; cachedPosts = null; cachedWalkins = null;
  cacheTimeJobs = null; cacheTimePosts = null; cacheTimeWalkins = null;
  jobDetailCache = {}; postDetailCache = {};
  console.log('Cache cleared');
}
function clearSitemapCache() { cachedSitemap = null; sitemapCacheTime = null; }

require('dotenv').config();

if (!admin.apps.length) {
  try {
    if (process.env.FIREBASE_CLIENT_EMAIL && process.env.FIREBASE_PRIVATE_KEY) {
      admin.initializeApp({ credential: admin.credential.cert({ projectId: PROJECT_ID, clientEmail: process.env.FIREBASE_CLIENT_EMAIL, privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n') }), projectId: PROJECT_ID });
      console.log('Firebase: env vars');
    } else {
      const keyPath = path.join(__dirname, 'serviceAccountKey.json');
      if (fs.existsSync(keyPath)) { const key = JSON.parse(fs.readFileSync(keyPath, 'utf8').trim()); admin.initializeApp({ credential: admin.credential.cert(key), projectId: PROJECT_ID }); console.log('Firebase: key file'); }
      else throw new Error('No Firebase credentials found.');
    }
  } catch (e) { console.error('Firebase init failed:', e.message); process.exit(1); }
}

const db = admin.firestore();
const FieldValue = admin.firestore.FieldValue;

const CITIES = [
  { name:'Mumbai',    slug:'mumbai',    emoji:'🏙️', industries:'Finance, IT, Media',     about:'Mumbai is India\'s financial capital, home to major banks, IT companies, and media houses.' },
  { name:'Bangalore', slug:'bangalore', emoji:'💻', industries:'Tech, Startups, IT',      about:'Bangalore is India\'s Silicon Valley with thousands of IT companies and startups hiring freshers.' },
  { name:'Delhi',     slug:'delhi',     emoji:'🏛️', industries:'Govt, Corporate, MNC',    about:'Delhi NCR is a hub for government jobs, corporate offices, and MNCs covering Noida and Gurgaon.' },
  { name:'Hyderabad', slug:'hyderabad', emoji:'🔬', industries:'IT, Pharma, FMCG',        about:'Hyderabad is a fast-growing IT hub home to Amazon, Google, Microsoft, and major pharma companies.' },
  { name:'Pune',      slug:'pune',      emoji:'🎓', industries:'Auto, IT, Education',     about:'Pune blends IT and manufacturing with TCS, Infosys, and major auto firms.' },
  { name:'Noida',     slug:'noida',     emoji:'📡', industries:'IT, BPO, Startups',       about:'Noida is an emerging IT and BPO hub with strong hiring from HCL, Samsung, and Adobe.' },
  { name:'Chennai',   slug:'chennai',   emoji:'🌊', industries:'Manufacturing, IT',       about:'Chennai is a major centre for manufacturing, IT, and services with TCS, Infosys, and automotive companies.' },
  { name:'Remote',    slug:'remote',    emoji:'🌐', industries:'Work from anywhere',      about:'Remote jobs let you work from anywhere in India across IT, content, finance, and operations.' },
];

// ── CHANGE 1: EXPANDED SMART SYNONYM MAP ────────────────────────────────────
const SYNONYM_MAP = {
  'sde':['sde','software','developer','engineer','programmer','coding','development'],
  'software':['software','engineer','developer','programmer','coding','sde','dev','development'],
  'developer':['developer','engineer','programmer','coding','software','dev','web','sde'],
  'engineer':['engineer','developer','programmer','software','sde','tech','backend','frontend','fullstack'],
  'dev':['dev','developer','software','engineer','programming','sde','backend','frontend'],
  'backend':['backend','server','api','node','java','python','django','spring','software','engineer'],
  'frontend':['frontend','ui','ux','react','angular','vue','javascript','html','css','web developer'],
  'fullstack':['fullstack','full stack','frontend','backend','react','node','developer','engineer'],
  'full stack':['fullstack','full stack','frontend','backend','react','node','developer','engineer'],
  'devops':['devops','cloud','aws','azure','docker','kubernetes','infrastructure','sre','platform'],
  'cloud':['cloud','aws','azure','gcp','devops','infrastructure','kubernetes','terraform'],
  'data':['data','analyst','analytics','science','scientist','sql','python','bi','tableau'],
  'data analyst':['data analyst','analyst','analytics','sql','excel','bi','reporting'],
  'data science':['data science','scientist','machine learning','ml','ai','python','statistics'],
  'ml':['ml','machine learning','ai','deep learning','data science','python','tensorflow'],
  'ai':['ai','artificial intelligence','machine learning','ml','deep learning','nlp'],
  'python':['python','django','flask','data','ml','ai','machine learning','backend','fastapi'],
  'java':['java','spring','backend','j2ee','enterprise','springboot','microservices'],
  'react':['react','reactjs','frontend','javascript','js','ui','web','redux','typescript'],
  'javascript':['javascript','js','react','angular','vue','node','frontend','typescript'],
  'node':['node','nodejs','javascript','backend','express','api','fullstack'],
  'android':['android','mobile','kotlin','java','app developer','mobile developer'],
  'ios':['ios','swift','mobile','app developer','xcode','iphone'],
  'mobile':['mobile','android','ios','flutter','react native','app developer','kotlin','swift'],
  'qa':['qa','quality assurance','testing','test engineer','selenium','automation','manual testing'],
  'testing':['testing','qa','quality','automation','selenium','manual','test engineer'],
  'security':['security','cybersecurity','penetration','infosec','network security','ethical hacking'],
  'hr':['hr','human resources','recruitment','recruiter','talent','people','talent acquisition','hrbp','payroll','hr executive'],
  'human resources':['human resources','hr','recruitment','talent acquisition','hrbp','people operations'],
  'recruiter':['recruiter','hr','talent acquisition','hiring','staffing','sourcing'],
  'talent':['talent','recruiter','hr','talent acquisition','sourcing','hiring'],
  'marketing':['marketing','digital marketing','seo','social media','brand','content','growth','performance marketing'],
  'digital marketing':['digital marketing','seo','sem','ppc','social media','content marketing','email marketing'],
  'seo':['seo','search engine optimization','digital marketing','content','google analytics'],
  'sales':['sales','business development','bd','account','revenue','client','inside sales','field sales','b2b','crm'],
  'business development':['business development','bd','sales','account manager','partnerships'],
  'finance':['finance','accounting','accounts','ca','financial','banking','audit','tax','bookkeeping'],
  'accounting':['accounting','accounts','finance','bookkeeping','audit','tally','gst','ca inter'],
  'banking':['banking','finance','fintech','loan','credit','treasury','relationship manager'],
  'operations':['operations','ops','process','coordinator','supply chain','logistics','bpo','back office'],
  'manager':['manager','lead','head','senior','management','coordinator','supervisor'],
  'analyst':['analyst','analysis','data','business analyst','research','reporting','insights'],
  'content':['content','writer','writing','copywriter','editorial','blog','content creator'],
  'writer':['writer','content','copywriter','editorial','technical writer','blog'],
  'design':['design','designer','ui','ux','graphic','creative','figma','adobe','photoshop'],
  'ui':['ui','ux','design','figma','user interface','product design','frontend'],
  'ux':['ux','ui','design','user experience','figma','research','wireframe'],
  'intern':['intern','internship','trainee','fresher','graduate','entry','apprentice','junior'],
  'fresher':['fresher','intern','internship','trainee','graduate','entry level','junior'],
  'trainee':['trainee','intern','fresher','graduate','management trainee'],
  'junior':['junior','entry level','fresher','intern','associate','trainee'],
  'associate':['associate','junior','entry level','executive','analyst'],
  'support':['support','customer support','customer service','helpdesk','technical support'],
  'customer service':['customer service','support','customer care','client service','helpdesk'],
  'bpo':['bpo','call center','customer service','support','voice','non-voice','back office'],
  'healthcare':['healthcare','hospital','medical','clinical','pharma','nursing','patient care'],
  'logistics':['logistics','supply chain','warehouse','dispatch','delivery','operations','scm'],
  'admin':['admin','administrator','office','executive assistant','back office','coordinator'],
  'project':['project','project manager','pm','pmo','project coordinator','scrum','agile'],
};

const SYNONYM_REVERSE = {};
Object.entries(SYNONYM_MAP).forEach(([key, syns]) => {
  syns.forEach(s => { if (!SYNONYM_REVERSE[s]) SYNONYM_REVERSE[s] = new Set(); SYNONYM_REVERSE[s].add(key); });
});

function getExpandedKeywords(q) {
  const raw = q.toLowerCase().trim();
  const words = raw.split(/\s+/).filter(Boolean);
  const expanded = new Set([raw]);
  words.forEach(w => {
    expanded.add(w);
    if (SYNONYM_MAP[w]) SYNONYM_MAP[w].forEach(s => expanded.add(s));
    if (SYNONYM_REVERSE[w]) SYNONYM_REVERSE[w].forEach(key => { expanded.add(key); if (SYNONYM_MAP[key]) SYNONYM_MAP[key].forEach(s => expanded.add(s)); });
    Object.keys(SYNONYM_MAP).forEach(key => { if (key.includes(w) || w.includes(key)) { expanded.add(key); SYNONYM_MAP[key].forEach(s => expanded.add(s)); } });
  });
  for (let i = 0; i < words.length - 1; i++) {
    const bigram = words[i] + ' ' + words[i+1];
    expanded.add(bigram);
    if (SYNONYM_MAP[bigram]) SYNONYM_MAP[bigram].forEach(s => expanded.add(s));
    if (SYNONYM_REVERSE[bigram]) SYNONYM_REVERSE[bigram].forEach(key => { expanded.add(key); if (SYNONYM_MAP[key]) SYNONYM_MAP[key].forEach(s => expanded.add(s)); });
  }
  return Array.from(expanded).filter(Boolean);
}

function jobRelevanceScore(job, keywords, rawQuery) {
  const t = (job.jobRole||'').toLowerCase(), c = (job.companyName||'').toLowerCase(),
        s = (job.skills||'').toLowerCase(), d = (job.description||'').toLowerCase(),
        ty = (job.jobType||'').toLowerCase(), l = (job.workLocation||'').toLowerCase();
  let score = 0;
  if (t.includes(rawQuery)) score += 100;
  for (const kw of keywords) {
    if (!kw) continue;
    if (t.includes(kw))  score += 40;
    if (c.includes(kw))  score += 20;
    if (s.includes(kw))  score += 15;
    if (d.includes(kw))  score += 8;
    if (ty.includes(kw)) score += 5;
    if (l.includes(kw))  score += 5;
  }
  return score;
}

function jobMatchesQuery(job, keywords, rawQuery) { return jobRelevanceScore(job, keywords, rawQuery || '') > 0; }

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
function uniqueSlug(base, list) { let s = base, i = 1; while (list.some(x => x.slug === s)) { s = base + '-' + (i++); } return s; }
function timeAgo(ts) { if (!ts) return 'Recently'; const d = Math.floor((Date.now() - ts) / 86400000); if (d === 0) return 'Today'; if (d === 1) return 'Yesterday'; if (d < 7) return d + ' days ago'; return new Date(ts).toLocaleDateString('en-IN'); }
function buildJobTitle(job) { const r = job.jobRole.length > 38 ? job.jobRole.substring(0, 36) + '…' : job.jobRole; return `${r} at ${job.companyName} — ${job.workLocation} | Employee Table`; }
function buildJobDescription(job) {
  if (job.description && job.description.trim().length > 50) return job.description;
  let d = `${job.jobRole} opportunity at ${job.companyName} in ${job.workLocation}. `;
  d += `This is a ${job.jobType} role for ${job.experience} experience. `;
  if (job.qualification) d += `Required qualification: ${job.qualification}. `;
  if (job.skills) d += `Key skills: ${job.skills}. `;
  if (job.package && !['competitive','as per','industry'].some(s => (job.package||'').toLowerCase().includes(s))) d += `Salary: ${job.package}. `;
  d += `Manually verified by Employee Table — free to apply.`;
  return d;
}
function normaliseRoleSlug(slug) { return slug.replace(/-/g,' ').toLowerCase().trim(); }
function normaliseCompanySlug(slug) { return slug.replace(/-/g,' ').toLowerCase().trim(); }

// ── CACHED FIRESTORE ──────────────────────────────────────────────────────────
async function getJobs() {
  if (cachedJobs && cacheTimeJobs && Date.now() - cacheTimeJobs < CACHE_DURATION) return cachedJobs;
  console.log('Fetching jobs...');
  const snap = await db.collection('jobs').orderBy('timestamp','desc').get();
  cachedJobs = snap.docs.map(doc => { const d = doc.data(); return { id:doc.id, jobRole:d.jobRole||'Job Opening', companyName:d.companyName||'Company', companyLogo:d.companyLogo||'', workLocation:d.workLocation||'India', jobType:d.jobType||'Full-Time', experience:d.experience||'Fresher', qualification:d.qualification||'Any Graduate', package:d.package||'', applyLink:d.applyLink||'', skills:d.skills||'', description:d.description||'', slug:d.slug||makeSlug(`${d.jobRole||'job'}-${doc.id.slice(0,6)}`), timestamp:d.timestamp||Date.now(), clicks:d.clicks||0, verified:d.verified!==false }; });
  cacheTimeJobs = Date.now(); return cachedJobs;
}

async function getPosts() {
  if (cachedPosts && cacheTimePosts && Date.now() - cacheTimePosts < CACHE_DURATION) return cachedPosts;
  console.log('Fetching posts...');
  const snap = await db.collection('posts').orderBy('timestamp','desc').get();
  cachedPosts = snap.docs.map(doc => { const d = doc.data(); return { id:doc.id, title:d.title||'Blog Post', slug:d.slug||makeSlug(d.title||doc.id), excerpt:d.excerpt||'', content:d.content||'', coverImage:d.coverImage||'', tags:d.tags||'', metaTitle:d.metaTitle||'', metaDescription:d.metaDescription||'', timestamp:d.timestamp||Date.now(), views:d.views||0 }; });
  cacheTimePosts = Date.now(); return cachedPosts;
}

async function getJobBySlug(slug) {
  if (jobDetailCache[slug] && Date.now() - jobDetailCache[slug].time < DETAIL_CACHE_TTL) return jobDetailCache[slug].data;
  const snap = await db.collection('jobs').where('slug','==',slug).limit(1).get();
  if (!snap.empty) { const job = { id:snap.docs[0].id, ...snap.docs[0].data() }; jobDetailCache[slug] = { data:job, time:Date.now() }; return job; }
  const ref = await db.collection('jobs').doc(slug).get();
  if (ref.exists) { const job = { id:ref.id, ...ref.data() }; jobDetailCache[slug] = { data:job, time:Date.now() }; return job; }
  return null;
}
function clearJobDetailCache(slug) { if (slug) delete jobDetailCache[slug]; else jobDetailCache = {}; }

async function getPostBySlug(slug) {
  if (postDetailCache[slug] && Date.now() - postDetailCache[slug].time < DETAIL_CACHE_TTL) return postDetailCache[slug].data;
  const snap = await db.collection('posts').where('slug','==',slug).limit(1).get();
  if (!snap.empty) { const post = { id:snap.docs[0].id, ...snap.docs[0].data() }; postDetailCache[slug] = { data:post, time:Date.now() }; return post; }
  const ref = await db.collection('posts').doc(slug).get();
  if (ref.exists) { const post = { id:ref.id, ...ref.data() }; postDetailCache[slug] = { data:post, time:Date.now() }; return post; }
  return null;
}
function clearPostDetailCache(slug) { if (slug) delete postDetailCache[slug]; else postDetailCache = {}; }

async function getWalkins() {
  if (cachedWalkins && cacheTimeWalkins && Date.now() - cacheTimeWalkins < CACHE_DURATION) return cachedWalkins;
  console.log('Fetching walkins...');
  const snap = await db.collection('walkins').orderBy('timestamp','desc').get();
  cachedWalkins = snap.docs.map(doc => { const d = doc.data(), dateEnd = d.interviewDateEnd || d.timestamp; return { id:doc.id, companyName:d.companyName||'Company', roleTitle:d.roleTitle||'Multiple Roles', city:d.city||'India', area:d.area||'', venueAddress:d.venueAddress||'', interviewDateStart:d.interviewDateStart||d.timestamp, interviewDateEnd:dateEnd, interviewTime:d.interviewTime||'10:00 AM – 5:00 PM', hrContactEmail:d.hrContactEmail||'', hrContactPhone:d.hrContactPhone||'', documentsRequired:d.documentsRequired||'Updated Resume, Aadhar Card, PAN Card, Passport size photo', eligibility:d.eligibility||'Any Graduate', package:d.package||'', slug:d.slug||makeSlug(`${d.companyName||'walkin'}-${d.city||''}-${doc.id.slice(0,6)}`), timestamp:d.timestamp||Date.now(), clicks:d.clicks||0, verified:d.verified!==false, expired:Date.now()>dateEnd }; });
  cacheTimeWalkins = Date.now(); return cachedWalkins;
}
function clearWalkinCache() { cachedWalkins = null; cacheTimeWalkins = null; }
async function getWalkinBySlug(slug) { const snap = await db.collection('walkins').where('slug','==',slug).limit(1).get(); if (!snap.empty) { return { id:snap.docs[0].id, ...snap.docs[0].data() }; } return null; }
async function addWalkin(data) { const id = uuidv4(), slug = data.slug || makeSlug(`${data.companyName||'walkin'}-${data.city||''}-${id.slice(0,6)}`); await db.collection('walkins').doc(id).set({ ...data, id, slug, timestamp:data.timestamp||Date.now() }); clearWalkinCache(); return id; }
async function updateWalkin(id, data) { await db.collection('walkins').doc(id).update(data); clearWalkinCache(); }
async function deleteWalkin(id) { await db.collection('walkins').doc(id).delete(); clearWalkinCache(); }
async function incrementWalkinClicks(id) { await db.collection('walkins').doc(id).update({ clicks:FieldValue.increment(1) }); }

async function addJob(data) {
  const id = uuidv4(), slug = data.slug || makeSlug(`${data.jobRole||'job'}-${id.slice(0,6)}`);
  const jobData = { ...data, id, slug, timestamp:data.timestamp||Date.now(), description:data.description||`${data.jobRole} opportunity at ${data.companyName}.`, datePosted:data.datePosted||new Date().toISOString(), validThrough:data.validThrough||new Date(Date.now()+30*86400000).toISOString(), jobLocation:{ address:{ addressLocality:data.workLocation||'India', addressCountry:'IN' } }, experienceRequirements:data.experience==='Fresher'?'Less than 1 year':(data.experience==='Experienced'?'2+ years':data.experience), educationRequirements:data.qualification||"Bachelor's Degree" };
  if (data.package && parseSalaryToNumber(data.package)) jobData.baseSalary = { '@type':'MonetaryAmount', currency:'INR', value:{ '@type':'QuantitativeValue', value:parseSalaryToNumber(data.package), unitText:'YEAR' } };
  await db.collection('jobs').doc(id).set(jobData);
  try { await sendJobAlertsToSubscribers(jobData); } catch (e) { console.error('Email alert error:', e.message); }
  clearCache(); clearJobDetailCache(); clearSitemapCache(); return id;
}
async function updateJob(id, data) { await db.collection('jobs').doc(id).update(data); clearCache(); clearJobDetailCache(); clearSitemapCache(); }
async function deleteJob(id) { await db.collection('jobs').doc(id).delete(); clearCache(); clearJobDetailCache(); clearSitemapCache(); }
async function incrementJobClicks(id) { await db.collection('jobs').doc(id).update({ clicks:FieldValue.increment(1) }); }

async function addPost(data) { const id = uuidv4(), slug = data.slug||makeSlug(data.title||id); await db.collection('posts').doc(id).set({ ...data, id, slug, timestamp:Date.now() }); clearCache(); clearPostDetailCache(); clearSitemapCache(); return id; }
async function updatePost(id, data) { await db.collection('posts').doc(id).update(data); clearCache(); clearPostDetailCache(); clearSitemapCache(); }
async function deletePost(id) { await db.collection('posts').doc(id).delete(); clearCache(); clearPostDetailCache(); clearSitemapCache(); }

async function getUsers() { const s = await db.collection('users').get(); return s.docs.map(d => ({ id:d.id, ...d.data() })); }
async function getUserById(id) { const r = await db.collection('users').doc(id).get(); return r.exists ? { id:r.id, ...r.data() } : null; }
async function getUserByEmail(e) { const s = await db.collection('users').where('email','==',e).limit(1).get(); return s.empty ? null : { id:s.docs[0].id, ...s.docs[0].data() }; }
async function addUser(data) { await db.collection('users').doc(data.id).set(data); }
async function updateUserSavedJobs(id, savedJobs) { await db.collection('users').doc(id).update({ savedJobs }); }
async function getSubs() { const s = await db.collection('subscribers').get(); return s.docs.map(d => ({ id:d.id, ...d.data() })); }
async function getSubByEmail(e) { const s = await db.collection('subscribers').where('email','==',e).limit(1).get(); return s.empty ? null : s.docs[0].data(); }
async function addSub(data) { const id = uuidv4(); await db.collection('subscribers').doc(id).set({ ...data, id }); }
async function getAllViews() { const r = await db.collection('meta').doc('views').get(); return r.exists ? r.data() : {}; }
async function incrementView(key) { const ref = db.collection('meta').doc('views'); await ref.set({ [key]:FieldValue.increment(1) }, { merge:true }); const up = await ref.get(); return (up.data()||{})[key] || 1; }

const nodemailer = require('nodemailer');
const transporter = nodemailer.createTransport({ service:'gmail', auth:{ user:process.env.EMAIL_USER, pass:process.env.EMAIL_PASS } });
async function sendJobAlert(subscriber, job) {
  if (!job) return;
  try { await transporter.sendMail({ from:`"Employee Table" <${process.env.EMAIL_USER}>`, to:subscriber.email, subject:`New Verified Job: ${job.jobRole} at ${job.companyName}`, html:`<h2>Hi ${subscriber.name},</h2><p>New verified job: <strong>${job.jobRole}</strong> at <strong>${job.companyName}</strong> in ${job.workLocation}.</p><a href="${DOMAIN}/job/${job.slug}">Apply Now →</a><br><br><small><a href="${DOMAIN}/unsubscribe?email=${encodeURIComponent(subscriber.email)}">Unsubscribe</a></small>` }); }
  catch (err) { console.error('Email failed:', err.message); }
}
async function sendJobAlertsToSubscribers(job) {
  const subs = await getSubs(), active = subs.filter(s => s.active !== false), jobCity = job.workLocation || 'India';
  const matches = active.filter(s => { const sc = s.city||'India'; return sc.toLowerCase().includes(jobCity.toLowerCase()) || sc === 'Any' || sc === ''; });
  for (const sub of matches) { await sendJobAlert(sub, job); await new Promise(r => setTimeout(r, 1000)); }
}

// ── EXPRESS ───────────────────────────────────────────────────────────────────
const app = express();
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(express.urlencoded({ extended:true }));
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));
app.use((req,res,next) => { res.setHeader('Cache-Control','public, max-age=300'); next(); });
app.use(session({ secret:SESSION_SECRET, resave:false, saveUninitialized:false, cookie:{ maxAge:7*24*60*60*1000 } }));
app.use(flash());
app.use((req,res,next) => { res.setHeader('Content-Security-Policy',"default-src 'self' https:; script-src 'self' 'unsafe-inline' https:; style-src 'self' 'unsafe-inline' https:; img-src 'self' data: https:;"); res.setHeader('Strict-Transport-Security','max-age=31536000; includeSubDomains'); res.setHeader('X-Frame-Options','DENY'); res.setHeader('Cross-Origin-Opener-Policy','same-origin'); next(); });

const storage = multer.diskStorage({ destination:(req,file,cb) => { const d = path.join(__dirname,'public','img','uploads'); if (!fs.existsSync(d)) fs.mkdirSync(d,{recursive:true}); cb(null,d); }, filename:(req,file,cb) => cb(null,Date.now()+'-'+file.originalname.replace(/\s/g,'_')) });
const upload = multer({ storage, limits:{ fileSize:5*1024*1024 } });

app.use((req,res,next) => { if (req.hostname === 'employeetable.in') return res.redirect(301,'https://www.employeetable.in'+req.url); next(); });
app.use((req,res,next) => { res.locals.domain = DOMAIN; res.locals.cities = CITIES; res.locals.user = req.session.user||null; res.locals.isAdmin = req.session.isAdmin||false; res.locals.success = req.flash('success'); res.locals.error = req.flash('error'); res.locals.timeAgo = timeAgo; next(); });

function requireUser(req,res,next)  { if (!req.session.user)    { req.flash('error','Please log in.'); return res.redirect('/login'); } next(); }
function requireAdmin(req,res,next) { if (!req.session.isAdmin) return res.redirect('/admin/login'); next(); }

// ── MIGRATION ─────────────────────────────────────────────────────────────────
app.get('/admin/migrate-slugs', async (req,res) => {
  if (req.query.key !== 'MIGRATE_NOW_2024') return res.status(401).send('Unauthorized.');
  try {
    let updated = 0;
    for (const doc of (await db.collection('jobs').get()).docs) { const d = doc.data(); if (!d.slug) { await doc.ref.update({ slug:makeSlug(`${d.jobRole||'job'}-${doc.id.slice(0,6)}`) }); updated++; } }
    for (const doc of (await db.collection('posts').get()).docs) { const d = doc.data(); if (!d.slug) { await doc.ref.update({ slug:makeSlug(d.title||doc.id) }); updated++; } }
    clearCache(); clearSitemapCache(); res.send(`Migration done. Updated ${updated} items.`);
  } catch (e) { res.status(500).send('Error: '+e.message); }
});

// ── STATIC PAGES ──────────────────────────────────────────────────────────────
app.get('/llms.txt', (req,res) => { res.type('text/plain'); res.send(`# Employee Table\nIndia's verified job portal since 2021. Free for freshers.\nhttps://www.employeetable.in\n`); });
app.get('/privacy', (req,res) => res.render('privacy', { title:'Privacy Policy | Employee Table', metaDescription:'Employee Table privacy policy.', canonical:DOMAIN+'/privacy' }));
app.get('/terms',   (req,res) => res.render('terms',   { title:'Terms of Service | Employee Table', metaDescription:'Terms of service.', canonical:DOMAIN+'/terms' }));
app.get('/contact', (req,res) => res.render('contact', { title:'Contact Employee Table', metaDescription:'Contact us.', canonical:DOMAIN+'/contact' }));

// ── HOMEPAGE ──────────────────────────────────────────────────────────────────
app.get('/', async (req,res) => {
  try {
    let jobs = await getJobs();
    const { q, city, exp, dateRange, page:pg } = req.query;
    const rawQuery = (q||'').toLowerCase().trim();

    if (rawQuery) {
      const kw = getExpandedKeywords(rawQuery);
      jobs = jobs.map(j => ({ job:j, score:jobRelevanceScore(j,kw,rawQuery) }))
                 .filter(x => x.score > 0).sort((a,b) => b.score - a.score).map(x => x.job);
    }
    if (city)      jobs = jobs.filter(j => (j.workLocation||'').toLowerCase().includes(city.toLowerCase()));
    if (exp)       jobs = jobs.filter(j => (j.experience||'').toLowerCase().includes(exp.toLowerCase()));
    if (dateRange) { const ms = {1:86400000,3:3*86400000,7:7*86400000}[dateRange]; if (ms) jobs = jobs.filter(j => (Date.now()-(j.timestamp||0)) <= ms); }

    if (!rawQuery) {
      const ew = e => { if (!e) return 5; const ev = e.toLowerCase(); if (ev.includes('fresher')||ev.includes('0')||ev.includes('entry')) return 1; if (ev.includes('1')||ev.includes('2')||ev.includes('intern')) return 2; if (ev.includes('3')||ev.includes('4')||ev.includes('5')) return 3; return 4; };
      jobs.sort((a,b) => ew(a.experience) - ew(b.experience));
    }

    const total = jobs.length, cur = Math.max(1, parseInt(pg)||1), pages = Math.ceil(total/JOBS_PER_PAGE);
    const pageJobs = jobs.slice((cur-1)*JOBS_PER_PAGE, cur*JOBS_PER_PAGE);
    const buildQuery = p => '?' + new URLSearchParams({ ...(q&&{q}), ...(city&&{city}), ...(exp&&{exp}), ...(dateRange&&{dateRange}), page:p });

    const allWalkins = await getWalkins();
    const todayWalkins = allWalkins.filter(w => !w.expired).slice(0,4);

    res.render('index', {
      title:'Verified Jobs for Freshers & Professionals India | Employee Table',
      metaDescription:'Find 100% verified free job opportunities for freshers across India. No scams, no fees. Mumbai, Bangalore, Delhi, Hyderabad and more.',
      canonical:DOMAIN+'/', jobs:pageJobs, allJobCount:total, totalFiltered:total,
      filters:{ q:q||'', city:city||'', exp:exp||'', dateRange:dateRange||'' },
      currentPage:cur, totalPages:pages, buildQuery, cities:CITIES, todayWalkins,
    });
  } catch (e) { console.error(e); res.status(500).send('Server error.'); }
});

// ── JOB DETAIL ────────────────────────────────────────────────────────────────
app.get('/job/:slug', async (req,res) => {
  try {
    const job = await getJobBySlug(req.params.slug);
    if (!job) return res.status(404).render('404',{ title:'404 | Employee Table', metaDescription:'Job not found.', canonical:DOMAIN+'/404' });
    const views = await incrementView('job_'+job.id);
    const allJobs = await getJobs(), related = allJobs.filter(j => j.id !== job.id && j.workLocation === job.workLocation).slice(0,3);
    const jobDescription = buildJobDescription(job), posted = new Date(job.timestamp).toISOString(), validTil = new Date(job.timestamp+30*86400000).toISOString(), salaryNum = parseSalaryToNumber(job.package);
    const jobSchema = JSON.stringify({ '@context':'https://schema.org', '@type':'JobPosting', title:job.jobRole, description:jobDescription, datePosted:posted, validThrough:validTil, hiringOrganization:{ '@type':'Organization', name:job.companyName }, jobLocation:{ '@type':'Place', address:{ '@type':'PostalAddress', addressLocality:job.workLocation, addressCountry:'IN' } }, employmentType:{'Full-Time':'FULL_TIME','Part-Time':'PART_TIME','Internship':'INTERN','Contract':'CONTRACTOR','Remote':'FULL_TIME'}[job.jobType]||'FULL_TIME', ...(salaryNum&&{ baseSalary:{ '@type':'MonetaryAmount', currency:'INR', value:{ '@type':'QuantitativeValue', value:salaryNum, unitText:'YEAR' } } }), url:`${DOMAIN}/job/${job.slug}` });
    const breadcrumbSchema = JSON.stringify({ '@context':'https://schema.org', '@type':'BreadcrumbList', itemListElement:[{ '@type':'ListItem', position:1, name:'Home', item:DOMAIN+'/' },{ '@type':'ListItem', position:2, name:'Jobs', item:DOMAIN+'/' },{ '@type':'ListItem', position:3, name:job.jobRole, item:`${DOMAIN}/job/${job.slug}` }] });
    res.render('job-detail',{ title:buildJobTitle(job), metaDescription:`Apply for ${job.jobRole} at ${job.companyName} in ${job.workLocation}. Free verified job.`, canonical:`${DOMAIN}/job/${job.slug}`, ogType:'article', job, related, views, jobDescription, jobSchema, breadcrumbSchema });
  } catch (e) { console.error(e); res.status(500).send('Error loading job.'); }
});

app.post('/job/:slug/click', async (req,res) => { try { const job = await getJobBySlug(req.params.slug); if (job) await incrementJobClicks(job.id); res.json({ok:true}); } catch(e) { res.json({ok:false}); } });

// ── CITY PAGES ────────────────────────────────────────────────────────────────
app.get('/jobs-in-:cityslug', async (req,res) => {
  try {
    const citySlug = req.params.cityslug.toLowerCase(), cityInfo = CITIES.find(c => c.slug === citySlug);
    if (!cityInfo) return res.status(404).render('404',{ title:'404 | Employee Table', metaDescription:'City not found.', canonical:DOMAIN+'/404' });
    const all = await getJobs(), jobs = all.filter(j => (j.workLocation||'').toLowerCase().includes(cityInfo.name.toLowerCase())), yr = new Date().getFullYear();
    res.render('city-jobs',{ title:`${cityInfo.name} Jobs for Freshers ${yr} — Verified Free Listings | Employee Table`, metaDescription:`Find ${jobs.length}+ verified jobs in ${cityInfo.name}. ${cityInfo.industries}. Updated daily. Free to apply.`, canonical:`${DOMAIN}/jobs-in-${citySlug}`, cityInfo, jobs, h1:`Verified Jobs in ${cityInfo.name} (${yr})` });
  } catch (e) { console.error(e); res.status(500).send('Error.'); }
});

// ── CHANGE 5: PROGRAMMATIC SEO — By Role ─────────────────────────────────────
app.get('/jobs-for-:roleslug', async (req,res) => {
  try {
    const roleSlug = req.params.roleslug, roleQuery = normaliseRoleSlug(roleSlug), kw = getExpandedKeywords(roleQuery);
    const all = await getJobs(), jobs = all.filter(j => jobMatchesQuery(j,kw,roleQuery)).sort((a,b) => jobRelevanceScore(b,kw,roleQuery) - jobRelevanceScore(a,kw,roleQuery));
    const titleRole = roleQuery.replace(/\b\w/g, c => c.toUpperCase()), yr = new Date().getFullYear();
    const breadcrumbSchema = JSON.stringify({ '@context':'https://schema.org', '@type':'BreadcrumbList', itemListElement:[{ '@type':'ListItem', position:1, name:'Home', item:DOMAIN+'/' },{ '@type':'ListItem', position:2, name:`${titleRole} Jobs`, item:`${DOMAIN}/jobs-for-${roleSlug}` }] });
    res.render('programmatic',{ title:`${titleRole} Jobs in India ${yr} — Verified | Employee Table`, metaDescription:`Find verified ${titleRole} jobs across India. ${jobs.length} open roles — freshers welcome. Free to apply.`, canonical:`${DOMAIN}/jobs-for-${roleSlug}`, robotsMeta:jobs.length===0?'noindex, follow':'index, follow', h1:`Verified ${titleRole} Jobs in India`, subheading:`${jobs.length} open role${jobs.length!==1?'s':''} — updated daily`, jobs, breadcrumbSchema, filterType:'role', filterValue:titleRole, relatedLinks:CITIES.map(c => ({ label:`${titleRole} Jobs in ${c.name}`, href:`/${roleSlug}-jobs-in-${c.slug}` })) });
  } catch (e) { console.error(e); res.status(500).send('Error.'); }
});

// ── CHANGE 5: PROGRAMMATIC SEO — By Company ──────────────────────────────────
app.get('/jobs-at-:companyslug', async (req,res) => {
  try {
    const companySlug = req.params.companyslug, companyQuery = normaliseCompanySlug(companySlug);
    const all = await getJobs(), jobs = all.filter(j => (j.companyName||'').toLowerCase().includes(companyQuery));
    const titleCompany = companyQuery.replace(/\b\w/g, c => c.toUpperCase()), yr = new Date().getFullYear();
    const breadcrumbSchema = JSON.stringify({ '@context':'https://schema.org', '@type':'BreadcrumbList', itemListElement:[{ '@type':'ListItem', position:1, name:'Home', item:DOMAIN+'/' },{ '@type':'ListItem', position:2, name:`Jobs at ${titleCompany}`, item:`${DOMAIN}/jobs-at-${companySlug}` }] });
    res.render('programmatic',{ title:`Jobs at ${titleCompany} India ${yr} — Verified Openings | Employee Table`, metaDescription:`Find verified jobs at ${titleCompany} across India. ${jobs.length} open roles. Free to apply.`, canonical:`${DOMAIN}/jobs-at-${companySlug}`, robotsMeta:jobs.length===0?'noindex, follow':'index, follow', h1:`Verified Jobs at ${titleCompany}`, subheading:`${jobs.length} open role${jobs.length!==1?'s':''} — updated daily`, jobs, breadcrumbSchema, filterType:'company', filterValue:titleCompany, relatedLinks:CITIES.map(c => ({ label:`${titleCompany} Jobs in ${c.name}`, href:`/jobs-in-${c.slug}` })) });
  } catch (e) { console.error(e); res.status(500).send('Error.'); }
});

// ── CHANGE 5: PROGRAMMATIC SEO — Role + City ─────────────────────────────────
// IMPORTANT: this must come before the walkins routes to avoid slug conflicts
app.get('/:roleslug-jobs-in-:cityslug', async (req,res) => {
  try {
    const roleSlug = req.params.roleslug, citySlug = req.params.cityslug;
    const cityInfo = CITIES.find(c => c.slug === citySlug.toLowerCase());
    if (!cityInfo) return res.status(404).render('404',{ title:'404 | Employee Table', metaDescription:'Page not found.', canonical:DOMAIN+'/404' });
    const roleQuery = normaliseRoleSlug(roleSlug), kw = getExpandedKeywords(roleQuery);
    const all = await getJobs(), jobs = all.filter(j => jobMatchesQuery(j,kw,roleQuery) && (j.workLocation||'').toLowerCase().includes(cityInfo.name.toLowerCase())).sort((a,b) => jobRelevanceScore(b,kw,roleQuery) - jobRelevanceScore(a,kw,roleQuery));
    const titleRole = roleQuery.replace(/\b\w/g, c => c.toUpperCase()), yr = new Date().getFullYear();
    const breadcrumbSchema = JSON.stringify({ '@context':'https://schema.org', '@type':'BreadcrumbList', itemListElement:[{ '@type':'ListItem', position:1, name:'Home', item:DOMAIN+'/' },{ '@type':'ListItem', position:2, name:`Jobs in ${cityInfo.name}`, item:`${DOMAIN}/jobs-in-${citySlug}` },{ '@type':'ListItem', position:3, name:`${titleRole} Jobs in ${cityInfo.name}`, item:`${DOMAIN}/${roleSlug}-jobs-in-${citySlug}` }] });
    res.render('programmatic',{ title:`${titleRole} Jobs in ${cityInfo.name} ${yr} — Verified | Employee Table`, metaDescription:`Find verified ${titleRole} jobs in ${cityInfo.name}. ${jobs.length} open roles. ${cityInfo.industries}. Free to apply.`, canonical:`${DOMAIN}/${roleSlug}-jobs-in-${citySlug}`, robotsMeta:jobs.length===0?'noindex, follow':'index, follow', h1:`Verified ${titleRole} Jobs in ${cityInfo.name}`, subheading:`${jobs.length} open role${jobs.length!==1?'s':''} in ${cityInfo.name} — updated daily`, jobs, breadcrumbSchema, filterType:'role+city', filterValue:`${titleRole} in ${cityInfo.name}`, relatedLinks:[{ label:`All ${titleRole} Jobs in India`, href:`/jobs-for-${roleSlug}` },{ label:`All Jobs in ${cityInfo.name}`, href:`/jobs-in-${citySlug}` },...CITIES.filter(c => c.slug !== citySlug).map(c => ({ label:`${titleRole} Jobs in ${c.name}`, href:`/${roleSlug}-jobs-in-${c.slug}` }))] });
  } catch (e) { console.error(e); res.status(500).send('Error.'); }
});

// ── WALK-IN DRIVES ────────────────────────────────────────────────────────────
app.get('/walkins', async (req,res) => {
  try {
    const { city, q, when } = req.query;
    const all = await getWalkins();
    let active = all.filter(w => !w.expired), expiredWalkins = all.filter(w => w.expired).slice(0,6);
    if (city) active = active.filter(w => (w.city||'').toLowerCase() === city.toLowerCase());
    if (q) { const ql = q.toLowerCase(); active = active.filter(w => (w.companyName||'').toLowerCase().includes(ql) || (w.roleTitle||'').toLowerCase().includes(ql) || (w.city||'').toLowerCase().includes(ql)); }
    if (when === 'today') { const s = new Date(), ts = new Date(s.getFullYear(),s.getMonth(),s.getDate()).getTime(); active = active.filter(w => w.interviewDateStart>=ts && w.interviewDateStart<ts+86400000); }
    else if (when === 'tomorrow') { const s = new Date(); s.setDate(s.getDate()+1); const ts = new Date(s.getFullYear(),s.getMonth(),s.getDate()).getTime(); active = active.filter(w => w.interviewDateStart>=ts && w.interviewDateStart<ts+86400000); }
    else if (when === 'week') { const now = Date.now(); active = active.filter(w => w.interviewDateStart>=now && w.interviewDateStart<=now+7*86400000); }
    res.render('walkins',{ title:city?`Walk-In Interviews in ${city} — Verified Drives | Employee Table`:'Walk-In Interviews in India — Verified Drives | Employee Table', metaDescription:city?`Verified walk-in interviews in ${city}. ${active.length} companies hiring. No fees.`:`Verified walk-in drives across India. ${active.length} active drives. No fees.`, canonical:DOMAIN+'/walkins'+(city?'?city='+encodeURIComponent(city):''), walkins:active, expiredWalkins, selectedCity:city||'', searchQuery:q||'', selectedWhen:when||'', cities:CITIES, ogImage:`${DOMAIN}/img/og-image.jpg` });
  } catch (e) { console.error(e); res.status(500).send('Server error.'); }
});

// ── CHANGE 4: Walk-in detail — role-first SEO ─────────────────────────────────
app.get('/walkins/:slug', async (req,res) => {
  try {
    const walkin = await getWalkinBySlug(req.params.slug);
    if (!walkin) return res.status(404).render('404',{ title:'404 | Employee Table', metaDescription:'Walk-in not found.', canonical:DOMAIN+'/404' });
    const sw = { ...walkin, roleTitle:walkin.roleTitle||'Walk-In Drive', companyName:walkin.companyName||'Company', city:walkin.city||'India', venueAddress:walkin.venueAddress||'Not specified', interviewDateStart:walkin.interviewDateStart||walkin.timestamp||Date.now(), interviewDateEnd:walkin.interviewDateEnd||walkin.timestamp||Date.now(), eligibility:walkin.eligibility||'Any Graduate', documentsRequired:walkin.documentsRequired||'Updated Resume, Aadhar Card, PAN Card, Passport size photo', slug:walkin.slug||req.params.slug };
    const dateEnd = sw.interviewDateEnd, isExpired = Date.now() > dateEnd;
    const allWalkins = await getWalkins(), related = allWalkins.filter(w => w.id !== sw.id && !w.expired && w.city === sw.city).slice(0,3);
    const dateFormatted = new Date(sw.interviewDateStart).toLocaleDateString('en-IN',{ day:'numeric', month:'long', year:'numeric' });
    // CHANGE 4: role-first title
    const title = isExpired
      ? `${sw.roleTitle} Walk-In at ${sw.companyName}, ${sw.city} [Ended] | Employee Table`
      : `${sw.roleTitle} Walk-In Interview in ${sw.city} — ${sw.companyName} | Employee Table`;
    const metaDescription = isExpired
      ? `This ${sw.roleTitle} walk-in at ${sw.companyName} in ${sw.city} has ended. Browse active walk-in drives on Employee Table.`
      : `Walk-in interview for ${sw.roleTitle} at ${sw.companyName} in ${sw.city} on ${dateFormatted}. ${sw.eligibility}. Verified by Employee Table. No fees.`.substring(0,160);
    // CHANGE 4: role-first JobPosting schema, no address in title/meta, FULL_TIME type
    const jobSchema = { '@context':'https://schema.org', '@type':'JobPosting', title:sw.roleTitle, description:`Walk-in interview for ${sw.roleTitle} at ${sw.companyName} in ${sw.city}. Date: ${dateFormatted}. Time: ${sw.interviewTime}. Venue: ${sw.venueAddress}. Eligibility: ${sw.eligibility}. Documents: ${sw.documentsRequired}.`, datePosted:new Date(sw.timestamp).toISOString(), validThrough:new Date(dateEnd).toISOString(), employmentType:'FULL_TIME', hiringOrganization:{ '@type':'Organization', name:sw.companyName }, jobLocation:{ '@type':'Place', address:{ '@type':'PostalAddress', streetAddress:sw.venueAddress, addressLocality:sw.city, addressCountry:'IN' } }, url:`${DOMAIN}/walkins/${sw.slug}`, ...(sw.package&&parseSalaryToNumber(sw.package)?{ baseSalary:{ '@type':'MonetaryAmount', currency:'INR', value:{ '@type':'QuantitativeValue', value:parseSalaryToNumber(sw.package), unitText:'YEAR' } } }:{}) };
    const breadcrumbSchema = JSON.stringify({ '@context':'https://schema.org', '@type':'BreadcrumbList', itemListElement:[{ '@type':'ListItem', position:1, name:'Home', item:DOMAIN+'/' },{ '@type':'ListItem', position:2, name:'Walk-In Drives', item:DOMAIN+'/walkins' },{ '@type':'ListItem', position:3, name:`${sw.roleTitle} at ${sw.companyName}`, item:`${DOMAIN}/walkins/${sw.slug}` }] });
    const extraSchema = isExpired ? `<script type="application/ld+json">${breadcrumbSchema}</script>` : `<script type="application/ld+json">${JSON.stringify(jobSchema)}</script><script type="application/ld+json">${breadcrumbSchema}</script>`;
    res.render('walkin-detail',{ title, metaDescription, canonical:`${DOMAIN}/walkins/${sw.slug}`, extraSchema, walkin:sw, related, isExpired, faqs:[], ogImage:`${DOMAIN}/img/og-image.jpg` });
  } catch (e) { console.error('Walk-in detail error:', e.message, e.stack); res.status(500).send('Error: '+e.message); }
});

app.post('/walkins/:slug/click', async (req,res) => { try { const w = await getWalkinBySlug(req.params.slug); if (w) await incrementWalkinClicks(w.id); res.json({ok:true}); } catch(e) { res.json({ok:false}); } });

app.get('/walk-in-jobs', (req,res) => { const q = Object.keys(req.query).length ? '?'+new URLSearchParams(req.query).toString() : ''; res.redirect(301,'/walkins'+q); });
app.get('/walk-in-jobs-in-:city', (req,res) => { const ci = CITIES.find(c => c.slug === req.params.city.toLowerCase()); res.redirect(301,'/walkins?city='+encodeURIComponent(ci?ci.name:req.params.city)); });

// ── BLOG ──────────────────────────────────────────────────────────────────────
app.get('/blog', async (req,res) => {
  try { const posts = await getPosts(); res.render('blog/list',{ title:'Career Blog — Resume Tips & Job Guides | Employee Table', metaDescription:'Career tips, salary reviews, and verified job news for freshers in India.', canonical:DOMAIN+'/blog', posts }); }
  catch (e) { console.error(e); res.status(500).send('Error.'); }
});

app.get('/blog/:slug', async (req,res) => {
  try {
    const post = await getPostBySlug(req.params.slug);
    if (!post) return res.status(404).render('404',{ title:'404 | Employee Table', metaDescription:'Post not found.', canonical:DOMAIN+'/404' });
    const views = await incrementView('blog_'+post.id), all = await getPosts(), related = all.filter(p => p.id !== post.id).slice(0,3), walkins = await getWalkins();
    const articleSchema = JSON.stringify({ '@context':'https://schema.org', '@type':'BlogPosting', headline:post.title, description:post.excerpt||post.title, author:{ '@type':'Organization', name:'Employee Table' }, datePublished:new Date(post.timestamp).toISOString(), url:`${DOMAIN}/blog/${post.slug}` });
    const breadcrumbSchema = JSON.stringify({ '@context':'https://schema.org', '@type':'BreadcrumbList', itemListElement:[{ '@type':'ListItem', position:1, name:'Home', item:DOMAIN+'/' },{ '@type':'ListItem', position:2, name:'Blog', item:DOMAIN+'/blog' },{ '@type':'ListItem', position:3, name:post.title, item:`${DOMAIN}/blog/${post.slug}` }] });
    res.render('blog/post',{ title:post.metaTitle||`${post.title} | Employee Table`, metaDescription:(post.metaDescription||post.excerpt||post.title).substring(0,155), canonical:`${DOMAIN}/blog/${post.slug}`, post, related, views, articleSchema, breadcrumbSchema, walkins });
  } catch (e) { console.error(e); res.status(500).send('Error.'); }
});

// ── SITEMAP ───────────────────────────────────────────────────────────────────
app.get('/sitemap.xml', async (req,res) => {
  if (cachedSitemap && sitemapCacheTime && Date.now()-sitemapCacheTime < SITEMAP_CACHE_TTL) { res.setHeader('Content-Type','application/xml'); return res.send(cachedSitemap); }
  try {
    const [jobs,posts,walkins] = await Promise.all([getJobs(),getPosts(),getWalkins()]);
    const now = new Date().toISOString().split('T')[0];
    let xml = '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n';
    xml += `  <url><loc>${DOMAIN}/</loc><lastmod>${now}</lastmod><changefreq>daily</changefreq><priority>1.0</priority></url>\n`;
    xml += `  <url><loc>${DOMAIN}/blog</loc><lastmod>${now}</lastmod><changefreq>weekly</changefreq><priority>0.9</priority></url>\n`;
    xml += `  <url><loc>${DOMAIN}/walkins</loc><lastmod>${now}</lastmod><changefreq>daily</changefreq><priority>0.95</priority></url>\n`;
    for (const city of CITIES) xml += `  <url><loc>${DOMAIN}/jobs-in-${city.slug}</loc><lastmod>${now}</lastmod><changefreq>daily</changefreq><priority>0.9</priority></url>\n`;
    // Change 5: dynamic role + company pages in sitemap
    const roleSet = new Set(), companySet = new Set();
    jobs.forEach(j => { if (j.jobRole) { roleSet.add(makeSlug(j.jobRole.split(' ').slice(0,3).join(' '))); } if (j.companyName) companySet.add(makeSlug(j.companyName)); });
    roleSet.forEach(r => { xml += `  <url><loc>${DOMAIN}/jobs-for-${r}</loc><lastmod>${now}</lastmod><changefreq>daily</changefreq><priority>0.8</priority></url>\n`; });
    companySet.forEach(c => { xml += `  <url><loc>${DOMAIN}/jobs-at-${c}</loc><lastmod>${now}</lastmod><changefreq>daily</changefreq><priority>0.75</priority></url>\n`; });
    for (const job of jobs) { if (job.slug) xml += `  <url><loc>${DOMAIN}/job/${job.slug}</loc><lastmod>${new Date(job.timestamp).toISOString().split('T')[0]}</lastmod><changefreq>weekly</changefreq><priority>0.8</priority></url>\n`; }
    for (const w of walkins) { if (w.slug && !w.expired) xml += `  <url><loc>${DOMAIN}/walkins/${w.slug}</loc><lastmod>${new Date(w.timestamp).toISOString().split('T')[0]}</lastmod><changefreq>daily</changefreq><priority>0.85</priority></url>\n`; }
    for (const post of posts) { if (post.slug) xml += `  <url><loc>${DOMAIN}/blog/${post.slug}</loc><lastmod>${new Date(post.timestamp).toISOString().split('T')[0]}</lastmod><changefreq>monthly</changefreq><priority>0.7</priority></url>\n`; }
    xml += '</urlset>';
    cachedSitemap = xml; sitemapCacheTime = Date.now();
    res.setHeader('Content-Type','application/xml'); res.send(xml);
  } catch (err) { console.error('Sitemap error:',err.message); res.setHeader('Content-Type','application/xml'); res.send(`<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><url><loc>${DOMAIN}/</loc><lastmod>${new Date().toISOString().split('T')[0]}</lastmod><changefreq>daily</changefreq><priority>1.0</priority></url></urlset>`); }
});

app.get('/robots.txt', (req,res) => { res.type('text/plain'); res.send(`User-agent: *\nAllow: /\nAllow: /walkins/\nAllow: /walkins/*\nAllow: /job/\nAllow: /blog/\nAllow: /jobs-for-\nAllow: /jobs-at-\nAllow: /jobs-in-\nSitemap: ${DOMAIN}/sitemap.xml\n\nUser-agent: GPTBot\nAllow: /\nUser-agent: ChatGPT-User\nAllow: /\nUser-agent: Google-Extended\nAllow: /\n`); });

// ── SUBSCRIBE / CONTACT ───────────────────────────────────────────────────────
app.post('/subscribe', async (req,res) => { try { const { name, email, city } = req.body; if (!name||!email) return res.json({ok:false,message:'Name and email required.'}); if (await getSubByEmail(email)) return res.json({ok:true,message:`${name}, you are already subscribed!`}); await addSub({ name, email, city:city||'Any', subscribedAt:Date.now(), active:true }); res.json({ok:true,message:`Subscribed! Alerts will be sent to ${email}`}); } catch(e) { res.json({ok:false,message:'Error.'}); } });
app.get('/unsubscribe', async (req,res) => { const email = req.query.email; if (!email) return res.redirect('/'); try { const subs = await getSubs(), sub = subs.find(s => s.email===email); if (sub) { await db.collection('subscribers').doc(sub.id).update({active:false}); res.send('<h2>Unsubscribed</h2><p>You will no longer receive job alerts.</p><a href="/">Home</a>'); } else res.send('Email not found.'); } catch(e) { res.status(500).send('Error.'); } });
app.post('/send-message', async (req,res) => { try { const { name, email, message } = req.body; if (!name||!email||!message) return res.json({ok:false,message:'All fields required.'}); await db.collection('contacts').doc(uuidv4()).set({ name, email, message, timestamp:Date.now(), read:false }); res.json({ok:true,message:'Message sent!'}); } catch(e) { res.json({ok:false,message:'Failed.'}); } });

// ── AUTH ──────────────────────────────────────────────────────────────────────
app.get('/login',  (req,res) => res.render('auth/login',  { title:'Login | Employee Table',   metaDescription:'Login.', canonical:DOMAIN+'/login' }));
app.get('/signup', (req,res) => res.render('auth/signup', { title:'Sign Up | Employee Table', metaDescription:'Sign up free.', canonical:DOMAIN+'/signup' }));
app.post('/login', async (req,res) => { try { const { email, password } = req.body; const u = await getUserByEmail(email); if (!u||!await bcrypt.compare(password,u.password)) { req.flash('error','Invalid credentials.'); return res.redirect('/login'); } req.session.user = { id:u.id, name:u.name, email:u.email }; res.redirect('/profile'); } catch(e) { res.redirect('/login'); } });
app.post('/signup', async (req,res) => { try { const { name, email, password, city } = req.body; if (await getUserByEmail(email)) { req.flash('error','Email already registered.'); return res.redirect('/signup'); } const hashed = await bcrypt.hash(password,10); const u = { id:uuidv4(), name, email, password:hashed, city:city||'', savedJobs:[], createdAt:Date.now() }; await addUser(u); req.session.user = { id:u.id, name:u.name, email:u.email }; req.flash('success',`Welcome, ${name}!`); res.redirect('/profile'); } catch(e) { res.redirect('/signup'); } });
app.get('/profile', requireUser, async (req,res) => { const u = await getUserById(req.session.user.id), allJobs = await getJobs(), saved = allJobs.filter(j => (u.savedJobs||[]).includes(j.id)); res.render('auth/profile',{ title:'My Profile | Employee Table', metaDescription:'Manage your profile.', canonical:DOMAIN+'/profile', fullUser:u, savedJobs:saved }); });
app.post('/job/:slug/save', requireUser, async (req,res) => { try { const job = await getJobBySlug(req.params.slug); if (!job) return res.json({ok:false}); const u = await getUserById(req.session.user.id); if (!u) return res.json({ok:false}); const saved = u.savedJobs||[], already = saved.includes(job.id); await updateUserSavedJobs(u.id, already?saved.filter(id=>id!==job.id):[...saved,job.id]); res.json({ok:true,saved:!already}); } catch(e) { res.json({ok:false}); } });
app.get('/logout', (req,res) => { req.session.destroy(() => res.redirect('/')); });

// ── ADMIN ─────────────────────────────────────────────────────────────────────
app.get('/admin/login', (req,res) => res.render('admin/login',{ title:'Admin Login | Employee Table', metaDescription:'Admin.', canonical:DOMAIN+'/admin/login' }));
app.post('/admin/login', (req,res) => { if (req.body.password===ADMIN_PASS) { req.session.isAdmin=true; res.redirect('/admin'); } else { req.flash('error','Wrong password.'); res.redirect('/admin/login'); } });
app.get('/admin/logout', (req,res) => { req.session.isAdmin=false; res.redirect('/admin/login'); });

app.get('/admin', requireAdmin, async (req,res) => {
  try {
    const [jobs,posts,subs,users,views,walkins] = await Promise.all([getJobs(),getPosts(),getSubs(),getUsers(),getAllViews(),getWalkins()]);
    const totalClicks = jobs.reduce((s,j) => s+(j.clicks||0),0), totalViews = Object.values(views).reduce((s,v) => s+(parseInt(v)||0),0);
    res.render('admin/dashboard',{ title:'Admin Dashboard | Employee Table', metaDescription:'Admin.', canonical:DOMAIN+'/admin', jobs, posts, subs, users, views, walkins, cities:CITIES, stats:{ jobs:jobs.length, posts:posts.length, subs:subs.length, users:users.length, clicks:totalClicks, views:totalViews, walkins:walkins.length, activeWalkins:walkins.filter(w=>!w.expired).length } });
  } catch (e) { console.error('Admin error:',e); res.status(500).send('Admin error: '+e.message); }
});

app.post('/admin/job/add', requireAdmin, upload.single('companyLogoFile'), async (req,res) => { try { const { jobRole,companyName,workLocation,jobType,experience,qualification,package:pkg,applyLink,whatsappNumber,callNumber,skills,description,verified } = req.body; let logo = req.body.companyLogo||''; if (req.file) logo='/img/uploads/'+req.file.filename; if (logo.startsWith('data:')) logo=''; const all = await getJobs(), slug = uniqueSlug(makeSlug(`${jobRole}-${companyName}`),all); await addJob({ jobRole,companyName,companyLogo:logo,workLocation,jobType,experience,qualification,package:pkg||'',applyLink:applyLink||'',whatsappNumber:whatsappNumber||'',callNumber:callNumber||'',skills:skills||'',description:description||'',slug,timestamp:Date.now(),clicks:0,verified:verified==='on' }); req.flash('success','Job added!'); res.redirect('/admin'); } catch(e) { console.error(e); req.flash('error','Error: '+e.message); res.redirect('/admin'); } });
app.post('/admin/job/edit/:id', requireAdmin, upload.single('companyLogoFile'), async (req,res) => { try { const { jobRole,companyName,workLocation,jobType,experience,qualification,package:pkg,applyLink,whatsappNumber,callNumber,skills,description,verified } = req.body; let logo = req.body.companyLogo||''; if (req.file) logo='/img/uploads/'+req.file.filename; if (logo.startsWith('data:')) logo=''; await updateJob(req.params.id,{ jobRole,companyName,companyLogo:logo,workLocation,jobType,experience,qualification,package:pkg||'',applyLink:applyLink||'',whatsappNumber:whatsappNumber||'',callNumber:callNumber||'',skills:skills||'',description:description||'',verified:verified==='on' }); req.flash('success','Job updated!'); res.redirect('/admin'); } catch(e) { console.error(e); req.flash('error','Error updating.'); res.redirect('/admin'); } });
app.post('/admin/job/delete/:id', requireAdmin, async (req,res) => { try { await deleteJob(req.params.id); req.flash('success','Job deleted.'); res.redirect('/admin'); } catch(e) { req.flash('error','Error deleting.'); res.redirect('/admin'); } });

app.post('/admin/walkin/add', requireAdmin, async (req,res) => { try { const { companyName,roleTitle,city,area,venueAddress,interviewDateStart,interviewDateEnd,interviewTime,hrContactEmail,hrContactPhone,documentsRequired,eligibility,package:pkg,verified } = req.body; const all = await getWalkins(), slug = uniqueSlug(makeSlug(`${companyName}-${city}`),all); await addWalkin({ companyName,roleTitle,city,area:area||'',venueAddress,interviewDateStart:new Date(interviewDateStart).getTime(),interviewDateEnd:new Date(interviewDateEnd).getTime(),interviewTime:interviewTime||'',hrContactEmail:hrContactEmail||'',hrContactPhone:hrContactPhone||'',documentsRequired:documentsRequired||'',eligibility:eligibility||'',package:pkg||'',slug,timestamp:Date.now(),clicks:0,verified:verified==='on' }); req.flash('success','Walk-in added!'); res.redirect('/admin'); } catch(e) { console.error(e); req.flash('error','Error: '+e.message); res.redirect('/admin'); } });
app.post('/admin/walkin/edit/:id', requireAdmin, async (req,res) => { try { const { companyName,roleTitle,city,area,venueAddress,interviewDateStart,interviewDateEnd,interviewTime,hrContactEmail,hrContactPhone,documentsRequired,eligibility,package:pkg,verified } = req.body; await updateWalkin(req.params.id,{ companyName,roleTitle,city,area:area||'',venueAddress,interviewDateStart:new Date(interviewDateStart).getTime(),interviewDateEnd:new Date(interviewDateEnd).getTime(),interviewTime:interviewTime||'',hrContactEmail:hrContactEmail||'',hrContactPhone:hrContactPhone||'',documentsRequired:documentsRequired||'',eligibility:eligibility||'',package:pkg||'',verified:verified==='on' }); req.flash('success','Walk-in updated!'); res.redirect('/admin'); } catch(e) { console.error(e); req.flash('error','Error.'); res.redirect('/admin'); } });
app.post('/admin/walkin/delete/:id', requireAdmin, async (req,res) => { try { await deleteWalkin(req.params.id); req.flash('success','Walk-in deleted.'); res.redirect('/admin'); } catch(e) { req.flash('error','Error.'); res.redirect('/admin'); } });
app.get('/admin/walkin/:id/json', requireAdmin, async (req,res) => { try { const all = await getWalkins(); res.json(all.find(w=>w.id===req.params.id)||{}); } catch(e) { res.json({}); } });

app.post('/admin/blog/add', requireAdmin, upload.single('coverImageFile'), async (req,res) => { try { const { title,excerpt,content,metaTitle,metaDescription,tags } = req.body; let cover = req.body.coverImage||''; if (req.file) cover='/img/uploads/'+req.file.filename; const all = await getPosts(), slug = uniqueSlug(makeSlug(title),all); await addPost({ title,slug,excerpt:excerpt||'',content:content||'',coverImage:cover,metaTitle:metaTitle||'',metaDescription:metaDescription||'',tags:tags||'',timestamp:Date.now(),views:0 }); req.flash('success','Post published!'); res.redirect('/admin'); } catch(e) { console.error(e); req.flash('error','Error: '+e.message); res.redirect('/admin'); } });
app.post('/admin/blog/edit/:id', requireAdmin, upload.single('coverImageFile'), async (req,res) => { try { const { title,excerpt,content,metaTitle,metaDescription,tags } = req.body; const ep = await getPostBySlug(req.params.id); if (!ep) { req.flash('error','Post not found.'); return res.redirect('/admin'); } let coverImage = ep.coverImage||''; if (req.file) coverImage='/img/uploads/'+req.file.filename; await updatePost(req.params.id,{ title,excerpt:excerpt||'',content:content||'',coverImage,metaTitle:metaTitle||'',metaDescription:metaDescription||'',tags:tags||'' }); req.flash('success','Post updated!'); res.redirect('/admin'); } catch(e) { console.error(e); req.flash('error','Error.'); res.redirect('/admin'); } });
app.post('/admin/blog/delete/:id', requireAdmin, async (req,res) => { try { await deletePost(req.params.id); req.flash('success','Deleted.'); res.redirect('/admin'); } catch(e) { req.flash('error','Error.'); res.redirect('/admin'); } });

app.get('/admin/job/:id/json',    requireAdmin, async (req,res) => { try { const all = await getJobs();  res.json(all.find(j=>j.id===req.params.id)||{}); } catch(e) { res.json({}); } });
app.get('/admin/blog/:id/json',   requireAdmin, async (req,res) => { try { const all = await getPosts(); res.json(all.find(p=>p.id===req.params.id)||{}); } catch(e) { res.json({}); } });

// ── 404 ───────────────────────────────────────────────────────────────────────
app.use((req,res) => res.status(404).render('404',{ title:'404 | Employee Table', metaDescription:'Page not found.', canonical:DOMAIN+'/404' }));

app.listen(PORT, () => {
  console.log(`\nEmployee Table on http://localhost:${PORT}`);
  console.log(`Admin: http://localhost:${PORT}/admin`);
  console.log(`Changes live: Smart Search v2 | Walk-in SEO | Programmatic SEO`);
});