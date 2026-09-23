import { useEffect, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { supabase } from "../lib/supabase";

export const Route = createFileRoute("/")({ component: HomePage });

function HomePage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) void navigate({ to: "/feed", replace: true });
    });
  }, [navigate]);

  async function submit() {
    setLoading(true);
    setMessage(null);
    const result = mode === "login"
      ? await supabase.auth.signInWithPassword({ email, password })
      : await supabase.auth.signUp({ email, password });

    if (result.error) {
      setMessage(result.error.message);
    } else if (mode === "signup") {
      setMessage(result.data.session ? "Conta criada. Entrando..." : "Conta criada. Confira seu e-mail para confirmar o cadastro.");
      if (result.data.session) void navigate({ to: "/feed", replace: true });
    } else {
      void navigate({ to: "/feed", replace: true });
    }
    setLoading(false);
  }

  return (
    <main className="auth-page">
      <section className="auth-card">
        <span className="eyebrow">VIVIAN</span>
        <h1>{mode === "login" ? "Entrar" : "Criar conta"}</h1>
        <p className="muted">Seu espaço privado para compartilhar momentos.</p>
        <div className="auth-form">
          <input className="field" type="email" placeholder="E-mail" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" />
          <input className="field" type="password" placeholder="Senha" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete={mode === "login" ? "current-password" : "new-password"} />
          <button className="btn-primary" onClick={() => void submit()} disabled={loading || !email || !password}>
            {loading ? "Aguarde..." : mode === "login" ? "Entrar" : "Criar conta"}
          </button>
        </div>
        {message && <p className="feed-error">{message}</p>}
        <button className="btn-ghost" onClick={() => { setMode(mode === "login" ? "signup" : "login"); setMessage(null); }}>
          {mode === "login" ? "Ainda não tenho uma conta" : "Já tenho uma conta"}
        </button>
      </section>
    </main>
  );
}
