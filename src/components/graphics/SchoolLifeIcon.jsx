import "./graphics.css"

// Presse-papiers avec une coche et des lignes : la vie scolaire.
export default function SchoolLifeIcon({ className = "", id = "", alt, ...props }) {
    return (
        <svg aria-label={alt} className={className} id={id} xmlns="http://www.w3.org/2000/svg" viewBox="0 0 35 35" fill="none" {...props}>
            <path d="M13.5 8.5h-1.25A2.75 2.75 0 0 0 9.5 11.25v14A2.75 2.75 0 0 0 12.25 28h10.5a2.75 2.75 0 0 0 2.75-2.75v-14A2.75 2.75 0 0 0 22.75 8.5H21.5" stroke="currentColor" className="stroke-text-alt" strokeWidth="2" strokeLinecap="round" />
            <rect x="13.5" y="7" width="8" height="3.5" rx="1.5" stroke="currentColor" className="stroke-text-alt" strokeWidth="2" />
            <path d="M13 17.5l1.6 1.6 3-3.2" stroke="currentColor" className="stroke-text-alt" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            <path d="M19.5 18h2.5M13.5 23h8.5" stroke="currentColor" className="stroke-text-alt" strokeWidth="2" strokeLinecap="round" />
        </svg>
    )
}
