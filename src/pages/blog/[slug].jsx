// src/pages/blog/[slug].jsx
// Each post gets its own HTML file at /blog/how-ai-replacing-jobs/
import Link from 'next/link';
import Layout from '../../components/Layout';
import { getAllPosts } from '../../lib/firebase-admin';
import { SITE, formatDate } from '../../lib/seo';

export default function BlogPostPage({ post, relatedPosts }) {
  if (!post) return null;

  const blogPostSchema = {
    '@context': 'https://schema.org',
    '@type': 'BlogPosting',
    headline: post.title,
    description: post.excerpt || post.title,
    image: post.coverImage || SITE.logo,
    author: { '@type': 'Organization', name: SITE.name },
    publisher: {
      '@type': 'Organization',
      name: SITE.name,
      logo: { '@type': 'ImageObject', url: SITE.logo },
    },
    datePublished: new Date(post.timestamp).toISOString(),
    dateModified: new Date(post.timestamp).toISOString(),
    url: `${SITE.url}/blog/${post.slug}/`,
    mainEntityOfPage: { '@type': 'WebPage', '@id': `${SITE.url}/blog/${post.slug}/` },
    keywords: post.tags || '',
  };

  const breadcrumbSchema = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Home', item: SITE.url + '/' },
      { '@type': 'ListItem', position: 2, name: 'Blog', item: SITE.url + '/blog/' },
      { '@type': 'ListItem', position: 3, name: post.title, item: `${SITE.url}/blog/${post.slug}/` },
    ],
  };

  const extraHead = (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(blogPostSchema) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbSchema) }} />
    </>
  );

  return (
    <Layout meta={{
      title: `${post.title} | ${SITE.name}`,
      description: post.excerpt || post.title,
      canonical: `${SITE.url}/blog/${post.slug}/`,
      ogType: 'article',
      ogImage: post.coverImage || SITE.logo,
      extraHead,
    }}>
      <div className="container mx-auto px-4 py-10 max-w-3xl">
        {/* Breadcrumb */}
        <nav className="text-sm text-gray-500 mb-6" aria-label="Breadcrumb">
          <Link href="/" className="hover:text-blue-600">Home</Link>
          <span className="mx-2">›</span>
          <Link href="/blog/" className="hover:text-blue-600">Blog</Link>
          <span className="mx-2">›</span>
          <span className="text-gray-700 line-clamp-1">{post.title}</span>
        </nav>

        <article itemScope itemType="https://schema.org/BlogPosting">
          {/* Cover */}
          {post.coverImage && (
            <img
              src={post.coverImage}
              alt={post.title}
              className="w-full rounded-2xl mb-8 object-cover max-h-96"
              itemProp="image"
              width="800" height="400"
            />
          )}

          {/* Title */}
          <h1 className="text-3xl md:text-4xl font-bold text-gray-900 mb-4 leading-tight" itemProp="headline">
            {post.title}
          </h1>

          {/* Meta */}
          <div className="flex items-center gap-4 text-sm text-gray-500 mb-8 pb-6 border-b border-gray-200">
            <time dateTime={new Date(post.timestamp).toISOString()} itemProp="datePublished">
              📅 {formatDate(post.timestamp)}
            </time>
            <span itemProp="author" itemScope itemType="https://schema.org/Organization">
              <span itemProp="name">🏢 {SITE.name}</span>
            </span>
            {post.tags && <span>🏷 {post.tags}</span>}
          </div>

          {/* Content — rendered as HTML from Firebase */}
          <div
            className="blog-content"
            itemProp="articleBody"
            dangerouslySetInnerHTML={{ __html: post.content }}
          />

          {/* Tags */}
          {post.tags && (
            <div className="mt-8 pt-6 border-t border-gray-200">
              <p className="text-sm text-gray-500">
                Tags: {post.tags.split(',').map(t => (
                  <span key={t} className="inline-block bg-blue-50 text-blue-700 rounded-full px-3 py-0.5 text-xs mr-2 mb-2">{t.trim()}</span>
                ))}
              </p>
            </div>
          )}
        </article>

        {/* CTA */}
        <div className="mt-12 bg-blue-50 border border-blue-100 rounded-2xl p-8 text-center">
          <h2 className="text-xl font-bold text-gray-800 mb-2">Looking for verified jobs?</h2>
          <p className="text-gray-600 text-sm mb-4">
            Browse 100% free, manually verified job listings across India. Updated daily.
          </p>
          <Link href="/jobs/"
            className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-3 rounded-lg font-medium text-sm transition-colors inline-block">
            Browse Jobs Now →
          </Link>
        </div>

        {/* Related Posts */}
        {relatedPosts.length > 0 && (
          <section className="mt-12">
            <h2 className="text-xl font-bold text-gray-800 mb-5">More from the Blog</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
              {relatedPosts.map(p => (
                <Link key={p.id} href={`/blog/${p.slug}/`}
                  className="bg-white border border-gray-100 rounded-xl p-5 hover:shadow-md transition-shadow">
                  <h3 className="font-semibold text-gray-800 text-sm mb-1 line-clamp-2">{p.title}</h3>
                  <p className="text-gray-500 text-xs">{formatDate(p.timestamp)}</p>
                </Link>
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
  const posts = await getAllPosts();
  return {
    paths: posts.map(p => ({ params: { slug: p.slug } })),
    fallback: false,
  };
}

export async function getStaticProps({ params }) {
  const posts = await getAllPosts();
  const post = posts.find(p => p.slug === params.slug);
  if (!post) return { notFound: true };

  const relatedPosts = posts.filter(p => p.id !== post.id).slice(0, 4);

  return { props: { post, relatedPosts } };
}
