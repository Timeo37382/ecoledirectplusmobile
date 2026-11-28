import { useContext, useEffect, useMemo, useRef, useState } from "react";

import { AppContext } from "../../../App";

import "./SchoolLife.css";

/**
 * Vie scolaire detaillee (route /app/:userId/school-life).
 *
 * Lit directement la reponse d'EcoleDirecte (viescolaire.awp) :
 *   absencesRetards[]          typeElement "Absence" | "Retard"
 *   sanctionsEncouragements[]  typeElement "Punition" | "Sanction" | "Encouragement"...
 *   parametrage                ce que l'etablissement rend visible
 * Champs utiles : date, displayDate, libelle, motif, justifie,
 * typeJustification (" en attente de prise en compte..."), commentaire, par,
 * aFaire, dateDeroulement ("S'est deroule le ...<BR>de 13:00 a 14:00").
 *
 * Tout le texte est affiche tel quel (jamais interprete comme du HTML).
 */

const KINDS = {
    absence: { label: "Absence", plural: "Absences" },
    delay: { label: "Retard", plural: "Retards" },
    sanction: { label: "Punition", plural: "Punitions" },
    encouragement: { label: "Encouragement", plural: "Encouragements" },
};
const KIND_ORDER = ["absence", "delay", "sanction", "encouragement"];

const DEMO = {
    absencesRetards: [
        { id: 1, typeElement: "Absence", date: "2026-11-24", displayDate: "le mardi 24 novembre 2026 de 08:00 à 12:00", libelle: "1 demi-journée", motif: "Maladie", justifie: true, typeJustification: "", commentaire: "", par: "" },
        { id: 2, typeElement: "Retard", date: "2026-11-20", displayDate: "le vendredi 20 novembre 2026 à 08:10", libelle: "10 minutes", motif: "Transport", justifie: false, typeJustification: "", commentaire: "", par: "" },
        { id: 3, typeElement: "Absence", date: "2026-11-05", displayDate: "le jeudi 5 novembre 2026 de 13:30 à 17:30", libelle: "1 demi-journée", motif: "", justifie: true, typeJustification: " en attente de prise en compte par la vie scolaire", commentaire: "Rendez-vous médical.", par: "" },
        { id: 4, typeElement: "Retard", date: "2026-10-12", displayDate: "le lundi 12 octobre 2026 à 08:05", libelle: "5 minutes", motif: "", justifie: true, typeJustification: "", commentaire: "", par: "" },
    ],
    sanctionsEncouragements: [
        { id: 5, typeElement: "Punition", date: "2026-10-30", displayDate: "", libelle: "RETENUE", motif: "Oubli répété du matériel", justifie: false, commentaire: "", par: "M. Martin", aFaire: "1 heure", dateDeroulement: "S'est déroulé le mer. 04 novembre<BR>de 13:00 à 14:00" },
        { id: 6, typeElement: "Encouragement", date: "2026-10-16", displayDate: "", libelle: "Félicitations", motif: "Excellent travail en mathématiques", justifie: false, commentaire: "", par: "Mme Durand", aFaire: "", dateDeroulement: "" },
    ],
    parametrage: { encouragementsVisible: true, sanctionsVisible: true },
};

function kindOf(item, fromSanctions) {
    const type = String(item.typeElement ?? "").toLowerCase();
    if (type.startsWith("absence")) return "absence";
    if (type.startsWith("retard")) return "delay";
    if (type.startsWith("encourag")) return "encouragement";
    return fromSanctions ? "sanction" : "absence";
}

function clean(value) {
    return typeof value === "string" ? value.replace(/<br\s*\/?>/gi, " ").replace(/\s+/g, " ").trim() : "";
}

function capitalize(value) {
    return value ? value.charAt(0).toUpperCase() + value.slice(1) : value;
}

function parseDate(value) {
    if (!value) return null;
    const date = new Date(String(value).replace(" ", "T"));
    return Number.isNaN(date.getTime()) ? null : date;
}

/** Minutes d'un libelle de retard ("10 minutes", "1 heure", "1h15"). */
function minutesOf(libelle) {
    const text = String(libelle ?? "").toLowerCase();
    const hours = text.match(/(\d+)\s*(h|heure)/);
    const minutes = text.match(/(\d+)\s*min/) ?? text.match(/h\s*(\d+)/);
    return (hours ? parseInt(hours[1], 10) * 60 : 0) + (minutes ? parseInt(minutes[1], 10) : 0);
}

function formatMinutes(total) {
    if (total < 60) return `${total} min`;
    const h = Math.floor(total / 60);
    const m = total % 60;
    return m ? `${h} h ${String(m).padStart(2, "0")}` : `${h} h`;
}

export function normalizeSchoolLife(raw) {
    if (!raw || typeof raw !== "object") return null;
    const toItem = (item, fromSanctions) => {
        const kind = kindOf(item, fromSanctions);
        const pending = /attente/i.test(item.typeJustification ?? "");
        return {
            key: `${kind}-${item.id ?? Math.random()}`,
            kind,
            type: clean(item.typeElement),
            libelle: clean(item.libelle),
            date: parseDate(item.date),
            displayDate: clean(item.displayDate),
            justified: !!item.justifie && !pending,
            pending,
            motif: clean(item.motif),
            comment: clean(item.commentaire),
            by: clean(item.par),
            todo: clean(item.aFaire),
            happened: clean(item.dateDeroulement),
        };
    };
    const items = [
        ...(Array.isArray(raw.absencesRetards) ? raw.absencesRetards : []).map((item) => toItem(item, false)),
        ...(Array.isArray(raw.sanctionsEncouragements) ? raw.sanctionsEncouragements : []).map((item) => toItem(item, true)),
    ].sort((a, b) => (b.date?.getTime() ?? 0) - (a.date?.getTime() ?? 0));
    return { items, settings: raw.parametrage ?? {} };
}

function itemTitle(item) {
    if (item.kind === "absence" || item.kind === "delay") {
        return item.libelle ? `${KINDS[item.kind].label} · ${item.libelle}` : KINDS[item.kind].label;
    }
    return capitalize(item.libelle.toLowerCase()) || item.type || KINDS[item.kind].label;
}

function itemDate(item) {
    if (item.displayDate) return capitalize(item.displayDate.replace(/^le\s+/i, ""));
    if (!item.date) return "";
    return capitalize(item.date.toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long", year: "numeric" }));
}

function Status({ item }) {
    if (item.kind !== "absence" && item.kind !== "delay") {
        return <span className="sl-status neutral">{item.kind === "encouragement" ? "Encouragement" : (item.type || "Punition")}</span>;
    }
    if (item.pending) return <span className="sl-status pending">En attente</span>;
    if (item.justified) return <span className="sl-status ok">Justifié{item.kind === "absence" ? "e" : ""}</span>;
    return <span className="sl-status ko">Non justifié{item.kind === "absence" ? "e" : ""}</span>;
}

function KindIcon({ kind }) {
    const paths = {
        absence: <path d="M7 7l10 10M17 7L7 17" />,
        delay: <><circle cx="12" cy="12" r="7.5" /><path d="M12 8v4.5l3 2" /></>,
        sanction: <path d="M12 4.5l8 14H4zM12 10v3.5M12 16.4v.1" />,
        encouragement: <path d="M12 4.5l2.3 4.7 5.2.7-3.8 3.6.9 5.1L12 16.2l-4.6 2.4.9-5.1-3.8-3.6 5.2-.7z" />,
    };
    return (
        <span className={`sl-kind-icon ${kind}`} aria-hidden="true">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">{paths[kind]}</svg>
        </span>
    );
}

function EventCard({ item, index }) {
    const [open, setOpen] = useState(false);
    const details = [
        item.motif && ["Motif", item.motif],
        item.todo && ["À faire", item.todo],
        item.happened && ["Déroulement", item.happened],
        item.by && ["Par", item.by],
        item.comment && ["Commentaire", item.comment],
    ].filter(Boolean);
    const hasDetails = details.length > 0;

    return (
        <li className={`sl-event ${item.kind}${open ? " open" : ""}`} style={{ "--order": Math.min(index, 12) }}>
            <button type="button" className="sl-event-main" onClick={() => hasDetails && setOpen((value) => !value)} aria-expanded={hasDetails ? open : undefined} disabled={!hasDetails}>
                <KindIcon kind={item.kind} />
                <span className="sl-event-text">
                    <span className="sl-event-title">{itemTitle(item)}</span>
                    <span className="sl-event-date">{itemDate(item)}</span>
                </span>
                <Status item={item} />
                {hasDetails && <span className="sl-chevron" aria-hidden="true">›</span>}
            </button>
            {hasDetails && (
                <div className="sl-event-details">
                    <dl>
                        {details.map(([label, value]) => (
                            <div className="sl-detail" key={label}>
                                <dt>{label}</dt>
                                <dd>{value}</dd>
                            </div>
                        ))}
                    </dl>
                </div>
            )}
        </li>
    );
}

export default function SchoolLife({ schoolLife, fetchSchoolLife, isLoggedIn, activeAccount }) {
    const { accountsListState } = useContext(AppContext);
    const account = accountsListState[activeAccount];
    const isGuest = account?.firstName === "Guest";
    const raw = isGuest ? DEMO : schoolLife?.[activeAccount];
    const data = useMemo(() => normalizeSchoolLife(raw), [raw]);
    const [filter, setFilter] = useState("all");
    const listRef = useRef(null);

    useEffect(() => {
        document.title = "Vie scolaire • Ecole Directe Plus";
    }, []);

    useEffect(() => {
        if (!isLoggedIn || isGuest || schoolLife?.[activeAccount] !== undefined) return undefined;
        const controller = new AbortController();
        fetchSchoolLife(controller);
        return () => controller.abort();
    }, [isLoggedIn, isGuest, activeAccount, schoolLife?.[activeAccount] === undefined]);

    const counts = useMemo(() => {
        const result = Object.fromEntries(KIND_ORDER.map((kind) => [kind, []]));
        (data?.items ?? []).forEach((item) => result[item.kind].push(item));
        return result;
    }, [data]);

    // Encouragements / punitions : caches si l'etablissement ne les montre pas et qu'il n'y en a aucun.
    const visibleKinds = KIND_ORDER.filter((kind) => {
        if (counts[kind].length > 0) return true;
        if (kind === "encouragement") return data?.settings?.encouragementsVisible !== false;
        if (kind === "sanction") return data?.settings?.sanctionsVisible !== false;
        return true;
    });

    const summary = {
        absence: () => {
            const unjustified = counts.absence.filter((item) => !item.justified && !item.pending).length;
            const pending = counts.absence.filter((item) => item.pending).length;
            if (!counts.absence.length) return "Aucune";
            if (unjustified) return `${unjustified} non justifiée${unjustified > 1 ? "s" : ""}`;
            if (pending) return `${pending} en attente`;
            return "Toutes justifiées";
        },
        delay: () => {
            if (!counts.delay.length) return "Aucun";
            const total = counts.delay.reduce((sum, item) => sum + minutesOf(item.libelle), 0);
            return total ? `${formatMinutes(total)} au total` : "";
        },
        sanction: () => (counts.sanction.length ? "" : "Aucune"),
        encouragement: () => (counts.encouragement.length ? "Bravo !" : "Aucun"),
    };

    const filtered = (data?.items ?? []).filter((item) => filter === "all" || item.kind === filter);
    const months = [];
    filtered.forEach((item) => {
        const label = item.date ? capitalize(item.date.toLocaleDateString("fr-FR", { month: "long", year: "numeric" })) : "Sans date";
        const last = months[months.length - 1];
        if (last && last.label === label) last.items.push(item);
        else months.push({ label, items: [item] });
    });

    const chooseFilter = (kind) => {
        setFilter(kind);
        listRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    };

    let runningIndex = 0;

    return (
        <div id="school-life">
            <div id="school-life-box">
                <h1>Vie scolaire</h1>

                <section className="sl-card sl-summary" aria-label="Résumé">
                    {visibleKinds.map((kind, index) => (
                        <button type="button" key={kind} className={`sl-tile ${kind}${filter === kind ? " active" : ""}`} style={{ "--order": index }} onClick={() => chooseFilter(filter === kind ? "all" : kind)}>
                            <KindIcon kind={kind} />
                            <span className="sl-tile-count">{data ? counts[kind].length : "…"}</span>
                            <span className="sl-tile-label">{KINDS[kind].plural}</span>
                            {data && <span className="sl-tile-sub">{summary[kind]()}</span>}
                        </button>
                    ))}
                </section>

                <section className="sl-card sl-list" ref={listRef} aria-label="Historique">
                    <div className="sl-filters" role="tablist" aria-label="Filtrer">
                        {["all", ...visibleKinds].map((kind) => (
                            <button type="button" role="tab" key={kind} aria-selected={filter === kind} className={filter === kind ? "active" : ""} onClick={() => setFilter(kind)}>
                                {kind === "all" ? "Tout" : KINDS[kind].plural}
                            </button>
                        ))}
                    </div>

                    {!data ? (
                        <ul className="sl-events">
                            {[0, 1, 2].map((index) => <li key={index} className="sl-event skeleton" />)}
                        </ul>
                    ) : filtered.length === 0 ? (
                        <p className="sl-empty">{filter === "all" ? "Rien à signaler cette année. 🎉" : `Aucun${filter === "absence" || filter === "sanction" ? "e" : ""} ${KINDS[filter].label.toLowerCase()} cette année.`}</p>
                    ) : (
                        months.map((month) => (
                            <div className="sl-month" key={month.label}>
                                <h2 className="sl-month-title">{month.label}</h2>
                                <ul className="sl-events">
                                    {month.items.map((item) => <EventCard key={item.key} item={item} index={runningIndex++} />)}
                                </ul>
                            </div>
                        ))
                    )}
                </section>

                {isGuest && <p className="sl-demo-note">Compte invité : données d'exemple.</p>}
            </div>
        </div>
    );
}
