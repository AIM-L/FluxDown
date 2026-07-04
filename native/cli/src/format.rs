//! 输出格式化：字节人类可读、进度、状态名、K/M 单位解析。
//!
//! 与 aria2 一致：字节以 `1024` 进制展示（KiB/MiB/GiB），输入尺寸后缀
//! `K`/`M`/`G` 同样按 `1024` 进制解析。

/// 状态码 → 人类可读名（与 `TaskDto.status` 对齐）。
///
/// # Examples
///
/// ```
/// use fluxdown_cli::format::status_name;
///
/// assert_eq!(status_name(1), "downloading");
/// assert_eq!(status_name(3), "completed");
/// assert_eq!(status_name(99), "unknown");
/// ```
#[must_use]
pub fn status_name(status: i32) -> &'static str {
    match status {
        0 => "pending",
        1 => "downloading",
        2 => "paused",
        3 => "completed",
        4 => "error",
        5 => "preparing",
        _ => "unknown",
    }
}

/// 字节数 → 人类可读字符串（1024 进制，两位小数）。
///
/// # Examples
///
/// ```
/// use fluxdown_cli::format::human_bytes;
///
/// assert_eq!(human_bytes(0), "0 B");
/// assert_eq!(human_bytes(1024), "1.00 KiB");
/// assert_eq!(human_bytes(1_572_864), "1.50 MiB");
/// ```
#[must_use]
pub fn human_bytes(bytes: i64) -> String {
    if bytes < 0 {
        return "? B".to_string();
    }
    const UNITS: [&str; 5] = ["B", "KiB", "MiB", "GiB", "TiB"];
    let mut val = bytes as f64;
    let mut idx = 0;
    while val >= 1024.0 && idx < UNITS.len() - 1 {
        val /= 1024.0;
        idx += 1;
    }
    if idx == 0 {
        format!("{bytes} B")
    } else {
        format!("{val:.2} {}", UNITS[idx])
    }
}

/// 进度百分比字符串（`downloaded/total`）。
///
/// total 为 0（未知大小）时返回 `--`。
///
/// # Examples
///
/// ```
/// use fluxdown_cli::format::percent;
///
/// assert_eq!(percent(50, 100), "50.0%");
/// assert_eq!(percent(0, 0), "--");
/// ```
#[must_use]
pub fn percent(downloaded: i64, total: i64) -> String {
    if total <= 0 {
        return "--".to_string();
    }
    let p = (downloaded as f64 / total as f64) * 100.0;
    format!("{p:.1}%")
}

/// 解析带 `K`/`M`/`G`/`T` 后缀的尺寸字符串为字节数（1024 进制）。
///
/// 无后缀按字节解析。大小写不敏感，可带尾随 `B`（如 `10MB`）。
///
/// # Examples
///
/// ```
/// use fluxdown_cli::format::parse_size;
///
/// assert_eq!(parse_size("1024").unwrap(), 1024);
/// assert_eq!(parse_size("1K").unwrap(), 1024);
/// assert_eq!(parse_size("10M").unwrap(), 10 * 1024 * 1024);
/// assert_eq!(parse_size("2GB").unwrap(), 2 * 1024 * 1024 * 1024);
/// assert!(parse_size("abc").is_err());
/// ```
pub fn parse_size(s: &str) -> Result<i64, String> {
    let s = s.trim();
    if s.is_empty() {
        return Err("empty size".to_string());
    }
    let lower = s.to_ascii_lowercase();
    let digits: String = lower.chars().take_while(|c| c.is_ascii_digit()).collect();
    if digits.is_empty() {
        return Err(format!("invalid size: {s}"));
    }
    let num: i64 = digits.parse().map_err(|_| format!("invalid size: {s}"))?;
    let suffix = lower[digits.len()..].trim_end_matches('b').trim();
    let mult: i64 = match suffix {
        "" => 1,
        "k" => 1024,
        "m" => 1024 * 1024,
        "g" => 1024 * 1024 * 1024,
        "t" => 1024_i64 * 1024 * 1024 * 1024,
        other => return Err(format!("unknown size suffix: {other}")),
    };
    Ok(num * mult)
}

/// 截断字符串到指定显示宽度（按 char 计），超出加省略号。
///
/// # Examples
///
/// ```
/// use fluxdown_cli::format::truncate;
///
/// assert_eq!(truncate("hello", 10), "hello");
/// assert_eq!(truncate("hello world", 8), "hello w…");
/// ```
#[must_use]
pub fn truncate(s: &str, max: usize) -> String {
    let count = s.chars().count();
    if count <= max {
        return s.to_string();
    }
    if max == 0 {
        return String::new();
    }
    let kept: String = s.chars().take(max - 1).collect();
    format!("{kept}…")
}
