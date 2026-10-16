use std::time::Duration;

use reqwest::redirect::Policy;

use crate::services::remote::{self, RemoteTarget};

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FetchedNote {
    pub content: String,
    pub title: String,
    pub url: String,
}

#[tauri::command]
pub async fn fetch_markdown_url(url: String) -> Result<FetchedNote, String> {
    let target = remote::normalize_markdown_url(&url).map_err(|code| code.to_string())?;
    let content = fetch_body(&target).await?;
    Ok(FetchedNote {
        content,
        title: target.title,
        url: target.display_url,
    })
}

async fn fetch_body(target: &RemoteTarget) -> Result<String, String> {
    let client = reqwest::Client::builder()
        .connect_timeout(Duration::from_secs(10))
        .timeout(Duration::from_secs(20))
        .user_agent("mdplus")
        .redirect(Policy::custom(|attempt| {
            if attempt.previous().len() >= 5 {
                return attempt.error(std::io::Error::new(
                    std::io::ErrorKind::Other,
                    "too many redirects",
                ));
            }
            match attempt.url().scheme() {
                "http" | "https" => attempt.follow(),
                _ => attempt.stop(),
            }
        }))
        .build()
        .map_err(|_| "network".to_string())?;

    let response = client
        .get(&target.fetch_url)
        .send()
        .await
        .map_err(|_| "network".to_string())?;

    let status = response.status();
    if matches!(status.as_u16(), 401 | 403 | 404) {
        return Err("missing".into());
    }
    if !status.is_success() {
        return Err(format!("status:{}", status.as_u16()));
    }
    let content_type = response
        .headers()
        .get(reqwest::header::CONTENT_TYPE)
        .and_then(|value| value.to_str().ok())
        .unwrap_or("")
        .to_string();
    if let Some(len) = response.content_length() {
        if remote::body_too_large(len as usize) {
            return Err("large".into());
        }
    }

    let mut body = Vec::new();
    let mut response = response;
    while let Some(chunk) = response.chunk().await.map_err(|_| "network".to_string())? {
        if remote::body_too_large(body.len().saturating_add(chunk.len())) {
            return Err("large".into());
        }
        body.extend_from_slice(&chunk);
    }
    let text = String::from_utf8_lossy(&body);
    let text = text.trim_start_matches('\u{feff}').to_string();
    if remote::looks_like_html(&content_type, &text) {
        return Err("page".into());
    }
    Ok(text)
}
