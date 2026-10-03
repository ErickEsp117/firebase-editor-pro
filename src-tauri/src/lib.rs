mod appearance;
mod files;
mod jwt;
mod secure_store;

#[cfg(test)]
mod native_http_tests;

use serde_json::Value;
#[cfg(not(debug_assertions))]
use tauri::Manager;

#[tauri::command]
fn native_appearance() -> appearance::NativeAppearance {
    appearance::current()
}

#[tauri::command]
fn sign_jwt(
    private_key_pem: String,
    header_json: Value,
    claims_json: Value,
) -> Result<String, String> {
    jwt::sign(&private_key_pem, header_json, claims_json)
}

#[tauri::command]
fn secure_store_get(key: String) -> Result<Option<String>, String> {
    secure_store::get(&key)
}

#[tauri::command]
fn secure_store_set(key: String, value: String) -> Result<(), String> {
    secure_store::set(&key, &value)
}

#[tauri::command]
fn secure_store_delete(key: String) -> Result<(), String> {
    secure_store::delete(&key)
}

#[tauri::command]
fn read_text_file(path: String) -> Result<files::TextFile, String> {
    files::read_text_file(&path)
}

#[tauri::command]
fn read_import_file(path: String) -> Result<files::TextFile, String> {
    files::read_import_file(&path)
}

#[tauri::command]
fn write_text_file(path: String, contents: String) -> Result<(), String> {
    files::write_text_file(&path, &contents)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let builder = tauri::Builder::default();
    // One installed process at a time: the keychain vault is cached in memory, so a second copy of the
    // app must not write back its own snapshot. A second launch focuses the running window instead.
    // Development builds use their own keychain service, so they may run next to the installed app.
    #[cfg(not(debug_assertions))]
    let builder = builder.plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
        if let Some(window) = app.get_webview_window("main") {
            let _ = window.unminimize();
            let _ = window.show();
            let _ = window.set_focus();
        }
    }));
    builder
        .plugin(
            tauri_plugin_log::Builder::new()
                .level(tauri_plugin_log::log::LevelFilter::Info)
                .build(),
        )
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_store::Builder::new().build())
        .plugin(tauri_plugin_http::init())
        .invoke_handler(tauri::generate_handler![
            native_appearance,
            sign_jwt,
            secure_store_get,
            secure_store_set,
            secure_store_delete,
            read_text_file,
            read_import_file,
            write_text_file
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
