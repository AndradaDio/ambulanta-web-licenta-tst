import { useEffect, useState } from "react";
import { db, firestore } from "../firebase";
import { ref, onValue } from "firebase/database";
import { collection, onSnapshot, doc, updateDoc } from "firebase/firestore";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import jsPDF from "jspdf";

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
  { label: "Nume și Prenume", name: "nume" },
  { label: "CNP", name: "cnp" },
  { label: "Vârstă", name: "varsta" },
  { label: "Sex", name: "sex" },
  { label: "Motiv", name: "motiv" },
  { label: "Alergii", name: "alergii" },
  { label: "Afecțiuni", name: "afectiuni" },
  { label: "Medicație", name: "medicatie" },
];

const bs = {
  base: { padding: "6px 16px", borderRadius: "8px", cursor: "pointer", fontWeight: "600", fontSize: "13px" },
  sec: { border: "1px solid #90a4ae", background: "#eceff1", color: "#546e7a" }
};

function getStareStyle(stare) {
  const s = {
    "Internat": { background: "#e3f2fd", color: "#1565c0", border: "1px solid #90caf9" },
    "Externat": { background: "#e8f5e9", color: "#2e7d32", border: "1px solid #a5d6a7" }
  };
  return s[stare] || { background: "#fff8e1", color: "#f57c00", border: "1px solid #ffe082" };
}

const BtnPDF = ({ onClick }) => (
  <button onClick={onClick} style={{ ...bs.base, ...bs.sec }}>Export PDF</button>
);

const formatDate = (ts) => ts ? new Date(ts.seconds * 1000).toLocaleString("ro-RO", {
  day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit"
}) : "—";

export default function Spital() {
  const [pacienti, setPacienti] = useState([]);
  const [filtered, setFiltered] = useState([]);
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState(null);
  const [editing, setEditing] = useState(false);
  const [editForm, setEditForm] = useState({});
  const [vitals, setVitals] = useState({ bpm: 0, spo2: 0, temperature: 0 });
  const [history, setHistory] = useState([]);
  const [saveMsg, setSaveMsg] = useState("");
  const [currentSessionId, setCurrentSessionId] = useState("");
  const [showArhivati, setShowArhivati] = useState(false);

  useEffect(() => {
    const unsub = onSnapshot(collection(firestore, "pacienti"), (snapshot) => {
      const list = snapshot.docs
        .map(d => ({ id: d.id, ...d.data() }))
        .filter(p => showArhivati ? p.arhivat === true : !p.arhivat)
        .sort((a, b) => (b.timestamp?.seconds || 0) - (a.timestamp?.seconds || 0));
      setPacienti(list);
      setFiltered(list);
    });
    return () => unsub();
  }, [showArhivati]);

  useEffect(() => {
    const q = search.toLowerCase();
    setFiltered(pacienti.filter(p =>
      p.nume?.toLowerCase().includes(q) || p.cnp?.toLowerCase().includes(q)
    ));
  }, [search, pacienti]);

  useEffect(() => {
    onValue(ref(db, "vitals/live"), (snapshot) => {
      const data = snapshot.val();
      if (!data) return;
      setVitals(data);
      if (data.sessionId) setCurrentSessionId(data.sessionId);
      setHistory(prev => [...prev, {
        time: new Date().toLocaleTimeString("ro-RO", { hour: "2-digit", minute: "2-digit", second: "2-digit" }),
        bpm: data.bpm, spo2: data.spo2, temperature: parseFloat(data.temperature)
      }].slice(-20));
    });
  }, []);

  const selectPacient = (p) => { setSelected(p); setEditForm({ ...p }); setEditing(false); setSaveMsg(""); };
  const handleEditChange = (e) => setEditForm({ ...editForm, [e.target.name]: e.target.value });

  const handleSaveEdit = async () => {
    try {
      const { id, timestamp, sursa, vitale_initiale, ...rest } = editForm;
      await updateDoc(doc(firestore, "pacienti", selected.id), rest);
      setSelected({ ...selected, ...rest });
      setSaveMsg("Date actualizate cu succes!");
      setEditing(false);
      setTimeout(() => setSaveMsg(""), 3000);
    } catch (err) { setSaveMsg("Eroare: " + err.message); }
  };

  const handleStareChange = async (stare) => {
    const nouaStare = selected.stare === stare ? "" : stare;
    try {
      await updateDoc(doc(firestore, "pacienti", selected.id), { stare: nouaStare });
      setSelected({ ...selected, stare: nouaStare });
    } catch (err) { console.error(err); }
  };

  const handleArhivare = async () => {
    if (!window.confirm(`Arhivezi pacientul ${selected.nume}? Va dispărea din lista activă dar datele vor fi păstrate în baza de date.`)) return;
    try {
      await updateDoc(doc(firestore, "pacienti", selected.id), { arhivat: true });
      setSelected(null);
    } catch (err) { console.error(err); }
  };

  const exportPDF = () => {
    const pdf = new jsPDF();
    pdf.setFillColor(69, 90, 100); pdf.rect(0, 0, 210, 30, "F");
    pdf.setTextColor(255, 255, 255); pdf.setFontSize(20); pdf.setFont("helvetica", "bold");
    pdf.text("Fisa Pacient — Medical", 14, 20);
    pdf.setFontSize(10); pdf.setFont("helvetica", "normal");
    pdf.text("Generat: " + new Date().toLocaleString("ro-RO"), 140, 20);
    pdf.setDrawColor(176, 190, 197); pdf.setLineWidth(0.5); pdf.line(14, 35, 196, 35);
    pdf.setTextColor(69, 90, 100); pdf.setFontSize(13); pdf.setFont("helvetica", "bold");
    pdf.text("DATE PACIENT", 14, 45);

    const fields = [
      ["Nume si Prenume", selected.nume], ["CNP", selected.cnp],
      ["Varsta", selected.varsta ? selected.varsta + " ani" : "—"], ["Sex", selected.sex || "—"],
      ["Motiv examinare", selected.motiv || "—"], ["Alergii", selected.alergii || "—"],
      ["Afectiuni preexistente", selected.afectiuni || "—"], ["Medicatie curenta", selected.medicatie || "—"],
      ["Stare pacient", selected.stare || "Neatribuit"],
      ["Data si ora inregistrarii", formatDate(selected.timestamp)],
    ];

    let y = 55;
    fields.forEach(([label, value]) => {
      pdf.setFont("helvetica", "bold"); pdf.setTextColor(120, 144, 156); pdf.setFontSize(11);
      pdf.text(label + ":", 14, y);
      pdf.setFont("helvetica", "normal"); pdf.setTextColor(55, 71, 79);
      pdf.text(String(value || "—"), 70, y);
      y += 10;
    });

    pdf.setDrawColor(207, 216, 220); pdf.line(14, y + 2, 196, y + 2); y += 12;
    pdf.setTextColor(69, 90, 100); pdf.setFontSize(13); pdf.setFont("helvetica", "bold");
    pdf.text("SEMNE VITALE INREGISTRATE PE AMBULANTA", 14, y); y += 10;

    if (selected.vitale_initiale) {
      [
        { fill: [245, 240, 240], color: [176, 117, 122], x: 14, label: "PULS", value: selected.vitale_initiale.bpm, unit: "BPM" },
        { fill: [240, 244, 248], color: [122, 150, 176], x: 76, label: "SpO2", value: selected.vitale_initiale.spo2, unit: "%" },
        { fill: [248, 244, 238], color: [176, 144, 96], x: 138, label: "TEMPERATURA", value: selected.vitale_initiale.temperature, unit: "C" }
      ].forEach(c => {
        pdf.setFillColor(...c.fill); pdf.roundedRect(c.x, y, 55, 28, 4, 4, "F");
        pdf.setTextColor(...c.color); pdf.setFontSize(10); pdf.setFont("helvetica", "bold");
        pdf.text(c.label, c.x + 8, y + 8); pdf.setFontSize(22);
        pdf.text(String(c.value), c.x + 8, y + 20); pdf.setFontSize(10);
        pdf.text(c.unit, c.x + 28, y + 20);
      });
      y += 38;
    } else {
      pdf.setTextColor(144, 164, 174); pdf.setFontSize(11);
      pdf.text("Nu exista vitale inregistrate.", 14, y);
    }

    pdf.setDrawColor(207, 216, 220); pdf.line(14, 272, 196, 272);
    pdf.setTextColor(144, 164, 174); pdf.setFontSize(9); pdf.setFont("helvetica", "italic");
    pdf.text("Document generat automat de sistemul Medical — Confidential", 14, 278);
    pdf.text("Data: " + new Date().toLocaleDateString("ro-RO"), 160, 278);
    pdf.save("fisa_" + (selected.cnp || selected.nume) + ".pdf");
  };

  const isLive = selected?.sessionId === currentSessionId;
  const emptyMsg = search ? "Niciun rezultat găsit." : showArhivati ? "Niciun pacient arhivat." : "Niciun pacient înregistrat încă.";

  return (
    <div className="page-container">
      <div className="page-title">Interfață Spital</div>
      <div style={{ display: "grid", gridTemplateColumns: "320px 1fr", gap: "20px" }}>

        {/* Lista pacienti */}
        <div className="form-card" style={{ marginBottom: "0", padding: "16px", height: "fit-content" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px" }}>
            <h2 style={{ margin: 0, fontSize: "15px" }}>{showArhivati ? "Pacienți arhivați" : "Pacienți înregistrați"}</h2>
            <button onClick={() => { setShowArhivati(!showArhivati); setSelected(null); setSearch(""); }}
              style={{ ...bs.base, ...bs.sec, padding: "4px 12px", fontSize: "12px" }}>
              {showArhivati ? "Activi" : "Arhivați"}
            </button>
          </div>

          <input type="text" placeholder="Caută după nume sau CNP..." value={search}
            onChange={e => setSearch(e.target.value)}
            style={{ width: "100%", padding: "8px 12px", border: "1px solid #cfd8dc", borderRadius: "8px", fontSize: "13px", marginBottom: "12px", background: "#fafafa" }}
          />

          {filtered.length === 0 ? (
            <p style={{ color: "#78909c", fontSize: "14px" }}>{emptyMsg}</p>
          ) : (
            <div className="patients-list" style={{ maxHeight: "500px", overflowY: "auto" }}>
              {filtered.map(p => (
                <div key={p.id} className={`patient-item ${selected?.id === p.id ? "selected" : ""}`} onClick={() => selectPacient(p)}>
                  <div>
                    <div className="patient-name">{p.nume}</div>
                    <div className="patient-meta">CNP: {p.cnp} · {p.varsta} ani · {p.sex}</div>
                    <div className="patient-meta" style={{ marginTop: "4px", color: "#546e7a" }}>{p.motiv}</div>
                    <div className="patient-meta" style={{ marginTop: "4px", color: "#90a4ae", fontSize: "11px" }}>{formatDate(p.timestamp)}</div>
                    <div style={{ display: "flex", gap: "6px", marginTop: "4px", flexWrap: "wrap" }}>
                      {p.stare && <span style={{ display: "inline-block", padding: "2px 8px", borderRadius: "12px", fontSize: "11px", fontWeight: "600", ...getStareStyle(p.stare) }}>{p.stare}</span>}
                      {p.sessionId === currentSessionId && !showArhivati && (
                        <span style={{ display: "inline-block", padding: "2px 8px", borderRadius: "12px", fontSize: "11px", fontWeight: "600", background: "#fce4ec", color: "#c62828", border: "1px solid #ef9a9a" }}>Live</span>
                      )}
                    </div>
                  </div>
                  <span className="patient-badge">→</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Detalii pacient */}
        <div>
          {!selected ? (
            <div className="form-card" style={{ textAlign: "center", padding: "60px" }}>
              <p style={{ color: "#78909c" }}>Selectează un pacient din lista din stânga pentru a vedea detaliile</p>
            </div>
          ) : (
            <>
              {!showArhivati && isLive ? (
                <>
                  <div className="vitals-grid" style={{ marginBottom: "16px" }}>
                    {[
                      { label: "Puls Live", value: vitals.bpm, unit: "BPM", cls: "bpm", status: statusConfig.bpm(vitals.bpm) },
                      { label: "SpO₂ Live", value: vitals.spo2, unit: "%", cls: "spo2", status: statusConfig.spo2(vitals.spo2) },
                      { label: "Temperatură Live", value: parseFloat(vitals.temperature).toFixed(1), unit: "°C", cls: "temp", status: statusConfig.temp(vitals.temperature) }
                    ].map(c => (
                      <div key={c.cls} className={`vital-card ${c.cls}`}>
                        <div className="vital-label">{c.label}</div>
                        <div className="vital-value">{c.value}</div>
                        <div className="vital-unit">{c.unit}</div>
                        <span className={`status-badge ${c.status[0]}`}>{c.status[1]}</span>
                      </div>
                    ))}
                  </div>
                  <div className="charts-grid" style={{ marginBottom: "16px" }}>
                    {chartConfig.map(c => (
                      <div key={c.key} className="chart-card">
                        <div className="chart-title">{c.label}</div>
                        <ResponsiveContainer width="100%" height={140}>
                          <LineChart data={history}>
                            <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                            <XAxis dataKey="time" tick={{ fontSize: 9 }} interval="preserveStartEnd" />
                            <YAxis domain={c.domain} tick={{ fontSize: 9 }} />
                            <Tooltip />
                            <Line type="monotone" dataKey={c.key} stroke={c.color} strokeWidth={3} dot={false} />
                          </LineChart>
                        </ResponsiveContainer>
                      </div>
                    ))}
                  </div>
                </>
              ) : !showArhivati ? (
                <div className="form-card" style={{ marginBottom: "16px", textAlign: "center", padding: "24px" }}>
                  <p style={{ color: "#78909c" }}>Pacientul nu se află în prezent pe ambulanță. Datele live nu sunt disponibile.</p>
                </div>
              ) : null}

              {!showArhivati && (
                <div className="form-card" style={{ marginBottom: "16px" }}>
                  <h2 style={{ marginBottom: "16px" }}>Stare Pacient</h2>
                  <div style={{ display: "flex", gap: "10px" }}>
                    {["În evaluare", "Internat", "Externat"].map(stare => (
                      <button key={stare} onClick={() => handleStareChange(stare)} style={{
                        padding: "10px 20px", borderRadius: "8px", fontWeight: "600", fontSize: "14px",
                        cursor: "pointer", transition: "all 0.2s",
                        ...(selected.stare === stare ? getStareStyle(stare) : { background: "#f5f5f5", color: "#999", border: "1px solid #ddd" })
                      }}>{stare}</button>
                    ))}
                  </div>
                </div>
              )}

              <div className="form-card">
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px", paddingBottom: "12px", borderBottom: "1px solid #cfd8dc" }}>
                  <h2 style={{ margin: 0 }}>Date Pacient — {selected.nume}</h2>
                  <div style={{ display: "flex", gap: "8px" }}>
                    <BtnPDF onClick={exportPDF} />
                    {!showArhivati && (
                      <>
                        <button onClick={handleArhivare} style={{ ...bs.base, ...bs.sec }}>Arhivează</button>
                        <button onClick={() => setEditing(!editing)} style={{ ...bs.base, border: "1px solid #90a4ae", background: editing ? "#fff" : "#546e7a", color: editing ? "#546e7a" : "#fff" }}>
                          {editing ? "Anulează" : "Editează"}
                        </button>
                      </>
                    )}
                  </div>
                </div>

                {saveMsg && <div style={{ padding: "10px", borderRadius: "8px", background: "#eceff1", color: "#546e7a", marginBottom: "16px", fontWeight: "600" }}>{saveMsg}</div>}

                <div className="form-grid">
                  {formFields.map(field => (
                    <div className="form-group" key={field.name}>
                      <label>{field.label}</label>
                      {editing && !showArhivati ? (
                        <input name={field.name} value={editForm[field.name] || ""} onChange={handleEditChange} />
                      ) : (
                        <div style={{ padding: "10px 14px", background: showArhivati ? "#f5f5f5" : "#f8faff", borderRadius: "8px", fontSize: "14px", border: "1px solid #cfd8dc", color: "#37474f" }}>
                          {selected[field.name] || "—"}
                        </div>
                      )}
                    </div>
                  ))}
                </div>

                {selected.vitale_initiale && (
                  <div style={{ marginTop: "20px", padding: "16px", background: "#f8faff", borderRadius: "8px", border: "1px solid #cfd8dc" }}>
                    <div style={{ fontWeight: "700", marginBottom: "10px", color: "#546e7a", fontSize: "13px", textTransform: "uppercase", letterSpacing: "1px" }}>
                      Vitale înregistrate pe ambulanță
                    </div>
                    <div style={{ display: "flex", gap: "24px", marginBottom: "8px" }}>
                      {[["Puls", selected.vitale_initiale.bpm, "BPM"], ["SpO₂", selected.vitale_initiale.spo2, "%"], ["Temp", selected.vitale_initiale.temperature, "°C"]]
                        .map(([label, val, unit]) => <span key={label}>{label}: <strong>{val}</strong> {unit}</span>)}
                    </div>
                    <div style={{ fontSize: "12px", color: "#90a4ae" }}>
                      Înregistrat: <strong>{formatDate(selected.timestamp)}</strong>
                    </div>
                  </div>
                )}

                {editing && !showArhivati && (
                  <button className="submit-btn" onClick={handleSaveEdit}>Salvează modificările</button>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
