import { useSearchParams } from "react-router-dom";
import { HandshakeIcon, StorefrontIcon } from "@phosphor-icons/react";
import { useAuth } from "./AuthContext.jsx";
import { isPlayer } from "./roles.js";
import NavBar from "./NavBar.jsx";
import MarketShop from "./MarketShop.jsx";
import Trading from "./Trading.jsx";
import "./PlaceholderPage.css";
import "./Market.css";

export default function Market() {
  const { user } = useAuth();
  // The DM and a DM Assistant have no character to trade with, so Trading is player-only.
  const canTrade = isPlayer(user);
  const [params, setParams] = useSearchParams();
  const tab = canTrade && params.get("tab") === "trading" ? "trading" : "shop";

  return (
    <div className="dashboard-page">
      <NavBar />
      <div className="placeholder-page placeholder-page--wide">
        <h1 className="slugs-page-title">Market</h1>
        <div className="market-page">
          {canTrade && (
            <div className="market-page-tabs" role="tablist">
              <button
                type="button"
                role="tab"
                aria-selected={tab === "shop"}
                className={`market-page-tab${tab === "shop" ? " market-page-tab--active" : ""}`}
                onClick={() => setParams({})}
              >
                <StorefrontIcon weight="bold" />
                Shop
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={tab === "trading"}
                className={`market-page-tab${tab === "trading" ? " market-page-tab--active" : ""}`}
                onClick={() => setParams({ tab: "trading" })}
              >
                <HandshakeIcon weight="bold" />
                Trading
              </button>
            </div>
          )}
          {tab === "trading" ? <Trading /> : <MarketShop />}
        </div>
      </div>
    </div>
  );
}
