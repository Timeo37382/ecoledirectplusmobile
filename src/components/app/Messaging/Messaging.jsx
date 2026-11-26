import { useState, useRef, useEffect, useContext } from "react";
import { useNavigate, useLocation, Navigate, Link } from "react-router-dom";

import {
    WindowsContainer,
    WindowsLayout,
    Window,
    WindowHeader,
    WindowContent
} from "../../generic/Window";

import { AppContext } from "../../../App";

import "./Messaging.css";
import Inbox from "./Inbox";
import MessageReader from "./MessageReader";
import { Tooltip, TooltipContent, TooltipTrigger } from "../../generic/PopUps/Tooltip";
import FolderIcon from "../../graphics/FolderIcon";
import InboxIcon from "../../graphics/InboxIcon";
import SendIcon from "../../graphics/SendIcon";
import ArchiveIcon from "../../graphics/ArchiveIcon";
import EditIcon from "../../graphics/EditIcon";
import DeleteIcon from "../../graphics/DeleteIcon";
import RenameIcon from "../../graphics/RenameIcon";
import NewFolderIcon from "../../graphics/NewFolderIcon";
import DraftIcon from "../../graphics/DraftIcon";
import { capitalizeFirstLetter } from "../../../utils/utils";
import TextInput from "../../generic/UserInputs/TextInput";
import MessageComposer from "./MessageComposer";
import { useCreateNotification } from "../../generic/PopUps/Notification";
import { decodeBase64 } from "../../../utils/utils";


export default function Messaging({ isLoggedIn, activeAccount, fetchMessages, fetchMessageContent, fetchMessageMarkAsUnread, renameFolder, deleteFolder, createFolder, archiveMessage, unarchiveMessage, moveMessage, deleteMessage, fetchMessageContacts, sendMessage }) {
    // States
    const navigate = useNavigate();
    const location = useLocation();

    const { accountsListState, useUserData, isTabletLayout } = useContext(AppContext);
    const [selectedMessage, setSelectedMessage] = useState(null);
    const [selectedFolder, setSelectedFolder] = useState(0);
    const oldSelectedMessage = useRef(selectedMessage);
    const lastSyncedSelection = useRef(selectedMessage);
    const messages = useUserData("sortedMessages");
    const [folders, setFolders] = useState(useUserData("messageFolders").get());
    useEffect(() => {
        // Update the local state with the latest data
        setFolders(useUserData("messageFolders").get());
    }, [useUserData("messageFolders").get()]);


    const module = accountsListState[activeAccount].modules?.find(module => module.code === "MESSAGERIE");
    let canSendMessages =   (module?.params?.destAdmin ?? "1") === "1" || 
                            (module?.params?.destEleve ?? "1") === "1" || 
                            (module?.params?.destFamille ?? "1") === "1" || 
                            (module?.params?.destProf ?? "1") === "1" || 
                            (module?.params?.destEspTravail ?? "1") === "1";
    if (accountsListState[activeAccount].accountType !== "E") {
        canSendMessages = true;
    }

    // Destinataires autorises par l'etablissement (module MESSAGERIE).
    const allowedContactKinds = accountsListState[activeAccount].accountType !== "E"
        ? ["professeurs", "personnels"]
        : [
            (module?.params?.destProf ?? "1") === "1" ? "professeurs" : null,
            (module?.params?.destAdmin ?? "1") === "1" ? "personnels" : null,
        ].filter(Boolean);
    const canCompose = canSendMessages && allowedContactKinds.length > 0 && typeof sendMessage === "function";

    // Message en cours d'ecriture : null, ou { recipients, subject, responseId, quotedHTML }.
    const [composerDraft, setComposerDraft] = useState(null);
    const createNotification = useCreateNotification();

    const openComposer = (draft = {}) => {
        setComposerDraft({ recipients: [], subject: "", ...draft, key: Date.now() });
    };

    const startReply = (message) => {
        const from = message.from ?? {};
        const recipients = from.id !== undefined && from.role
            ? [{ id: from.id, type: from.role, nom: from.nom, prenom: from.prenom, civilite: from.civilite, particule: from.particule ?? "" }]
            : [];
        let quotedHTML = "";
        if (message.content?.content) {
            try {
                const author = [from.civilite, from.prenom, from.nom].filter(Boolean).join(" ");
                const date = new Date(message.date).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit" });
                quotedHTML = `<br><br><b>Le ${date}, ${author} a écrit :</b><blockquote>${decodeBase64(message.content.content)}</blockquote>`;
            } catch {
                quotedHTML = "";
            }
        }
        const subject = /^re\s*:/i.test(message.subject ?? "") ? message.subject : `RE : ${message.subject ?? ""}`;
        openComposer({ recipients, subject, responseId: message.id, quotedHTML });
    };

    const handleComposerDone = ({ isDraft, guest }) => {
        setComposerDraft(null);
        createNotification(
            <>
                <h4>{isDraft ? "Brouillon enregistré" : "Message envoyé"}</h4>
                {guest && <p>Mode démonstration : rien n'a réellement été envoyé.</p>}
            </>,
            { timer: 4000 }
        );
    };

    const selectMessageFromInbox = (id) => {
        setComposerDraft(null);
        setSelectedMessage(id);
    };

    const [isEditingFolder, setIsEditingFolder] = useState(false);
    const [newFolderName, setNewFolderName] = useState('');

    // behavior
    useEffect(() => {
        document.title = "Messagerie • Ecole Directe Plus";
    }, []);

    useEffect(() => {
        const controller = new AbortController();
        if (isLoggedIn) {
            if (folders === undefined || !folders.find((folder) => folder.id === selectedFolder)?.fetchInitiated) {
                fetchMessages(selectedFolder, controller);
            }
        }

        return () => {
            controller.abort();
        }
    }, [isLoggedIn, activeAccount, selectedFolder, messages.get(), folders]);

    useEffect(() => {
        if (messages.get() === undefined) {
            return;
        }
        if (["#patch-notes", "#policy", "#feedback"].includes(location.hash)) {
            return;
        }
        // Distingue "l'utilisateur a choisi un autre message" (on met l'URL a
        // jour) de "l'URL a change sans que la selection change" (bouton
        // Retour du navigateur / d'Android). Avant, dans le second cas, le
        // message etait aussitot rouvert et le bouton Retour restait piege.
        const selectionChanged = lastSyncedSelection.current !== selectedMessage;
        lastSyncedSelection.current = selectedMessage;
        const hashMessage = parseInt(location.hash.slice(location.hash.lastIndexOf('-') + 1));
        if (selectedMessage !== null && !selectionChanged && isNaN(hashMessage)) {
            setSelectedMessage(null);
            return;
        }
        if (!selectionChanged && !isNaN(hashMessage) && hashMessage !== selectedMessage) {
            // L'URL designe un autre message (historique, lien) : c'est l'effet
            // suivant qui adopte la selection depuis l'URL. Ne pas la reecrire.
            return;
        }

        const controller = new AbortController();
        if (selectedMessage !== null) {
            fetchMessageContent(selectedMessage, controller);
            const parsedHashMessage = parseInt(location.hash.slice(location.hash.lastIndexOf('-') + 1));
            const parsedHashFolder = parseInt(location.hash.slice(1, location.hash.lastIndexOf('-')));
            if (parsedHashMessage !== selectedMessage || parsedHashFolder !== selectedFolder) {
                const newHash = "#" +  selectedFolder + '-' + selectedMessage;
                navigate(newHash);
            }
        } else {
            if (location.hash) {
                // replace : fermer un message ne doit pas empiler une entree
                // d'historique de plus.
                navigate("#", { replace: true });
            }
        }

        return () => {
            controller.abort();
        }
    }, [location, selectedMessage, messages.get()]);

    useEffect(() => {
        if (oldSelectedMessage.current !== selectedMessage) {
            return;
        }
        if (["#patch-notes", "#policy", "#feedback"].includes(location.hash)) {
            return;
        }
        const parsedHashMessage = parseInt(location.hash.slice(location.hash.lastIndexOf('-') + 1));
        const parsedHashFolder = parseInt(location.hash.slice(1, location.hash.lastIndexOf('-')));

        if (!isNaN(parsedHashMessage) && !isNaN(parsedHashFolder)  && parsedHashMessage !== selectedMessage) {
            if (messages.get()) {
                const doesMessageExist = messages.get()?.findIndex((item) => item.id === parsedHashMessage) !== -1;
                if (doesMessageExist) {
                    setSelectedFolder(parsedHashFolder);
                    setSelectedMessage(parsedHashMessage);
                } else {
                    setSelectedFolder(parsedHashFolder);
                    // now we need to fetch the message for the selected folder
                    const controller = new AbortController();
                    fetchMessages(parsedHashFolder, controller);

                    // now we need to select the message after fetching the messages
                    setTimeout(() => {
                        setSelectedMessage(parsedHashMessage);
                    }, 0);
                }
            }
        }
    }, [location, messages.get(), oldSelectedMessage.current, selectedMessage]);

    useEffect(() => {
        oldSelectedMessage.current = selectedMessage;
    }, [selectedMessage]);

    // Telephone et tablette : on bascule entre la liste et le message ; on
    // repart du haut de la page a chaque bascule.
    useEffect(() => {
        if (isTabletLayout) {
            const main = document.querySelector("main.content");
            if (main) {
                main.scrollTo({ top: 0, behavior: "instant" });
            }
        }
    }, [selectedMessage]);

    useEffect(() => {
        if (!isEditingFolder) {
            const currentFolder = folders?.find((item) => item.id === selectedFolder);
            if (currentFolder) {
                setNewFolderName(currentFolder.name);
            }
        }
    }, [selectedFolder, folders, isEditingFolder]);



    const handleRenameSave = async () => {
        if (newFolderName.trim() !== '') {
            if (selectedFolder === -3) {
                const controller = new AbortController();
                let newFolder = await createFolder(newFolderName, controller);
                setTimeout(() => setSelectedFolder(newFolder), 0);
                // refresh the folder list and title
            } else {
                await renameFolder(selectedFolder, newFolderName); // Call the rename function with folder ID and new name
            }
            setTimeout(() => setIsEditingFolder(false), 0); // Exit editing mode
        }
    };

    const handleRenameCancel = () => {
        setIsEditingFolder(false);
        setNewFolderName(folders?.find((item) => item.id === selectedFolder)?.name || '');
        if (selectedFolder === -3) {
            setSelectedFolder(0);
        }
    };

    // cancel editiing on click outside of the input
    useEffect(() => {
        const handleClickOutside = (event) => {
            if (isEditingFolder && !event.target.closest('.edit-folder-name-container')) {
                handleRenameCancel();
            }
        };

        if (isEditingFolder) {
            document.addEventListener('mousedown', handleClickOutside);
        } else {
            document.removeEventListener('mousedown', handleClickOutside);
        }

        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
        };
    }, [isEditingFolder]);


    // cancel editing on escape key
    useEffect(() => {
        const handleKeyDown = (event) => {
            if (event.key === 'Escape') {
                handleRenameCancel();
            }
        };

        if (isEditingFolder) {
            document.addEventListener('keydown', handleKeyDown);
        } else {
            document.removeEventListener('keydown', handleKeyDown);
        }

        return () => {
            document.removeEventListener('keydown', handleKeyDown);
        };
    }, [isEditingFolder]);

    useEffect(() => {
        // use code 13 for enter key hint
        const handleKeyDown = (event) => {
            if (event.keyCode === 13 || event.key === 'Enter') {
                handleRenameSave();
            }
        };

        if (isEditingFolder) {
            document.addEventListener('keypress', handleKeyDown);
        } else {
            document.removeEventListener('keypress', handleKeyDown);
        }

        return () => {
            document.removeEventListener('keypress', handleKeyDown);
        };
    }, [isEditingFolder, newFolderName]);
            
    // changing folder should exit editing mode
    useEffect(() => {
        setIsEditingFolder(false);
    }, [selectedFolder]);

    // Disposition empilee (telephone, tablette) : une seule vue a la fois,
    // comme une messagerie mobile classique. La liste, ou le message ouvert
    // avec un bouton Retour. Voir Messaging.css.
    const stackedViewClass = isTabletLayout
        ? ((selectedMessage !== null || composerDraft !== null) ? "stacked show-reader" : "stacked show-inbox")
        : "";

    // JSX
    return (
        <div id="messaging" className={stackedViewClass}>
            <WindowsContainer name="timetable" allowWindowsManagement={!isEditingFolder}>
                <WindowsLayout direction="row" ultimateContainer={true}>
                    <Window allowFullscreen={true} className="inbox-window">
                        <WindowHeader className="inbox-window-header">
                            {folders !== undefined && folders.length > 1
                                ? <Tooltip className="folder-tooltip" placement="bottom" closeOnClickInside={isTabletLayout} onClick={(event) => event.stopPropagation()}>
                                    <TooltipTrigger> <FolderIcon className="folder-icon" /> </TooltipTrigger>
                                    <TooltipContent className="no-questionmark">
                                        <h3>Dossiers</h3>
                                        <ul className="folders-container">
                                            {folders
                                                .filter((folder) => folder.id !== -3)
                                                // if canSendMessages is false, we don't show the drafts folder and the sent folder
                                                .filter((folder) => canSendMessages || folder.id !== -4)
                                                .sort((a, b) => {
                                                    const order = [0, -1, -2, -4];
                                                    const indexA = order.indexOf(a.id);
                                                    const indexB = order.indexOf(b.id);
                                                    if (indexA === -1 && indexB === -1) return 0;
                                                    if (indexA === -1) return 1;
                                                    if (indexB === -1) return -1;
                                                    return indexA - indexB;
                                                })
                                                .map((folder) => (
                                                    <li key={folder.id} className="folder-button-container">
                                                        <button 
                                                            onClick={() => {
                                                                setSelectedFolder(folder.id)
                                                                setSelectedMessage(null);
                                                            }} 
                                                            className={`folder-button ${folder.id === selectedFolder ? 'selected-folder' : ''}`}
                                                        >
                                                            {folder.id === 0 ? <InboxIcon className="folder-icon-tooltip" /> : folder.id === -1 ? <SendIcon className="folder-icon-tooltip" /> : folder.id === -2 ? <ArchiveIcon className="folder-icon-tooltip" /> : folder.id === -4 ? <DraftIcon className="folder-icon-tooltip" /> : <FolderIcon className="folder-icon-tooltip" />}
                                                            {capitalizeFirstLetter(folder.name)}
                                                        </button>
                                                    </li>
                                                ))}
                                            <li className="folder-button-container">
                                                <button onClick={
                                                    () => {
                                                        if (!isEditingFolder) {
                                                            setSelectedFolder(-3);
                                                            setNewFolderName('Nouveau dossier');
                                                            setTimeout(() => setIsEditingFolder(true), 0);
                                                            setSelectedMessage(null);
                                                        }
                                                    }
                                                } className="folder-button create-folder"><NewFolderIcon className="folder-icon-tooltip" />Créer un dossier</button>
                                            </li>
                                        </ul>
                                    </TooltipContent>
                                </Tooltip>
                                : null
                            }

                            {selectedFolder !== 0 && selectedFolder !== -1 && selectedFolder !== -2 && selectedFolder !== -4 && selectedFolder !== -3
                                ? <Tooltip className="edit-folder-tooltip" placement="bottom" onClick={(event) => event.stopPropagation()}>
                                    <TooltipTrigger> <EditIcon className="edit-folder-icon" /> </TooltipTrigger>
                                    <TooltipContent>
                                        <h3>Modifier le dossier</h3>
                                        <ul className="edit-folder-container">
                                            <li className="edit-folder-button-container">
                                                <button className="edit-folder-button" onClick={() => setIsEditingFolder(true)}><RenameIcon className="edit-folder-icon-tooltip" />Renommer</button>
                                            </li>
                                            <li className="edit-folder-button-container">
                                                <button className="edit-folder-button delete" onClick={async () => {
                                                    // if the folder dosn't contain any message, we can delete it directly but if it contains messages, we need to move them to the inbox
                                                    if (messages.get().filter((message) => message.folderId === selectedFolder).length > 0) {
                                                        await moveMessage(messages.get().filter((message) => message.folderId === selectedFolder).map((message) => message.id), 0);
                                                    }
                                                    deleteFolder(selectedFolder);
                                                    setSelectedFolder(0);
                                                }}><DeleteIcon className="edit-folder-icon-tooltip delete testeee" />Supprimer</button>
                                            </li>
                                        </ul>
                                    </TooltipContent>
                                </Tooltip>
                                : null
                            }
                            
                            {isEditingFolder ? (
                                <div className="edit-folder-name-container">
                                    <TextInput
                                        value={capitalizeFirstLetter(newFolderName)}
                                        onChange={(e) => setNewFolderName(e.target.value)}
                                        className="edit-folder-name-input"
                                        autoFocus
                                        onFocus={(e) => e.target.select()}
                                        enterKeyHint = "done"
                                    />
                                </div>
                            ) : (
                                    <div className="MessagesTitle-container">
                                        <h2 id="MessagesTitle" onClick={() => { if (selectedFolder !== 0 && selectedFolder !== -1 && selectedFolder !== -2 && selectedFolder !== -4) { setIsEditingFolder(true) } }} className={selectedFolder === 0 || selectedFolder === -1 || selectedFolder === -2 || selectedFolder === -4 ? "prevent-highlight" : ""}>
                                            {selectedFolder !== -3
                                                ? capitalizeFirstLetter(folders?.find((item) => item.id === selectedFolder)?.name ?? "Boîte de réception")
                                                : "Créer un dossier"
                                            }
                                        </h2>
                                    </div>
                            )}
                        </WindowHeader>
                        <WindowContent>
                            {canCompose && !isEditingFolder && (
                                <button type="button" className="compose-message-button" onClick={() => openComposer()}>
                                    <span aria-hidden="true">✎</span> Nouveau message
                                </button>
                            )}
                            <Inbox selectedMessage={selectedMessage} setSelectedMessage={selectMessageFromInbox} selectedFolder={selectedFolder} fetchMessageMarkAsUnread={fetchMessageMarkAsUnread} />
                        </WindowContent>
                    </Window>
                    <Window growthFactor={3} className="message-content" allowFullscreen={true}>
                        <WindowHeader className="message-reader-window-header">
                            {isTabletLayout && (
                                <button
                                    type="button"
                                    className="message-back-button"
                                    onClick={() => composerDraft !== null ? setComposerDraft(null) : setSelectedMessage(null)}
                                    aria-label={composerDraft !== null ? "Fermer sans envoyer" : "Retour à la liste des messages"}
                                >
                                    <span aria-hidden="true">‹</span> Retour
                                </button>
                            )}
                            <h2>{composerDraft === null ? "Message" : composerDraft.responseId ? "Répondre" : "Nouveau message"}</h2>
                        </WindowHeader>
                        <WindowContent>
                            {composerDraft !== null
                                ? <MessageComposer
                                    key={composerDraft.key}
                                    draft={composerDraft}
                                    allowedKinds={allowedContactKinds}
                                    fetchMessageContacts={fetchMessageContacts}
                                    sendMessage={sendMessage}
                                    onClose={() => setComposerDraft(null)}
                                    onDone={handleComposerDone}
                                />
                                : <MessageReader selectedMessage={selectedMessage} fetchMessageMarkAsUnread={fetchMessageMarkAsUnread} setSelectedMessage={setSelectedMessage} archiveMessage={archiveMessage} unarchiveMessage={unarchiveMessage} moveMessage={moveMessage} deleteMessage={deleteMessage} onReply={canCompose ? startReply : null} />
                            }
                        </WindowContent>
                    </Window>
                </WindowsLayout>
            </WindowsContainer>
        </div>
    );
}