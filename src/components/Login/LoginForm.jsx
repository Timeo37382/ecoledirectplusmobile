
import { useState, useEffect, useRef } from "react";

import TextInput from "../generic/UserInputs/TextInput";
import CheckBox from "../generic/UserInputs/CheckBox";
import Button from "../generic/UserInputs/Button";
import { Tooltip, TooltipTrigger, TooltipContent } from "../generic/PopUps/Tooltip";
import { decrypt, encrypt } from "../../utils/utils"
import { readReloginToken } from "../../App"

import AccountIcon from "../graphics/AccountIcon"
import KeyIcon from "../graphics/KeyIcon"

import "./LoginForm.css";

// const lsIdName = encrypt("userIds")
const lsIdName = "encryptedUserIds"

// Reconnexion automatique : delais entre les essais quand le reseau ou le
// serveur ne repond pas (le telephone qui sort de veille, par exemple).
const AUTO_LOGIN_RETRY_DELAYS_MS = [3000, 10000, 30000, 60000];

const submitButtonAvailableStates = {
    "Connexion...": "submitting",
    "Connecté": "submitted",
    "Échec de la connexion": "invalid",
    "Invalide": "invalid"
}

export default function LoginForm({ keepLoggedIn, setKeepLoggedIn, A2FInfo, setRequireA2F, bufferUserIds, fetchLogin, logout, loginFromOldAuthInfo, disabledKeepLoggedInCheckBox=false, ...props }) {

    var submitButtonTextValue = "Se connecter";
    if (sessionStorage.getItem('april') === "true") {
        submitButtonTextValue = "Ok"
    }

    // States
    const [username, setUsername] = useState("");
    const [password, setPassword] = useState("");
    const [submitButtonText, setSubmitButtonText] = useState(submitButtonTextValue);
    const [errorMessage, setErrorMessage] = useState("");

    // Behavior
    const updateUsername = (event) => { setUsername(event.target.value); setSubmitButtonText(submitButtonTextValue) }
    const updatePassword = (event) => { setPassword(event.target.value); setSubmitButtonText(submitButtonTextValue) }
    const updateKeepLoggedIn = (event) => setKeepLoggedIn(event.target.checked);


    const retryCount = useRef(0);
    const retryTimer = useRef(null);
    useEffect(() => () => clearTimeout(retryTimer.current), []);

    // Connexion automatique (rester connecte, ou apres la double authentification).
    // On ne deconnecte que si EcoleDirecte refuse vraiment le mot de passe :
    // un souci de reseau ou de serveur garde les identifiants et reessaie.
    // Reconnexion par jeton (sans mot de passe) ; si EcoleDirecte refuse le
    // jeton, on repasse par le mot de passe enregistre.
    function loginWithToken(reloginToken, fallbackIds) {
        clearTimeout(retryTimer.current);
        setSubmitButtonText("Connexion...");
        setErrorMessage("");
        fetchLogin(null, null, true, (messages) => {
            if (submitButtonAvailableStates[messages.submitButtonText] !== "invalid") {
                setSubmitButtonText(messages.submitButtonText || "");
                retryCount.current = 0;
                return;
            }
            if (messages.reason === "token") {
                console.log("RELOGIN TOKEN REFUSED : FALLBACK TO PASSWORD");
                if (fallbackIds?.username && fallbackIds?.password) {
                    login(fallbackIds.username, fallbackIds.password, true);
                } else {
                    setSubmitButtonText(submitButtonTextValue);
                    setErrorMessage("Ta session a expiré, reconnecte-toi.");
                }
            } else if (retryCount.current < AUTO_LOGIN_RETRY_DELAYS_MS.length) {
                const delay = AUTO_LOGIN_RETRY_DELAYS_MS[retryCount.current];
                retryCount.current += 1;
                setSubmitButtonText(messages.submitButtonText || "");
                setErrorMessage(`${messages.submitErrorMessage || "Connexion impossible."} Nouvel essai dans ${Math.round(delay / 1000)} s…`);
                retryTimer.current = setTimeout(() => loginWithToken(reloginToken, fallbackIds), delay);
            }
        }, undefined, { reloginToken });
        console.log("LOGGED IN FROM RELOGIN TOKEN");
    }

    function login(username, password, keepLoggedIn=false) {
        clearTimeout(retryTimer.current);
        setSubmitButtonText("Connexion...");
        setErrorMessage("");
        fetchLogin(username, password, keepLoggedIn, (messages) => {
            setSubmitButtonText(messages.submitButtonText || "");
            setErrorMessage(messages.submitErrorMessage || "");
            if (submitButtonAvailableStates[messages.submitButtonText] !== "invalid") {
                retryCount.current = 0;
                return;
            }
            if (messages.reason === "credentials") {
                console.log("INVALID AUTH INFO : LOGGED OUT");
                logout();
            } else if ((messages.reason === "network" || messages.reason === "server") && retryCount.current < AUTO_LOGIN_RETRY_DELAYS_MS.length) {
                const delay = AUTO_LOGIN_RETRY_DELAYS_MS[retryCount.current];
                retryCount.current += 1;
                setErrorMessage(`${messages.submitErrorMessage || "Connexion impossible."} Nouvel essai dans ${Math.round(delay / 1000)} s…`);
                retryTimer.current = setTimeout(() => login(username, password, keepLoggedIn), delay);
            }
        });
        console.log("LOGGED IN FROM USERNAME & PASSWORD");
    }

    useEffect(() => {
        if (Object.keys(A2FInfo).length > 0) {
            const newA2FInfo = JSON.stringify(A2FInfo);
            if (!!bufferUserIds.username && !!bufferUserIds.password && newA2FInfo !== localStorage.getItem("A2FInfo")) {
                login(bufferUserIds.username, bufferUserIds.password, keepLoggedIn);
            }
            setRequireA2F(false);
            localStorage.setItem("A2FInfo", newA2FInfo);
        }
    }, [A2FInfo]);
    
    // Keep logged in OU reco car valid token
    useEffect(() => {
        // const keepLoggedIn = localStorage.getItem("keepLoggedIn") === "true";
        if (keepLoggedIn) {
            if (submitButtonText !== "Connexion...") {
                // keep logged in using credentials
                const userIdsFromLS = JSON.parse(decrypt(localStorage.getItem(lsIdName)) || "{}");
                const reloginToken = readReloginToken();

                if (reloginToken) {
                    loginWithToken(reloginToken, userIdsFromLS);
                } else if ( userIdsFromLS.username && userIdsFromLS.password ) {
                    login(userIdsFromLS.username, userIdsFromLS.password, true);
                }
            }
            
        } else {
            // keep logged in using old token
            const oldToken = localStorage.getItem("token") ?? "";
            const oldAccountsList = JSON.parse(localStorage.getItem("accountsList") ?? "[]");
            if (!!oldToken && oldToken !== "none" && oldAccountsList.length > 0) {
                loginFromOldAuthInfo(oldToken, oldAccountsList);
            }
        }

    }, [keepLoggedIn]);

    function handleSubmit(event) {
        event.preventDefault();
        // empêche la connexion si déjà connecté ou formulaire invalide
        //  || submitButtonAvailableStates[submitButtonText] === "invalid"
        if (submitButtonText === "Connecté") {
            return 0
        }
        // UI
        setSubmitButtonText("Connexion...");
        setErrorMessage("");

        // Process login
        // localStorage.setItem("keepLoggedIn", keepLoggedIn.toString());
        fetchLogin(username, password, keepLoggedIn, (messages) => {
            setSubmitButtonText(messages.submitButtonText);
            setErrorMessage(messages.submitErrorMessage || "");
        });
    }

    if (localStorage.userSettings) {
        if (((JSON.parse(localStorage.userSettings)[0].displayTheme) !== "dark") && (sessionStorage.getItem('april') === "true")) {
            document.body.setAttribute('style', 'background-color: white;')
        } else {
            document.body.style.backgroundColor = "" ;
        }
    } else {
        if ((document.documentElement.getAttribute('class').indexOf('dark') < 0) && (sessionStorage.getItem('april') === "true")) {
            document.body.setAttribute('style', 'background-color: white;')
        }
    }

    if (sessionStorage.getItem('april') === "true") {
        var passwordPlaceholder = "•••••••••••";
        var usernamelaceholder = "Nom d'Utilisateur";
    } else {
        var passwordPlaceholder = "Mot de passe";
        var usernamelaceholder = "Identifiant";
    }

    return (
        <form onSubmit={handleSubmit} {...props} id="login-form">
            <TextInput className="login-input" textType="text" placeholder={usernamelaceholder} autoComplete="username" value={username} icon={<AccountIcon />} onChange={updateUsername} isRequired={true} warningMessage="Veuillez entrer votre identifiant" onWarning={() => setSubmitButtonText("Invalide")} />
            <TextInput className="login-input" textType="password" placeholder={passwordPlaceholder} autoComplete="current-password" value={password} icon={<KeyIcon />} onChange={updatePassword} isRequired={true} warningMessage="Veuillez entrer votre mot de passe" onWarning={() => setSubmitButtonText("Invalide")} />
            {errorMessage && errorMessage === "accountCreationError" ? <p className="error-message">Vous n'avez pas encore créé votre compte EcoleDirecte ?!<br/>Rendez-vous sur le <a href="https://ecoledirecte.com/">site officiel</a> pour le configurer, nous vous attendons avec impatience !</p> : <p className="error-message">{errorMessage}</p>}
            <div className="login-option">
                <a id="password-forgotten-link" href="https://api.ecoledirecte.com/mot-de-passe-oublie.awp" target="blank">Mot de passe oublié ?</a>
            </div>
            <Button id="submit-login" state={submitButtonText && submitButtonAvailableStates[submitButtonText]} buttonType="submit" value={submitButtonText} />
        </form>
    )
}
