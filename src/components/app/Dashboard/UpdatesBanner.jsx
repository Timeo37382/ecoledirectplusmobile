import { useContext, useState } from "react";
import { Link } from "react-router-dom";

import { AppContext } from "../../../App";

import "./UpdatesBanner.css";

// Nouveautes detectees depuis la derniere visite (voir utils/notifications.js).
// Restent affichees jusqu'a ce que l'eleve touche "Tout vu".

const TYPE_ICONS = { grade: "★", homework: "✎", message: "✉", course: "⚠" };
const COLLAPSED_COUNT = 4;

export default function UpdatesBanner() {
    const { updatesFeed, dismissUpdates, activeAccount } = useContext(AppContext);
    const [expanded, setExpanded] = useState(false);

    if (!updatesFeed?.length) return null;

    const shown = expanded ? updatesFeed : updatesFeed.slice(0, COLLAPSED_COUNT);
    const hiddenCount = updatesFeed.length - shown.length;

    return (
        <section className="updates-banner" aria-label="Nouveautés">
            <div className="updates-banner-header">
                <h2>Nouveautés <span className="updates-banner-count">{updatesFeed.length}</span></h2>
                <button type="button" className="updates-banner-dismiss" onClick={dismissUpdates}>Tout vu</button>
            </div>
            <ul className="updates-banner-list">
                {shown.map((event) => (
                    <li key={event.id}>
                        <Link to={`/app/${activeAccount}/${event.path}`} className={`updates-banner-item ${event.type}`}>
                            <span className="updates-banner-icon" aria-hidden="true">{TYPE_ICONS[event.type] ?? "•"}</span>
                            <span className="updates-banner-text">
                                <span className="updates-banner-title">{event.title}</span>
                                {event.body && <span className="updates-banner-body">{event.body}</span>}
                            </span>
                        </Link>
                    </li>
                ))}
            </ul>
            {hiddenCount > 0 && (
                <button type="button" className="updates-banner-more" onClick={() => setExpanded(true)}>
                    Voir les {hiddenCount} autre{hiddenCount > 1 ? "s" : ""}
                </button>
            )}
        </section>
    );
}
