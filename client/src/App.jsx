import { Navigate, Route, Routes } from "react-router-dom";
import { AuthProvider, useAuth } from "./AuthContext.jsx";
import AccessSocket from "./AccessSocket.jsx";
import ChallengeResultOverlay from "./ChallengeResultOverlay.jsx";
import DiceRollPrompt from "./DiceRollPrompt.jsx";
import CounterClashPrompt from "./CounterClashPrompt.jsx";
import KnockoutRollPrompt from "./KnockoutRollPrompt.jsx";
import AuthGate from "./AuthGate.jsx";
import AuthPage from "./AuthPage.jsx";
import Dashboard from "./Dashboard.jsx";
import RequestAccess from "./RequestAccess.jsx";
import ChangePassword from "./ChangePassword.jsx";
import Admin from "./Admin.jsx";
import CharacterCreate from "./CharacterCreate.jsx";
import CharacterSheet from "./CharacterSheet.jsx";
import Inventory from "./Inventory.jsx";
import Slugs from "./Slugs.jsx";
import Mechas from "./Mechas.jsx";
import CombatPage from "./CombatPage.jsx";
import Npcs from "./Npcs.jsx";

function PublicOnlyRoute({ children }) {
  const { token } = useAuth();
  return token ? <Navigate to="/dashboard" replace /> : children;
}

function App() {
  return (
    <AuthProvider>
      <AccessSocket>
        <ChallengeResultOverlay />
        <DiceRollPrompt />
        <CounterClashPrompt />
        <KnockoutRollPrompt />
        <Routes>
          <Route path="/" element={<Navigate to="/login" replace />} />
          <Route
            path="/login"
            element={
              <PublicOnlyRoute>
                <AuthPage />
              </PublicOnlyRoute>
            }
          />
          <Route
            path="/register"
            element={
              <PublicOnlyRoute>
                <AuthPage />
              </PublicOnlyRoute>
            }
          />

          <Route element={<AuthGate />}>
            <Route path="/request-access" element={<RequestAccess />} />
            <Route path="/change-password" element={<ChangePassword />} />
            <Route path="/dashboard" element={<Dashboard />} />
            <Route path="/character/create" element={<CharacterCreate />} />
            <Route path="/character" element={<CharacterSheet />} />
            <Route path="/inventory" element={<Inventory />} />
            <Route path="/slugs" element={<Slugs />} />
            <Route path="/mechas" element={<Mechas />} />
            <Route path="/combat" element={<CombatPage />} />
            <Route path="/npcs" element={<Npcs />} />
            <Route path="/admin" element={<Admin />} />
          </Route>

          <Route path="*" element={<Navigate to="/login" replace />} />
        </Routes>
      </AccessSocket>
    </AuthProvider>
  );
}

export default App;
