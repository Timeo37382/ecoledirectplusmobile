/**
 * Proxy EcoleDirecte — Cloudflare Worker.
 *
 * Sert de repli pour les plateformes qui ne peuvent pas heberger de coquille
 * native ni d'extension (iOS). Le navigateur ne peut pas relire le cookie GTK
 * renvoye par EcoleDirecte en cross-origin ; ici, cote serveur, cette
 * restriction n'existe pas.
 *
 * Point de conception important : la requete de login fait l'aller-retour GTK
 * *entierement cote serveur*, en une seule requete cliente. Le worker reste
 * donc totalement sans etat — pas de session, pas de stockage, pas de KV.
 *
 * A deployer sur la meme origine que le front (route `/edp-api/*`), ce qui
 * evite tout CORS.
 *
 * Confidentialite : ce worker voit passer les identifiants EcoleDirecte en
 * clair, le temps du relai. Il ne journalise donc NI les corps de requete, NI
 * les en-tetes d'authentification. Ne pas ajouter de log ici.
 */

const ED_ORIGIN = "https://api.ecoledirecte.com";
const PROXY_PREFIX = "/edp-api";

// EcoleDirecte refuse les requetes dont l'origine n'est pas son propre site.
const SPOOFED_HEADERS = {
    "Origin": "https://www.ecoledirecte.com",
    "Referer": "https://www.ecoledirecte.com/",
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Safari/537.36",
};

/** En-tetes du client qu'on relaie tels quels vers EcoleDirecte. */
const FORWARDED_REQUEST_HEADERS = [
    "x-token",
    "2fa-token",
];

// Le front annonce text/plain en mode proxy pour que le corps ne soit ni parse
// ni decode en route (voir bodyContentType() dans src/utils/api.js). C'est ici
// qu'on remet le Content-Type qu'attend EcoleDirecte, sur le corps intact.
const UPSTREAM_CONTENT_TYPE = "application/x-www-form-urlencoded";


/** En-tetes de reponse qu'on renvoie au client (les tokens sont lus par le front). */
const FORWARDED_RESPONSE_HEADERS = [
    "content-type",
    "x-token",
    "2fa-token",
];


function buildUpstreamHeaders(request, extra = {}) {
    const headers = new Headers(SPOOFED_HEADERS);
    for (const name of FORWARDED_REQUEST_HEADERS) {
        const value = request.headers.get(name);
        if (value) {
            headers.set(name, value);
        }
    }
    for (const [name, value] of Object.entries(extra)) {
        if (value) {
            headers.set(name, value);
        }
    }
    return headers;
}

function buildClientResponse(upstream, body) {
    const headers = new Headers();
    for (const name of FORWARDED_RESPONSE_HEADERS) {
        const value = upstream.headers.get(name);
        if (value) {
            headers.set(name, value);
        }
    }
    // Rien de ce qui transite ici ne doit etre mis en cache.
    headers.set("Cache-Control", "no-store");
    return new Response(body, { status: upstream.status, headers });
}

/**
 * Recupere le cookie GTK. EcoleDirecte le renvoie via Set-Cookie sur
 * login.awp?gtk=1 et attend ensuite sa valeur a la fois dans le cookie et
 * dans l'en-tete X-GTK.
 */
async function fetchGtk(apiVersion) {
    const response = await fetch(
        `${ED_ORIGIN}/v3/login.awp?gtk=1&v=${encodeURIComponent(apiVersion)}`,
        { method: "GET", headers: new Headers(SPOOFED_HEADERS) },
    );

    // getSetCookie() n'est pas disponible partout : repli sur get().
    let cookies = [];
    if (typeof response.headers.getSetCookie === "function") {
        cookies = response.headers.getSetCookie();
    } else {
        const raw = response.headers.get("set-cookie");
        if (raw) {
            cookies = [raw];
        }
    }

    const pairs = cookies.map((cookie) => cookie.split(";")[0].trim()).filter(Boolean);
    const gtkPair = pairs.find((pair) => pair.startsWith("GTK="));

    if (!gtkPair) {
        return null;
    }

    return {
        gtk: gtkPair.slice("GTK=".length),
        cookieHeader: pairs.join("; "),
    };
}

/** Login : GTK + authentification en un seul aller-retour cote serveur. */
async function handleLogin(request, url) {
    const apiVersion = url.searchParams.get("v") ?? "";
    const body = await request.text();

    let credentials;
    try {
        credentials = await fetchGtk(apiVersion);
    } catch {
        credentials = null;
    }

    if (!credentials) {
        return new Response(
            JSON.stringify({
                code: 522,
                message: "Le proxy n'a pas pu obtenir le jeton GTK aupres d'EcoleDirecte.",
            }),
            { status: 502, headers: { "content-type": "application/json", "Cache-Control": "no-store" } },
        );
    }

    const upstream = await fetch(`${ED_ORIGIN}/v3/login.awp${url.search}`, {
        method: "POST",
        headers: buildUpstreamHeaders(request, {
            "Cookie": credentials.cookieHeader,
            "X-GTK": credentials.gtk,
            "Content-Type": UPSTREAM_CONTENT_TYPE,
        }),
        body,
    });

    return buildClientResponse(upstream, upstream.body);
}

/** Toutes les autres routes : relai simple, authentifie par X-Token. */
async function handlePassthrough(request, targetUrl) {
    const init = {
        method: request.method,
        headers: buildUpstreamHeaders(request),
    };

    if (request.method !== "GET" && request.method !== "HEAD") {
        init.body = await request.arrayBuffer();
        init.headers.set("Content-Type", UPSTREAM_CONTENT_TYPE);
    }

    const upstream = await fetch(targetUrl, init);
    return buildClientResponse(upstream, upstream.body);
}

export default {
    async fetch(request) {
        const url = new URL(request.url);

        if (!url.pathname.startsWith(PROXY_PREFIX)) {
            return new Response("Not found", { status: 404 });
        }

        const path = url.pathname.slice(PROXY_PREFIX.length) || "/";

        // Le front court-circuite deja cette requete en mode proxy, mais on
        // repond proprement au cas ou : le GTK est gere lors du login.
        if (path === "/v3/login.awp" && url.searchParams.get("gtk") === "1") {
            return new Response(JSON.stringify({ code: 200 }), {
                status: 200,
                headers: { "content-type": "application/json", "Cache-Control": "no-store" },
            });
        }

        if (path === "/v3/login.awp" && request.method === "POST") {
            return handleLogin(request, url);
        }

        return handlePassthrough(request, `${ED_ORIGIN}${path}${url.search}`);
    },
};
