import { useContext, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { addDays, differenceInCalendarDays, format, isSameDay, startOfDay } from "date-fns";
import { fr } from "date-fns/locale";

import { AppContext } from "../../../App";
import { subjectKey, useSubjectColors } from "../../../utils/subjectColors";
import { anonymizeTeacher } from "../../../utils/utils";

import "./TodayTimetable.css";

// Apercu de l'emploi du temps sur l'accueil : la journee en cours, ou la
// prochaine journee de cours si celle d'aujourd'hui est terminee.

const LOOKAHEAD_DAYS = 10;
const CACHE_DURATION_MS = 5 * 60_000;
// Cache partage entre les montages : revenir sur l'accueil ne relance pas la requete.
const cache = new Map();

function apiBoolean(value) {
    return value === true || value === 1 || value === "1" || value === "true";
}

function parseApiDate(value) {
    const match = String(value ?? "").match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})/);
    if (!match) return new Date(NaN);
    return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]), Number(match[4]), Number(match[5]));
}

function safeColor(value) {
    const color = String(value ?? "").trim();
    if (/^#[0-9a-f]{6}$/i.test(color)) return color;
    if (/^[0-9a-f]{6}$/i.test(color)) return `#${color}`;
    return "#5965d8";
}

function normalizeCourse(course) {
    const start = parseApiDate(course.start_date);
    const end = parseApiDate(course.end_date);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end <= start) return null;
    const homeworkSummary = Array.isArray(course.homeworkSummary) ? course.homeworkSummary : [];
    const hasHomework = apiBoolean(course.devoirAFaire) || homeworkSummary.length > 0;
    return {
        ...course,
        id: course.id ?? `${start.toISOString()}-${course.codeMatiere}`,
        subject: String(course.matiere || course.text || "Évènement").trim(),
        teacher: String(course.prof || "").trim(),
        room: String(course.salle || "").trim(),
        start,
        end,
        color: safeColor(course.color),
        isCancelled: apiBoolean(course.isAnnule ?? course.isCancelled ?? course.annule),
        isModified: apiBoolean(course.isModifie ?? course.isModified ?? course.modifie),
        isExempted: Number(course.dispense) > 0,
        hasHomework,
        homeworkDone: hasHomework && apiBoolean(course.homeworkDone),
    };
}

function formatDelay(minutes) {
    if (minutes < 1) return "maintenant";
    if (minutes < 60) return `dans ${minutes} min`;
    const hours = Math.floor(minutes / 60);
    const rest = minutes % 60;
    return `dans ${hours} h${rest > 0 ? ` ${String(rest).padStart(2, "0")}` : ""}`;
}

function dayLabel(day, now) {
    const delta = differenceInCalendarDays(day, now);
    if (delta === 0) return "Aujourd'hui";
    if (delta === 1) return "Demain";
    const label = format(day, "EEEE d MMMM", { locale: fr });
    return label.charAt(0).toUpperCase() + label.slice(1);
}

function TodayTimetableSkeleton() {
    return (
        <ol className="today-timetable-list loading" aria-label="Chargement de l'emploi du temps">
            {[0, 1, 2, 3].map((index) => (
                <li key={index} className="today-course skeleton">
                    <span className="today-course-times"><span /><span /></span>
                    <span className="today-course-accent" />
                    <span className="today-course-body"><span /><span /></span>
                </li>
            ))}
        </ol>
    );
}

export default function TodayTimetable({ activeAccount, accountId, isLoggedIn, fetchTimetable }) {
    const { useUserSettings } = useContext(AppContext);
    const settings = useUserSettings();
    const isStreamerModeEnabled = settings.get("isStreamerModeEnabled");
    const subjectColors = useSubjectColors({ accountId: accountId ?? activeAccount }).colors;

    const [now, setNow] = useState(() => new Date());
    const [courses, setCourses] = useState(null);
    const [error, setError] = useState("");
    const [retry, setRetry] = useState(0);

    // Rafraichit "en cours" / "dans 10 min" toutes les 30 s.
    useEffect(() => {
        const timer = setInterval(() => setNow(new Date()), 30_000);
        return () => clearInterval(timer);
    }, []);

    const todayKey = format(now, "yyyy-MM-dd");
    const cacheKey = `${activeAccount}-${todayKey}`;

    useEffect(() => {
        if (!isLoggedIn || typeof fetchTimetable !== "function") return undefined;

        const cached = cache.get(cacheKey);
        if (cached) {
            setCourses(cached.courses);
            if (Date.now() - cached.updatedAt < CACHE_DURATION_MS) return undefined;
        } else {
            setCourses(null);
        }

        const controller = new AbortController();
        const startDate = startOfDay(new Date());
        setError("");
        fetchTimetable({ startDate, endDate: addDays(startDate, LOOKAHEAD_DAYS), controller })
            .then((rawCourses) => {
                if (controller.signal.aborted) return;
                const normalized = (rawCourses ?? [])
                    .map(normalizeCourse)
                    .filter(Boolean)
                    .sort((a, b) => a.start - b.start);
                cache.set(cacheKey, { courses: normalized, updatedAt: Date.now() });
                setCourses(normalized);
            })
            .catch((fetchError) => {
                if (fetchError?.name === "AbortError") return;
                setError(fetchError?.message || "Impossible de charger l'emploi du temps.");
            });

        return () => controller.abort();
    }, [cacheKey, isLoggedIn, retry]);

    // Journee affichee : aujourd'hui tant qu'il reste un cours, sinon la suivante.
    const { day, dayCourses } = useMemo(() => {
        if (!courses) return { day: null, dayCourses: [] };
        const upcoming = courses.find((course) => course.end > now && !course.isCancelled)
            ?? courses.find((course) => course.end > now);
        if (!upcoming) return { day: null, dayCourses: [] };
        const shownDay = startOfDay(upcoming.start);
        return {
            day: shownDay,
            dayCourses: courses
                .filter((course) => isSameDay(course.start, shownDay))
                .map((course) => {
                    const customColor = subjectColors[subjectKey(course)];
                    return customColor ? { ...course, color: customColor } : course;
                }),
        };
    }, [courses, now, subjectColors]);

    const activeCourses = dayCourses.filter((course) => !course.isCancelled);
    const currentCourse = activeCourses.find((course) => course.start <= now && course.end > now);
    const nextCourse = activeCourses.find((course) => course.start > now);
    const changesCount = dayCourses.filter((course) => course.isCancelled || course.isModified).length;
    const timetableUrl = `/app/${activeAccount}/timetable`;

    let summary = "";
    if (day) {
        if (currentCourse) {
            const left = Math.ceil((currentCourse.end - now) / 60_000);
            summary = `${currentCourse.subject} en cours, fin ${formatDelay(left)}`;
        } else if (nextCourse && isSameDay(nextCourse.start, now)) {
            summary = `Prochain cours ${formatDelay(Math.round((nextCourse.start - now) / 60_000))}`;
        } else if (activeCourses.length > 0) {
            summary = `De ${format(activeCourses[0].start, "HH:mm")} à ${format(activeCourses[activeCourses.length - 1].end, "HH:mm")}`;
        } else {
            summary = "Tous les cours sont annulés";
        }
    }

    return (
        <div className="today-timetable">
            {error && !courses
                ? <div className="today-timetable-empty">
                    <p>{error}</p>
                    <button type="button" className="today-timetable-retry" onClick={() => setRetry((value) => value + 1)}>Réessayer</button>
                </div>
                : courses === null
                    ? <TodayTimetableSkeleton />
                    : !day
                        ? <div className="today-timetable-empty">
                            <p>Aucun cours prévu dans les {LOOKAHEAD_DAYS} prochains jours.</p>
                            <Link to={timetableUrl} className="today-timetable-retry">Ouvrir l'emploi du temps</Link>
                        </div>
                        : <>
                            <div className="today-timetable-heading">
                                <p className="today-timetable-day">{dayLabel(day, now)}</p>
                                <p className="today-timetable-summary">{summary}</p>
                                {changesCount > 0 && <p className="today-timetable-changes">⚠ {changesCount} changement{changesCount > 1 ? "s" : ""}</p>}
                            </div>
                            <ol className="today-timetable-list">
                                {dayCourses.map((course) => {
                                    const isCurrent = course === currentCourse;
                                    const isNext = !currentCourse && course === nextCourse;
                                    const isPast = course.end <= now;
                                    const progress = isCurrent ? (now - course.start) / (course.end - course.start) : 0;
                                    const meta = [course.room, course.teacher && (isStreamerModeEnabled ? anonymizeTeacher(course.teacher) : course.teacher)].filter(Boolean).join(" · ");
                                    return (
                                        <li key={course.id}>
                                            <Link
                                                to={timetableUrl}
                                                className={`today-course${isCurrent ? " current" : ""}${isNext ? " next" : ""}${isPast ? " past" : ""}${course.isCancelled ? " cancelled" : ""}`}
                                                style={{ "--course-color": course.color, "--progress": progress }}
                                            >
                                                <span className="today-course-times">
                                                    <span>{format(course.start, "HH:mm")}</span>
                                                    <span>{format(course.end, "HH:mm")}</span>
                                                </span>
                                                <span className="today-course-accent" aria-hidden="true" />
                                                <span className="today-course-body">
                                                    <span className="today-course-subject">{course.subject}</span>
                                                    {meta && <span className="today-course-meta">{meta}</span>}
                                                </span>
                                                <span className="today-course-tags">
                                                    {isCurrent && <span className="today-course-tag live">En cours</span>}
                                                    {course.isCancelled && <span className="today-course-tag danger">Annulé</span>}
                                                    {course.isModified && !course.isCancelled && <span className="today-course-tag warning">Modifié</span>}
                                                    {course.isExempted && <span className="today-course-tag">Dispense</span>}
                                                    {course.hasHomework && !course.isCancelled && <span className={`today-course-tag homework${course.homeworkDone ? " done" : ""}`} title={course.homeworkDone ? "Devoir fait" : "Devoir à faire"}>{course.homeworkDone ? "Fait ✓" : "Devoir"}</span>}
                                                </span>
                                            </Link>
                                        </li>
                                    );
                                })}
                            </ol>
                        </>}
        </div>
    );
}
