fn main() {
    // Icon files are embedded by tauri_build. Cargo will not notice a new
    // icon.icns unless this script asks it to watch the folder.
    println!("cargo:rerun-if-changed=icons");
    tauri_build::build()
}
