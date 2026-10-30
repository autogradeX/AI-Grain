import { lazy, Suspense } from "react";
import { Navigate, Route, Routes, useLocation } from "react-router-dom";
import { useAuth } from "./auth/AuthContext";
import { Layout } from "./components/Layout";
import { Spinner } from "./components/ui";
import {
  AcceptInvitePage,
  ForgotPasswordPage,
  LoginPage,
  RegisterPage,
  ResetPasswordPage,
  VerifyEmailPage,
} from "./pages/auth";
import { AnalyticsPage } from "./pages/AnalyticsPage";
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
import { WebsitePage } from "./pages/WebsitePage";
import { ContactPage } from "./pages/public/ContactPage";
import { DemoPage } from "./pages/public/DemoPage";
import { ArticlePage, HubPage } from "./pages/public/HubPage";
import { PublicLayout } from "./pages/public/PublicLayout";
import { RoiPage } from "./pages/public/RoiPage";

// The landing page carries the 3D scene; the rest of the site doesn't load it.
const HomePage = lazy(() =>
  import("./pages/public/home/HomePage").then((m) => ({ default: m.HomePage })),
);

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
      <Route element={<PublicLayout />}>
        <Route
          index
          element={
            <Suspense fallback={<div className="landing-loading" />}>
              <HomePage />
            </Suspense>
          }
        />
        <Route path="demo" element={<DemoPage />} />
        <Route path="roi" element={<RoiPage />} />
        <Route path="contact" element={<ContactPage />} />
        <Route path="hub" element={<HubPage />} />
        <Route path="hub/:slug" element={<ArticlePage />} />
        <Route path="verify" element={<VerifyPage />} />
        <Route path="verify/:code" element={<VerifyPage />} />
      </Route>
      <Route
        path="/app"
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
        <Route path="analytics" element={<AnalyticsPage />} />
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
        <Route path="website" element={<WebsitePage />} />
        {/* The phone "More" page became the drawer. */}
        <Route path="more" element={<Navigate to="/app" replace />} />
        <Route path="*" element={<Navigate to="/app" replace />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
