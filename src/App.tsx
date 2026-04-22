import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes, useLocation } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ThemeProvider } from "next-themes";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";
import { HouseholdProvider, useHousehold } from "@/contexts/HouseholdContext";
import { ProGate } from "@/components/ProGate";
import { ReceiptScanProvider } from "@/contexts/ReceiptScanContext";
import AuthPage from "./pages/AuthPage";
import HouseholdSetup from "./pages/HouseholdSetup";
import DashboardPage from "./pages/DashboardPage";
import PantryPage from "./pages/PantryPage";
import ShoppingPage from "./pages/ShoppingPage";
import RecipesPage from "./pages/RecipesPage";
import ChatPage from "./pages/ChatPage";
import ExpiryPage from "./pages/ExpiryPage";
import ActivityPage from "./pages/ActivityPage";
import SettingsPage from "./pages/SettingsPage";
import PlansPage from "./pages/PlansPage";
import AiPage from "./pages/AiPage";
import CouponsPage from "./pages/CouponsPage";
import SpendingPage from "./pages/SpendingPage";
import ReceiptScannerPage from "./pages/ReceiptScannerPage";
import ShoppingHistoryPage from "./pages/ShoppingHistoryPage";
import AppLayout from "./components/AppLayout";
import NotFound from "./pages/NotFound";
import WelcomePage from "./pages/WelcomePage";
import ResetPasswordPage from "./pages/ResetPasswordPage";
import { usePushNotifications } from "./hooks/usePushNotifications";
import { useRestorePurchasesOnLaunch } from "./hooks/useRestorePurchasesOnLaunch";
import { isRecoveryUrl } from "./lib/authRecovery";

const queryClient = new QueryClient();

function AppRoutes() {
  const { user, loading: authLoading } = useAuth();
  const { household, loading: hhLoading } = useHousehold();
  const location = useLocation();
  const normalizedPath = location.pathname.replace(/\/+$/, '') || '/';
  usePushNotifications();
  useRestorePurchasesOnLaunch();

  // Public auth pages must win before the normal app shell logic.
  // The reset email ultimately lands on /reset-password, and that page itself
  // is responsible for validating tokens / showing the new-password form.
  if (normalizedPath === '/reset-password') {
    return <ResetPasswordPage />;
  }

  if (isRecoveryUrl(location)) {
    return <ResetPasswordPage />;
  }

  // Allow /welcome to render without auth
  if (normalizedPath === '/welcome') {
    return <WelcomePage />;
  }

  if (authLoading || (user && hhLoading)) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="animate-pulse text-muted-foreground font-display">Loading...</div>
      </div>
    );
  }

  if (!user) return <AuthPage />;
  if (!household) return <HouseholdSetup />;

  return (
    <AppLayout>
      <Routes>
        <Route path="/" element={<DashboardPage />} />
        <Route path="/pantry" element={<PantryPage />} />
        <Route path="/shopping" element={<ShoppingPage />} />
        <Route path="/expiry" element={<ExpiryPage />} />
        <Route path="/activity" element={<ActivityPage />} />
        <Route path="/settings" element={<SettingsPage />} />
        <Route path="/plans" element={<PlansPage />} />
        <Route path="/spending" element={<SpendingPage />} />
        <Route path="/shopping-history" element={<ShoppingHistoryPage />} />
        <Route path="/recipes" element={<ProGate feature="Recipe Suggestions"><RecipesPage /></ProGate>} />
        <Route path="/chat" element={<ProGate feature="Group Chat"><ChatPage /></ProGate>} />
        <Route path="/ai" element={<ProGate feature="AI Assistant"><AiPage /></ProGate>} />
        <Route path="/coupons" element={<ProGate feature="Discount Code Scanner"><CouponsPage /></ProGate>} />
        <Route path="/receipts" element={<ProGate feature="Receipt Scanner"><ReceiptScannerPage /></ProGate>} />
        <Route path="*" element={<NotFound />} />
      </Routes>
    </AppLayout>
  );
}

const App = () => (
  <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Sonner position="top-center" />
        <BrowserRouter>
          <AuthProvider>
            <HouseholdProvider>
              <ReceiptScanProvider>
                <AppRoutes />
              </ReceiptScanProvider>
            </HouseholdProvider>
          </AuthProvider>
        </BrowserRouter>
      </TooltipProvider>
    </QueryClientProvider>
  </ThemeProvider>
);

export default App;
