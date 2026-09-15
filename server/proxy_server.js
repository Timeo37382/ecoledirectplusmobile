/**
 * Proxy EcoleDirecte — variante Node/Express.
 *
 * Equivalent de worker/edp-proxy.js, pour un hebergement sur VPS plutot que
 * sur Cloudflare Workers. Meme principe : l'aller-retour GTK est fait
 * entierement cote serveur lors du login, le proxy reste sans etat.
 *
 *   npm install express
 *   node server/proxy_server.js
 *
 * Servir le build du front (dist/) et ce proxy derriere le meme domaine, avec
 * /edp-api/ route ici : on reste en same-origin, donc aucun CORS.
 *
 * Confidentialite : les identifiants EcoleDirecte transitent en clair par ce
 * processus. Aucun middleware de log n'est monte, et aucun corps de requete
 * n'est affiche. Ne pas ajouter de logger ici (l'ancienne version utilisait
 * morgan, ce qui journalisait les URLs de chaque utilisateur).
 */

// package.json declare "type": "module" : ce fichier doit donc etre en ESM.
// (l'ancienne version utilisait require() et n'aurait pas pu demarrer.)
import express from "express";

const ED_ORIGIN = "https://api.ecoledirecte.com";
const PROXY_PREFIX = "/edp-api";
const PORT = process.env.PORT ?? 3001;
const HOST = process.env.HOST ?? "127.0.0.1";

const SPOOFED_HEADERS = {
    "Origin": "https://www.ecoledirecte.com",
    "Referer": "https://www.ecoledirecte.com/",
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Safari/537.36",
};

const FORWARDED_REQUEST_HEADERS = ["x-token", "2fa-token"];

// Le front annonce text/plain en mode proxy pour que le corps ne soit ni parse
// ni decode en route (voir bodyContentType() dans src/utils/api.js). C'est ici
// qu'on remet le Content-Type qu'attend EcoleDirecte, sur le corps intact.
const UPSTREAM_CONTENT_TYPE = "application/x-www-form-urlencoded";

const FORWARDED_RESPONSE_HEADERS = ["content-type", "x-token", "2fa-token"];


const app = express();

// Corps recupere brut : EcoleDirecte attend `data=<json>` non encode, il ne
// faut surtout pas le laisser reparser/reserialiser.
app.use(express.raw({ type: "*/*", limit: "25mb" }));

function buildUpstreamHeaders(req, extra = {}) {
    const headers = { ...SPOOFED_HEADERS };
    for (const name of FORWARDED_REQUEST_HEADERS) {
        if (req.headers[name]) {
            headers[name] = req.headers[name];
        }
    }
    return { ...headers, ...extra };
}

async function sendUpstreamResponse(upstream, res) {
    for (const name of FORWARDED_RESPONSE_HEADERS) {
        const value = upstream.headers.get(name);
        if (value) {
            res.setHeader(name, value);
        }
    }
    res.setHeader("Cache-Control", "no-store");
    res.status(upstream.status);
    res.send(Buffer.from(await upstream.arrayBuffer()));
}

async function fetchGtk(apiVersion) {
    const response = await fetch(
        `${ED_ORIGIN}/v3/login.awp?gtk=1&v=${encodeURIComponent(apiVersion)}`,
        { method: "GET", headers: SPOOFED_HEADERS },
    );

    const cookies = typeof response.headers.getSetCookie === "function"
        ? response.headers.getSetCookie()
        : [response.headers.get("set-cookie")].filter(Boolean);

    const pairs = cookies.map((cookie) => cookie.split(";")[0].trim()).filter(Boolean);
    const gtkPair = pairs.find((pair) => pair.startsWith("GTK="));

    if (!gtkPair) {
        return null;
    }

    return { gtk: gtkPair.slice("GTK=".length), cookieHeader: pairs.join("; ") };
}

app.all(`${PROXY_PREFIX}/*`, async (req, res) => {
    const path = req.originalUrl.slice(PROXY_PREFIX.length);
    const [pathname, search = ""] = path.split("?");
    const params = new URLSearchParams(search);

    try {
        if (pathname === "/v3/login.awp" && params.get("gtk") === "1") {
            res.setHeader("Cache-Control", "no-store");
            return res.status(200).json({ code: 200 });
        }

        if (pathname === "/v3/login.awp" && req.method === "POST") {
            const credentials = await fetchGtk(params.get("v") ?? "");
            if (!credentials) {
                res.setHeader("Cache-Control", "no-store");
                return res.status(502).json({
                    code: 522,
                    message: "Le proxy n'a pas pu obtenir le jeton GTK aupres d'EcoleDirecte.",
                });
            }

            const upstream = await fetch(`${ED_ORIGIN}${path}`, {
                method: "POST",
                headers: buildUpstreamHeaders(req, {
                    "Cookie": credentials.cookieHeader,
                    "X-GTK": credentials.gtk,
                    "Content-Type": UPSTREAM_CONTENT_TYPE,
                }),
                body: req.body,
            });

            return await sendUpstreamResponse(upstream, res);
        }

        const init = { method: req.method, headers: buildUpstreamHeaders(req) };
        if (req.method !== "GET" && req.method !== "HEAD" && req.body?.length) {
            init.body = req.body;
            init.headers["Content-Type"] = UPSTREAM_CONTENT_TYPE;
        }

        const upstream = await fetch(`${ED_ORIGIN}${path}`, init);
        return await sendUpstreamResponse(upstream, res);
    } catch (error) {
        // On ne journalise que le type d'erreur, jamais la requete elle-meme.
        console.error("Erreur proxy:", error.name);
        res.setHeader("Cache-Control", "no-store");
        return res.status(502).json({ code: 502, message: "Erreur du proxy." });
    }
});

app.listen(PORT, HOST, () => {
    console.log(`Proxy EDP demarre sur ${HOST}:${PORT}${PROXY_PREFIX}`);
});
