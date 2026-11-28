import { useEffect, useRef, useContext } from "react";
import { Link } from "react-router-dom";


import Switch from "../../generic/UserInputs/Switch";
import InfoButton from "../../generic/Informative/InfoButton";
import SegmentedControl from "../../generic/UserInputs/SegmentedControl";
import DisplayThemeController from "../../generic/UserInputs/DisplayThemeController";
import NumberInput from "../../generic/UserInputs/NumberInput";
import Button from "../../generic/UserInputs/Button";
import KeyboardKey from "../../generic/KeyboardKey";
import StoreCallToAction from "../../generic/StoreCallToAction";
import { currentPeriodEvent } from "../../generic/events/setPeriodEvent";

import { AppContext } from "../../../App";
import { applyZoom, getZoomedBoudingClientRect } from "../../../utils/zoom";
import DropDownMenu from "../../generic/UserInputs/DropDownMenu";
import NotificationSettings from "./NotificationSettings";
import ConnectionSettings from "./ConnectionSettings";

import "./Settings.css";

// graphics
import RefreshIcon from "../../graphics/RefreshIcon";
import ToggleEnd from "../../graphics/ToggleEnd";

export default function Settings({ usersSettings, accountsList, getCurrentSchoolYear, resetUserData }) {
    const { isStandaloneApp, promptInstallPWA, useUserSettings, globalSettings, isTabletLayout } = useContext(AppContext);

    const partyModeCheckbox = useRef(null);
    const periodEventCheckbox = useRef(null);

    const settings = useUserSettings();
    const isPeriodEventEnabled = settings.get("isPeriodEventEnabled");
    
    useEffect(() => {
        document.title = "Paramètres • Ecole Directe Plus";
    }, []);

    const handleIsPeriodEventEnabledChange = (event) => {
        settings.set("isPeriodEventEnabled", event.target.checked);
        if (event.target.checked) {
            confettiAnimation();
        }
    };

    const handleGradeScaleEnableChange = () => {
        const newEnableValue = !settings.get("isGradeScaleEnabled");
        if (newEnableValue) {
            settings.set("gradeScale", settings.get("gradeScale") ? newEnableValue * settings.get("gradeScale") : newEnableValue * 20)
        }
        settings.set("isGradeScaleEnabled", newEnableValue);
    }

    const handleGradeScaleValueChange = (newValue) => {
        if (settings.get("gradeScale") !== newValue) {
            settings.set("isGradeScaleEnabled", !!parseInt(newValue));
        }
        settings.set("gradeScale", newValue);
    }

    const handleDevChannelSwitchingToggle = () => {
        globalSettings.isDevChannel.set(!globalSettings.isDevChannel.value);
    }

    const handleSchoolYearChange = (newValue, side) => {
        newValue = parseInt(newValue);
        settings.set("isSchoolYearEnabled", true);

        let schoolYear = structuredClone(settings.get("schoolYear"));
        if (side === 0) {
            schoolYear[0] = newValue;
            schoolYear[1] = newValue + 1;
        } else {
            schoolYear[1] = newValue;
            schoolYear[0] = newValue - 1;
        }

        resetUserData(false);
        settings.set("schoolYear", schoolYear)
    }

    function confettiAnimation() {
        const bounds = getZoomedBoudingClientRect(partyModeCheckbox.current.getBoundingClientRect());
        const origin = {
            x: bounds.left + 30 / 2,
            y: bounds.top + 30 / 2
        }
        confetti({
            particleCount: 40,
            spread: 70,
            origin: {
                x: origin.x / applyZoom(window.innerWidth),
                y: origin.y / applyZoom(window.innerHeight)
            },
        });
    }

    useEffect(() => {
        const script = document.createElement("script");

        script.src = "https://cdn.jsdelivr.net/npm/@tsparticles/confetti@3.0.3/tsparticles.confetti.bundle.min.js";
        script.async = true;

        document.body.appendChild(script);

        return () => {
            document.body.removeChild(script);
        }
    }, []);

    return (
        <div id="settings">
            <div id="settings-box">
                <h1>Paramètres</h1>

                {/* - - - Apparence - - - */}
                <section className="settings-section" id="appearance-settings">
                    <h2 className="heading">Apparence</h2>

                    <div className="setting" id="display-theme">
                        <span>Thème</span> <DisplayThemeController id="display-theme-sc" selected={settings.get("displayTheme")} onChange={(value) => { settings.set("displayTheme", value) }} fieldsetName="display-theme" />
                    </div>

                    <div className="setting" id="display-mode">
                        <div className="setting-label">
                            <span>Mode d'affichage</span>
                            <InfoButton className="setting-tooltip display-mode-ib">
                                <table id="demo-table">
                                    <thead>
                                        <tr>
                                            <th></th>
                                            <th className="column-header">Qualité</th>
                                            <th className="column-header">Équilibré</th>
                                            <th className="column-header">Performance</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        <tr>
                                            <th className="row-header">Coins arrondis</th>
                                            <td>Oui</td>
                                            <td>Oui</td>
                                            <td>Non</td>
                                        </tr>
                                        <tr>
                                            <th className="row-header">Ombres portées</th>
                                            <td>Oui</td>
                                            <td>Oui</td>
                                            <td>Non</td>
                                        </tr>
                                        <tr>
                                            <th className="row-header">Effets graphiques</th>
                                            <td>Oui</td>
                                            <td>Oui</td>
                                            <td>Non</td>
                                        </tr>
                                        <tr>
                                            <th className="row-header">Transitions</th>
                                            <td>Oui</td>
                                            <td>Non</td>
                                            <td>Non</td>
                                        </tr>
                                        <tr>
                                            <th className="row-header">Animations</th>
                                            <td>Oui</td>
                                            <td>Non</td>
                                            <td>Non</td>
                                        </tr>
                                    </tbody>
                                </table>
                            </InfoButton>
                        </div>
                        {isTabletLayout
                            ? <DropDownMenu id="display-mode-dd" name="display-mode-dm" options={settings.object("displayMode").values} displayedOptions={["Qualité", "Équilibré", "Performance"]} selected={settings.get("displayMode")} onChange={(value) => { settings.set("displayMode", value) }} />
                            : <SegmentedControl id="display-mode-sc" segments={settings.object("displayMode").values} displayedSegments={["Qualité", "Équilibré", "Performance"]} selected={settings.get("displayMode")} onChange={(value) => { settings.set("displayMode", value) }} fieldsetName="display-mode" />}
                    </div>

                    <div className="setting" id="period-event">
                        <Switch
                            id="period-event-cb"
                            ref={periodEventCheckbox}
                            label={<span>Thèmes saisonniers ✨</span>}
                            checked={isPeriodEventEnabled}
                            onChange={handleIsPeriodEventEnabledChange}
                        />
                    </div>

                    <div className="setting" id="party-mode">
                        <Switch id="party-mode-cb" ref={partyModeCheckbox} label={<span>Mode festif 🎉</span>} checked={settings.get("isPartyModeEnabled")} onChange={(event) => { settings.set("isPartyModeEnabled", event.target.checked); if (event.target.checked) { confettiAnimation() } }} />
                    </div>
                </section>

                {/* - - - Notes - - - */}
                <section className="settings-section" id="grades-settings">
                    <h2 className="heading">Notes</h2>

                    <div className="setting" id="grade-scale">
                        <Switch id="grade-scale-cb" label={<span>Tous les barèmes sur</span>} checked={!!settings.get("isGradeScaleEnabled")} onChange={handleGradeScaleEnableChange} />
                        <NumberInput min={settings.object("gradeScale").min} max={settings.object("gradeScale").max} value={settings.get("gradeScale")} onChange={handleGradeScaleValueChange} active={settings.get("isGradeScaleEnabled")} />
                    </div>
                </section>

                {/* - - - Accessibilite - - - */}
                <section className="settings-section" id="accessibility-settings">
                    <h2 className="heading">Accessibilité</h2>

                    <div className="setting" id="luciole-font">
                        <Switch id="luciole-font-cb" checked={settings.get("lucioleFont")} onChange={(event) => { settings.set("lucioleFont", event.target.checked) }} label={<span>Police Luciole (malvoyants)</span>} />
                    </div>

                    <div className="setting" id="high-contrast-filter">
                        <Switch id="high-contrast-filter-cb" label={<span>Contraste élevé</span>} checked={settings.get("isHighContrastEnabled")} onChange={(event) => { settings.set("isHighContrastEnabled", event.target.checked) }} />
                    </div>

                    <div className="setting" id="grayscale-filter">
                        <Switch id="grayscale-filter-cb" label={<span>Noir et blanc</span>} checked={settings.get("isGrayscaleEnabled")} onChange={(event) => { settings.set("isGrayscaleEnabled", event.target.checked) }} />
                    </div>

                    <div className="setting" id="sepia-filter">
                        <Switch id="sepia-filter-cb" label={<span>Filtre sépia</span>} checked={settings.get("isSepiaEnabled")} onChange={(event) => { settings.set("isSepiaEnabled", event.target.checked) }} />
                    </div>
                </section>

                {/* - - - Accueil et fenetres - - - */}
                <section className="settings-section" id="windows-settings">
                    <h2 className="heading">Accueil et fenêtres</h2>

                    <div className="setting" id="allow-windows-arrangement">
                        <Switch id="allow-windows-arrangement-cb" label={<span>Pouvoir réarranger les fenêtres</span>} checked={settings.get("allowWindowsArrangement")} onChange={(event) => settings.set("allowWindowsArrangement", event.target.checked)} />
                    </div>

                    <div className="setting" id="reset-windows-layouts">
                        <span>Agencement des fenêtres</span> <Button onClick={() => settings.set("windowArrangement", [])}>Réinitialiser</Button>
                    </div>
                </section>

                {/* - - - Confidentialite - - - */}
                <section className="settings-section" id="privacy-settings">
                    <h2 className="heading">Confidentialité</h2>

                    <div className="setting" id="photo-blur">
                        <Switch id="photo-blur-cb" label={<span>Flouter la photo de profil</span>} checked={settings.get("isPhotoBlurEnabled")} onChange={(event) => { settings.set("isPhotoBlurEnabled", event.target.checked) }} />
                    </div>

                    <div className="setting" id="streamer-mode">
                        <Switch id="streamer-mode-cb" label={<span>Mode streamer (bêta)</span>} checked={settings.get("isStreamerModeEnabled")} onChange={(event) => { settings.set("isStreamerModeEnabled", event.target.checked) }} /><InfoButton className="setting-tooltip">Anonymise les informations sensibles. Les données scolaires seront tout de même affichées. (Bêta : certaines informations qui devraient être masquées ne le seront peut-être pas.)</InfoButton>
                    </div>

                    <div className="setting" id="allow-anonymous-reports">
                        <Switch id="allow-anonymous-reports-cb" label={<span>Envoyer des rapports d'erreurs anonymes</span>} checked={settings.get("allowAnonymousReports")} onChange={(event) => settings.set("allowAnonymousReports", event.target.checked)} />
                    </div>
                </section>

                <ConnectionSettings />

                <NotificationSettings />

                {/* - - - Avance - - - */}
                <section className="settings-section" id="advanced-settings">
                    <h2 className="heading">Avancé</h2>

                    {accountsList.length > 1 ? <div className="setting" id="sync-settings">
                        <Switch id="synchronise-settings" label={<span>Mêmes paramètres pour tous les profils</span>} checked={globalSettings.shareSettings.value} onChange={() => { globalSettings.shareSettings.set(!globalSettings.shareSettings.value) }} /> <InfoButton className="setting-tooltip">Les paramètres seront synchronisés avec ceux du profil actif</InfoButton>
                    </div> : null}

                    <div className="setting" id="school-year">
                        <div className="setting-label">
                            <Switch id="school-year-cb" label={<span>Année scolaire (expérimental)</span>} checked={settings.get("isSchoolYearEnabled")} onChange={(event) => { settings.set("isSchoolYearEnabled", event.target.checked); resetUserData(false); }} />
                            <InfoButton className="school-year">Expérimental : permet d'obtenir les informations des années scolaires précédentes. Nous tentons de reconstruire les données perdues mais ne garantissons pas la véracité totale des informations</InfoButton>
                        </div>
                        <div id="shool-year-ni">
                            <NumberInput min={1999} max={getCurrentSchoolYear()[0]} value={settings.get("schoolYear")[0]} onChange={(value) => handleSchoolYearChange(value, 0)} active={settings.get("isSchoolYearEnabled")} displayArrowsControllers={false} /><span className="separator"> - </span><NumberInput min={1999} max={getCurrentSchoolYear()[1]} value={settings.get("schoolYear")[1]} onChange={(value) => handleSchoolYearChange(value, 1)} active={settings.get("isSchoolYearEnabled")} displayArrowsControllers={false} />
                        </div>
                    </div>

                    {/* prevent switching to dev channel only if installed as standalone app and on safari due to redirecting issues */}
                    <div className={`setting${isStandaloneApp ? " disabled" : ""}`} id="dev-channel">
                        <div className="setting-label">
                            <span>Canal {globalSettings.isDevChannel.value ? "développeur" : "stable"}</span>
                            <InfoButton className="setting-tooltip">Profitez des dernières fonctionnalités en avant première. Avertissement : ce canal peut être instable et susceptible de dysfonctionner. Signalez nous quelconque problème à travers la page de retour</InfoButton>
                        </div>
                        <Button onClick={handleDevChannelSwitchingToggle} className="toggle-button">Basculer<ToggleEnd /></Button>
                    </div>

                    {/^((?!chrome|android).)*safari/i.test(navigator.userAgent) && isStandaloneApp
                        ? <div className="setting" id="refresh-user-data">
                            <span>Informations</span> <Button onClick={resetUserData}>Rafraîchir</Button>
                        </div>
                        : null
                    }

                    <div className="setting" id="clear-local-storage">
                        <div className="setting-label">
                            <span>Effacer les données locales</span>
                            <InfoButton className="setting-tooltip">Efface toutes les données relatives à Ecole Directe Plus stockées sur votre appareil (action destructrice). Si vous rencontrez un problème, cela pourrait le résoudre. Il est recommandé de rafraichir la page (vous serez déconnecté)</InfoButton>
                        </div>
                        <div className="setting-actions">
                            <Button onClick={() => { localStorage.clear(); sessionStorage.clear() }}>Effacer</Button>
                            <Button onClick={() => location.reload()} title="Rafraîchir la page" className="refresh-button"><RefreshIcon /></Button>
                        </div>
                    </div>
                </section>

                {/* - - - Raccourcis clavier (ordinateur) - - - */}
                {!isTabletLayout && <section className="settings-section" id="shortcuts-settings">
                    <h2 className="heading">Raccourcis clavier</h2>

                    <div className="split-heading">
                        <hr />
                        <h3 className="heading">Navigation</h3>
                    </div>
                    <div className="shortcuts">
                        <div className="shortcut">
                            <span>Changer de page</span>
                            <div className="keys">
                                <KeyboardKey keyName="Control">Ctrl</KeyboardKey> <KeyboardKey keyName="Alt">Alt</KeyboardKey> <KeyboardKey keyName="ArrowLeft">←</KeyboardKey> / <KeyboardKey keyName="ArrowRight">→</KeyboardKey>
                            </div>
                        </div>
                        <div className="shortcut">
                            <span>Basculer sur la page #</span>
                            <div className="keys">
                                <KeyboardKey keyName="Control">Ctrl</KeyboardKey> <KeyboardKey keyName="Alt">Alt</KeyboardKey> <KeyboardKey keyName="NumLock">Num</KeyboardKey>
                            </div>
                        </div>
                        <div className="shortcut">
                            <span>Changer de compte</span>
                            <div className="keys">
                                <KeyboardKey keyName="Control">Ctrl</KeyboardKey> <KeyboardKey keyName="Alt">Alt</KeyboardKey> <KeyboardKey keyName="ArrowUp">↑</KeyboardKey> / <KeyboardKey keyName="ArrowDown">↓</KeyboardKey>
                            </div>
                        </div>
                        <div className="shortcut">
                            <span>Cibler le menu de navigation</span>
                            <div className="keys">
                                <KeyboardKey keyName="Control">Ctrl</KeyboardKey> <KeyboardKey keyName="Alt">Alt</KeyboardKey> <KeyboardKey keyName="m">M</KeyboardKey>
                            </div>
                        </div>
                    </div>

                    <div className="split-heading">
                        <hr />
                        <h3 className="heading">Apparence</h3>
                    </div>
                    <div className="shortcuts">
                        <div className="shortcut">
                            <span>Alterner le thème</span>
                            <div className="keys">
                                <KeyboardKey keyName="Control">Ctrl</KeyboardKey> <KeyboardKey keyName="Alt">Alt</KeyboardKey> <KeyboardKey keyName="t">T</KeyboardKey>
                            </div>
                        </div>
                        <div className="shortcut">
                            <span>Alterner le mode d'affichage</span>
                            <div className="keys">
                                <KeyboardKey keyName="Control">Ctrl</KeyboardKey> <KeyboardKey keyName="Alt">Alt</KeyboardKey> <KeyboardKey keyName="d">D</KeyboardKey>
                            </div>
                        </div>
                    </div>

                    <div className="split-heading">
                        <hr />
                        <h3 className="heading">Personnalisation</h3>
                    </div>
                    <div className="shortcuts">
                        <div className="shortcut">
                            <span>Basculer en plein écran</span>
                            <div className="keys">
                                <KeyboardKey keyName="Control">Ctrl</KeyboardKey> <KeyboardKey keyName="Alt">Alt</KeyboardKey> <KeyboardKey keyName="f">F</KeyboardKey>
                            </div>
                        </div>
                        <div className="shortcut">
                            <span>Redimensionner la BottomSheet</span>
                            <div className="keys-container">
                                <div className="keys">
                                    <KeyboardKey keyName="PageUp">PageHaut</KeyboardKey> / <KeyboardKey keyName="PageDown">PageBas</KeyboardKey>
                                </div>
                                <div className="keys">
                                    <KeyboardKey keyName="ArrowUp">↑</KeyboardKey> / <KeyboardKey keyName="ArrowDown">↓</KeyboardKey>
                                </div>
                                <div className="keys">
                                    <KeyboardKey keyName="Home">Début</KeyboardKey> / <KeyboardKey keyName="End">Fin</KeyboardKey>
                                </div>
                            </div>
                        </div>
                    </div>
                </section>}

                <p id="important-note">Ces paramètres sont exclusifs {usersSettings.syncNomDeDossierTier ? (globalSettings.shareSettings.value ? "à l'appareil et au compte" : "à l'appareil, au compte et au profil") : (globalSettings.shareSettings.value ? "au compte" : "au compte et au profil")} que vous utilisez en ce moment</p>
                {/* Install as application (iOS/Android/Windows) */}
                {!isStandaloneApp && promptInstallPWA !== null && <div className="setting" id="install-as-application-tutorials">
                    <StoreCallToAction companyLogoSRC="/images/apple-logo.svg" companyLogoAlt="Logo d'Apple" targetURL="https://www.clubic.com/tutoriels/article-889913-1-comment-ajouter-raccourci-web-page-accueil-iphone.html " />
                    <StoreCallToAction companyLogoSRC="/images/google-logo.svg" companyLogoAlt="Logo de Google" targetURL="https://www.nextpit.fr/comment-creer-applications-web-raccourcis-android" />
                    <StoreCallToAction companyLogoSRC="/images/microsoft-logo.svg" companyLogoAlt="Logo de Microsoft" targetURL="https://www.01net.com/astuces/windows-10-comment-transformer-vos-sites-web-preferes-en-applications-natives-1968951.html" />
                </div>}
                <div id="diverse-links">
                    <Link to="#patch-notes">Patch Notes</Link> • <Link to="#policy">Mentions légales</Link> • <Link to="/feedback">Faire un retour</Link> • <a href="https://github.com/Magic-Fishes/Ecole-Directe-Plus" target="_blank">Github</a> • <a href="https://discord.gg/AKAqXfTgvE" target="_blank">Discord</a>
                </div>
            </div>
        </div>
    )
}