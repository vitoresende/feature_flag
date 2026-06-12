import React, { createContext, useContext, useEffect, useState } from "react";
import { 
  User, 
  signInWithPopup, 
  signOut, 
  onAuthStateChanged 
} from "firebase/auth";
import { auth, googleProvider } from "../firebase";

interface AuthContextType {
  user: User | null;
  loading: boolean;
  error: string | null;
  loginWithGoogle: () => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Parse allowed emails from env
  const getAllowedEmails = (): string[] => {
    const envEmails = import.meta.env.VITE_ALLOWED_EMAILS || "";
    return envEmails
      .split(",")
      .map((email: string) => email.trim().toLowerCase())
      .filter((email: string) => email.length > 0);
  };

  const isEmailAllowed = (email: string | null): boolean => {
    if (!email) return false;
    const allowed = getAllowedEmails();
    return allowed.includes(email.trim().toLowerCase());
  };

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      setError(null);
      
      if (firebaseUser) {
        if (isEmailAllowed(firebaseUser.email)) {
          setUser(firebaseUser);
        } else {
          // If logged in but email is not on whitelist, force logout
          setError(`Acesso negado: O e-mail "${firebaseUser.email}" não está autorizado.`);
          await signOut(auth);
          setUser(null);
        }
      } else {
        setUser(null);
      }
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const loginWithGoogle = async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await signInWithPopup(auth, googleProvider);
      const loggedUser = result.user;
      
      if (!isEmailAllowed(loggedUser.email)) {
        setError(`Acesso negado: O e-mail "${loggedUser.email}" não está autorizado.`);
        await signOut(auth);
        setUser(null);
        throw new Error("E-mail não autorizado.");
      }
    } catch (err: any) {
      console.error("Erro no login do Google:", err);
      if (err.message !== "E-mail não autorizado.") {
        setError("Erro ao autenticar com o Google. Tente novamente.");
      }
    } finally {
      setLoading(false);
    }
  };

  const logout = async () => {
    setLoading(true);
    try {
      await signOut(auth);
      setUser(null);
      setError(null);
    } catch (err) {
      console.error("Erro ao deslogar:", err);
      setError("Erro ao sair da conta.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        error,
        loginWithGoogle,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth deve ser usado dentro de um AuthProvider");
  }
  return context;
};
