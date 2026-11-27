import {
  CodeReferenceMatch,
  ConnectedRepository,
  FlagReferencesResult,
  GitProvider,
  RepoSearchResult,
} from "../types/codeReferences";

export interface ValidatedRepoInfo {
  repository: string;
  provider: GitProvider;
  defaultBranch: string;
  branch: string;
  repoUrl: string;
  baseUrl: string;
  isPrivate: boolean;
}

const MAX_SNIPPET_LENGTH = 160;
const MAX_FILES_PER_REPO = 25;
const MAX_MATCHES_PER_REPO = 60;
const MAX_GITHUB_FILE_BYTES = 200 * 1024; // 200 KB per file
const MAX_GITHUB_SCANNED_FILES = 600;
const GRAPHQL_BATCH_SIZE = 35;
const REQUEST_TIMEOUT_MS = 25000;

interface CachedRepoFiles {
  treeSha: string;
  files: Array<{ path: string; content: string }>;
}

// Session-only RAM cache: avoids re-downloading the same commit tree across flag clicks
const githubRepoFilesCache = new Map<string, CachedRepoFiles>();

export function clearRepoScanCache(repoId?: string): void {
  if (repoId) {
    githubRepoFilesCache.delete(repoId);
  } else {
    githubRepoFilesCache.clear();
  }
}

const IGNORED_DIRS = new Set([
  ".git",
  "node_modules",
  "dist",
  "build",
  "out",
  "coverage",
  ".next",
  ".nuxt",
  ".svelte-kit",
  ".venv",
  "venv",
  "__pycache__",
  ".mypy_cache",
  ".pytest_cache",
  "target",
  "vendor",
  ".terraform",
  ".idea",
  ".vscode",
]);

const IGNORED_FILENAMES = new Set([
  "package-lock.json",
  "yarn.lock",
  "pnpm-lock.yaml",
  "poetry.lock",
  "cargo.lock",
  "composer.lock",
  "gemfile.lock",
]);

const IGNORED_EXTENSIONS = new Set([
  ".png", ".jpg", ".jpeg", ".gif", ".webp", ".ico", ".svg", ".bmp", ".tiff", ".avif",
  ".pdf", ".zip", ".tar", ".gz", ".7z", ".rar", ".jar", ".war",
  ".woff", ".woff2", ".ttf", ".eot", ".otf",
  ".mp3", ".mp4", ".mov", ".avi", ".wav", ".webm",
  ".exe", ".dll", ".so", ".dylib", ".bin", ".class", ".pyc", ".o",
  ".lock", ".min.js", ".min.css", ".map", ".csv", ".xlsx", ".xls", ".docx", ".pptx",
]);

const PRIORITY_CODE_EXTENSIONS = new Set([
  ".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs",
  ".py", ".go", ".java", ".kt", ".cs", ".rb", ".php", ".rs", ".dart", ".swift",
  ".vue", ".svelte", ".astro", ".html", ".sql",
]);

function shouldScanGitHubPath(relPath: string): boolean {
  const normalized = relPath.replace(/\\/g, "/");
  const segments = normalized.split("/");
  if (segments.some((seg) => IGNORED_DIRS.has(seg.toLowerCase()))) return false;

  const baseName = segments[segments.length - 1].toLowerCase();
  if (IGNORED_FILENAMES.has(baseName)) return false;

  for (const ext of IGNORED_EXTENSIONS) {
    if (baseName.endsWith(ext)) return false;
  }
  return true;
}

function getFilePriority(relPath: string): number {
  const lower = relPath.toLowerCase();
  for (const ext of PRIORITY_CODE_EXTENSIONS) {
    if (lower.endsWith(ext)) return 0;
  }
  return 1;
}

function resolveGitHubGraphqlUrl(baseUrl: string): string {
  if (baseUrl === "https://api.github.com") {
    return "https://api.github.com/graphql";
  }
  return `${baseUrl.replace(/\/v3$/i, "")}/graphql`;
}

function decodeBase64Utf8(base64: string): string {
  const clean = base64.replace(/\s+/g, "");
  const binary = atob(clean);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return new TextDecoder("utf-8", { fatal: false }).decode(bytes);
}

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function normalizeBaseUrl(provider: GitProvider, rawBaseUrl?: string): string {
  const trimmed = (rawBaseUrl || "").trim().replace(/\/+$/, "");
  if (trimmed) {
    let parsed: URL;
    try {
      parsed = new URL(trimmed);
    } catch {
      throw new Error("URL customizada inválida.");
    }
    if (parsed.protocol !== "https:") {
      throw new Error("A URL customizada do provedor deve utilizar HTTPS.");
    }
    return parsed.origin + parsed.pathname.replace(/\/+$/, "");
  }

  return provider === "github" ? "https://api.github.com" : "https://gitlab.com";
}

export function normalizeRepositorySlug(raw: string): string {
  let cleaned = raw.trim();
  if (/^https?:\/\//i.test(cleaned)) {
    try {
      const parsed = new URL(cleaned);
      cleaned = parsed.pathname.replace(/^\/+|\/+$/g, "");
    } catch {
      throw new Error('URL de repositório inválida. Use "organizacao/nome-do-repo".');
    }
  }
  cleaned = cleaned.replace(/\.git$/i, "").replace(/^\/+|\/+$/g, "");

  if (!cleaned || !cleaned.includes("/")) {
    throw new Error('Informe o repositório no formato "organizacao/nome-do-repo".');
  }
  return cleaned;
}

export function buildRepoDocId(provider: GitProvider, repository: string, branch: string): string {
  return `${provider}__${repository}__${branch}`
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "__")
    .replace(/^_+|_+$/g, "")
    .slice(0, 180);
}

async function fetchWithTimeout(url: string, init: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } catch (err: unknown) {
    if (err instanceof DOMException && err.name === "AbortError") {
      throw new Error("Tempo limite excedido ao consultar o provedor Git.");
    }
    throw new Error(
      "Falha de conexão ou bloqueio CORS ao acessar a API do provedor Git. Verifique sua rede ou se o servidor permite requisições do navegador."
    );
  } finally {
    clearTimeout(timeout);
  }
}

function extractExactMatchesFromContent(
  content: string,
  flagKey: string,
  filePath: string,
  includeSnippets: boolean
): CodeReferenceMatch[] {
  const matches: CodeReferenceMatch[] = [];
  const pattern = new RegExp(
    `(?<![A-Za-z0-9_])${escapeRegex(flagKey)}(?![A-Za-z0-9_])`
  );
  const lines = content.split(/\r?\n/);

  for (let i = 0; i < lines.length; i++) {
    const lineText = lines[i];
    if (pattern.test(lineText)) {
      const entry: CodeReferenceMatch = {
        file: filePath,
        line: i + 1,
      };
      if (includeSnippets) {
        const trimmed = lineText.trim();
        entry.snippet =
          trimmed.length > MAX_SNIPPET_LENGTH
            ? `${trimmed.slice(0, MAX_SNIPPET_LENGTH - 3)}...`
            : trimmed;
      }
      matches.push(entry);
    }
  }
  return matches;
}

/**
 * Validates token and repository accessibility directly from the browser via CORS-enabled Git APIs.
 */
export async function validateRepositoryAccess(params: {
  provider: GitProvider;
  repository: string;
  branch?: string;
  token: string;
  baseUrl?: string;
}): Promise<ValidatedRepoInfo> {
  const repoSlug = normalizeRepositorySlug(params.repository);
  const baseUrl = normalizeBaseUrl(params.provider, params.baseUrl);
  const token = params.token.trim();

  if (!token) {
    throw new Error("O token de acesso (somente leitura) é obrigatório.");
  }

  if (params.provider === "github") {
    const resp = await fetchWithTimeout(`${baseUrl}/repos/${repoSlug}`, {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/vnd.github+json",
      },
    });

    if (resp.status === 401) {
      throw new Error("Token do GitHub inválido ou expirado.");
    }
    if (resp.status === 403 || resp.status === 404) {
      throw new Error(
        `Repositório "${repoSlug}" não encontrado ou o token não tem permissão Contents (Read-only).`
      );
    }
    if (!resp.ok) {
      throw new Error(`Erro ao validar repositório no GitHub (HTTP ${resp.status}).`);
    }

    const data = (await resp.json()) as {
      full_name: string;
      default_branch: string;
      html_url: string;
      private: boolean;
    };

    const targetBranch = params.branch?.trim() || data.default_branch || "main";
    return {
      repository: data.full_name || repoSlug,
      provider: "github",
      defaultBranch: data.default_branch || "main",
      branch: targetBranch,
      repoUrl: data.html_url,
      baseUrl,
      isPrivate: Boolean(data.private),
    };
  }

  // GitLab
  const encodedPath = encodeURIComponent(repoSlug);
  const resp = await fetchWithTimeout(`${baseUrl}/api/v4/projects/${encodedPath}`, {
    headers: {
      "PRIVATE-TOKEN": token,
      Accept: "application/json",
    },
  });

  if (resp.status === 401) {
    throw new Error("Token do GitLab inválido ou expirado.");
  }
  if (resp.status === 403 || resp.status === 404) {
    throw new Error(
      `Projeto "${repoSlug}" não encontrado ou o token não tem escopos read_repository / read_api.`
    );
  }
  if (!resp.ok) {
    throw new Error(`Erro ao validar projeto no GitLab (HTTP ${resp.status}).`);
  }

  const data = (await resp.json()) as {
    path_with_namespace: string;
    default_branch: string;
    web_url: string;
    visibility: string;
  };

  const targetBranch = params.branch?.trim() || data.default_branch || "main";
  return {
    repository: data.path_with_namespace || repoSlug,
    provider: "gitlab",
    defaultBranch: data.default_branch || "main",
    branch: targetBranch,
    repoUrl: data.web_url,
    baseUrl,
    isPrivate: data.visibility !== "public",
  };
}

async function fetchBlobsViaGraphQL(params: {
  graphqlUrl: string;
  owner: string;
  repoName: string;
  blobs: Array<{ path: string; sha: string }>;
  token: string;
}): Promise<Array<{ path: string; content: string }>> {
  const results: Array<{ path: string; content: string }> = [];
  const batches: Array<Array<{ path: string; sha: string }>> = [];

  for (let i = 0; i < params.blobs.length; i += GRAPHQL_BATCH_SIZE) {
    batches.push(params.blobs.slice(i, i + GRAPHQL_BATCH_SIZE));
  }

  // Process up to 3 GraphQL batches concurrently
  const CONCURRENCY = 3;
  for (let i = 0; i < batches.length; i += CONCURRENCY) {
    const chunk = batches.slice(i, i + CONCURRENCY);
    const chunkResults = await Promise.all(
      chunk.map(async (batch) => {
        const fields = batch
          .map((item, idx) => `f${idx}: object(oid: "${item.sha}") { ... on Blob { isBinary text } }`)
          .join("\n");

        const query = `query($owner: String!, $name: String!) {
          repository(owner: $owner, name: $name) {
            ${fields}
          }
        }`;

        const resp = await fetchWithTimeout(params.graphqlUrl, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${params.token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            query,
            variables: { owner: params.owner, name: params.repoName },
          }),
        });

        if (resp.status === 401) {
          throw new Error("Token do GitHub expirado ou revogado.");
        }
        if (!resp.ok) {
          throw new Error(`GraphQL HTTP ${resp.status}`);
        }

        const payload = (await resp.json()) as {
          data?: {
            repository?: Record<string, { isBinary?: boolean; text?: string | null } | null>;
          };
          errors?: Array<{ message?: string }>;
        };

        const repoNode = payload.data?.repository;
        if (!repoNode) {
          const msg = payload.errors?.[0]?.message || "Resposta vazia do GraphQL";
          throw new Error(msg);
        }

        const loaded: Array<{ path: string; content: string }> = [];
        batch.forEach((item, idx) => {
          const blob = repoNode[`f${idx}`];
          if (blob && !blob.isBinary && typeof blob.text === "string") {
            loaded.push({ path: item.path, content: blob.text });
          }
        });
        return loaded;
      })
    );

    for (const list of chunkResults) {
      results.push(...list);
    }
  }

  return results;
}

async function fetchBlobsViaRest(params: {
  baseUrl: string;
  repository: string;
  blobs: Array<{ path: string; sha: string }>;
  token: string;
}): Promise<Array<{ path: string; content: string }>> {
  const results: Array<{ path: string; content: string }> = [];
  const CONCURRENCY = 8;

  for (let i = 0; i < params.blobs.length; i += CONCURRENCY) {
    const chunk = params.blobs.slice(i, i + CONCURRENCY);
    const loadedChunk = await Promise.all(
      chunk.map(async (item) => {
        try {
          const resp = await fetchWithTimeout(
            `${params.baseUrl}/repos/${params.repository}/git/blobs/${item.sha}`,
            {
              headers: {
                Authorization: `Bearer ${params.token}`,
                Accept: "application/vnd.github+json",
              },
            }
          );
          if (!resp.ok) return null;
          const data = (await resp.json()) as { content?: string; encoding?: string };
          if (data.content && data.encoding === "base64") {
            return { path: item.path, content: decodeBase64Utf8(data.content) };
          }
          return null;
        } catch {
          return null;
        }
      })
    );

    for (const item of loadedChunk) {
      if (item) results.push(item);
    }
  }

  return results;
}

/**
 * Searches a GitHub repository on the exact configured branch using CORS-safe endpoints
 * (`git/trees?recursive=1` + batched GraphQL blob reads, with REST blob fallback)
 * and caches the repository's source files in RAM by tree SHA so subsequent flag searches
 * are instant and never hit `/search/code` CORS or 10 req/min rate limits.
 */
async function searchGitHub(
  repo: ConnectedRepository,
  token: string,
  flagKey: string
): Promise<CodeReferenceMatch[]> {
  const baseUrl = normalizeBaseUrl("github", repo.baseUrl);
  const treeUrl = `${baseUrl}/repos/${repo.repository}/git/trees/${encodeURIComponent(repo.branch)}?recursive=1`;

  const treeResp = await fetchWithTimeout(treeUrl, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
    },
  });

  if (treeResp.status === 401) {
    throw new Error("Token do GitHub expirado ou revogado.");
  }
  if (treeResp.status === 404) {
    throw new Error(
      `Branch "${repo.branch}" ou repositório "${repo.repository}" não encontrado (verifique permissão Contents: Read-only).`
    );
  }
  if (treeResp.status === 403 || treeResp.status === 429) {
    throw new Error("Limite de requisições da API do GitHub atingido ou acesso negado.");
  }
  if (!treeResp.ok) {
    throw new Error(`Erro ao listar arquivos do repositório no GitHub (HTTP ${treeResp.status}).`);
  }

  const treeData = (await treeResp.json()) as {
    sha: string;
    tree?: Array<{
      path?: string;
      type?: string;
      sha?: string;
      size?: number;
    }>;
  };

  let repoFiles: Array<{ path: string; content: string }>;
  const cached = githubRepoFilesCache.get(repo.id);

  if (cached && cached.treeSha === treeData.sha) {
    repoFiles = cached.files;
  } else {
    const candidateBlobs = (treeData.tree || [])
      .filter(
        (item): item is { path: string; type: string; sha: string; size: number } =>
          item.type === "blob" &&
          typeof item.path === "string" &&
          typeof item.sha === "string" &&
          typeof item.size === "number" &&
          item.size > 0 &&
          item.size <= MAX_GITHUB_FILE_BYTES &&
          shouldScanGitHubPath(item.path)
      )
      .sort((a, b) => getFilePriority(a.path) - getFilePriority(b.path))
      .slice(0, MAX_GITHUB_SCANNED_FILES)
      .map((item) => ({ path: item.path, sha: item.sha }));

    const [owner, repoName] = repo.repository.split("/");

    try {
      repoFiles = await fetchBlobsViaGraphQL({
        graphqlUrl: resolveGitHubGraphqlUrl(baseUrl),
        owner,
        repoName,
        blobs: candidateBlobs,
        token,
      });
    } catch {
      // Fallback to REST /git/blobs if GraphQL is unavailable
      repoFiles = await fetchBlobsViaRest({
        baseUrl,
        repository: repo.repository,
        blobs: candidateBlobs,
        token,
      });
    }

    githubRepoFilesCache.set(repo.id, {
      treeSha: treeData.sha,
      files: repoFiles,
    });
  }

  const allMatches: CodeReferenceMatch[] = [];
  for (const file of repoFiles) {
    if (!file.content.includes(flagKey)) continue;

    const fileMatches = extractExactMatchesFromContent(
      file.content,
      flagKey,
      file.path,
      repo.includeSnippets
    );
    for (const match of fileMatches) {
      if (allMatches.length >= MAX_MATCHES_PER_REPO) return allMatches;
      allMatches.push(match);
    }
  }

  return allMatches;
}

async function searchGitLab(
  repo: ConnectedRepository,
  token: string,
  flagKey: string
): Promise<CodeReferenceMatch[]> {
  const baseUrl = normalizeBaseUrl("gitlab", repo.baseUrl);
  const encodedPath = encodeURIComponent(repo.repository);
  const url = `${baseUrl}/api/v4/projects/${encodedPath}/search?scope=blobs&search=${encodeURIComponent(flagKey)}&ref=${encodeURIComponent(repo.branch)}&per_page=${MAX_FILES_PER_REPO}`;

  const resp = await fetchWithTimeout(url, {
    headers: {
      "PRIVATE-TOKEN": token,
      Accept: "application/json",
    },
  });

  if (resp.status === 401) {
    throw new Error("Token do GitLab expirado ou revogado.");
  }
  if (resp.status === 429) {
    throw new Error("Limite de requisições da API do GitLab atingido. Tente novamente em instantes.");
  }
  if (!resp.ok) {
    throw new Error(`Erro na busca do GitLab (HTTP ${resp.status}).`);
  }

  const items = (await resp.json()) as Array<{
    path: string;
    startline?: number;
    data?: string;
  }>;

  const matches: CodeReferenceMatch[] = [];
  const pattern = new RegExp(`(?<![A-Za-z0-9_])${escapeRegex(flagKey)}(?![A-Za-z0-9_])`);

  for (const item of items) {
    if (matches.length >= MAX_MATCHES_PER_REPO) break;
    const baseLine = typeof item.startline === "number" && item.startline > 0 ? item.startline : 1;
    const dataLines = (item.data || "").split(/\r?\n/);

    let foundInSnippet = false;
    for (let i = 0; i < dataLines.length; i++) {
      if (pattern.test(dataLines[i])) {
        foundInSnippet = true;
        const entry: CodeReferenceMatch = {
          file: item.path,
          line: baseLine + i,
        };
        if (repo.includeSnippets) {
          const trimmed = dataLines[i].trim();
          entry.snippet =
            trimmed.length > MAX_SNIPPET_LENGTH
              ? `${trimmed.slice(0, MAX_SNIPPET_LENGTH - 3)}...`
              : trimmed;
        }
        matches.push(entry);
        if (matches.length >= MAX_MATCHES_PER_REPO) break;
      }
    }

    if (!foundInSnippet && item.path) {
      matches.push({ file: item.path, line: baseLine });
    }
  }

  return matches;
}

export async function searchFlagAcrossRepositories(params: {
  repos: ConnectedRepository[];
  tokensByRepoId: Record<string, string>;
  flagKey: string;
}): Promise<FlagReferencesResult> {
  const enabledRepos = params.repos.filter((r) => r.enabled);

  const repoResults = await Promise.all(
    enabledRepos.map(async (repo): Promise<RepoSearchResult> => {
      const baseResult: RepoSearchResult = {
        repoId: repo.id,
        repository: repo.repository,
        provider: repo.provider,
        branch: repo.branch,
        repoUrl: repo.repoUrl,
        snippetsIncluded: repo.includeSnippets,
        matches: [],
      };

      const token = params.tokensByRepoId[repo.id];
      if (!token) {
        baseResult.error =
          repo.storageMode === "session"
            ? "Token temporário desta sessão expirou. Reconecte o repositório ou informe o token novamente."
            : "Cofre travado ou token indisponível. Destrave o cofre com sua senha.";
        return baseResult;
      }

      try {
        baseResult.matches =
          repo.provider === "github"
            ? await searchGitHub(repo, token, params.flagKey)
            : await searchGitLab(repo, token, params.flagKey);
      } catch (err: unknown) {
        baseResult.error =
          err instanceof Error ? err.message : "Erro inesperado ao buscar no repositório.";
      }

      return baseResult;
    })
  );

  repoResults.sort((a, b) => a.repository.localeCompare(b.repository));

  let totalReposWithMatches = 0;
  let totalFiles = 0;
  let totalOccurrences = 0;

  for (const r of repoResults) {
    if (r.matches.length > 0) {
      totalReposWithMatches += 1;
      totalFiles += new Set(r.matches.map((m) => m.file)).size;
      totalOccurrences += r.matches.length;
    }
  }

  return {
    flagKey: params.flagKey,
    scannedAt: new Date().toISOString(),
    scannedRepoIds: enabledRepos.map((r) => r.id).sort(),
    totalRepos: totalReposWithMatches,
    totalFiles,
    totalOccurrences,
    repos: repoResults,
  };
}
