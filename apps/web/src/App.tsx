import { lazy, Suspense } from "react";
import { Navigate, Route, Routes, useLocation } from "react-router-dom";
import { useAuth } from "./auth/AuthContext";
import { UpdateToast } from "./pwa/Pwa";
import { Spinner } from "./components/ui";
import { VerifyPage } from "./pages/VerifyPage";
import { ContactPage } from "./pages/public/ContactPage";
import { DemoPage } from "./pages/public/DemoPage";
import { ArticlePage, HubPage } from "./pages/public/HubPage";
import { PublicLayout } from "./pages/public/PublicLayout";
import { NotFoundPage } from "./pages/public/NotFoundPage";
import { RoiPage } from "./pages/public/RoiPage";

/** A page loaded on first visit, so public pages don't download the app. */
function page<M>(load: () => Promise<M>, name: keyof M) {
  return lazy(() =>
    load().then((m) => ({ default: m[name] as React.ComponentType })),
  );
}

// The landing page carries the 3D scene; the rest of the site doesn't load it.
const HomePage = page(() => import("./pages/public/home/HomePage"), "HomePage");
// The signed-in app and sign-in pages: their own chunks.
const Layout = page(() => import("./components/Layout"), "Layout");
const LoginPage = page(() => import("./pages/auth"), "LoginPage");
const RegisterPage = page(() => import("./pages/auth"), "RegisterPage");
const ForgotPasswordPage = page(
  () => import("./pages/auth"),
  "ForgotPasswordPage",
);
const ResetPasswordPage = page(
  () => import("./pages/auth"),
  "ResetPasswordPage",
);
const VerifyEmailPage = page(() => import("./pages/auth"), "VerifyEmailPage");
const AcceptInvitePage = page(() => import("./pages/auth"), "AcceptInvitePage");
const AnalyticsPage = page(
  () => import("./pages/AnalyticsPage"),
  "AnalyticsPage",
);
const BatchPage = page(() => import("./pages/BatchPage"), "BatchPage");
const CapturePage = page(() => import("./pages/CapturePage"), "CapturePage");
const CropsPage = page(() => import("./pages/CropsPage"), "CropsPage");
const CropEditPage = page(() => import("./pages/CropsPage"), "CropEditPage");
const DatasetPage = page(() => import("./pages/DatasetPage"), "DatasetPage");
const PromptPage = page(() => import("./pages/PromptPage"), "PromptPage");
const ReferencesPage = page(
  () => import("./pages/ReferencesPage"),
  "ReferencesPage",
);
const ReviewPage = page(() => import("./pages/ReviewPage"), "ReviewPage");
const SamplePage = page(() => import("./pages/SamplePage"), "SamplePage");
const SamplesPage = page(() => import("./pages/SamplesPage"), "SamplesPage");
const SettingsPage = page(() => import("./pages/SettingsPage"), "SettingsPage");
const StandardsPage = page(
  () => import("./pages/StandardsPage"),
  "StandardsPage",
);
const StandardEditPage = page(
  () => import("./pages/StandardsPage"),
  "StandardEditPage",
);
const UsersPage = page(() => import("./pages/UsersPage"), "UsersPage");
const ValidationPage = page(
  () => import("./pages/ValidationPage"),
  "ValidationPage",
);
const WebsitePage = page(() => import("./pages/WebsitePage"), "WebsitePage");

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
    <>
      <Suspense fallback={<Spinner />}>
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
            {/* The server answers these with a 404 status too. */}
            <Route path="*" element={<NotFoundPage />} />
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
        </Routes>
      </Suspense>
      <UpdateToast />
    </>
  );
}
