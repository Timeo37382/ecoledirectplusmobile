import { useContext, useState } from "react";

import Button from "../../generic/UserInputs/Button";
import InfoButton from "../../generic/Informative/InfoButton";
import { AppContext, readReloginToken } from "../../../App";

// Etat de la connexion permanente, et test de la reconnexion par jeton
// (utile sur telephone, ou il n'y a pas d'outils de developpement).
export default function ConnectionSettings() {
    const { testTokenRelogin } = useContext(AppContext);
    const [hasToken, setHasToken] = useState(() => !!readReloginToken());
    const [result, setResult] = useState(null);
    const [testing, setTesting] = useState(false);

    const runTest = async () => {
        setTesting(true);
        setResult(null);
        const outcome = await testTokenRelogin();
        setResult(outcome);
        setHasToken(!!readReloginToken());
        setTesting(false);
    };

    return (
        <div id="connection-settings">
            <h2 className="heading">Connexion</h2>

            <div className="setting" id="token-relogin">
                <div className="setting-label">
                    <span>Reconnexion sans mot de passe</span>
                    <InfoButton className="setting-tooltip">Comme l'appli officielle : à la connexion, EcoleDirecte donne un jeton qui permet ensuite de se reconnecter sans mot de passe ni double authentification. Si le jeton ne marche pas, l'appli utilise le mot de passe enregistré.</InfoButton>
                </div>
                <Button onClick={runTest} disabled={testing || !hasToken}>{testing ? "Test…" : "Tester"}</Button>
            </div>
            <p className={`connection-state ${hasToken ? "active" : "inactive"}`}>
                {hasToken
                    ? "Active : un jeton est enregistré sur ce téléphone."
                    : "Inactive : EcoleDirecte n'a pas fourni de jeton à la dernière connexion. L'appli utilise le mot de passe enregistré."}
            </p>
            {result && (
                <p className={`connection-test-result ${result.ok ? "ok" : "error"}`}>
                    {result.ok ? "✓ " : "✗ "}
                    {result.message}
                    {!result.ok && result.code !== null && ` (code ${result.code})`}
                </p>
            )}
        </div>
    );
}
