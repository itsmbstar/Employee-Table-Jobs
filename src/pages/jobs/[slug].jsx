// src/pages/jobs/[slug].jsx
// Each job gets its own .html file at /jobs/software-engineer-tcs-abc123/
import Link from 'next/link';
import Layout from '../../components/Layout';
import { getAllJobs } from '../../lib/firebase-admin';
import { SITE, timeAgo, mapJobType, formatDate } from '../../lib/seo';

export default function JobDetailPage({ job, relatedJobs }) {
  if (!job) return null;

  const jobSchema = {
    '@context': 'https://schema.org',
    '@type': 'JobPosting',
    title: job.jobRole,
    description: `${job.jobRole} at ${job.companyName}. Experience required: ${job.experience}. Qualification: ${job.qualification}. Location: ${job.workLocation}.${job.skills ? ' Required skills: ' + job.skills : ''}`,
    datePosted: new Date(job.timestamp).toISOString(),
    validThrough: new Date(job.timestamp + 30 * 86400000).toISOString(), // 30 days
    hiringOrganization: {
      '@type': 'Organization',
      name: job.companyName,
      logo: job.companyLogo || SITE.logo,
    },
    jobLocation: {
      '@type': 'Place',
      address: {
        '@type': 'PostalAddress',
        addressLocality: job.workLocation,
        addressCountry: 'IN',
      },
    },
    employmentType: mapJobType(job.jobType),
    ...(job.package && {
      baseSalary: {
        '@type': 'MonetaryAmount',
        currency: 'INR',
        value: { '@type': 'QuantitativeValue', value: job.package, unitText: 'YEAR' },
      },
    }),
    experienceRequirements: job.experience,
    educationRequirements: job.qualification,
    url: `${SITE.url}/jobs/${job.slug}/`,
    directApply: true,
  };

  const breadcrumbSchema = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Home', item: SITE.url + '/' },
      { '@type': 'ListItem', position: 2, name: 'Jobs', item: SITE.url + '/jobs/' },
      { '@type': 'ListItem', position: 3, name: job.jobRole, item: `${SITE.url}/jobs/${job.slug}/` },
    ],
  };

  const extraHead = (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jobSchema) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbSchema) }} />
    </>
  );

  return (
    <Layout meta={{
      title: `${job.jobRole} at ${job.companyName} — ${job.workLocation} | ${SITE.name}`,
      description: `Apply for ${job.jobRole} at ${job.companyName} in ${job.workLocation}. Experience: ${job.experience}. Qualification: ${job.qualification}. Free verified job — no fees.`,
      canonical: `${SITE.url}/jobs/${job.slug}/`,
      ogType: 'article',
      extraHead,
    }}>
      <div className="container mx-auto px-4 py-10 max-w-4xl">
        {/* Breadcrumb */}
        <nav className="text-sm text-gray-500 mb-6" aria-label="Breadcrumb">
          <Link href="/" className="hover:text-blue-600">Home</Link>
          <span className="mx-2">›</span>
          <Link href="/jobs/" className="hover:text-blue-600">Jobs</Link>
          <span className="mx-2">›</span>
          <span className="text-gray-700">{job.jobRole}</span>
        </nav>

        {/* Job Header */}
        <div className="bg-white rounded-2xl shadow-md p-8 mb-8">
          <div className="flex items-start gap-5 mb-6">
            {job.companyLogo ? (
              <img src={job.companyLogo} alt={`${job.companyName} logo`}
                className="w-20 h-20 object-contain rounded-xl border border-gray-100 bg-gray-50"
                width="80" height="80" />
            ) : (
              <div className="w-20 h-20 rounded-xl bg-blue-100 flex items-center justify-center text-blue-700 font-bold text-2xl flex-shrink-0">
                {job.companyName.charAt(0)}
              </div>
            )}
            <div className="flex-1">
              <h1 className="text-2xl md:text-3xl font-bold text-gray-900 mb-1">{job.jobRole}</h1>
              <p className="text-blue-600 text-lg font-semibold">{job.companyName}</p>
              <p className="text-gray-500 text-sm mt-1">Posted {timeAgo(job.timestamp)}</p>
            </div>
          </div>

          {/* Details grid */}
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-8">
            {[
              ['📍 Location', job.workLocation],
              ['💼 Job Type', job.jobType],
              ['⏱ Experience', job.experience],
              ['🎓 Qualification', job.qualification],
              ...(job.package ? [['💰 Salary', job.package]] : []),
              ...(job.skills ? [['🛠 Skills', job.skills]] : []),
            ].map(([label, value]) => (
              <div key={label} className="bg-gray-50 rounded-xl p-4">
                <p className="text-xs text-gray-500 mb-1">{label}</p>
                <p className="text-sm font-semibold text-gray-800">{value}</p>
              </div>
            ))}
          </div>

          {/* Apply CTA */}
          <div className="flex flex-col sm:flex-row gap-4">
            <a href={job.applyLink} target="_blank" rel="noopener noreferrer"
              className="flex-1 text-center bg-blue-600 hover:bg-blue-700 text-white font-bold py-4 rounded-xl text-lg transition-colors shadow-md">
              Apply Now ↗
            </a>
            <Link href="/jobs/"
              className="flex-1 text-center border-2 border-blue-600 text-blue-600 hover:bg-blue-50 font-semibold py-4 rounded-xl text-base transition-colors">
              ← Browse More Jobs
            </Link>
          </div>

          <p className="text-xs text-gray-400 text-center mt-4">
            ✅ Verified by Employee Table · Free to apply · No registration required
          </p>
        </div>

        {/* Related Jobs */}
        {relatedJobs.length > 0 && (
          <section>
            <h2 className="text-xl font-bold text-gray-800 mb-5">
              More Jobs in {job.workLocation}
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-5">
              {relatedJobs.map(j => (
                <div key={j.id} className="bg-white rounded-xl shadow-sm p-5 border border-gray-100 hover:shadow-md transition-shadow">
                  <h3 className="font-semibold text-gray-800 text-sm mb-1">{j.jobRole}</h3>
                  <p className="text-blue-600 text-xs mb-2">{j.companyName}</p>
                  <p className="text-gray-500 text-xs mb-3">📍 {j.workLocation} · {j.jobType}</p>
                  <Link href={`/jobs/${j.slug}/`}
                    className="text-blue-600 hover:text-blue-800 text-xs font-medium underline">
                    View Details →
                  </Link>
                </div>
              ))}
            </div>
          </section>
        )}
      </div>
    </Layout>
  );
}

// ── Static Generation ────────────────────────────────────────────
export async function getStaticPaths() {
  const jobs = await getAllJobs();
  return {
    paths: jobs.map(j => ({ params: { slug: j.slug } })),
    fallback: false,
  };
}

export async function getStaticProps({ params }) {
  const jobs = await getAllJobs();
  const job = jobs.find(j => j.slug === params.slug);
  if (!job) return { notFound: true };

  const relatedJobs = jobs
    .filter(j => j.id !== job.id && j.workLocation === job.workLocation)
    .slice(0, 3);

  return { props: { job, relatedJobs } };
}
