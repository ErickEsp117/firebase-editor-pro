use serde::Serialize;

#[derive(Serialize)]
pub struct NativeAppearance {
    pub platform: &'static str,
    pub vibrancy: bool,
    pub accent: Option<String>,
}

pub fn current() -> NativeAppearance {
    NativeAppearance {
        platform: std::env::consts::OS,
        vibrancy: vibrancy_supported(),
        accent: accent_hex(),
    }
}

#[cfg(target_os = "macos")]
fn accent_hex() -> Option<String> {
    use objc2_app_kit::{NSColor, NSColorSpace};
    // controlAccentColor is dynamic; it resolves against the current appearance.
    let c = NSColor::controlAccentColor().colorUsingColorSpace(&NSColorSpace::sRGBColorSpace())?;
    Some(rgb_hex(
        c.redComponent(),
        c.greenComponent(),
        c.blueComponent(),
    ))
}

#[cfg(windows)]
fn accent_hex() -> Option<String> {
    use windows::UI::ViewManagement::{UIColorType, UISettings};
    let c = UISettings::new()
        .ok()?
        .GetColorValue(UIColorType::Accent)
        .ok()?;
    Some(format!("#{:02X}{:02X}{:02X}", c.R, c.G, c.B))
}

#[cfg(not(any(target_os = "macos", windows)))]
fn accent_hex() -> Option<String> {
    None
}

#[cfg(target_os = "macos")]
fn vibrancy_supported() -> bool {
    true
}

#[cfg(windows)]
fn vibrancy_supported() -> bool {
    windows_version::OsVersion::current().build >= 22000
}

#[cfg(not(any(target_os = "macos", windows)))]
fn vibrancy_supported() -> bool {
    false
}

#[cfg(any(target_os = "macos", test))]
fn rgb_hex(red: f64, green: f64, blue: f64) -> String {
    let to = |value: f64| (value.clamp(0.0, 1.0) * 255.0).round() as u8;
    format!("#{:02X}{:02X}{:02X}", to(red), to(green), to(blue))
}

#[cfg(test)]
mod tests {
    #[test]
    fn accent_is_a_clamped_six_digit_rgb_color() {
        assert_eq!(super::rgb_hex(0.0, 0.5, 1.0), "#0080FF");
        assert_eq!(super::rgb_hex(-1.0, 2.0, 0.0), "#00FF00");
    }
}
