import { lazy, Suspense, useEffect } from "react";
import { Route, Routes, useLocation } from "react-router-dom";
import { Backdrop } from "./components/FX";
import { Nav } from "./components/Nav";
import { Footer } from "./components/Footer";

const Home = lazy(() => import("./pages/Home").then((module) => ({ default: module.Home })));
const Features = lazy(() => import("./pages/Features").then((module) => ({ default: module.Features })));
const Benchmarks = lazy(() => import("./pages/Benchmarks").then((module) => ({ default: module.Benchmarks })));
const Pricing = lazy(() => import("./pages/Pricing").then((module) => ({ default: module.Pricing })));
const Download = lazy(() => import("./pages/Download").then((module) => ({ default: module.Download })));
const Code = lazy(() => import("./pages/Code").then((module) => ({ default: module.Code })));
const Licenses = lazy(() => import("./pages/Licenses").then((module) => ({ default: module.Licenses })));
const Local = lazy(() => import("./pages/Local").then((module) => ({ default: module.Local })));
const MeetLaro = lazy(() => import("./pages/MeetLaro").then((module) => ({ default: module.MeetLaro })));
const PrivacyPolicy = lazy(() => import("./pages/PrivacyPolicy").then((module) => ({ default: module.PrivacyPolicy })));
const Terms = lazy(() => import("./pages/Terms").then((module) => ({ default: module.Terms })));
const Changelog = lazy(() => import("./pages/Changelog").then((module) => ({ default: module.Changelog })));
const Admin = lazy(() => import("./pages/Admin").then((module) => ({ default: module.Admin })));
const NotFound = lazy(() => import("./pages/NotFound").then((module) => ({ default: module.NotFound })));

function ScrollManager() {
  const { pathname, hash } = useLocation();
  useEffect(() => {
    if (hash) {
      const el = document.querySelector(hash);
      if (el) {
        el.scrollIntoView({ behavior: "smooth" });
        return;
      }
    }
    window.scrollTo({ top: 0, behavior: "instant" as ScrollBehavior });
  }, [pathname, hash]);
  return null;
}

export default function App() {
  return (
    <>
      <Backdrop />
      <ScrollManager />
      <Nav />
      <Suspense fallback={<main className="route-loading" aria-label="Loading page" />}>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/features" element={<Features />} />
          <Route path="/benchmarks" element={<Benchmarks />} />
          <Route path="/pricing" element={<Pricing />} />
          <Route path="/download" element={<Download />} />
          <Route path="/code" element={<Code />} />
          <Route path="/licenses" element={<Licenses />} />
          <Route path="/local" element={<Local />} />
          <Route path="/meet-laro" element={<MeetLaro />} />
          <Route path="/privacy" element={<PrivacyPolicy />} />
          <Route path="/terms" element={<Terms />} />
          <Route path="/changelog" element={<Changelog />} />
          <Route path="/admin" element={<Admin />} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </Suspense>
      <Footer />
    </>
  );
}
