use std::path::{Path, PathBuf};

#[cfg(target_os = "macos")]
use std::process::Command;

// argv0 stays on this list so the webview cannot turn the Terminal launcher
// into a general shell. A new agent is a new row here and in the frontend catalog.
const ALLOWED_COMMANDS: &[&str] = &[
    "claude",
    "grok",
    "codex",
    "gemini",
    "opencode",
    "cursor-agent",
    "copilot",
    "aider",
    "cline",
    "droid",
    "qwen",
    "kiro-cli",
];

#[cfg(target_os = "macos")]
const SCRIPT: &str = r#"on run argv
  if (count of argv) is 0 then error "missing command"
  tell application "Terminal"
    activate
    do script (item 1 of argv)
  end tell
end run"#;

fn shell_quote(value: &str) -> String {
    format!("'{}'", value.replace('\'', "'\\''"))
}

fn shell_line(cwd: &Path, args: &[String]) -> String {
    let command = args
        .iter()
        .map(|arg| shell_quote(arg))
        .collect::<Vec<_>>()
        .join(" ");
    format!("cd {} && {}", shell_quote(&cwd.to_string_lossy()), command)
}

fn validate_args(args: &[String]) -> Result<(), String> {
    let program = args.first().ok_or("missing command")?;
    if !ALLOWED_COMMANDS.contains(&program.as_str()) {
        return Err("unknown handoff command".into());
    }
    if args.iter().any(|arg| arg.is_empty() || arg.contains('\0')) {
        return Err("invalid handoff argument".into());
    }
    let total: usize = args.iter().map(|arg| arg.len()).sum();
    if total > 100_000 {
        return Err("handoff instruction is too long".into());
    }
    Ok(())
}

fn handoff_dir() -> PathBuf {
    std::env::temp_dir().join("mdplus-handoff")
}

fn validate_handoff_id(id: &str) -> Result<(), String> {
    if id.is_empty() || id.len() > 64 || !id.chars().all(|c| c.is_ascii_alphanumeric() || c == '-')
    {
        return Err("invalid handoff id".into());
    }
    Ok(())
}

/// Writes an untitled or URL-opened note to a temp `.md` the agent can read.
#[tauri::command]
pub fn write_handoff_file(id: String, content: String) -> Result<String, String> {
    validate_handoff_id(&id)?;
    let dir = handoff_dir();
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    let path = dir.join(format!("{id}.md"));
    std::fs::write(&path, content.as_bytes()).map_err(|e| e.to_string())?;
    Ok(path.to_string_lossy().into_owned())
}

/// Opens Terminal.app in `cwd` and runs `args` as one quoted command.
#[tauri::command]
pub fn open_in_terminal(cwd: String, args: Vec<String>) -> Result<(), String> {
    validate_args(&args)?;
    let cwd = PathBuf::from(&cwd);
    if !cwd.is_absolute() || !cwd.is_dir() {
        return Err("working directory is not available".into());
    }
    let line = shell_line(&cwd, &args);

    #[cfg(target_os = "macos")]
    {
        let output = Command::new("osascript")
            .arg("-e")
            .arg(SCRIPT)
            .arg(&line)
            .output()
            .map_err(|e| e.to_string())?;
        if output.status.success() {
            return Ok(());
        }
        let stderr = String::from_utf8_lossy(&output.stderr);
        let message = stderr.trim();
        if message.is_empty() {
            return Err("couldn't open Terminal".into());
        }
        return Err(message.to_string());
    }

    #[cfg(not(target_os = "macos"))]
    {
        let _ = line;
        Err("handoff opens Terminal on macOS".into())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn quotes_spaces_and_quotes() {
        let line = shell_line(
            Path::new("/Users/me/My Notes"),
            &["claude".into(), "--".into(), "it's a file".into()],
        );
        assert_eq!(
            line,
            "cd '/Users/me/My Notes' && 'claude' '--' 'it'\\''s a file'"
        );
    }

    #[test]
    fn rejects_an_unlisted_program() {
        assert!(validate_args(&["bash".into(), "-c".into(), "rm".into()]).is_err());
    }
}
