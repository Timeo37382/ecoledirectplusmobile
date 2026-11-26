import { StrictMode } from "react";
import { createRoot } from "react-dom/client"
import DOMNotification from "./components/generic/PopUps/Notification";
import App from "./App";
import { getOS } from "./utils/utils";
// import reportWebVitals from './reportWebVitals';

// import { HelmetProvider } from 'react-helmet';

/*
 * NOTE : un <iframe> cache (srcDoc + IframeRequestLinker) etait monte ici.
 *
 * Il n'etait plus utilise nulle part : edpFetch ci-dessous fait un fetch()
 * classique, et rien dans le projet ne se servait de `iframeRequest` en dehors
 * de sa propre instanciation. C'etait un vestige d'un ancien mecanisme de
 * requetes.
 *
 * Il fallait surtout le retirer parce qu'il faisait planter l'application
 * Android : le pont Android de Wry parse avec `http::Uri` chaque URL que le
 * WebView commence a charger, puis `unwrap()` le resultat. Un iframe en srcDoc
 * navigue vers `about:srcdoc`, une URL sans autorite que ce parseur refuse. Le
 * panic qui s'ensuit traverse une frontiere C, donc il ne peut pas se derouler :
 * le processus est abort (SIGABRT) et l'app se ferme.
 *
 * Le garde-fou complementaire est dans src-tauri/src/lib.rs (on_navigation).
 */

const splashScreen = document.getElementById("loading-start");

// Jeton du compte de demonstration (voir fakeLogin dans App.jsx).
const GUEST_TOKEN = "thisisafaketoken";

function isGuestRequest(fetchParams) {
    const headers = fetchParams?.headers;
    if (!headers) {
        return false;
    }
    const token = headers instanceof Headers ? headers.get("X-Token") : headers["X-Token"];
    return token === GUEST_TOKEN;
}

async function edpFetch(url, fetchParams, dataType) {
    // Le compte invite lit ses donnees dans src/data : inutile (et nuisible) de
    // contacter EcoleDirecte avec un faux jeton. Sans ce court-circuit, l'echec
    // de la requete laissait les pages en squelette de chargement et declenchait
    // la banniere "Installez EDP Unblock". Le code 49969 est celui que les
    // fonctions de fetch d'App.jsx reconnaissent comme "donnees invite".
    if (isGuestRequest(fetchParams)) {
        const fakeResponse = { code: 49969, token: GUEST_TOKEN, data: {} };
        return dataType === "json" ? fakeResponse : JSON.stringify(fakeResponse);
    }
    return fetch(url, fetchParams).then((response) => response[dataType]())
}

splashScreen?.classList.add("fade-out");
setTimeout(() => splashScreen?.remove(), 500);

createRoot(document.getElementById("root")).render(
    <StrictMode>
        <DOMNotification>
            {/* <HelmetProvider> */}
                <App edpFetch={edpFetch} />
            {/* </HelmetProvider> */}
        </DOMNotification>
    </StrictMode>
);

// reportWebVitals(console.log);
