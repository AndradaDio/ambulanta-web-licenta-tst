import { useState } from "react";
import { auth, firestore } from "../firebase";
import { signInWithEmailAndPassword } from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";
import { useNavigate } from "react-router-dom";

export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const handleLogin = async () => {
    setError(""); setLoading(true);
    try {
      await signInWithEmailAndPassword(auth, email, password);
      const roleDoc = await getDoc(doc(firestore, "roles", email));
      if (!roleDoc.exists()) { setError("Contul nu are un rol asociat!"); setLoading(false); return; }
      const role = roleDoc.data().role;
      if (role === "ambulanta") navigate("/ambulanta");
      else if (role === "spital") navigate("/spital");
      else setError("Rol necunoscut!");
    } catch { setError("Email sau parolă incorectă!"); }
    setLoading(false);
  };

  const onEnter = e => e.key === "Enter" && handleLogin();

  return (
    <div className="home-container">
      <div className="home-card">
        <h1>Medical</h1>
        <p>Autentificare personal medical</p>
        <div style={{ marginTop: "24px", display: "flex", flexDirection: "column", gap: "12px" }}>
          {[{ label: "Email", type: "email", value: email, set: setEmail, placeholder: "ex: ambulanta@test.ro" },
            { label: "Parolă", type: "password", value: password, set: setPassword, placeholder: "••••••••" }
          ].map(f => (
            <div key={f.label} className="form-group">
              <label>{f.label}</label>
              <input type={f.type} value={f.value} onChange={e => f.set(e.target.value)} placeholder={f.placeholder} onKeyDown={onEnter} />
            </div>
          ))}
          {error && <div style={{ padding: "10px", borderRadius: "8px", background: "#ffebee", color: "#c62828", fontSize: "14px", fontWeight: "600" }}>{error}</div>}
          <button className="submit-btn" onClick={handleLogin} disabled={loading}>
            {loading ? "Se autentifică..." : "Intră în sistem"}
          </button>
        </div>
      </div>
    </div>
  );
}
