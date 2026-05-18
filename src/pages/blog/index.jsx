// src/pages/blog/index.jsx
import Link from 'next/link';
import Layout from '../../components/Layout';
import { getAllPosts } from '../../lib/firebase-admin';
import { SITE, formatDate } from '../../lib/seo';

export default function BlogPage({ posts }) {
  const blogSchema = {
    '@context': 'https://schema.org',
    '@type': 'Blog',
    url: SITE.url + '/blog/',
    name: `${SITE.name} Career Blog`,
    description: 'Career tips, resume guides, interview prep and fresher job news for India.',
    publisher: {
      '@type': 'Organization',
      name: SITE.name,
      logo: { '@type': 'ImageObject', url: SITE.logo },
    },
  };

  return (
    <Layout meta={{
      title: `Career Blog — Resume Tips, Interview Prep & Job Guides | ${SITE.name}`,
      description: 'Career tips, resume writing guides, interview preparation, and verified job news for freshers and experienced candidates across India.',
      canonical: SITE.url + '/blog/',
      extraHead: <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(blogSchema) }} />,
    }}>
      {/* Hero */}
      <section className="bg-gradient-to-r from-blue-600 to-blue-800 text-white py-12">
        <div className="container mx-auto px-4 text-center">
          <h1 className="text-3xl md:text-4xl font-bold mb-3">Career Blog</h1>
          <p className="text-blue-100 max-w-xl mx-auto">
            Resume tips, interview guides, and job market insights — free resources for freshers and professionals across India.
          </p>
        </div>
      </section>

      <main className="container mx-auto px-4 py-12 max-w-5xl">
        <h2 className="text-2xl font-bold mb-8 text-gray-800">Latest Articles</h2>

        {posts.length === 0 ? (
          <div className="text-center py-16 bg-white rounded-xl shadow-sm">
            <p className="text-gray-500">No articles published yet. Check back soon!</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {posts.map(post => (
              <article key={post.id}
                className="bg-white rounded-xl shadow-md hover:shadow-xl transition-shadow duration-300 flex flex-col overflow-hidden"
                itemScope itemType="https://schema.org/BlogPosting">
                {post.coverImage && (
                  <Link href={`/blog/${post.slug}/`}>
                    <img
                      src={post.coverImage}
                      alt={post.title}
                      className="w-full h-48 object-cover"
                      width="400" height="192"
                      loading="lazy"
                      itemProp="image"
                    />
                  </Link>
                )}
                <div className="p-6 flex flex-col flex-1">
                  <Link href={`/blog/${post.slug}/`} itemProp="url">
                    <h3 className="text-lg font-semibold text-gray-800 hover:text-blue-600 transition-colors mb-2 line-clamp-2" itemProp="headline">
                      {post.title}
                    </h3>
                  </Link>
                  {post.excerpt && (
                    <p className="text-gray-600 text-sm mb-4 line-clamp-2 flex-1" itemProp="description">
                      {post.excerpt}
                    </p>
                  )}
                  <div className="flex items-center justify-between mt-auto text-xs text-gray-400">
                    <time itemProp="datePublished" dateTime={new Date(post.timestamp).toISOString()}>
                      {formatDate(post.timestamp)}
                    </time>
                    <Link href={`/blog/${post.slug}/`} className="text-blue-600 font-medium hover:underline">
                      Read more →
                    </Link>
                  </div>
                </div>
              </article>
            ))}
          </div>
        )}
      </main>
    </Layout>
  );
}

export async function getStaticProps() {
  const posts = await getAllPosts();
  return { props: { posts } };
}
