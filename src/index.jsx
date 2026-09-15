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

async function edpFetch(url, fetchParams, dataType) {
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
