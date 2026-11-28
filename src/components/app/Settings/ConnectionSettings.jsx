import { useState } from "react";

import InfoButton from "../../generic/Informative/InfoButton";
import { readReloginToken, RELOGIN_DIAG_KEY } from "../../../App";

function readDiagnostic() {
    try {
        return JSON.parse(localStorage.getItem(RELOGIN_DIAG_KEY) || "null");
    } catch {
        return null;
    }
}

// Explique en clair ce qu'EcoleDirecte a renvoye a la derniere connexion.
function describeDiagnostic(diag) {
    if (!diag) return "Pas encore de connexion analysée : ferme puis rouvre l'appli.";
    const when = new Date(diag.at).toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short" });
    if (diag.found) return `Dernière connexion (${when}) : jeton reçu.`;
    if (diag.field) return `Dernière connexion (${when}) : EcoleDirecte a envoyé un jeton vide.`;
    return `Dernière connexion (${when}) : EcoleDirecte n'a pas envoyé de jeton.`;
}

// Etat de la connexion permanente (reconnexion par jeton).
export default function ConnectionSettings() {
    const [hasToken] = useState(() => !!readReloginToken());
    const [diagnostic] = useState(readDiagnostic);

    return (
        <section className="settings-section" id="connection-settings">
            <h2 className="heading">Connexion</h2>

            <div className="setting" id="token-relogin">
                <div className="setting-label">
                    <span>Reconnexion sans mot de passe</span>
                    <InfoButton className="setting-tooltip">Comme l'appli officielle : à la connexion, EcoleDirecte donne un jeton qui permet ensuite de se reconnecter sans mot de passe ni double authentification. Si le jeton ne marche pas, l'appli utilise le mot de passe enregistré.</InfoButton>
                </div>
            </div>
            <p className={`connection-state ${hasToken ? "active" : "inactive"}`}>
                {hasToken
                    ? "Active : un jeton est enregistré sur ce téléphone."
                    : "Inactive pour l'instant : l'appli utilise le mot de passe enregistré. Ferme puis rouvre l'appli pour qu'elle demande un jeton."}
            </p>
            <p className="connection-diagnostic">{describeDiagnostic(diagnostic)}</p>
        </section>
    );
}
