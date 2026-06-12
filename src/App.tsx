import { Route, Switch, Redirect } from "wouter";
import { AuthProvider, useAuth } from "./contexts/AuthContext";
import Login from "./pages/Login";
import Dashboard from "./pages/Dashboard";
import { RefreshCw } from "lucide-react";

function Router() {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen bg-zinc-950 flex flex-col items-center justify-center gap-3 text-zinc-400 font-sans">
        <RefreshCw className="h-8 w-8 animate-spin text-emerald-500" />
        <span className="text-sm font-medium">Verificando credenciais...</span>
      </div>
    );
  }

  return (
    <Switch>
      <Route path="/login">
        {user ? <Redirect to="/" /> : <Login />}
      </Route>
      <Route path="/">
        {user ? <Dashboard /> : <Redirect to="/login" />}
      </Route>
      <Route>
        <Redirect to="/" />
      </Route>
    </Switch>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <Router />
    </AuthProvider>
  );
}
