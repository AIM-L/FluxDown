# FluxDown 推广渠道提交物料

本目录是各推广/生态渠道的**可提交实物**，已按各平台官方规范核实生成。
下方每节说明：资格校验结论、怎么提交、**哪些动作必须你本人做**。

## 资格校验（已核实的事实）

| 项 | 结论 | 依据 |
|---|---|---|
| 仓库公开 | ✅ `zerx-lab/FluxDown`（public） | GitHub API |
| 开源协议 | ✅ AGPL-3.0（SPDX `AGPL-3.0`） | `LICENSE` |
| 首个 release | ✅ v0.0.1 @ 2026-02-10（>4 个月） | git tag |
| headless Web UI | ✅ `fluxdown_server`，端口 17800 | `docker/docker-compose.yml` |
| 公共镜像 | ✅ `ghcr.io/zerx-lab/fluxdown-server:{version|latest}` | `.github/workflows/release.yml` |
| MCP 端点 | ✅ `POST /mcp`，9 个工具 | `native/api/src/mcp.rs` |

**镜像架构现状**：release 的 docker job 仅构建 `linux/amd64`。模板据实只声明 amd64。
若要覆盖 NAS 上大量的 ARM 设备（群晖 arm、树莓派），需在 release.yml 的 `build-push-action`
增加 `platforms: linux/amd64,linux/arm64`——**这是提升 NAS 覆盖率的最高优先技术项**。

---

## 1. CasaOS / ZimaOS 应用商店 → `casaos/`

**最省事，直击 NAS。** 两种提交方式：

- **自建第三方商店（推荐，自己掌控）**：把 `casaos/` 内容放到一个可公开访问的仓库/分支，
  按 `store-config.json` 配好，用官方 `build_appstore.py` + GitHub Actions 构建到 gh-pages。
  用户在 ZimaOS「应用商店 → 添加来源」填你的 URL 即可一键装。
- **进官方商店**：Fork `IceWhaleTech/CasaOS-AppStore`，把 `Apps/FluxDown/` 拷进去，
  本地跑 `python3 scripts/build_appstore.py` 验证通过后提 PR（附安装成功 + WebUI 可达截图）。

发新版时同步更新 `docker-compose.yml` 里的 `image` 版本号与 `x-casaos.version`/`update_at`。

## 2. Unraid Community Applications → `unraid/`

1. 把 `unraid/fluxdown.xml` 和 `ca_profile.xml` 放到一个 GitHub 仓库（本物料已放在
   `promotion/unraid/`，`TemplateURL` 已指向本仓库 raw 直链，可直接用）。
2. 到 **https://ca.unraid.net/submit** 填仓库地址，live scan 会自动校验并预览。
3. 必备项已满足：`Project` + `Support` 链接、`WebUI` 模式、版本化镜像 tag。

## 3. MCP Registry → `mcp/`

FluxDown 的 `/mcp` 是**用户自托管的远程端点**（默认仅 127.0.0.1，需在设置里开
`local_server_mcp_enabled` 并用管理 token 鉴权）。`server.json` 已按 `streamable-http` remote 生成。

提交（**需你本人操作**，用 GitHub 身份认证命名空间 `io.github.zerx-lab/...`）：
```bash
# 参考 modelcontextprotocol/registry 的 publisher 指南
mcp-publisher login github       # 用 zerx-lab 账号 OAuth
mcp-publisher publish            # 在含 server.json 的目录执行
```
> 也可改命名空间为 `dev.zerx/fluxdown` 并走 DNS 验证（你持有 zerx.dev 域名）。

## 4. awesome-selfhosted → `awesome-selfhosted/`

条目 `fluxdown.yml` 已按官方范本（pyload/qbittorrent）生成，只含必填字段
（star/commit 历史由该项目 CI 自动补），description 236 字符（<250 上限），
标签 `File Transfer - Peer-to-peer Filesharing` 为合法标签。

> **⚠️ 必须你本人手动提交。** `awesome-selfhosted-data` 的 CONTRIBUTING 明文规定：
> *"Machine/LLM-generated contributions ... will result in a ban."* 由 AI 代理用你的身份
> 直接提 PR 会导致封禁——得不偿失。做法：把 `fluxdown.yml` 复制到
> `awesome-selfhosted-data` 的 `software/fluxdown.yml`，你本人 review 后提 PR。

---

## 需要你本人完成的动作汇总

| 渠道 | 我已产出 | 你要做 |
|---|---|---|
| CasaOS | compose + store-config | 建源仓库 / 提官方 PR + 截图 |
| Unraid | xml + ca_profile | ca.unraid.net 填仓库地址 |
| MCP Registry | server.json | `mcp-publisher` 登录发布 |
| awesome-selfhosted | fluxdown.yml | 手动提 PR（禁 AI 代提） |

## 后续可加渠道（本轮未做，投入产出比排序）
- **awesome-mcp-servers**（社区清单，非官方 registry）：直接 PR 加一行。
- **AriaNg / Motrix 兼容宣传**：验证 `/jsonrpc` 兼容度后在 README 标注「可连 FluxDown」。
- **winget / Scoop / Homebrew**：桌面版包管理器上架。
- **yt-dlp `--external-downloader`**：写对接文档，复刻 aria2c 的引流路径。
