import { AlertTriangle, Info, CheckCircle, Trash2, X } from "lucide-react";

interface ConfirmationModalProps {
  isOpen: boolean;
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  onConfirm: () => void;
  onCancel: () => void;
  type?: "danger" | "info" | "success" | "warning";
  isLoading?: boolean;
  isAlertOnly?: boolean;
}

export default function ConfirmationModal({
  isOpen,
  title,
  message,
  confirmText = "Confirmar",
  cancelText = "Cancelar",
  onConfirm,
  onCancel,
  type = "info",
  isLoading = false,
  isAlertOnly = false,
}: ConfirmationModalProps) {
  if (!isOpen) return null;

  // Select icon based on type
  const getIcon = () => {
    switch (type) {
      case "danger":
        return <Trash2 className="h-6 w-6 text-red-400" />;
      case "warning":
        return <AlertTriangle className="h-6 w-6 text-amber-400" />;
      case "success":
        return <CheckCircle className="h-6 w-6 text-emerald-400" />;
      default:
        return <Info className="h-6 w-6 text-blue-400" />;
    }
  };

  // Select button class based on type
  const getConfirmButtonClass = () => {
    switch (type) {
      case "danger":
        return "bg-red-600 hover:bg-red-700 text-white shadow-lg shadow-red-600/10";
      case "warning":
        return "bg-amber-500 hover:bg-amber-600 text-zinc-950 shadow-lg shadow-amber-500/10";
      case "success":
        return "bg-emerald-500 hover:bg-emerald-600 text-zinc-950 shadow-lg shadow-emerald-500/10";
      default:
        return "bg-emerald-500 hover:bg-emerald-600 text-zinc-950 shadow-lg shadow-emerald-500/10";
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
      {/* Backdrop with transition fade-in */}
      <div 
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={() => !isLoading && onCancel()}
      />

      {/* Modal Card container */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl w-full max-w-md shadow-2xl relative z-10 overflow-hidden p-6 space-y-6 animate-in fade-in zoom-in-95 duration-200">
        
        {/* Close button (top right) */}
        {!isLoading && (
          <button 
            onClick={onCancel}
            className="absolute top-4 right-4 p-1 rounded-lg text-zinc-500 hover:text-zinc-350 hover:bg-zinc-800/50 transition-all cursor-pointer"
          >
            <X className="h-4 w-4" />
          </button>
        )}

        <div className="flex gap-4 items-start">
          {/* Icon Badge wrapper */}
          <div className={`p-3 rounded-xl shrink-0 h-12 w-12 flex items-center justify-center ${
            type === "danger" ? "bg-red-500/10 border border-red-500/20" :
            type === "warning" ? "bg-amber-500/10 border border-amber-500/20" :
            type === "success" ? "bg-emerald-500/10 border border-emerald-500/20" :
            "bg-blue-500/10 border border-blue-500/20"
          }`}>
            {getIcon()}
          </div>

          {/* Texts */}
          <div className="space-y-1.5 flex-1 pr-4">
            <h3 className="text-base font-bold text-zinc-100">{title}</h3>
            <p className="text-xs text-zinc-400 leading-relaxed">{message}</p>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex justify-end gap-2.5 pt-2 border-t border-zinc-800/50">
          {!isAlertOnly && (
            <button
              type="button"
              onClick={onCancel}
              disabled={isLoading}
              className="py-2 px-4 rounded-xl text-xs font-semibold text-zinc-400 hover:text-zinc-200 border border-zinc-800 hover:bg-zinc-800/20 cursor-pointer disabled:opacity-50"
            >
              {cancelText}
            </button>
          )}
          <button
            type="button"
            onClick={onConfirm}
            disabled={isLoading}
            className={`py-2 px-5 rounded-xl text-xs font-bold tracking-wide transition-all duration-300 active:scale-[0.98] cursor-pointer flex items-center gap-2 disabled:opacity-50 ${getConfirmButtonClass()}`}
          >
            {isLoading ? (
              <div className="h-4 w-4 border-2 border-zinc-950 border-t-transparent rounded-full animate-spin" />
            ) : (
              confirmText
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
