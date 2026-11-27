import { useContext, useEffect, useState } from "react";

import { AppContext } from "../../../App";
import { NOTIFICATION_TYPES, notificationPermission, requestNotificationPermission } from "../../../utils/notifications";
import { getPushSubscription, pushSupported, sendServerTestPush, subscribePush } from "../../../utils/push";
import { browserName, detectBrand, deviceSteps, DEVICE_BRANDS, isIOS, isStandalone } from "../../../utils/deviceGuide";

import "../../generic/PopUps/InstallAppPopUp.css";
import "./NotificationGuide.css";

/**
 * Guide "Recevoir les notifications" : ce que l'appli peut faire elle-meme
 * (autorisation, abonnement, notification de test), puis les reglages du
 * telephone selon sa marque.
 *
 * Affiche tout seul une fois au lancement, sur telephone. "Plus tard" le
 * repropose apres quelques jours. Ouvrable depuis Parametres > Notifications
 * (evenement "edp-open-notification-guide").
 */

const STORAGE_KEY = "edp-notification-guide";
const SNOOZE_DAYS = 3;
const SHOW_DELAY_MS = 1800;

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

function StepStatus({ done }) {
    return <span className={`notif-guide-status ${done ? "done" : "todo"}`} aria-label={done ? "Fait" : "À faire"}>{done ? "✓" : "•"}</span>;
}

export default function NotificationGuide() {
    const { useUserSettings, activeAccount, accountsListState, getPushCredentials } = useContext(AppContext);
    const settings = useUserSettings();

    const [isVisible, setIsVisible] = useState(false);
    const [isClosing, setIsClosing] = useState(false);
    const [brand, setBrand] = useState(null);
    const [permission, setPermission] = useState(notificationPermission);
    const [subscribed, setSubscribed] = useState(false);
    const [busy, setBusy] = useState("");
    const [message, setMessage] = useState(null);

    const browser = browserName();
    const iosNeedsInstall = isIOS() && !isStandalone();

    useEffect(() => {
        detectBrand().then(setBrand).catch(() => setBrand("android"));
    }, []);

    // Ouverture automatique : une fois, sur telephone.
    useEffect(() => {
        const isPhone = window.matchMedia("(max-width: 869px) and (pointer: coarse)").matches;
        if (!isPhone || isSnoozed()) return undefined;
        const timer = setTimeout(() => setIsVisible(true), SHOW_DELAY_MS);
        return () => clearTimeout(timer);
    }, []);

    // Ouverture depuis les parametres.
    useEffect(() => {
        const open = () => {
            setMessage(null);
            setIsClosing(false);
            setIsVisible(true);
        };
        window.addEventListener("edp-open-notification-guide", open);
        return () => window.removeEventListener("edp-open-notification-guide", open);
    }, []);

    useEffect(() => {
        if (!isVisible) return;
        setPermission(notificationPermission());
        if (pushSupported()) {
            getPushSubscription().then((subscription) => setSubscribed(!!subscription)).catch(() => setSubscribed(false));
        }
    }, [isVisible]);

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

    async function allow() {
        setBusy("permission");
        setMessage(null);
        const result = await requestNotificationPermission();
        setPermission(result);
        setBusy("");
        if (result === "denied") {
            setMessage({ ok: false, text: `Bloquées par ${browser} : touche le cadenas à gauche de l'adresse → Autorisations → Notifications.` });
        }
    }

    async function subscribe() {
        setBusy("subscribe");
        setMessage(null);
        try {
            await subscribePush({
                credentials: getPushCredentials(),
                account: accountsListState[activeAccount],
                accountIndex: activeAccount,
                types: NOTIFICATION_TYPES.filter(({ setting }) => settings.get(setting) !== false).map(({ type }) => type),
            });
            setPermission(notificationPermission());
            setSubscribed(true);
        } catch (error) {
            setMessage({ ok: false, text: error?.message || "Une erreur est survenue." });
        }
        setBusy("");
    }

    async function test() {
        setBusy("test");
        setMessage(null);
        try {
            await sendServerTestPush();
            setMessage({ ok: true, text: "Envoyée par le serveur. Elle doit arriver dans quelques secondes. Pour tester appli fermée : ferme l'appli tout de suite et attends." });
        } catch (error) {
            setMessage({ ok: false, text: error?.message || "Une erreur est survenue." });
        }
        setBusy("");
    }

    if (!isVisible) return null;

    const permissionDone = permission === "granted";
    const steps = brand ? deviceSteps(brand, browser) : [];

    return (
        <div className={`install-popup-backdrop notif-guide-backdrop${isClosing ? " closing" : ""}`} onClick={(event) => { if (event.target === event.currentTarget) close(); }}>
            <section className={`install-popup notif-guide${isClosing ? " closing" : ""}`} role="dialog" aria-modal="true" aria-labelledby="notif-guide-title">
                <button type="button" className="install-popup-close" onClick={() => close()} aria-label="Fermer">✕</button>

                <div className="install-popup-header">
                    <img src="/images/EDP-logo-192.png" alt="" className="install-popup-icon" />
                    <div>
                        <h2 id="notif-guide-title">Reçois tes notifications</h2>
                        <p>Notes, devoirs, messages et cours annulés, même appli fermée. Quelques réglages selon ton téléphone.</p>
                    </div>
                </div>

                <div className="notif-guide-scroll">
                    {!iosNeedsInstall && pushSupported() && (
                        <>
                            <h3 className="notif-guide-heading">Dans l'appli</h3>
                            <ul className="notif-guide-checklist">
                                <li>
                                    <StepStatus done={permissionDone} />
                                    <span className="notif-guide-label">
                                        Autoriser les notifications
                                        {permission === "denied" && (
                                            <small className="notif-guide-hint">Bloquées par {browser} : touche le cadenas à gauche de l'adresse → Autorisations → Notifications, puis rouvre ce guide.</small>
                                        )}
                                    </span>
                                    {!permissionDone && permission !== "denied" && (
                                        <button type="button" className="notif-guide-action" onClick={allow} disabled={busy !== ""}>
                                            {busy === "permission" ? "…" : "Autoriser"}
                                        </button>
                                    )}
                                </li>
                                <li>
                                    <StepStatus done={subscribed} />
                                    <span className="notif-guide-label">Recevoir même appli fermée</span>
                                    {!subscribed && (
                                        <button type="button" className="notif-guide-action" onClick={subscribe} disabled={busy !== "" || permission === "denied"}>
                                            {busy === "subscribe" ? "…" : "Activer"}
                                        </button>
                                    )}
                                </li>
                            </ul>
                        </>
                    )}

                    <div className="notif-guide-device">
                        <h3 className="notif-guide-heading">Sur ton téléphone</h3>
                        <select
                            className="notif-guide-brand"
                            value={brand ?? ""}
                            onChange={(event) => setBrand(event.target.value)}
                            aria-label="Modèle de téléphone"
                        >
                            {DEVICE_BRANDS.map(({ id, label }) => <option key={id} value={id}>{label}</option>)}
                        </select>
                    </div>
                    <ol className="install-popup-steps notif-guide-steps">
                        {steps.map((step, index) => (
                            <li key={`${brand}-${index}`} style={{ "--order": index }}>
                                <span className="install-step-number">{index + 1}</span>
                                <span className="install-step-text">{step}</span>
                            </li>
                        ))}
                    </ol>
                </div>

                {message && <p className={`notif-guide-message ${message.ok ? "ok" : "error"}`}>{message.text}</p>}

                {subscribed && (
                    <button type="button" className="install-popup-primary" onClick={test} disabled={busy !== ""}>
                        {busy === "test" ? "Envoi…" : "M'envoyer une notification de test"}
                    </button>
                )}

                <div className="install-popup-secondary">
                    <button type="button" onClick={() => close()}>Plus tard</button>
                    <button type="button" onClick={() => close(true, true)}>C'est bon, ça marche</button>
                </div>
            </section>
        </div>
    );
}
