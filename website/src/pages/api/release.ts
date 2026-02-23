/**
 * GET /api/release
 *
 * 代理 GitHub Release API，安全获取私有仓库的最新发布信息。
 * 服务端持有 GITHUB_TOKEN，前端无需暴露凭据。
 *
 * 返回格式:
 * {
 *   version: "1.0.0",
 *   published_at: "2025-01-01T00:00:00Z",
 *   assets: {
 *     setup: { name, size, download_url },
 *     portable: { name, size, download_url },
 *     extension: { name, size, download_url },        // Chrome zip
 *     firefox_extension: { name, size, download_url }, // Firefox XPI
 *   }
 * }
 */

import type { APIRoute } from "astro";

export const prerender = false;

const GITHUB_REPO = import.meta.env.GITHUB_REPO || "user/x_down";
const GITHUB_TOKEN = import.meta.env.GITHUB_TOKEN || "";

// 缓存：避免每次请求都打 GitHub API（60 秒）
let cache: { data: unknown; timestamp: number } | null = null;
const CACHE_TTL = 60_000;

interface GitHubAsset {
  name: string;
  size: number;
  download_count: number;
  url: string; // API URL, 需要 token 才能下载
  browser_download_url: string;
}

interface GitHubRelease {
  tag_name: string;
  name: string;
  published_at: string;
  draft: boolean;
  prerelease: boolean;
  assets: GitHubAsset[];
}

export const GET: APIRoute = async () => {
  // 检查缓存
  if (cache && Date.now() - cache.timestamp < CACHE_TTL) {
    return new Response(JSON.stringify(cache.data), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300",
      },
    });
  }

  if (!GITHUB_TOKEN) {
    return new Response(
      JSON.stringify({ error: "Server misconfigured: missing GITHUB_TOKEN" }),
      { status: 500, headers: { "Content-Type": "application/json" } },
    );
  }

  try {
    // 拉取全部 release（自动分页），用于计算总下载量
    const allReleases: GitHubRelease[] = [];
    let url: string | null =
      `https://api.github.com/repos/${GITHUB_REPO}/releases?per_page=100`;

    while (url) {
      const res = await fetch(url, {
        headers: {
          Authorization: `Bearer ${GITHUB_TOKEN}`,
          Accept: "application/vnd.github+json",
          "X-GitHub-Api-Version": "2022-11-28",
        },
      });

      if (!res.ok) {
        const text = await res.text();
        return new Response(
          JSON.stringify({ error: `GitHub API error: ${res.status}`, detail: text }),
          { status: 502, headers: { "Content-Type": "application/json" } },
        );
      }

      const page: GitHubRelease[] = await res.json();
      allReleases.push(...page);

      const link = res.headers.get("Link");
      const next = link?.match(/<([^>]+)>;\s*rel="next"/);
      url = next ? next[1] : null;
    }

    const releases = allReleases;

    const latest = releases.find((r) => !r.draft && !r.prerelease);

    if (!latest) {
      return new Response(
        JSON.stringify({ error: "No published release found" }),
        { status: 404, headers: { "Content-Type": "application/json" } },
      );
    }

    const version = latest.tag_name.replace(/^v/, "");

    // 匹配资产文件（兼容旧命名：-windows-setup.exe / 新命名：-windows-x64-setup.exe）
    const setupAsset = latest.assets.find((a) =>
      a.name.endsWith("-windows-x64-setup.exe") || a.name.endsWith("-windows-setup.exe"),
    );
    const portableAsset = latest.assets.find((a) =>
      a.name.endsWith("-windows-x64-portable.zip") || a.name.endsWith("-windows-portable.zip"),
    );
    // ARM64 资产（仅新版 Release 包含）
    const setupArm64Asset = latest.assets.find((a) => a.name.endsWith("-windows-arm64-setup.exe"));
    const portableArm64Asset = latest.assets.find((a) => a.name.endsWith("-windows-arm64-portable.zip"));
    const extensionAsset = latest.assets.find((a) =>
      a.name.endsWith("-chrome.zip") || a.name.endsWith("-extension.zip"),
    );
    const firefoxExtensionAsset = latest.assets.find((a) => a.name.endsWith("-firefox.xpi"));

    const formatAsset = (asset: GitHubAsset | undefined) => {
      if (!asset) return null;
      return {
        name: asset.name,
        size: asset.size,
        // 使用我们自己的代理下载端点，避免前端直接访问 GitHub
        download_url: `/api/download/${asset.name}`,
      };
    };

    // 累计所有 release 的下载量
    let totalDownloads = 0;
    for (const release of releases) {
      for (const asset of release.assets) {
        totalDownloads += asset.download_count;
      }
    }

    const data = {
      version,
      tag: latest.tag_name,
      published_at: latest.published_at,
      total_downloads: totalDownloads,
      assets: {
        setup: formatAsset(setupAsset),
        portable: formatAsset(portableAsset),
        setup_arm64: formatAsset(setupArm64Asset),
        portable_arm64: formatAsset(portableArm64Asset),
        extension: formatAsset(extensionAsset),
        firefox_extension: formatAsset(firefoxExtensionAsset),
      },
    };

    // 更新缓存
    cache = { data, timestamp: Date.now() };

    return new Response(JSON.stringify(data), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300",
      },
    });
  } catch (err) {
    return new Response(
      JSON.stringify({ error: "Failed to fetch release info", detail: String(err) }),
      { status: 500, headers: { "Content-Type": "application/json" } },
    );
  }
};
