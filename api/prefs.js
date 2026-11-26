/**
 * Preferences synchronisees entre appareils — Vercel Function (Node.js).
 *
 * Stocke aujourd'hui les couleurs personnalisees des matieres de l'emploi du
 * temps. Base : Upstash Redis (API REST), creee depuis l'onglet Storage de
 * Vercel. Variables d'environnement acceptees (injectees par Vercel) :
 *   UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN
 *   ou KV_REST_API_URL / KV_REST_API_TOKEN
 *
 * Routage : vercel.json reecrit /edp-prefs vers /api/prefs.
 *
 *   GET  /edp-prefs?account=<id>               -> { code: 200, data: { colors, updatedAt } }
 *   POST /edp-prefs?account=<id>  (X-Token)    corps JSON { colors: { "MATHS": "#4f7cff", ... } }
 *
 * Confidentialite :
 * - la cle Redis est un hachage de l'identifiant du compte : la base ne
 *   contient ni nom, ni identifiant EcoleDirecte en clair, seulement des
 *   couleurs ;
 * - une ecriture n'est acceptee qu'apres verification aupres d'EcoleDirecte
 *   que le jeton de session fourni donne bien acces a ce compte. Le nouveau
 *   jeton renvoye par EcoleDirecte est retransmis au client (en-tete
 *   X-Token) pour que sa session continue de fonctionner ;
 * - rien n'est journalise (ni jeton, ni identifiant).
 */

import { createHash } from "node:crypto";

const ED_ORIGIN = "https://api.ecoledirecte.com";
const ED_API_VERSION = "4.69.1";
const SPOOFED_HEADERS = {
    "Origin": "https://www.ecoledirecte.com",
    "Referer": "https://www.ecoledirecte.com/",
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Safari/537.36",
    "Content-Type": "application/x-www-form-urlencoded",
};

const MAX_SUBJECTS = 80;
const MAX_KEY_LENGTH = 60;
const COLOR_PATTERN = /^#[0-9a-f]{6}$/i;

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
    if (!response.ok) {
        throw new Error("REDIS_ERROR");
    }
    return (await response.json()).result;
}

function storageKey(config, accountId) {
    // Sel : variable dediee si presente, sinon le jeton Redis (secret serveur).
    const salt = process.env.PREFS_SALT || config.token;
    const digest = createHash("sha256").update(`${salt}:${accountId}`).digest("hex");
    return `edp:prefs:${digest}`;
}

function sanitizeColors(input) {
    if (!input || typeof input !== "object" || Array.isArray(input)) {
        return null;
    }
    const entries = Object.entries(input);
    if (entries.length > MAX_SUBJECTS) {
        return null;
    }
    const colors = {};
    for (const [key, value] of entries) {
        if (typeof key !== "string" || !key.trim() || key.length > MAX_KEY_LENGTH) return null;
        if (typeof value !== "string" || !COLOR_PATTERN.test(value)) return null;
        colors[key.trim()] = value.toLowerCase();
    }
    // Regle produit : deux matieres ne partagent jamais la meme couleur.
    const used = Object.values(colors);
    if (new Set(used).size !== used.length) {
        return null;
    }
    return colors;
}

async function readBody(req) {
    if (req.body && typeof req.body === "object" && !Buffer.isBuffer(req.body)) {
        return req.body;
    }
    if (typeof req.body === "string") {
        return JSON.parse(req.body);
    }
    const chunks = [];
    for await (const chunk of req) {
        chunks.push(chunk);
    }
    return JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
}

/**
 * Verifie aupres d'EcoleDirecte que le jeton donne acces a l'eleve demande, via
 * un appel en lecture tres leger (timeline). Renvoie le nouveau jeton ou null.
 */
async function verifyOwnership(accountId, token, token2fa) {
    const headers = { ...SPOOFED_HEADERS, "X-Token": token };
    if (token2fa) {
        headers["2FA-Token"] = token2fa;
    }
    const response = await fetch(
        `${ED_ORIGIN}/v3/eleves/${encodeURIComponent(accountId)}/timeline.awp?verbe=get&v=${ED_API_VERSION}`,
        { method: "POST", headers, body: "data={}" },
    );
    const payload = await response.json().catch(() => null);
    if (!payload || payload.code !== 200) {
        return null;
    }
    return payload.token || response.headers.get("x-token") || token;
}

export default async function handler(req, res) {
    res.setHeader("Cache-Control", "no-store");

    const config = redisConfig();
    if (!config) {
        return res.status(503).json({ code: 503, message: "Synchronisation non configurée sur ce serveur." });
    }

    const accountId = String(req.query?.account ?? "");
    if (!/^\d{1,12}$/.test(accountId)) {
        return res.status(400).json({ code: 400, message: "Compte invalide." });
    }
    const key = storageKey(config, accountId);

    try {
        if (req.method === "GET") {
            const stored = await redis(config, ["GET", key]);
            const data = stored ? JSON.parse(stored) : { colors: {}, updatedAt: 0 };
            return res.status(200).json({ code: 200, data });
        }

        if (req.method === "POST") {
            const token = req.headers["x-token"];
            if (!token) {
                return res.status(401).json({ code: 401, message: "Session manquante." });
            }
            const body = await readBody(req);
            const colors = sanitizeColors(body?.colors);
            if (!colors) {
                return res.status(400).json({ code: 400, message: "Couleurs invalides (format, nombre ou doublon)." });
            }

            const newToken = await verifyOwnership(accountId, token, req.headers["2fa-token"]);
            if (!newToken) {
                return res.status(403).json({ code: 403, message: "Session EcoleDirecte expirée ou compte non autorisé." });
            }
            res.setHeader("X-Token", newToken);

            const data = { colors, updatedAt: Date.now() };
            await redis(config, ["SET", key, JSON.stringify(data)]);
            return res.status(200).json({ code: 200, data, token: newToken });
        }

        res.setHeader("Allow", "GET, POST");
        return res.status(405).json({ code: 405, message: "Méthode non autorisée." });
    } catch (error) {
        // Seul le type d'erreur est journalise, jamais la requete.
        console.error("Erreur prefs:", error?.message ?? "Unknown");
        return res.status(502).json({ code: 502, message: "Erreur du serveur de synchronisation." });
    }
}
