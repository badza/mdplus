//! Line-ending, BOM, and trailing-newline preservation.
//!
//! The data-loss case this closes: open a CRLF file on Windows, save it, and the
//! user's next `git diff` shows 100% of the file changed because we wrote LF. So we
//! detect the on-disk encoding on open, return a normalized (LF, no-BOM) string to
//! the editor, and re-apply the original encoding on save.

const BOM: [u8; 3] = [0xEF, 0xBB, 0xBF];

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum LineEnding {
    Lf,
    Crlf,
}

#[derive(Debug, Clone)]
pub struct Encoding {
    pub line_ending: LineEnding,
    pub has_bom: bool,
    pub has_trailing_newline: bool,
}

/// Read raw bytes and detect the encoding, returning (normalized_text, encoding).
/// Bytes that are not UTF-8 are an error, so a later save cannot replace them.
/// Normalized = UTF-8 string with BOM stripped and CRLF collapsed to LF, plus a
/// trailing-newline flag derived from the *original* bytes (so a file with no final
/// newline isn't given one, and a file with one keeps it).
pub fn decode(raw: &[u8]) -> Result<(String, Encoding), &'static str> {
    let (bytes, has_bom) = if raw.starts_with(&BOM) {
        (&raw[3..], true)
    } else {
        (raw, false)
    };

    // Detect line ending by scanning for "\r\n". If any CRLF is present we treat the
    // whole file as CRLF; otherwise LF. (A mixed file is normalized to LF on read but
    // saved back as CRLF if it had any CRLF originally -- preserving the dominant
    // Windows-ness rather than silently converting to LF.)
    let has_crlf = bytes.windows(2).any(|w| w == b"\r\n");
    let line_ending = if has_crlf {
        LineEnding::Crlf
    } else {
        LineEnding::Lf
    };

    let mut text = std::str::from_utf8(bytes).map_err(|_| "utf-8")?.to_string();
    if has_crlf {
        text = text.replace("\r\n", "\n");
    }

    // Trailing newline: true if the *normalized* text ends with '\n'. We re-derive
    // from the normalized text (not the raw bytes) so the round-trip is stable --
    // if the original was "...content\r\n", normalized is "...content\n" and we
    // record has_trailing_newline=true; on save we re-emit "...content\r\n".
    let has_trailing_newline = text.ends_with('\n');

    Ok((
        text,
        Encoding {
            line_ending,
            has_bom,
            has_trailing_newline,
        },
    ))
}

/// Re-apply an encoding to a normalized string for writing. Ensures the trailing
/// newline state matches what was recorded (adds or strips a single trailing '\n'),
/// then converts LF to CRLF if the original was CRLF, and prepends a BOM if the
/// original had one.
pub fn encode(text: &str, enc: &Encoding) -> Vec<u8> {
    let mut s = text.to_string();

    // Reconcile trailing newline. The editor may have added or removed one; we make
    // the on-disk file match the originally-observed state.
    let currently_has_trailing = s.ends_with('\n');
    if enc.has_trailing_newline && !currently_has_trailing {
        s.push('\n');
    } else if !enc.has_trailing_newline && currently_has_trailing {
        s.pop();
    }

    if enc.line_ending == LineEnding::Crlf {
        s = s.replace('\n', "\r\n");
    }

    let mut out = Vec::with_capacity(s.len() + 3);
    if enc.has_bom {
        out.extend_from_slice(&BOM);
    }
    out.extend_from_slice(s.as_bytes());
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn lf_file_round_trips_as_lf() {
        let raw = b"hello\nworld\n";
        let (text, enc) = decode(raw).expect("utf-8");
        assert_eq!(text, "hello\nworld\n");
        assert_eq!(enc.line_ending, LineEnding::Lf);
        assert!(!enc.has_bom);
        assert!(enc.has_trailing_newline);
        assert_eq!(encode(&text, &enc), raw);
    }

    #[test]
    fn crlf_file_round_trips_as_crlf() {
        let raw = b"hello\r\nworld\r\n";
        let (text, enc) = decode(raw).expect("utf-8");
        // Editor sees normalized LF.
        assert_eq!(text, "hello\nworld\n");
        assert_eq!(enc.line_ending, LineEnding::Crlf);
        assert!(enc.has_trailing_newline);
        // Save re-applies CRLF.
        assert_eq!(encode(&text, &enc), b"hello\r\nworld\r\n");
    }

    #[test]
    fn bom_is_preserved_and_stripped_from_editor_view() {
        let raw = [0xEF, 0xBB, 0xBF, b'h', b'i', b'\n'];
        let (text, enc) = decode(&raw).expect("utf-8");
        assert_eq!(text, "hi\n");
        assert!(enc.has_bom);
        assert_eq!(encode(&text, &enc), &raw[..]);
    }

    #[test]
    fn no_trailing_newline_is_preserved() {
        let raw = b"no newline at end";
        let (text, enc) = decode(raw).expect("utf-8");
        assert_eq!(text, "no newline at end");
        assert!(!enc.has_trailing_newline);
        assert_eq!(encode(&text, &enc), b"no newline at end");
    }

    #[test]
    fn editor_added_trailing_newline_is_stripped_on_save_if_original_had_none() {
        let raw = b"no newline";
        let (_, enc) = decode(raw).expect("utf-8");
        // User added a newline in the editor.
        let edited = "no newline\n";
        assert_eq!(encode(edited, &enc), b"no newline");
    }

    #[test]
    fn editor_removed_trailing_newline_is_readded_on_save_if_original_had_one() {
        let raw = b"had newline\n";
        let (_, enc) = decode(raw).expect("utf-8");
        // User deleted the trailing newline in the editor.
        let edited = "had newline";
        assert_eq!(encode(edited, &enc), b"had newline\n");
    }

    #[test]
    fn mixed_endings_classified_as_crlf_if_any_crlf_present() {
        let raw = b"line1\nline2\r\nline3\n";
        let (text, enc) = decode(raw).expect("utf-8");
        assert_eq!(text, "line1\nline2\nline3\n");
        assert_eq!(enc.line_ending, LineEnding::Crlf);
        // Save writes everything as CRLF.
        assert_eq!(encode(&text, &enc), b"line1\r\nline2\r\nline3\r\n");
    }

    #[test]
    fn blank_line_at_end_survives_when_original_had_no_trailing_newline() {
        let (_, enc) = decode(b"hello").expect("utf-8");
        assert!(!enc.has_trailing_newline);
        assert_eq!(encode("hello\n\n", &enc), b"hello\n");
    }

    #[test]
    fn rejects_bytes_that_are_not_utf8() {
        assert_eq!(decode(&[0xFF, 0xFE, b'a']).unwrap_err(), "utf-8");
    }
}
