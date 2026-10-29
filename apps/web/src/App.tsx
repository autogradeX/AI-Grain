import { Navigate, Route, Routes, useLocation } from "react-router-dom";
import { useAuth } from "./auth/AuthContext";
import { Layout, MorePage } from "./components/Layout";
import { Spinner } from "./components/ui";
import {
  AcceptInvitePage,
  ForgotPasswordPage,
  LoginPage,
  RegisterPage,
  ResetPasswordPage,
  VerifyEmailPage,
} from "./pages/auth";
import { BatchPage } from "./pages/BatchPage";
import { CapturePage } from "./pages/CapturePage";
import { CropEditPage, CropsPage } from "./pages/CropsPage";
import { DatasetPage } from "./pages/DatasetPage";
import { PromptPage } from "./pages/PromptPage";
import { ReferencesPage } from "./pages/ReferencesPage";
import { ReviewPage } from "./pages/ReviewPage";
import { SamplePage } from "./pages/SamplePage";
import { SamplesPage } from "./pages/SamplesPage";
import { SettingsPage } from "./pages/SettingsPage";
import { StandardEditPage, StandardsPage } from "./pages/StandardsPage";
import { UsersPage } from "./pages/UsersPage";
import { ValidationPage } from "./pages/ValidationPage";
import { VerifyPage } from "./pages/VerifyPage";

function RequireAuth({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const location = useLocation();
  if (loading) return <Spinner />;
  if (!user)
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  return children;
}

export function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/register" element={<RegisterPage />} />
      <Route path="/forgot-password" element={<ForgotPasswordPage />} />
      <Route path="/reset-password" element={<ResetPasswordPage />} />
      <Route path="/verify-email" element={<VerifyEmailPage />} />
      <Route path="/accept-invite" element={<AcceptInvitePage />} />
      <Route path="/verify" element={<VerifyPage />} />
      <Route path="/verify/:code" element={<VerifyPage />} />
      <Route
        element={
          <RequireAuth>
            <Layout />
          </RequireAuth>
        }
      >
        <Route index element={<SamplesPage />} />
        <Route path="samples/:id" element={<SamplePage />} />
        <Route path="samples/:id/capture" element={<CapturePage />} />
        <Route path="samples/:id/review" element={<ReviewPage />} />
        <Route path="batches/:id" element={<BatchPage />} />
        <Route path="crops" element={<CropsPage />} />
        <Route path="crops/:key" element={<CropEditPage />} />
        <Route path="standards" element={<StandardsPage />} />
        <Route path="standards/:id" element={<StandardEditPage />} />
        <Route path="references" element={<ReferencesPage />} />
        <Route path="validation" element={<ValidationPage />} />
        <Route path="prompt" element={<PromptPage />} />
        <Route path="dataset" element={<DatasetPage />} />
        <Route path="users" element={<UsersPage />} />
        <Route path="settings" element={<SettingsPage />} />
        <Route path="more" element={<MorePage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}
