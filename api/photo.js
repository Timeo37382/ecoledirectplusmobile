/**
 * Relais des photos de profil — Vercel Function (Node.js).
 *
 * Routage : vercel.json reecrit /edp-photo vers /api/photo.
 *   GET /edp-photo?u=<adresse de la photo renvoyee par EcoleDirecte>
 *
 * Le serveur de medias d'EcoleDirecte (doc1.ecoledirecte.com...) refuse les
 * images demandees depuis un autre site que le sien. EDP d'origine contourne
 * ca avec son extension EDP Unblock ; ici on la demande cote serveur en se
 * presentant comme le site officiel.
 *
 * Securite : uniquement des adresses https de *.ecoledirecte.com (pas un
 * relais ouvert), uniquement des images. Rien n'est journalise.
 */

const ALLOWED_HOST = /^([a-z0-9-]+\.)*ecoledirecte\.com$/i;
const MAX_BYTES = 5 * 1024 * 1024;

const UPSTREAM_HEADERS = {
    "Referer": "https://www.ecoledirecte.com/",
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Safari/537.36",
    "Accept": "image/avif,image/webp,image/apng,image/*,*/*;q=0.8",
};

export default async function handler(req, res) {
    if (req.method !== "GET" && req.method !== "HEAD") {
        res.setHeader("Allow", "GET, HEAD");
        return res.status(405).json({ code: 405, message: "Méthode non autorisée." });
    }

    let target;
    try {
        target = new URL(String(req.query?.u ?? ""));
    } catch {
        return res.status(400).json({ code: 400, message: "Adresse invalide." });
    }
    if (target.protocol !== "https:" || !ALLOWED_HOST.test(target.hostname)) {
        return res.status(400).json({ code: 400, message: "Adresse non autorisée." });
    }

    try {
        const upstream = await fetch(target.href, { headers: UPSTREAM_HEADERS, redirect: "follow" });
        const type = upstream.headers.get("content-type") ?? "";
        if (!upstream.ok || !type.startsWith("image/")) {
            // Code renvoye par EcoleDirecte, pour le diagnostic (pas de contenu).
            res.setHeader("Cache-Control", "no-store");
            return res.status(502).json({ code: 502, upstreamStatus: upstream.status, upstreamType: type.split(";")[0] });
        }
        const body = Buffer.from(await upstream.arrayBuffer());
        if (body.length > MAX_BYTES) {
            return res.status(502).json({ code: 502, message: "Image trop lourde." });
        }
        res.setHeader("Content-Type", type);
        // Photo propre a l'eleve : cache du navigateur uniquement, pas du CDN.
        res.setHeader("Cache-Control", "private, max-age=86400");
        return res.status(200).send(body);
    } catch (error) {
        console.error("Erreur relais photo:", error?.name ?? "Unknown");
        return res.status(502).json({ code: 502, message: "Erreur du relais." });
    }
}
