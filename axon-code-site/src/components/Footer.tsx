import { Link } from "react-router-dom";
import { VeylaroLockup } from "./Logo";

export function Footer() {
  return (
    <footer className="footer">
      <div className="container">
        <div className="footer-grid">
          <div>
            <VeylaroLockup size={26} />
            <p className="f-desc">
              The most powerful local AI coding agent in the world. Runs entirely on your machine —
              private by physics, unlimited by design.
            </p>
          </div>
          <div>
            <h5>Product</h5>
            <Link className="f-link" to="/features">Features</Link>
            <Link className="f-link" to="/benchmarks">Benchmarks</Link>
            <Link className="f-link" to="/pricing">Pricing</Link>
            <Link className="f-link" to="/download">Download</Link>
            <Link className="f-link" to="/changelog">Changelog</Link>
          </div>
          <div>
            <h5>Why Veylaro</h5>
            <Link className="f-link" to="/local">Local &amp; Private</Link>
            <Link className="f-link" to="/benchmarks">vs. Cloud AI</Link>
            <Link className="f-link" to="/pricing#faq">FAQ</Link>
          </div>
          <div>
            <h5>Legal</h5>
            <Link className="f-link" to="/privacy">Privacy Policy</Link>
            <Link className="f-link" to="/terms">Terms of Service</Link>
            <Link className="f-link" to="/local">Security</Link>
          </div>
          <div>
            <h5>Company</h5>
            <a className="f-link" href="mailto:hello@veylaro.ai">Contact</a>
            <a className="f-link" href="#" onClick={(e) => e.preventDefault()}>X / Twitter</a>
            <a className="f-link" href="#" onClick={(e) => e.preventDefault()}>Discord</a>
            <Link className="f-link" to="/admin">Admin</Link>
          </div>
        </div>

        <div className="footer-giant" aria-hidden>VEYLARO</div>

        <div className="footer-bottom">
          <span>© 2026 Veylaro Labs. All rights reserved.</span>
          <span>Built for people who own their machines — and their code.</span>
        </div>
      </div>
    </footer>
  );
}
