import { useState } from "react";

import PopUp from "../generic/PopUps/PopUp";
import Button from "../generic/UserInputs/Button";

import "./LoginDisclaimer.css";

// Avertissement montre une seule fois, au premier lancement, avant la
// premiere connexion.
const DISCLAIMER_KEY = "edp-login-disclaimer-seen";

export function shouldShowLoginDisclaimer() {
    return !localStorage.getItem(DISCLAIMER_KEY);
}

export default function LoginDisclaimer({ onClose }) {
    const [closing, setClosing] = useState(false);

    const acknowledge = () => {
        localStorage.setItem(DISCLAIMER_KEY, "1");
        // La pop-up d'installation attend ce signal pour s'afficher.
        window.dispatchEvent(new Event("edp-login-disclaimer-closed"));
        onClose();
    };

    return (
        <PopUp className="login-disclaimer" type="info" defaultClosingCross={false} externalClosing={closing} onClose={acknowledge}>
            <h2 className="login-disclaimer-title">Avant de commencer</h2>
            <ul className="login-disclaimer-list">
                <li>
                    <strong>Projet indépendant.</strong> Cette appli n'est affiliée ni à Aplim, l'éditeur d'EcoleDirecte, ni à l'équipe officielle d'Ecole Directe Plus.
                </li>
                <li>
                    <strong>Tes identifiants passent par notre serveur</strong>, qui les transmet à EcoleDirecte pour te connecter. Les échanges sont chiffrés (HTTPS) et le serveur ne les enregistre pas.
                </li>
                <li>
                    <strong>Pour que tu restes connecté</strong>, ils sont gardés chiffrés sur ton téléphone.
                </li>
                <li>
                    <strong>Notifications appli fermée</strong> (option dans les paramètres) : tes identifiants sont alors stockés chiffrés sur notre serveur. Désactiver l'option les supprime.
                </li>
            </ul>
            <Button className="login-disclaimer-button" onClick={() => setClosing(true)}>J'ai compris</Button>
        </PopUp>
    );
}
