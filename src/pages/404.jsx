import Link from 'next/link';
import Layout from '../components/Layout';
import { SITE } from '../lib/seo';

export default function NotFound() {
  return (
    <Layout meta={{
      title: `Page Not Found | ${SITE.name}`,
      description: 'The page you are looking for does not exist.',
    }}>
      <div className="container mx-auto px-4 py-24 text-center">
        <h1 className="text-8xl font-bold text-blue-600 mb-4">404</h1>
        <h2 className="text-2xl font-semibold text-gray-800 mb-4">Page Not Found</h2>
        <p className="text-gray-500 mb-8">The job or page you're looking for doesn't exist or has been removed.</p>
        <div className="flex gap-4 justify-center">
          <Link href="/" className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-3 rounded-lg font-medium transition-colors">
            Go Home
          </Link>
          <Link href="/jobs/" className="border border-blue-600 text-blue-600 hover:bg-blue-50 px-6 py-3 rounded-lg font-medium transition-colors">
            Browse Jobs
          </Link>
        </div>
      </div>
    </Layout>
  );
}
