// src/lib/seo.js
// Shared SEO constants and helpers

export const SITE = {
  name: 'Employee Table',
  url: 'https://www.employeetable.in',
  tagline: 'Verified Jobs for Freshers & Professionals in India',
  description:
    'Find verified, free job opportunities for freshers and experienced professionals across India. Daily updates on jobs in Mumbai, Bangalore, Delhi, Pune, Hyderabad, Noida. No fees, no scams — since 2021.',
  logo: 'https://www.employeetable.in/logo.png',
  twitter: '@employeetable',
};

export const CITIES = [
  { name: 'Mumbai',    emoji: '🏙️', industries: 'Finance · IT · Media' },
  { name: 'Bangalore', emoji: '💻', industries: 'Tech · Startups · IT' },
  { name: 'Delhi',     emoji: '🏛️', industries: 'Govt · Corporate · MNC' },
  { name: 'Hyderabad', emoji: '🔬', industries: 'IT · Pharma · FMCG' },
  { name: 'Pune',      emoji: '🎓', industries: 'Auto · IT · Education' },
  { name: 'Noida',     emoji: '📡', industries: 'IT · BPO · Startups' },
  { name: 'Chennai',   emoji: '🌊', industries: 'Manufacturing · IT' },
  { name: 'Remote',    emoji: '🌐', industries: 'Work from anywhere' },
];

export function timeAgo(ts) {
  if (!ts) return 'Recently posted';
  const diff = Date.now() - ts;
  const d = Math.floor(diff / 86400000);
  if (d === 0) return 'Today';
  if (d === 1) return 'Yesterday';
  if (d < 7) return `${d} days ago`;
  return new Date(ts).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

export function formatDate(ts) {
  return new Date(ts).toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

export function mapJobType(type) {
  const map = {
    'Full-Time': 'FULL_TIME',
    'Part-Time': 'PART_TIME',
    Internship: 'INTERN',
    Contract: 'CONTRACTOR',
    Remote: 'FULL_TIME',
  };
  return map[type] || 'FULL_TIME';
}
