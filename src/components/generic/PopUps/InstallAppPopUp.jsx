import { useEffect, useState } from "react";
import { shouldShowLoginDisclaimer } from "../../Login/LoginDisclaimer";

import "./InstallAppPopUp.css";

/**
 * Pop-up "Ajouter EDP a l'ecran d'accueil", sur telephone, avant connexion.
 *
 * Aucune installation : c'est le raccourci "application web" du navigateur
 * (icone, plein ecran, sans barre d'adresse).
 * - Android (Chrome, Edge, Samsung...) : bouton qui ouvre directement la
 *   fenetre d'ajout du navigateur.
 * - iPhone / iPad : Safari ne permet pas de le declencher, on montre les 3
 *   etapes du menu Partager.
 * - Autres navigateurs Android : etapes via le menu.
 *
 * Jamais affichee : sur ordinateur, si l'app est deja ouverte depuis l'ecran
 * d'accueil, dans l'APK, ou si l'utilisateur l'a fermee recemment.
 */

const STORAGE_KEY = "edp-install-popup";
const SNOOZE_DAYS = 14; // "Plus tard" : on repropose apres deux semaines
const SHOW_DELAY_MS = 1200; // laisse la page apparaitre avant la pop-up

// En dev uniquement : ?install-platform=ios-safari | ios-other | android pour
// tester chaque variante sans le telephone correspondant. Lu au chargement du
// module : la page d'accueil reecrit l'adresse (#home) avant l'affichage.
const FORCED_PLATFORM = import.meta.env.DEV
    ? new URLSearchParams(window.location.search).get("install-platform")
    : null;

function detectPlatform() {
    if (["ios-safari", "ios-other", "android"].includes(FORCED_PLATFORM)) return FORCED_PLATFORM;
    const ua = navigator.userAgent;
    // iPadOS se presente comme un Mac : on le reconnait a l'ecran tactile.
    const isIOS = /iphone|ipad|ipod/i.test(ua) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
    if (isIOS) {
        const isSafari = !/crios|fxios|edgios|opios/i.test(ua);
        return isSafari ? "ios-safari" : "ios-other";
    }
    if (/android/i.test(ua)) {
        return "android";
    }
    return "other";
}

function isAlreadyInstalled() {
    return Boolean(
        window.navigator.standalone
        || window.matchMedia("(display-mode: standalone)").matches
        || window.__EDP_APP__ // coquille APK Tauri
        || window.__TAURI__,
    );
}

function isSnoozed() {
    try {
        const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "null");
        if (!stored) return false;
        if (stored.never) return true;
        return Date.now() - stored.at < SNOOZE_DAYS * 24 * 60 * 60 * 1000;
    } catch {
        return false;
    }
}

function ShareIcon() {
    return (
        <svg className="install-step-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
            <path d="M12 3v12M7.5 7.5 12 3l4.5 4.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            <path d="M8 10H6.5A1.5 1.5 0 0 0 5 11.5v8A1.5 1.5 0 0 0 6.5 21h11a1.5 1.5 0 0 0 1.5-1.5v-8A1.5 1.5 0 0 0 17.5 10H16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        </svg>
    );
}

function AddSquareIcon() {
    return (
        <svg className="install-step-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
            <rect x="4" y="4" width="16" height="16" rx="4" fill="none" stroke="currentColor" strokeWidth="2" />
            <path d="M12 8.5v7M8.5 12h7" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        </svg>
    );
}

function MenuDotsIcon() {
    return (
        <svg className="install-step-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
            <circle cx="12" cy="5" r="2" fill="currentColor" />
            <circle cx="12" cy="12" r="2" fill="currentColor" />
            <circle cx="12" cy="19" r="2" fill="currentColor" />
        </svg>
    );
}

export default function InstallAppPopUp({ blocked = false }) {
    const [platform] = useState(detectPlatform);
    const [isPhone, setIsPhone] = useState(() => window.matchMedia("(max-width: 869px) and (pointer: coarse)").matches);
    const [installEvent, setInstallEvent] = useState(() => window.__edpInstallPrompt ?? null);
    const [isVisible, setIsVisible] = useState(false);
    const [isClosing, setIsClosing] = useState(false);
    // Sur la page de connexion, l'avertissement du premier lancement passe d'abord.
    const [disclaimerPending, setDisclaimerPending] = useState(shouldShowLoginDisclaimer);

    useEffect(() => {
        const onDisclaimerClosed = () => setDisclaimerPending(false);
        window.addEventListener("edp-login-disclaimer-closed", onDisclaimerClosed);
        return () => window.removeEventListener("edp-login-disclaimer-closed", onDisclaimerClosed);
    }, []);

    useEffect(() => {
        const query = window.matchMedia("(max-width: 869px) and (pointer: coarse)");
        const updatePhone = () => setIsPhone(query.matches);
        const onAvailable = () => setInstallEvent(window.__edpInstallPrompt ?? null);
        const onInstalled = () => close(false);
        query.addEventListener("change", updatePhone);
        window.addEventListener("edp-install-available", onAvailable);
        window.addEventListener("edp-app-installed", onInstalled);
        return () => {
            query.removeEventListener("change", updatePhone);
            window.removeEventListener("edp-install-available", onAvailable);
            window.removeEventListener("edp-app-installed", onInstalled);
        };
    }, []);

    const waitingForDisclaimer = disclaimerPending && window.location.pathname === "/login";
    const shouldShow = isPhone && !blocked && !waitingForDisclaimer && platform !== "other" && !isAlreadyInstalled() && !isSnoozed();

    useEffect(() => {
        if (!shouldShow) return undefined;
        const timer = setTimeout(() => setIsVisible(true), SHOW_DELAY_MS);
        return () => clearTimeout(timer);
    }, [shouldShow]);

    function close(remember = true, never = false) {
        if (remember) {
            localStorage.setItem(STORAGE_KEY, JSON.stringify({ at: Date.now(), never }));
        }
        setIsClosing(true);
        setTimeout(() => {
            setIsVisible(false);
            setIsClosing(false);
        }, 300);
    }

    async function install() {
        if (!installEvent) return;
        installEvent.prompt();
        const choice = await installEvent.userChoice.catch(() => null);
        window.__edpInstallPrompt = null;
        setInstallEvent(null);
        if (choice?.outcome === "accepted") {
            close(true, true);
        }
    }

    if (!isVisible) return null;

    const steps = platform === "ios-safari" || platform === "ios-other"
        ? [
            <>Touche <strong>Partager</strong> <ShareIcon /> {platform === "ios-safari" ? "en bas de Safari" : "dans le menu du navigateur"}</>,
            <>Choisis <strong>Sur l'écran d'accueil</strong> <AddSquareIcon /></>,
            <>Touche <strong>Ajouter</strong> en haut à droite</>,
        ]
        : [
            <>Ouvre le menu du navigateur <MenuDotsIcon /></>,
            <>Choisis <strong>Ajouter à l'écran d'accueil</strong> ou <strong>Installer</strong></>,
            <>Confirme avec <strong>Ajouter</strong></>,
        ];

    return (
        <div className={`install-popup-backdrop${isClosing ? " closing" : ""}`} onClick={(event) => { if (event.target === event.currentTarget) close(); }}>
            <section className={`install-popup${isClosing ? " closing" : ""}`} role="dialog" aria-modal="true" aria-labelledby="install-popup-title">
                <button type="button" className="install-popup-close" onClick={() => close()} aria-label="Fermer">✕</button>

                <div className="install-popup-header">
                    <img src="/images/EDP-logo-192.png" alt="" className="install-popup-icon" />
                    <div>
                        <h2 id="install-popup-title">Mets EDP sur ton écran d'accueil</h2>
                        <p>Une icône comme une vraie app, en plein écran. Rien à télécharger, pas de store.</p>
                    </div>
                </div>

                {installEvent ? (
                    <button type="button" className="install-popup-primary" onClick={install}>
                        Ajouter à l'écran d'accueil
                    </button>
                ) : (
                    <>
                        <ol className="install-popup-steps">
                            {steps.map((step, index) => (
                                <li key={index} style={{ "--order": index }}>
                                    <span className="install-step-number">{index + 1}</span>
                                    <span className="install-step-text">{step}</span>
                                </li>
                            ))}
                        </ol>
                        {platform === "ios-other" && <p className="install-popup-hint">Astuce : c'est plus simple depuis <strong>Safari</strong>.</p>}
                    </>
                )}

                <div className="install-popup-secondary">
                    <button type="button" onClick={() => close()}>Plus tard</button>
                    <button type="button" onClick={() => close(true, true)}>Ne plus afficher</button>
                </div>

                {platform === "ios-safari" && !installEvent && <span className="install-popup-arrow" aria-hidden="true" />}
            </section>
        </div>
    );
}
