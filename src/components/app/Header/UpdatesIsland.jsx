import { useContext, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";

import EDPLogo from "../../graphics/EDPLogo";
import { AppContext } from "../../../App";

import "./UpdatesIsland.css";

/**
 * "Ile" des nouveautes, en haut de l'ecran (style Dynamic Island / succes
 * Xbox) : un rond avec le logo apparait, s'etire en pilule, affiche chaque
 * nouveaute pas encore vue a tour de role, puis se referme.
 *
 * Sources : les evenements du fil pas encore montres dans l'ile, ou un apercu
 * envoye par window.dispatchEvent(new CustomEvent("edp-island-preview", { detail: [evenements] })).
 */

const TYPE_LABELS = { grade: "Nouvelle note", homework: "Cahier de texte", message: "Messagerie", course: "Emploi du temps", test: "Test" };
const TIMINGS = { dot: 550, open: 650, perEvent: 3600, swap: 260, close: 500, gone: 350 };

export default function UpdatesIsland() {
    const { updatesFeed, markUpdatesShown, activeAccount } = useContext(AppContext);
    const navigate = useNavigate();
    // hidden -> dot -> open -> closing -> leaving -> hidden
    const [phase, setPhase] = useState("hidden");
    const [queue, setQueue] = useState([]);
    const [index, setIndex] = useState(0);
    const [swapping, setSwapping] = useState(false);
    const timers = useRef([]);
    const playing = useRef(false);

    const later = (callback, delay) => {
        timers.current.push(setTimeout(callback, delay));
    };
    const clearTimers = () => {
        timers.current.forEach(clearTimeout);
        timers.current = [];
    };

    const play = (events) => {
        if (playing.current || events.length === 0) return;
        playing.current = true;
        clearTimers();
        setQueue(events);
        setIndex(0);
        setPhase("dot");

        let elapsed = TIMINGS.dot;
        later(() => setPhase("open"), elapsed);
        elapsed += TIMINGS.open + TIMINGS.perEvent;
        for (let next = 1; next < events.length; next++) {
            later(() => setSwapping(true), elapsed);
            later(() => { setIndex(next); setSwapping(false); }, elapsed + TIMINGS.swap);
            elapsed += TIMINGS.swap + TIMINGS.perEvent;
        }
        later(() => setPhase("closing"), elapsed);
        later(() => setPhase("leaving"), elapsed + TIMINGS.close);
        later(() => { setPhase("hidden"); playing.current = false; }, elapsed + TIMINGS.close + TIMINGS.gone);
    };

    const close = () => {
        clearTimers();
        setPhase("closing");
        later(() => setPhase("leaving"), TIMINGS.close);
        later(() => { setPhase("hidden"); playing.current = false; }, TIMINGS.close + TIMINGS.gone);
    };

    // Nouveautes pas encore montrees : on les joue des que l'appli est a l'ecran.
    useEffect(() => {
        const unseen = (updatesFeed ?? []).filter((event) => !event.shownInIsland);
        if (unseen.length === 0 || playing.current) return undefined;

        const start = () => {
            if (document.visibilityState !== "visible" || playing.current) return;
            const shown = unseen.slice(0, 5);
            const rest = unseen.length - shown.length;
            play(rest > 0
                ? [...shown, { id: "island-more", type: "more", title: `Et ${rest} autre${rest > 1 ? "s" : ""} nouveauté${rest > 1 ? "s" : ""}`, body: "Tout est listé sur l'accueil", path: "dashboard" }]
                : shown);
            markUpdatesShown(unseen.map((event) => event.id));
        };
        const delay = setTimeout(start, 700);
        document.addEventListener("visibilitychange", start);
        return () => {
            clearTimeout(delay);
            document.removeEventListener("visibilitychange", start);
        };
    }, [updatesFeed]);

    useEffect(() => {
        const onPreview = (event) => play(event.detail ?? []);
        window.addEventListener("edp-island-preview", onPreview);
        return () => {
            window.removeEventListener("edp-island-preview", onPreview);
            clearTimers();
        };
    }, []);

    if (phase === "hidden") return null;

    const current = queue[index] ?? {};
    const openTarget = () => {
        if (current.path) navigate(`/app/${activeAccount}/${current.path}`);
        close();
    };

    return (
        <div className="updates-island-anchor" aria-live="polite">
            <button
                type="button"
                className={`updates-island ${phase} type-${current.type ?? "test"}`}
                onClick={phase === "open" ? openTarget : undefined}
                aria-label={`${current.title ?? ""}. ${current.body ?? ""}`}
            >
                <span className="updates-island-glow" aria-hidden="true" />
                <span className="updates-island-logo" aria-hidden="true">
                    <EDPLogo id="island-logo" />
                </span>
                <span className={`updates-island-content${swapping ? " swapping" : ""}`}>
                    <span className="updates-island-caption">
                        {TYPE_LABELS[current.type] ?? "Nouveautés"}
                        {queue.length > 1 && <span className="updates-island-counter">{index + 1}/{queue.length}</span>}
                    </span>
                    <span className="updates-island-title">{current.title}</span>
                    {current.body && <span className="updates-island-body">{current.body}</span>}
                </span>
                {phase === "open" && (
                    <span
                        className="updates-island-close"
                        role="button"
                        tabIndex={0}
                        aria-label="Fermer"
                        onClick={(event) => { event.stopPropagation(); close(); }}
                        onKeyDown={(event) => { if (event.key === "Enter") { event.stopPropagation(); close(); } }}
                    >×</span>
                )}
            </button>
        </div>
    );
}
