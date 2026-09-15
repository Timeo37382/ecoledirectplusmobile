/**
 * Proxy EcoleDirecte — Vercel Function (runtime Node.js).
 *
 * Equivalent de worker/edp-proxy.js, adapte a la signature (req, res) de
 * Vercel. Meme principe : l'aller-retour GTK est fait entierement cote serveur
 * lors du login, le proxy reste sans etat.
 *
 * Routage : vercel.json reecrit /edp-api/<chemin> vers /api/proxy?edpPath=<chemin>,
 * en conservant les parametres d'origine. Le front reste donc sur /edp-api et
 * n'a rien a savoir de l'hebergeur.
 *
 * Confidentialite : ce handler voit passer les identifiants EcoleDirecte en
 * clair, le temps du relai. Il ne journalise NI les corps de requete, NI les
 * en-tetes d'authentification, NI les URLs. Ne pas ajouter de log ici.
 */

const ED_ORIGIN = "https://api.ecoledirecte.com";

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


// Vercel parse le corps selon le Content-Type. On demande le corps brut : le
// payload d'EcoleDirecte est un `data=<json>` non encode qu'il ne faut surtout
// pas reserialiser.
export const config = {
    api: { bodyParser: false },
};

/**
 * Recupere le corps brut, quelle que soit la facon dont Vercel l'a (ou non)
 * pretraite selon la version du runtime.
 */
async function readRawBody(req) {
    if (typeof req.body === "string") {
        return req.body;
    }
    if (Buffer.isBuffer(req.body)) {
        return req.body.toString("utf8");
    }
    if (req.body && typeof req.body === "object") {
        // Corps deja parse en form-urlencoded : on reconstruit `cle=valeur` sans
        // re-encoder, EcoleDirecte attendant le JSON brut.
        return Object.entries(req.body)
            .map(([key, value]) => `${key}=${value}`)
            .join("&");
    }
    const chunks = [];
    for await (const chunk of req) {
        chunks.push(chunk);
    }
    return Buffer.concat(chunks).toString("utf8");
}

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
    // arrayBuffer() couvre aussi le binaire (telechargement de fichiers).
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

export default async function handler(req, res) {
    // vercel.json injecte edpPath ; les autres parametres sont ceux d'origine.
    const query = new URLSearchParams(req.query ?? {});
    const edpPath = query.get("edpPath") ?? "";
    query.delete("edpPath");

    const search = query.toString();
    const upstreamUrl = `${ED_ORIGIN}/${edpPath}${search ? `?${search}` : ""}`;
    const isLoginRoute = edpPath === "v3/login.awp";

    res.setHeader("Cache-Control", "no-store");

    try {
        // Le front court-circuite deja cet appel en mode proxy, mais on repond
        // proprement au cas ou : le GTK est gere lors du login.
        if (isLoginRoute && query.get("gtk") === "1") {
            return res.status(200).json({ code: 200 });
        }

        if (isLoginRoute && req.method === "POST") {
            const body = await readRawBody(req);
            const credentials = await fetchGtk(query.get("v") ?? "");

            if (!credentials) {
                return res.status(502).json({
                    code: 522,
                    message: "Le proxy n'a pas pu obtenir le jeton GTK aupres d'EcoleDirecte.",
                });
            }

            const upstream = await fetch(upstreamUrl, {
                method: "POST",
                headers: buildUpstreamHeaders(req, {
                    "Cookie": credentials.cookieHeader,
                    "X-GTK": credentials.gtk,
                    "Content-Type": UPSTREAM_CONTENT_TYPE,
                }),
                body,
            });

            return await sendUpstreamResponse(upstream, res);
        }

        const init = { method: req.method, headers: buildUpstreamHeaders(req) };
        if (req.method !== "GET" && req.method !== "HEAD") {
            const body = await readRawBody(req);
            if (body) {
                init.body = body;
                init.headers["Content-Type"] = UPSTREAM_CONTENT_TYPE;
            }
        }

        const upstream = await fetch(upstreamUrl, init);
        return await sendUpstreamResponse(upstream, res);
    } catch (error) {
        // On ne journalise que le type d'erreur, jamais la requete elle-meme.
        console.error("Erreur proxy:", error?.name ?? "Unknown");
        return res.status(502).json({ code: 502, message: "Erreur du proxy." });
    }
}
