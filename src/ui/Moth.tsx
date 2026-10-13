/** Bookmoth's mark: a small moth whose wings beat now and then. */
export function Moth({ className = '' }: { className?: string }) {
  return (
    <svg viewBox="0 0 48 40" className={className} aria-hidden="true" fill="currentColor">
      <g className="moth-wing left">
        <path d="M23 15C17 5 8 2 2 5c-2 6 2 14 9 16 4 1.200 9 0 12-3z" opacity="0.9" />
        <path d="M22.500 20c-5 1-10 4-11 10 4 4 10 2 12-5z" opacity="0.6" />
      </g>
      <g className="moth-wing right">
        <path d="M25 15C31 5 40 2 46 5c2 6-2 14-9 16-4 1.200-9 0-12-3z" opacity="0.9" />
        <path d="M25.500 20c5 1 10 4 11 10-4 4-10 2-12-5z" opacity="0.6" />
      </g>
      <ellipse cx="24" cy="20" rx="2.200" ry="9" />
      <path d="M23 11c-1-4-3-6-6-7M25 11c1-4 3-6 6-7" fill="none" stroke="currentColor" strokeWidth="1" strokeLinecap="round" />
    </svg>
  )
}
