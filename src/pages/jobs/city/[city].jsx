// src/pages/jobs/city/[city].jsx
// Generates /jobs/city/mumbai/, /jobs/city/bangalore/, etc.
// These are the LOCAL SEO pages — each ranks for "jobs in Mumbai" etc.
import Link from 'next/link';
import Layout from '../../../components/Layout';
import JobCard from '../../../components/JobCard';
import { getAllJobs } from '../../../lib/firebase-admin';
import { SITE, CITIES } from '../../../lib/seo';

export default function CityJobsPage({ cityName, jobs, totalJobs }) {
  const cityInfo = CITIES.find(c => c.name.toLowerCase() === cityName.toLowerCase());

  const localBusinessSchema = {
    '@context': 'https://schema.org',
    '@type': 'WebPage',
    name: `Jobs in ${cityName} | ${SITE.name}`,
    description: `Browse verified free jobs in ${cityName} for freshers and professionals. Updated daily by Employee Table.`,
    url: `${SITE.url}/jobs/city/${cityName.toLowerCase()}/`,
    breadcrumb: {
      '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'Home', item: SITE.url + '/' },
        { '@type': 'ListItem', position: 2, name: 'Jobs', item: SITE.url + '/jobs/' },
        { '@type': 'ListItem', position: 3, name: `Jobs in ${cityName}`, item: `${SITE.url}/jobs/city/${cityName.toLowerCase()}/` },
      ],
    },
  };

  const extraHead = (
    <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(localBusinessSchema) }} />
  );

  return (
    <Layout meta={{
      title: `Jobs in ${cityName} for Freshers & Professionals 2024 | ${SITE.name}`,
      description: `Find ${totalJobs}+ verified free jobs in ${cityName} for freshers and experienced professionals. IT, Finance, Marketing, HR and more. Updated daily.`,
      canonical: `${SITE.url}/jobs/city/${cityName.toLowerCase()}/`,
      extraHead,
    }}>
      {/* Hero */}
      <section className="bg-gradient-to-r from-blue-600 to-blue-800 text-white py-14">
        <div className="container mx-auto px-4 text-center">
          <div className="text-5xl mb-4">{cityInfo?.emoji || '🏙️'}</div>
          <h1 className="text-3xl md:text-4xl font-bold mb-3">
            Verified Jobs in {cityName}
          </h1>
          <p className="text-blue-100 max-w-xl mx-auto">
            {totalJobs} free, verified job openings in {cityName} for freshers and professionals.
            {cityInfo && ` Industries: ${cityInfo.industries}.`} Updated daily.
          </p>
        </div>
      </section>

      {/* Breadcrumb */}
      <div className="container mx-auto px-4 py-4">
        <nav className="text-sm text-gray-500" aria-label="Breadcrumb">
          <Link href="/" className="hover:text-blue-600">Home</Link>
          <span className="mx-2">›</span>
          <Link href="/jobs/" className="hover:text-blue-600">Jobs</Link>
          <span className="mx-2">›</span>
          <span className="text-gray-700">Jobs in {cityName}</span>
        </nav>
      </div>

      {/* Jobs grid */}
      <section className="container mx-auto px-4 pb-12">
        <h2 className="text-2xl font-bold text-gray-800 mb-6">
          {jobs.length} Jobs in {cityName}
        </h2>
        {jobs.length === 0 ? (
          <div className="text-center py-16 bg-white rounded-xl shadow-sm">
            <p className="text-gray-500 mb-4">No jobs currently listed for {cityName}.</p>
            <Link href="/jobs/" className="text-blue-600 underline">Browse all jobs</Link>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {jobs.map(job => <JobCard key={job.id} job={job} />)}
          </div>
        )}
      </section>

      {/* Other cities */}
      <section className="py-10 bg-gray-50">
        <div className="container mx-auto px-4">
          <h2 className="text-xl font-bold text-gray-800 mb-5">Jobs in Other Cities</h2>
          <div className="flex flex-wrap gap-3">
            {CITIES.filter(c => c.name.toLowerCase() !== cityName.toLowerCase()).map(c => (
              <Link key={c.name} href={`/jobs/city/${c.name.toLowerCase()}/`}
                className="bg-white border border-gray-200 hover:border-blue-500 hover:text-blue-600 rounded-lg px-4 py-2 text-sm font-medium transition-colors">
                {c.emoji} {c.name}
              </Link>
            ))}
          </div>
        </div>
      </section>
    </Layout>
  );
}

export async function getStaticPaths() {
  return {
    paths: CITIES.map(c => ({ params: { city: c.name.toLowerCase() } })),
    fallback: false,
  };
}

export async function getStaticProps({ params }) {
  const all = await getAllJobs();
  const cityName = CITIES.find(c => c.name.toLowerCase() === params.city)?.name || params.city;
  const jobs = all.filter(j =>
    (j.workLocation || '').toLowerCase().includes(params.city.toLowerCase())
  );
  return {
    props: { cityName, jobs, totalJobs: jobs.length },
  };
}
