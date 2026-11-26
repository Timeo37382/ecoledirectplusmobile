/**
 * Notifications des nouveautes (sans serveur).
 *
 * A chaque verification, on prend un "instantane" des donnees EcoleDirecte
 * (ids des notes, devoirs, messages, etat des cours a venir) et on le compare
 * a celui de la verification precedente, garde sur l'appareil. Les differences
 * deviennent des evenements :
 *   - affiches en notification systeme (si l'eleve l'a autorise) ;
 *   - gardes dans un fil "Nouveautes" affiche sur l'accueil jusqu'a ce qu'il
 *     soit vu.
 * La toute premiere verification d'un compte ne produit aucun evenement : elle
 * sert de point de depart.
 */

export const NOTIFICATION_TYPES = [
    { setting: "notifyGrades", type: "grade", label: "Nouvelle note" },
    { setting: "notifyTimetable", type: "course", label: "Cours annulé ou modifié" },
    { setting: "notifyMessages", type: "message", label: "Nouveau message" },
    { setting: "notifyHomeworks", type: "homework", label: "Nouveau devoir" },
];

const SNAPSHOT_PREFIX = "edp-updates-snapshot-";
const FEED_PREFIX = "edp-updates-feed-";
const MAX_FEED_LENGTH = 30;
// Au-dela, une seule notification resume le lot ("5 nouvelles notes").
const MAX_SEPARATE_NOTIFICATIONS = 3;

function apiBoolean(value) {
    return value === true || value === 1 || value === "1" || value === "true";
}

function readJSON(key, fallback) {
    try {
        return JSON.parse(localStorage.getItem(key) ?? "null") ?? fallback;
    } catch {
        return fallback;
    }
}

function capitalize(text) {
    return text.charAt(0).toUpperCase() + text.slice(1);
}

function formatDay(isoDate) {
    const [year, month, day] = String(isoDate).slice(0, 10).split("-").map(Number);
    if (!year) return "";
    return new Date(year, month - 1, day).toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" });
}

function subjectName(value) {
    const text = String(value ?? "").trim();
    // EcoleDirecte ecrit souvent les matieres en majuscules.
    return text === text.toUpperCase() ? capitalize(text.toLowerCase()) : text;
}

/* ---------- Instantane ---------- */

/**
 * @param raw { grades: notes[], homeworks: { "AAAA-MM-JJ": devoir[] }, messages: message[], courses: cours[] }
 *        Une cle absente (requete echouee) garde la valeur de l'instantane precedent.
 */
export function buildSnapshot(raw, previous = null) {
    const now = new Date();
    const snapshot = { updatedAt: Date.now() };

    snapshot.grades = raw.grades
        ? raw.grades.map((grade) => String(grade.id))
        : previous?.grades ?? null;

    snapshot.homeworks = raw.homeworks
        ? Object.values(raw.homeworks).flat().filter((task) => apiBoolean(task.aFaire)).map((task) => String(task.idDevoir))
        : previous?.homeworks ?? null;

    snapshot.messages = raw.messages
        ? raw.messages.map((message) => String(message.id))
        : previous?.messages ?? null;

    if (raw.courses) {
        snapshot.courses = {};
        raw.courses.forEach((course) => {
            if (new Date(String(course.start_date).replace(" ", "T")) < now) return;
            snapshot.courses[String(course.id)] = apiBoolean(course.isAnnule) ? "cancelled" : apiBoolean(course.isModifie) ? "modified" : "";
        });
    } else {
        snapshot.courses = previous?.courses ?? null;
    }

    return snapshot;
}

/** Evenements entre deux instantanes. `raw` donne le detail de chaque element. */
export function diffSnapshots(previous, next, raw) {
    const events = [];
    const at = Date.now();
    if (!previous) return events;

    if (raw.grades && previous.grades) {
        const known = new Set(previous.grades);
        raw.grades
            .filter((grade) => !known.has(String(grade.id)))
            .forEach((grade) => {
                const value = grade.valeur !== "" && grade.valeur !== undefined
                    ? `${String(grade.valeur).replace(".", ",")}${grade.noteSur ? `/${grade.noteSur}` : ""}`
                    : "";
                events.push({
                    id: `grade-${grade.id}`,
                    type: "grade",
                    at,
                    title: `Nouvelle note en ${subjectName(grade.libelleMatiere)}`,
                    body: [value, grade.devoir].filter(Boolean).join(" · "),
                    path: "grades",
                });
            });
    }

    if (raw.homeworks && previous.homeworks) {
        const known = new Set(previous.homeworks);
        Object.entries(raw.homeworks).forEach(([date, tasks]) => {
            tasks
                .filter((task) => apiBoolean(task.aFaire) && !known.has(String(task.idDevoir)))
                .forEach((task) => {
                    events.push({
                        id: `homework-${task.idDevoir}`,
                        type: "homework",
                        at,
                        title: `${apiBoolean(task.interrogation) ? "Contrôle" : "Nouveau devoir"} en ${subjectName(task.matiere)}`,
                        body: `Pour ${formatDay(date)}`,
                        path: "homeworks",
                    });
                });
        });
    }

    if (raw.messages && previous.messages) {
        const known = new Set(previous.messages);
        raw.messages
            .filter((message) => !known.has(String(message.id)) && !apiBoolean(message.read))
            .forEach((message) => {
                const from = message.from
                    ? [message.from.civilite, message.from.prenom, message.from.nom].filter(Boolean).join(" ")
                    : "";
                events.push({
                    id: `message-${message.id}`,
                    type: "message",
                    at,
                    title: from ? `Message de ${from}` : "Nouveau message",
                    body: message.subject ?? "",
                    path: "messaging",
                });
            });
    }

    if (raw.courses && previous.courses) {
        raw.courses.forEach((course) => {
            const id = String(course.id);
            const status = next.courses?.[id];
            if (!status || status === previous.courses[id]) return;
            const start = String(course.start_date);
            events.push({
                id: `course-${id}-${status}`,
                type: "course",
                at,
                title: `${status === "cancelled" ? "Cours annulé" : "Cours modifié"} : ${subjectName(course.matiere || course.text)}`,
                body: `${capitalize(formatDay(start))} à ${start.slice(11, 16).replace(":", "h")}${course.salle && status === "modified" ? ` · salle ${course.salle}` : ""}`,
                path: "timetable",
            });
        });
    }

    return events;
}

/* ---------- Stockage ---------- */

export function readSnapshot(accountId) {
    return readJSON(SNAPSHOT_PREFIX + accountId, null);
}

export function writeSnapshot(accountId, snapshot) {
    localStorage.setItem(SNAPSHOT_PREFIX + accountId, JSON.stringify(snapshot));
}

export function readFeed(accountId) {
    return readJSON(FEED_PREFIX + accountId, []);
}

export function writeFeed(accountId, feed) {
    localStorage.setItem(FEED_PREFIX + accountId, JSON.stringify(feed.slice(0, MAX_FEED_LENGTH)));
}

/* ---------- Notifications systeme ---------- */

export function notificationsSupported() {
    return "Notification" in window;
}

export function notificationPermission() {
    return notificationsSupported() ? Notification.permission : "unsupported";
}

export async function requestNotificationPermission() {
    if (!notificationsSupported()) return "unsupported";
    return Notification.requestPermission();
}

async function showSystemNotification({ title, body, tag, url }) {
    const options = { body, tag, data: { url }, icon: "/images/EDP-logo-192.png" };
    // Android n'accepte que les notifications passant par le Service Worker.
    if ("serviceWorker" in navigator) {
        const registration = await navigator.serviceWorker.getRegistration();
        if (registration) {
            await registration.showNotification(title, options);
            return;
        }
    }
    new Notification(title, options);
}

/** Envoie les notifications systeme d'une liste d'evenements (deja filtres). */
export async function notifyEvents(events, accountIndex) {
    if (notificationPermission() !== "granted" || events.length === 0) return;
    const urlFor = (path) => `/app/${accountIndex}/${path}`;

    try {
        if (events.length <= MAX_SEPARATE_NOTIFICATIONS) {
            for (const event of events) {
                await showSystemNotification({ title: event.title, body: event.body, tag: event.id, url: urlFor(event.path) });
            }
            return;
        }

        const counts = {};
        events.forEach((event) => { counts[event.type] = (counts[event.type] ?? 0) + 1; });
        const parts = [
            counts.grade && `${counts.grade} note${counts.grade > 1 ? "s" : ""}`,
            counts.homework && `${counts.homework} devoir${counts.homework > 1 ? "s" : ""}`,
            counts.message && `${counts.message} message${counts.message > 1 ? "s" : ""}`,
            counts.course && `${counts.course} changement${counts.course > 1 ? "s" : ""} d'emploi du temps`,
        ].filter(Boolean);
        await showSystemNotification({
            title: `${events.length} nouveautés sur EDP`,
            body: parts.join(", "),
            tag: "edp-updates-summary",
            url: urlFor("dashboard"),
        });
    } catch (error) {
        console.warn("Impossible d'afficher la notification.", error);
    }
}

export async function sendTestNotification(accountIndex) {
    await showSystemNotification({
        title: "Notifications activées",
        body: "Tu seras prévenu des nouvelles notes, devoirs, messages et changements d'emploi du temps.",
        tag: "edp-test",
        url: `/app/${accountIndex}/dashboard`,
    });
}
