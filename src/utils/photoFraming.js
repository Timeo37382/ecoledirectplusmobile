/**
 * Recadrage automatique des photos de profil.
 *
 * Les photos d'EcoleDirecte n'ont pas toutes le meme format : portrait plus
 * ou moins allonge, et souvent des marges blanches (ou unies) incrustees sur
 * les cotes. Dans un cadre carre, ca laisse des bords blancs.
 *
 * A son chargement, on analyse l'image (canvas) pour trouver la zone utile
 * (sans les marges unies), puis on la place pour qu'elle remplisse le cadre
 * carre : centree horizontalement, plutot vers le haut (le visage).
 *
 * Tout est en pourcentages du cadre : ca reste juste quelle que soit sa taille.
 * Le cadre doit etre carre, avec overflow: hidden ; on lui donne
 * position: relative.
 */

const ANALYSIS_SIZE = 160; // l'analyse se fait sur une copie reduite
const MAX_TRIM = 0.3; // jamais plus de 30 % retires d'un cote
const BACKGROUND_COLUMN_RATIO = 0.96; // part de pixels "fond" pour qu'une ligne soit une marge
const COLOR_TOLERANCE = 38;
const FACE_BIAS = 0.2; // 0 = haut de la photo, 0.5 = centre

/** Zone utile en fraction de l'image : { x0, y0, x1, y1 } entre 0 et 1. */
function contentBox(img) {
    const scale = Math.min(1, ANALYSIS_SIZE / Math.max(img.naturalWidth, img.naturalHeight));
    const w = Math.max(1, Math.round(img.naturalWidth * scale));
    const h = Math.max(1, Math.round(img.naturalHeight * scale));
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    ctx.drawImage(img, 0, 0, w, h);
    // Leve une erreur si l'image vient d'un autre site sans autorisation :
    // on retombe alors sur un simple remplissage.
    const { data } = ctx.getImageData(0, 0, w, h);

    const pixel = (x, y) => {
        const i = (y * w + x) * 4;
        return [data[i], data[i + 1], data[i + 2], data[i + 3]];
    };

    // Couleur de fond : moyenne des 4 coins.
    const corners = [pixel(0, 0), pixel(w - 1, 0), pixel(0, h - 1), pixel(w - 1, h - 1)];
    const bg = [0, 1, 2].map((c) => corners.reduce((sum, p) => sum + p[c], 0) / 4);
    const bgIsLight = (bg[0] + bg[1] + bg[2]) / 3 > 170;
    const cornersAgree = corners.every((p) => Math.abs(p[0] - bg[0]) + Math.abs(p[1] - bg[1]) + Math.abs(p[2] - bg[2]) < COLOR_TOLERANCE * 2);

    const isBackground = (x, y) => {
        const [r, g, b, a] = pixel(x, y);
        if (a < 20) return true; // transparent
        if (!cornersAgree) return false;
        return Math.abs(r - bg[0]) < COLOR_TOLERANCE && Math.abs(g - bg[1]) < COLOR_TOLERANCE && Math.abs(b - bg[2]) < COLOR_TOLERANCE;
    };

    const columnIsBackground = (x) => {
        let count = 0;
        for (let y = 0; y < h; y++) if (isBackground(x, y)) count++;
        return count / h >= BACKGROUND_COLUMN_RATIO;
    };
    const rowIsBackground = (y) => {
        let count = 0;
        for (let x = 0; x < w; x++) if (isBackground(x, y)) count++;
        return count / w >= BACKGROUND_COLUMN_RATIO;
    };

    let left = 0;
    let right = w - 1;
    let top = 0;
    let bottom = h - 1;
    // Une marge unie fonce (ex. bandes noires) se rogne aussi, mais seulement
    // les marges claires sont rognees en haut et en bas (un fond sombre en
    // haut est souvent un vrai fond de photo).
    while (left < w * MAX_TRIM && columnIsBackground(left)) left++;
    while (right > w * (1 - MAX_TRIM) && columnIsBackground(right)) right--;
    if (bgIsLight) {
        while (top < h * MAX_TRIM && rowIsBackground(top)) top++;
        while (bottom > h * (1 - MAX_TRIM) && rowIsBackground(bottom)) bottom--;
    }

    return { x0: left / w, y0: top / h, x1: (right + 1) / w, y1: (bottom + 1) / h };
}

/**
 * A appeler au chargement de l'image (onLoad). Applique des styles en ligne
 * pour que la zone utile remplisse le cadre carre.
 */
export function framePhoto(img) {
    if (!img || !img.naturalWidth || !img.naturalHeight) return;

    let box = { x0: 0, y0: 0, x1: 1, y1: 1 };
    try {
        box = contentBox(img);
    } catch {
        // image d'un autre site : pas d'analyse, simple remplissage
    }

    // Tailles en pixels "naturels".
    const W = img.naturalWidth;
    const H = img.naturalHeight;
    const cw = (box.x1 - box.x0) * W;
    const ch = (box.y1 - box.y0) * H;
    // Cadre carre de cote m (en pixels naturels) : le plus petit cote de la
    // zone utile, pour la couvrir entierement.
    const m = Math.min(cw, ch);
    if (m <= 0) return;

    const x0 = box.x0 * W + (cw - m) / 2; // centre horizontalement
    const y0 = box.y0 * H + (ch - m) * FACE_BIAS; // plutot vers le haut

    const pct = (value) => `${(value / m) * 100}%`;
    const frame = img.parentElement;
    if (frame && getComputedStyle(frame).position === "static") {
        frame.style.position = "relative";
    }
    Object.assign(img.style, {
        position: "absolute",
        maxWidth: "none",
        width: pct(W),
        height: pct(H),
        left: `-${pct(x0)}`,
        top: `-${pct(y0)}`,
        objectFit: "fill",
        objectPosition: "initial",
        transform: "none",
    });
    img.dataset.framed = "1";
}
