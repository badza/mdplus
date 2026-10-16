use url::Url;

const MAX_BYTES: usize = 2 * 1024 * 1024;

#[derive(Debug)]
pub struct RemoteTarget {
    pub fetch_url: String,
    pub display_url: String,
    pub title: String,
}

/// Turn a pasted link into the URL we should GET. GitHub, GitLab, Gitea,
/// Bitbucket, and SourceHut web pages become the raw file. The display URL
/// is safe to show in the window: no username, password, or token query.
pub fn normalize_markdown_url(input: &str) -> Result<RemoteTarget, &'static str> {
    let trimmed = input.trim();
    if trimmed.is_empty() {
        return Err("empty");
    }
    let with_scheme = if trimmed.contains("://") {
        trimmed.to_string()
    } else {
        format!("https://{trimmed}")
    };
    let mut url = Url::parse(&with_scheme).map_err(|_| "scheme")?;
    match url.scheme() {
        "http" | "https" => {}
        _ => return Err("scheme"),
    }
    url.set_fragment(None);
    rewrite(&mut url);
    let title = file_title(&url);
    let display_url = display_url(&url);
    Ok(RemoteTarget {
        fetch_url: url.to_string(),
        display_url,
        title,
    })
}

pub fn body_too_large(len: usize) -> bool {
    len > MAX_BYTES
}

pub fn looks_like_html(content_type: &str, body: &str) -> bool {
    if content_type.to_ascii_lowercase().contains("text/html") {
        return true;
    }
    let head: String = body
        .trim_start()
        .chars()
        .take(32)
        .collect::<String>()
        .to_ascii_lowercase();
    head.starts_with("<!doctype html") || head.starts_with("<html") || head.starts_with("<head")
}

fn host_name(url: &Url) -> String {
    url.host_str()
        .unwrap_or("")
        .trim_start_matches("www.")
        .to_ascii_lowercase()
}

fn rewrite(url: &mut Url) {
    let host = host_name(url);
    let path = url.path().to_string();
    if host == "github.com" {
        let mut parts: Vec<&str> = path.split('/').filter(|part| !part.is_empty()).collect();
        if parts.len() >= 4 && (parts[2] == "blob" || parts[2] == "raw") {
            parts.remove(2);
            let _ = url.set_scheme("https");
            let _ = url.set_host(Some("raw.githubusercontent.com"));
            url.set_path(&format!("/{}", parts.join("/")));
            url.set_query(None);
        }
        return;
    }
    if host == "gist.github.com" {
        let parts: Vec<&str> = path.split('/').filter(|part| !part.is_empty()).collect();
        if parts.len() >= 2 {
            let user = parts[0];
            let id = parts[1];
            let rest = if parts.len() > 2 {
                parts[2..].join("/")
            } else {
                String::new()
            };
            let raw_path = if rest.is_empty() {
                format!("/{user}/{id}/raw")
            } else if rest == "raw" || rest.starts_with("raw/") {
                format!("/{user}/{id}/{rest}")
            } else {
                format!("/{user}/{id}/raw/{rest}")
            };
            let _ = url.set_scheme("https");
            let _ = url.set_host(Some("gist.githubusercontent.com"));
            url.set_path(&raw_path);
            url.set_query(None);
        }
        return;
    }
    if host == "bitbucket.org" {
        if let Some(rewritten) = replace_once(&path, "/src/", "/raw/") {
            url.set_path(&rewritten);
            url.set_query(None);
        }
        return;
    }
    if host == "git.sr.ht" || host.ends_with(".sr.ht") {
        if let Some(rewritten) = rewrite_sourcehut(&path) {
            url.set_path(&rewritten);
            url.set_query(None);
        }
        return;
    }
    if let Some(rewritten) = replace_once(&path, "/-/blob/", "/-/raw/") {
        url.set_path(&rewritten);
        url.set_query(None);
        return;
    }
    if let Some(rewritten) = rewrite_gitea(&path) {
        url.set_path(&rewritten);
        url.set_query(None);
    }
}

fn rewrite_gitea(path: &str) -> Option<String> {
    for (from, to) in [
        ("/src/branch/", "/raw/branch/"),
        ("/src/commit/", "/raw/commit/"),
        ("/src/tag/", "/raw/tag/"),
    ] {
        if let Some(rewritten) = replace_once(path, from, to) {
            return Some(rewritten);
        }
    }
    None
}

fn rewrite_sourcehut(path: &str) -> Option<String> {
    let tree_at = path.find("/tree/")?;
    let after_tree = tree_at + "/tree/".len();
    let item_rel = path[after_tree..].find("/item/")?;
    let item_at = after_tree + item_rel;
    let prefix = &path[..tree_at];
    let reference = &path[after_tree..item_at];
    let file = &path[item_at + "/item/".len()..];
    Some(format!("{prefix}/blob/{reference}/{file}"))
}

fn replace_once(path: &str, from: &str, to: &str) -> Option<String> {
    let index = path.find(from)?;
    let mut out = String::with_capacity(path.len() - from.len() + to.len());
    out.push_str(&path[..index]);
    out.push_str(to);
    out.push_str(&path[index + from.len()..]);
    Some(out)
}

fn file_title(url: &Url) -> String {
    let Some(segments) = url.path_segments() else {
        return String::new();
    };
    let name = segments
        .filter(|part| !part.is_empty())
        .next_back()
        .unwrap_or("")
        .trim();
    if name.is_empty() || name == "raw" {
        String::new()
    } else {
        name.to_string()
    }
}

fn display_url(url: &Url) -> String {
    let mut clean = url.clone();
    let _ = clean.set_username("");
    let _ = clean.set_password(None);
    let kept: Vec<(String, String)> = url
        .query_pairs()
        .filter(|(key, _)| {
            let name = key.to_ascii_lowercase();
            !matches!(name.as_str(), "token" | "access_token" | "auth")
        })
        .map(|(key, value)| (key.into_owned(), value.into_owned()))
        .collect();
    clean.set_query(None);
    if !kept.is_empty() {
        let mut pairs = clean.query_pairs_mut();
        for (key, value) in &kept {
            pairs.append_pair(key, value);
        }
    }
    clean.to_string()
}

#[cfg(test)]
mod tests {
    use super::*;

    fn fetch(input: &str) -> String {
        normalize_markdown_url(input).expect("url").fetch_url
    }

    #[test]
    fn github_blob_becomes_raw() {
        assert_eq!(
            fetch("https://github.com/acme/notes/blob/main/docs/a.md?plain=1#L10"),
            "https://raw.githubusercontent.com/acme/notes/main/docs/a.md"
        );
    }

    #[test]
    fn github_branch_with_a_slash_keeps_the_rest() {
        assert_eq!(
            fetch("https://www.github.com/acme/notes/blob/feature/foo/a.md"),
            "https://raw.githubusercontent.com/acme/notes/feature/foo/a.md"
        );
    }

    #[test]
    fn raw_github_link_stays() {
        assert_eq!(
            fetch("https://raw.githubusercontent.com/acme/notes/main/a.md?token=secret"),
            "https://raw.githubusercontent.com/acme/notes/main/a.md?token=secret"
        );
        let target = normalize_markdown_url(
            "https://raw.githubusercontent.com/acme/notes/main/a.md?token=secret",
        )
        .expect("url");
        assert_eq!(
            target.display_url,
            "https://raw.githubusercontent.com/acme/notes/main/a.md"
        );
        assert_eq!(target.title, "a.md");
    }

    #[test]
    fn gitlab_and_gitea_and_bitbucket() {
        assert_eq!(
            fetch("https://gitlab.com/group/sub/proj/-/blob/main/dir/note.md"),
            "https://gitlab.com/group/sub/proj/-/raw/main/dir/note.md"
        );
        assert_eq!(
            fetch("https://codeberg.org/acme/notes/src/branch/main/README.md"),
            "https://codeberg.org/acme/notes/raw/branch/main/README.md"
        );
        assert_eq!(
            fetch("https://bitbucket.org/acme/notes/src/main/docs/a.md"),
            "https://bitbucket.org/acme/notes/raw/main/docs/a.md"
        );
    }

    #[test]
    fn gist_and_sourcehut_and_bare_host() {
        assert_eq!(
            fetch("https://gist.github.com/acme/abc123"),
            "https://gist.githubusercontent.com/acme/abc123/raw"
        );
        assert_eq!(
            fetch("https://git.sr.ht/~acme/notes/tree/main/item/docs/a.md"),
            "https://git.sr.ht/~acme/notes/blob/main/docs/a.md"
        );
        assert_eq!(
            fetch("  github.com/acme/notes/blob/main/README.md  "),
            "https://raw.githubusercontent.com/acme/notes/main/README.md"
        );
    }

    #[test]
    fn rejects_empty_and_non_http() {
        assert_eq!(normalize_markdown_url("  ").unwrap_err(), "empty");
        assert_eq!(
            normalize_markdown_url("file:///tmp/a.md").unwrap_err(),
            "scheme"
        );
        assert_eq!(
            normalize_markdown_url("javascript:alert(1)").unwrap_err(),
            "scheme"
        );
    }

    #[test]
    fn html_and_size() {
        assert!(looks_like_html("text/html; charset=utf-8", "nope"));
        assert!(looks_like_html("text/plain", "<!DOCTYPE html><html>"));
        assert!(!looks_like_html("text/plain", "# Hello"));
        assert!(!body_too_large(100));
        assert!(body_too_large(MAX_BYTES + 1));
    }
}
