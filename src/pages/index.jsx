// src/pages/index.jsx
// Statically generated homepage — all jobs pre-rendered at build time
import { useState, useMemo } from 'react';
import Link from 'next/link';
import Layout from '../components/Layout';
import JobCard from '../components/JobCard';
import { getAllJobs } from '../lib/firebase-admin';
import { SITE, CITIES } from '../lib/seo';

const JOBS_PER_PAGE = 9;

// ── Organization Schema ──────────────────────────────────────────
const orgSchema = {
  '@context': 'https://schema.org',
  '@type': 'Organization',
  name: SITE.name,
  url: SITE.url + '/',
  logo: SITE.logo,
  description: SITE.description,
  foundingDate: '2021',
  contactPoint: {
    '@type': 'ContactPoint',
    telephone: '+91-9619748275',
    contactType: 'customer support',
    areaServed: 'IN',
    availableLanguage: 'English',
  },
  sameAs: [
    'https://www.facebook.com/emptable',
    'https://x.com/employeetable',
    'https://www.linkedin.com/company/employee-table/',
    'https://www.instagram.com/emptable/',
  ],
};

const websiteSchema = {
  '@context': 'https://schema.org',
  '@type': 'WebSite',
  name: SITE.name,
  url: SITE.url + '/',
  description: SITE.description,
  potentialAction: {
    '@type': 'SearchAction',
    target: SITE.url + '/jobs/?q={search_term_string}',
    'query-input': 'required name=search_term_string',
  },
};

const faqSchema = {
  '@context': 'https://schema.org',
  '@type': 'FAQPage',
  mainEntity: [
    {
      '@type': 'Question',
      name: 'Is Employee Table free to use for job seekers?',
      acceptedAnswer: { '@type': 'Answer', text: 'Yes, Employee Table is 100% free. We never charge candidates any fees to browse or apply for jobs.' },
    },
    {
      '@type': 'Question',
      name: 'How are jobs verified on Employee Table?',
      acceptedAnswer: { '@type': 'Answer', text: 'Every job listing is manually reviewed by our team before publishing to ensure it is legitimate and scam-free.' },
    },
    {
      '@type': 'Question',
      name: 'Does Employee Table have fresher and internship jobs?',
      acceptedAnswer: { '@type': 'Answer', text: 'Yes, we specialize in 0-2 year experience roles, internships, and off-campus drives across India.' },
    },
  ],
};

export default function HomePage({ jobs }) {
  const [keyword, setKeyword] = useState('');
  const [city, setCity] = useState('');
  const [experience, setExperience] = useState('');
  const [jobType, setJobType] = useState('');
  const [page, setPage] = useState(1);

  const filtered = useMemo(() => {
    return jobs.filter((j) => {
      const kw = keyword.toLowerCase();
      const matchKw = !kw || [j.jobRole, j.companyName, j.skills].some(f => (f || '').toLowerCase().includes(kw));
      const matchCity = !city || (j.workLocation || '').toLowerCase().includes(city.toLowerCase());
      const matchExp = !experience || (j.experience || '').toLowerCase().includes(experience.toLowerCase());
      const matchType = !jobType || (j.jobType || '') === jobType;
      return matchKw && matchCity && matchExp && matchType;
    });
  }, [jobs, keyword, city, experience, jobType]);

  const totalPages = Math.ceil(filtered.length / JOBS_PER_PAGE);
  const visible = filtered.slice((page - 1) * JOBS_PER_PAGE, page * JOBS_PER_PAGE);

  const handleFilter = () => setPage(1);

  const extraHead = (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(orgSchema) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(websiteSchema) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(faqSchema) }} />
    </>
  );

  return (
    <Layout
      meta={{
        title: `Verified Jobs for Freshers & Professionals in India | ${SITE.name}`,
        description: SITE.description,
        canonical: SITE.url + '/',
        extraHead,
      }}
    >
      {/* ── Hero ── */}
      <section className="bg-gradient-to-r from-blue-600 to-blue-800 text-white py-16">
        <div className="container mx-auto px-4 text-center">
          <h1 className="text-3xl md:text-5xl font-bold mb-4 leading-tight">
            Find Verified Jobs in India — Free for Freshers & Professionals
          </h1>
          <p className="text-lg md:text-xl mb-6 text-blue-100 max-w-2xl mx-auto">
            Every listing is manually verified. No scams. No fees. Updated daily since 2021.
            Jobs in Mumbai, Bangalore, Delhi, Pune, Hyderabad & more.
          </p>
          <div className="flex flex-wrap justify-center gap-4 mb-8 text-sm text-blue-200">
            {['100% Free', 'Manually Verified', 'Fresher Friendly', 'Daily Updates', 'Remote & On-site'].map(t => (
              <span key={t}>✅ {t}</span>
            ))}
          </div>
          <a href="#job-list" className="bg-white text-blue-700 font-semibold px-8 py-3 rounded-lg hover:bg-blue-50 transition-colors shadow-lg inline-block">
            Browse Jobs Now
          </a>
        </div>
      </section>

      {/* ── Search ── */}
      <section className="py-8 bg-white shadow-sm" aria-label="Job search">
        <div className="container mx-auto px-4">
          <h2 className="text-xl font-semibold text-gray-700 mb-4">Search Verified Jobs</h2>
          <div className="flex flex-col md:flex-row flex-wrap gap-3">
            <input
              type="search"
              placeholder="Job title, company or skill…"
              value={keyword}
              onChange={e => { setKeyword(e.target.value); handleFilter(); }}
              className="flex-1 min-w-0 p-3 rounded-lg border-2 border-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-500"
              aria-label="Search by keyword"
            />
            <select value={city} onChange={e => { setCity(e.target.value); handleFilter(); }}
              className="md:w-44 p-3 rounded-lg border-2 border-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-500"
              aria-label="Filter by city">
              <option value="">All Cities</option>
              {CITIES.map(c => <option key={c.name} value={c.name}>{c.name}</option>)}
            </select>
            <select value={experience} onChange={e => { setExperience(e.target.value); handleFilter(); }}
              className="md:w-44 p-3 rounded-lg border-2 border-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-500"
              aria-label="Filter by experience">
              <option value="">All Experience</option>
              <option value="Fresher">Fresher (0–1 yr)</option>
              <option value="Experienced">Experienced (2+ yrs)</option>
            </select>
            <select value={jobType} onChange={e => { setJobType(e.target.value); handleFilter(); }}
              className="md:w-40 p-3 rounded-lg border-2 border-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-500"
              aria-label="Filter by job type">
              <option value="">All Types</option>
              {['Full-Time', 'Internship', 'Part-Time', 'Remote', 'Contract'].map(t => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
          </div>
        </div>
      </section>

      {/* ── Stats ── */}
      <section className="bg-blue-50 py-6 border-y border-blue-100">
        <div className="container mx-auto px-4 grid grid-cols-2 md:grid-cols-4 gap-4 text-center">
          {[['5,000+', 'Jobs Posted'], ['100%', 'Verified Listings'], ['50,000+', 'Candidates Helped'], ['Since 2021', 'Trusted Since']].map(([v, l]) => (
            <div key={l}><p className="text-2xl font-bold text-blue-700">{v}</p><p className="text-sm text-gray-600">{l}</p></div>
          ))}
        </div>
      </section>

      {/* ── Job Listings ── */}
      <section className="container mx-auto px-4 py-10" id="job-list">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-2xl font-bold text-gray-800">Latest Verified Jobs</h2>
          <span className="text-sm text-gray-500 bg-gray-100 px-3 py-1 rounded-full">
            {filtered.length} job{filtered.length !== 1 ? 's' : ''} found
          </span>
        </div>

        {visible.length === 0 ? (
          <div className="text-center py-16 bg-white rounded-xl shadow-sm">
            <p className="text-gray-500 text-lg mb-3">No jobs match your filters.</p>
            <button onClick={() => { setKeyword(''); setCity(''); setExperience(''); setJobType(''); setPage(1); }}
              className="text-blue-600 underline text-sm">Clear all filters</button>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {visible.map(job => <JobCard key={job.id} job={job} />)}
          </div>
        )}

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex justify-center gap-2 mt-8">
            {Array.from({ length: totalPages }, (_, i) => i + 1).map(p => (
              <button key={p} onClick={() => { setPage(p); document.getElementById('job-list').scrollIntoView({ behavior: 'smooth' }); }}
                className={`px-4 py-2 rounded-lg border text-sm font-medium transition-colors ${p === page ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-600 border-gray-300 hover:bg-blue-50'}`}>
                {p}
              </button>
            ))}
          </div>
        )}
      </section>

      {/* ── Browse by City ── */}
      <section id="cities" className="py-14 bg-white">
        <div className="container mx-auto px-4">
          <h2 className="text-3xl font-bold text-center mb-3 text-gray-800">Browse Jobs by City</h2>
          <p className="text-center text-gray-500 mb-10 max-w-xl mx-auto">Verified jobs across India's top hiring cities — updated every day.</p>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {CITIES.map(c => (
              <Link key={c.name} href={`/jobs/city/${c.name.toLowerCase()}/`}
                className="group bg-gray-50 hover:bg-blue-600 border border-gray-200 hover:border-blue-600 rounded-xl p-5 text-center transition-all duration-200">
                <div className="text-2xl mb-2">{c.emoji}</div>
                <h3 className="font-semibold text-gray-800 group-hover:text-white">{c.name}</h3>
                <p className="text-sm text-gray-500 group-hover:text-blue-100">{c.industries}</p>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* ── Job Alerts ── */}
      <section id="job-alerts" className="py-14 bg-gradient-to-r from-blue-600 to-blue-800 text-white">
        <div className="container mx-auto px-4 text-center">
          <h2 className="text-3xl font-bold mb-3">Never Miss a Job — Get Free Alerts</h2>
          <p className="text-blue-100 mb-8 max-w-xl mx-auto">Verified job openings delivered to your inbox every morning. Free forever.</p>
          <form
            onSubmit={e => { e.preventDefault(); e.target.querySelector('p.success').classList.remove('hidden'); e.target.querySelector('.form-fields').classList.add('hidden'); }}
            className="max-w-2xl mx-auto">
            <div className="form-fields flex flex-col md:flex-row gap-4">
              <input type="text" placeholder="Your name" required className="flex-1 p-3 rounded-lg text-gray-800" />
              <input type="email" placeholder="Email address" required className="flex-1 p-3 rounded-lg text-gray-800" />
              <select className="flex-1 p-3 rounded-lg text-gray-800">
                <option value="">Any City</option>
                {CITIES.map(c => <option key={c.name} value={c.name}>{c.name}</option>)}
              </select>
              <button type="submit" className="bg-white text-blue-700 font-semibold px-6 py-3 rounded-lg hover:bg-blue-50 transition-colors">
                🔔 Subscribe Free
              </button>
            </div>
            <p className="success hidden mt-4 text-blue-200">✅ You're subscribed! Check your inbox for a confirmation.</p>
          </form>
          <p className="text-blue-200 text-sm mt-4">🔒 No spam. Unsubscribe anytime.</p>
        </div>
      </section>

      {/* ── Why Us ── */}
      <section className="py-14 bg-gray-50">
        <div className="container mx-auto px-4">
          <h2 className="text-3xl font-bold text-center mb-3 text-gray-800">Why Job Seekers Choose Employee Table</h2>
          <p className="text-center text-gray-500 mb-10 max-w-xl mx-auto">We're not just another job board.</p>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {[
              ['🛡️', '100% Verified Listings', 'Every job is manually checked before it goes live. No ghost postings, no scam links.'],
              ['💚', 'Always Free for Candidates', 'No premium memberships, no hidden fees — free for job seekers, always.'],
              ['🎓', 'Built for Freshers First', 'We focus on 0–2 year experience roles, off-campus drives, and internships.'],
            ].map(([icon, title, desc]) => (
              <div key={title} className="bg-white rounded-xl p-6 shadow-sm border border-gray-100">
                <div className="text-3xl mb-4">{icon}</div>
                <h3 className="text-lg font-semibold mb-2 text-gray-800">{title}</h3>
                <p className="text-gray-600 text-sm leading-relaxed">{desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── About ── */}
      <section id="about" className="py-16 bg-white">
        <div className="container mx-auto px-4">
          <h2 className="text-3xl font-bold text-center mb-6 text-gray-800">About Employee Table</h2>
          <p className="text-center max-w-3xl mx-auto text-gray-600 leading-relaxed">
            Employee Table specializes in providing <strong>verified job updates</strong> completely <strong>free of cost</strong>,
            with a special focus on freshers entering the job market. Since 2021, we've helped thousands of
            candidates find legitimate opportunities by manually verifying each listing. Our mission is to bridge
            the gap between fresh talent and trusted employers — no hidden fees, no scams, just real opportunities
            across Mumbai, Bangalore, Delhi, Pune, Hyderabad, Noida and beyond.
          </p>
        </div>
      </section>

      {/* ── FAQ ── */}
      <section className="py-14 bg-gray-50">
        <div className="container mx-auto px-4 max-w-3xl">
          <h2 className="text-3xl font-bold text-center mb-10 text-gray-800">Frequently Asked Questions</h2>
          <div className="space-y-4">
            {faqSchema.mainEntity.map(q => (
              <details key={q.name} className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
                <summary className="font-semibold text-gray-800 cursor-pointer">{q.name}</summary>
                <p className="mt-3 text-gray-600 text-sm">{q.acceptedAnswer.text}</p>
              </details>
            ))}
          </div>
        </div>
      </section>
    </Layout>
  );
}

// ── Static Generation ────────────────────────────────────────────
export async function getStaticProps() {
  const jobs = await getAllJobs();
  return {
    props: { jobs },
    // ISR: regenerate page every 10 minutes if you later add a server
    // revalidate: 600,
  };
}
