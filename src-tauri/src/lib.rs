mod jwt;
mod secure_store;

use serde_json::Value;

#[tauri::command]
fn sign_jwt(private_key_pem: String, header_json: Value, claims_json: Value) -> Result<String, String> {
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

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(
            tauri_plugin_log::Builder::new()
                .level(tauri_plugin_log::log::LevelFilter::Info)
                .build(),
        )
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_store::Builder::new().build())
        .plugin(tauri_plugin_http::init())
        .invoke_handler(tauri::generate_handler![
            sign_jwt,
            secure_store_get,
            secure_store_set,
            secure_store_delete
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
