import { BrowserRouter, Routes, Route, Navigate, useLocation } from "react-router-dom";
import { useEffect, useState } from "react";
import { auth, firestore } from "./firebase";
import { onAuthStateChanged, signOut } from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";
import Ambulanta from "./pages/Ambulanta";
import Spital from "./pages/Spital";
import Login from "./pages/Login";
import "./index.css";

function Navbar({ onLogout }) {
  const { pathname } = useLocation();
  if (pathname === "/login" || pathname === "/") return null;
  return (
    <nav className="navbar">
      <div className="nav-logo">
        <span className="nav-title">Medical</span>
      </div>
      <button onClick={onLogout} className="nav-btn" style={{ background: "#ffebee", color: "#c62828", border: "1px solid #ffcdd2", cursor: "pointer" }}>
        Deconectare
      </button>
    </nav>
  );
}

function ProtectedRoute({ user, loading, children }) {
  if (loading) return <div className="home-container"><p>Se încarcă...</p></div>;
  return user ? children : <Navigate to="/login" />;
}

function App() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    return onAuthStateChanged(auth, async (u) => {
      if (u) {
        setUser(u);
        const roleDoc = await getDoc(doc(firestore, "roles", u.email));
        if (!roleDoc.exists()) await signOut(auth);
      } else setUser(null);
      setLoading(false);
    });
  }, []);

  const pr = (component) => (
    <ProtectedRoute user={user} loading={loading}>{component}</ProtectedRoute>
  );

  return (
    <BrowserRouter>
      <Navbar onLogout={() => signOut(auth)} />
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/" element={<Navigate to="/login" />} />
        <Route path="/ambulanta" element={pr(<Ambulanta />)} />
        <Route path="/spital" element={pr(<Spital />)} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
