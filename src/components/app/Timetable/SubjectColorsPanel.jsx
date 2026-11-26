import { useMemo, useState } from "react";

import { findColorConflict } from "../../../utils/subjectColors";

import "./SubjectColorsPanel.css";

// Palette rapide ; toute autre couleur reste possible via le selecteur.
const QUICK_COLORS = [
    "#ef476f", "#d62839", "#fb6f24", "#f2a541", "#f7c948", "#c9d23b",
    "#7bc950", "#3d9970", "#2bb3a3", "#22a6c4", "#4f7cff", "#5965d8",
    "#7a5af5", "#b565d9", "#e05fb5", "#c9a227", "#a47148", "#8d99ae",
];

const SYNC_LABELS = {
    loading: "Récupération de tes couleurs…",
    saving: "Synchronisation…",
    synced: "Synchronisé sur tous tes appareils",
    pending: "Enregistré sur cet appareil, synchronisation en attente",
    local: "Enregistré sur cet appareil",
};

/**
 * subjects : [{ key, name, defaultColor }] — uniquement les matieres de
 * l'emploi du temps de l'eleve.
 */
export default function SubjectColorsPanel({ subjects, loadingSubjects, colors, setColors, syncState, syncMessage, onRetry }) {
    const [openKey, setOpenKey] = useState(null);
    const [errors, setErrors] = useState({});

    const subjectNames = useMemo(() => Object.fromEntries(subjects.map((subject) => [subject.key, subject.name])), [subjects]);

    // Couleur reellement affichee pour chaque matiere (perso ou EcoleDirecte).
    const effectiveColors = useMemo(
        () => Object.fromEntries(subjects.map((subject) => [subject.key, (colors[subject.key] ?? subject.defaultColor).toLowerCase()])),
        [subjects, colors],
    );

    const tryColor = (key, color) => {
        const value = color.toLowerCase();
        const conflict = findColorConflict(value, key, effectiveColors);
        if (conflict) {
            setErrors((old) => ({ ...old, [key]: `Trop proche de ${subjectNames[conflict] ?? conflict} : choisis une autre couleur.` }));
            return false;
        }
        setErrors((old) => ({ ...old, [key]: "" }));
        setColors((old) => ({ ...old, [key]: value }));
        return true;
    };

    const resetColor = (key) => {
        const subject = subjects.find((item) => item.key === key);
        const conflict = subject && findColorConflict(subject.defaultColor.toLowerCase(), key, effectiveColors);
        if (conflict) {
            setErrors((old) => ({ ...old, [key]: `La couleur d'origine est déjà prise par ${subjectNames[conflict] ?? conflict}.` }));
            return;
        }
        setErrors((old) => ({ ...old, [key]: "" }));
        setColors((old) => {
            const next = { ...old };
            delete next[key];
            return next;
        });
    };

    // Matieres qui ont deja la meme couleur d'origine (fournie par EcoleDirecte).
    const duplicateKeys = useMemo(() => {
        const result = new Set();
        for (const subject of subjects) {
            if (findColorConflict(effectiveColors[subject.key], subject.key, effectiveColors)) {
                result.add(subject.key);
            }
        }
        return result;
    }, [subjects, effectiveColors]);

    return (
        <div className="subject-colors">
            <p className={`subject-colors-sync ${syncState}`} role="status">
                <span className="subject-colors-sync-dot" aria-hidden="true" />
                {SYNC_LABELS[syncState] ?? ""}
                {syncState === "pending" && onRetry && <button type="button" onClick={onRetry}>Réessayer</button>}
            </p>
            {syncState === "pending" && syncMessage && <p className="subject-colors-sync-detail">{syncMessage}</p>}

            {loadingSubjects && subjects.length === 0 && <p className="subject-colors-info">Recherche de tes matières…</p>}
            {!loadingSubjects && subjects.length === 0 && <p className="subject-colors-info">Aucune matière trouvée dans ton emploi du temps.</p>}

            <ul className="subject-colors-list">
                {subjects.map((subject, index) => {
                    const color = effectiveColors[subject.key];
                    const isCustom = colors[subject.key] !== undefined;
                    const isOpen = openKey === subject.key;
                    const error = errors[subject.key] || (duplicateKeys.has(subject.key) && !isCustom ? "Même couleur qu'une autre matière : choisis-en une." : "");
                    return (
                        <li key={subject.key} className={`subject-color-row${isOpen ? " open" : ""}`} style={{ "--order": Math.min(index, 12), "--subject-color": color }}>
                            <button type="button" className="subject-color-main" onClick={() => setOpenKey(isOpen ? null : subject.key)} aria-expanded={isOpen}>
                                <span className="subject-color-swatch" aria-hidden="true" />
                                <span className="subject-color-name">{subject.name}</span>
                                {isCustom && <span className="subject-color-badge">Perso</span>}
                                <span className="subject-color-chevron" aria-hidden="true">›</span>
                            </button>
                            {error && <p className="subject-color-error" role="alert">{error}</p>}
                            {isOpen && (
                                <div className="subject-color-editor">
                                    <div className="subject-color-palette" role="group" aria-label={`Couleurs pour ${subject.name}`}>
                                        {QUICK_COLORS.map((quickColor) => {
                                            const takenBy = findColorConflict(quickColor, subject.key, effectiveColors);
                                            const selected = quickColor === color;
                                            return (
                                                <button
                                                    type="button"
                                                    key={quickColor}
                                                    className={`subject-color-choice${selected ? " selected" : ""}${takenBy ? " taken" : ""}`}
                                                    style={{ "--choice": quickColor }}
                                                    onClick={() => tryColor(subject.key, quickColor)}
                                                    disabled={Boolean(takenBy)}
                                                    aria-label={takenBy ? `Déjà utilisée par ${subjectNames[takenBy] ?? takenBy}` : `Choisir ${quickColor}`}
                                                    title={takenBy ? `Déjà utilisée par ${subjectNames[takenBy] ?? takenBy}` : quickColor}
                                                />
                                            );
                                        })}
                                    </div>
                                    <div className="subject-color-actions">
                                        <label className="subject-color-custom">
                                            <input
                                                type="color"
                                                value={color}
                                                onChange={(event) => tryColor(subject.key, event.target.value)}
                                            />
                                            <span>Autre couleur…</span>
                                        </label>
                                        {isCustom && <button type="button" className="subject-color-reset" onClick={() => resetColor(subject.key)}>Couleur d'origine</button>}
                                    </div>
                                </div>
                            )}
                        </li>
                    );
                })}
            </ul>
        </div>
    );
}
