/**
 * Detection de l'appareil, et reglages a faire pour que les notifications
 * arrivent meme appli fermee. Beaucoup de surcouches Android (Xiaomi, Huawei,
 * Oppo...) tuent le navigateur en arriere-plan : la notification part bien du
 * serveur, mais le telephone ne l'affiche jamais.
 */

export const DEVICE_BRANDS = [
    { id: "xiaomi", label: "Xiaomi / Redmi / POCO" },
    { id: "samsung", label: "Samsung" },
    { id: "huawei", label: "Huawei / Honor" },
    { id: "oppo", label: "Oppo / Realme / OnePlus" },
    { id: "vivo", label: "vivo" },
    { id: "android", label: "Autre Android (Pixel, Motorola...)" },
    { id: "ios", label: "iPhone / iPad" },
    { id: "desktop", label: "Ordinateur" },
];

export function isIOS() {
    const ua = navigator.userAgent;
    return /iphone|ipad|ipod/i.test(ua) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
}

export function isStandalone() {
    return Boolean(window.navigator.standalone || window.matchMedia("(display-mode: standalone)").matches);
}

export function browserName() {
    const ua = navigator.userAgent;
    if (/SamsungBrowser/i.test(ua)) return "Samsung Internet";
    if (/EdgA|Edg\//i.test(ua)) return "Edge";
    if (/OPR|Opera/i.test(ua)) return "Opera";
    if (/Firefox|FxiOS/i.test(ua)) return "Firefox";
    if (isIOS()) return "Safari";
    return "Chrome";
}

function brandFromModel(model) {
    const value = (model || "").trim();
    if (!value) return null;
    if (/redmi|poco|xiaomi|^mi\s|^M\d{4}[A-Z]|^2\d{3}[A-Z0-9]{3,}/i.test(value)) return "xiaomi";
    if (/^SM-|samsung|galaxy/i.test(value)) return "samsung";
    if (/huawei|honor|^[A-Z]{3}-[A-Z]{1,2}\d{2}/i.test(value)) return "huawei";
    if (/oppo|realme|oneplus|^CPH\d|^RMX\d|^(LE|IN|KB|NE|GM|HD|PHB|PJ[A-Z])\d{3,4}/i.test(value)) return "oppo";
    if (/vivo|^V\d{4}|^I\d{4}/i.test(value)) return "vivo";
    return null;
}

/**
 * Marque probable de l'appareil. Chrome Android masque le modele dans le
 * User-Agent ("Android 10; K") : on le demande via userAgentData quand c'est
 * possible.
 */
export async function detectBrand() {
    if (isIOS()) return "ios";
    const ua = navigator.userAgent;
    if (!/android/i.test(ua)) return "desktop";

    let model = "";
    try {
        if (navigator.userAgentData?.getHighEntropyValues) {
            model = (await navigator.userAgentData.getHighEntropyValues(["model"])).model ?? "";
        }
    } catch {
        // pas grave : on essaie le User-Agent
    }
    const fromUa = ua.match(/Android [\d.]+;\s*([^;)]+)/i)?.[1] ?? "";
    return brandFromModel(model) ?? brandFromModel(fromUa) ?? (/MiuiBrowser|XiaoMi/i.test(ua) ? "xiaomi" : "android");
}

/** Etapes manuelles, selon la marque. `browser` = nom du navigateur. */
export function deviceSteps(brand, browser) {
    const appName = `${browser} (ou l'appli EDP si elle apparaît dans la liste)`;
    switch (brand) {
        case "xiaomi":
            return [
                <>Ouvre <strong>Paramètres → Applis → Gérer les applis</strong>, puis <strong>{appName}</strong>.</>,
                <><strong>Démarrage automatique</strong> : active-le. C'est le réglage le plus important.</>,
                <><strong>Économiseur de batterie</strong> : choisis <strong>Aucune restriction</strong>.</>,
                <><strong>Notifications</strong> : autorise-les, y compris la catégorie <strong>Sites</strong>.</>,
                <>Dans les applis récentes, appuie longtemps sur {browser} et touche le <strong>cadenas</strong>, pour qu'il ne soit pas fermé.</>,
            ];
        case "samsung":
            return [
                <>Ouvre <strong>Paramètres → Applications</strong>, puis <strong>{appName}</strong>.</>,
                <><strong>Batterie</strong> : choisis <strong>Non restreinte</strong>.</>,
                <><strong>Notifications</strong> : autorise-les, y compris la catégorie <strong>Sites</strong>.</>,
                <>Dans <strong>Paramètres → Batterie → Limites d'utilisation en arrière-plan</strong>, {browser} ne doit être ni dans les applis <strong>en veille</strong>, ni <strong>en veille prolongée</strong>.</>,
            ];
        case "huawei":
            return [
                <>Ouvre <strong>Paramètres → Batterie → Lancement d'applications</strong>.</>,
                <>Pour <strong>{browser}</strong>, choisis <strong>Gérer manuellement</strong> et active les 3 options (lancement auto, secondaire, en arrière-plan).</>,
                <>Dans <strong>Paramètres → Applis → {browser} → Notifications</strong>, autorise-les.</>,
            ];
        case "oppo":
            return [
                <>Ouvre <strong>Paramètres → Applis → Gestion des applis</strong>, puis <strong>{appName}</strong>.</>,
                <><strong>Utilisation de la batterie</strong> : active <strong>Autoriser l'activité en arrière-plan</strong> et <strong>Autoriser le démarrage automatique</strong>.</>,
                <><strong>Notifications</strong> : autorise-les.</>,
            ];
        case "vivo":
            return [
                <>Ouvre <strong>Paramètres → Batterie → Consommation en arrière-plan</strong> et autorise <strong>{browser}</strong>.</>,
                <>Dans <strong>Paramètres → Applis → {browser}</strong>, active le <strong>Démarrage automatique</strong> s'il existe.</>,
                <><strong>Notifications</strong> : autorise-les.</>,
            ];
        case "ios":
            return isStandalone()
                ? [
                    <>Ouvre <strong>Réglages → Notifications → EDP</strong> et active <strong>Autoriser les notifications</strong>.</>,
                    <>Si un mode <strong>Concentration</strong> est actif, ajoute EDP aux applis autorisées.</>,
                ]
                : [
                    <>Sur iPhone, les notifications ne marchent que si EDP est <strong>sur l'écran d'accueil</strong> (iOS 16.4 minimum).</>,
                    <>Dans Safari, touche <strong>Partager</strong> puis <strong>Sur l'écran d'accueil</strong>.</>,
                    <>Ouvre EDP <strong>depuis la nouvelle icône</strong>, puis reviens à ce guide pour autoriser les notifications.</>,
                ];
        case "desktop":
            return [
                <>Les notifications arrivent tant que <strong>{browser}</strong> tourne (même sans onglet EDP ouvert).</>,
                <>Windows : <strong>Paramètres → Système → Notifications</strong>, active <strong>{browser}</strong> et vérifie que <strong>Ne pas déranger</strong> est désactivé.</>,
                <>Mac : <strong>Réglages Système → Notifications → {browser}</strong>, autorise les notifications.</>,
            ];
        default:
            return [
                <>Ouvre <strong>Paramètres → Applis</strong>, puis <strong>{appName}</strong>.</>,
                <><strong>Notifications</strong> : autorise-les, y compris la catégorie <strong>Sites</strong>.</>,
                <><strong>Batterie</strong> : choisis <strong>Sans restriction</strong> (ou « non optimisée »).</>,
            ];
    }
}
