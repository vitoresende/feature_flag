import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  X,
  Code2,
  GitBranch,
  FolderGit2,
  FileCode2,
  ExternalLink,
  Copy,
  Check,
  Search,
  Clock,
  ShieldCheck,
  AlertCircle,
  AlertTriangle,
  RefreshCw,
  Plus,
  Lock,
} from "lucide-react";
import {
  ConnectedRepository,
  FlagReferencesResult,
  buildFileLineUrl,
  formatExactDate,
  formatRelativeDate,
} from "../types/codeReferences";

interface FlagReferencesModalProps {
  isOpen: boolean;
  flagId: string | null;
  description: string;
  cachedResult: FlagReferencesResult | null;
  repos: ConnectedRepository[];
  unlockedTokens: Record<string, string>;
  onUnlockVault: (passphrase: string) => Promise<Record<string, string>>;
  onSearchFlag: (
    flagKey: string,
    overrideTokens?: Record<string, string>
  ) => Promise<FlagReferencesResult>;
  onClose: () => void;
  onOpenConnectRepos: () => void;
}

function renderHighlightedSnippet(snippet: string, flagId: string): React.ReactNode {
  if (!flagId) return snippet;
  const parts = snippet.split(flagId);
  if (parts.length <= 1) return snippet;

  return parts.map((part, idx) => (
    <React.Fragment key={idx}>
      {part}
      {idx < parts.length - 1 && (
        <mark className="bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 rounded px-1 py-0.5 font-semibold">
          {flagId}
        </mark>
      )}
    </React.Fragment>
  ));
}

export default function FlagReferencesModal({
  isOpen,
  flagId,
  description,
  cachedResult,
  repos,
  unlockedTokens,
  onUnlockVault,
  onSearchFlag,
  onClose,
  onOpenConnectRepos,
}: FlagReferencesModalProps) {
  const [liveResult, setLiveResult] = useState<FlagReferencesResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showUnlockPrompt, setShowUnlockPrompt] = useState(false);
  const [passphraseInput, setPassphraseInput] = useState("");
  const [unlockLoading, setUnlockLoading] = useState(false);
  const [selectedRepoFilter, setSelectedRepoFilter] = useState<string>("all");
  const [fileSearch, setFileSearch] = useState("");
  const [copiedPath, setCopiedPath] = useState<string | null>(null);
  const activeFlagRef = useRef<string | null>(null);

  const enabledRepos = useMemo(() => repos.filter((r) => r.enabled), [repos]);

  const needsVaultUnlock = useMemo(() => {
    return enabledRepos.some(
      (r) => r.storageMode === "vault" && r.encryptedToken && !unlockedTokens[r.id]
    );
  }, [enabledRepos, unlockedTokens]);

  const runSearch = useCallback(
    async (targetFlag: string, overrideTokens?: Record<string, string>) => {
      setLoading(true);
      setError(null);
      try {
        const data = await onSearchFlag(targetFlag, overrideTokens);
        if (activeFlagRef.current === targetFlag) {
          setLiveResult(data);
        }
      } catch (err: unknown) {
        if (activeFlagRef.current === targetFlag) {
          setError(
            err instanceof Error
              ? err.message
              : "Não foi possível consultar os repositórios conectados."
          );
        }
      } finally {
        if (activeFlagRef.current === targetFlag) {
          setLoading(false);
        }
      }
    },
    [onSearchFlag]
  );

  useEffect(() => {
    activeFlagRef.current = isOpen ? flagId : null;
    setSelectedRepoFilter("all");
    setFileSearch("");
    setError(null);
    setLiveResult(null);
    setPassphraseInput("");
    setShowUnlockPrompt(false);

    if (isOpen && flagId && enabledRepos.length > 0 && !cachedResult) {
      if (needsVaultUnlock) {
        setShowUnlockPrompt(true);
      } else {
        void runSearch(flagId);
      }
    }
  }, [isOpen, flagId, enabledRepos.length, cachedResult, needsVaultUnlock, runSearch]);

  const effectiveResult = liveResult || cachedResult;

  const reposWithMatches = useMemo(() => {
    if (!effectiveResult) return [];
    return effectiveResult.repos.filter((r) => r.matches.length > 0);
  }, [effectiveResult]);

  const repoErrors = useMemo(() => {
    if (!effectiveResult) return [];
    return effectiveResult.repos.filter((r) => Boolean(r.error));
  }, [effectiveResult]);

  const filteredRepos = useMemo(() => {
    const term = fileSearch.trim().toLowerCase();

    return reposWithMatches
      .filter((r) => selectedRepoFilter === "all" || r.repoId === selectedRepoFilter)
      .map((r) => {
        if (!term) return r;
        const filteredMatches = r.matches.filter(
          (m) =>
            m.file.toLowerCase().includes(term) ||
            (m.snippet && m.snippet.toLowerCase().includes(term))
        );
        return {
          ...r,
          matches: filteredMatches,
        };
      })
      .filter((r) => r.matches.length > 0);
  }, [reposWithMatches, selectedRepoFilter, fileSearch]);

  if (!isOpen || !flagId) return null;

  const handleTriggerRescan = () => {
    if (needsVaultUnlock) {
      setShowUnlockPrompt(true);
      setError(null);
      return;
    }
    void runSearch(flagId);
  };

  const handleUnlockAndSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!passphraseInput) return;
    setUnlockLoading(true);
    setError(null);
    try {
      const freshTokens = await onUnlockVault(passphraseInput);
      setPassphraseInput("");
      setShowUnlockPrompt(false);
      await runSearch(flagId, freshTokens);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Senha do cofre incorreta.");
    } finally {
      setUnlockLoading(false);
    }
  };

  const handleCopyPath = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedPath(text);
    setTimeout(() => setCopiedPath(null), 1800);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4 py-6">
      {/* Overlay */}
      <div
        className="absolute inset-0 bg-black/70 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Dialog */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl w-full max-w-3xl shadow-2xl relative z-10 flex flex-col max-h-[88vh] overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="p-6 pb-4 border-b border-zinc-800/80 flex items-start justify-between gap-4 shrink-0">
          <div className="space-y-2 min-w-0">
            <div className="flex items-center gap-2.5 flex-wrap">
              <div className="p-2 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 shrink-0">
                <Code2 className="h-4 w-4" />
              </div>
              <span className="font-mono font-bold text-base text-zinc-100 bg-zinc-950 px-3 py-1 rounded-lg border border-zinc-800 break-all">
                {flagId}
              </span>
              <button
                type="button"
                onClick={() => handleCopyPath(flagId)}
                title="Copiar chave da flag"
                className="p-1.5 rounded-lg text-zinc-500 hover:text-zinc-200 hover:bg-zinc-800 transition-colors cursor-pointer"
              >
                {copiedPath === flagId ? (
                  <Check className="h-3.5 w-3.5 text-emerald-400" />
                ) : (
                  <Copy className="h-3.5 w-3.5" />
                )}
              </button>
            </div>
            {description && (
              <p className="text-xs text-zinc-400 leading-relaxed">{description}</p>
            )}
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {enabledRepos.length > 0 && (
              <button
                type="button"
                onClick={handleTriggerRescan}
                disabled={loading || unlockLoading}
                title="Buscar novamente nos repositórios conectados"
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 text-zinc-200 transition-all cursor-pointer disabled:opacity-50"
              >
                <RefreshCw
                  className={`h-3.5 w-3.5 text-emerald-400 ${loading ? "animate-spin" : ""}`}
                />
                <span>{loading ? "Buscando..." : "Reescanear"}</span>
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded-lg text-zinc-500 hover:text-zinc-200 hover:bg-zinc-800 transition-colors cursor-pointer"
              title="Fechar"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        {/* Summary Strip & Filter */}
        {effectiveResult && effectiveResult.totalOccurrences > 0 && (
          <div className="px-6 py-3.5 bg-zinc-950/60 border-b border-zinc-800/80 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shrink-0">
            <div className="flex items-center gap-3 flex-wrap text-xs">
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-300 font-semibold">
                <FileCode2 className="h-3.5 w-3.5" />
                {effectiveResult.totalFiles}{" "}
                {effectiveResult.totalFiles === 1 ? "arquivo" : "arquivos"}
              </span>
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-blue-500/10 border border-blue-500/20 text-blue-300 font-semibold">
                <FolderGit2 className="h-3.5 w-3.5" />
                {effectiveResult.totalRepos}{" "}
                {effectiveResult.totalRepos === 1 ? "repositório" : "repositórios"}
              </span>
              <span className="text-zinc-400 font-medium">
                {effectiveResult.totalOccurrences}{" "}
                {effectiveResult.totalOccurrences === 1 ? "ocorrência" : "ocorrências"}
              </span>
              {effectiveResult.scannedAt ? (
                <span
                  className="inline-flex items-center gap-1 text-[11px] text-zinc-500"
                  title={formatExactDate(effectiveResult.scannedAt)}
                >
                  <Clock className="h-3 w-3" />
                  {formatRelativeDate(effectiveResult.scannedAt)}
                </span>
              ) : null}
            </div>

            <div className="relative w-full sm:w-56">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-zinc-500" />
              <input
                type="text"
                value={fileSearch}
                onChange={(e) => setFileSearch(e.target.value)}
                placeholder="Filtrar arquivo ou código..."
                className="w-full pl-8 pr-3 py-1.5 text-xs bg-zinc-900 border border-zinc-800 rounded-lg focus:border-emerald-500 outline-none text-zinc-200"
              />
            </div>
          </div>
        )}

        {/* Repo Tabs if multiple repos use this flag */}
        {reposWithMatches.length > 1 && (
          <div className="px-6 py-2.5 bg-zinc-900/80 border-b border-zinc-800/80 flex items-center gap-2 overflow-x-auto shrink-0">
            <button
              type="button"
              onClick={() => setSelectedRepoFilter("all")}
              className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold transition-all cursor-pointer shrink-0 ${
                selectedRepoFilter === "all"
                  ? "bg-zinc-800 text-zinc-100 border border-zinc-700"
                  : "text-zinc-400 hover:text-zinc-200"
              }`}
            >
              Todos ({reposWithMatches.length})
            </button>
            {reposWithMatches.map((r) => (
              <button
                key={r.repoId}
                type="button"
                onClick={() => setSelectedRepoFilter(r.repoId)}
                className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold transition-all cursor-pointer shrink-0 flex items-center gap-1.5 ${
                  selectedRepoFilter === r.repoId
                    ? "bg-emerald-500/15 text-emerald-300 border border-emerald-500/30"
                    : "text-zinc-400 hover:text-zinc-200"
                }`}
              >
                <span className="font-mono">{r.repository}</span>
                <span className="text-[10px] opacity-70">({r.matches.length})</span>
              </button>
            ))}
          </div>
        )}

        {/* Content Area */}
        <div className="p-6 overflow-y-auto flex-1 space-y-4">
          {error && (
            <div className="p-4 rounded-xl bg-red-950/30 border border-red-900/50 text-red-200 text-xs flex items-start gap-2.5">
              <AlertTriangle className="h-4 w-4 text-red-400 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          {/* Inline Vault Unlock Prompt */}
          {showUnlockPrompt && needsVaultUnlock && (
            <form
              onSubmit={handleUnlockAndSearch}
              className="p-5 rounded-xl bg-amber-500/5 border border-amber-500/25 space-y-3"
            >
              <div className="flex items-start gap-3">
                <div className="p-2 rounded-lg bg-amber-500/15 text-amber-400 shrink-0">
                  <Lock className="h-4 w-4" />
                </div>
                <div className="space-y-1 text-xs">
                  <p className="font-bold text-amber-300">
                    Destrave o cofre para buscar em tempo real
                  </p>
                  <p className="text-zinc-400 leading-relaxed">
                    Os tokens dos seus repositórios estão criptografados com AES-256-GCM. Digite a
                    senha do cofre uma vez para destravar esta sessão e buscar{" "}
                    <span className="font-mono text-zinc-200">{flagId}</span>.
                  </p>
                </div>
              </div>
              <div className="flex flex-col sm:flex-row gap-2.5">
                <input
                  type="password"
                  value={passphraseInput}
                  onChange={(e) => setPassphraseInput(e.target.value)}
                  placeholder="Digite a senha do cofre..."
                  autoFocus
                  disabled={unlockLoading}
                  className="flex-1 px-3.5 py-2 text-xs bg-zinc-950 border border-zinc-700 rounded-xl focus:border-emerald-500 outline-none text-zinc-100"
                />
                <button
                  type="submit"
                  disabled={unlockLoading || !passphraseInput}
                  className="px-4 py-2 rounded-xl text-xs font-bold bg-amber-500 hover:bg-amber-400 text-zinc-950 transition-colors cursor-pointer disabled:opacity-50 shrink-0"
                >
                  {unlockLoading ? "Descriptografando..." : "Destravar e Buscar"}
                </button>
              </div>
            </form>
          )}

          {repoErrors.length > 0 && (
            <div className="p-3.5 rounded-xl bg-amber-950/20 border border-amber-500/30 text-amber-200 text-xs space-y-1.5">
              <p className="font-bold text-amber-300 flex items-center gap-1.5">
                <AlertTriangle className="h-3.5 w-3.5" />
                Avisos em alguns repositórios:
              </p>
              {repoErrors.map((r) => (
                <p key={r.repoId} className="text-[11px] text-amber-200/80">
                  <span className="font-mono font-semibold">{r.repository}</span>: {r.error}
                </p>
              ))}
            </div>
          )}

          {repos.length === 0 ? (
            <div className="py-10 text-center flex flex-col items-center justify-center gap-3 max-w-md mx-auto">
              <div className="p-3.5 rounded-2xl bg-zinc-800/70 border border-zinc-700/70 text-emerald-400">
                <FolderGit2 className="h-6 w-6" />
              </div>
              <h4 className="text-sm font-bold text-zinc-100">
                Nenhum repositório conectado ainda
              </h4>
              <p className="text-xs text-zinc-400 leading-relaxed">
                Conecte seus repositórios do GitHub ou GitLab diretamente pela aplicação. Os tokens
                read-only são criptografados no navegador com AES-256-GCM antes de serem salvos.
              </p>
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onOpenConnectRepos();
                }}
                className="mt-2 py-2.5 px-4 rounded-xl text-xs font-bold bg-emerald-500 hover:bg-emerald-600 text-zinc-950 transition-all cursor-pointer flex items-center gap-2 shadow-lg shadow-emerald-500/10"
              >
                <Plus className="h-4 w-4 stroke-[3]" />
                Conectar Repositório
              </button>
            </div>
          ) : enabledRepos.length === 0 ? (
            <div className="py-10 text-center flex flex-col items-center justify-center gap-3 max-w-md mx-auto">
              <div className="p-3.5 rounded-2xl bg-zinc-800/70 border border-zinc-700/70 text-amber-400">
                <AlertCircle className="h-6 w-6" />
              </div>
              <h4 className="text-sm font-bold text-zinc-100">
                Todos os repositórios estão pausados
              </h4>
              <p className="text-xs text-zinc-400 leading-relaxed">
                Ative pelo menos um repositório conectado para pesquisar o uso desta feature flag.
              </p>
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onOpenConnectRepos();
                }}
                className="mt-1 py-2 px-4 rounded-xl text-xs font-semibold bg-zinc-800 hover:bg-zinc-700 text-zinc-100 border border-zinc-700 transition-colors cursor-pointer"
              >
                Gerenciar Repositórios
              </button>
            </div>
          ) : loading && !effectiveResult ? (
            <div className="py-16 text-center flex flex-col items-center justify-center gap-3 text-zinc-400">
              <RefreshCw className="h-7 w-7 animate-spin text-emerald-500" />
              <div className="space-y-1">
                <p className="text-sm font-semibold text-zinc-200">
                  Buscando referências em {enabledRepos.length}{" "}
                  {enabledRepos.length === 1 ? "repositório" : "repositórios"}...
                </p>
                <p className="text-xs text-zinc-500">
                  Consultando arquivos e linhas exatas diretamente via API Git
                </p>
              </div>
            </div>
          ) : !effectiveResult ? null : reposWithMatches.length === 0 ? (
            <div className="py-10 text-center flex flex-col items-center justify-center gap-3 max-w-md mx-auto">
              <div className="p-3.5 rounded-2xl bg-amber-500/10 border border-amber-500/20 text-amber-400">
                <AlertCircle className="h-6 w-6" />
              </div>
              <h4 className="text-sm font-bold text-zinc-100">
                Nenhuma ocorrência encontrada no código
              </h4>
              <p className="text-xs text-zinc-400 leading-relaxed">
                A chave <span className="font-mono text-zinc-200">{flagId}</span> não foi
                encontrada nos{" "}
                <strong className="text-zinc-200">{enabledRepos.length}</strong>{" "}
                {enabledRepos.length === 1 ? "repositório ativo" : "repositórios ativos"}.
              </p>
              {effectiveResult.scannedAt ? (
                <p className="text-[11px] text-zinc-500">
                  Última verificação: {formatRelativeDate(effectiveResult.scannedAt)}
                </p>
              ) : null}
            </div>
          ) : filteredRepos.length === 0 ? (
            <div className="py-10 text-center text-xs text-zinc-500">
              Nenhuma ocorrência corresponde ao filtro{" "}
              <span className="font-mono text-zinc-300">"{fileSearch}"</span>.
            </div>
          ) : (
            filteredRepos.map((repo) => {
              const uniqueFiles = new Set(repo.matches.map((m) => m.file)).size;
              return (
                <div
                  key={repo.repoId}
                  className="bg-zinc-950/80 border border-zinc-800 rounded-xl overflow-hidden"
                >
                  {/* Repo Header */}
                  <div className="px-4 py-3 bg-zinc-900/70 border-b border-zinc-800/80 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <div className="flex items-center gap-2 flex-wrap min-w-0">
                      <FolderGit2 className="h-4 w-4 text-emerald-400 shrink-0" />
                      <span className="font-mono font-bold text-xs text-zinc-100 truncate">
                        {repo.repository}
                      </span>
                      <span className="px-1.5 py-0.5 rounded bg-zinc-800 border border-zinc-700 text-[9px] font-bold uppercase tracking-wider text-zinc-300">
                        {repo.provider}
                      </span>
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-zinc-900 border border-zinc-800 text-[10px] font-mono text-zinc-300">
                        <GitBranch className="h-2.5 w-2.5 text-zinc-400" />
                        {repo.branch}
                      </span>
                    </div>

                    <div className="text-[11px] text-zinc-500 shrink-0">
                      {uniqueFiles} {uniqueFiles === 1 ? "arquivo" : "arquivos"} ·{" "}
                      {repo.matches.length} {repo.matches.length === 1 ? "linha" : "linhas"}
                    </div>
                  </div>

                  {/* Match Rows */}
                  <div className="divide-y divide-zinc-800/60">
                    {repo.matches.map((match, idx) => {
                      const fileUrl = buildFileLineUrl(repo, match.file, match.line);
                      const pathWithLine = `${match.file}:${match.line}`;
                      return (
                        <div
                          key={`${match.file}:${match.line}:${idx}`}
                          className="p-3.5 hover:bg-zinc-900/40 transition-colors space-y-2"
                        >
                          <div className="flex items-center justify-between gap-2">
                            <div className="flex items-center gap-2 min-w-0">
                              <FileCode2 className="h-3.5 w-3.5 text-zinc-500 shrink-0" />
                              <span className="font-mono text-xs text-zinc-200 truncate">
                                {match.file}
                              </span>
                              <span className="px-1.5 py-0.5 rounded bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 font-mono text-[10px] font-bold shrink-0">
                                L{match.line}
                              </span>
                            </div>

                            <div className="flex items-center gap-1 shrink-0">
                              <button
                                type="button"
                                onClick={() => handleCopyPath(pathWithLine)}
                                title="Copiar caminho:linha"
                                className="p-1.5 rounded-lg text-zinc-500 hover:text-zinc-200 hover:bg-zinc-800 transition-colors cursor-pointer"
                              >
                                {copiedPath === pathWithLine ? (
                                  <Check className="h-3.5 w-3.5 text-emerald-400" />
                                ) : (
                                  <Copy className="h-3.5 w-3.5" />
                                )}
                              </button>
                              {fileUrl && (
                                <a
                                  href={fileUrl}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  title="Abrir arquivo na linha exata no repositório"
                                  className="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] font-semibold text-zinc-400 hover:text-emerald-400 hover:bg-emerald-500/10 transition-colors"
                                >
                                  <span>Abrir</span>
                                  <ExternalLink className="h-3 w-3" />
                                </a>
                              )}
                            </div>
                          </div>

                          {match.snippet ? (
                            <pre className="text-[11px] font-mono text-zinc-300 bg-zinc-900/90 border border-zinc-800/80 rounded-lg px-3 py-2 overflow-x-auto leading-relaxed">
                              <code>{renderHighlightedSnippet(match.snippet, flagId)}</code>
                            </pre>
                          ) : (
                            <p className="text-[11px] text-zinc-500 italic flex items-center gap-1.5">
                              <ShieldCheck className="h-3 w-3 text-emerald-500/70" />
                              Trecho de código omitido pelo modo de privacidade do repositório.
                            </p>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-3.5 border-t border-zinc-800/80 bg-zinc-900/40 flex items-center justify-between gap-4 shrink-0">
          <p className="text-[11px] text-zinc-500 flex items-center gap-1.5">
            <ShieldCheck className="h-3.5 w-3.5 text-emerald-500 shrink-0" />
            Tokens protegidos com AES-256-GCM no cliente (senha mantida apenas em RAM).
          </p>
          <button
            type="button"
            onClick={onClose}
            className="py-2 px-4 rounded-xl text-xs font-semibold text-zinc-300 hover:text-zinc-100 border border-zinc-800 hover:bg-zinc-800/60 transition-colors cursor-pointer shrink-0"
          >
            Fechar
          </button>
        </div>
      </div>
    </div>
  );
}
