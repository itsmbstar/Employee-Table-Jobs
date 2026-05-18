// src/components/Layout.jsx
import Head from 'next/head';
import Link from 'next/link';
import { SITE } from '../lib/seo';

export default function Layout({ children, meta = {} }) {
  const title = meta.title || SITE.tagline + ' | ' + SITE.name;
  const description = meta.description || SITE.description;
  const canonical = meta.canonical || SITE.url + '/';
  const ogImage = meta.ogImage || SITE.logo;
  const ogType = meta.ogType || 'website';

  return (
    <>
      <Head>
        <meta charSet="UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <title>{title}</title>
        <meta name="description" content={description} />
        <link rel="canonical" href={canonical} />
        <meta name="robots" content="index, follow" />
        <meta name="author" content={SITE.name} />

        {/* Open Graph */}
        <meta property="og:type" content={ogType} />
        <meta property="og:title" content={title} />
        <meta property="og:description" content={description} />
        <meta property="og:image" content={ogImage} />
        <meta property="og:url" content={canonical} />
        <meta property="og:site_name" content={SITE.name} />
        <meta property="og:locale" content="en_IN" />

        {/* Twitter */}
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:site" content={SITE.twitter} />
        <meta name="twitter:title" content={title} />
        <meta name="twitter:description" content={description} />
        <meta name="twitter:image" content={ogImage} />

        {/* Favicon */}
        <link rel="icon" type="image/png" href="/logo.png" />
        <link rel="apple-touch-icon" href="/logo.png" />
        <link rel="manifest" href="/manifest.webmanifest" />
        <meta name="theme-color" content="#1e40af" />

        {/* Inject extra head content (JSON-LD schemas etc.) */}
        {meta.extraHead}
      </Head>

      {/* ── Navbar ── */}
      <nav className="bg-white shadow-md p-4 flex justify-between items-center sticky top-0 z-50"
           role="navigation" aria-label="Main navigation">
        <Link href="/" aria-label="Employee Table Home">
          <img src="/logo.png" alt="Employee Table" className="h-10" width="120" height="40" />
        </Link>
        <div className="flex items-center space-x-1 md:space-x-5 text-sm font-medium flex-wrap gap-y-1">
          <Link href="/" className="hidden md:block hover:text-blue-600 transition-colors px-2 py-1">Home</Link>
          <Link href="/jobs/" className="hover:text-blue-600 transition-colors px-2 py-1">Jobs</Link>
          <Link href="/blog/" className="hover:text-blue-600 transition-colors px-2 py-1">Blog</Link>
          <Link href="/#cities" className="hidden md:block hover:text-blue-600 transition-colors px-2 py-1">Cities</Link>
          <Link href="/#about" className="hidden md:block hover:text-blue-600 transition-colors px-2 py-1">About</Link>
          <Link href="/#job-alerts"
            className="bg-blue-600 hover:bg-blue-700 text-white px-3 py-2 rounded-lg transition-colors">
            🔔 Job Alerts
          </Link>
        </div>
      </nav>

      {/* ── Page Content ── */}
      <main>{children}</main>

      {/* ── Footer ── */}
      <footer className="bg-gray-900 text-white py-14" role="contentinfo">
        <div className="container mx-auto grid grid-cols-1 md:grid-cols-4 gap-10 px-6">
          <div className="md:col-span-2">
            <div className="flex items-center mb-4">
              <img src="/logo.png" alt="Employee Table" className="h-12 mr-3" width="48" height="48" loading="lazy" />
              <span className="text-xl font-bold text-blue-400">Employee Table</span>
            </div>
            <p className="text-gray-400 text-sm leading-relaxed">
              Providing verified job updates free of cost since 2021. Specializing in fresher jobs
              and internships across India.
            </p>
          </div>
          <div>
            <h3 className="font-bold text-base mb-4 border-b border-gray-700 pb-2">Quick Links</h3>
            <ul className="space-y-2 text-sm text-gray-400">
              {[['/', 'Home'], ['/jobs/', 'Latest Jobs'], ['/blog/', 'Career Blog'], ['/#about', 'About Us'], ['/#job-alerts', 'Job Alerts']].map(([href, label]) => (
                <li key={href}><Link href={href} className="hover:text-white transition-colors">{label}</Link></li>
              ))}
            </ul>
          </div>
          <div>
            <h3 className="font-bold text-base mb-4 border-b border-gray-700 pb-2">Connect</h3>
            <div className="flex space-x-4 mb-4 text-xl">
              <a href="https://www.facebook.com/emptable" aria-label="Facebook" rel="noopener noreferrer" target="_blank" className="text-gray-400 hover:text-white">f</a>
              <a href="https://www.linkedin.com/company/employee-table/" aria-label="LinkedIn" rel="noopener noreferrer" target="_blank" className="text-gray-400 hover:text-white">in</a>
              <a href="https://www.instagram.com/emptable/" aria-label="Instagram" rel="noopener noreferrer" target="_blank" className="text-gray-400 hover:text-white">📷</a>
              <a href="https://chat.whatsapp.com/BOxrhvKzAwk3lLGL3GstyG" aria-label="WhatsApp" rel="noopener noreferrer" target="_blank" className="text-gray-400 hover:text-white">💬</a>
            </div>
            <p className="text-sm text-gray-400">
              <a href="mailto:emptable1@gmail.com" className="hover:text-white">emptable1@gmail.com</a>
            </p>
            <p className="text-sm text-gray-400 mt-1">
              <a href="tel:+919619748275" className="hover:text-white">+91 9619748275</a>
            </p>
          </div>
        </div>
        <div className="container mx-auto px-6 mt-10 pt-6 border-t border-gray-800 text-center text-gray-500 text-xs">
          © 2021–{new Date().getFullYear()} Employee Table. All rights reserved.
        </div>
      </footer>
    </>
  );
}
