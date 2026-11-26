
import { useEffect } from "react";
import { useNavigate, useLocation } from "react-router-dom";

import {
    WindowsContainer,
    WindowsLayout,
    Window,
    WindowHeader,
    WindowContent
} from "../../generic/Window";
import LastGrades from "./LastGrades";
import TodayTimetable from "./TodayTimetable";
import Notebook from "../Homeworks/Notebook";
import BottomSheet from "../../generic/PopUps/BottomSheet";
import EncodedHTMLDiv from "../../generic/CustomDivs/EncodedHTMLDiv";
import UpcomingAssignments from "../Homeworks/UpcomingAssignments";
import PopUp from "../../generic/PopUps/PopUp";

import "./Dashboard.css";
import { formatDateRelative } from "../../../utils/date";
import FileComponent from "../../generic/FileComponent";

export default function Dashboard({ fetchUserGrades, grades, fetchHomeworks, activeAccount, isLoggedIn, useUserData, sortGrades, isTabletLayout, fetchTimetable, accountId }) {
    const navigate = useNavigate();
    const userData = useUserData();
    const location = useLocation()

    const sortedGrades = userData.get("sortedGrades");
    const homeworks = useUserData("sortedHomeworks");

    const hashParameters = location.hash.split(";")
    const selectedTask = hashParameters.length > 1 && homeworks.get() && homeworks.get()[hashParameters[0].slice(1)]?.find(e => e.id == hashParameters[1])

    // Behavior
    useEffect(() => {
        document.title = "Accueil • Ecole Directe Plus";
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

    useEffect(() => {
        const controller = new AbortController();
        if (isLoggedIn) {
            if (homeworks.get() === undefined) {
                fetchHomeworks(controller);
            }
        }

        return () => {
            controller.abort();
        }
    }, [homeworks.get(), isLoggedIn, activeAccount]);

    useEffect(() => {
        if (hashParameters.length > 2 && (hashParameters[2] === "s" && !selectedTask?.sessionContent)) {
            navigate(`${hashParameters[0]};${hashParameters[1]}`, { replace: true })
        }
    }, [location.hash])

    const timetableWindow = (
        <Window className="today-timetable-window">
            <WindowHeader onClick={() => navigate("../timetable")}>
                <h2>Emploi du temps</h2>
            </WindowHeader>
            <WindowContent>
                <TodayTimetable activeAccount={activeAccount} accountId={accountId} isLoggedIn={isLoggedIn} fetchTimetable={fetchTimetable} />
            </WindowContent>
        </Window>
    );

    const upcomingAssignmentsWindow = (
        <Window>
            <WindowHeader onClick={() => navigate("../homeworks")}>
                <h2>Prochains devoirs surveillés</h2>
            </WindowHeader>
            <WindowContent className="upcoming-assignments-container">
                <UpcomingAssignments homeworks={homeworks} />
            </WindowContent>
        </Window>
    );

    const notebookWindow = (
        <Window growthFactor={1.7} className="notebook-window">
            <WindowHeader onClick={() => navigate("../homeworks")}>
                <h2>Cahier de texte</h2>
            </WindowHeader>
            <WindowContent id="notebook">
                <Notebook hideDateController={!isTabletLayout} />
            </WindowContent>
        </Window>
    );

    // JSX DISCODO
    return (
        <div id="dashboard">
            <WindowsContainer name="dashboard">
                {isTabletLayout
                    // Telephone / tablette : une seule colonne, du plus urgent au moins urgent.
                    ? <WindowsLayout direction="column" ultimateContainer={true}>
                        {timetableWindow}
                        {upcomingAssignmentsWindow}
                        {notebookWindow}
                        <LastGrades activeAccount={activeAccount} />
                    </WindowsLayout>
                    : <WindowsLayout direction="row" ultimateContainer={true}>
                        <WindowsLayout direction="column" growthFactor={2.5}>
                            <WindowsLayout direction="row">
                                <LastGrades activeAccount={activeAccount} />
                                {upcomingAssignmentsWindow}
                            </WindowsLayout>
                            {notebookWindow}
                        </WindowsLayout>
                        <WindowsLayout>
                            {timetableWindow}
                        </WindowsLayout>
                    </WindowsLayout>}
            </WindowsContainer>
            {(hashParameters.length > 2 && hashParameters[2] === "s" && selectedTask) && <BottomSheet heading="Contenu de séance" onClose={() => { navigate(`${hashParameters[0]};${hashParameters[1]}`, { replace: true }) }}>
                <EncodedHTMLDiv>{selectedTask.sessionContent}</EncodedHTMLDiv>
            </BottomSheet>}
            {(hashParameters.length > 2 && hashParameters[2] === "f" && selectedTask) && <PopUp className="task-file-pop-up" onClose={() => { navigate(`${hashParameters[0]};${hashParameters[1]}`, { replace: true }) }}>
            <div className="header-container">
                    <h2 className="file-title">Fichiers joints</h2>
                    <p className="file-subject">{selectedTask.subject} • {formatDateRelative(new Date(selectedTask.addDate))}</p>
                </div>
                <div className="file-scroller">
                    <div className="file-wrapper">
                        <p className="file-subject">Note : maintenir pour télécharger</p>
                        {selectedTask.type === "task"
                            ? selectedTask.files.map((file) => <FileComponent key={file.id} file={file} />)
                            : selectedTask.sessionContentFiles.map((file) => <FileComponent key={file.id} file={file} />)}
                    </div>
                </div>
            </PopUp>}
        </div>
    )
}