use include_flate::flate;
use tauri::{App, WebviewUrl, WebviewWindowBuilder};
use url::Url;

flate!(pub static INJECTION: str from "./injection/index.js");

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // Domaine servant le front. Doit correspondre a devUrl/frontendDist dans
    // tauri.conf.json.
    let app_url = Url::parse("https://ecoledirectplusmobile.vercel.app/login").unwrap();
    let app_url_external = WebviewUrl::External(app_url);
    let injection = INJECTION.clone();

    tauri::Builder::default()
        .plugin(tauri_plugin_http::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![])
        .setup(move |app: &mut App| {
          // NOTE: will trigger a warning on mobile builds since `mut` is unused.
          let mut win = WebviewWindowBuilder::new(app, "main", app_url_external)
                .disable_drag_drop_handler()
                // Garde-fou anti-crash Android.
                //
                // Le pont Android de Wry memorise chaque URL que le WebView
                // commence a charger et la parse avec `http::Uri`, puis
                // `unwrap()` le resultat. Une URL sans autorite (about:srcdoc,
                // data:..., blob:...) fait echouer ce parse. Le panic qui en
                // decoule traverse une frontiere C : il ne peut pas se derouler,
                // donc il abort le processus — SIGABRT, l'app se ferme d'un coup.
                //
                // On bloque donc la navigation vers tout ce qui n'est pas http(s),
                // c'est-a-dire exactement ce que ce parseur sait accepter.
                //
                // Effet de bord a connaitre : un telechargement via une URL
                // `blob:` est refuse par ce filtre. A revoir si les pieces
                // jointes doivent etre telechargeables depuis l'APK.
                .on_navigation(|url| matches!(url.scheme(), "http" | "https"))
                .user_agent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Safari/537.36")
                .initialization_script(
                    format!(
                        r#"
                          if (!window.__EDP_APP_INIT__) {{
                            window.__EDP_APP_INIT__ = true;
                            {injection}
                          }}
                        "#
                    )
                    .as_str(),
                );

            #[cfg(not(any(target_os = "ios", target_os = "android")))]
            {
                win = win
                  .title("Ecole Directe Plus")
                  .resizable(true)
                  .decorations(true)
                  .shadow(true)
                  .inner_size(1280.0, 720.0);
            }

            win.build()?;

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
