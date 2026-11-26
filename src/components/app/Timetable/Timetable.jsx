import { useContext, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import {
    addDays,
    addWeeks,
    format,
    isSameDay,
    isSameMonth,
    isSameWeek,
    startOfDay,
    startOfWeek,
} from "date-fns";
import { fr } from "date-fns/locale";

import {
    WindowsContainer,
    WindowsLayout,
    Window,
    WindowHeader,
    WindowContent,
} from "../../generic/Window";
import BottomSheet from "../../generic/PopUps/BottomSheet";
import EncodedHTMLDiv from "../../generic/CustomDivs/EncodedHTMLDiv";
import FileComponent from "../../generic/FileComponent";
import InfoButton from "../../generic/Informative/InfoButton";

import "./Timetable.css";
import { anonymizeTeacher, textToHSL } from "../../../utils/utils";
import WalkingCanardman from "../../graphics/WalkingCanardman";
import { AppContext } from "../../../App";

const WEEK_DAYS = 7;
const THREE_DAY_WINDOW = 3;
const SINGLE_DAY_WINDOW = 1;
const PHONE_MAX_WIDTH = 450;
const SWIPE_MIN_DISTANCE = 60;
const DEFAULT_START_MINUTES = 8 * 60;
const DEFAULT_END_MINUTES = 18 * 60;
const TIME_OFFSET_MINUTES = 30;
const TIME_STEP_MINUTES = 30;
const HOUR_HEIGHT = 56; // TODO: taille dynamique dépendante de la hauteur de l'écran
// Vue Jour : une seule colonne pleine largeur, on peut se permettre des cours
// plus hauts pour afficher salle et professeur meme sur un cours d'une heure.
const DAY_VIEW_HOUR_HEIGHT = 80;
// Semaine sur telephone : la journee entiere doit tenir sur un ecran.
const COMPACT_WEEK_HOUR_HEIGHT = 44;

const VIEW_MODES = [
    { id: "day", label: "Jour", length: SINGLE_DAY_WINDOW },
    { id: "three-day", label: "3 jours", length: THREE_DAY_WINDOW },
    { id: "week", label: "Semaine", length: WEEK_DAYS },
];

function isWeekend(date) {
    const weekDay = date.getDay();
    return weekDay === 0 || weekDay === 6;
}
const IDLE_COURSEWORK = { status: "idle", items: [], error: "" };

function dateKey(date) {
    return format(date, "yyyy-MM-dd");
}

function parseApiDate(value) {
    if (value instanceof Date) {
        return value;
    }

    const match = String(value ?? "").match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})/);
    if (!match) {
        return new Date(NaN);
    }

    return new Date(
        Number(match[1]),
        Number(match[2]) - 1,
        Number(match[3]),
        Number(match[4]),
        Number(match[5]),
    );
}

function safeColor(value) {
    const color = String(value ?? "").trim();
    if (/^#[0-9a-f]{6}$/i.test(color)) {
        return color;
    }
    if (/^[0-9a-f]{6}$/i.test(color)) {
        return `#${color}`;
    }
    return "#5965d8";
}

function apiBoolean(value) {
    return value === true || value === 1 || value === "1" || value === "true";
}

function normalizeCourse(course) {
    const start = parseApiDate(course.start_date);
    const end = parseApiDate(course.end_date);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end <= start) {
        return null;
    }

    const isCancelled = apiBoolean(course.isAnnule ?? course.isCancelled ?? course.annule);
    const isModified = apiBoolean(course.isModifie ?? course.isModified ?? course.modifie);
    const isExempted = Number(course.dispense) > 0;
    const homeworkSummary = Array.isArray(course.homeworkSummary) ? course.homeworkSummary : [];
    const hasHomework = apiBoolean(course.devoirAFaire) || homeworkSummary.length > 0;
    const hasSessionContent = apiBoolean(course.contenuDeSeance);

    return {
        ...course,
        id: course.id ?? `${start.toISOString()}-${course.codeMatiere}`,
        subject: String(course.matiere || course.text || "Évènement").trim(),
        teacher: String(course.prof || "Professeur non renseigné").trim(),
        room: String(course.salle || "Salle non renseignée").trim(),
        group: String(course.groupe || course.classe || "Groupe non renseigné").trim(),
        start,
        end,
        color: safeColor(course.color),
        // color: `hsl(${textToHSL(course.codeMatiere)[0]}, ${textToHSL(course.codeMatiere)[1]}%, ${textToHSL(course.codeMatiere)[2]}%)`,
        isCancelled,
        isModified,
        isExempted,
        devoirAFaire: hasHomework,
        contenuDeSeance: hasSessionContent,
        homeworkDone: hasHomework && apiBoolean(course.homeworkDone),
        homeworkSummary,
        status: isCancelled
            ? "Cours annulé"
            : isExempted
                ? "Dispense"
                : isModified
                    ? "Cours modifié"
                    : "Cours maintenu",
    };
}

function minutesSinceMidnight(date) {
    return date.getHours() * 60 + date.getMinutes();
}

function formatDuration(minutes) {
    const hours = Math.floor(minutes / 60);
    const remaining = minutes % 60;
    if (hours === 0) return `${remaining} min`;
    if (remaining === 0) return `${hours} h`;
    return `${hours} h ${String(remaining).padStart(2, "0")}`;
}

function formatPeriodRange(periodStart, dayCount, withYear = true) {
    const periodEnd = addDays(periodStart, dayCount - 1);
    const startFormat = isSameMonth(periodStart, periodEnd) ? "d" : "d MMM";
    return `${format(periodStart, startFormat, { locale: fr })} – ${format(periodEnd, withYear ? "d MMM yyyy" : "d MMM", { locale: fr })}`;
}

function getGridRange(courses) {
    if (courses.length === 0) {
        return { start: DEFAULT_START_MINUTES, end: DEFAULT_END_MINUTES };
    }

    const earliestStart = Math.min(...courses.map((course) => minutesSinceMidnight(course.start)));
    const latestEnd = Math.max(...courses.map((course) => minutesSinceMidnight(course.end)));
    const start = Math.max(
        0,
        Math.floor((earliestStart - TIME_OFFSET_MINUTES) / TIME_STEP_MINUTES) * TIME_STEP_MINUTES,
    );
    const end = Math.min(
        24 * 60,
        Math.ceil((latestEnd + TIME_OFFSET_MINUTES) / TIME_STEP_MINUTES) * TIME_STEP_MINUTES,
    );

    return { start, end };
}

function formatMinutes(minutes) {
    return `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
}

function escapeICSText(value) {
    return String(value ?? "")
        .replaceAll("\\", "\\\\")
        .replaceAll(";", "\\;")
        .replaceAll(",", "\\,")
        .replaceAll("\n", "\\n");
}

function toICSDate(date) {
    return date.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
}

function exportCalendar(courses, weekStart) {
    const events = courses.map((course) => [
        "BEGIN:VEVENT",
        `UID:${escapeICSText(course.id)}@ecole-directe.plus`,
        `DTSTAMP:${toICSDate(new Date())}`,
        `DTSTART:${toICSDate(course.start)}`,
        `DTEND:${toICSDate(course.end)}`,
        `SUMMARY:${escapeICSText(`${course.isCancelled ? "[ANNULÉ] " : ""}${course.subject}`)}`,
        `LOCATION:${escapeICSText(course.room)}`,
        `DESCRIPTION:${escapeICSText(`${course.teacher} • ${course.group} • ${course.status}`)}`,
        `STATUS:${course.isCancelled ? "CANCELLED" : "CONFIRMED"}`,
        "END:VEVENT",
    ].join("\r\n"));

    const content = [
        "BEGIN:VCALENDAR",
        "VERSION:2.0",
        "PRODID:-//Ecole Directe Plus//Emploi du temps//FR",
        "CALSCALE:GREGORIAN",
        ...events,
        "END:VCALENDAR",
    ].join("\r\n");

    const blob = new Blob([content], { type: "text/calendar;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `emploi-du-temps-${dateKey(weekStart)}.ics`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
}

function CourseCard({ course, gridStart, gridEnd, onSelect, isStreamerModeEnabled, hourHeight = HOUR_HEIGHT, order = 0 }) {
    const startMinutes = minutesSinceMidnight(course.start);
    const endMinutes = minutesSinceMidnight(course.end);
    const visibleStart = Math.max(startMinutes, gridStart);
    const visibleEnd = Math.min(endMinutes, gridEnd);
    if (visibleStart >= visibleEnd) return null;

    const top = ((visibleStart - gridStart) / 60) * hourHeight;
    const height = Math.max(((visibleEnd - visibleStart) / 60) * hourHeight - 5, 34);
    const compact = height < 54;
    const prioritizeTitle = compact && course.subject.length > 18;

    return (
        <button
            type="button"
            className={`timetable-course${course.isCancelled ? " cancelled" : ""}${course.isModified ? " modified" : ""}${compact ? " compact" : ""}${prioritizeTitle ? " title-priority" : ""}${course.devoirAFaire ? " has-homework" : ""}`}
            style={{ top, height, "--course-color": course.color, "--order": Math.min(order, 14) }}
            onClick={() => onSelect(course)}
            aria-label={`${course.subject}, de ${format(course.start, "HH:mm")} à ${format(course.end, "HH:mm")}, ${course.status}${course.devoirAFaire ? ", devoir à faire" : ""}`}
        >
            <span className="course-accent" aria-hidden="true" />
            {course.devoirAFaire && <span className="course-homework-alert" aria-hidden="true">✎</span>}
            <span className="course-title">{course.subject}</span>
            <span className="course-time">{format(course.start, "HH:mm")}–{format(course.end, "HH:mm")}</span>
            {!compact && <span className="course-meta">{course.room} · {isStreamerModeEnabled ? anonymizeTeacher(course.teacher) : course.teacher}</span>}
            <span className="course-badges">
                {course.isCancelled && <span className="course-badge danger">Annulé</span>}
            </span>
        </button>
    );
}

function CourseworkFiles({ files }) {
    if (!files?.length) return null;

    return (
        <div className="coursework-files">
            {files.map((file) => <FileComponent file={file} key={`${file.type}-${file.id}`} />)}
        </div>
    );
}

function CourseworkPanel({ activeAccount, course, coursework, onRetry, isStreamerModeEnabled }) {
    const notebookLink = `/app/${activeAccount}/homeworks#${dateKey(course.start)}`;

    if (coursework.status === "loading") {
        return (
            <section className="coursework-panel loading" aria-live="polite">
                <div className="timetable-loader" aria-hidden="true" />
                <div>
                    <strong>Chargement du cahier de texte...</strong>
                    <p>Récupération des devoirs associés au cours...</p>
                </div>
            </section>
        );
    }

    if (coursework.status === "error") {
        return (
            <section className="coursework-panel error" role="alert">
                <strong>Le détail des devoirs à faire n'a pas pu être chargé</strong>
                <p>{coursework.error}</p>
                <div className="coursework-error-actions">
                    <button type="button" onClick={onRetry}>Réessayer</button>
                    <Link to={notebookLink}>Ouvrir le cahier de texte</Link>
                </div>
            </section>
        );
    }

    if (coursework.status === "ready" && coursework.items.length === 0) {
        return (
            <section className="coursework-panel empty">
                <strong>Aucun détail n’est disponible pour cette matière.</strong>
                <p>Le cours reste signalé car EcoleDirecte indique du travail ou un contenu de séance.</p>
                <Link to={notebookLink}>Ouvrir le cahier de texte</Link>
            </section>
        );
    }

    if (coursework.status !== "ready") return null;

    return (
        <section className="coursework-panel">
            <div className="coursework-heading">
                <div>
                    <span>Cahier de texte</span>
                </div>
                <Link to={notebookLink}>Tout ouvrir</Link>
            </div>
            <div className="coursework-list">
                {coursework.items.map((item) => (
                    <article className="coursework-item" key={item.id}>
                        <header>
                            <div>
                                <strong>{item.subject}</strong>
                                <span>{isStreamerModeEnabled ? anonymizeTeacher(item.teacher) : item.teacher}</span>
                            </div>
                            <div className="coursework-badges">
                                {item.isInterrogation && <span className="test">Contrôle</span>}
                                {item.isDone === true && <span className="done">Fait</span>}
                                {item.isDone === false && <span className="todo">À faire</span>}
                            </div>
                        </header>
                        {(item.homeworkContent || item.files.length > 0) && (
                            <div className="coursework-content">
                                {item.homeworkContent && <EncodedHTMLDiv>{item.homeworkContent}</EncodedHTMLDiv>}
                                <CourseworkFiles files={item.files} />
                            </div>
                        )}
                        {(item.sessionContent || item.sessionFiles.length > 0) && (
                            <div className="coursework-content session">
                                <h4>Contenu de séance</h4>
                                {item.sessionContent && <EncodedHTMLDiv>{item.sessionContent}</EncodedHTMLDiv>}
                                <CourseworkFiles files={item.sessionFiles} />
                            </div>
                        )}
                    </article>
                ))}
            </div>
        </section>
    );
}

export default function Timetable({ isLoggedIn, activeAccount, fetchTimetable, fetchCoursework }) {
    const today = useMemo(() => new Date(), []);
    const currentDayStart = useMemo(() => startOfDay(today), [today]);
    const currentWeekStart = useMemo(() => startOfWeek(today, { weekStartsOn: 1 }), [today]);
    const [viewMode, setViewMode] = useState(() => {
        const savedView = localStorage.getItem("edp-timetable-view");
        if (VIEW_MODES.some((mode) => mode.id === savedView)) return savedView;
        if (window.innerWidth <= PHONE_MAX_WIDTH) return "day";
        return window.innerWidth <= 869 ? "three-day" : "week";
    });
    const [periodStart, setPeriodStart] = useState(() => (
        viewMode === "week" ? currentWeekStart : currentDayStart
    ));
    const [showCancelled, setShowCancelled] = useState(true);
    const [courses, setCourses] = useState([]);
    const [selectedCourse, setSelectedCourse] = useState(null);
    const [coursework, setCoursework] = useState(IDLE_COURSEWORK);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [error, setError] = useState("");
    const [lastUpdated, setLastUpdated] = useState(null);
    const [refreshRequest, setRefreshRequest] = useState(0);
    const [now, setNow] = useState(new Date());
    const [isMoreMenuOpen, setIsMoreMenuOpen] = useState(false);
    // Sens de la derniere navigation, pour l'animation de glissement.
    const [slideDirection, setSlideDirection] = useState(0);
    // Ecran de telephone (<= 650px) : la vue Semaine y passe en mode compact,
    // toute la semaine tient sans defilement horizontal.
    const [isCompactScreen, setIsCompactScreen] = useState(() => window.matchMedia("(max-width: 650px)").matches);
    const moreMenuRef = useRef(null);
    const touchStart = useRef(null);
    const cache = useRef(new Map());
    const courseworkCache = useRef(new Map());
    const courseworkController = useRef(null);
    const courseworkRequestId = useRef(0);
    const fetchTimetableRef = useRef(fetchTimetable);
    const fetchCourseworkRef = useRef(fetchCoursework);
    const { useUserSettings } = useContext(AppContext);
    const settings = useUserSettings();

    const periodLength = VIEW_MODES.find((mode) => mode.id === viewMode)?.length ?? WEEK_DAYS;
    const isCompactWeek = viewMode === "week" && isCompactScreen;
    const hourHeight = viewMode === "day" ? DAY_VIEW_HOUR_HEIGHT : isCompactWeek ? COMPACT_WEEK_HOUR_HEIGHT : HOUR_HEIGHT;
    const periodEnd = useMemo(() => addDays(periodStart, periodLength - 1), [periodLength, periodStart]);
    const selectorWeekStart = useMemo(() => startOfWeek(periodStart, { weekStartsOn: 1 }), [periodStart]);
    const selectorDays = useMemo(
        () => Array.from({ length: WEEK_DAYS }, (_, index) => addDays(selectorWeekStart, index)),
        [selectorWeekStart],
    );
    const periodDays = useMemo(
        () => viewMode === "week"
            ? selectorDays
            : Array.from({ length: periodLength }, (_, index) => addDays(periodStart, index)),
        [periodLength, periodStart, selectorDays, viewMode],
    );
    const fetchStart = useMemo(() => startOfWeek(periodStart, { weekStartsOn: 1 }), [periodStart]);
    const fetchEnd = useMemo(() => (
        addDays(startOfWeek(periodEnd, { weekStartsOn: 1 }), WEEK_DAYS - 1)
    ), [periodEnd]);
    const periodKey = `${activeAccount}-${dateKey(fetchStart)}-${dateKey(fetchEnd)}`;

    // Un jour de week-end est "connu vide" si une semaine chargee le couvre et
    // n'y contient aucun cours. Semaine pas encore chargee : on ne le saute
    // pas, pour ne jamais masquer des cours du samedi matin.
    const isKnownEmptyWeekend = (day) => {
        if (!isWeekend(day)) return false;
        const key = dateKey(day);
        for (const [cacheKey, value] of cache.current) {
            const match = cacheKey.match(/^(.*)-(\d{4}-\d{2}-\d{2})-(\d{4}-\d{2}-\d{2})$/);
            if (!match || match[1] !== String(activeAccount)) continue;
            if (key >= match[2] && key <= match[3]) {
                return !value.courses.some((course) => isSameDay(course.start, day));
            }
        }
        return false;
    };

    // Vues Jour et 3 jours, et Semaine sur telephone : les week-ends vides ne
    // prennent pas de colonne.
    const visibleDays = useMemo(() => {
        if ((viewMode === "week" && !isCompactScreen) || loading) return periodDays;
        const days = periodDays.filter((day) => !isKnownEmptyWeekend(day));
        return days.length > 0 ? days : periodDays;
    }, [periodDays, viewMode, loading, courses, isCompactScreen]);
    const periodCourses = useMemo(
        () => courses.filter((course) => visibleDays.some((day) => isSameDay(course.start, day))),
        [courses, visibleDays],
    );
    const displayedCourses = useMemo(
        () => periodCourses.filter((course) => showCancelled || !course.isCancelled),
        [periodCourses, showCancelled],
    );
    const gridRange = useMemo(() => getGridRange(displayedCourses), [displayedCourses]);
    const gridHeight = ((gridRange.end - gridRange.start) / 60) * hourHeight;
    const timeMarkers = useMemo(
        () => Array.from(
            { length: Math.floor((gridRange.end - gridRange.start) / TIME_STEP_MINUTES) + 1 },
            (_, index) => gridRange.start + index * TIME_STEP_MINUTES,
        ),
        [gridRange.end, gridRange.start],
    );

    useEffect(() => {
        fetchTimetableRef.current = fetchTimetable;
    }, [fetchTimetable]);

    useEffect(() => {
        fetchCourseworkRef.current = fetchCoursework;
    }, [fetchCoursework]);

    useEffect(() => {
        courseworkController.current?.abort();
        courseworkRequestId.current += 1;
        courseworkCache.current.clear();
        setSelectedCourse(null);
        setCoursework(IDLE_COURSEWORK);
    }, [activeAccount]);

    useEffect(() => () => courseworkController.current?.abort(), []);

    useEffect(() => {
        document.title = "Emploi du temps • Ecole Directe Plus";
        const interval = window.setInterval(() => setNow(new Date()), 60_000);
        return () => window.clearInterval(interval);
    }, []);

    useEffect(() => {
        localStorage.setItem("edp-timetable-view", viewMode);
    }, [viewMode]);

    useEffect(() => {
        const query = window.matchMedia("(max-width: 650px)");
        const update = () => setIsCompactScreen(query.matches);
        query.addEventListener("change", update);
        return () => query.removeEventListener("change", update);
    }, []);

    useEffect(() => {
        // if (!isLoggedIn || typeof fetchTimetableRef.current !== "function") {
        //     setLoading(false);
        //     return undefined;
        // }

        const cached = cache.current.get(periodKey);
        if (cached) {
            setCourses(cached.courses);
            setLastUpdated(cached.updatedAt);
            setLoading(false);
            setError("");
            return undefined;
        }

        const controller = new AbortController();
        setError("");
        setLoading(courses.length === 0);
        setRefreshing(courses.length > 0);

        fetchTimetableRef.current({
            startDate: fetchStart,
            endDate: fetchEnd,
            controller,
        })
            .then((rawCourses) => {
                if (controller.signal.aborted) return;
                const normalized = (rawCourses ?? [])
                    .map(normalizeCourse)
                    .filter(Boolean)
                    .sort((a, b) => a.start - b.start);
                const updatedAt = new Date();
                cache.current.set(periodKey, { courses: normalized, updatedAt });
                setCourses(normalized);
                setLastUpdated(updatedAt);
            })
            .catch((fetchError) => {
                if (fetchError?.name !== "AbortError") {
                    setError(fetchError?.message || "Impossible de charger l’emploi du temps.");
                }
            })
            .finally(() => {
                setRefreshing(false);
                if (!controller.signal.aborted) {
                    setLoading(false);
                }
            });

        return () => controller.abort();
    }, [activeAccount, fetchEnd, fetchStart, isLoggedIn, periodKey, refreshRequest]);

    const totalMinutes = periodCourses.reduce((total, course) => (
        course.isCancelled ? total : total + Math.round((course.end - course.start) / 60_000)
    ), 0);
    const cancelledCount = periodCourses.filter((course) => course.isCancelled).length;
    const modifiedCount = periodCourses.filter((course) => course.isModified && !course.isCancelled).length;
    const changePeriod = (delta) => {
        setSlideDirection(delta);
        setPeriodStart((date) => {
            if (viewMode === "week") return addWeeks(date, delta);
            let next = addDays(date, delta * periodLength);
            if (viewMode === "day") {
                // Saute samedi/dimanche quand on sait qu'ils sont vides.
                for (let guard = 0; guard < 2 && isKnownEmptyWeekend(next); guard++) {
                    next = addDays(next, delta);
                }
            }
            return next;
        });
    };

    const goToToday = () => {
        setSlideDirection(0);
        setPeriodStart(viewMode === "week" ? currentWeekStart : currentDayStart);
    };

    const selectDay = (day) => {
        setSlideDirection(day > periodStart ? 1 : day < periodStart ? -1 : 0);
        setPeriodStart(day);
    };

    // Glisser a gauche / a droite sur la grille change de jour (ou de periode).
    // Semaine large (tablette) : elle defile horizontalement, pas de glissement.
    const handleTouchStart = (event) => {
        if ((viewMode === "week" && !isCompactScreen) || event.touches.length !== 1) return;
        touchStart.current = { x: event.touches[0].clientX, y: event.touches[0].clientY };
    };

    const handleTouchEnd = (event) => {
        const start = touchStart.current;
        touchStart.current = null;
        if (!start || event.changedTouches.length !== 1) return;
        const dx = event.changedTouches[0].clientX - start.x;
        const dy = event.changedTouches[0].clientY - start.y;
        if (Math.abs(dx) >= SWIPE_MIN_DISTANCE && Math.abs(dx) > Math.abs(dy) * 1.5) {
            changePeriod(dx < 0 ? 1 : -1);
        }
    };

    // Fermeture du menu "..." au clic exterieur ou avec Echap.
    useEffect(() => {
        if (!isMoreMenuOpen) return undefined;
        const handlePointerDown = (event) => {
            if (!moreMenuRef.current?.contains(event.target)) setIsMoreMenuOpen(false);
        };
        const handleKeyDown = (event) => {
            if (event.key === "Escape") setIsMoreMenuOpen(false);
        };
        document.addEventListener("pointerdown", handlePointerDown);
        document.addEventListener("keydown", handleKeyDown);
        return () => {
            document.removeEventListener("pointerdown", handlePointerDown);
            document.removeEventListener("keydown", handleKeyDown);
        };
    }, [isMoreMenuOpen]);

    const changeViewMode = (nextViewMode) => {
        setSlideDirection(0);
        setViewMode(nextViewMode);
        setPeriodStart((date) => {
            if (nextViewMode === "week") {
                return startOfWeek(date, { weekStartsOn: 1 });
            }
            return isSameWeek(date, today, { weekStartsOn: 1 }) ? currentDayStart : date;
        });
    };

    const shownSelectorDays = selectorDays.filter((day) => !isKnownEmptyWeekend(day));

    const periodLabel = viewMode === "day"
        ? (isSameDay(periodStart, today) ? "Aujourd'hui" : isSameDay(periodStart, addDays(today, 1)) ? "Demain" : isSameDay(periodStart, addDays(today, -1)) ? "Hier" : "Jour")
        : viewMode === "three-day" ? "3 jours" : `Semaine ${format(periodStart, "w")}`;
    const periodTitle = viewMode === "day"
        ? format(periodStart, isSameDay(periodStart, today) || periodStart.getFullYear() === today.getFullYear() ? "EEEE d MMM" : "d MMM yyyy", { locale: fr })
        : formatPeriodRange(periodStart, periodLength, (viewMode === "week" && !isCompactScreen) || periodStart.getFullYear() !== today.getFullYear());
    const previousLabel = viewMode === "day" ? "Jour précédent" : viewMode === "three-day" ? "3 jours précédents" : "Semaine précédente";
    const nextLabel = viewMode === "day" ? "Jour suivant" : viewMode === "three-day" ? "3 jours suivants" : "Semaine suivante";

    const refresh = () => {
        cache.current.delete(periodKey);
        setRefreshRequest((value) => value + 1);
    };

    const openCourse = (course, force = false) => {
        courseworkController.current?.abort();
        const requestId = courseworkRequestId.current + 1;
        courseworkRequestId.current = requestId;
        setSelectedCourse(course);

        if (!course.devoirAFaire && !course.contenuDeSeance) {
            setCoursework(IDLE_COURSEWORK);
            return;
        }

        const cacheKey = `${activeAccount}-${dateKey(course.start)}-${course.id}`;
        if (!force && courseworkCache.current.has(cacheKey)) {
            setCoursework(courseworkCache.current.get(cacheKey));
            return;
        }

        if (typeof fetchCourseworkRef.current !== "function") {
            setCoursework({
                status: "error",
                items: [],
                error: "Le service de cahier de texte n’est pas disponible.",
            });
            return;
        }

        const controller = new AbortController();
        courseworkController.current = controller;
        setCoursework({ status: "loading", items: [], error: "" });

        fetchCourseworkRef.current({ course, controller })
            .then((items) => {
                if (controller.signal.aborted || requestId !== courseworkRequestId.current) return;
                const readyState = {
                    status: "ready",
                    items: (items ?? []).map((item) => ({
                        ...item,
                        files: Array.isArray(item.files) ? item.files : [],
                        sessionFiles: Array.isArray(item.sessionFiles) ? item.sessionFiles : [],
                    })),
                    error: "",
                };
                courseworkCache.current.set(cacheKey, readyState);
                setCoursework(readyState);
            })
            .catch((courseworkError) => {
                if (controller.signal.aborted || requestId !== courseworkRequestId.current) return;
                setCoursework({
                    status: "error",
                    items: [],
                    error: courseworkError?.message || "Impossible de charger le travail associé à ce cours.",
                });
            });
    };

    const closeCourse = () => {
        courseworkController.current?.abort();
        courseworkRequestId.current += 1;
        setSelectedCourse(null);
        setCoursework(IDLE_COURSEWORK);
    };

    return (
        <>
            <div id="timetable-page">
                <WindowsContainer name="timetable">
                    <WindowsLayout direction="row" ultimateContainer={true}>
                        <Window allowFullscreen={true} className="timetable-window">
                            <WindowHeader>
                                <h2>Emploi du temps</h2>
                            </WindowHeader>
                            <WindowContent>
                                <section className={`timetable-content ${refreshing ? "refreshing" : ""}`} aria-busy={loading || refreshing}>
                                    <div className="timetable-toolbar">
                                        <div className="week-navigation" aria-label="Navigation entre les périodes">
                                            <button type="button" className="timetable-icon-button" onClick={() => changePeriod(-1)} aria-label={previousLabel}>‹</button>
                                            <div className="week-title" key={`${viewMode}-${dateKey(periodStart)}`}>
                                                <span>{periodLabel}</span>
                                                <strong>{periodTitle}</strong>
                                            </div>
                                            <button type="button" className="timetable-icon-button" onClick={() => changePeriod(1)} aria-label={nextLabel}>›</button>
                                            <button type="button" className="timetable-action-button today-button" onClick={goToToday} disabled={periodDays.some((day) => isSameDay(day, today))}>Aujourd'hui</button>
                                        </div>

                                        <div className="timetable-view-actions">
                                            <div className="view-switch" role="group" aria-label="Mode d’affichage">
                                                {VIEW_MODES.map((mode) => (
                                                    <button type="button" key={mode.id} className={`${viewMode === mode.id ? "selected" : ""}${mode.id === "day" ? " day-mode" : ""}`} onClick={() => changeViewMode(mode.id)} aria-pressed={viewMode === mode.id}>{mode.label}</button>
                                                ))}
                                            </div>
                                            <InfoButton className="" options={{
                                                placement: "bottom"
                                            }}>
                                                <div className="timetable-info-panel">
                                                    <strong>Résumé de la période</strong>
                                                    <dl>
                                                        <div><dt>Volume</dt><dd>{formatDuration(totalMinutes)}</dd></div>
                                                        <div><dt>Changements</dt><dd>{cancelledCount} annulé{cancelledCount > 1 ? "s" : ""} · {modifiedCount} modifié{modifiedCount > 1 ? "s" : ""}</dd></div>
                                                        <div><dt>Mis à jour</dt><dd>{lastUpdated ? format(lastUpdated, "HH:mm") : "—"}</dd></div>
                                                    </dl>
                                                </div>
                                            </InfoButton>
                                            {/* <details className="timetable-info">
                                                <summary aria-label="Afficher le résumé de la période">i</summary>
                                                <div className="timetable-info-panel">
                                                    <strong>Résumé de la période</strong>
                                                    <dl>
                                                        <div><dt>Volume</dt><dd>{formatDuration(totalMinutes)}</dd></div>
                                                        <div><dt>Changements</dt><dd>{cancelledCount} annulé{cancelledCount > 1 ? "s" : ""} · {modifiedCount} modifié{modifiedCount > 1 ? "s" : ""}</dd></div>
                                                        <div><dt>Mis à jour</dt><dd>{lastUpdated ? format(lastUpdated, "HH:mm") : "—"}</dd></div>
                                                    </dl>
                                                </div>
                                            </details> */}
                                            <label className="cancelled-toggle">
                                                <input type="checkbox" checked={showCancelled} onChange={(event) => setShowCancelled(event.target.checked)} aria-label="Afficher les cours annulés" />
                                                <span aria-hidden="true" />
                                                <span className="cancelled-toggle-label">Annulés</span>
                                            </label>
                                            <div className="timetable-output-actions">
                                                <button type="button" onClick={() => exportCalendar(displayedCourses, periodStart)}>Exporter .ics</button>
                                                <button type="button" onClick={() => window.print()}>Imprimer</button>
                                                <button type="button" className="timetable-action-button" onClick={refresh} disabled={refreshing}>{refreshing ? "Actualisation…" : "Actualiser"}</button>
                                            </div>
                                            {/* Telephone : les memes actions, rangees dans un menu. */}
                                            <div className="timetable-more" ref={moreMenuRef}>
                                                <button type="button" className="timetable-more-button" onClick={() => setIsMoreMenuOpen((old) => !old)} aria-expanded={isMoreMenuOpen} aria-haspopup="menu" aria-label="Plus d'actions">⋯</button>
                                                {isMoreMenuOpen && (
                                                    <div className="timetable-more-menu" role="menu">
                                                        <button type="button" role="menuitemcheckbox" aria-checked={showCancelled} className="timetable-more-check" onClick={() => setShowCancelled((old) => !old)}>
                                                            <span className="timetable-more-check-box" aria-hidden="true">{showCancelled && "✓"}</span>
                                                            Afficher les cours annulés
                                                        </button>
                                                        <button type="button" role="menuitem" onClick={() => { setIsMoreMenuOpen(false); refresh(); }} disabled={refreshing}>{refreshing ? "Actualisation…" : "Actualiser"}</button>
                                                        <button type="button" role="menuitem" onClick={() => { setIsMoreMenuOpen(false); exportCalendar(displayedCourses, periodStart); }}>Exporter (.ics)</button>
                                                        <button type="button" role="menuitem" onClick={() => { setIsMoreMenuOpen(false); window.print(); }}>Imprimer</button>
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    </div>

                                    {viewMode !== "week" && (
                                        <div className="day-selector" role="tablist" aria-label={viewMode === "day" ? "Jour affiché" : "Premier jour de la période affichée"} style={{ "--selector-days": shownSelectorDays.length }}>
                                            {shownSelectorDays.map((day, dayIndex) => (
                                                <button
                                                    style={{ "--order": dayIndex }}
                                                    type="button"
                                                    role="tab"
                                                    aria-selected={isSameDay(day, periodStart)}
                                                    className={`${isSameDay(day, periodStart) ? "selected" : ""}${visibleDays.some((visibleDay) => isSameDay(day, visibleDay)) ? " in-range" : ""}${isSameDay(day, today) ? " today" : ""}`}
                                                    onClick={() => selectDay(day)}
                                                    key={dateKey(day)}
                                                >
                                                    <span>{format(day, "EEE", { locale: fr })}</span>
                                                    <strong>{format(day, "d")}</strong>
                                                </button>
                                            ))}
                                        </div>
                                    )}

                                    {loading && (
                                        <div className="timetable-state" role="status">
                                            <div className="timetable-loader" aria-hidden="true" />
                                            <strong>Chargement de la période...</strong>
                                            <span>Nous préparons vos cours et les éventuels changements.</span>
                                        </div>
                                    )}

                                    {!loading && error && (
                                        <div className="timetable-state error" role="alert">
                                            <strong>La période n’a pas pu être chargée</strong>
                                            <span>{error}</span>
                                            <button type="button" className="timetable-action-button" onClick={refresh}>Réessayer</button>
                                        </div>
                                    )}

                                    {!loading && !error && (
                                        <div className={`timetable-grid-frame ${viewMode}${isCompactWeek ? " compact-week" : ""}`} onTouchStart={handleTouchStart} onTouchEnd={handleTouchEnd}>
                                            <div
                                                className={`timetable-grid-canvas${slideDirection > 0 ? " slide-from-right" : slideDirection < 0 ? " slide-from-left" : ""}`}
                                                style={{ "--visible-days": visibleDays.length }}
                                                key={`${viewMode}-${visibleDays.map(dateKey).join("|")}`}
                                            >
                                                <div className="timetable-days-header">
                                                    <div className="time-header" aria-hidden="true">Heure</div>
                                                    {visibleDays.map((day, dayIndex) => (
                                                        <div className={`day-heading${isSameDay(day, today) ? " today" : ""}`} key={dateKey(day)} style={{ "--order": dayIndex }}>
                                                            <span>{format(day, isCompactWeek ? "EEE" : "EEEE", { locale: fr })}</span>
                                                            <strong>{format(day, isCompactWeek ? "d" : "d MMM", { locale: fr })}</strong>
                                                        </div>
                                                    ))}
                                                </div>
                                                <div className="timetable-grid-body">
                                                    <div className="time-axis" style={{ height: gridHeight }}>
                                                        {timeMarkers.filter((minutes) => minutes > gridRange.start && minutes < gridRange.end && minutes % 60 === 0).map((minutes) => (
                                                            <span style={{ top: ((minutes - gridRange.start) / 60) * hourHeight }} key={minutes}>{isCompactWeek ? String(Math.floor(minutes / 60)).padStart(2, "0") : formatMinutes(minutes)}</span>
                                                        ))}
                                                    </div>
                                                    <div className="days-columns" style={{ height: gridHeight }}>
                                                        {timeMarkers.map((minutes) => (
                                                            <span className={`time-grid-line${minutes % 60 === 0 ? " hour" : ""}`} style={{ top: ((minutes - gridRange.start) / 60) * hourHeight }} key={minutes} aria-hidden="true" />
                                                        ))}
                                                        {visibleDays.map((day, dayIndex) => {
                                                            const dayCourses = displayedCourses.filter((course) => isSameDay(course.start, day));
                                                            const nowMinutes = minutesSinceMidnight(now);
                                                            const showNow = isSameDay(day, now) && nowMinutes >= gridRange.start && nowMinutes <= gridRange.end;
                                                            return (
                                                                <div className={`day-column${isSameDay(day, today) ? " today" : ""}`} key={dateKey(day)}>
                                                                    {dayCourses.map((course, courseIndex) => <CourseCard order={dayIndex + courseIndex} course={course} gridStart={gridRange.start} gridEnd={gridRange.end} onSelect={openCourse} key={course.id} isStreamerModeEnabled={settings.get("isStreamerModeEnabled")} hourHeight={hourHeight} />)}
                                                                    {showNow && (
                                                                        <span className="current-time-line" style={{ top: ((nowMinutes - gridRange.start) / 60) * hourHeight }} aria-label={`Heure actuelle : ${format(now, "HH:mm")}`}>
                                                                            <i aria-hidden="true" />
                                                                        </span>
                                                                    )}
                                                                </div>
                                                            );
                                                        })}
                                                    </div>
                                                </div>
                                            </div>
                                            {refreshing && <WalkingCanardman className="refreshing-timetable-canardman" />}
                                        </div>
                                    )}
                                </section>
                            </WindowContent>
                        </Window>
                    </WindowsLayout>
                </WindowsContainer>
            </div>

            {selectedCourse && (
                <BottomSheet heading={selectedCourse.subject} onClose={closeCourse} firstResizingBreakpoint={1}>
                    <article className="course-details">
                        <div className={`course-status-card${selectedCourse.isCancelled ? " cancelled" : ""}${selectedCourse.isModified ? " modified" : ""}`} style={{ "--course-color": selectedCourse.color }}>
                            <span>{selectedCourse.status}</span>
                            <strong>{format(selectedCourse.start, "EEEE d MMMM", { locale: fr })}</strong>
                            <p>{format(selectedCourse.start, "HH:mm")} – {format(selectedCourse.end, "HH:mm")} · {formatDuration(Math.round((selectedCourse.end - selectedCourse.start) / 60_000))}</p>
                        </div>
                        <dl>
                            <div><dt>Professeur</dt><dd>{settings.get("isStreamerModeEnabled") ? anonymizeTeacher(selectedCourse.teacher) : selectedCourse.teacher}</dd></div>
                            <div><dt>Salle</dt><dd>{selectedCourse.room}</dd></div>
                            <div><dt>Groupe</dt><dd>{selectedCourse.group}</dd></div>
                            <div><dt>Matière</dt><dd>{selectedCourse.codeMatiere || "Non renseignée"}</dd></div>
                        </dl>
                        {(selectedCourse.contenuDeSeance || selectedCourse.devoirAFaire) && (
                            <CourseworkPanel
                                activeAccount={activeAccount}
                                course={selectedCourse}
                                coursework={coursework}
                                onRetry={() => openCourse(selectedCourse, true)}
                                isStreamerModeEnabled={settings.get("isStreamerModeEnabled")}
                            />
                        )}
                    </article>
                </BottomSheet>
            )}
        </>
    );
}
