import { useContext, useEffect, useState } from "react";

import CheckBox from "../../generic/UserInputs/CheckBox";
import InfoButton from "../../generic/Informative/InfoButton";
import Button from "../../generic/UserInputs/Button";
import { AppContext } from "../../../App";
import {
    NOTIFICATION_TYPES,
    notificationPermission,
    requestNotificationPermission,
    sendTestNotification,
} from "../../../utils/notifications";
import { getPushSubscription, pushSupported, subscribePush, unsubscribePush, updatePushTypes } from "../../../utils/push";

const TEST_EVENTS = [
    { id: "test-grade", type: "grade", title: "Nouvelle note en Mathématiques", body: "17/20 · Contrôle de fonctions", path: "grades" },
    { id: "test-course", type: "course", title: "Cours annulé : Anglais", body: "Demain à 10h00", path: "timetable" },
];

const PERMISSION_TEXT = {
    granted: "Activées sur cet appareil",
    denied: "Bloquées : autorise-les dans les réglages du navigateur (cadenas à côté de l'adresse, ou infos de l'appli)",
    default: "Pas encore autorisées sur cet appareil",
    unsupported: "Ce navigateur ne gère pas les notifications",
};

export default function NotificationSettings() {
    const { useUserSettings, activeAccount, accountsListState, checkForUpdates, getPushCredentials } = useContext(AppContext);
    const settings = useUserSettings();
    const [permission, setPermission] = useState(notificationPermission);
    const [checkState, setCheckState] = useState("");
    // "unknown" | "off" | "on" | "working"
    const [pushState, setPushState] = useState("unknown");
    const [pushMessage, setPushMessage] = useState("");

    const enabledTypes = (overrides = {}) => NOTIFICATION_TYPES
        .filter(({ setting }) => (overrides[setting] ?? settings.get(setting)) !== false)
        .map(({ type }) => type);

    useEffect(() => {
        if (!pushSupported()) {
            setPushState("off");
            return;
        }
        getPushSubscription()
            .then((subscription) => setPushState(subscription ? "on" : "off"))
            .catch(() => setPushState("off"));
    }, []);

    const enable = async () => {
        const result = await requestNotificationPermission();
        setPermission(result);
        if (result === "granted") {
            sendTestNotification(activeAccount);
        }
    };

    // Test : l'ile en haut de l'ecran, et la notification du telephone si
    // elle est autorisee (la demande d'autorisation part de ce clic).
    const sendTest = async () => {
        window.dispatchEvent(new CustomEvent("edp-island-preview", { detail: TEST_EVENTS }));
        let current = permission;
        if (current === "default") {
            current = await requestNotificationPermission();
            setPermission(current);
        }
        if (current === "granted") {
            sendTestNotification(activeAccount);
        }
    };

    const togglePush = async (event) => {
        const wanted = event.target.checked;
        setPushState("working");
        setPushMessage("");
        try {
            if (wanted) {
                await subscribePush({
                    credentials: getPushCredentials(),
                    account: accountsListState[activeAccount],
                    accountIndex: activeAccount,
                    types: enabledTypes(),
                });
                setPermission(notificationPermission());
                setPushState("on");
                setPushMessage("Activé : tu recevras les nouveautés même appli fermée.");
            } else {
                await unsubscribePush();
                setPushState("off");
                setPushMessage("Désactivé : tes identifiants ont été supprimés du serveur.");
            }
        } catch (error) {
            setPushState(wanted ? "off" : "on");
            setPushMessage(error?.message || "Une erreur est survenue.");
        }
    };

    const toggleType = (setting, checked) => {
        settings.set(setting, checked);
        if (pushState === "on") {
            updatePushTypes(enabledTypes({ [setting]: checked })).catch(() => {
                setPushMessage("Préférence enregistrée ici, mais pas sur le serveur. Réessaie plus tard.");
            });
        }
    };

    const checkNow = async () => {
        setCheckState("En cours…");
        await checkForUpdates({ force: true });
        setCheckState("Vérifié à l'instant");
    };

    return (
        <div id="notification-settings">
            <h2 className="heading">Notifications</h2>

            <div className="setting" id="notification-permission">
                <div className="setting-label">
                    <span>Notifications du téléphone</span>
                    <InfoButton className="setting-tooltip">Quand l'appli est ouverte, EDP vérifie les nouveautés à l'ouverture, quand tu y reviens, puis toutes les 10 minutes. Les nouveautés s'affichent aussi en haut de l'écran et sur l'accueil.</InfoButton>
                </div>
                {permission !== "granted" && <Button onClick={enable} disabled={permission === "denied" || permission === "unsupported"}>Activer</Button>}
            </div>
            <p className={`notification-permission-state ${permission}`}>{PERMISSION_TEXT[permission] ?? ""}</p>

            <div className={`setting${!pushSupported() ? " disabled" : ""}`} id="push-notifications">
                <CheckBox
                    id="push-notifications-cb"
                    label={<span>Même quand l'appli est fermée</span>}
                    checked={pushState === "on" || pushState === "working"}
                    onChange={togglePush}
                />
                <InfoButton className="setting-tooltip">Le serveur d'EDP vérifie tes nouveautés toutes les 15 minutes environ. Pour ça, il garde ton identifiant et ton mot de passe EcoleDirecte, chiffrés. Décocher cette case les supprime du serveur.</InfoButton>
            </div>
            {(pushMessage || pushState === "working") && (
                <p className="notification-push-state">{pushState === "working" ? "Un instant…" : pushMessage}</p>
            )}

            <div className="setting" id="notification-guide">
                <div className="setting-label">
                    <span>Tu ne reçois rien appli fermée ?</span>
                    <InfoButton className="setting-tooltip">Certains téléphones (Xiaomi, Samsung, Huawei...) ferment le navigateur en arrière-plan et bloquent les notifications. Le guide montre les réglages à faire selon ton téléphone.</InfoButton>
                </div>
                <Button onClick={() => window.dispatchEvent(new Event("edp-open-notification-guide"))}>Guide</Button>
            </div>

            <div className="setting" id="test-notification">
                <div className="setting-label">
                    <span>Notification de test</span>
                </div>
                <Button onClick={sendTest}>Envoyer</Button>
            </div>

            {NOTIFICATION_TYPES.map(({ setting, label }) => (
                <div className="setting" id={`${setting}-setting`} key={setting}>
                    <CheckBox
                        id={`${setting}-cb`}
                        label={<span>{label}</span>}
                        checked={settings.get(setting) !== false}
                        onChange={(event) => toggleType(setting, event.target.checked)}
                    />
                </div>
            ))}

            <div className="setting" id="check-updates-now">
                <div className="setting-label">
                    <span>Vérifier les nouveautés maintenant</span>
                    {checkState && <span className="notification-check-state">{checkState}</span>}
                </div>
                <Button onClick={checkNow}>Vérifier</Button>
            </div>
        </div>
    );
}
