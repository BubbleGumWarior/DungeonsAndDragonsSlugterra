import { useEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { DiceFiveIcon } from "@phosphor-icons/react";
import { useAuth } from "./AuthContext.jsx";
import { landingPathFor } from "./authRouting.js";
import "./AuthForm.css";

const TRANSITION_MS = 480;
const ENTER_MS = 650;

export default function AuthPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const { login } = useAuth();

  const mode = location.pathname === "/register" ? "register" : "login";

  const [loginData, setLoginData] = useState({ username: "", password: "" });
  const [registerData, setRegisterData] = useState({
    username: "",
    password: "",
    confirmPassword: "",
  });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [entering, setEntering] = useState(true);
  const [transitioning, setTransitioning] = useState(false);
  const isFirstRender = useRef(true);

  // One-time mount entrance, fully independent from the mode-switch settle animation
  // below so the two never fight over the shared `animation` shorthand.
  useEffect(() => {
    const timer = setTimeout(() => setEntering(false), ENTER_MS);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }
    setTransitioning(true);
    const timer = setTimeout(() => setTransitioning(false), TRANSITION_MS);
    return () => clearTimeout(timer);
  }, [mode]);

  function switchMode(nextMode) {
    setError("");
    navigate(`/${nextMode}`);
  }

  async function handleLogin(e) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(loginData),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Login failed.");
        return;
      }
      login(data.token, data.user);
      navigate(landingPathFor(data.user));
    } catch {
      setError("Could not reach the server.");
    } finally {
      setLoading(false);
    }
  }

  async function handleRegister(e) {
    e.preventDefault();
    setError("");

    if (registerData.password !== registerData.confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username: registerData.username,
          password: registerData.password,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Registration failed.");
        return;
      }
      login(data.token, data.user);
      navigate(landingPathFor(data.user));
    } catch {
      setError("Could not reach the server.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="auth-page">
      <div className="auth-brand-mark">
        <DiceFiveIcon weight="duotone" />
        Dungeon Lair
      </div>
      <div
        className={`auth-viewport ${entering ? "auth-viewport--enter" : ""} ${
          transitioning ? "auth-viewport--transitioning" : ""
        }`}
      >
        <div className={`auth-track ${mode === "register" ? "auth-track--register" : ""}`}>
          <div className="auth-pane">
            <div className="auth-card">
              <h1 className="auth-title">Dungeon Lair</h1>
              <p className="auth-subtitle">Sign in to enter the campaign</p>

              {mode === "login" && error && <div className="auth-error">{error}</div>}

              <form onSubmit={handleLogin}>
                <div className="auth-field">
                  <label htmlFor="login-username">Username</label>
                  <input
                    id="login-username"
                    type="text"
                    autoComplete="username"
                    value={loginData.username}
                    onChange={(e) =>
                      setLoginData((d) => ({ ...d, username: e.target.value }))
                    }
                    required={mode === "login"}
                    tabIndex={mode === "login" ? 0 : -1}
                  />
                </div>
                <div className="auth-field">
                  <label htmlFor="login-password">Password</label>
                  <input
                    id="login-password"
                    type="password"
                    autoComplete="current-password"
                    value={loginData.password}
                    onChange={(e) =>
                      setLoginData((d) => ({ ...d, password: e.target.value }))
                    }
                    required={mode === "login"}
                    tabIndex={mode === "login" ? 0 : -1}
                  />
                </div>
                <button
                  className="auth-submit"
                  type="submit"
                  disabled={loading || mode !== "login"}
                  tabIndex={mode === "login" ? 0 : -1}
                >
                  {loading ? "Signing in..." : "Sign In"}
                </button>
              </form>

              <div className="auth-switch">
                Need an account?{" "}
                <button type="button" onClick={() => switchMode("register")}>
                  Register
                </button>
              </div>
            </div>
          </div>

          <div className="auth-pane">
            <div className="auth-card">
              <h1 className="auth-title">Dungeon Lair</h1>
              <p className="auth-subtitle">
                Create an account. The first to register becomes Dungeon Master.
              </p>

              {mode === "register" && error && <div className="auth-error">{error}</div>}

              <form onSubmit={handleRegister}>
                <div className="auth-field">
                  <label htmlFor="register-username">Username</label>
                  <input
                    id="register-username"
                    type="text"
                    autoComplete="username"
                    value={registerData.username}
                    onChange={(e) =>
                      setRegisterData((d) => ({ ...d, username: e.target.value }))
                    }
                    minLength={3}
                    maxLength={32}
                    required={mode === "register"}
                    tabIndex={mode === "register" ? 0 : -1}
                  />
                </div>
                <div className="auth-field">
                  <label htmlFor="register-password">Password</label>
                  <input
                    id="register-password"
                    type="password"
                    autoComplete="new-password"
                    value={registerData.password}
                    onChange={(e) =>
                      setRegisterData((d) => ({ ...d, password: e.target.value }))
                    }
                    minLength={8}
                    required={mode === "register"}
                    tabIndex={mode === "register" ? 0 : -1}
                  />
                </div>
                <div className="auth-field">
                  <label htmlFor="register-confirm">Confirm Password</label>
                  <input
                    id="register-confirm"
                    type="password"
                    autoComplete="new-password"
                    value={registerData.confirmPassword}
                    onChange={(e) =>
                      setRegisterData((d) => ({ ...d, confirmPassword: e.target.value }))
                    }
                    minLength={8}
                    required={mode === "register"}
                    tabIndex={mode === "register" ? 0 : -1}
                  />
                </div>
                <button
                  className="auth-submit"
                  type="submit"
                  disabled={loading || mode !== "register"}
                  tabIndex={mode === "register" ? 0 : -1}
                >
                  {loading ? "Creating account..." : "Register"}
                </button>
              </form>

              <div className="auth-switch">
                Already have an account?{" "}
                <button type="button" onClick={() => switchMode("login")}>
                  Sign in
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
