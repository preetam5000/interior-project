import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { Toaster } from "sonner";
import { AuthProvider, useAuth } from "@/context/AuthContext";
import { AppShell } from "@/components/layout/AppShell";
import { FullLoader } from "@/components/common/Bits";
import Login from "@/pages/Login";
import Register from "@/pages/Register";
import Dashboard from "@/pages/Dashboard";
import Upload from "@/pages/Upload";
import Approvals from "@/pages/Approvals";
import PostReview from "@/pages/PostReview";
import Library from "@/pages/Library";
import Analytics from "@/pages/Analytics";
import AIDashboard from "@/pages/AIDashboard";
import Settings from "@/pages/Settings";
import GoogleDriveImports from "@/pages/GoogleDriveImports";

function Protected({ children }) {
  const { user } = useAuth();
  if (user === null) return <FullLoader />;
  if (!user) return <Navigate to="/login" replace />;
  return <AppShell>{children}</AppShell>;
}

function PublicOnly({ children }) {
  const { user } = useAuth();
  if (user === null) return <FullLoader />;
  return user ? <Navigate to="/" replace /> : children;
}

document.documentElement.classList.toggle("dark", (localStorage.getItem("isa-theme") || "dark") === "dark");

const page = (el) => <Protected>{el}</Protected>;

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<PublicOnly><Login /></PublicOnly>} />
          <Route path="/register" element={<PublicOnly><Register /></PublicOnly>} />
          <Route path="/" element={page(<Dashboard />)} />
          <Route path="/upload" element={page(<Upload />)} />
          <Route path="/approvals" element={page(<Approvals />)} />
          <Route path="/approvals/:id" element={page(<PostReview />)} />
          <Route path="/library" element={page(<Library />)} />
          <Route path="/google-drive/imports" element={page(<GoogleDriveImports />)} />
          <Route path="/analytics" element={page(<Analytics />)} />
          <Route path="/ai-dashboard" element={page(<AIDashboard />)} />
          <Route path="/settings" element={page(<Settings />)} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
      <Toaster position="bottom-right" richColors closeButton theme="dark" />
    </AuthProvider>
  );
}
