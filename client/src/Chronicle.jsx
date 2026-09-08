import NavBar from "./NavBar.jsx";
import ChronicleGallery from "./ChronicleGallery.jsx";
import "./PlaceholderPage.css";

export default function Chronicle() {
  return (
    <div className="dashboard-page">
      <NavBar />
      <div className="placeholder-page placeholder-page--wide">
        <h1 className="slugs-page-title">The Chronicle</h1>
        <p className="chronicle-subtitle">Everyone the party has met.</p>
        <ChronicleGallery />
      </div>
    </div>
  );
}
