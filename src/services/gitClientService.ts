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
const REQUEST_TIMEOUT_MS = 15000;

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

async function searchGitHub(
  repo: ConnectedRepository,
  token: string,
  flagKey: string
): Promise<CodeReferenceMatch[]> {
  const baseUrl = normalizeBaseUrl("github", repo.baseUrl);
  const query = `"${flagKey}" repo:${repo.repository}`;
  const searchUrl = `${baseUrl}/search/code?q=${encodeURIComponent(query)}&per_page=${MAX_FILES_PER_REPO}`;

  const resp = await fetchWithTimeout(searchUrl, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github.text-match+json",
    },
  });

  if (resp.status === 401) {
    throw new Error("Token do GitHub expirado ou revogado.");
  }
  if (resp.status === 403 || resp.status === 429) {
    const retryAfter = resp.headers.get("retry-after");
    throw new Error(
      retryAfter
        ? `Limite de buscas da API do GitHub atingido. Tente novamente em ${retryAfter}s.`
        : "Limite de buscas da API do GitHub atingido (máx. 10 req/min) ou sem permissão."
    );
  }
  if (!resp.ok) {
    throw new Error(`Erro na busca do GitHub (HTTP ${resp.status}).`);
  }

  const data = (await resp.json()) as {
    items?: Array<{
      path: string;
      text_matches?: Array<{ fragment?: string }>;
    }>;
  };

  const items = (data.items || []).slice(0, MAX_FILES_PER_REPO);
  if (items.length === 0) return [];

  const fileResults = await Promise.all(
    items.map(async (item) => {
      try {
        const encodedPath = item.path
          .split("/")
          .map((seg) => encodeURIComponent(seg))
          .join("/");
        const contentUrl = `${baseUrl}/repos/${repo.repository}/contents/${encodedPath}?ref=${encodeURIComponent(repo.branch)}`;
        const fileResp = await fetchWithTimeout(contentUrl, {
          headers: {
            Authorization: `Bearer ${token}`,
            Accept: "application/vnd.github.raw+json",
          },
        });

        if (fileResp.ok) {
          const text = await fileResp.text();
          return extractExactMatchesFromContent(
            text,
            flagKey,
            item.path,
            repo.includeSnippets
          );
        }
      } catch {
        // Fall back to fragment if individual file fetch fails
      }

      const fallbackSnippet =
        repo.includeSnippets && item.text_matches?.[0]?.fragment
          ? item.text_matches[0].fragment.trim().slice(0, MAX_SNIPPET_LENGTH)
          : undefined;

      return [
        {
          file: item.path,
          line: 1,
          ...(fallbackSnippet ? { snippet: fallbackSnippet } : {}),
        },
      ];
    })
  );

  const allMatches: CodeReferenceMatch[] = [];
  for (const list of fileResults) {
    for (const match of list) {
      if (allMatches.length >= MAX_MATCHES_PER_REPO) break;
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
