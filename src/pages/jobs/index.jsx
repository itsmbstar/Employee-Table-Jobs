// src/pages/jobs/index.jsx
// Static page listing ALL jobs — full HTML, fully crawlable
import { useState, useMemo } from 'react';
import Layout from '../../components/Layout';
import JobCard from '../../components/JobCard';
import { getAllJobs } from '../../lib/firebase-admin';
import { SITE, CITIES } from '../../lib/seo';

const JOBS_PER_PAGE = 12;

export default function JobsPage({ jobs }) {
  const [keyword, setKeyword] = useState('');
  const [city, setCity] = useState('');
  const [experience, setExperience] = useState('');
  const [jobType, setJobType] = useState('');
  const [page, setPage] = useState(1);

  const filtered = useMemo(() => {
    return jobs.filter(j => {
      const kw = keyword.toLowerCase();
      const matchKw = !kw || [j.jobRole, j.companyName, j.skills].some(f => (f || '').toLowerCase().includes(kw));
      const matchCity = !city || (j.workLocation || '').toLowerCase().includes(city.toLowerCase());
      const matchExp = !experience || (j.experience || '').toLowerCase().includes(experience.toLowerCase());
      const matchType = !jobType || j.jobType === jobType;
      return matchKw && matchCity && matchExp && matchType;
    });
  }, [jobs, keyword, city, experience, jobType]);

  const totalPages = Math.ceil(filtered.length / JOBS_PER_PAGE);
  const visible = filtered.slice((page - 1) * JOBS_PER_PAGE, page * JOBS_PER_PAGE);

  return (
    <Layout meta={{
      title: `Latest Verified Jobs in India for Freshers 2024 | ${SITE.name}`,
      description: 'Browse 100% free, verified job listings for freshers and professionals across India. Filter by city, experience, and job type. Updated daily.',
      canonical: SITE.url + '/jobs/',
    }}>
      {/* Hero */}
      <section className="bg-gradient-to-r from-blue-600 to-blue-800 text-white py-12">
        <div className="container mx-auto px-4 text-center">
          <h1 className="text-3xl md:text-4xl font-bold mb-3">Verified Job Listings — Free for All</h1>
          <p className="text-blue-100 max-w-xl mx-auto">{jobs.length} verified jobs across India. Freshers welcome. Updated daily.</p>
        </div>
      </section>

      {/* Filters */}
      <section className="py-6 bg-white shadow-sm">
        <div className="container mx-auto px-4">
          <div className="flex flex-col md:flex-row flex-wrap gap-3">
            <input type="search" placeholder="Role, company, skill…" value={keyword}
              onChange={e => { setKeyword(e.target.value); setPage(1); }}
              className="flex-1 min-w-0 p-3 rounded-lg border-2 border-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-500"
              aria-label="Search jobs" />
            <select value={city} onChange={e => { setCity(e.target.value); setPage(1); }}
              className="md:w-44 p-3 rounded-lg border-2 border-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-500">
              <option value="">All Cities</option>
              {CITIES.map(c => <option key={c.name} value={c.name}>{c.name}</option>)}
            </select>
            <select value={experience} onChange={e => { setExperience(e.target.value); setPage(1); }}
              className="md:w-44 p-3 rounded-lg border-2 border-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-500">
              <option value="">All Experience</option>
              <option value="Fresher">Fresher (0–1 yr)</option>
              <option value="Experienced">Experienced (2+ yrs)</option>
            </select>
            <select value={jobType} onChange={e => { setJobType(e.target.value); setPage(1); }}
              className="md:w-40 p-3 rounded-lg border-2 border-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-500">
              <option value="">All Types</option>
              {['Full-Time', 'Internship', 'Part-Time', 'Remote', 'Contract'].map(t => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
          </div>
        </div>
      </section>

      {/* Listings */}
      <section className="container mx-auto px-4 py-10">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-bold text-gray-800">
            {city ? `Jobs in ${city}` : 'All Verified Jobs'}
          </h2>
          <span className="text-sm text-gray-500 bg-gray-100 px-3 py-1 rounded-full">
            {filtered.length} results
          </span>
        </div>

        {visible.length === 0 ? (
          <div className="text-center py-16">
            <p className="text-gray-500 mb-3">No jobs match your filters.</p>
            <button onClick={() => { setKeyword(''); setCity(''); setExperience(''); setJobType(''); setPage(1); }}
              className="text-blue-600 underline text-sm">Clear filters</button>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
            {visible.map(job => <JobCard key={job.id} job={job} />)}
          </div>
        )}

        {totalPages > 1 && (
          <div className="flex justify-center gap-2 mt-8 flex-wrap">
            {Array.from({ length: totalPages }, (_, i) => i + 1).map(p => (
              <button key={p} onClick={() => setPage(p)}
                className={`px-4 py-2 rounded-lg border text-sm font-medium transition-colors ${p === page ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-600 border-gray-300 hover:bg-blue-50'}`}>
                {p}
              </button>
            ))}
          </div>
        )}
      </section>
    </Layout>
  );
}

export async function getStaticProps() {
  const jobs = await getAllJobs();
  return { props: { jobs } };
}
