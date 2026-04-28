import { useEffect, useState } from "react";
import { db, firestore } from "../firebase";
import { ref, onValue, set } from "firebase/database";
import { collection, addDoc, serverTimestamp } from "firebase/firestore";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";

const statusConfig = {
  bpm: (v) => v === 0 ? ["status-inactive", "Fără semnal"] :
    v < 40 || v > 130 ? ["status-danger", v < 40 ? "Bradicardie severă" : "Tahicardie severă"] :
    v < 60 || v > 100 ? ["status-warning", v < 60 ? "Bradicardie" : "Tahicardie ușoară"] :
    ["status-ok", "Normal"],
  spo2: (v) => v === 0 ? ["status-inactive", "Fără semnal"] :
    v < 90 ? ["status-danger", "Hipoxie severă"] :
    v < 95 ? ["status-warning", "Hipoxie moderată"] :
    ["status-ok", "Normal"],
  temp: (v) => v < 35 || v > 38.5 ? ["status-danger", v < 35 ? "Hipotermie" : "Febră"] :
    v < 36.5 || v > 37.5 ? ["status-warning", v < 36.5 ? "Temperatură scăzută" : "Febră ușoară"] :
    ["status-ok", "Normal"]
};

const chartConfig = [
  { key: "bpm", label: "Puls (BPM)", domain: [40, 180], color: "#b0757a" },
  { key: "spo2", label: "SpO₂ (%)", domain: [85, 100], color: "#7a96b0" },
  { key: "temperature", label: "Temperatură (°C)", domain: [34, 42], color: "#b09060" }
];

const formFields = [
  { label: "Nume și Prenume *", name: "nume", placeholder: "ex: Popescu Ion" },
  { label: "CNP *", name: "cnp", placeholder: "ex: 1234567890123" },
  { label: "Vârstă", name: "varsta", placeholder: "ex: 45" },
  { label: "Sex", name: "sex", type: "select" },
  { label: "Motivul examinării", name: "motiv", placeholder: "ex: Dureri toracice", full: true },
  { label: "Alergii", name: "alergii", placeholder: "ex: Penicilină" },
  { label: "Afecțiuni preexistente", name: "afectiuni", placeholder: "ex: Diabet, HTA" },
  { label: "Medicație curentă", name: "medicatie", placeholder: "ex: Metformin 500mg", full: true },
];

const emptyForm = { nume: "", cnp: "", varsta: "", sex: "", motiv: "", alergii: "", afectiuni: "", medicatie: "" };
const btnBase = { padding: "10px 24px", borderRadius: "8px", cursor: "pointer", fontWeight: "600", border: "none" };

export default function Ambulanta() {
  const [vitals, setVitals] = useState({ bpm: 0, spo2: 0, temperature: 0 });
  const [sessionId, setSessionId] = useState("");
  const [history, setHistory] = useState([]);
  const [saved, setSaved] = useState(false);
  const [loading, setLoading] = useState(false);
  const [pacientLivrat, setPacientLivrat] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [form, setForm] = useState(emptyForm);

  useEffect(() => {
    onValue(ref(db, "vitals/live"), (snapshot) => {
      const data = snapshot.val();
      if (!data) return;
      setVitals(data);
      if (data.sessionId) setSessionId(data.sessionId);
      setHistory(prev => [...prev, {
        time: new Date().toLocaleTimeString("ro-RO", { hour: "2-digit", minute: "2-digit", second: "2-digit" }),
        bpm: data.bpm, spo2: data.spo2, temperature: parseFloat(data.temperature)
      }].slice(-20));
    });
  }, []);

  const handleChange = (e) => setForm({ ...form, [e.target.name]: e.target.value });

  const handleSubmit = async () => {
    if (!form.nume || !form.cnp) { alert("Numele și CNP-ul sunt obligatorii!"); return; }
    setLoading(true);
    try {
      await addDoc(collection(firestore, "pacienti"), {
        ...form,
        vitale_initiale: { bpm: vitals.bpm, spo2: vitals.spo2, temperature: vitals.temperature },
        sessionId, timestamp: serverTimestamp(), sursa: "ambulanta"
      });
      setSaved(true); setPacientLivrat(false);
      setTimeout(() => setSaved(false), 3000);
    } catch (err) { alert("Eroare la salvare: " + err.message); }
    setLoading(false);
  };

  const confirmLivrat = async () => {
    setShowConfirm(false); setPacientLivrat(true);
    try { await set(ref(db, "vitals/nextSession"), Date.now().toString() + Math.floor(Math.random() * 9999)); }
    catch (err) { console.error(err); }
    setForm(emptyForm); setSaved(false); setHistory([]);
  };

  return (
    <div className="page-container">

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "24px" }}>
        <div className="page-title" style={{ margin: 0 }}>Interfață Ambulanță</div>
        <button onClick={() => setShowConfirm(true)} style={{ ...btnBase, background: "#546e7a", color: "white", fontSize: "15px", fontWeight: "700", opacity: pacientLivrat ? 0.5 : 1 }}>
          Pacient Livrat
        </button>
      </div>

      {showConfirm && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <div style={{ background: "white", borderRadius: "16px", padding: "32px", maxWidth: "400px", width: "90%", textAlign: "center", boxShadow: "0 8px 32px rgba(0,0,0,0.2)" }}>
            <h2 style={{ margin: "0 0 8px", color: "#37474f" }}>Confirmare livrare</h2>
            <p style={{ color: "#78909c", marginBottom: "24px" }}>Confirmi că pacientul a fost livrat la spital? Formularul va fi resetat pentru următorul pacient.</p>
            <div style={{ display: "flex", gap: "12px", justifyContent: "center" }}>
              <button onClick={() => setShowConfirm(false)} style={{ ...btnBase, border: "1px solid #cfd8dc", background: "#eceff1", color: "#546e7a" }}>Anulează</button>
              <button onClick={confirmLivrat} style={{ ...btnBase, background: "#546e7a", color: "white" }}>Confirmă</button>
            </div>
          </div>
        </div>
      )}

      <div className="vitals-grid">
        {[
          { label: "Puls", value: vitals.bpm, unit: "BPM", cls: "bpm", status: statusConfig.bpm(vitals.bpm) },
          { label: "SpO₂", value: vitals.spo2, unit: "%", cls: "spo2", status: statusConfig.spo2(vitals.spo2) },
          { label: "Temperatură", value: parseFloat(vitals.temperature).toFixed(1), unit: "°C", cls: "temp", status: statusConfig.temp(vitals.temperature) }
        ].map(c => (
          <div key={c.cls} className={`vital-card ${c.cls}`}>
            <div className="vital-label">{c.label}</div>
            <div className="vital-value">{c.value}</div>
            <div className="vital-unit">{c.unit}</div>
            <span className={`status-badge ${c.status[0]}`}>{c.status[1]}</span>
          </div>
        ))}
      </div>

      <div className="charts-grid">
        {chartConfig.map(c => (
          <div key={c.key} className="chart-card">
            <div className="chart-title">{c.label}</div>
            <ResponsiveContainer width="100%" height={160}>
              <LineChart data={history}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="time" tick={{ fontSize: 10 }} interval="preserveStartEnd" />
                <YAxis domain={c.domain} tick={{ fontSize: 10 }} />
                <Tooltip />
                <Line type="monotone" dataKey={c.key} stroke={c.color} strokeWidth={3} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        ))}
      </div>

      <div className="form-card">
        <h2>Date Pacient</h2>
        <div className="form-grid">
          {formFields.map(f => (
            <div key={f.name} className={`form-group${f.full ? " full-width" : ""}`}>
              <label>{f.label}</label>
              {f.type === "select" ? (
                <select name={f.name} value={form[f.name]} onChange={handleChange}>
                  <option value="">Selectează</option>
                  <option value="Masculin">Masculin</option>
                  <option value="Feminin">Feminin</option>
                </select>
              ) : (
                <input name={f.name} value={form[f.name]} onChange={handleChange} placeholder={f.placeholder} />
              )}
            </div>
          ))}
        </div>
        <button className="submit-btn" onClick={handleSubmit} disabled={loading}>
          {loading ? "Se salvează..." : saved ? "Salvat cu succes!" : "Salvează Pacient"}
        </button>
      </div>

    </div>
  );
}
