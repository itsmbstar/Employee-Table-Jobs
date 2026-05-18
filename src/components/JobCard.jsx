// src/components/JobCard.jsx
import Link from 'next/link';
import { timeAgo } from '../lib/seo';

export default function JobCard({ job }) {
  return (
    <article className="bg-white rounded-xl shadow-md hover:shadow-xl transition-shadow duration-300 flex flex-col overflow-hidden">
      <div className="p-5 flex flex-col flex-1 space-y-3">
        {/* Company header */}
        <div className="flex items-center gap-3">
          {job.companyLogo ? (
            <img
              src={job.companyLogo}
              alt={`${job.companyName} logo`}
              className="w-12 h-12 object-contain rounded-lg border border-gray-100 bg-gray-50"
              width="48" height="48" loading="lazy"
            />
          ) : (
            <div className="w-12 h-12 rounded-lg bg-blue-100 flex items-center justify-center text-blue-700 font-bold text-lg flex-shrink-0">
              {job.companyName.charAt(0)}
            </div>
          )}
          <div>
            <h3 className="text-sm font-semibold text-gray-800 leading-tight">{job.jobRole}</h3>
            <p className="text-blue-600 text-xs font-medium">{job.companyName}</p>
          </div>
        </div>

        {/* Details */}
        <div className="space-y-1 flex-1 text-xs text-gray-600">
          <p>📍 {job.workLocation}</p>
          <p>💼 {job.jobType}</p>
          <p>⏱ {job.experience}</p>
          <p>🎓 {job.qualification}</p>
          {job.package && <p>💰 {job.package}</p>}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between text-xs text-gray-400 pt-1">
          <span>{timeAgo(job.timestamp)}</span>
          <span>👥 {job.clicks || 0} applied</span>
        </div>

        {/* Buttons */}
        <div className="flex gap-2 mt-auto">
          <Link
            href={`/jobs/${job.slug}/`}
            className="flex-1 text-center border border-blue-600 text-blue-600 hover:bg-blue-50 px-3 py-2 rounded-lg text-xs font-medium transition-colors"
          >
            View Details
          </Link>
          <a
            href={job.applyLink}
            target="_blank"
            rel="noopener noreferrer"
            className="flex-1 text-center bg-blue-600 hover:bg-blue-700 text-white px-3 py-2 rounded-lg text-xs font-medium transition-colors"
            aria-label={`Apply for ${job.jobRole} at ${job.companyName}`}
          >
            Apply Now ↗
          </a>
        </div>
      </div>
    </article>
  );
}
