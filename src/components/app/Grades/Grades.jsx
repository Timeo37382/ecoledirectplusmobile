import { useState, useRef, useEffect, useContext } from "react";
import { useLocation, useNavigate } from "react-router-dom";

import { AppContext } from "../../../App";
import BottomSheet from "../../generic/PopUps/BottomSheet";

import StreakScore from "./StreakScore";
import Information from "./Information";
import Strengths from "./Strengths";
import Results from "./Results";
import MobileResults from "./MobileResults";

import {
    WindowsContainer,
    WindowsLayout,
} from "../../generic/Window";

import "./Grades.css";
import DOMSimulation from "./GradeSimulation";

export default function Grades({ grades, fetchUserGrades, activeAccount, isLoggedIn, useUserData, sortGrades, isTabletLayout }) {
    const userData = useUserData();
    // Disposition empilee (<= 869px, telephone et tablette) : meme seuil que
    // l'empilement des fenetres dans Window.css.
    const { isTabletLayout: isMobileLayout } = useContext(AppContext);
    const location = useLocation();
    const navigate = useNavigate();

    const [selectedDisplayType, setSelectedDisplayType] = useState("Évaluations");
    const [selectedPeriod, setSelectedPeriod] = useState(userData.get("activePeriod"));

    const sortedGrades = userData.get("sortedGrades");

    useEffect(() => {
        setSelectedPeriod(userData.get("activePeriod"))
    }, [sortedGrades]);

    useEffect(() => {
        userData.set("activePeriod", selectedPeriod);
    }, [selectedPeriod])


    // Behavior
    useEffect(() => {
        document.title = "Notes • Ecole Directe Plus";
    }, [])

    useEffect(() => {
        const controller = new AbortController();
        if (isLoggedIn) {
            if (grades.length < 1 || grades[activeAccount] === undefined) {
                fetchUserGrades(controller);
            } else if (!sortedGrades) {
                sortGrades(grades, activeAccount);
            }
        }

        return () => {
            controller.abort();
        }
    }, [grades, isLoggedIn, activeAccount]);

    // Sur telephone, toucher une note remplissait le bloc "Informations" place
    // tout en haut de la page, hors de l'ecran : il ne se passait rien de
    // visible. On l'ouvre donc dans un panneau du bas des qu'une note est
    // selectionnee (l'ancre #<id> est posee par Grade.jsx).
    const isGradeSelected = !isNaN(parseInt(location.hash.slice(1)));

    const streakWindow = <StreakScore key="streak" streakScore={(sortedGrades && sortedGrades[selectedPeriod]?.streak) ?? 0} streakHighScore={(sortedGrades && sortedGrades[selectedPeriod]?.maxStreak) ?? 0} />;
    const strengthsWindow = <Strengths key="strengths" sortedGrades={sortedGrades} activeAccount={activeAccount} selectedPeriod={selectedPeriod} />;

    // JSX
    return (
        <div id="grades" className={isMobileLayout ? "mobile-grades" : ""}>
            <WindowsContainer name="grades">
                <WindowsLayout direction="row" ultimateContainer={true}>
                    <WindowsLayout direction="column">
                        {streakWindow}
                        {!isMobileLayout && <Information sortedGrades={sortedGrades} activeAccount={activeAccount} selectedPeriod={selectedPeriod} />}
                        {strengthsWindow}
                    </WindowsLayout>
                    <WindowsLayout growthFactor={2}>
                        <DOMSimulation>
                            {isTabletLayout
                                ? <MobileResults
                                    activeAccount={activeAccount}
                                    sortedGrades={sortedGrades}
                                    selectedPeriod={selectedPeriod}
                                    setSelectedPeriod={setSelectedPeriod}
                                    selectedDisplayType={selectedDisplayType}
                                    setSelectedDisplayType={setSelectedDisplayType} />
                                : <Results
                                    activeAccount={activeAccount}
                                    sortedGrades={sortedGrades}
                                    selectedPeriod={selectedPeriod}
                                    setSelectedPeriod={setSelectedPeriod}
                                    selectedDisplayType={selectedDisplayType}
                                    setSelectedDisplayType={setSelectedDisplayType} />
                            }
                        </DOMSimulation>
                    </WindowsLayout>
                </WindowsLayout>
                {isMobileLayout && isGradeSelected && (
                    <BottomSheet
                        className="grade-details-sheet"
                        heading="Détails de la note"
                        firstResizingBreakpoint={1}
                        onClose={() => navigate("#", { replace: true })}
                    >
                        <Information sortedGrades={sortedGrades} activeAccount={activeAccount} selectedPeriod={selectedPeriod} />
                    </BottomSheet>
                )}
            </WindowsContainer>
        </div>
    )
}
