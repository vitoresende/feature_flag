export type GitProvider = "github" | "gitlab";

export type TokenStorageMode = "vault" | "session";

export interface EncryptedTokenBlob {
  ciphertext: string; // base64
  iv: string;         // base64
  salt: string;       // base64
  iterations: number;
  algorithm: "AES-256-GCM";
}

export interface ConnectedRepository {
  id: string;
  repository: string;
  provider: GitProvider;
  branch: string;
  defaultBranch?: string;
  repoUrl: string;
  baseUrl?: string;
  isPrivate?: boolean;
  tokenHint: string;
  storageMode: TokenStorageMode;
  encryptedToken?: EncryptedTokenBlob | null;
  includeSnippets: boolean;
  enabled: boolean;
  connectedBy?: string;
  connectedAt?: unknown;
  updatedAt?: unknown;
}

export interface CodeReferenceMatch {
  file: string;
  line: number;
  snippet?: string;
}

export interface RepoSearchResult {
  repoId: string;
  repository: string;
  provider: GitProvider;
  branch: string;
  repoUrl: string;
  snippetsIncluded: boolean;
  matches: CodeReferenceMatch[];
  error?: string;
}

export interface FlagReferencesResult {
  flagKey: string;
  scannedAt?: unknown;
  scannedRepoIds?: string[];
  totalRepos: number;
  totalFiles: number;
  totalOccurrences: number;
  repos: RepoSearchResult[];
}

export function parseTimestamp(value: unknown): Date | null {
  if (!value) return null;
  if (value instanceof Date) return isNaN(value.getTime()) ? null : value;
  if (typeof value === "string" || typeof value === "number") {
    const date = new Date(value);
    return isNaN(date.getTime()) ? null : date;
  }
  if (typeof value === "object" && value !== null) {
    const maybeTs = value as { toDate?: () => Date; seconds?: number };
    if (typeof maybeTs.toDate === "function") {
      const date = maybeTs.toDate();
      return isNaN(date.getTime()) ? null : date;
    }
    if (typeof maybeTs.seconds === "number") {
      return new Date(maybeTs.seconds * 1000);
    }
  }
  return null;
}

export function formatRelativeDate(value: unknown): string {
  const date = parseTimestamp(value);
  if (!date) return "agora";

  const diffMs = Date.now() - date.getTime();
  const diffSec = Math.max(0, Math.floor(diffMs / 1000));

  if (diffSec < 60) return "agora há pouco";
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `há ${diffMin} min`;
  const diffHours = Math.floor(diffMin / 60);
  if (diffHours < 24) return `há ${diffHours}h`;
  const diffDays = Math.floor(diffHours / 24);
  if (diffDays < 30) return `há ${diffDays}d`;

  return date.toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

export function formatExactDate(value: unknown): string {
  const date = parseTimestamp(value);
  if (!date) return "";
  return date.toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function buildFileLineUrl(
  repo: Pick<RepoSearchResult, "repoUrl" | "provider" | "branch">,
  file: string,
  line: number
): string | null {
  if (!repo.repoUrl) return null;

  let baseUrl: string;
  try {
    const parsed = new URL(repo.repoUrl);
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
      return null;
    }
    baseUrl = repo.repoUrl.replace(/\/+$/, "");
  } catch {
    return null;
  }

  const ref = encodeURIComponent(repo.branch || "main");
  const encodedPath = file
    .split("/")
    .map((segment) => encodeURIComponent(segment))
    .join("/");

  switch (repo.provider) {
    case "github":
      return `${baseUrl}/blob/${ref}/${encodedPath}#L${line}`;
    case "gitlab":
      return `${baseUrl}/-/blob/${ref}/${encodedPath}#L${line}`;
  }
}
