import { Reveal } from "../components/FX";
import { LegalShell } from "../components/LegalNav";

const SECTIONS = ["Scope", "What runs locally", "Data we collect", "Data we do not collect", "Payments", "Updates & licensing", "Website", "Support", "Retention", "Your rights", "Security", "Children", "Changes", "Contact"];

export function PrivacyPolicy() {
  return (
    <main>
      <section className="page-hero" style={{ textAlign: "left", paddingBottom: 20 }}>
        <div className="container wide">
          <Reveal>
            <span className="eyebrow"><span className="dot" />Legal</span>
            <h1 className="h-xl">Privacy Policy</h1>
            <p className="legal-updated">Last updated: July 1, 2026 · Effective for Veylaro v2.x and veylaro.ai</p>
          </Reveal>
        </div>
      </section>

      <section className="section tight" style={{ paddingTop: 0 }}>
        <div className="container wide">
         <LegalShell prefix="s" sections={SECTIONS}>
          <Reveal>
            <div className="callout">
              <p>
                <strong>The short version:</strong> Veylaro model inference and project work run on your
                device. We do not receive or train on your code, files, or AI conversations. Optional web
                search sends the displayed search query to a search provider; account, billing, licensing
                and update services send only the data described below.
              </p>
            </div>

            <h2 id="s1">1. Scope</h2>
            <p>
              This Privacy Policy explains how Veylaro Labs ("Veylaro", "we", "us") handles information in
              connection with the Veylaro desktop application (the "App") and the veylaro.ai website (the
              "Site"). It applies to all plans: Free, Pro, Team and Enterprise. Where local law grants you
              stronger rights (GDPR, CCPA/CPRA, and similar), those rights apply in full.
            </p>

            <h2 id="s2">2. What runs locally (everything that matters)</h2>
            <p>The defining property of Veylaro is that the AI is on your machine. The following core operations stay local; the optional search-query exception is stated explicitly:</p>
            <ul>
              <li><strong>Model inference.</strong> Every token Veylaro generates is computed on your hardware.</li>
              <li><strong>Your code and files.</strong> Reading, indexing, editing and searching your projects.</li>
              <li><strong>Prompts and conversations.</strong> Coding chat stays local. If you enable web search, the query shown in the activity stream is sent to the search provider.</li>
              <li><strong>Memory.</strong> Veylaro's long-term memory of your projects and preferences, stored in the App's local data area and protected by your device account and disk security.</li>
              <li><strong>Private verified learning.</strong> If you enable it, passing checks and compact task summaries are stored locally for retrieval on similar work. They are not uploaded or mixed into another user's model.</li>
              <li><strong>Transcripts and logs of AI activity.</strong> Session history lives in your local app data folder and is yours to keep or delete.</li>
              <li><strong>Images, documents and other inputs</strong> you provide to the App.</li>
            </ul>
            <p>
              You can verify this with a network monitoring tool. Blocking the App's network access leaves
              local inference and local project work available; optional web search, account verification and
              update checks will be unavailable.
            </p>

            <h2 id="s3">3. The data we do collect</h2>
            <p>We collect the smallest set of data required to operate a software business:</p>
            <ul>
              <li><strong>Account data (all plans, including Free).</strong> Email address and display name, used for login, plan enforcement, receipts and license recovery. Accounts are stored with Supabase Authentication (hosted in the EU/US); your password is hashed by Supabase and never visible to us.</li>
              <li><strong>Billing data.</strong> Handled by our payment processor (see §5). We receive plan, status and country — never your full card number.</li>
              <li><strong>License checks.</strong> Paid apps periodically confirm license validity by sending a license token, app version, and a coarse platform identifier (e.g. "macOS/arm64"). No code, prompts, file names, hardware serials or usage content are ever included.</li>
              <li><strong>Crash reports.</strong> Diagnostic upload is disabled in the current build and there is no crash-upload endpoint. A future release may add a separate opt-in flow with a new disclosure.</li>
              <li><strong>Support correspondence.</strong> Whatever you choose to email us.</li>
            </ul>

            <h2 id="s4">4. The data we deliberately do not collect</h2>
            <ul>
              <li>No source code, diffs, file contents or file names.</li>
              <li>No full prompts, completions, chat history or AI transcripts. Optional web search transmits only the query displayed in the activity stream.</li>
              <li>No behavioral analytics or telemetry inside the App. There is no event tracking, period.</li>
              <li>No service-side training on user data. Optional private verified learning stays on your machine and can be exported or deleted by you.</li>
              <li>No advertising identifiers, no data sales, no data "sharing" as defined by the CPRA. We have never sold personal information and never will.</li>
            </ul>

            <h2 id="s5">5. Payments</h2>
            <p>
              Purchases are processed by a PCI-DSS Level 1 payment processor acting as our processor
              (currently Stripe, Inc.), with checkout in USD or NZD. Your card details go directly to them;
              we receive only subscription status, plan tier, and billing country. Their privacy policy governs their processing.
            </p>

            <h2 id="s6">6. Model updates &amp; licensing</h2>
            <p>
              When you check for updates (or enable automatic updates), the App requests a version manifest
              and, if you choose, downloads new binaries and model weights. These requests carry the same
              minimal payload as license checks (§3). Updates are always optional; declining them never
              disables the model versions you already have.
            </p>

            <h2 id="s7">7. Website</h2>
            <p>
              The Site uses no advertising trackers. We use Supabase for accounts and to store <strong>register-interest emails</strong> you submit
              before launch — those are used only to tell you when downloads open, never sold or shared,
              and deleted on request. We keep standard, short-lived server logs (IP address, user agent,
              pages requested) for security and capacity planning, retained for a maximum of 30 days.
            </p>

            <h2 id="s8">8. Support</h2>
            <p>
              If you contact support, we use your message and email solely to resolve your issue. If a bug
              requires sharing a code sample, you choose what to send — we will never ask for more than a
              minimal reproduction, and support materials are deleted within 90 days of ticket closure.
            </p>

            <h2 id="s9">9. Retention</h2>
            <ul>
              <li>Account &amp; billing records: for the life of the account plus the period required by tax and accounting law (typically 7 years for invoices).</li>
              <li>License check logs: 90 days, then aggregated and deleted.</li>
              <li>Site logs: 30 days.</li>
              <li>Crash reports: none collected by the current build.</li>
              <li>Everything on your device: yours, forever, under your control. Uninstalling the App removes it, or you can delete the app data folder at any time.</li>
            </ul>

            <h2 id="s10">10. Your rights</h2>
            <p>
              Depending on where you live, you may have rights of access, rectification, erasure, portability,
              restriction and objection, and the right to lodge a complaint with a supervisory authority. We
              honor all of these globally, not just where forced to, and we will respond to any request
              within 30 days of receiving it through the contact channel published in section 14. Deleting your account removes your personal data from our
              systems within 30 days, subject to the legal retention items in §9. Because your AI data never
              reached us, there is nothing further to delete on our side — it is already only on your machine.
            </p>

            <h2 id="s11">11. Security</h2>
            <ul>
              <li>All Site and API traffic is encrypted in transit (TLS 1.2+).</li>
              <li>Local memory and transcripts inherit your operating system account and full-disk protection. App-level vault encryption is a separate release gate and is not claimed until shipped.</li>
              <li>Public release is gated on platform code signing, Apple notarization or Windows Authenticode as applicable, and published SHA-256 checksums. Pre-release builds are not represented as signed releases.</li>
              <li>Our small server-side footprint (licensing, billing) follows least-privilege access with audit logging.</li>
              <li>We run a responsible-disclosure program and credit researchers; the reporting channel is published at launch alongside the contact route in section 14.</li>
            </ul>

            <h2 id="s12">12. Children</h2>
            <p>
              The Site and App are not directed to children under 13 (or the higher minimum age in your
              jurisdiction), and we do not knowingly collect their data. Since the App collects essentially
              nothing, the practical exposure is limited to account creation, which requires being of age.
            </p>

            <h2 id="s13">13. Changes to this policy</h2>
            <p>
              If we change this policy, we will post the new version here with an updated date, and — for
              material changes — notify account holders in-app and by email at least 30 days before it
              takes effect.
              One commitment is permanent and will never be weakened by any future revision:
              <strong> the App will never transmit your project code, chat history or model responses to us.</strong>
            </p>

            <h2 id="s14">14. Contact</h2>
            <p>
              Veylaro Labs. A privacy contact channel — including a dedicated route for data-protection
              requests and for exercising the rights in section 10 — is published here at public launch,
              before any paid account exists. We would rather leave this blank than list an address that
              bounces.
            </p>
          </Reveal>
         </LegalShell>
        </div>
      </section>
    </main>
  );
}
