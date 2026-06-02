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

const DOMAIN         = process.env.DOMAIN || 'https://www.employeetable.in';
const PORT           = process.env.PORT   || 3000;
const ADMIN_PASS     = process.env.ADMIN_PASS || 'admin123';
const SESSION_SECRET = process.env.SESSION_SECRET || 'et-secret-2025';
const JOBS_PER_PAGE  = 9;

const CITIES = [
  { name:'Mumbai',    slug:'mumbai',    emoji:'🏙️', industries:'Finance, IT, Media',     about:'Mumbai is India\'s financial capital with thousands of verified jobs across BFSI, IT, media, and e-commerce sectors. Major employers include TCS, HDFC Bank, Aditya Birla Group, and hundreds of growing startups.' },
  { name:'Bangalore', slug:'bangalore', emoji:'💻', industries:'Tech, Startups, IT',      about:'Bangalore (Bengaluru) is India\'s Silicon Valley — home to Infosys, Wipro, Flipkart, and over 10,000 tech companies. IT, product management, data science, and engineering roles are most in demand for freshers and experienced professionals.' },
  { name:'Delhi',     slug:'delhi',     emoji:'🏛️', industries:'Govt, Corporate, MNC',   about:'Delhi NCR covering Delhi, Gurgaon, and Noida is a major corporate hub. Strong demand across government, banking, consulting, and MNC roles for freshers and experienced candidates across all industries.' },
  { name:'Hyderabad', slug:'hyderabad', emoji:'🔬', industries:'IT, Pharma, FMCG',       about:'Hyderabad is a fast-growing tech and pharma hub — home to Microsoft, Google, Amazon, and major pharmaceutical companies. HITEC City is the primary hiring zone for IT freshers and experienced professionals alike.' },
  { name:'Pune',      slug:'pune',      emoji:'🎓', industries:'Auto, IT, Education',    about:'Pune offers a strong mix of automotive, IT, and education sector jobs. Major employers include Tata Motors, Infosys, Wipro, and hundreds of IT services and product companies hiring freshers throughout the year.' },
  { name:'Noida',     slug:'noida',     emoji:'📡', industries:'IT, BPO, Startups',      about:'Noida is Delhi\'s tech and BPO neighbour with aggressive fresher hiring across IT services, customer support, digital marketing, and early-stage startups looking for fresh talent.' },
  { name:'Chennai',   slug:'chennai',   emoji:'🌊', industries:'Manufacturing, IT',      about:'Chennai combines a strong manufacturing base (automotive, hardware) with a growing IT sector. Companies like Cognizant, HCLTech, and Ford regularly hire freshers and experienced candidates here.' },
  { name:'Remote',    slug:'remote',    emoji:'🌐', industries:'Work from anywhere',     about:'Remote jobs let you work from any city in India or anywhere in the world. These verified remote roles span software engineering, content writing, digital marketing, customer support, and more.' },
];

// Fuzzy/synonym search map — expands keywords to related terms
const SYNONYM_MAP = {
  'software':    ['software','engineer','developer','programmer','coding','sde','dev'],
  'developer':   ['developer','engineer','programmer','coding','software','dev','web'],
  'engineer':    ['engineer','developer','programmer','software','sde','tech'],
  'marketing':   ['marketing','digital','seo','social media','brand','content','growth'],
  'data':        ['data','analyst','analytics','science','scientist','sql','python','bi'],
  'design':      ['design','designer','ui','ux','graphic','creative','figma'],
  'hr':          ['hr','human resources','recruitment','recruiter','talent','people'],
  'finance':     ['finance','accounting','accounts','ca','financial','banking','audit'],
  'sales':       ['sales','business development','bd','account','revenue','client'],
  'content':     ['content','writer','writing','copywriter','editorial','blog','seo'],
  'manager':     ['manager','lead','head','senior','management','coordinator'],
  'intern':      ['intern','internship','trainee','fresher','graduate','entry'],
  'python':      ['python','django','flask','data','ml','ai','machine learning'],
  'java':        ['java','spring','backend','j2ee','enterprise'],
  'react':       ['react','frontend','javascript','js','ui','web'],
  'devops':      ['devops','cloud','aws','azure','docker','kubernetes','infrastructure'],
};

function getExpandedKeywords(query) {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  const expanded = new Set(words);
  words.forEach(word => {
    Object.entries(SYNONYM_MAP).forEach(([key, synonyms]) => {
      if (synonyms.includes(word) || word.includes(key) || key.includes(word)) {
        synonyms.forEach(s => expanded.add(s));
      }
    });
  });
  return Array.from(expanded);
}

function jobMatchesQuery(job, keywords) {
  const haystack = [
    job.jobRole, job.companyName, job.skills, job.description,
    job.jobType, job.workLocation, job.qualification
  ].join(' ').toLowerCase();
  return keywords.some(kw => haystack.includes(kw));
}

function parseSalaryToNumber(pkg) {
  if (!pkg) return null;
  const lower = pkg.toLowerCase();
  if (['competitive','as per','industry','negotiable'].some(s => lower.includes(s))) return null;
  const match = pkg.match(/[\d.]+/);
  if (!match) return null;
  const num = parseFloat(match[0]);
  if (lower.includes('lpa') || lower.includes('lac') || lower.includes('lakh')) return Math.round(num * 100000);
  if (lower.includes('month')) return Math.round(num * 12);
  return Math.round(num);
}

function buildJobDescription(job) {
  if (job.description && job.description.trim().length > 50) return job.description;
  let d = `${job.jobRole} opportunity at ${job.companyName} in ${job.workLocation}. `;
  d += `This is a ${job.jobType} role open to candidates with ${job.experience} experience. `;
  if (job.qualification) d += `Required qualification: ${job.qualification}. `;
  if (job.skills)        d += `Key skills: ${job.skills}. `;
  if (job.package && !['competitive','as per','industry'].some(s => (job.package||'').toLowerCase().includes(s))) d += `Salary: ${job.package}. `;
  d += `Manually verified by Employee Table — free to apply, no registration fee required.`;
  return d;
}

function buildJobTitle(job) {
  const role = job.jobRole.length > 38 ? job.jobRole.substring(0, 36) + '…' : job.jobRole;
  return `${role} at ${job.companyName} — ${job.workLocation} | Employee Table`;
}

// ── Data layer ──────────────────────────────────────────────────────────────
const DATA_DIR = path.join(__dirname, 'data');
function dataPath(f) { return path.join(DATA_DIR, f); }
function readJSON(f) {
  const fp = dataPath(f);
  if (!fs.existsSync(fp)) return null;
  try { return JSON.parse(fs.readFileSync(fp, 'utf8')); } catch(e) { return null; }
}
function writeJSON(f, d) { fs.writeFileSync(dataPath(f), JSON.stringify(d, null, 2), 'utf8'); }
function getJobs()  { return readJSON('jobs.json')          || []; }
function getBlog()  { return readJSON('blog.json')          || []; }
function getUsers() { return readJSON('users.json')         || []; }
function getSubs()  { return readJSON('subscriptions.json') || []; }
function getViews() { return readJSON('views.json')         || {}; }
function incrementView(k) { const v=getViews(); v[k]=(v[k]||0)+1; writeJSON('views.json',v); return v[k]; }

function initData() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive:true });
  if (!readJSON('jobs.json'))    writeJSON('jobs.json', [
    { id:uuidv4(), jobRole:'Software Engineer', companyName:'TCS', companyLogo:'', workLocation:'Mumbai', jobType:'Full-Time', experience:'Fresher', qualification:'BE/BTech', package:'3.36 LPA', applyLink:'https://www.tcs.com/careers', whatsappNumber:'', callNumber:'', skills:'Java, Python', slug:'software-engineer-tcs', description:'TCS is hiring fresh graduate software engineers for its Mumbai office. Candidates must clear the TCS NQT test. Strong aptitude and coding skills required. Training provided before project allocation.', timestamp:Date.now(), clicks:0, verified:true },
    { id:uuidv4(), jobRole:'Digital Marketing Executive', companyName:'Accenture', companyLogo:'', workLocation:'Bangalore', jobType:'Full-Time', experience:'Fresher', qualification:'Any Graduate', package:'4.5 LPA', applyLink:'https://www.accenture.com/in-en/careers', whatsappNumber:'+919619748275', callNumber:'+919619748275', skills:'SEO, Google Ads, Social Media', slug:'digital-marketing-executive-accenture', description:'Accenture is hiring Digital Marketing Executives for its Bangalore office. Freshers with knowledge of SEO, Google Ads and social media marketing are encouraged to apply. The role involves managing digital campaigns for global clients.', timestamp:Date.now()-86400000, clicks:5, verified:true },
    { id:uuidv4(), jobRole:'HR Intern', companyName:'Infosys', companyLogo:'', workLocation:'Hyderabad', jobType:'Internship', experience:'Fresher', qualification:'MBA/BBA', package:'15,000/month', applyLink:'https://www.infosys.com/careers', whatsappNumber:'', callNumber:'', skills:'Communication, MS Office', slug:'hr-intern-infosys', description:'Infosys is offering a 6-month paid HR internship for MBA and BBA students at its Hyderabad campus. Interns assist in recruitment, onboarding, and HR operations. Strong performers may receive a full-time offer.', timestamp:Date.now()-172800000, clicks:12, verified:true },
  ]);
  if (!readJSON('blog.json'))    writeJSON('blog.json', [
    { id:uuidv4(), title:'Top 10 IT Companies Hiring Freshers in 2026', slug:'top-it-companies-hiring-freshers-2026', excerpt:'TCS, Infosys, Wipro and 7 more are actively hiring thousands of freshers. Get salary packages, eligibility and direct apply links.', content:'<p>India\'s IT sector is in full hiring mode in 2026. Here are the top companies actively recruiting freshers.</p><h2>1. TCS</h2><p>TCS plans to hire 42,000 freshers in FY2026. The NQT is the gateway. Salary: ₹3.36 LPA (Ninja) to ₹11 LPA (Prime).</p><h2>2. Infosys</h2><p>Infosys is hiring 20,000 freshers with packages starting at ₹6.25 LPA for DSE roles going up to ₹21 LPA for Specialist Programmer L3.</p><h2>3. Wipro</h2><p>Wipro targets 10,000–12,000 freshers. NLTH test is the entry point. Salary: ₹3.5 LPA to ₹6.5 LPA.</p>', metaTitle:'Top 10 IT Companies Hiring Freshers 2026 | Salary & Apply Links', metaDescription:'TCS, Infosys, Wipro hiring thousands of freshers in 2026. Complete salary breakdown, eligibility and verified apply links.', coverImage:'', tags:'fresher jobs, TCS hiring, Infosys 2026, IT companies', timestamp:Date.now(), views:0 },
    { id:uuidv4(), title:'5 Types of Fake Job Listings and How to Spot Them', slug:'5-fake-job-listing-types-india', excerpt:'Job scams cost Indian freshers crores every year. Learn the 5 most common fake job patterns so you never fall for them.', content:'<p>India sees thousands of fake job listings daily. Here are the 5 patterns we catch most often at Employee Table.</p><h2>1. Registration Fee Scam</h2><p>Real companies never charge candidates. If anyone asks for ₹500–5000 to apply — it is a scam.</p><h2>2. Fake Offer Letter</h2><p>Looks real with company letterhead then asks you to buy a laptop before joining. Legitimate employers never ask this.</p><h2>3. The Ghost Interview</h2><p>3 interview rounds, good feedback, then silence. Then an offer letter asking for bank details. Never share banking details before joining.</p>', metaTitle:'5 Types of Fake Job Listings in India — How to Spot Them', metaDescription:'Job scams cost Indian freshers crores annually. Learn the 5 fake job listing patterns including registration fees, ghost interviews and fake MNCs.', coverImage:'', tags:'job scams India, fake jobs, fresher safety', timestamp:Date.now()-86400000, views:0 },
  ]);
  if (!readJSON('users.json'))         writeJSON('users.json', []);
  if (!readJSON('subscriptions.json')) writeJSON('subscriptions.json', []);
  if (!readJSON('views.json'))         writeJSON('views.json', {});
}
initData();

function timeAgo(ts) {
  if (!ts) return 'Recently';
  const d = Math.floor((Date.now()-ts)/86400000);
  if (d===0) return 'Today'; if (d===1) return 'Yesterday';
  if (d<7) return d+' days ago';
  return new Date(ts).toLocaleDateString('en-IN',{day:'numeric',month:'short',year:'numeric'});
}
function makeSlug(t) { return slugify(t||'untitled',{lower:true,strict:true}); }
function uniqueSlug(base, list, id) {
  const others = list.filter(x=>x.id!==id);
  let s=base,i=1; while(others.some(x=>x.slug===s)){s=base+'-'+i++;} return s;
}

// ── Express ─────────────────────────────────────────────────────────────────
const app = express();
app.set('view engine','ejs');
app.set('views', path.join(__dirname,'views'));
app.use(express.urlencoded({extended:true}));
app.use(express.json());
app.use(express.static(path.join(__dirname,'public')));
app.use(session({secret:SESSION_SECRET,resave:false,saveUninitialized:false,cookie:{maxAge:7*24*60*60*1000}}));
app.use(flash());

const storage = multer.diskStorage({
  destination:(req,file,cb)=>{ const d=path.join(__dirname,'public','img','uploads'); if(!fs.existsSync(d)) fs.mkdirSync(d,{recursive:true}); cb(null,d); },
  filename:(req,file,cb)=>cb(null,Date.now()+'-'+file.originalname.replace(/\s/g,'_'))
});
const upload = multer({storage,limits:{fileSize:5*1024*1024}});

// www redirect — fixes canonical mismatch
app.use((req,res,next)=>{
  if(req.hostname==='employeetable.in') return res.redirect(301,'https://www.employeetable.in'+req.url);
  next();
});

app.use((req,res,next)=>{
  res.locals.domain  = DOMAIN;
  res.locals.cities  = CITIES;
  res.locals.user    = req.session.user||null;
  res.locals.isAdmin = req.session.isAdmin||false;
  res.locals.success = req.flash('success');
  res.locals.error   = req.flash('error');
  res.locals.timeAgo = timeAgo;
  next();
});

function requireUser(req,res,next) { if(!req.session.user){req.flash('error','Please log in first.');return res.redirect('/login');} next(); }
function requireAdmin(req,res,next){ if(!req.session.isAdmin) return res.redirect('/admin/login'); next(); }

// ── HOME ────────────────────────────────────────────────────────────────────
app.get('/',(req,res)=>{
  // Always sort newest first
  const allJobs = getJobs().sort((a,b)=>b.timestamp-a.timestamp);
  const { q, city, exp, dateRange, page:pageParam } = req.query;

  let filtered = allJobs;

  // Fuzzy + synonym search
  if (q && q.trim()) {
    const keywords = getExpandedKeywords(q.trim());
    filtered = filtered.filter(j => jobMatchesQuery(j, keywords));
  }

  // City filter
  if (city) filtered = filtered.filter(j=>(j.workLocation||'').toLowerCase().includes(city.toLowerCase()));

  // Experience filter
  if (exp) filtered = filtered.filter(j=>(j.experience||'').toLowerCase().includes(exp.toLowerCase()));

  // Date range filter (replaces job type filter)
  if (dateRange) {
    const ms = { '1':86400000, '3':3*86400000, '7':7*86400000 }[dateRange];
    if (ms) filtered = filtered.filter(j=>(Date.now()-(j.timestamp||0))<=ms);
  }

  const currentPage = Math.max(1, parseInt(pageParam)||1);
  const totalPages  = Math.ceil(filtered.length/JOBS_PER_PAGE);
  const start       = (currentPage-1)*JOBS_PER_PAGE;
  const jobs        = filtered.slice(start, start+JOBS_PER_PAGE);

  const buildQuery = (p)=>{
    const params = new URLSearchParams({...(q&&{q}),...(city&&{city}),...(exp&&{exp}),...(dateRange&&{dateRange}),page:p});
    return '?'+params.toString();
  };

  res.render('index',{
    title:'Verified Free Jobs for Freshers & Professionals in India | Employee Table',
    metaDescription:'Find 100% verified free job opportunities for freshers and experienced professionals across India. Daily updates on jobs in Mumbai, Bangalore, Delhi, Pune, Hyderabad, Noida. No fees, no scams since 2021.',
    canonical:DOMAIN+'/',
    ogType:'website',
    jobs, allJobCount:allJobs.length, totalFiltered:filtered.length,
    filters:{q:q||'',city:city||'',exp:exp||'',dateRange:dateRange||''},
    currentPage, totalPages, buildQuery,
  });
});

// ── JOB DETAIL ──────────────────────────────────────────────────────────────
app.get('/job/:slug',(req,res)=>{
  const jobs = getJobs();
  const job  = jobs.find(j=>j.slug===req.params.slug);
  if (!job) return res.status(404).render('404',{title:'404 | Employee Table',metaDescription:'',canonical:DOMAIN,ogType:'website'});

  const views   = incrementView('job_'+job.id);
  const related = jobs.filter(j=>j.id!==job.id&&j.workLocation===job.workLocation).slice(0,3);
  const posted  = new Date(job.timestamp).toISOString();
  const validTil= new Date(job.timestamp+30*86400000).toISOString();
  const salaryNum = parseSalaryToNumber(job.package);
  const jobDescription = buildJobDescription(job);

  const jobSchema = JSON.stringify({
    '@context':'https://schema.org','@type':'JobPosting',
    title: job.jobRole,
    description: jobDescription,
    datePosted: posted,
    validThrough: validTil,
    hiringOrganization:{
      '@type':'Organization',
      name:job.companyName,
      ...(job.companyLogo&&job.companyLogo.startsWith('http')&&{logo:job.companyLogo})
    },
    jobLocation:{'@type':'Place',address:{'@type':'PostalAddress',addressLocality:job.workLocation,addressCountry:'IN'}},
    employmentType:({'Full-Time':'FULL_TIME','Part-Time':'PART_TIME','Internship':'INTERN','Contract':'CONTRACTOR','Remote':'FULL_TIME'})[job.jobType]||'FULL_TIME',
    ...(salaryNum&&{baseSalary:{'@type':'MonetaryAmount',currency:'INR',value:{'@type':'QuantitativeValue',value:salaryNum,unitText:'YEAR'}}}),
    experienceRequirements:job.experience,
    educationRequirements:job.qualification,
    url:`${DOMAIN}/job/${job.slug}`,
    directApply:true,
  });

  const breadcrumb = JSON.stringify({
    '@context':'https://schema.org','@type':'BreadcrumbList',
    itemListElement:[
      {'@type':'ListItem',position:1,name:'Home',item:DOMAIN+'/'},
      {'@type':'ListItem',position:2,name:'Jobs',item:DOMAIN+'/'},
      {'@type':'ListItem',position:3,name:job.jobRole,item:`${DOMAIN}/job/${job.slug}`},
    ]
  });

  res.render('job-detail',{
    title: buildJobTitle(job),
    metaDescription: `Apply for ${job.jobRole} at ${job.companyName} in ${job.workLocation}. ${job.experience} experience required. ${job.qualification}. Free verified job — no registration fee.`.substring(0,155),
    canonical:`${DOMAIN}/job/${job.slug}`,
    ogType:'article',
    job, related, views, jobSchema, breadcrumb, jobDescription,
  });
});

app.post('/job/:slug/click',(req,res)=>{
  const jobs=getJobs(); const idx=jobs.findIndex(j=>j.slug===req.params.slug);
  if(idx!==-1){jobs[idx].clicks=(jobs[idx].clicks||0)+1;writeJSON('jobs.json',jobs);}
  res.json({ok:true});
});

// ── CITY PAGES ──────────────────────────────────────────────────────────────
app.get('/jobs-in-:cityslug',(req,res)=>{
  const citySlug = req.params.cityslug.toLowerCase();
  const cityInfo = CITIES.find(c=>c.slug===citySlug);
  if (!cityInfo) return res.status(404).render('404',{title:'404 | Employee Table',metaDescription:'',canonical:DOMAIN,ogType:'website'});
  const jobs = getJobs()
    .filter(j=>(j.workLocation||'').toLowerCase().includes(cityInfo.name.toLowerCase()))
    .sort((a,b)=>b.timestamp-a.timestamp);
  res.render('city-jobs',{
    title:`Jobs in ${cityInfo.name} for Freshers & Professionals ${new Date().getFullYear()} | Employee Table`,
    metaDescription:`Find ${jobs.length>0?jobs.length+'+':'latest'} verified free jobs in ${cityInfo.name} for freshers and professionals. ${cityInfo.industries} — updated daily. 100% free.`,
    canonical:`${DOMAIN}/jobs-in-${citySlug}`,
    ogType:'website', cityInfo, jobs, h1:`Verified Jobs in ${cityInfo.name}`,
  });
});

// ── BLOG ────────────────────────────────────────────────────────────────────
app.get('/blog',(req,res)=>{
  const posts=getBlog().sort((a,b)=>b.timestamp-a.timestamp);
  res.render('blog/list',{
    title:'Career Blog — Resume Tips, Interview Prep & Job Guides | Employee Table',
    metaDescription:'Career tips, resume writing guides, interview preparation and verified job news for freshers and experienced candidates across India.',
    canonical:DOMAIN+'/blog', ogType:'website', posts,
  });
});

app.get('/blog/:slug',(req,res)=>{
  const posts=getBlog(); const post=posts.find(p=>p.slug===req.params.slug);
  if (!post) return res.status(404).render('404',{title:'404 | Employee Table',metaDescription:'',canonical:DOMAIN,ogType:'website'});
  const views=incrementView('blog_'+post.id);
  const related=posts.filter(p=>p.id!==post.id).slice(0,3);
  const articleSchema=JSON.stringify({
    '@context':'https://schema.org','@type':'BlogPosting',
    headline:post.title, description:post.excerpt||post.title,
    image:post.coverImage||`${DOMAIN}/img/logo.png`,
    author:{'@type':'Organization',name:'Employee Table'},
    publisher:{'@type':'Organization',name:'Employee Table',logo:{'@type':'ImageObject',url:`${DOMAIN}/img/logo.png`}},
    datePublished:new Date(post.timestamp).toISOString(),
    dateModified:new Date(post.timestamp).toISOString(),
    url:`${DOMAIN}/blog/${post.slug}`, keywords:post.tags||'',
  });
  const breadcrumb=JSON.stringify({
    '@context':'https://schema.org','@type':'BreadcrumbList',
    itemListElement:[
      {'@type':'ListItem',position:1,name:'Home',item:DOMAIN+'/'},
      {'@type':'ListItem',position:2,name:'Blog',item:DOMAIN+'/blog'},
      {'@type':'ListItem',position:3,name:post.title,item:`${DOMAIN}/blog/${post.slug}`},
    ]
  });
  res.render('blog/post',{
    title:post.metaTitle||`${post.title} | Employee Table`,
    metaDescription:(post.metaDescription||post.excerpt||post.title).substring(0,155),
    canonical:`${DOMAIN}/blog/${post.slug}`, ogType:'article', ogImage:post.coverImage||'',
    post, related, views, articleSchema, breadcrumb,
  });
});

// ── SITEMAP ─────────────────────────────────────────────────────────────────
app.get('/sitemap.xml',(req,res)=>{
  const jobs=getJobs(); const posts=getBlog();
  const now=new Date().toISOString().split('T')[0];
  const urls=[
    {loc:DOMAIN+'/',        changefreq:'daily',  priority:'1.0',lastmod:now},
    {loc:DOMAIN+'/blog',    changefreq:'weekly', priority:'0.8',lastmod:now},
    ...CITIES.map(c=>({loc:`${DOMAIN}/jobs-in-${c.slug}`,changefreq:'daily',priority:'0.9',lastmod:now})),
    ...jobs.map(j=>({loc:`${DOMAIN}/job/${j.slug}`,changefreq:'weekly',priority:'0.8',lastmod:new Date(j.timestamp).toISOString().split('T')[0]})),
    ...posts.map(p=>({loc:`${DOMAIN}/blog/${p.slug}`,changefreq:'monthly',priority:'0.7',lastmod:new Date(p.timestamp).toISOString().split('T')[0]})),
  ];
  res.set('Content-Type','application/xml');
  res.send('<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n'+
    urls.map(u=>`  <url>\n    <loc>${u.loc}</loc>\n    <lastmod>${u.lastmod}</lastmod>\n    <changefreq>${u.changefreq}</changefreq>\n    <priority>${u.priority}</priority>\n  </url>`).join('\n')+
    '\n</urlset>');
});

app.get('/robots.txt',(req,res)=>{
  res.type('text/plain');
  res.send(`User-agent: *\nAllow: /\n\nSitemap: ${DOMAIN}/sitemap.xml\n`);
});

// ── SUBSCRIBE ───────────────────────────────────────────────────────────────
app.post('/subscribe',(req,res)=>{
  const {name,email,city}=req.body;
  if(!name||!email) return res.json({ok:false,message:'Name and email are required.'});
  const subs=getSubs();
  if(subs.find(s=>s.email===email)) return res.json({ok:true,message:`${name}, you are already subscribed!`});
  subs.push({id:uuidv4(),name,email,city:city||'Any',subscribedAt:Date.now(),active:true});
  writeJSON('subscriptions.json',subs);
  res.json({ok:true,message:`✅ Subscribed! Job alerts will be sent to ${email}`});
});

// ── AUTH ────────────────────────────────────────────────────────────────────
app.get('/login',(req,res)=>{ if(req.session.user) return res.redirect('/profile'); res.render('auth/login',{title:'Login | Employee Table',metaDescription:'',canonical:DOMAIN+'/login',ogType:'website'}); });
app.post('/login',async(req,res)=>{ const{email,password}=req.body; const u=getUsers().find(u=>u.email===email); if(!u){req.flash('error','No account found.');return res.redirect('/login');} if(!await bcrypt.compare(password,u.password)){req.flash('error','Wrong password.');return res.redirect('/login');} req.session.user={id:u.id,name:u.name,email:u.email}; req.flash('success',`Welcome back, ${u.name}!`); res.redirect('/profile'); });
app.get('/signup',(req,res)=>{ if(req.session.user) return res.redirect('/profile'); res.render('auth/signup',{title:'Sign Up | Employee Table',metaDescription:'',canonical:DOMAIN+'/signup',ogType:'website'}); });
app.post('/signup',async(req,res)=>{ const{name,email,password,city}=req.body; if(!name||!email||!password){req.flash('error','All fields required.');return res.redirect('/signup');} const users=getUsers(); if(users.find(u=>u.email===email)){req.flash('error','Email already registered.');return res.redirect('/signup');} const hashed=await bcrypt.hash(password,10); const u={id:uuidv4(),name,email,password:hashed,city:city||'',savedJobs:[],createdAt:Date.now()}; users.push(u); writeJSON('users.json',users); req.session.user={id:u.id,name:u.name,email:u.email}; req.flash('success',`Welcome, ${name}!`); res.redirect('/profile'); });
app.get('/profile',requireUser,(req,res)=>{ const u=getUsers().find(u=>u.id===req.session.user.id); const saved=getJobs().filter(j=>(u.savedJobs||[]).includes(j.id)); res.render('auth/profile',{title:'My Profile | Employee Table',metaDescription:'',canonical:DOMAIN+'/profile',ogType:'website',fullUser:u,savedJobs:saved}); });
app.post('/job/:slug/save',requireUser,(req,res)=>{ const users=getUsers(); const job=getJobs().find(j=>j.slug===req.params.slug); if(!job) return res.json({ok:false}); const idx=users.findIndex(u=>u.id===req.session.user.id); if(idx===-1) return res.json({ok:false}); if(!users[idx].savedJobs) users[idx].savedJobs=[]; const already=users[idx].savedJobs.includes(job.id); if(already) users[idx].savedJobs=users[idx].savedJobs.filter(id=>id!==job.id); else users[idx].savedJobs.push(job.id); writeJSON('users.json',users); res.json({ok:true,saved:!already}); });
app.get('/logout',(req,res)=>{ req.session.destroy(()=>res.redirect('/')); });

// ── ADMIN ───────────────────────────────────────────────────────────────────
app.get('/admin/login',(req,res)=>{ if(req.session.isAdmin) return res.redirect('/admin'); res.render('admin/login',{title:'Admin Login | Employee Table',metaDescription:'',canonical:DOMAIN,ogType:'website'}); });
app.post('/admin/login',(req,res)=>{ if(req.body.password===ADMIN_PASS){req.session.isAdmin=true;return res.redirect('/admin');} req.flash('error','Wrong password.'); res.redirect('/admin/login'); });
app.get('/admin/logout',(req,res)=>{ req.session.isAdmin=false; res.redirect('/admin/login'); });

app.get('/admin',requireAdmin,(req,res)=>{
  const jobs=getJobs().sort((a,b)=>b.timestamp-a.timestamp);
  const posts=getBlog().sort((a,b)=>b.timestamp-a.timestamp);
  const subs=getSubs(); const views=getViews(); const users=getUsers();
  res.render('admin/dashboard',{
    title:'Admin Dashboard | Employee Table',metaDescription:'',canonical:DOMAIN,ogType:'website',
    jobs,posts,subs,users,views,
    stats:{jobs:jobs.length,posts:posts.length,subs:subs.length,users:users.length,
      clicks:jobs.reduce((s,j)=>s+(j.clicks||0),0),
      views:Object.values(views).reduce((s,v)=>s+v,0)},
  });
});

app.post('/admin/job/add',requireAdmin,upload.single('companyLogoFile'),(req,res)=>{
  const jobs=getJobs();
  const{jobRole,companyName,workLocation,jobType,experience,qualification,package:pkg,applyLink,whatsappNumber,callNumber,skills,description,verified}=req.body;
  let logo=req.body.companyLogo||'';
  if(req.file) logo='/img/uploads/'+req.file.filename;
  if(logo.startsWith('data:')) logo='';
  const slug=uniqueSlug(makeSlug(`${jobRole}-${companyName}`),jobs,null);
  jobs.unshift({id:uuidv4(),jobRole,companyName,companyLogo:logo,workLocation,jobType,experience,qualification,package:pkg||'',applyLink:applyLink||'',whatsappNumber:whatsappNumber||'',callNumber:callNumber||'',skills:skills||'',description:description||'',slug,timestamp:Date.now(),clicks:0,verified:verified==='on'});
  writeJSON('jobs.json',jobs); req.flash('success','Job added!'); res.redirect('/admin');
});
app.post('/admin/job/edit/:id',requireAdmin,upload.single('companyLogoFile'),(req,res)=>{
  const jobs=getJobs(); const idx=jobs.findIndex(j=>j.id===req.params.id);
  if(idx===-1){req.flash('error','Not found.');return res.redirect('/admin');}
  const{jobRole,companyName,workLocation,jobType,experience,qualification,package:pkg,applyLink,whatsappNumber,callNumber,skills,description,verified}=req.body;
  let logo=req.body.companyLogo||jobs[idx].companyLogo;
  if(req.file) logo='/img/uploads/'+req.file.filename;
  if(logo.startsWith('data:')) logo='';
  jobs[idx]={...jobs[idx],jobRole,companyName,companyLogo:logo,workLocation,jobType,experience,qualification,package:pkg||'',applyLink:applyLink||'',whatsappNumber:whatsappNumber||'',callNumber:callNumber||'',skills:skills||'',description:description||'',verified:verified==='on'};
  writeJSON('jobs.json',jobs); req.flash('success','Job updated!'); res.redirect('/admin');
});
app.post('/admin/job/delete/:id',requireAdmin,(req,res)=>{ writeJSON('jobs.json',getJobs().filter(j=>j.id!==req.params.id)); req.flash('success','Deleted.'); res.redirect('/admin'); });
app.post('/admin/blog/add',requireAdmin,upload.single('coverImageFile'),(req,res)=>{
  const posts=getBlog();
  const{title,excerpt,content,metaTitle,metaDescription,tags}=req.body;
  let cover=req.body.coverImage||''; if(req.file) cover='/img/uploads/'+req.file.filename;
  const slug=uniqueSlug(makeSlug(title),posts,null);
  posts.unshift({id:uuidv4(),title,slug,excerpt:excerpt||'',content:content||'',coverImage:cover,metaTitle:metaTitle||'',metaDescription:metaDescription||'',tags:tags||'',timestamp:Date.now(),views:0});
  writeJSON('blog.json',posts); req.flash('success','Post published!'); res.redirect('/admin');
});
app.post('/admin/blog/edit/:id',requireAdmin,upload.single('coverImageFile'),(req,res)=>{
  const posts=getBlog(); const idx=posts.findIndex(p=>p.id===req.params.id);
  if(idx===-1){req.flash('error','Not found.');return res.redirect('/admin');}
  const{title,excerpt,content,metaTitle,metaDescription,tags}=req.body;
  let cover=req.body.coverImage||posts[idx].coverImage; if(req.file) cover='/img/uploads/'+req.file.filename;
  posts[idx]={...posts[idx],title,excerpt:excerpt||'',content:content||'',coverImage:cover,metaTitle:metaTitle||'',metaDescription:metaDescription||'',tags:tags||''};
  writeJSON('blog.json',posts); req.flash('success','Post updated!'); res.redirect('/admin');
});
app.post('/admin/blog/delete/:id',requireAdmin,(req,res)=>{ writeJSON('blog.json',getBlog().filter(p=>p.id!==req.params.id)); req.flash('success','Deleted.'); res.redirect('/admin'); });
app.get('/admin/job/:id/json', requireAdmin,(req,res)=>res.json(getJobs().find(j=>j.id===req.params.id)||{}));
app.get('/admin/blog/:id/json',requireAdmin,(req,res)=>res.json(getBlog().find(p=>p.id===req.params.id)||{}));

app.use((req,res)=>res.status(404).render('404',{title:'404 | Employee Table',metaDescription:'Page not found.',canonical:DOMAIN,ogType:'website'}));

app.listen(PORT,()=>{
  console.log(`\n✅ Employee Table → http://localhost:${PORT}`);
  console.log(`   Admin → http://localhost:${PORT}/admin (pass: ${ADMIN_PASS})`);
  console.log(`   Sitemap → http://localhost:${PORT}/sitemap.xml\n`);
});
