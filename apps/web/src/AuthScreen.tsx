import { useState, type FormEvent } from "react";
import { Building2 } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "./auth";
import { api } from "./lib/api";
import "./auth.css";

type Mode = "login" | "register" | "request-reset" | "confirm-reset";

export function AuthScreen() {
  const { signIn, register } = useAuth();
  const navigate = useNavigate();
  const [mode, setMode] = useState<Mode>("login");
  const [resetEmail, setResetEmail] = useState("");
  const [resetCode, setResetCode] = useState("");
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const isRegistration = mode === "register";

  const changeMode = (next: Mode) => { setMode(next); setError(""); setNotice(""); };

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError(""); setNotice(""); setIsSubmitting(true);
    const form = new FormData(event.currentTarget);
    try {
      if (mode === "request-reset") {
        const email = String(form.get("email"));
        const result = await api<{ message: string; resetCode?: string }>("/auth/password-reset/request", { method: "POST", body: JSON.stringify({ email }) });
        setResetEmail(email); setResetCode(result.resetCode ?? ""); setNotice(result.resetCode ? `Demo reset code: ${result.resetCode}` : result.message); setMode("confirm-reset");
      } else if (mode === "confirm-reset") {
        await api("/auth/password-reset/confirm", { method: "POST", body: JSON.stringify({ email: resetEmail, code: String(form.get("code")), password: String(form.get("password")) }) });
        setNotice("Password updated. Sign in with your new password."); setMode("login");
      } else {
        if (isRegistration) await register(String(form.get("name")), String(form.get("organizationName")), String(form.get("email")), String(form.get("password")));
        else await signIn(String(form.get("email")), String(form.get("password")));
        Object.keys(localStorage).filter(key => key.startsWith("kravient-module-overview-")).forEach(key => localStorage.removeItem(key)); navigate("/", { replace: true });
      }
    } catch (caughtError) { setError(caughtError instanceof Error ? caughtError.message : "Unable to continue"); }
    finally { setIsSubmitting(false); }
  }

  const title = mode === "register" ? "Create your workspace" : mode === "request-reset" ? "Reset your password" : mode === "confirm-reset" ? "Set a new password" : "Welcome back";
  const subtitle = mode === "register" ? "Set up your company workspace in a few moments." : mode === "request-reset" ? "Enter your work email to receive a one-time reset code." : mode === "confirm-reset" ? `Enter the code sent to ${resetEmail}.` : "Sign in to see your construction portfolio.";
  return <main className="auth-page"><section className="auth-panel"><div className="auth-brand"><span><Building2 size={19}/></span><strong>Kravient Build</strong></div><p className="eyebrow">Construction operating system</p><h1>{title}</h1><p className="muted">{subtitle}</p><form onSubmit={submit}>{isRegistration && <><label>Full name<input name="name" required minLength={2}/></label><label>Company name<input name="organizationName" required minLength={2}/></label></>}{mode === "confirm-reset" ? <><label>Reset code<input name="code" inputMode="numeric" defaultValue={resetCode} required pattern="[0-9]{6}" maxLength={6}/></label><label>New password<input name="password" type="password" required minLength={10}/></label></> : <><label>Work email<input name="email" type="email" defaultValue={mode === "request-reset" ? resetEmail : ""} required/></label>{mode !== "request-reset" && <label>Password<input name="password" type="password" required minLength={10}/></label>}</>}{error && <p className="form-error">{error}</p>}{notice && <p className="form-notice">{notice}</p>}<button className="primary-button" disabled={isSubmitting}>{isSubmitting ? "Please wait…" : mode === "register" ? "Create workspace" : mode === "request-reset" ? "Get reset code" : mode === "confirm-reset" ? "Update password" : "Sign in"}</button></form>{mode === "login" && <button className="text-button auth-toggle" type="button" onClick={() => changeMode("request-reset")}>Forgot password?</button>}<button className="text-button auth-toggle" type="button" onClick={() => changeMode(mode === "register" ? "login" : "register")}>{mode === "register" ? "Already have an account? Sign in" : "New to Kravient? Create your workspace"}</button>{mode !== "login" && <button className="text-button auth-toggle" type="button" onClick={() => changeMode("login")}>Back to sign in</button>}</section></main>;
}
