import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import qrcode from "qrcode-generator";
import JsBarcode from "jsbarcode";

import "./CanteenBadge.css";

/**
 * Badge cantine : le numero de badge (module EcoleDirecte CANTINE_BARCODE,
 * params.numeroBadge) affiche en code-barres Code 39, exactement comme l'appli
 * officielle (verifie en decodant son badge : *NUMERO*), ou en QR code si la
 * borne du self lit plutot les QR codes.
 *
 * Un appui l'ouvre en plein ecran sur fond blanc, ecran maintenu allume.
 * Masque en mode streamer : le numero suffit pour passer a la cantine.
 */

const FORMAT_KEY = "edp-canteen-badge-format";
const DEMO_NUMBER = "0123456789";

export function canteenBadgeNumber(account) {
    if (!account) return null;
    if (account.firstName === "Guest") return DEMO_NUMBER;
    const module = (account.modules ?? []).find((item) => item.code === "CANTINE_BARCODE");
    const number = module?.params?.numeroBadge;
    return module?.enable !== false && number ? String(number).trim() : null;
}

/**
 * Regime et repas de la semaine type : module RESERVATIONS du compte,
 * params { regime, repasmidi_1..7, repassoir_1..7 } ("1" = repas pris),
 * 1 = lundi ... 7 = dimanche. Present meme quand le module est "desactive".
 */
const DAYS = ["L", "M", "M", "J", "V", "S", "D"];
const DAY_NAMES = ["lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi", "dimanche"];

export function canteenMeals(account) {
    if (!account) return null;
    if (account.firstName === "Guest") {
        return { regime: "Demi-pensionnaire", midi: [true, true, false, true, true, false, false], soir: Array(7).fill(false) };
    }
    const params = (account.modules ?? []).find((item) => item.code === "RESERVATIONS")?.params;
    if (!params) return null;
    const read = (meal) => DAYS.map((_, index) => {
        const value = params[`repas${meal}_${index + 1}`];
        return value === undefined ? null : String(value) === "1";
    });
    const midi = read("midi");
    const soir = read("soir");
    const hasMeals = (list) => list.some((value) => value !== null);
    const regime = typeof params.regime === "string" ? params.regime.trim() : "";
    if (!regime && !hasMeals(midi) && !hasMeals(soir)) return null;
    return { regime, midi: hasMeals(midi) ? midi : null, soir: hasMeals(soir) ? soir : null };
}

function MealIcon() {
    return (
        <svg className="canteen-meal-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
            <path d="M7 2v7.5a2.5 2.5 0 0 0 2 2.45V22h2V11.95A2.5 2.5 0 0 0 13 9.5V2h-1.5v6h-1V2h-1v6h-1V2z" fill="currentColor" />
            <path d="M17.5 2c-1.66 0-3 2.24-3 5v6h2.5v9h2V2z" fill="currentColor" />
        </svg>
    );
}

function MealWeek({ title, days }) {
    return (
        <div className="canteen-meal-week">
            <MealIcon />
            <div className="canteen-meal-week-body">
                <span className="canteen-meal-week-title">{title}</span>
                <ul className="canteen-meal-days">
                    {days.map((taken, index) => (
                        <li key={index} className={taken ? "taken" : "not-taken"} aria-label={`${DAY_NAMES[index]} : ${taken ? "repas pris" : "pas de repas"}`}>
                            <span className="canteen-meal-day">{DAYS[index]}</span>
                            <span className="canteen-meal-mark" aria-hidden="true">{taken ? "✓" : "✕"}</span>
                        </li>
                    ))}
                </ul>
            </div>
        </div>
    );
}

/** Regime et repas de la semaine type, sous l'apercu du badge (carte Profil). */
export function CanteenMeals({ account, isStreamer }) {
    const meals = canteenMeals(account);
    if (!meals || isStreamer) return null;
    return (
        <section className="canteen-meals" aria-label="Régime et repas">
            {meals.regime && <p className="canteen-regime">Régime : <strong>{meals.regime}</strong></p>}
            {meals.midi && <MealWeek title="Midi (semaine type)" days={meals.midi} />}
            {meals.soir && <MealWeek title="Soir (semaine type)" days={meals.soir} />}
        </section>
    );
}

/** QR code dessine en SVG a partir de ses modules (net a toutes les tailles). */
function QrCode({ value, className = "" }) {
    const { size, path } = useMemo(() => {
        const qr = qrcode(0, "M");
        qr.addData(value);
        qr.make();
        const count = qr.getModuleCount();
        let d = "";
        for (let row = 0; row < count; row++) {
            for (let col = 0; col < count; col++) {
                if (qr.isDark(row, col)) d += `M${col} ${row}h1v1h-1z`;
            }
        }
        return { size: count, path: d };
    }, [value]);
    const quiet = 2; // marge blanche autour, necessaire a la lecture
    return (
        <svg className={`canteen-qr ${className}`} viewBox={`${-quiet} ${-quiet} ${size + quiet * 2} ${size + quiet * 2}`} shapeRendering="crispEdges" role="img" aria-label={`QR code du badge ${value}`}>
            <rect x={-quiet} y={-quiet} width={size + quiet * 2} height={size + quiet * 2} fill="#fff" />
            <path d={path} fill="#000" />
        </svg>
    );
}

function Barcode({ value, className = "" }) {
    const ref = useRef(null);
    const [failed, setFailed] = useState(false);
    useEffect(() => {
        if (!ref.current) return;
        try {
            JsBarcode(ref.current, value, {
                format: "CODE39", // celui de l'appli officielle
                displayValue: false,
                margin: 10,
                width: 2,
                height: 90,
                background: "#ffffff",
                lineColor: "#000000",
            });
            setFailed(false);
        } catch {
            setFailed(true);
        }
    }, [value]);
    if (failed) return <p className="canteen-error">Ce numéro ne peut pas être affiché en code-barres.</p>;
    return <svg ref={ref} className={`canteen-barcode ${className}`} role="img" aria-label={`Code-barres du badge ${value}`} preserveAspectRatio="none" />;
}

function BadgeCode({ format, value, className }) {
    return format === "barcode" ? <Barcode value={value} className={className} /> : <QrCode value={value} className={className} />;
}

export default function CanteenBadge({ account, isStreamer }) {
    const number = canteenBadgeNumber(account);
    const isDemo = account?.firstName === "Guest";
    const [format, setFormat] = useState(() => (localStorage.getItem(FORMAT_KEY) === "qr" ? "qr" : "barcode"));
    const [isOpen, setIsOpen] = useState(false);
    // Fermeture animee (blur-out, comme les pop-ups de l'appli) avant de
    // retirer le plein ecran.
    const [isClosing, setIsClosing] = useState(false);
    const closeTimer = useRef(null);

    const open = () => {
        clearTimeout(closeTimer.current);
        setIsClosing(false);
        setIsOpen(true);
    };

    const close = () => {
        if (!isOpen || isClosing) return;
        setIsClosing(true);
        // Secours si animationend n'arrive pas (animations coupees...).
        closeTimer.current = setTimeout(finishClose, 400);
    };

    function finishClose() {
        clearTimeout(closeTimer.current);
        setIsOpen(false);
        setIsClosing(false);
    }

    useEffect(() => () => clearTimeout(closeTimer.current), []);

    const chooseFormat = (value) => {
        setFormat(value);
        localStorage.setItem(FORMAT_KEY, value);
    };

    // Plein ecran : garder l'ecran allume, fermer avec Echap.
    useEffect(() => {
        if (!isOpen) return undefined;
        let wakeLock = null;
        navigator.wakeLock?.request("screen").then((lock) => { wakeLock = lock; }).catch(() => {});
        const onKey = (event) => { if (event.key === "Escape") close(); };
        window.addEventListener("keydown", onKey);
        return () => {
            window.removeEventListener("keydown", onKey);
            wakeLock?.release().catch(() => {});
        };
    }, [isOpen, isClosing]);

    if (!number) {
        return (
            <section className="canteen-badge empty" aria-label="Badge">
                <h3 className="canteen-title">Badge</h3>
                <p className="canteen-empty-text">Pas de badge sur ce compte : ton établissement ne l'a pas activé sur EcoleDirecte.</p>
            </section>
        );
    }

    if (isStreamer) {
        return (
            <section className="canteen-badge" aria-label="Badge">
                <h3 className="canteen-title">Badge</h3>
                <p className="canteen-empty-text">Masqué en mode streamer.</p>
            </section>
        );
    }

    return (
        <section className="canteen-badge" aria-label="Badge">
            <div className="canteen-header">
                <h3 className="canteen-title">Badge{isDemo && <span className="canteen-demo"> (exemple)</span>}</h3>
                <div className={`canteen-switch ${format}`} role="radiogroup" aria-label="Format du badge">
                    <span className="canteen-switch-thumb" aria-hidden="true" />
                    <button type="button" role="radio" aria-checked={format === "barcode"} className={format === "barcode" ? "active" : ""} onClick={() => chooseFormat("barcode")}>Code-barres</button>
                    <button type="button" role="radio" aria-checked={format === "qr"} className={format === "qr" ? "active" : ""} onClick={() => chooseFormat("qr")}>QR code</button>
                </div>
            </div>

            <button type="button" className={`canteen-preview ${format}`} onClick={open} aria-label="Afficher le badge en plein écran">
                {/* key : le code change d'element au changement de format, ce qui rejoue son animation */}
                <span className="canteen-code-swap" key={format}>
                    <BadgeCode format={format} value={number} />
                </span>
                <span className="canteen-number">{number}</span>
                <span className="canteen-hint">Touche pour l'agrandir</span>
            </button>

            {isOpen && createPortal(
                <div className={`canteen-fullscreen${isClosing ? " closing" : ""}`} role="dialog" aria-modal="true" aria-label="Badge en plein écran" onClick={close}>
                    <button type="button" className="canteen-close" onClick={(event) => { event.stopPropagation(); close(); }} aria-label="Fermer">✕</button>
                    <div className="canteen-fullscreen-content" onAnimationEnd={(event) => { if (isClosing && event.target === event.currentTarget) finishClose(); }}>
                        <span className="canteen-fullscreen-name">{account.firstName} {(account.lastName ?? "").toUpperCase()}</span>
                        <BadgeCode format={format} value={number} className="large" />
                        <span className="canteen-fullscreen-number">{number}</span>
                    </div>
                </div>,
                document.body,
            )}
        </section>
    );
}
