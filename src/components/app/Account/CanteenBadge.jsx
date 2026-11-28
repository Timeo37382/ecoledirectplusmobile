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

    const chooseFormat = (value) => {
        setFormat(value);
        localStorage.setItem(FORMAT_KEY, value);
    };

    // Plein ecran : garder l'ecran allume, fermer avec Echap.
    useEffect(() => {
        if (!isOpen) return undefined;
        let wakeLock = null;
        navigator.wakeLock?.request("screen").then((lock) => { wakeLock = lock; }).catch(() => {});
        const onKey = (event) => { if (event.key === "Escape") setIsOpen(false); };
        window.addEventListener("keydown", onKey);
        return () => {
            window.removeEventListener("keydown", onKey);
            wakeLock?.release().catch(() => {});
        };
    }, [isOpen]);

    if (!number) {
        return (
            <section className="canteen-badge empty" aria-label="Badge cantine">
                <h3 className="canteen-title">Badge cantine</h3>
                <p className="canteen-empty-text">Pas de badge cantine sur ce compte : ton établissement ne l'a pas activé sur EcoleDirecte.</p>
            </section>
        );
    }

    if (isStreamer) {
        return (
            <section className="canteen-badge" aria-label="Badge cantine">
                <h3 className="canteen-title">Badge cantine</h3>
                <p className="canteen-empty-text">Masqué en mode streamer.</p>
            </section>
        );
    }

    return (
        <section className="canteen-badge" aria-label="Badge cantine">
            <div className="canteen-header">
                <h3 className="canteen-title">Badge cantine{isDemo && <span className="canteen-demo"> (exemple)</span>}</h3>
                <div className="canteen-switch" role="radiogroup" aria-label="Format du badge">
                    <button type="button" role="radio" aria-checked={format === "barcode"} className={format === "barcode" ? "active" : ""} onClick={() => chooseFormat("barcode")}>Code-barres</button>
                    <button type="button" role="radio" aria-checked={format === "qr"} className={format === "qr" ? "active" : ""} onClick={() => chooseFormat("qr")}>QR code</button>
                </div>
            </div>

            <button type="button" className={`canteen-preview ${format}`} onClick={() => setIsOpen(true)} aria-label="Afficher le badge en plein écran">
                <BadgeCode format={format} value={number} />
                <span className="canteen-number">{number}</span>
                <span className="canteen-hint">Touche pour l'agrandir</span>
            </button>

            {isOpen && createPortal(
                <div className="canteen-fullscreen" role="dialog" aria-modal="true" aria-label="Badge cantine en plein écran" onClick={() => setIsOpen(false)}>
                    <button type="button" className="canteen-close" onClick={() => setIsOpen(false)} aria-label="Fermer">✕</button>
                    <div className="canteen-fullscreen-content">
                        <span className="canteen-fullscreen-name">{account.firstName} {(account.lastName ?? "").toUpperCase()}</span>
                        <BadgeCode format={format} value={number} className="large" />
                        <span className="canteen-fullscreen-number">{number}</span>
                        <span className="canteen-fullscreen-tip">Monte la luminosité au maximum pour que la borne le lise bien.</span>
                    </div>
                </div>,
                document.body,
            )}
        </section>
    );
}
