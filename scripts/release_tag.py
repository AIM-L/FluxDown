#!/usr/bin/env python3
"""
Release Tag Script
==================
提取两个 tag 之间的 commit log，调用 Claude CLI 生成中文 Release Notes，
然后创建 annotated tag 并推送。

用法:
    python scripts/release_tag.py v0.0.5
    python scripts/release_tag.py v0.0.5 --dry-run   # 仅预览，不创建 tag
    python scripts/release_tag.py v0.0.5 --push       # 创建 tag 并推送到远程
"""

import argparse
import os
import subprocess
import sys
import textwrap

# Windows 下强制 UTF-8 输出
if sys.platform == "win32":
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")  # type: ignore[union-attr]
    sys.stderr.reconfigure(encoding="utf-8", errors="replace")  # type: ignore[union-attr]


def run(cmd: list[str], *, check: bool = True) -> str:
    """运行命令并返回 stdout"""
    env = os.environ.copy()
    env["PYTHONIOENCODING"] = "utf-8"
    result = subprocess.run(
        cmd,
        capture_output=True,
        encoding="utf-8",
        errors="replace",
        env=env,
    )
    if check and result.returncode != 0:
        print(f"命令失败: {' '.join(cmd)}", file=sys.stderr)
        print(result.stderr, file=sys.stderr)
        sys.exit(1)
    return result.stdout.strip()


def get_previous_tag() -> str | None:
    """获取最新的 tag"""
    output = run(["git", "tag", "-l", "--sort=-v:refname"], check=False)
    if not output:
        return None
    return output.splitlines()[0]


def get_commits(from_tag: str | None, to_ref: str = "HEAD") -> str:
    """获取两个 ref 之间的 commit log，含变更文件列表（用于模块归属判断）"""
    if from_tag:
        range_spec = f"{from_tag}..{to_ref}"
    else:
        range_spec = to_ref
    # --name-only 列出每个 commit 修改的文件，供 AI 按路径判断所属模块
    return run(["git", "log", range_spec, "--pretty=format:COMMIT %h %s", "--name-only"])


def generate_release_notes(version: str, commits: str, prev_tag: str | None) -> str:
    """调用 Claude CLI 生成 Release Notes"""
    range_desc = f"{prev_tag}..{version}" if prev_tag else f"初始版本到 {version}"

    prompt = textwrap.dedent(f"""\
        你是 FluxDown 项目的发布助手。FluxDown 是一个多协议下载工具，项目包含三个模块：

        1. **客户端** — 桌面下载应用（Flutter + Rust），支持 HTTP/FTP/BT 多协议下载
        2. **浏览器扩展** — Chrome/Firefox 扩展，用于拦截浏览器下载并发送到客户端
        3. **官网** — FluxDown 官方网站，产品展示与下载页

        ## 文件路径 → 模块归属规则（严格按此判断，优先级高于 commit 消息措辞）

        | 文件路径前缀 | 所属模块 |
        |-------------|---------|
        | `lib/` | 客户端 |
        | `native/` | 客户端 |
        | `windows/` / `android/` / `ios/` / `macos/` / `linux/` | 客户端 |
        | `assets/` | 客户端 |
        | `fluxDown/` | 浏览器扩展 |
        | `website/` | 官网 |
        | `.github/workflows/` | 忽略（CI 内部，用户不感知） |
        | `scripts/` / 根目录配置文件 | 忽略（开发工具，用户不感知） |

        跨模块 commit（同时修改了多个模块的文件）需拆分到各自模块下分别描述。

        ## 任务

        请根据以下 Git commit 记录生成一份面向用户的中文 Release Notes。

        每条 commit 记录格式为：
        ```
        COMMIT <hash> <subject>
        <修改的文件1>
        <修改的文件2>
        ...
        ```

        版本: {version}
        变更范围: {range_desc}

        Commit 记录:
        {commits}

        ## 输出要求

        1. 用 Markdown 格式输出
        2. 开头用一两句话总结本次版本的核心亮点
        3. 按模块分组，使用以下三级标题（**仅在该模块确实有文件变更时才列出**）：
           - `### 客户端`
           - `### 浏览器扩展`
           - `### 官网`
        4. 每个模块内按类型（新功能 / 改进 / 修复）用列表列出要点，语言简洁
        5. 忽略纯 CI/chore/scripts commit，除非对用户体验有直接影响
        6. 只输出 Release Notes 正文，不要加多余解释
        7. 严禁在开头加版本号标题（如 "## v0.0.4 Release Notes"），直接从总结句开始
        8. 不要使用水平分隔线（---）
        9. 不要总结匿名信息收集方面的内容
        10. 不要携带任何代码内容，只总结功能
    """)

    print("正在调用 Claude CLI 生成 Release Notes...")
    env = os.environ.copy()
    env["PYTHONIOENCODING"] = "utf-8"
    result = subprocess.run(
        ["claude", "-p", prompt, "--max-turns", "1"],
        capture_output=True,
        encoding="utf-8",
        errors="replace",
        env=env,
        timeout=120,
    )
    if result.returncode != 0:
        print(f"Claude CLI 调用失败: {result.stderr}", file=sys.stderr)
        sys.exit(1)

    return result.stdout.strip()


def refine_release_notes(current_notes: str, user_request: str) -> str:
    """根据用户反馈调用 Claude CLI 修改 Release Notes"""
    prompt = textwrap.dedent(f"""\
        你是 FluxDown 项目的发布助手。以下是当前的 Release Notes 草稿：

        ---
        {current_notes}
        ---

        用户希望对上述 Release Notes 做以下修改：
        {user_request}

        请按照用户要求修改后，输出完整的 Release Notes。
        只输出 Release Notes 正文，不要加多余解释，不要加版本号标题，不要使用水平分隔线（---）。
    """)

    print("正在调用 Claude CLI 修改 Release Notes...")
    env = os.environ.copy()
    env["PYTHONIOENCODING"] = "utf-8"
    result = subprocess.run(
        ["claude", "-p", prompt, "--max-turns", "1"],
        capture_output=True,
        encoding="utf-8",
        errors="replace",
        env=env,
        timeout=120,
    )
    if result.returncode != 0:
        print(f"Claude CLI 调用失败: {result.stderr}", file=sys.stderr)
        sys.exit(1)

    return result.stdout.strip()


def interactive_review(release_notes: str) -> str | None:
    """
    交互式审阅 Release Notes，支持多轮修改。
    返回最终确认的内容，或 None 表示取消。
    """
    current_notes = release_notes
    round_num = 1

    while True:
        print(f"\n===== Release Notes（第 {round_num} 版）=====\n")
        print(current_notes)
        print("\n" + "=" * 40)
        print("\n操作选项:")
        print("  [y] 确认，使用此内容创建 tag")
        print("  [m] 修改，告诉 AI 需要哪些调整")
        print("  [n] 取消，退出脚本")
        print()

        choice = input("请选择 [y/m/n]: ").strip().lower()

        if choice == "y":
            return current_notes
        elif choice == "n":
            print("已取消")
            return None
        elif choice == "m":
            print("\n请描述你希望如何修改（可以详细说明，按回车两次提交）:")
            lines = []
            while True:
                line = input()
                if line == "" and lines and lines[-1] == "":
                    break
                lines.append(line)
            user_request = "\n".join(lines).strip()
            if not user_request:
                print("未输入修改要求，请重试")
                continue
            current_notes = refine_release_notes(current_notes, user_request)
            round_num += 1
        else:
            print("无效输入，请输入 y、m 或 n")


def create_tag(version: str, message: str) -> None:
    """创建 annotated tag（使用 --cleanup=verbatim 保留 # 开头的 Markdown 标题）"""
    run(["git", "tag", "-a", version, "-m", message, "--cleanup=verbatim"])
    print(f"已创建 annotated tag: {version}")


def push_tag(version: str) -> None:
    """推送 tag 到远程"""
    run(["git", "push", "origin", version])
    print(f"已推送 tag: {version}")


def main() -> None:
    parser = argparse.ArgumentParser(description="生成 AI Release Notes 并创建 tag")
    parser.add_argument("version", help="版本号 (如 v0.0.5)")
    parser.add_argument("--dry-run", action="store_true", help="仅预览，不创建 tag")
    parser.add_argument("--push", action="store_true", help="创建后自动推送 tag")
    args = parser.parse_args()

    version: str = args.version
    if not version.startswith("v"):
        version = f"v{version}"

    # 检查 tag 是否已存在
    existing_tags = run(["git", "tag", "-l", version], check=False)
    if version in existing_tags.splitlines():
        print(f"错误: tag {version} 已存在", file=sys.stderr)
        sys.exit(1)

    # 获取前一个 tag 和 commit log
    prev_tag = get_previous_tag()
    commits = get_commits(prev_tag)

    if not commits:
        print("没有找到新的 commit", file=sys.stderr)
        sys.exit(1)

    commit_count = sum(1 for line in commits.splitlines() if line.startswith("COMMIT "))
    print(f"版本: {version}")
    print(f"前一个 tag: {prev_tag or '(无)'}")
    print(f"共 {commit_count} 个 commit")
    print("-" * 40)

    # 生成 Release Notes
    release_notes = generate_release_notes(version, commits, prev_tag)

    if args.dry_run:
        print("\n===== 生成的 Release Notes =====\n")
        print(release_notes)
        print("\n================================\n")
        print("(dry-run 模式，未创建 tag)")
        return

    # 交互式审阅，支持多轮修改
    final_notes = interactive_review(release_notes)
    if final_notes is None:
        return

    create_tag(version, final_notes)

    if args.push:
        push_tag(version)
    else:
        print(f"提示: 运行 `git push origin {version}` 推送 tag 触发 CI")


if __name__ == "__main__":
    main()
