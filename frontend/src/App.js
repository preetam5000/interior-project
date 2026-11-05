import { lazy, Suspense } from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { Toaster } from "sonner";
import { AuthProvider, useAuth } from "@/context/AuthContext";
import { AppShell } from "@/components/layout/AppShell";
import { FullLoader } from "@/components/common/Bits";
import AppErrorBoundary from "@/components/common/AppErrorBoundary";
const Login = lazy(() => import("@/pages/Login"));
const Register = lazy(() => import("@/pages/Register"));
const Dashboard = lazy(() => import("@/pages/Dashboard"));
const Upload = lazy(() => import("@/pages/Upload"));
const Approvals = lazy(() => import("@/pages/Approvals"));
const PostReview = lazy(() => import("@/pages/PostReview"));
const Library = lazy(() => import("@/pages/Library"));
const Analytics = lazy(() => import("@/pages/Analytics"));
const AIDashboard = lazy(() => import("@/pages/AIDashboard"));
const Settings = lazy(() => import("@/pages/Settings"));
const GoogleDriveImports = lazy(() => import("@/pages/GoogleDriveImports"));

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

const page = (el) => <Suspense fallback={<FullLoader />}><Protected>{el}</Protected></Suspense>;

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <AppErrorBoundary><Routes>
          <Route path="/login" element={<Suspense fallback={<FullLoader />}><PublicOnly><Login /></PublicOnly></Suspense>} />
          <Route path="/register" element={<Suspense fallback={<FullLoader />}><PublicOnly><Register /></PublicOnly></Suspense>} />
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
        </Routes></AppErrorBoundary>
      </BrowserRouter>
      <Toaster position="bottom-right" richColors closeButton theme="dark" />
    </AuthProvider>
  );
}
