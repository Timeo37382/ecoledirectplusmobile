import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Couleurs personnalisees des matieres de l'emploi du temps.
 *
 * - Une couleur par matiere, cle = code matiere EcoleDirecte (ou le nom).
 * - Deux matieres ne peuvent pas avoir la meme couleur, ni deux couleurs trop
 *   proches pour etre distinguees.
 * - Les couleurs sont gardees sur l'appareil (affichage immediat, hors ligne)
 *   et synchronisees entre appareils via /edp-prefs quand le serveur le permet.
 */

const STORAGE_PREFIX = "edp-subject-colors-";
const SAVE_DELAY_MS = 800;
// En dessous de cette distance ("redmean", 0-255), deux couleurs se
// confondent a l'oeil. Calibre : quasi-doublons < 14, couleurs nettement
// differentes (orange / dore, saumon / rose) > 25.
export const MIN_COLOR_DISTANCE = 18;

export function subjectKey(course) {
    return String(course.codeMatiere || course.subject || course.matiere || "").trim().toUpperCase();
}

function hexToRgb(hex) {
    const value = hex.replace("#", "");
    return [0, 2, 4].map((index) => parseInt(value.slice(index, index + 2), 16));
}

export function colorDistance(a, b) {
    const [r1, g1, b1] = hexToRgb(a);
    const [r2, g2, b2] = hexToRgb(b);
    // Ponderation "redmean" : plus proche de la perception que la distance brute.
    const rMean = (r1 + r2) / 2;
    const dr = r1 - r2;
    const dg = g1 - g2;
    const db = b1 - b2;
    return Math.sqrt((2 + rMean / 256) * dr * dr + 4 * dg * dg + (2 + (255 - rMean) / 256) * db * db) / 3;
}

/** Premiere autre matiere dont la couleur est identique ou trop proche. */
export function findColorConflict(color, key, effectiveColors) {
    for (const [otherKey, otherColor] of Object.entries(effectiveColors)) {
        if (otherKey !== key && otherColor && colorDistance(color, otherColor) < MIN_COLOR_DISTANCE) {
            return otherKey;
        }
    }
    return null;
}

function readLocal(accountId) {
    try {
        const stored = JSON.parse(localStorage.getItem(STORAGE_PREFIX + accountId) ?? "null");
        if (stored && typeof stored.colors === "object") {
            return { colors: stored.colors, updatedAt: stored.updatedAt ?? 0, pending: Boolean(stored.pending) };
        }
    } catch {
        // Donnees corrompues : on repart de zero.
    }
    return { colors: {}, updatedAt: 0, pending: false };
}

function writeLocal(accountId, value) {
    localStorage.setItem(STORAGE_PREFIX + accountId, JSON.stringify(value));
}

/**
 * syncState :
 *   "local"   synchronisation indisponible (invite, dev local, serveur non configure)
 *   "loading" lecture des couleurs du compte
 *   "saving"  envoi en cours
 *   "synced"  a jour sur tous les appareils
 *   "pending" enregistre sur l'appareil, envoi a refaire (hors ligne / erreur)
 */
export function useSubjectColors({ accountId, fetchRemote, saveRemote }) {
    const [colors, setColorsState] = useState(() => readLocal(accountId).colors);
    const [syncState, setSyncState] = useState("loading");
    const [syncMessage, setSyncMessage] = useState("");
    const saveTimer = useRef(null);
    const remoteAvailable = useRef(false);
    const saveRemoteRef = useRef(saveRemote);

    useEffect(() => {
        saveRemoteRef.current = saveRemote;
    }, [saveRemote]);

    const pushToServer = useCallback(async (nextColors) => {
        setSyncState("saving");
        const result = await saveRemoteRef.current(nextColors);
        const local = readLocal(accountId);
        if (result.ok && result.localOnly) {
            remoteAvailable.current = false;
            setSyncState("local");
            return;
        }
        if (result.ok) {
            writeLocal(accountId, { ...local, pending: false, updatedAt: result.updatedAt ?? local.updatedAt });
            setSyncState("synced");
            setSyncMessage("");
        } else {
            setSyncState("pending");
            setSyncMessage(result.message || "");
        }
    }, [accountId]);

    // Chargement : couleurs de l'appareil d'abord, puis celles du compte.
    useEffect(() => {
        let cancelled = false;
        const local = readLocal(accountId);
        setColorsState(local.colors);
        setSyncState("loading");

        if (typeof fetchRemote !== "function") {
            setSyncState("local");
            return undefined;
        }

        fetchRemote().then((remote) => {
            if (cancelled) return;
            if (!remote?.available) {
                remoteAvailable.current = false;
                setSyncState("local");
                return;
            }
            remoteAvailable.current = true;
            if (local.pending && local.updatedAt > (remote.updatedAt ?? 0)) {
                // Modifications faites hors ligne, plus recentes : on les envoie.
                pushToServer(local.colors);
            } else {
                writeLocal(accountId, { colors: remote.colors, updatedAt: remote.updatedAt, pending: false });
                setColorsState(remote.colors);
                setSyncState("synced");
            }
        });

        return () => {
            cancelled = true;
            clearTimeout(saveTimer.current);
        };
    }, [accountId]);

    const setColors = useCallback((updater) => {
        setColorsState((old) => {
            const next = typeof updater === "function" ? updater(old) : updater;
            writeLocal(accountId, { colors: next, updatedAt: Date.now(), pending: true });
            clearTimeout(saveTimer.current);
            if (remoteAvailable.current) {
                setSyncState("pending");
                // Regroupe les retouches rapides (ex. glisser dans le selecteur).
                saveTimer.current = setTimeout(() => pushToServer(next), SAVE_DELAY_MS);
            } else {
                setSyncState("local");
            }
            return next;
        });
    }, [accountId, pushToServer]);

    const retry = useCallback(() => {
        pushToServer(readLocal(accountId).colors);
    }, [accountId, pushToServer]);

    return { colors, setColors, syncState, syncMessage, retry };
}
