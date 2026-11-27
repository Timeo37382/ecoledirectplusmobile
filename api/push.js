/**
 * Notifications push (appli fermee) — Vercel Function (Node.js).
 *
 * Routage : vercel.json reecrit /edp-push vers /api/push.
 *
 *   GET  /edp-push?action=key           -> { code: 200, publicKey }      cle VAPID publique
 *   POST /edp-push?action=subscribe     { subscription, username, password, cn, cv, accountId, accountIndex, types }
 *   POST /edp-push?action=update        { endpoint, types }
 *   POST /edp-push?action=unsubscribe   { endpoint }
 *   GET  /edp-push?action=check         verification de tous les abonnes (appelee par GitHub Actions)
 *   POST /edp-push?action=broadcast-test   notification de test a tous les abonnes
 *        (reserve a l'administrateur : en-tete x-edp-admin = PUSH_ENCRYPTION_KEY)
 *
 * Fonctionnement : pour chaque abonne, le serveur se connecte a EcoleDirecte
 * (jeton reutilise tant qu'il est valide), recupere notes, cahier de texte,
 * messages et emploi du temps des 7 prochains jours, compare avec
 * l'instantane precedent (meme code que l'appli : src/utils/notifications.js)
 * et envoie les nouveautes en Web Push.
 *
 * Confidentialite :
 * - identifiants, jeton et abonnement sont chiffres (AES-256-GCM) avec
 *   PUSH_ENCRYPTION_KEY, une variable d'environnement Vercel : la base Redis
 *   seule ne permet pas de les lire ;
 * - la cle Redis est un hachage de l'adresse d'abonnement ;
 * - rien n'est journalise (ni identifiant, ni contenu).
 *
 * Variables d'environnement : VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY,
 * PUSH_ENCRYPTION_KEY (32 octets en base64), et la base Upstash deja
 * utilisee par /edp-prefs.
 */

import { createCipheriv, createDecipheriv, createHash, randomBytes, timingSafeEqual } from "node:crypto";
import webpush from "web-push";

import { buildSnapshot, diffSnapshots } from "../src/utils/notifications.js";

const ED_ORIGIN = "https://api.ecoledirecte.com";
const ED_API_VERSION = "4.69.1";
const SPOOFED_HEADERS = {
    "Origin": "https://www.ecoledirecte.com",
    "Referer": "https://www.ecoledirecte.com/",
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Safari/537.36",
    "Content-Type": "application/x-www-form-urlencoded",
};

const SUBSCRIBERS_SET = "edp:push:subscribers";
const CHECK_LOCK_KEY = "edp:push:check-lock";
// Deux verifications completes ne peuvent pas etre plus rapprochees que ca,
// meme si quelqu'un appelle l'adresse en boucle.
const CHECK_MIN_INTERVAL_S = 8 * 60;
const MAX_SEPARATE_PUSHES = 3;
const VALID_TYPES = ["grade", "course", "message", "homework"];

/* ---------- Redis (Upstash REST) ---------- */

function redisConfig() {
    const url = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
    const token = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;
    return url && token ? { url: url.replace(/\/$/, ""), token } : null;
}

async function redis(config, command) {
    const response = await fetch(config.url, {
        method: "POST",
        headers: { Authorization: `Bearer ${config.token}`, "Content-Type": "application/json" },
        body: JSON.stringify(command),
    });
    if (!response.ok) throw new Error("REDIS_ERROR");
    return (await response.json()).result;
}

function subscriberKey(endpoint) {
    return `edp:push:sub:${createHash("sha256").update(String(endpoint)).digest("hex")}`;
}

/* ---------- Chiffrement ---------- */

function encryptionKey() {
    const key = Buffer.from(process.env.PUSH_ENCRYPTION_KEY ?? "", "base64");
    return key.length === 32 ? key : null;
}

function encrypt(value, key) {
    const iv = randomBytes(12);
    const cipher = createCipheriv("aes-256-gcm", key, iv);
    const data = Buffer.concat([cipher.update(JSON.stringify(value), "utf8"), cipher.final()]);
    return [iv, cipher.getAuthTag(), data].map((part) => part.toString("base64")).join(".");
}

function decrypt(payload, key) {
    const [iv, tag, data] = String(payload).split(".").map((part) => Buffer.from(part, "base64"));
    const decipher = createDecipheriv("aes-256-gcm", key, iv);
    decipher.setAuthTag(tag);
    return JSON.parse(Buffer.concat([decipher.update(data), decipher.final()]).toString("utf8"));
}

async function readRecord(config, key, redisKey) {
    const stored = await redis(config, ["GET", redisKey]);
    if (!stored) return null;
    try {
        return decrypt(stored, key);
    } catch {
        return null;
    }
}

async function writeRecord(config, key, redisKey, record) {
    await redis(config, ["SET", redisKey, encrypt(record, key)]);
}

/* ---------- EcoleDirecte ---------- */

async function fetchGtk() {
    const response = await fetch(`${ED_ORIGIN}/v3/login.awp?gtk=1&v=${ED_API_VERSION}`, { method: "GET", headers: SPOOFED_HEADERS });
    const cookies = typeof response.headers.getSetCookie === "function"
        ? response.headers.getSetCookie()
        : [response.headers.get("set-cookie")].filter(Boolean);
    const pairs = cookies.map((cookie) => cookie.split(";")[0].trim()).filter(Boolean);
    const gtkPair = pairs.find((pair) => pair.startsWith("GTK="));
    return gtkPair ? { gtk: gtkPair.slice(4), cookieHeader: pairs.join("; ") } : null;
}

/** Connexion complete. Renvoie { token, token2fa, accounts } ou { error }. */
async function login({ username, password, cn, cv }) {
    const gtk = await fetchGtk();
    if (!gtk) return { error: "gtk" };
    const fa = cn && cv ? [{ cn, cv }] : [];
    const payload = {
        identifiant: encodeURIComponent(username),
        motdepasse: encodeURIComponent(password),
        isReLogin: false,
        ...(fa[0] ?? {}),
        fa,
    };
    const response = await fetch(`${ED_ORIGIN}/v3/login.awp?v=${ED_API_VERSION}`, {
        method: "POST",
        headers: { ...SPOOFED_HEADERS, "Cookie": gtk.cookieHeader, "X-GTK": gtk.gtk },
        body: `data=${JSON.stringify(payload)}`,
    });
    const data = await response.json().catch(() => null);
    if (data?.code === 200) {
        return {
            token: data.token || response.headers.get("x-token"),
            token2fa: response.headers.get("2fa-token") || "",
            accounts: data.data?.accounts ?? [],
        };
    }
    // 250 : double authentification demandee ; 505 : identifiants refuses.
    return { error: data?.code === 250 ? "a2f" : data?.code === 505 ? "credentials" : "login" };
}

function studentIdsOf(accounts) {
    const ids = [];
    accounts.forEach((account) => {
        if (account.typeCompte === "E") ids.push(String(account.id));
        (account.profile?.eleves ?? []).forEach((student) => ids.push(String(student.id)));
    });
    return ids;
}

function familyIdFor(accounts, studentId) {
    const family = accounts.find((account) => (account.profile?.eleves ?? []).some((student) => String(student.id) === studentId));
    return family ? String(family.id) : null;
}

function currentSchoolYear(date = new Date()) {
    const year = date.getFullYear();
    return date.getMonth() >= 7 ? [year, year + 1] : [year - 1, year];
}

function isoDate(date) {
    return date.toISOString().slice(0, 10);
}

/** Donnees brutes, meme forme que fetchUpdatesData() dans App.jsx. */
async function fetchRaw(session, record) {
    const post = async (path, body) => {
        const headers = { ...SPOOFED_HEADERS, "X-Token": session.token };
        if (session.token2fa) headers["2FA-Token"] = session.token2fa;
        const response = await fetch(`${ED_ORIGIN}${path}`, { method: "POST", headers, body });
        const data = await response.json().catch(() => null);
        if (data?.token) session.token = data.token;
        if (data?.code === 520 || data?.code === 525) throw new Error("TOKEN_EXPIRED");
        return data?.code === 200 ? data.data : undefined;
    };

    const id = record.accountId;
    const today = new Date();
    const weekLater = new Date(today.getTime() + 7 * 86_400_000);
    const messagesPath = record.familyId ? `familles/${record.familyId}` : `eleves/${id}`;

    const grades = await post(`/v3/eleves/${id}/notes.awp?verbe=get&v=${ED_API_VERSION}`, `data=${JSON.stringify({ anneeScolaire: "" })}`);
    const homeworks = await post(`/v3/Eleves/${id}/cahierdetexte.awp?verbe=get&v=${ED_API_VERSION}`, "data={}");
    const messages = await post(
        `/v3/${messagesPath}/messages.awp?force=false&typeRecuperation=received&idClasseur=0&orderBy=date&order=desc&query=&onlyRead=&getAll=1&verbe=get&v=${ED_API_VERSION}`,
        `data=${JSON.stringify({ anneeMessages: currentSchoolYear().join("-") })}`,
    );
    const courses = await post(
        `/v3/E/${id}/emploidutemps.awp?verbe=get&v=${ED_API_VERSION}`,
        `data=${JSON.stringify({ dateDebut: isoDate(today), dateFin: isoDate(weekLater), avecTrous: false })}`,
    );

    return {
        grades: grades?.notes,
        homeworks: homeworks && typeof homeworks === "object" ? homeworks : undefined,
        messages: messages?.messages?.received,
        courses: Array.isArray(courses) ? courses : undefined,
    };
}

/* ---------- Envoi ---------- */

function setupWebPush() {
    const publicKey = process.env.VAPID_PUBLIC_KEY;
    const privateKey = process.env.VAPID_PRIVATE_KEY;
    if (!publicKey || !privateKey) return false;
    webpush.setVapidDetails("https://ecoledirectplusmobile.vercel.app", publicKey, privateKey);
    return true;
}

function summarize(events) {
    const counts = {};
    events.forEach((event) => { counts[event.type] = (counts[event.type] ?? 0) + 1; });
    return [
        counts.grade && `${counts.grade} note${counts.grade > 1 ? "s" : ""}`,
        counts.homework && `${counts.homework} devoir${counts.homework > 1 ? "s" : ""}`,
        counts.message && `${counts.message} message${counts.message > 1 ? "s" : ""}`,
        counts.course && `${counts.course} changement${counts.course > 1 ? "s" : ""} d'emploi du temps`,
    ].filter(Boolean).join(", ");
}

/** Renvoie false si l'abonnement n'existe plus (a supprimer). */
async function push(subscription, payload) {
    try {
        await webpush.sendNotification(subscription, JSON.stringify(payload), { TTL: 6 * 3600, urgency: "high" });
        return true;
    } catch (error) {
        return !(error?.statusCode === 404 || error?.statusCode === 410);
    }
}

async function pushEvents(record, events) {
    const urlFor = (path) => `/app/${record.accountIndex ?? 0}/${path}`;
    if (events.length <= MAX_SEPARATE_PUSHES) {
        for (const event of events) {
            const alive = await push(record.subscription, { title: event.title, body: event.body, tag: event.id, url: urlFor(event.path) });
            if (!alive) return false;
        }
        return true;
    }
    return push(record.subscription, {
        title: `${events.length} nouveautés sur EDP`,
        body: summarize(events),
        tag: "edp-updates-summary",
        url: urlFor("dashboard"),
    });
}

/* ---------- Verification d'un abonne ---------- */

async function checkSubscriber(config, key, redisKey) {
    const record = await readRecord(config, key, redisKey);
    if (!record) {
        await redis(config, ["SREM", SUBSCRIBERS_SET, redisKey]);
        return "removed";
    }
    if (record.status === "needs-login") return "skipped";

    const session = { token: record.token, token2fa: record.token2fa };
    let raw;
    try {
        if (!session.token) throw new Error("TOKEN_EXPIRED");
        raw = await fetchRaw(session, record);
    } catch (error) {
        if (error?.message !== "TOKEN_EXPIRED") throw error;
        const result = await login(record);
        if (result.error) {
            if (result.error === "a2f" || result.error === "credentials") {
                // Une seule notification, puis plus rien jusqu'a la reactivation.
                record.status = "needs-login";
                await writeRecord(config, key, redisKey, record);
                await push(record.subscription, {
                    title: "Notifications EDP en pause",
                    body: "Reconnecte-toi à EDP puis réactive les notifications dans les paramètres.",
                    tag: "edp-push-paused",
                    url: "/login",
                });
            }
            return `login-${result.error}`;
        }
        session.token = result.token;
        session.token2fa = result.token2fa;
        raw = await fetchRaw(session, record);
    }

    const next = buildSnapshot(raw, record.snapshot ?? null);
    const events = diffSnapshots(record.snapshot ?? null, next, raw)
        .filter((event) => (record.types ?? VALID_TYPES).includes(event.type));

    record.snapshot = next;
    record.token = session.token;
    record.token2fa = session.token2fa;
    record.lastCheck = Date.now();

    if (events.length > 0) {
        const alive = await pushEvents(record, events);
        if (!alive) {
            await redis(config, ["DEL", redisKey]);
            await redis(config, ["SREM", SUBSCRIBERS_SET, redisKey]);
            return "gone";
        }
    }
    await writeRecord(config, key, redisKey, record);
    return `ok-${events.length}`;
}

/* ---------- Handler ---------- */

async function readBody(req) {
    if (req.body && typeof req.body === "object" && !Buffer.isBuffer(req.body)) return req.body;
    if (typeof req.body === "string") return JSON.parse(req.body || "{}");
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    return JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
}

function sanitizeTypes(types) {
    return Array.isArray(types) ? VALID_TYPES.filter((type) => types.includes(type)) : VALID_TYPES;
}

function validSubscription(subscription) {
    return subscription
        && typeof subscription.endpoint === "string"
        && /^https:\/\//.test(subscription.endpoint)
        && subscription.endpoint.length < 1000
        && typeof subscription.keys?.p256dh === "string"
        && typeof subscription.keys?.auth === "string";
}

export default async function handler(req, res) {
    res.setHeader("Cache-Control", "no-store");
    const action = String(req.query?.action ?? "");

    if (action === "key") {
        const publicKey = process.env.VAPID_PUBLIC_KEY;
        return publicKey
            ? res.status(200).json({ code: 200, publicKey })
            : res.status(503).json({ code: 503, message: "Notifications push non configurées sur ce serveur." });
    }

    const config = redisConfig();
    const key = encryptionKey();
    if (!config || !key || !setupWebPush()) {
        return res.status(503).json({ code: 503, message: "Notifications push non configurées sur ce serveur." });
    }

    try {
        if (action === "check") {
            // Verrou : une verification a la fois, et pas plus d'une toutes les 8 min.
            const locked = await redis(config, ["SET", CHECK_LOCK_KEY, String(Date.now()), "NX", "EX", String(CHECK_MIN_INTERVAL_S)]);
            if (locked !== "OK") {
                return res.status(200).json({ code: 200, message: "Vérification déjà faite récemment." });
            }
            const keys = (await redis(config, ["SMEMBERS", SUBSCRIBERS_SET])) ?? [];
            const results = {};
            for (const redisKey of keys) {
                let outcome;
                try {
                    outcome = await checkSubscriber(config, key, redisKey);
                } catch (error) {
                    outcome = `error-${error?.message ?? "unknown"}`;
                }
                results[outcome] = (results[outcome] ?? 0) + 1;
            }
            // Uniquement des compteurs : aucune donnee d'eleve dans la reponse.
            return res.status(200).json({ code: 200, subscribers: keys.length, results });
        }

        if (req.method !== "POST") {
            res.setHeader("Allow", "POST");
            return res.status(405).json({ code: 405, message: "Méthode non autorisée." });
        }
        if (action === "broadcast-test") {
            // Compare des hachages de meme longueur, en temps constant.
            const given = createHash("sha256").update(String(req.headers["x-edp-admin"] ?? "")).digest();
            const expected = createHash("sha256").update(process.env.PUSH_ENCRYPTION_KEY ?? "").digest();
            if (!req.headers["x-edp-admin"] || !timingSafeEqual(given, expected)) {
                return res.status(403).json({ code: 403, message: "Accès refusé." });
            }
            const keys = (await redis(config, ["SMEMBERS", SUBSCRIBERS_SET])) ?? [];
            const results = {};
            for (const redisKey of keys) {
                let outcome;
                try {
                    const record = await readRecord(config, key, redisKey);
                    if (!record) {
                        outcome = "missing";
                    } else {
                        const alive = await push(record.subscription, {
                            title: "Notification de test",
                            body: "Les notifications EDP marchent, même appli fermée.",
                            tag: "edp-broadcast-test",
                            url: `/app/${record.accountIndex ?? 0}/dashboard`,
                        });
                        outcome = alive ? "sent" : "gone";
                    }
                } catch (error) {
                    outcome = `error-${error?.message ?? "unknown"}`;
                }
                results[outcome] = (results[outcome] ?? 0) + 1;
            }
            return res.status(200).json({ code: 200, subscribers: keys.length, results });
        }

        const body = await readBody(req);

        if (action === "subscribe") {
            const { subscription, username, password, cn, cv } = body ?? {};
            const accountId = String(body?.accountId ?? "");
            if (!validSubscription(subscription) || !username || !password || !/^\d{1,12}$/.test(accountId)) {
                return res.status(400).json({ code: 400, message: "Demande incomplète." });
            }
            // Verifie les identifiants et que le compte demande leur appartient.
            const result = await login({ username, password, cn, cv });
            if (result.error) {
                const message = result.error === "a2f"
                    ? "EcoleDirecte demande une double authentification : reconnecte-toi à EDP puis réessaie."
                    : "EcoleDirecte a refusé la connexion depuis le serveur.";
                return res.status(403).json({ code: 403, message });
            }
            if (!studentIdsOf(result.accounts).includes(accountId)) {
                return res.status(403).json({ code: 403, message: "Ce compte n'appartient pas à ces identifiants." });
            }

            const record = {
                subscription,
                username,
                password,
                cn: cn ?? "",
                cv: cv ?? "",
                accountId,
                familyId: familyIdFor(result.accounts, accountId),
                accountIndex: Number.isInteger(body.accountIndex) ? body.accountIndex : 0,
                types: sanitizeTypes(body.types),
                token: result.token,
                token2fa: result.token2fa,
                status: "active",
                createdAt: Date.now(),
            };
            // Premier instantane tout de suite : la prochaine verification ne
            // signalera que ce qui arrive apres l'activation.
            const session = { token: record.token, token2fa: record.token2fa };
            try {
                record.snapshot = buildSnapshot(await fetchRaw(session, record));
                record.token = session.token;
            } catch {
                record.snapshot = null;
            }

            const redisKey = subscriberKey(subscription.endpoint);
            await writeRecord(config, key, redisKey, record);
            await redis(config, ["SADD", SUBSCRIBERS_SET, redisKey]);
            return res.status(200).json({ code: 200 });
        }

        if (action === "update" || action === "unsubscribe") {
            const endpoint = body?.endpoint;
            if (typeof endpoint !== "string" || !endpoint) {
                return res.status(400).json({ code: 400, message: "Abonnement manquant." });
            }
            const redisKey = subscriberKey(endpoint);
            if (action === "unsubscribe") {
                await redis(config, ["DEL", redisKey]);
                await redis(config, ["SREM", SUBSCRIBERS_SET, redisKey]);
                return res.status(200).json({ code: 200 });
            }
            const record = await readRecord(config, key, redisKey);
            if (!record) return res.status(404).json({ code: 404, message: "Abonnement introuvable." });
            record.types = sanitizeTypes(body.types);
            await writeRecord(config, key, redisKey, record);
            return res.status(200).json({ code: 200 });
        }

        return res.status(400).json({ code: 400, message: "Action inconnue." });
    } catch (error) {
        // Seul le type d'erreur est journalise, jamais la requete.
        console.error("Erreur push:", error?.message ?? "Unknown");
        return res.status(502).json({ code: 502, message: "Erreur du serveur de notifications." });
    }
}
