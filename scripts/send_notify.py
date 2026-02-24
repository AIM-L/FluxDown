#!/usr/bin/env python3
"""
FluxDown 平台发布通知脚本
用法: python3 send_notify.py [--config notify_config.json] [--dry-run]
"""

import argparse
import json
import smtplib
import ssl
import sys
import time
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from pathlib import Path

# ── SMTP 配置 ────────────────────────────────────────────────────────────────
SMTP_HOST = "smtp.163.com"
SMTP_PORT = 465
SMTP_USER = "***REMOVED***"
SMTP_PASS = "***REMOVED***"
SENDER_NAME = "FluxDown"


# ── HTML 邮件模板 ────────────────────────────────────────────────────────────
TEMPLATE_PATH = Path(__file__).parent / "email_template.html"

PLATFORM_ICONS: dict[str, str] = {
    "linux": "🐧",
    "macos": "🍎",
    "windows": "🪟",
    "mobile": "📱",
    "web": "🌐",
}


def build_html(platform: str, version: str, download_url: str, changelog: list[str]) -> str:
    if not TEMPLATE_PATH.exists():
        raise FileNotFoundError(f"HTML 模板文件不存在: {TEMPLATE_PATH}")

    changelog_items = "\n".join(
        f'<li style="margin:8px 0;color:#374151;">{item}</li>'
        for item in changelog
    )
    icon = PLATFORM_ICONS.get(platform.lower(), "🚀")

    tpl = TEMPLATE_PATH.read_text(encoding="utf-8")
    return (
        tpl
        .replace("{{platform}}", platform)
        .replace("{{version}}", version)
        .replace("{{download_url}}", download_url)
        .replace("{{changelog_items}}", changelog_items)
        .replace("{{icon}}", icon)
    )


def build_text(platform: str, version: str, download_url: str, changelog: list[str]) -> str:
    """纯文本回退版本"""
    items = "\n".join(f"  • {item}" for item in changelog)
    return f"""FluxDown {platform} v{version} 正式发布！

你好！感谢订阅 FluxDown {platform} 平台发布通知。

本次更新亮点：
{items}

立即下载：{download_url}

---
© 2025 FluxDown · zerx-lab · https://fluxdown.zerx.dev
如有问题或建议：https://fluxdown.zerx.dev/feedback
"""


# ── 发送逻辑 ─────────────────────────────────────────────────────────────────
def send_email(
    to_addr: str,
    platform: str,
    version: str,
    download_url: str,
    changelog: list[str],
    dry_run: bool = False,
    smtp_conn: smtplib.SMTP_SSL | None = None,
) -> bool:
    subject = f"FluxDown {platform} v{version} 正式发布 🎉"

    msg = MIMEMultipart("alternative")
    msg["Subject"] = subject
    msg["From"] = f"{SENDER_NAME} <{SMTP_USER}>"
    msg["To"] = to_addr

    msg.attach(MIMEText(build_text(platform, version, download_url, changelog), "plain", "utf-8"))
    msg.attach(MIMEText(build_html(platform, version, download_url, changelog), "html", "utf-8"))

    if dry_run:
        print(f"  [dry-run] 跳过发送 → {to_addr}")
        return True

    if smtp_conn is None:
        print(f"  [错误] smtp_conn 未传入，无法发送至 {to_addr}", file=sys.stderr)
        return False

    try:
        smtp_conn.sendmail(SMTP_USER, to_addr, msg.as_bytes())
        return True
    except smtplib.SMTPException as e:
        print(f"  [错误] 发送至 {to_addr} 失败: {e}", file=sys.stderr)
        return False


def main() -> None:
    parser = argparse.ArgumentParser(description="FluxDown 平台发布通知脚本")
    parser.add_argument(
        "--config",
        default=Path(__file__).parent / "notify_config.json",
        type=Path,
        help="配置文件路径（默认: notify_config.json）",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="仅预览，不实际发送邮件",
    )
    args = parser.parse_args()

    # 读取配置
    config_path: Path = args.config
    if not config_path.exists():
        print(f"[错误] 配置文件不存在: {config_path}", file=sys.stderr)
        sys.exit(1)

    with config_path.open(encoding="utf-8") as f:
        cfg = json.load(f)

    platform: str = cfg["platform"]
    version: str = cfg["version"]
    download_url: str = cfg["download_url"]
    changelog: list[str] = cfg.get("changelog", [])
    recipients: list[str] = cfg["recipients"]

    print(f"╔══════════════════════════════════════════╗")
    print(f"  FluxDown 发布通知脚本")
    print(f"  平台: {platform}  版本: v{version}")
    print(f"  收件人: {len(recipients)} 位")
    print(f"  Dry-run: {'是' if args.dry_run else '否'}")
    print(f"╚══════════════════════════════════════════╝\n")

    success_count = 0
    fail_count = 0

    if args.dry_run:
        for addr in recipients:
            send_email(addr, platform, version, download_url, changelog, dry_run=True)
            success_count += 1
    else:
        print(f"[连接] {SMTP_HOST}:{SMTP_PORT} ...")
        ctx = ssl.create_default_context()
        try:
            with smtplib.SMTP_SSL(SMTP_HOST, SMTP_PORT, context=ctx) as smtp:
                smtp.login(SMTP_USER, SMTP_PASS)
                print(f"[登录] 成功\n")

                for i, addr in enumerate(recipients, 1):
                    print(f"  [{i}/{len(recipients)}] 发送 → {addr} ... ", end="", flush=True)
                    ok = send_email(addr, platform, version, download_url, changelog, smtp_conn=smtp)
                    if ok:
                        print("✓")
                        success_count += 1
                    else:
                        fail_count += 1
                    # 避免触发 163 频率限制
                    if i < len(recipients):
                        time.sleep(1)

        except smtplib.SMTPAuthenticationError:
            print("\n[错误] SMTP 认证失败，请检查账号/密码/授权码", file=sys.stderr)
            sys.exit(1)
        except OSError as e:
            print(f"\n[错误] 无法连接到 SMTP 服务器: {e}", file=sys.stderr)
            sys.exit(1)

    print(f"\n── 完成 ──────────────────────────────────")
    print(f"  成功: {success_count}  失败: {fail_count}")


if __name__ == "__main__":
    main()
