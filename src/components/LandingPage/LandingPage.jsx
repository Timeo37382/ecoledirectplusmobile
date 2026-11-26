import { useContext, useEffect, useState } from "react";
import { Link } from "react-router-dom";

import { AppContext } from "../../App";
import { currentPeriodEvent } from "../generic/events/setPeriodEvent";
import Snowfall from "../generic/events/christmas/Snowfall";
import EDPLogo from "../graphics/EDPLogo";

import "./LandingPage.css";
import "../generic/events/christmas/snow.css";

// Projet d'origine dont cette version mobile est derivee.
const ORIGINAL_EDP_URL = "https://ecole-directe.plus";

export default function LandingPage({ token, accountsList }) {
    const { isMobileLayout, isTabletLayout, actualDisplayTheme, useUserSettings } = useContext(AppContext);

    const [isLoggedIn, setIsLoggedIn] = useState(token && accountsList.length > 0);

    const settings = useUserSettings();
    const theme = useUserSettings("displayTheme");

    const isChristmas = settings.get("isPartyModeEnabled") && settings.get("isPeriodEventEnabled") && currentPeriodEvent === "christmas";

    const changeTheme = () => {
        theme.set(actualDisplayTheme === "light" ? "dark" : "light");
    };

    useEffect(() => {
        setIsLoggedIn(token && accountsList.length > 0);
    }, [token, accountsList]);

    useEffect(() => {
        document.title = "Ecole Directe Plus Mobile";
    }, []);

    const previewImage = isTabletLayout
        ? (isMobileLayout ? `/images/EDP-preview-mobile-${actualDisplayTheme}.jpeg` : `/images/EDP-preview-tablet-${actualDisplayTheme}.jpeg`)
        : `/images/EDP-preview-${actualDisplayTheme}.jpeg`;

    return (
        <div className="landing-page minimal-landing">
            <header id="nav-bar" className="top-section">
                <span className={`nav-logo ${isChristmas ? "snowy-element" : ""}`}>
                    <EDPLogo className="landing-logo" id="outside-container" alt="Logo Ecole Directe Plus" />
                    <span className="nav-logo-text">
                        Ecole Directe Plus<span className="nav-logo-mobile"> Mobile</span>
                    </span>
                </span>
                <div className="nav-buttons">
                    <Link className={`nav-login ${isChristmas ? "snowy-element" : ""}`} to={isLoggedIn ? "/app" : "/login"}>{isLoggedIn ? "Ouvrir l'app" : "Se connecter"}</Link>
                    <button className="change-theme" onClick={changeTheme} aria-label="Changer de thème" />
                </div>
            </header>

            {isChristmas && <Snowfall />}

            <section id="home">
                <div className="text-center">
                    <h1>Ecole Directe Plus <strong className="heading-emphasis">Mobile</strong></h1>
                    <p className="hero-subtitle">
                        Version mobile d'<a href={ORIGINAL_EDP_URL} target="_blank" rel="noopener noreferrer" className="original-edp-link">Ecole Directe Plus</a> — l'interface non-officielle d'EcoleDirecte repensée pour votre téléphone.
                    </p>
                    <p className="hero-description">
                        Consultez vos notes, devoirs et emploi du temps depuis n'importe quel appareil, avec une expérience adaptée aux petits écrans. Ce projet est un fork mobile du projet original, disponible sur <a href={ORIGINAL_EDP_URL} target="_blank" rel="noopener noreferrer" className="original-edp-link">ecole-directe.plus</a>.
                    </p>
                    <Link to={isLoggedIn ? "/app" : "/login"} className="login-call-to-action">{isLoggedIn ? "Ouvrir l'app" : "Se connecter"}</Link>
                </div>
                <div className="phone-mockup-wrapper">
                    <div className="phone-mockup">
                        <div className="phone-frame">
                            <div className="phone-buttons">
                                <span className="btn-vol" />
                                <span className="btn-vol" />
                            </div>
                            <div className="phone-screen">
                                <div className="phone-notch">
                                    <span className="notch-camera" />
                                </div>
                                <img
                                    src={`/images/EDP-preview-mobile-${actualDisplayTheme}.jpeg`}
                                    alt="Aperçu de l'application"
                                    className="phone-screenshot"
                                />
                            </div>
                        </div>
                    </div>
                    <div className="phone-glow" />
                </div>
            </section>
        </div>
    );
}
