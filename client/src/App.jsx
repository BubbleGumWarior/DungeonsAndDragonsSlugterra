import { Navigate, Outlet, Route, Routes } from "react-router-dom";
import { AuthProvider, useAuth } from "./AuthContext.jsx";
import AccessSocket, { useLiveState } from "./AccessSocket.jsx";
import VoiceChatProvider from "./VoiceChatContext.jsx";
import VoiceWidget from "./VoiceWidget.jsx";
import ChallengeResultOverlay from "./ChallengeResultOverlay.jsx";
import DiceRollPrompt from "./DiceRollPrompt.jsx";
import SlugHuntPrompt from "./SlugHuntPrompt.jsx";
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
import GalaxyPage from "./GalaxyPage.jsx";
import ShipPage from "./ShipPage.jsx";
import CombatPage from "./CombatPage.jsx";
import Chronicle from "./Chronicle.jsx";
import Settings from "./Settings.jsx";

function PublicOnlyRoute({ children }) {
  const { token } = useAuth();
  return token ? <Navigate to="/dashboard" replace /> : children;
}

// Guards the routes that only exist once Slugterra is revealed. The NavBar
// hides these links for players until then, but hiding a link doesn't stop
// someone typing /ship into the address bar -- this bounces them back to the
// dashboard unless they're the Dungeon Master or the reveal has happened.
function SlugterraGate() {
  const { user } = useAuth();
  const { slugterraRevealed, settingsLoaded } = useLiveState();
  const isDungeonMaster = user?.role === "Dungeon Master";

  if (isDungeonMaster) return <Outlet />;

  // Wait for the real setting before deciding -- otherwise a player deep-linking
  // to a revealed page would get bounced on the first render.
  if (!settingsLoaded) {
    return (
      <div className="gate-loading">
        <div className="gate-loading-card">Loading&hellip;</div>
      </div>
    );
  }

  return slugterraRevealed ? <Outlet /> : <Navigate to="/dashboard" replace />;
}

// Gates the voice chat layer on being signed in -- otherwise the floating
// button/panel would show up on the public login/register screens, where
// there's no socket connection (and no party) to join.
function AuthedVoiceChat() {
  const { token } = useAuth();
  if (!token) return null;
  return (
    <VoiceChatProvider>
      <VoiceWidget />
    </VoiceChatProvider>
  );
}

function App() {
  return (
    <AuthProvider>
      <AccessSocket>
        <ChallengeResultOverlay />
        <DiceRollPrompt />
        <SlugHuntPrompt />
        <CounterClashPrompt />
        <KnockoutRollPrompt />
        <AuthedVoiceChat />
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
            <Route element={<SlugterraGate />}>
              <Route path="/inventory" element={<Inventory />} />
              <Route path="/slugs" element={<Slugs />} />
              <Route path="/mechas" element={<Mechas />} />
              <Route path="/galaxy" element={<GalaxyPage />} />
              <Route path="/ship" element={<ShipPage />} />
              <Route path="/combat" element={<CombatPage />} />
              <Route path="/chronicle" element={<Chronicle />} />
              <Route path="/npcs" element={<Navigate to="/chronicle" replace />} />
            </Route>
            <Route path="/admin" element={<Admin />} />
            <Route path="/settings" element={<Settings />} />
          </Route>

          <Route path="*" element={<Navigate to="/login" replace />} />
        </Routes>
      </AccessSocket>
    </AuthProvider>
  );
}

export default App;
