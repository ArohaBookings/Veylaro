import { useEffect, useState } from "react";
import { Link, NavLink, useLocation } from "react-router-dom";
import { VeylaroLockup } from "./Logo";
import { DownloadIcon, Menu, Close } from "./Icons";

const links = [
  { to: "/code", label: "Veylaro Code" },
  { to: "/features", label: "Features" },
  { to: "/benchmarks", label: "Benchmarks" },
  { to: "/local", label: "Why Local" },
  { to: "/pricing", label: "Pricing" },
];

export function Nav() {
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);
  const location = useLocation();

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => setOpen(false), [location.pathname]);

  return (
    <>
      <header className={`nav ${scrolled || open ? "scrolled" : ""}`}>
        <div className="container wide nav-inner">
          <Link to="/" aria-label="Veylaro home">
            <VeylaroLockup />
          </Link>
          <nav className="nav-links" aria-label="Primary">
            {links.map((l) => (
              <NavLink key={l.to} to={l.to} className={({ isActive }) => (isActive ? "active" : "")}>
                {l.label}
              </NavLink>
            ))}
            <a href="/laro-showcase.html">Meet Laro</a>
          </nav>
          <div className="nav-cta">
            <Link to="/pricing" className="btn ghost sm">
              Start free
            </Link>
            <Link to="/download" className="btn primary sm">
              <DownloadIcon size={15} /> Get early access
            </Link>
            <button className="nav-burger" aria-label="Menu" onClick={() => setOpen((v) => !v)}>
              {open ? <Close /> : <Menu />}
            </button>
          </div>
        </div>
      </header>
      {open && (
        <div className="mobile-menu">
          {links.map((l) => (
            <NavLink key={l.to} to={l.to} className={({ isActive }) => (isActive ? "active" : "")}>
              {l.label}
            </NavLink>
          ))}
          <a href="/laro-showcase.html">Meet Laro</a>
          <NavLink to="/download">Download</NavLink>
          <NavLink to="/pricing">Start free</NavLink>
        </div>
      )}
    </>
  );
}
