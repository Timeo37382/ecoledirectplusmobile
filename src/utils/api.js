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

/**
 * Content-Type a annoncer pour les corps `data=<json>` envoyes a EcoleDirecte.
 *
 * ED attend du `application/x-www-form-urlencoded` dont les valeurs sont
 * percent-encodees (cf. encodeURIComponent dans fetchLogin). Probleme : un
 * hebergeur qui voit ce Content-Type parse le corps et le DECODE, ce qui
 * detruit l'encodage avant meme qu'on relaie la requete. Un identifiant
 * contenant "@" ou un mot de passe avec un caractere special arrive alors
 * mutile, et ED repond "identifiant et/ou mot de passe invalide".
 *
 * En mode proxy on annonce donc text/plain, que personne ne parse, et c'est le
 * proxy qui remet le bon Content-Type au moment de contacter EcoleDirecte.
 */
export function bodyContentType() {
    return isProxyTransport() ? "text/plain;charset=UTF-8" : "application/x-www-form-urlencoded";
}

/**
 * URL a utiliser pour une photo de profil.
 *
 * EcoleDirecte renvoie ce champ sous des formes variables : protocol-relative
 * ("//doc1.ecoledirecte.com/..."), absolue, ou parfois l'hote nu. Le code
 * d'origine prefixait "https:" dans Account.jsx et utilisait la valeur brute
 * dans AccountSelector.jsx : selon la forme recue, l'un des deux affichait la
 * photo et l'autre non. On normalise ici une bonne fois.
 *
 * Les images sont chargees en direct depuis ED, sans passer par le proxy : son
 * serveur de medias ne filtre pas le Referer, et les relayer couterait de la
 * bande passante pour rien.
 */
export function pictureUrl(raw) {
    if (!raw || typeof raw !== "string") {
        return "";
    }

    const value = raw.trim();
    if (!value) {
        return "";
    }
    // Chemin local servi par le site lui-meme (ex: /images/scholar-canardman.png)
    if (value.startsWith("/") && !value.startsWith("//")) {
        return value;
    }
    if (value.startsWith("//")) {
        return "https:" + value;
    }
    if (/^https?:\/\//i.test(value)) {
        return value.replace(/^http:/i, "https:");
    }
    // Hote nu, sans schema ni "//" (ex: "doc1.ecoledirecte.com/PhotoEleves/x.jpg")
    if (/^[a-z0-9.-]+\.[a-z]{2,}\//i.test(value)) {
        return "https://" + value;
    }
    return value;
}
