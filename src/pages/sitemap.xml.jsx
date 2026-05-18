// src/pages/sitemap.xml.jsx
// Generates /sitemap.xml at build time with ALL pages: jobs, blog, city pages
import { getAllJobs, getAllPosts } from '../lib/firebase-admin';
import { SITE, CITIES } from '../lib/seo';

function generateSitemap(jobs, posts) {
  const now = new Date().toISOString().split('T')[0];

  const staticPages = [
    { url: SITE.url + '/',      changefreq: 'daily',   priority: '1.0',  lastmod: now },
    { url: SITE.url + '/jobs/', changefreq: 'daily',   priority: '0.9',  lastmod: now },
    { url: SITE.url + '/blog/', changefreq: 'weekly',  priority: '0.8',  lastmod: now },
  ];

  const cityPages = CITIES.map(c => ({
    url: `${SITE.url}/jobs/city/${c.name.toLowerCase()}/`,
    changefreq: 'daily',
    priority: '0.9',
    lastmod: now,
  }));

  const jobPages = jobs.map(j => ({
    url: `${SITE.url}/jobs/${j.slug}/`,
    changefreq: 'weekly',
    priority: '0.8',
    lastmod: new Date(j.timestamp).toISOString().split('T')[0],
  }));

  const blogPages = posts.map(p => ({
    url: `${SITE.url}/blog/${p.slug}/`,
    changefreq: 'monthly',
    priority: '0.7',
    lastmod: new Date(p.timestamp).toISOString().split('T')[0],
  }));

  const allPages = [...staticPages, ...cityPages, ...jobPages, ...blogPages];

  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${allPages.map(p => `  <url>
    <loc>${p.url}</loc>
    <lastmod>${p.lastmod}</lastmod>
    <changefreq>${p.changefreq}</changefreq>
    <priority>${p.priority}</priority>
  </url>`).join('\n')}
</urlset>`;
}

// This component doesn't render anything — it just outputs XML
export default function Sitemap() { return null; }

export async function getServerSideProps({ res }) {
  const [jobs, posts] = await Promise.all([getAllJobs(), getAllPosts()]);
  const sitemap = generateSitemap(jobs, posts);

  res.setHeader('Content-Type', 'application/xml');
  res.setHeader('Cache-Control', 's-maxage=86400, stale-while-revalidate');
  res.write(sitemap);
  res.end();

  return { props: {} };
}
