/**
 * Abonnement aux notifications push (appli fermee), cote appli.
 * Le serveur correspondant est api/push.js (route /edp-push).
 */

const ENDPOINT = "/edp-push";

function base64UrlToUint8Array(value) {
    const padding = "=".repeat((4 - (value.length % 4)) % 4);
    const base64 = (value + padding).replace(/-/g, "+").replace(/_/g, "/");
    return Uint8Array.from(atob(base64), (char) => char.charCodeAt(0));
}

export function pushSupported() {
    return "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
}

async function registration() {
    if (!("serviceWorker" in navigator)) return null;
    return (await navigator.serviceWorker.getRegistration()) ?? null;
}

export async function getPushSubscription() {
    const reg = await registration();
    return reg?.pushManager ? reg.pushManager.getSubscription() : null;
}

async function post(action, body) {
    const response = await fetch(`${ENDPOINT}?action=${action}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        cache: "no-store",
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || data.code !== 200) {
        throw new Error(data.message || "Le serveur de notifications ne répond pas.");
    }
    return data;
}

/**
 * @param credentials { username, password, cn, cv }
 * @param account     compte actif (accountsListState[activeAccount])
 */
export async function subscribePush({ credentials, account, accountIndex, types }) {
    if (!pushSupported()) throw new Error("Ce navigateur ne gère pas les notifications push.");
    if (!credentials?.username || !credentials?.password) {
        throw new Error("Identifiants indisponibles : déconnecte-toi puis reconnecte-toi, et réessaie.");
    }
    if (Notification.permission !== "granted") {
        const permission = await Notification.requestPermission();
        if (permission !== "granted") throw new Error("Les notifications ne sont pas autorisées sur cet appareil.");
    }

    const keyResponse = await fetch(`${ENDPOINT}?action=key`, { cache: "no-store" });
    const keyData = await keyResponse.json().catch(() => ({}));
    if (!keyData.publicKey) throw new Error(keyData.message || "Notifications push non configurées sur le serveur.");

    const reg = await registration();
    if (!reg) throw new Error("Le service de l'appli n'est pas prêt : recharge la page et réessaie.");
    let subscription = await reg.pushManager.getSubscription();
    if (!subscription) {
        subscription = await reg.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey: base64UrlToUint8Array(keyData.publicKey),
        });
    }

    try {
        await post("subscribe", {
            subscription: subscription.toJSON(),
            username: credentials.username,
            password: credentials.password,
            cn: credentials.cn ?? "",
            cv: credentials.cv ?? "",
            accountId: account.id,
            accountIndex,
            types,
        });
    } catch (error) {
        await subscription.unsubscribe().catch(() => {});
        throw error;
    }
}

export async function unsubscribePush() {
    const subscription = await getPushSubscription();
    if (!subscription) return;
    try {
        await post("unsubscribe", { endpoint: subscription.endpoint });
    } finally {
        await subscription.unsubscribe().catch(() => {});
    }
}

export async function updatePushTypes(types) {
    const subscription = await getPushSubscription();
    if (!subscription) return;
    await post("update", { endpoint: subscription.endpoint, types });
}
