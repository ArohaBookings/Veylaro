import { Link } from "react-router-dom";
import { VeylaroMark } from "../components/Logo";

export function NotFound() {
  return (
    <main className="notfound">
      <div>
        <VeylaroMark size={90} animated />
        <h1 className="h-xl" style={{ marginTop: 26 }}>404 — <span className="grad-text">off the map.</span></h1>
        <p className="lede" style={{ margin: "16px auto 30px" }}>
          This page doesn't exist. Fitting, really — neither do our cloud servers.
        </p>
        <Link to="/" className="btn primary lg">Back to home</Link>
      </div>
    </main>
  );
}
