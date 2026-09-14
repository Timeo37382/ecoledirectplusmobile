# Construire l'APK Android — pas à pas (Windows)

## Avant de commencer : l'ordre compte

L'APK **n'embarque pas le site**. C'est une coquille native qui ouvre une URL et
remplace `window.fetch` par le client HTTP natif de Tauri — c'est précisément ce
qui permet de se passer de l'extension et de sortir par ta propre IP.

Donc : **le front doit être en ligne avant que l'APK serve à quoi que ce soit.**
Déployer sur Vercel prend 5 minutes, installer la chaîne Android en prend une à
deux heures (téléchargements). Commence par Vercel, même si ton objectif est
l'APK — tu auras une URL à mettre dans la config, et tu pourras déjà tester sur
iPhone pendant que le SDK Android se télécharge.

---

## Étape 0 — Mettre le front en ligne

```bash
npm install
npm run build
```

Importe le dépôt sur Vercel (il détecte Vite et lit `vercel.json` tout seul).
Note l'URL obtenue, par exemple `https://mon-edp.vercel.app`.

Vérifie dans un navigateur que `https://ton-url/login` s'affiche. Si oui, tu peux
déjà l'installer sur iPhone (Safari → Partager → Sur l'écran d'accueil).

---

## Étape 1 — Renseigner ton URL

Remplace `TON-DOMAINE.fr` par ton domaine dans **les deux** fichiers :

**`src-tauri/tauri.conf.json`**

```json
"devUrl": "https://mon-edp.vercel.app/login",
"frontendDist": "https://mon-edp.vercel.app/login"
```

**`src-tauri/src/lib.rs`** — c'est cette ligne qui décide réellement de ce que la
fenêtre ouvre, `tauri.conf.json` ne suffit pas :

```rust
let app_url = Url::parse("https://mon-edp.vercel.app/login").unwrap();
```

---

## Étape 2 — Rust

Installe [rustup](https://rustup.rs) en choisissant la **toolchain MSVC**
(`x86_64-pc-windows-msvc`). Il te demandera les Visual Studio Build Tools s'ils
manquent — accepte.

Puis ajoute les cibles Android :

```powershell
rustup target add aarch64-linux-android armv7-linux-androideabi i686-linux-android x86_64-linux-android
```

Vérifie : `rustc --version` doit répondre.

---

## Étape 3 — Android Studio

Installe [Android Studio](https://developer.android.com/studio), puis dans
**SDK Manager → SDK Tools**, coche et installe :

- Android SDK Platform (API 34 — c'est ce que cible le projet)
- Android SDK Platform-Tools
- Android SDK Build-Tools
- **NDK (Side by side)**
- Android SDK Command-line Tools

Le NDK est le gros morceau (~2 Go), c'est lui qui prend du temps.

---

## Étape 4 — Variables d'environnement

Dans PowerShell :

```powershell
[System.Environment]::SetEnvironmentVariable("JAVA_HOME", "C:\Program Files\Android\Android Studio\jbr", "User")
[System.Environment]::SetEnvironmentVariable("ANDROID_HOME", "$env:LocalAppData\Android\Sdk", "User")

$VERSION = Get-ChildItem -Name "$env:LocalAppData\Android\Sdk\ndk" | Select-Object -Last 1
[System.Environment]::SetEnvironmentVariable("NDK_HOME", "$env:LocalAppData\Android\Sdk\ndk\$VERSION", "User")
```

**Ferme et rouvre ton terminal**, sinon les variables ne sont pas prises en
compte. Vérifie :

```powershell
echo $env:JAVA_HOME; echo $env:ANDROID_HOME; echo $env:NDK_HOME
```

Les trois doivent afficher un chemin qui existe.

---

## Étape 5 — Premier test, sur ton téléphone branché

C'est le chemin le plus rapide pour voir si ça marche : pas d'APK à générer ni à
installer à la main.

Sur le téléphone : **Paramètres → À propos → appuyer 7 fois sur « Numéro de
build »** pour débloquer les options développeur, puis **Options pour les
développeurs → Débogage USB**. Branche-le en USB et accepte la demande
d'autorisation qui s'affiche.

Vérifie qu'il est vu :

```powershell
adb devices
```

Puis, à la racine du projet :

```powershell
npm install
npx tauri android dev
```

L'app se compile et se lance directement sur le téléphone. **C'est ici que tu
sauras si ça fonctionne** : tu dois voir ton site, et pouvoir te connecter sans
qu'on te réclame l'extension.

---

## Étape 6 — Générer l'APK à distribuer

Une fois le test concluant :

```powershell
npx tauri android build --apk --debug
```

**Garde bien `--debug`.** Le `gen/android/app/build.gradle.kts` du projet exige
un fichier `keystore.properties` pour les builds *release* — sans lui, le build
échoue avec une erreur de cast sur `keyAlias`. Le mode debug signe l'APK avec la
clé de debug d'Android, ce qui suffit largement pour installer l'app à la main.

L'APK sort dans `src-tauri/gen/android/app/build/outputs/apk/` (le nom exact du
sous-dossier dépend de la variante ; regarde dedans, il n'y en a qu'un).

Envoie ce fichier à tes amis. À l'installation Android affichera un
avertissement « source inconnue » : c'est normal pour un APK hors Play Store, il
faut autoriser l'installation depuis l'app qui transmet le fichier.

---

## Si tu veux une vraie signature plus tard

Pour que les mises à jour s'installent par-dessus au lieu d'être refusées, il
faut une clé stable :

```powershell
keytool -genkey -v -keystore upload-keystore.jks -keyalg RSA -keysize 2048 -validity 10000 -alias upload
```

Puis créer `src-tauri/gen/android/keystore.properties` :

```properties
storeFile=C:/chemin/vers/upload-keystore.jks
keyAlias=upload
password=TON_MOT_DE_PASSE
```

Et builder sans `--debug`. Ne commite jamais ce fichier ni le `.jks`.

---

## En cas de pépin

**« NDK not found »** — `NDK_HOME` mal réglée, ou terminal pas redémarré.

**L'app s'ouvre sur une page blanche** — l'URL de `lib.rs` est fausse, ou le
front n'est pas en ligne. Teste l'URL dans le navigateur du téléphone.

**On te réclame l'extension EDP Unblock dans l'app** — l'injection n'a pas pris.
Ça signifie que `src-tauri/injection/index.js` n'a pas tourné ; vérifie que tu
n'as pas modifié `lib.rs` au-delà de l'URL.

**Le build release échoue sur `keyAlias`** — c'est le `--debug` manquant.

**Tu veux installer ton APK à côté de l'app officielle** — il faut changer
`identifier` dans `tauri.conf.json` pour un nom **sans tiret** (par exemple
`fr.monedp.app`), puis supprimer `src-tauri/gen/android` et relancer
`npx tauri android init`, car le package est figé dans le projet Gradle généré.
