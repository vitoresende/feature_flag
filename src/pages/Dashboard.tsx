import React, { useState, useEffect } from "react";
import { useAuth } from "../contexts/AuthContext";
import { ENVIRONMENTS } from "../firebase";
import ConfirmationModal from "../components/ConfirmationModal";
import { 
  collection, 
  onSnapshot, 
  doc, 
  updateDoc, 
  setDoc, 
  deleteDoc, 
  serverTimestamp 
} from "firebase/firestore";
import { 
  LogOut, 
  Layers, 
  Plus, 
  Search, 
  Copy, 
  Check, 
  Trash2, 
  ToggleLeft, 
  ToggleRight, 
  RefreshCw,
  Info,
  GitBranch,
  AlertTriangle
} from "lucide-react";

interface FeatureFlag {
  id: string;
  enabled: boolean;
  description: string;
  category?: string;
  tags?: string[];
  updatedAt: any;
}

export default function Dashboard() {
  const { user, logout } = useAuth();
  
  // rawFlagsByEnv holds a dictionary of flags for each environment id
  const [rawFlagsByEnv, setRawFlagsByEnv] = useState<Record<string, Record<string, FeatureFlag>>>({});
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  
  // Copy to clipboard success state
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // Modal States for adding a new flag
  const [showModal, setShowModal] = useState(false);
  const [newKey, setNewKey] = useState("");
  const [newDescription, setNewDescription] = useState("");
  const [newTags, setNewTags] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState("");
  const [newEnabledMap, setNewEnabledMap] = useState<Record<string, boolean>>({
    dev: false,
    prod: false
  });
  const [modalLoading, setModalLoading] = useState(false);
  const [modalError, setModalError] = useState<string | null>(null);

  // Unified Confirmation/Alert Modal State
  const [confirmModal, setConfirmModal] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    confirmText?: string;
    cancelText?: string;
    type: "danger" | "info" | "success" | "warning";
    isAlertOnly?: boolean;
    onConfirm: () => void;
  }>({
    isOpen: false,
    title: "",
    message: "",
    type: "info",
    onConfirm: () => {}
  });

  // Listen to all environments in real-time
  useEffect(() => {
    setLoading(true);
    
    // Set up snapshot listeners for all configured environments
    const unsubscribes = ENVIRONMENTS.map((env) => {
      const colRef = collection(env.db, env.collectionName);
      
      return onSnapshot(colRef, (snapshot) => {
        const envFlags: Record<string, FeatureFlag> = {};
        snapshot.forEach((doc) => {
          envFlags[doc.id] = { id: doc.id, ...doc.data() } as FeatureFlag;
        });
        
        setRawFlagsByEnv(prev => ({
          ...prev,
          [env.id]: envFlags
        }));
      }, (error) => {
        console.error(`Erro ao assinar flags do ambiente ${env.id}:`, error);
      });
    });

    // Set loading false after initial snapshots (usually take less than a second)
    const timeout = setTimeout(() => setLoading(false), 1000);

    return () => {
      unsubscribes.forEach(unsub => unsub());
      clearTimeout(timeout);
    };
  }, []);

  // Alert/Confirm Helpers
  const showAlert = (title: string, message: string, type: "danger" | "info" | "success" | "warning" = "info") => {
    setConfirmModal({
      isOpen: true,
      title,
      message,
      confirmText: "OK",
      isAlertOnly: true,
      type,
      onConfirm: () => setConfirmModal(prev => ({ ...prev, isOpen: false }))
    });
  };

  const closeConfirmModal = () => {
    setConfirmModal(prev => ({ ...prev, isOpen: false }));
  };

  // Copy Key Helper
  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(text);
    setTimeout(() => setCopiedId(null), 2000);
  };

  // Toggle Flag Status for a specific environment
  const handleToggle = async (
    flagId: string, 
    envId: string, 
    currentStatus: boolean, 
    exists: boolean, 
    fallbackDescription: string
  ) => {
    const env = ENVIRONMENTS.find(e => e.id === envId);
    if (!env) return;

    try {
      const docRef = doc(env.db, env.collectionName, flagId);
      if (exists) {
        // Update existing flag in this environment
        await updateDoc(docRef, {
          enabled: !currentStatus,
          updatedAt: serverTimestamp()
        });
      } else {
        // Initialize/Create flag in this environment (resolves environment drift)
        await setDoc(docRef, {
          enabled: !currentStatus,
          description: fallbackDescription || "Inicializado automaticamente para resolver desalinhamento.",
          updatedAt: serverTimestamp()
        });
      }
    } catch (e) {
      console.error(`Erro ao atualizar flag ${flagId} no ambiente ${envId}:`, e);
      showAlert("Erro ao Atualizar", `Erro ao atualizar a feature flag no ambiente ${env.name}. Verifique as regras de segurança do Firestore.`, "danger");
    }
  };

  const handleAddTag = (tagToAdd: string) => {
    const cleaned = tagToAdd.trim().toLowerCase();
    if (cleaned && !newTags.includes(cleaned)) {
      setNewTags([...newTags, cleaned]);
    }
    setTagInput("");
  };

  const handleRemoveTag = (tagToRemove: string) => {
    setNewTags(newTags.filter(t => t !== tagToRemove));
  };

  // Create Flag in ALL environments to keep keys synchronized
  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setModalError(null);
    const formattedKey = newKey.trim().toUpperCase().replace(/\s+/g, "_");

    if (!formattedKey) {
      setModalError("A chave da feature flag é obrigatória.");
      return;
    }

    if (!/^[A-Z0-9_]+$/.test(formattedKey)) {
      setModalError("A chave deve conter apenas letras maiúsculas, números e sublinhados (ex: HABILITAR_NOVO_BANNER).");
      return;
    }

    setModalLoading(true);
    try {
      // Create the document in all environments simultaneously
      const promises = ENVIRONMENTS.map((env) => {
        const docRef = doc(env.db, env.collectionName, formattedKey);
        const initialEnabled = newEnabledMap[env.id] || false;
        
        return setDoc(docRef, {
          enabled: initialEnabled,
          description: newDescription.trim(),
          tags: newTags,
          updatedAt: serverTimestamp()
        });
      });

      await Promise.all(promises);
      
      // Reset & Close
      setNewKey("");
      setNewDescription("");
      setNewTags([]);
      setTagInput("");
      setNewEnabledMap({ dev: false, prod: false });
      setShowModal(false);
      showAlert("Flag Criada", `A Feature Flag "${formattedKey}" foi criada em todos os ambientes.`, "success");
    } catch (e: any) {
      console.error("Erro ao criar flag em múltiplos ambientes:", e);
      setModalError("Erro ao salvar no Firestore: " + (e.message || e));
    } finally {
      setModalLoading(false);
    }
  };

  // Delete Flag from ALL environments to keep them synchronized
  const handleDelete = (id: string) => {
    setConfirmModal({
      isOpen: true,
      title: "Excluir Feature Flag",
      message: `ATENÇÃO: Tem certeza que deseja deletar a flag "${id}" de TODOS os ambientes simultaneamente? Esta ação é permanente e não poderá ser desfeita.`,
      confirmText: "Excluir Flag",
      cancelText: "Cancelar",
      type: "danger",
      onConfirm: async () => {
        closeConfirmModal();
        try {
          const promises = ENVIRONMENTS.map((env) => {
            const docRef = doc(env.db, env.collectionName, id);
            return deleteDoc(docRef);
          });
          
          await Promise.all(promises);
          showAlert("Excluída com Sucesso", `A flag "${id}" foi removida de todos os ambientes.`, "success");
        } catch (e) {
          console.error("Erro ao deletar flag dos ambientes:", e);
          showAlert("Erro ao Deletar", "Erro ao remover a feature flag de um ou mais ambientes. Verifique suas permissões do Firestore.", "danger");
        }
      }
    });
  };

  // Alignment Helper: Writes the missing flag to any environment where it does not exist
  const handleAlignFlag = (flagId: string, currentDescription: string) => {
    setConfirmModal({
      isOpen: true,
      title: "Sincronizar Ambientes",
      message: `Deseja sincronizar a chave "${flagId}" nos ambientes onde ela está atualmente ausente? Ela iniciará como Desativada (false).`,
      confirmText: "Sincronizar",
      cancelText: "Cancelar",
      type: "warning",
      onConfirm: async () => {
        closeConfirmModal();
        try {
          const promises = ENVIRONMENTS.map((env) => {
            const exists = !!rawFlagsByEnv[env.id]?.[flagId];
            if (!exists) {
              const docRef = doc(env.db, env.collectionName, flagId);
              return setDoc(docRef, {
                enabled: false,
                description: currentDescription || "Alinhado automaticamente.",
                updatedAt: serverTimestamp()
              });
            }
            return Promise.resolve();
          });

          await Promise.all(promises);
          showAlert("Alinhamento Concluído", "Os ambientes foram sincronizados com sucesso!", "success");
        } catch (e) {
          console.error("Erro ao sincronizar ambientes:", e);
          showAlert("Erro ao Sincronizar", "Erro ao sincronizar os ambientes. Verifique as regras de segurança.", "danger");
        }
      }
    });
  };

  // Get union of all flag IDs across all environments
  const allFlagIds = Array.from(new Set(
    ENVIRONMENTS.flatMap(env => Object.keys(rawFlagsByEnv[env.id] || {}))
  )).sort();

  // Helper to get tags array from any environment where the flag is present
  const getFlagTags = (flagId: string): string[] => {
    for (const env of ENVIRONMENTS) {
      const flag = rawFlagsByEnv[env.id]?.[flagId];
      if (flag?.tags && Array.isArray(flag.tags)) {
        return flag.tags;
      }
      // Backwards compatibility for category field
      if (flag?.category) {
        return [flag.category];
      }
    }
    return [];
  };

  // Filter keys by search input
  const filteredFlagIds = allFlagIds.filter(id => {
    const term = search.toLowerCase();
    const matchesId = id.toLowerCase().includes(term);
    
    // Check descriptions in any environment where the flag is present
    const matchesDesc = ENVIRONMENTS.some(env => {
      const flag = rawFlagsByEnv[env.id]?.[id];
      return flag?.description?.toLowerCase().includes(term);
    });

    const tags = getFlagTags(id);
    const matchesTags = tags.some(tag => tag.toLowerCase().includes(term));

    return matchesId || matchesDesc || matchesTags;
  });

  // Helper to get description from any environment where the flag is present
  const getFlagDescription = (flagId: string): string => {
    for (const env of ENVIRONMENTS) {
      const flag = rawFlagsByEnv[env.id]?.[flagId];
      if (flag?.description) return flag.description;
    }
    return "";
  };

  // Check if a flag is missing in at least one environment (drift detection)
  const hasDrift = (flagId: string): boolean => {
    return ENVIRONMENTS.some(env => !rawFlagsByEnv[env.id]?.[flagId]);
  };

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-50 flex flex-col font-sans">
      
      {/* Header */}
      <header className="sticky top-0 z-40 bg-zinc-900/60 border-b border-zinc-800/80 backdrop-blur-xl px-6 py-4 flex items-center justify-between">
        
        {/* Brand */}
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-400">
            <Layers className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-lg font-bold bg-gradient-to-r from-zinc-50 to-zinc-300 bg-clip-text text-transparent">
              FLAG MANAGER
            </h1>
            <p className="text-[10px] text-zinc-500 font-medium uppercase tracking-widest">
              Feature Flags • Console Unificado
            </p>
          </div>
        </div>

        {/* User Profile & Logout */}
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-3 border-zinc-800 pl-4">
            <div className="hidden sm:block text-right">
              <p className="text-xs font-semibold text-zinc-200">{user?.displayName || "Administrador"}</p>
              <p className="text-[10px] text-zinc-500">{user?.email}</p>
            </div>
            {user?.photoURL ? (
              <img 
                src={user.photoURL} 
                alt={user.displayName || "Avatar"} 
                className="h-8 w-8 rounded-full border border-zinc-700"
              />
            ) : (
              <div className="h-8 w-8 rounded-full bg-zinc-800 border border-zinc-700 flex items-center justify-center text-xs font-bold">
                {user?.email?.charAt(0).toUpperCase() || "A"}
              </div>
            )}
            <button
              onClick={logout}
              title="Sair da conta"
              className="p-2 rounded-lg text-zinc-400 hover:text-red-400 hover:bg-red-500/5 transition-colors cursor-pointer"
            >
              <LogOut className="h-4 w-4" />
            </button>
          </div>
        </div>

      </header>

      {/* Main Content Area */}
      <main className="flex-1 px-6 py-8 max-w-7xl w-full mx-auto space-y-8">
        
        {/* Welcome Section */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h2 className="text-2xl font-bold tracking-tight">
              Gerenciador Unificado de Feature Flags
            </h2>
            <p className="text-sm text-zinc-400">
              Gerencie e visualize os valores das flags em múltiplos ambientes de forma alinhada e sem divergências.
            </p>
          </div>
          <button
            onClick={() => setShowModal(true)}
            className="self-start sm:self-center py-2.5 px-4 rounded-xl text-xs font-bold tracking-wide transition-all duration-300 flex items-center gap-2 bg-emerald-500 hover:bg-emerald-600 active:scale-[0.98] text-zinc-950 cursor-pointer shadow-lg shadow-emerald-500/10"
          >
            <Plus className="h-4 w-4 stroke-[3]" /> Criar Flag Unificada
          </button>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
          
          <div className="bg-zinc-900/30 border border-zinc-800/60 rounded-2xl p-6 flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">Total de Chaves</p>
              <h3 className="text-3xl font-extrabold mt-2">{loading ? "..." : allFlagIds.length}</h3>
            </div>
            <div className="p-3 rounded-xl bg-zinc-800/50 text-zinc-400">
              <Layers className="h-5 w-5" />
            </div>
          </div>

          <div className="bg-zinc-900/30 border border-zinc-800/60 rounded-2xl p-6 flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">Ambientes Conectados</p>
              <h3 className="text-3xl font-extrabold mt-2 text-emerald-400">{ENVIRONMENTS.length}</h3>
            </div>
            <div className="p-3 rounded-xl bg-emerald-500/5 text-emerald-400">
              <GitBranch className="h-5 w-5" />
            </div>
          </div>

          <div className="bg-zinc-900/30 border border-zinc-800/60 rounded-2xl p-6 flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">Desalinhamentos (Drift)</p>
              <h3 className={`text-3xl font-extrabold mt-2 ${allFlagIds.filter(hasDrift).length > 0 ? "text-amber-500" : "text-zinc-400"}`}>
                {loading ? "..." : allFlagIds.filter(hasDrift).length}
              </h3>
            </div>
            <div className={`p-3 rounded-xl ${allFlagIds.filter(hasDrift).length > 0 ? "bg-amber-500/5 text-amber-500" : "bg-zinc-850/50 text-zinc-400"}`}>
              <AlertTriangle className="h-5 w-5" />
            </div>
          </div>

        </div>

        {/* Table & Controls Section */}
        <div className="bg-zinc-900/10 border border-zinc-800/80 rounded-2xl overflow-hidden shadow-xl">
          
          {/* Filter Bar */}
          <div className="p-4 border-b border-zinc-800/80 bg-zinc-900/20 flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="relative flex-1 max-w-md">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-500" />
              <input
                type="text"
                placeholder="Filtrar por chave ou descrição..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full pl-10 pr-4 py-2 text-sm bg-zinc-900/50 border border-zinc-800 rounded-xl focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 outline-none transition-all"
              />
            </div>
            
            <div className="text-xs text-zinc-500 flex items-center gap-1.5">
              <Info className="h-4 w-4 text-emerald-400" />
              <span>O status de cada chave pode ser controlado de forma independente para cada ambiente na tabela abaixo.</span>
            </div>
          </div>

          {/* Flags List Table */}
          {loading ? (
            <div className="py-24 text-center text-zinc-500 flex flex-col items-center justify-center gap-3">
              <RefreshCw className="h-8 w-8 animate-spin text-emerald-500" />
              <span>Sincronizando bancos de dados em tempo real...</span>
            </div>
          ) : filteredFlagIds.length === 0 ? (
            <div className="py-24 text-center text-zinc-500">
              <p className="text-lg font-medium">Nenhuma Feature Flag encontrada</p>
              <p className="text-xs text-zinc-600 mt-1">Insira uma chave ou mude o filtro para localizar.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-zinc-850 text-zinc-500 text-[10px] font-bold uppercase tracking-wider bg-zinc-900/10">
                    <th className="px-6 py-4 w-2/5">Chave / Identificador</th>
                    <th className="px-6 py-4 w-2/5">Descrição</th>
                    
                    {/* Render Columns dynamically for each environment */}
                    {ENVIRONMENTS.map((env) => (
                      <th key={env.id} className="px-6 py-4 text-center w-1/12">
                        {env.name}
                      </th>
                    ))}
                    
                    <th className="px-6 py-4 text-right w-1/12">Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-900 bg-zinc-900/5">
                  {filteredFlagIds.map((flagId) => {
                    const desc = getFlagDescription(flagId);
                    const drift = hasDrift(flagId);
                    
                    return (
                      <tr key={flagId} className="hover:bg-zinc-900/20 transition-colors group">
                        
                        {/* Flag Key */}
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-2">
                            <span className="font-mono font-bold text-sm text-zinc-100 bg-zinc-900 px-2.5 py-1 rounded border border-zinc-800 group-hover:border-zinc-700 transition-all">
                              {flagId}
                            </span>
                            <button
                              onClick={() => copyToClipboard(flagId)}
                              title="Copiar Chave"
                              className="p-1 rounded text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800 transition-all cursor-pointer"
                            >
                              {copiedId === flagId ? (
                                <Check className="h-3.5 w-3.5 text-emerald-400" />
                              ) : (
                                <Copy className="h-3.5 w-3.5" />
                              )}
                            </button>

                            {/* Tags list (Pills/Breadcrumbs style) */}
                            {(() => {
                              const tags = getFlagTags(flagId);
                              if (!tags || tags.length === 0) return null;
                              return (
                                <div className="flex flex-wrap gap-1.5 ml-2">
                                  {tags.map(tag => (
                                    <span 
                                      key={tag} 
                                      className={`px-2 py-0.5 rounded-full text-[9px] font-extrabold uppercase tracking-wider ${
                                        tag === 'backend' 
                                          ? 'bg-blue-500/10 border border-blue-500/20 text-blue-400' 
                                          : tag === 'frontend'
                                            ? 'bg-emerald-500/10 border border-emerald-500/20 text-emerald-400'
                                            : 'bg-zinc-800 border border-zinc-700 text-zinc-350'
                                      }`}
                                    >
                                      {tag}
                                    </span>
                                  ))}
                                </div>
                              );
                            })()}

                            {/* Show alignment warning if flag key is missing in some env */}
                            {drift && (
                              <span 
                                title="Desalinhamento detectado: Esta chave não existe em todos os ambientes."
                                className="flex items-center gap-1 px-1.5 py-0.5 rounded bg-amber-500/10 border border-amber-500/20 text-amber-500 text-[9px] font-bold"
                              >
                                <AlertTriangle className="h-3 w-3" />
                                Desalinhada
                              </span>
                            )}
                          </div>
                        </td>

                        {/* Description */}
                        <td className="px-6 py-4">
                          <p className="text-sm text-zinc-300 line-clamp-2" title={desc}>
                            {desc || <span className="text-zinc-600 italic">Sem descrição fornecida</span>}
                          </p>
                        </td>

                        {/* Dynamic Environment Toggle Columns */}
                        {ENVIRONMENTS.map((env) => {
                          const envFlag = rawFlagsByEnv[env.id]?.[flagId];
                          const exists = !!envFlag;
                          const enabled = exists ? envFlag.enabled : false;

                          return (
                            <td key={env.id} className="px-6 py-4 text-center">
                              <div className="flex flex-col items-center justify-center gap-1">
                                {exists ? (
                                  <button
                                    onClick={() => handleToggle(flagId, env.id, enabled, true, desc)}
                                    className="focus:outline-none transition-transform active:scale-95 cursor-pointer"
                                    title={`Desativar/Ativar no ${env.name}`}
                                  >
                                    {enabled ? (
                                      <ToggleRight className="h-9 w-9 text-emerald-500" />
                                    ) : (
                                      <ToggleLeft className="h-9 w-9 text-zinc-600" />
                                    )}
                                  </button>
                                ) : (
                                  <button
                                    onClick={() => handleToggle(flagId, env.id, false, false, desc)}
                                    className="px-2 py-1 rounded bg-amber-500/10 border border-amber-500/30 text-amber-500 text-[9px] font-bold hover:bg-amber-500 hover:text-zinc-950 transition-all cursor-pointer"
                                    title="Chave ausente neste ambiente. Clique para criá-la como Inativa (false)."
                                  >
                                    Inicializar
                                  </button>
                                )}
                              </div>
                            </td>
                          );
                        })}

                        {/* Actions (Sincronizar/Excluir) */}
                        <td className="px-6 py-4 text-right">
                          <div className="flex items-center justify-end gap-2">
                            {drift && (
                              <button
                                onClick={() => handleAlignFlag(flagId, desc)}
                                className="p-2 text-amber-500 hover:text-amber-400 hover:bg-amber-500/5 rounded-xl transition-all cursor-pointer"
                                title="Criar essa flag nos ambientes ausentes para alinhar o projeto."
                              >
                                <RefreshCw className="h-4 w-4" />
                              </button>
                            )}
                            <button
                              onClick={() => handleDelete(flagId)}
                              className="p-2 text-zinc-600 hover:text-red-400 hover:bg-red-500/5 rounded-xl transition-all cursor-pointer"
                              title="Excluir flag de TODOS os ambientes"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </div>
                        </td>

                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

        </div>

      </main>

      {/* Modal - Add Feature Flag */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
          
          {/* Overlay */}
          <div 
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={() => !modalLoading && setShowModal(false)}
          />

          {/* Dialog Body */}
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl w-full max-w-lg shadow-2xl relative z-10 flex flex-col max-h-[90vh] overflow-hidden animate-in fade-in zoom-in-95 duration-200">
            
            {/* Header */}
            <div className="flex items-center justify-between p-6 pb-4 border-b border-zinc-850 shrink-0">
              <h3 className="text-base font-bold text-zinc-100">Criar Feature Flag Unificada</h3>
              <button 
                type="button"
                onClick={() => setShowModal(false)}
                disabled={modalLoading}
                className="text-zinc-500 hover:text-zinc-300 text-sm font-semibold cursor-pointer"
              >
                Fechar
              </button>
            </div>

            {/* Form */}
            <form onSubmit={handleCreate} className="flex flex-col min-h-0">
              <div className="p-6 space-y-6 overflow-y-auto">
              
                {modalError && (
                  <div className="p-4 rounded-xl bg-red-950/30 border border-red-900/50 text-red-200 text-xs flex items-center gap-2">
                    <Info className="h-4 w-4 text-red-400 shrink-0" />
                    <span>{modalError}</span>
                  </div>
                )}

                {/* Key Input */}
                <div className="space-y-2">
                  <label className="block text-xs font-bold uppercase tracking-wider text-zinc-400">
                    Identificador / Chave (Maiúsculas e Sublinhados)
                  </label>
                  <input
                    type="text"
                    placeholder="EX: HABILITAR_COMPRA_PIX"
                    value={newKey}
                    onChange={(e) => setNewKey(e.target.value)}
                    className="w-full px-4 py-2.5 text-sm bg-zinc-955 border border-zinc-800 rounded-xl focus:border-emerald-500 outline-none uppercase font-mono tracking-wide bg-zinc-950"
                    required
                    disabled={modalLoading}
                  />
                  <p className="text-[10px] text-zinc-500">
                    A chave será criada simultaneamente em todos os ambientes cadastrados para evitar desalinhamento.
                  </p>
                </div>

                {/* Description Input */}
                <div className="space-y-2">
                  <label className="block text-xs font-bold uppercase tracking-wider text-zinc-400">
                    Descrição do Recurso
                  </label>
                  <textarea
                    placeholder="Descreva o que este recurso controla na aplicação..."
                    value={newDescription}
                    onChange={(e) => setNewDescription(e.target.value)}
                    rows={3}
                    className="w-full px-4 py-2.5 text-sm bg-zinc-955 border border-zinc-800 rounded-xl focus:border-emerald-500 outline-none resize-none bg-zinc-950"
                    disabled={modalLoading}
                  />
                </div>

                {/* Tags / Scope Selector (Breadcrumbs style) */}
                <div className="space-y-2">
                  <label className="block text-xs font-bold uppercase tracking-wider text-zinc-400 font-sans">
                    Tags / Marcadores
                  </label>
                  
                  {/* Render current tags */}
                  {newTags.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 p-2 bg-zinc-950 rounded-xl border border-zinc-850">
                      {newTags.map(tag => (
                        <span 
                          key={tag}
                          className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-extrabold uppercase tracking-wider ${
                            tag === 'backend' 
                              ? 'bg-blue-500/10 border border-blue-500/20 text-blue-400' 
                              : tag === 'frontend'
                                ? 'bg-emerald-500/10 border border-emerald-500/20 text-emerald-400'
                                : 'bg-zinc-800 border border-zinc-700 text-zinc-300'
                          }`}
                        >
                          <span>{tag}</span>
                          <button
                            type="button"
                            onClick={() => handleRemoveTag(tag)}
                            className="hover:text-red-400 transition-colors focus:outline-none text-[11px] font-bold leading-none cursor-pointer"
                          >
                            &times;
                          </button>
                        </span>
                      ))}
                    </div>
                  )}

                  {/* Input and Add Action */}
                  <div className="flex gap-2">
                    <input
                      type="text"
                      placeholder="Adicionar tag (ex: mobile, pix)..."
                      value={tagInput}
                      onChange={(e) => setTagInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          handleAddTag(tagInput);
                        }
                      }}
                      disabled={modalLoading}
                      className="flex-1 px-4 py-2.5 text-sm bg-zinc-955 border border-zinc-800 rounded-xl focus:border-emerald-500 outline-none bg-zinc-950"
                    />
                    <button
                      type="button"
                      onClick={() => handleAddTag(tagInput)}
                      disabled={modalLoading}
                      className="px-4 py-2.5 bg-zinc-800 hover:bg-zinc-750 text-xs font-bold rounded-xl text-zinc-350 hover:text-zinc-200 border border-zinc-700 transition-all cursor-pointer"
                    >
                      Adicionar
                    </button>
                  </div>

                  {/* Suggestions */}
                  <div className="flex items-center gap-2 pt-1 text-[10px] font-bold text-zinc-500 uppercase tracking-wider">
                    <span>Sugestões:</span>
                    <button
                      type="button"
                      onClick={() => handleAddTag("backend")}
                      className="hover:text-blue-400 hover:underline focus:outline-none cursor-pointer"
                    >
                      + backend
                    </button>
                    <button
                      type="button"
                      onClick={() => handleAddTag("frontend")}
                      className="hover:text-emerald-400 hover:underline focus:outline-none cursor-pointer"
                    >
                      + frontend
                    </button>
                  </div>
                </div>

                {/* Initial Values per Environment */}
                <div className="space-y-3">
                  <label className="block text-xs font-bold uppercase tracking-wider text-zinc-400">
                    Estado Inicial por Ambiente
                  </label>
                  
                  <div className="space-y-2">
                    {ENVIRONMENTS.map((env) => {
                      const isEnabled = newEnabledMap[env.id] || false;
                      return (
                        <div 
                          key={env.id} 
                          className="flex items-center justify-between p-3 bg-zinc-950 rounded-xl border border-zinc-800"
                        >
                          <div className="flex items-center gap-2">
                            <span className={`px-2 py-0.5 rounded text-[10px] font-bold border ${env.badgeClass}`}>
                              {env.name}
                            </span>
                            <span className="text-xs text-zinc-400">Ativa neste ambiente?</span>
                          </div>
                          <button
                            type="button"
                            onClick={() => setNewEnabledMap(prev => ({
                              ...prev,
                              [env.id]: !isEnabled
                            }))}
                            disabled={modalLoading}
                            className="focus:outline-none transition-transform active:scale-95 cursor-pointer"
                          >
                            {isEnabled ? (
                              <ToggleRight className="h-8 w-8 text-emerald-500" />
                            ) : (
                              <ToggleLeft className="h-8 w-8 text-zinc-650" />
                            )}
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>

              {/* Actions Footer */}
              <div className="flex justify-end gap-3 p-6 pt-4 border-t border-zinc-850 shrink-0">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  disabled={modalLoading}
                  className="py-2.5 px-4 rounded-xl text-xs font-semibold text-zinc-400 hover:text-zinc-200 border border-zinc-800 hover:bg-zinc-800/20 cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={modalLoading}
                  className="py-2.5 px-5 rounded-xl text-xs font-bold tracking-wide transition-all duration-300 bg-emerald-500 hover:bg-emerald-600 active:scale-[0.98] text-zinc-950 cursor-pointer flex items-center gap-2 shadow-lg shadow-emerald-500/10"
                >
                  {modalLoading ? (
                    <div className="h-4 w-4 border-2 border-zinc-950 border-t-transparent rounded-full animate-spin" />
                  ) : (
                    "Criar Flag Unificada"
                  )}
                </button>
              </div>

            </form>

          </div>

        </div>
      )}

      {/* Unified Reusable Confirmation/Alert Modal */}
      <ConfirmationModal
        isOpen={confirmModal.isOpen}
        title={confirmModal.title}
        message={confirmModal.message}
        confirmText={confirmModal.confirmText}
        cancelText={confirmModal.cancelText}
        onConfirm={confirmModal.onConfirm}
        onCancel={closeConfirmModal}
        type={confirmModal.type}
        isAlertOnly={confirmModal.isAlertOnly}
      />

      {/* Footer */}
      <footer className="py-6 border-t border-zinc-800/80 bg-zinc-900/10 text-center text-[10px] text-zinc-600 flex flex-col sm:flex-row items-center justify-between px-6 gap-2">
        <p>© 2026 Feature Flags Panel. Todos os direitos reservados. Uso administrativo restrito.</p>
        <div className="flex items-center gap-3">
          {ENVIRONMENTS.map((env) => (
            <span key={env.id} className="text-zinc-500">
              Coleção {env.name}: <span className="font-mono">{env.collectionName}</span>
            </span>
          ))}
        </div>
      </footer>

    </div>
  );
}
