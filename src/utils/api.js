/**
 * Couche de transport pour les requêtes vers l'API EcoleDirecte.
 *
 * EcoleDirecte n'autorise pas les requêtes cross-origin depuis un navigateur :
 * le cookie GTK renvoyé par login.awp?gtk=1 doit être relu puis renvoyé en
 * en-tête X-GTK, ce que JS ne peut pas faire en cross-origin. Deux solutions :
 *
 *   - DIRECT : une coquille native (APK Tauri) ou l'extension EDP Unblock
 *     intercepte window.fetch et passe par un client HTTP natif. Les requêtes
 *     sortent alors par l'IP de l'appareil de l'utilisateur.
 *
 *   - PROXY  : repli pour les plateformes sans coquille ni extension (iOS).
 *     Les requêtes passent par notre propre domaine, qui gère le GTK côté
 *     serveur. Toutes ces requêtes sortent par l'IP du proxy.
 *
 * Le mode est choisi à l'exécution : on privilégie toujours DIRECT quand c'est
 * possible, pour limiter le nombre d'utilisateurs derrière l'IP du proxy.
 */

const ED_ORIGIN = "https://api.ecoledirecte.com";

/**
 * Chemin du proxy. Relatif pour rester en same-origin : le front et le proxy
 * sont servis par le même domaine, ce qui évite complètement le CORS.
 */
export const PROXY_BASE = "/edp-api";

export const TRANSPORT = {
    DIRECT: "direct",
    PROXY: "proxy",
};

/**
 * Mode forcé après détection explicite (message EDP_UNBLOCK). Tant qu'il est
 * null, le mode est redéterminé à chaque appel : la coquille native et
 * l'extension s'annoncent de façon asynchrone, on ne veut donc pas figer le
 * choix sur une détection trop précoce.
 */
let forcedTransport = null;

function hasNativeBridge() {
    if (typeof window === "undefined") {
        return false;
    }
    // Coquille Tauri : injection/index.js définit ces globales et remplace fetch.
    if (window.__EDP_APP__ || window.__TAURI__) {
        return true;
    }
    // Extension EDP Unblock : marque le document une fois active.
    return document.documentElement.classList.contains("edp-unblock");
}

export function getTransport() {
    if (forcedTransport !== null) {
        return forcedTransport;
    }
    return hasNativeBridge() ? TRANSPORT.DIRECT : TRANSPORT.PROXY;
}

export function setTransport(transport) {
    forcedTransport = transport;
}

export function isProxyTransport() {
    return getTransport() === TRANSPORT.PROXY;
}

export function isDirectTransport() {
    return getTransport() === TRANSPORT.DIRECT;
}

/**
 * Racine à utiliser pour construire les URLs de l'API. Évaluée à chaque appel
 * pour suivre le mode courant.
 */
export function apiRoot() {
    return isProxyTransport() ? PROXY_BASE : ED_ORIGIN;
}
