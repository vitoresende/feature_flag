import React, { useEffect, useState } from "react";
import {
  X,
  FolderGit2,
  GitBranch,
  Trash2,
  ShieldCheck,
  Plus,
  ExternalLink,
  Lock,
  Unlock,
  Eye,
  EyeOff,
  ToggleLeft,
  ToggleRight,
  AlertTriangle,
  CheckCircle,
  KeyRound,
  Cpu,
} from "lucide-react";
import {
  ConnectedRepository,
  GitProvider,
  TokenStorageMode,
  formatRelativeDate,
} from "../types/codeReferences";
import { MIN_VAULT_PASSPHRASE_LENGTH } from "../utils/vaultCrypto";

export interface ConnectRepoFormData {
  provider: GitProvider;
  repository: string;
  branch?: string;
  token: string;
  baseUrl?: string;
  includeSnippets: boolean;
  storageMode: TokenStorageMode;
  vaultPassphrase?: string;
}

interface RepositoriesModalProps {
  isOpen: boolean;
  initialTab?: "connected" | "connect";
  repos: ConnectedRepository[];
  unlockedTokens: Record<string, string>;
  isVaultUnlocked: boolean;
  onUnlockVault: (passphrase: string) => Promise<void>;
  onLockVault: () => void;
  onConnectRepo: (data: ConnectRepoFormData) => Promise<ConnectedRepository>;
  onToggleRepo: (repo: ConnectedRepository) => Promise<void>;
  onDisconnectRepo: (repo: ConnectedRepository) => void;
  onClose: () => void;
}

const PROVIDER_HINTS: Record<
  GitProvider,
  { label: string; repoPlaceholder: string; tokenHint: string; baseUrlPlaceholder: string }
> = {
  github: {
    label: "GitHub",
    repoPlaceholder: "organizacao/meu-repositorio",
    tokenHint:
      "Use um Fine-grained Personal Access Token com permissão apenas Contents: Read-only.",
    baseUrlPlaceholder: "https://api.github.com (padrão)",
  },
  gitlab: {
    label: "GitLab",
    repoPlaceholder: "grupo/meu-projeto",
    tokenHint:
      "Use um Project Access Token (ou PAT) com escopos apenas read_repository e read_api.",
    baseUrlPlaceholder: "https://gitlab.com (padrão)",
  },
};

export default function RepositoriesModal({
  isOpen,
  initialTab = "connected",
  repos,
  unlockedTokens,
  isVaultUnlocked,
  onUnlockVault,
  onLockVault,
  onConnectRepo,
  onToggleRepo,
  onDisconnectRepo,
  onClose,
}: RepositoriesModalProps) {
  const [activeTab, setActiveTab] = useState<"connected" | "connect">(initialTab);

  // Vault unlock inline state
  const [unlockInput, setUnlockInput] = useState("");
  const [unlockLoading, setUnlockLoading] = useState(false);

  // Connect form state
  const [provider, setProvider] = useState<GitProvider>("github");
  const [repository, setRepository] = useState("");
  const [branch, setBranch] = useState("");
  const [token, setToken] = useState("");
  const [showToken, setShowToken] = useState(false);
  const [storageMode, setStorageMode] = useState<TokenStorageMode>("vault");
  const [newVaultPassphrase, setNewVaultPassphrase] = useState("");
  const [showPassphrase, setShowPassphrase] = useState(false);
  const [baseUrl, setBaseUrl] = useState("");
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [includeSnippets, setIncludeSnippets] = useState(true);

  const [submitting, setSubmitting] = useState(false);
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      setActiveTab(initialTab);
      setFormError(null);
      setSuccessMsg(null);
      setUnlockInput("");
    }
  }, [isOpen, initialTab]);

  if (!isOpen) return null;

  const hasVaultRepos = repos.some((r) => r.storageMode === "vault" && r.encryptedToken);
  const currentHint = PROVIDER_HINTS[provider];

  const handleUnlockSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!unlockInput) return;
    setFormError(null);
    setUnlockLoading(true);
    try {
      await onUnlockVault(unlockInput);
      setUnlockInput("");
      setSuccessMsg("Cofre destravado para esta sessão (chave mantida apenas em memória).");
    } catch (err: unknown) {
      setFormError(err instanceof Error ? err.message : "Senha do cofre incorreta.");
    } finally {
      setUnlockLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    setSuccessMsg(null);

    if (!repository.trim()) {
      setFormError("Informe o nome ou URL do repositório.");
      return;
    }
    if (!token.trim()) {
      setFormError("Informe um token de acesso somente leitura.");
      return;
    }

    if (storageMode === "vault" && !isVaultUnlocked) {
      if (newVaultPassphrase.length < MIN_VAULT_PASSPHRASE_LENGTH) {
        setFormError(
          `A senha do cofre deve ter no mínimo ${MIN_VAULT_PASSPHRASE_LENGTH} caracteres.`
        );
        return;
      }
    }

    setSubmitting(true);
    try {
      const saved = await onConnectRepo({
        provider,
        repository: repository.trim(),
        branch: branch.trim() || undefined,
        token: token.trim(),
        baseUrl: baseUrl.trim() || undefined,
        includeSnippets,
        storageMode,
        vaultPassphrase:
          storageMode === "vault" && !isVaultUnlocked ? newVaultPassphrase : undefined,
      });

      setRepository("");
      setBranch("");
      setToken("");
      setNewVaultPassphrase("");
      setBaseUrl("");
      setShowToken(false);
      setShowPassphrase(false);
      setShowAdvanced(false);
      setSuccessMsg(
        storageMode === "vault"
          ? `Repositório "${saved.repository}" (${saved.branch}) criptografado e salvo no cofre.`
          : `Repositório "${saved.repository}" (${saved.branch}) conectado apenas nesta sessão.`
      );
      setActiveTab("connected");
    } catch (err: unknown) {
      setFormError(
        err instanceof Error ? err.message : "Erro ao validar e conectar o repositório."
      );
    } finally {
      setSubmitting(false);
    }
  };

  const handleToggle = async (repo: ConnectedRepository) => {
    setTogglingId(repo.id);
    setFormError(null);
    try {
      await onToggleRepo(repo);
    } catch (err: unknown) {
      setFormError(
        err instanceof Error ? err.message : "Erro ao atualizar status do repositório."
      );
    } finally {
      setTogglingId(null);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4 py-6">
      {/* Overlay */}
      <div
        className="absolute inset-0 bg-black/70 backdrop-blur-sm"
        onClick={() => !submitting && onClose()}
      />

      {/* Dialog */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl w-full max-w-2xl shadow-2xl relative z-10 flex flex-col max-h-[88vh] overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="p-6 pb-4 border-b border-zinc-800/80 flex items-center justify-between gap-4 shrink-0">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400">
              <FolderGit2 className="h-5 w-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-zinc-100">
                Repositórios Conectados
              </h3>
              <p className="text-xs text-zinc-400">
                Conexão direta pela aplicação com cofre criptografado ponta-a-ponta (zero backend).
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="p-1.5 rounded-lg text-zinc-500 hover:text-zinc-200 hover:bg-zinc-800 transition-colors cursor-pointer"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Tabs */}
        <div className="px-6 pt-3 border-b border-zinc-800/80 flex items-center justify-between gap-2 bg-zinc-950/40 shrink-0">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setActiveTab("connected")}
              className={`px-4 py-2.5 text-xs font-bold border-b-2 transition-all cursor-pointer flex items-center gap-2 ${
                activeTab === "connected"
                  ? "border-emerald-500 text-emerald-400"
                  : "border-transparent text-zinc-400 hover:text-zinc-200"
              }`}
            >
              <FolderGit2 className="h-3.5 w-3.5" />
              <span>Conectados</span>
              <span className="px-1.5 py-0.5 rounded-full text-[10px] font-mono bg-zinc-800 text-zinc-300">
                {repos.length}
              </span>
            </button>

            <button
              type="button"
              onClick={() => {
                setFormError(null);
                setActiveTab("connect");
              }}
              className={`px-4 py-2.5 text-xs font-bold border-b-2 transition-all cursor-pointer flex items-center gap-2 ${
                activeTab === "connect"
                  ? "border-emerald-500 text-emerald-400"
                  : "border-transparent text-zinc-400 hover:text-zinc-200"
              }`}
            >
              <Plus className="h-3.5 w-3.5" />
              <span>Conectar Repositório</span>
            </button>
          </div>

          {hasVaultRepos && isVaultUnlocked && (
            <button
              type="button"
              onClick={onLockVault}
              title="Limpar senha do cofre e tokens da memória imediatamente"
              className="mb-1 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-semibold bg-emerald-500/10 hover:bg-amber-500/15 border border-emerald-500/25 hover:border-amber-500/35 text-emerald-300 hover:text-amber-300 transition-colors cursor-pointer"
            >
              <Unlock className="h-3 w-3" />
              <span>Travar Cofre</span>
            </button>
          )}
        </div>

        {/* Body */}
        <div className="p-6 overflow-y-auto flex-1 space-y-5">
          {successMsg && activeTab === "connected" && (
            <div className="p-3.5 rounded-xl bg-emerald-500/10 border border-emerald-500/25 text-emerald-300 text-xs flex items-center gap-2">
              <CheckCircle className="h-4 w-4 shrink-0" />
              <span>{successMsg}</span>
            </div>
          )}

          {formError && (
            <div className="p-3.5 rounded-xl bg-red-950/30 border border-red-900/50 text-red-200 text-xs flex items-start gap-2">
              <AlertTriangle className="h-4 w-4 text-red-400 shrink-0 mt-0.5" />
              <span>{formError}</span>
            </div>
          )}

          {activeTab === "connected" ? (
            <>
              {/* Inline Unlock Bar when encrypted vault repos exist and vault is locked */}
              {hasVaultRepos && !isVaultUnlocked && (
                <form
                  onSubmit={handleUnlockSubmit}
                  className="p-4 rounded-xl bg-amber-500/5 border border-amber-500/25 flex flex-col sm:flex-row sm:items-center gap-3"
                >
                  <div className="flex items-center gap-2.5 flex-1 min-w-0">
                    <Lock className="h-4 w-4 text-amber-400 shrink-0" />
                    <div className="text-xs">
                      <p className="font-bold text-amber-300">Cofre travado</p>
                      <p className="text-zinc-400">
                        Digite sua senha do cofre para descriptografar os tokens nesta sessão.
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <input
                      type="password"
                      value={unlockInput}
                      onChange={(e) => setUnlockInput(e.target.value)}
                      placeholder="Senha do cofre..."
                      disabled={unlockLoading}
                      className="w-44 px-3 py-1.5 text-xs bg-zinc-950 border border-zinc-700 rounded-lg focus:border-emerald-500 outline-none text-zinc-100"
                    />
                    <button
                      type="submit"
                      disabled={unlockLoading || !unlockInput}
                      className="px-3 py-1.5 rounded-lg text-xs font-bold bg-amber-500 hover:bg-amber-400 text-zinc-950 transition-colors cursor-pointer disabled:opacity-50"
                    >
                      {unlockLoading ? "..." : "Destravar"}
                    </button>
                  </div>
                </form>
              )}

              {repos.length === 0 ? (
                <div className="py-10 text-center flex flex-col items-center justify-center gap-3 max-w-md mx-auto">
                  <div className="p-3.5 rounded-2xl bg-zinc-800/60 border border-zinc-700/60 text-zinc-400">
                    <FolderGit2 className="h-6 w-6" />
                  </div>
                  <h4 className="text-sm font-bold text-zinc-200">
                    Nenhum repositório conectado ainda
                  </h4>
                  <p className="text-xs text-zinc-400 leading-relaxed">
                    Conecte seus repositórios do GitHub ou GitLab diretamente por aqui. Ao clicar
                    em qualquer Feature Flag, o painel mostrará os arquivos e linhas onde ela é usada.
                  </p>
                  <button
                    type="button"
                    onClick={() => setActiveTab("connect")}
                    className="mt-2 py-2.5 px-4 rounded-xl text-xs font-bold bg-emerald-500 hover:bg-emerald-600 text-zinc-950 transition-all cursor-pointer flex items-center gap-2 shadow-lg shadow-emerald-500/10"
                  >
                    <Plus className="h-4 w-4 stroke-[3]" />
                    Conectar Primeiro Repositório
                  </button>
                </div>
              ) : (
                <div className="space-y-3">
                  {repos.map((repo) => {
                    const hasActiveToken = Boolean(unlockedTokens[repo.id]);
                    return (
                      <div
                        key={repo.id}
                        className={`p-4 rounded-xl border transition-colors flex flex-col sm:flex-row sm:items-center justify-between gap-4 ${
                          repo.enabled
                            ? "bg-zinc-950/80 border-zinc-800 hover:border-zinc-700"
                            : "bg-zinc-950/30 border-zinc-800/50 opacity-65"
                        }`}
                      >
                        <div className="space-y-1.5 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-mono font-bold text-sm text-zinc-100 truncate">
                              {repo.repository}
                            </span>
                            <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-zinc-800 border border-zinc-700 text-zinc-300">
                              {repo.provider}
                            </span>
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-emerald-500/10 border border-emerald-500/20 text-[10px] font-mono text-emerald-300">
                              <GitBranch className="h-2.5 w-2.5" />
                              {repo.branch}
                            </span>
                            {repo.storageMode === "vault" ? (
                              <span
                                className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold border ${
                                  hasActiveToken
                                    ? "bg-emerald-500/10 border-emerald-500/25 text-emerald-300"
                                    : "bg-amber-500/10 border-amber-500/25 text-amber-300"
                                }`}
                              >
                                {hasActiveToken ? (
                                  <Unlock className="h-2.5 w-2.5" />
                                ) : (
                                  <Lock className="h-2.5 w-2.5" />
                                )}
                                Cofre AES-256
                              </span>
                            ) : (
                              <span
                                className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold border ${
                                  hasActiveToken
                                    ? "bg-blue-500/10 border-blue-500/25 text-blue-300"
                                    : "bg-zinc-800 border-zinc-700 text-zinc-400"
                                }`}
                              >
                                <Cpu className="h-2.5 w-2.5" />
                                {hasActiveToken ? "Sessão ativa" : "Sessão expirada"}
                              </span>
                            )}
                            {!repo.includeSnippets && (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-purple-500/10 border border-purple-500/20 text-[10px] font-semibold text-purple-300">
                                Sem trechos
                              </span>
                            )}
                          </div>

                          <div className="flex items-center gap-3 flex-wrap text-[11px] text-zinc-500">
                            <span className="inline-flex items-center gap-1 font-mono text-zinc-400">
                              <KeyRound className="h-3 w-3 text-emerald-500/70" />
                              {repo.tokenHint || "••••••••"}
                            </span>
                            {repo.connectedAt ? (
                              <span>Conectado {formatRelativeDate(repo.connectedAt)}</span>
                            ) : null}
                            {!repo.enabled && (
                              <span className="text-amber-400 font-semibold">Pausado nas buscas</span>
                            )}
                          </div>
                        </div>

                        <div className="flex items-center gap-1.5 shrink-0">
                          <button
                            type="button"
                            onClick={() => void handleToggle(repo)}
                            disabled={togglingId === repo.id}
                            title={
                              repo.enabled
                                ? "Pausar buscas neste repositório"
                                : "Reativar buscas neste repositório"
                            }
                            className="p-1.5 rounded-lg text-zinc-400 hover:bg-zinc-800 transition-colors cursor-pointer disabled:opacity-40"
                          >
                            {repo.enabled ? (
                              <ToggleRight className="h-7 w-7 text-emerald-500" />
                            ) : (
                              <ToggleLeft className="h-7 w-7 text-zinc-600" />
                            )}
                          </button>

                          {repo.repoUrl && (
                            <a
                              href={repo.repoUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="p-2 rounded-lg text-zinc-400 hover:text-emerald-400 hover:bg-emerald-500/10 transition-colors"
                              title="Abrir repositório"
                            >
                              <ExternalLink className="h-4 w-4" />
                            </a>
                          )}

                          <button
                            type="button"
                            onClick={() => onDisconnectRepo(repo)}
                            className="p-2 rounded-lg text-zinc-500 hover:text-red-400 hover:bg-red-500/10 transition-colors cursor-pointer"
                            title="Desconectar repositório"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </>
          ) : (
            <form id="connect-repo-form" onSubmit={handleSubmit} className="space-y-5">
              {/* Security Note */}
              <div className="p-3.5 rounded-xl bg-emerald-500/5 border border-emerald-500/20 flex items-start gap-3">
                <ShieldCheck className="h-5 w-5 text-emerald-400 shrink-0 mt-0.5" />
                <div className="space-y-1 text-xs">
                  <p className="font-bold text-emerald-300">
                    Criptografia Ponta-a-Ponta no Navegador (PBKDF2 600k + AES-256-GCM)
                  </p>
                  <p className="text-zinc-400 leading-relaxed">
                    No modo <strong>Cofre Criptografado</strong>, o token é cifrado antes de ir para
                    o Firestore e sua senha nunca sai da memória RAM. No modo{" "}
                    <strong>Somente nesta sessão</strong>, nenhum token é salvo no banco.
                  </p>
                </div>
              </div>

              {/* Provider Selector */}
              <div className="space-y-2">
                <label className="block text-xs font-bold uppercase tracking-wider text-zinc-400">
                  Provedor Git
                </label>
                <div className="grid grid-cols-2 gap-3">
                  {(["github", "gitlab"] as const).map((item) => (
                    <button
                      key={item}
                      type="button"
                      onClick={() => setProvider(item)}
                      disabled={submitting}
                      className={`py-2.5 px-3 rounded-xl text-xs font-bold border transition-all cursor-pointer ${
                        provider === item
                          ? "bg-emerald-500/10 border-emerald-500 text-emerald-300"
                          : "bg-zinc-950 border-zinc-800 text-zinc-400 hover:border-zinc-700 hover:text-zinc-200"
                      }`}
                    >
                      {PROVIDER_HINTS[item].label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Repository & Branch */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="sm:col-span-2 space-y-2">
                  <label className="block text-xs font-bold uppercase tracking-wider text-zinc-400">
                    Repositório (ou URL)
                  </label>
                  <input
                    type="text"
                    value={repository}
                    onChange={(e) => setRepository(e.target.value)}
                    placeholder={currentHint.repoPlaceholder}
                    disabled={submitting}
                    required
                    className="w-full px-3.5 py-2.5 text-sm bg-zinc-950 border border-zinc-800 rounded-xl focus:border-emerald-500 outline-none font-mono text-zinc-100"
                  />
                </div>

                <div className="space-y-2">
                  <label className="block text-xs font-bold uppercase tracking-wider text-zinc-400">
                    Branch (Opcional)
                  </label>
                  <input
                    type="text"
                    value={branch}
                    onChange={(e) => setBranch(e.target.value)}
                    placeholder="padrão do repo"
                    disabled={submitting}
                    className="w-full px-3.5 py-2.5 text-sm bg-zinc-950 border border-zinc-800 rounded-xl focus:border-emerald-500 outline-none font-mono text-zinc-100"
                  />
                </div>
              </div>

              {/* Access Token */}
              <div className="space-y-2">
                <label className="block text-xs font-bold uppercase tracking-wider text-zinc-400">
                  Token de Acesso (Somente Leitura)
                </label>
                <div className="relative">
                  <input
                    type={showToken ? "text" : "password"}
                    value={token}
                    onChange={(e) => setToken(e.target.value)}
                    placeholder="Cole o token read-only aqui..."
                    autoComplete="off"
                    disabled={submitting}
                    required
                    className="w-full pl-3.5 pr-10 py-2.5 text-sm bg-zinc-950 border border-zinc-800 rounded-xl focus:border-emerald-500 outline-none font-mono text-zinc-100"
                  />
                  <button
                    type="button"
                    onClick={() => setShowToken((prev) => !prev)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-300 cursor-pointer"
                    title={showToken ? "Ocultar token" : "Mostrar token"}
                  >
                    {showToken ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
                <p className="text-[11px] text-zinc-500">{currentHint.tokenHint}</p>
              </div>

              {/* Token Storage Mode */}
              <div className="space-y-2.5">
                <label className="block text-xs font-bold uppercase tracking-wider text-zinc-400">
                  Como guardar o token?
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => setStorageMode("vault")}
                    disabled={submitting}
                    className={`p-3 rounded-xl text-left border transition-all cursor-pointer space-y-1 ${
                      storageMode === "vault"
                        ? "bg-emerald-500/10 border-emerald-500 text-zinc-100"
                        : "bg-zinc-950 border-zinc-800 text-zinc-400 hover:border-zinc-700"
                    }`}
                  >
                    <p className="text-xs font-bold flex items-center gap-1.5">
                      <Lock className="h-3.5 w-3.5 text-emerald-400" />
                      Cofre Criptografado (Recomendado)
                    </p>
                    <p className="text-[11px] text-zinc-500 leading-snug">
                      Salva cifrado (AES-256-GCM) no Firestore. Destrave com sua senha quando precisar.
                    </p>
                  </button>

                  <button
                    type="button"
                    onClick={() => setStorageMode("session")}
                    disabled={submitting}
                    className={`p-3 rounded-xl text-left border transition-all cursor-pointer space-y-1 ${
                      storageMode === "session"
                        ? "bg-blue-500/10 border-blue-500 text-zinc-100"
                        : "bg-zinc-950 border-zinc-800 text-zinc-400 hover:border-zinc-700"
                    }`}
                  >
                    <p className="text-xs font-bold flex items-center gap-1.5">
                      <Cpu className="h-3.5 w-3.5 text-blue-400" />
                      Somente nesta sessão (RAM)
                    </p>
                    <p className="text-[11px] text-zinc-500 leading-snug">
                      Não salva o token no banco. Ao fechar a aba ele é descartado automaticamente.
                    </p>
                  </button>
                </div>

                {/* Vault Passphrase Input when needed */}
                {storageMode === "vault" && (
                  <div className="pt-1">
                    {isVaultUnlocked ? (
                      <div className="p-3 rounded-xl bg-emerald-500/5 border border-emerald-500/20 text-xs text-emerald-300 flex items-center gap-2">
                        <Unlock className="h-4 w-4 shrink-0" />
                        <span>
                          Cofre destravado: este repositório será criptografado com a mesma senha da sessão atual.
                        </span>
                      </div>
                    ) : (
                      <div className="space-y-1.5">
                        <label className="block text-[11px] font-bold uppercase tracking-wider text-zinc-400">
                          {hasVaultRepos
                            ? "Senha do seu Cofre"
                            : `Crie uma Senha para o Cofre (mín. ${MIN_VAULT_PASSPHRASE_LENGTH} caracteres)`}
                        </label>
                        <div className="relative">
                          <input
                            type={showPassphrase ? "text" : "password"}
                            value={newVaultPassphrase}
                            onChange={(e) => setNewVaultPassphrase(e.target.value)}
                            placeholder={
                              hasVaultRepos
                                ? "Use a mesma senha dos outros repositórios..."
                                : "Escolha uma frase-senha forte..."
                            }
                            autoComplete="new-password"
                            disabled={submitting}
                            required
                            minLength={MIN_VAULT_PASSPHRASE_LENGTH}
                            className="w-full pl-3.5 pr-10 py-2.5 text-sm bg-zinc-950 border border-zinc-800 rounded-xl focus:border-emerald-500 outline-none text-zinc-100"
                          />
                          <button
                            type="button"
                            onClick={() => setShowPassphrase((prev) => !prev)}
                            className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-300 cursor-pointer"
                          >
                            {showPassphrase ? (
                              <EyeOff className="h-4 w-4" />
                            ) : (
                              <Eye className="h-4 w-4" />
                            )}
                          </button>
                        </div>
                        <p className="text-[11px] text-zinc-500">
                          Guarde essa senha em um gerenciador de senhas: ela nunca é enviada ao Firestore.
                        </p>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Privacy Checkbox */}
              <label className="flex items-start gap-2.5 p-3 rounded-xl bg-zinc-950 border border-zinc-800 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={!includeSnippets}
                  onChange={(e) => setIncludeSnippets(!e.target.checked)}
                  disabled={submitting}
                  className="mt-0.5 rounded border-zinc-700 bg-zinc-900 accent-emerald-500 h-4 w-4 cursor-pointer"
                />
                <div className="space-y-0.5 text-xs">
                  <p className="font-semibold text-zinc-200">
                    Modo privacidade: omitir trechos de código
                  </p>
                  <p className="text-[11px] text-zinc-500">
                    Salva no cache apenas o caminho do arquivo e o número da linha.
                  </p>
                </div>
              </label>

              {/* Optional Custom Host */}
              <div className="space-y-2">
                <button
                  type="button"
                  onClick={() => setShowAdvanced((prev) => !prev)}
                  className="text-[11px] font-semibold text-zinc-400 hover:text-emerald-400 transition-colors cursor-pointer"
                >
                  {showAdvanced
                    ? "− Ocultar opções avançadas"
                    : "+ Opções avançadas (URL customizada HTTPS com CORS habilitado)"}
                </button>
                {showAdvanced && (
                  <input
                    type="url"
                    value={baseUrl}
                    onChange={(e) => setBaseUrl(e.target.value)}
                    placeholder={currentHint.baseUrlPlaceholder}
                    disabled={submitting}
                    className="w-full px-3.5 py-2.5 text-sm bg-zinc-950 border border-zinc-800 rounded-xl focus:border-emerald-500 outline-none font-mono text-zinc-100"
                  />
                )}
              </div>
            </form>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-3.5 border-t border-zinc-800/80 bg-zinc-900/40 flex items-center justify-between gap-4 shrink-0">
          <span className="text-[11px] text-zinc-500 flex items-center gap-1.5">
            <Lock className="h-3.5 w-3.5 text-emerald-500" />
            Zero backend · Criptografia local Web Crypto API
          </span>

          <div className="flex items-center gap-2.5">
            <button
              type="button"
              onClick={onClose}
              disabled={submitting}
              className="py-2 px-4 rounded-xl text-xs font-semibold text-zinc-300 hover:text-zinc-100 border border-zinc-800 hover:bg-zinc-800/60 transition-colors cursor-pointer"
            >
              Fechar
            </button>
            {activeTab === "connect" && (
              <button
                type="submit"
                form="connect-repo-form"
                disabled={submitting}
                className="py-2 px-5 rounded-xl text-xs font-bold bg-emerald-500 hover:bg-emerald-600 text-zinc-950 transition-all cursor-pointer flex items-center gap-2 shadow-lg shadow-emerald-500/10 disabled:opacity-50"
              >
                {submitting ? (
                  <>
                    <div className="h-3.5 w-3.5 border-2 border-zinc-950 border-t-transparent rounded-full animate-spin" />
                    <span>Validando e Criptografando...</span>
                  </>
                ) : (
                  <>
                    <ShieldCheck className="h-4 w-4" />
                    <span>Validar e Conectar</span>
                  </>
                )}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
