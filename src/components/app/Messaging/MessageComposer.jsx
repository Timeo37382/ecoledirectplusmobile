import { useState, useEffect, useRef, useMemo } from "react";

import { removeAccents } from "../../../utils/utils";

import "./MessageComposer.css";

const CONTACT_KINDS = {
    professeurs: { label: "Professeurs", type: "P" },
    personnels: { label: "Personnel", type: "A" },
};

function escapeHTML(text) {
    return text
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");
}

// Texte saisi -> HTML attendu par EcoleDirecte : paragraphes et retours a la ligne.
function textToHTML(text) {
    return text
        .trim()
        .split(/\n{2,}/)
        .map((paragraph) => `<p>${escapeHTML(paragraph).replace(/\n/g, "<br>")}</p>`)
        .join("");
}

function contactName(contact) {
    return [contact.civilite, contact.prenom, contact.particule, contact.nom].filter(Boolean).join(" ");
}

function contactDetail(contact) {
    if (contact.fonction?.libelle) {
        return contact.fonction.libelle;
    }
    if (contact.matiere) {
        return contact.matiere;
    }
    const subjects = (contact.classes ?? []).map((item) => item.matiere).filter(Boolean);
    return [...new Set(subjects)].join(", ");
}

/**
 * Fenetre d'ecriture d'un message (nouveau message ou reponse).
 *
 * Aucune requete d'envoi ne part sans action explicite : "Envoyer" demande une
 * confirmation au second appui, "Brouillon" enregistre sans envoyer.
 */
export default function MessageComposer({ draft, allowedKinds, fetchMessageContacts, sendMessage, onClose, onDone }) {
    const [recipients, setRecipients] = useState(draft.recipients ?? []);
    const [subject, setSubject] = useState(draft.subject ?? "");
    const [body, setBody] = useState("");
    const [isPickerOpen, setIsPickerOpen] = useState((draft.recipients ?? []).length === 0);
    const [activeKind, setActiveKind] = useState(allowedKinds[0]);
    const [contacts, setContacts] = useState({});
    const [contactsError, setContactsError] = useState("");
    const [search, setSearch] = useState("");
    const [status, setStatus] = useState({ state: "idle", message: "" }); // idle | confirm | sending | error
    const confirmTimer = useRef(null);

    // Chargement de la liste de contacts (une fois par categorie, filtrage local).
    useEffect(() => {
        if (!isPickerOpen || !activeKind || contacts[activeKind] !== undefined) {
            return;
        }
        const controller = new AbortController();
        setContactsError("");
        fetchMessageContacts(activeKind, "", controller)
            .then((list) => setContacts((old) => ({ ...old, [activeKind]: list })))
            .catch((error) => {
                if (error.name === "AbortError") {
                    return;
                }
                setContactsError(error.message === "NO_CLASS_ID"
                    ? "Déconnectez-vous puis reconnectez-vous pour pouvoir chercher vos professeurs."
                    : "La liste des contacts n'a pas pu être chargée.");
            });
        return () => controller.abort();
    }, [isPickerOpen, activeKind]);

    useEffect(() => () => clearTimeout(confirmTimer.current), []);

    const filteredContacts = useMemo(() => {
        const list = contacts[activeKind] ?? [];
        const query = removeAccents(search.trim().toLowerCase());
        if (!query) {
            return list;
        }
        return list.filter((contact) => removeAccents(`${contactName(contact)} ${contactDetail(contact)}`.toLowerCase()).includes(query));
    }, [contacts, activeKind, search]);

    const isSelected = (contact, type) => recipients.some((item) => item.id === contact.id && item.type === type);

    const toggleRecipient = (contact) => {
        const type = contact.type ?? CONTACT_KINDS[activeKind].type;
        setRecipients((old) => isSelected(contact, type)
            ? old.filter((item) => !(item.id === contact.id && item.type === type))
            : [...old, { ...contact, type }]);
        resetConfirm();
    };

    const removeRecipient = (recipient) => {
        setRecipients((old) => old.filter((item) => item !== recipient));
        resetConfirm();
    };

    // Toute modification annule une confirmation en attente et efface l'erreur
    // affichee (elle portait sur l'etat precedent).
    function resetConfirm() {
        clearTimeout(confirmTimer.current);
        setStatus((old) => (old.state === "confirm" || old.state === "error") ? { state: "idle", message: "" } : old);
    }

    const validationError = recipients.length === 0
        ? "Choisissez au moins un destinataire."
        : !subject.trim()
            ? "Ajoutez un objet."
            : !body.trim()
                ? "Écrivez votre message."
                : "";

    async function submit(isDraft) {
        if (validationError && !isDraft) {
            setStatus({ state: "error", message: validationError });
            return;
        }
        if (isDraft && recipients.length === 0) {
            setStatus({ state: "error", message: "Choisissez au moins un destinataire pour enregistrer le brouillon." });
            return;
        }
        if (!isDraft && status.state !== "confirm") {
            // Premier appui : demande de confirmation, valable quelques secondes.
            setStatus({ state: "confirm", message: "" });
            clearTimeout(confirmTimer.current);
            confirmTimer.current = setTimeout(() => setStatus({ state: "idle", message: "" }), 8000);
            return;
        }
        clearTimeout(confirmTimer.current);
        setStatus({ state: "sending", message: "" });

        const htmlContent = textToHTML(body) + (draft.quotedHTML ?? "");
        const result = await sendMessage({
            subject: subject.trim(),
            htmlContent,
            recipients,
            responseId: draft.responseId,
            isDraft,
        });

        if (result.ok) {
            onDone({ isDraft, guest: result.guest });
        } else {
            setStatus({ state: "error", message: result.message });
        }
    }

    const isBusy = status.state === "sending";

    return (
        <form className="message-composer" onSubmit={(event) => { event.preventDefault(); submit(false); }}>
            <div className="composer-field composer-recipients" style={{ "--order": 0 }}>
                <span className="composer-label">À</span>
                <div className="composer-recipient-list">
                    {recipients.map((recipient) => (
                        <span className="composer-chip" key={`${recipient.type}-${recipient.id}`}>
                            {contactName(recipient)}
                            <button type="button" onClick={() => removeRecipient(recipient)} aria-label={`Retirer ${contactName(recipient)}`} disabled={isBusy}>✕</button>
                        </span>
                    ))}
                    {allowedKinds.length > 0 && (
                        <button type="button" className="composer-add-recipient" onClick={() => setIsPickerOpen((old) => !old)} disabled={isBusy} aria-expanded={isPickerOpen}>
                            {isPickerOpen ? "Fermer" : "+ Ajouter"}
                        </button>
                    )}
                </div>
            </div>

            {isPickerOpen && (
                <div className="composer-picker" style={{ "--order": 1 }}>
                    {allowedKinds.length > 1 && (
                        <div className="composer-picker-tabs" role="tablist">
                            {allowedKinds.map((kind) => (
                                <button type="button" role="tab" key={kind} aria-selected={kind === activeKind} className={kind === activeKind ? "active" : ""} onClick={() => { setActiveKind(kind); setSearch(""); }}>
                                    {CONTACT_KINDS[kind].label}
                                </button>
                            ))}
                        </div>
                    )}
                    <input
                        type="search"
                        className="composer-input composer-picker-search"
                        placeholder="Rechercher un nom, une matière…"
                        value={search}
                        onChange={(event) => setSearch(event.target.value)}
                    />
                    <ul className="composer-picker-results" key={activeKind /* rejoue la cascade a chaque onglet */}>
                        {contactsError
                            ? <li className="composer-picker-info error">{contactsError}</li>
                            : contacts[activeKind] === undefined
                                ? <li className="composer-picker-info">Chargement des contacts…</li>
                                : filteredContacts.length === 0
                                    ? <li className="composer-picker-info">Aucun contact trouvé.</li>
                                    : filteredContacts.map((contact, index) => {
                                        const type = contact.type ?? CONTACT_KINDS[activeKind].type;
                                        const selected = isSelected(contact, type);
                                        return (
                                            <li key={`${type}-${contact.id}`} style={{ "--order": Math.min(index, 12) }}>
                                                <button type="button" className={"composer-contact" + (selected ? " selected" : "")} onClick={() => toggleRecipient(contact)} aria-pressed={selected}>
                                                    <span className="composer-contact-check" aria-hidden="true">{selected && <span className="composer-check-mark">✓</span>}</span>
                                                    <span className="composer-contact-text">
                                                        <span className="composer-contact-name">{contactName(contact)}{contact.isPP ? " · prof. principal" : ""}</span>
                                                        {contactDetail(contact) && <span className="composer-contact-detail">{contactDetail(contact)}</span>}
                                                    </span>
                                                </button>
                                            </li>
                                        );
                                    })}
                    </ul>
                </div>
            )}

            <label className="composer-field" style={{ "--order": 2 }}>
                <span className="composer-label">Objet</span>
                <input
                    type="text"
                    className="composer-input"
                    value={subject}
                    maxLength={200}
                    onChange={(event) => { setSubject(event.target.value); resetConfirm(); }}
                    disabled={isBusy}
                />
            </label>

            <label className="composer-field composer-body-field" style={{ "--order": 3 }}>
                <span className="composer-label">Message</span>
                <textarea
                    className="composer-input composer-body"
                    value={body}
                    rows={8}
                    onChange={(event) => { setBody(event.target.value); resetConfirm(); }}
                    disabled={isBusy}
                    placeholder="Bonjour,"
                />
            </label>

            {draft.quotedHTML && <p className="composer-quote-note">Le message d'origine sera cité sous votre réponse.</p>}

            <div className="composer-actions" style={{ "--order": 4 }}>
                <button type="button" className="composer-button secondary" onClick={onClose} disabled={isBusy}>Annuler</button>
                <button type="button" className="composer-button secondary" onClick={() => submit(true)} disabled={isBusy}>Brouillon</button>
                <button type="submit" className={"composer-button primary" + (status.state === "confirm" ? " confirm" : "")} disabled={isBusy}>
                    {/* key : le libelle rejoue son animation a chaque changement d'etat */}
                    <span className="composer-button-label" key={status.state === "confirm" ? "confirm" : isBusy ? "busy" : "idle"}>
                        {isBusy ? "Envoi…" : status.state === "confirm" ? "Confirmer l'envoi" : "Envoyer"}
                    </span>
                </button>
            </div>

            {/* Sous les boutons : l'apparition ou la disparition d'un message ne
                doit jamais deplacer le bouton qu'on s'apprete a toucher. */}
            {status.state === "error" && <p className="composer-status error" role="alert">{status.message}</p>}
            {status.state === "confirm" && <p className="composer-status confirm" role="status">Appuyez à nouveau sur « Confirmer l'envoi » pour envoyer le message.</p>}
        </form>
    );
}
