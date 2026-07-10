import { Reveal } from "../components/FX";

export function Terms() {
  return (
    <main>
      <section className="page-hero" style={{ textAlign: "left", paddingBottom: 20 }}>
        <div className="container legal">
          <Reveal>
            <span className="eyebrow"><span className="dot" />Legal</span>
            <h1 className="h-xl">Terms of Service</h1>
            <p className="legal-updated">Last updated: July 1, 2026 · Applies to the Veylaro app and veylaro.ai</p>
          </Reveal>
        </div>
      </section>

      <section className="section tight" style={{ paddingTop: 0 }}>
        <div className="container legal">
          <Reveal>
            <div className="callout">
              <p>
                <strong>Plain-English summary</strong> (the contract is the numbered text below): you get a
                license to run Veylaro on your machines; code you write with it is 100% yours; paid plans
                renew until cancelled and come with a 30-day money-back window; don't pirate the model
                weights or use Veylaro to build weapons or malware; the software is provided as-is, and our
                liability is capped at what you paid us in the last 12 months.
              </p>
            </div>

            <h2 id="t1">1. Agreement</h2>
            <p>
              These Terms of Service ("Terms") are a contract between you and Veylaro Labs ("Veylaro",
              "we", "us") governing your use of the Veylaro application, bundled model weights, related
              services, and the veylaro.ai website (together, the "Services"). By installing the App or
              using the Site, you agree to these Terms. If you use the Services on behalf of an organization,
              you represent that you can bind that organization.
            </p>

            <h2 id="t2">2. Your license to Veylaro</h2>
            <p>
              Subject to these Terms and your plan, we grant you a personal, non-exclusive, non-transferable
              license to install and run the App and bundled model weights on devices you own or control:
            </p>
            <ul>
              <li><strong>Free:</strong> up to 2 devices, personal and evaluation use, subject to the usage allowance shown in the app.</li>
              <li><strong>Pro:</strong> up to 3 devices for one person, unlimited usage, commercial use included.</li>
              <li><strong>Team / Enterprise:</strong> per-seat licenses as set out in your order form.</li>
            </ul>
            <p>
              Model versions you have lawfully downloaded remain licensed to you indefinitely, including after
              cancellation — cancelling stops future updates and Pro features, not software you already have.
            </p>

            <h2 id="t3">3. What's yours</h2>
            <p>
              <strong>Your code is yours.</strong> Everything you create with Veylaro — code, text, designs,
              and other output generated on your machine — belongs to you, to the maximum extent permitted by
              law. We claim no rights over your projects, and because the App runs locally, we never even see
              them. You are responsible for reviewing output before relying on it (see §9).
            </p>

            <h2 id="t4">4. What's ours</h2>
            <p>
              The App, the model weights, our trademarks and the Site are owned by Veylaro and protected by IP
              law. You may not: (a) extract, distribute, resell, publish or host the model weights; (b)
              reverse-engineer the App except where the law expressly permits it; (c) share license keys
              beyond your seat count; (d) use the Services to build a competing model via weight extraction
              or systematic distillation. Benchmarking Veylaro and publishing results is explicitly allowed —
              no "no-benchmark" gag clauses here.
            </p>

            <h2 id="t5">5. Acceptable use</h2>
            <p>Don't use the Services to:</p>
            <ul>
              <li>create or distribute malware, or attack systems you lack permission to test;</li>
              <li>develop weapons, or violate export-control and sanctions law;</li>
              <li>infringe others' intellectual property or privacy;</li>
              <li>generate unlawful content or engage in fraud.</li>
            </ul>
            <p>
              Because Veylaro runs on your hardware, enforcement is largely yours to bear: you are responsible
              for your use and for complying with the laws of your jurisdiction.
            </p>

            <h2 id="t6">6. Plans, billing &amp; cancellation</h2>
            <ul>
              <li>Paid subscriptions renew automatically each month or year until cancelled. Cancel anytime in the app or your account page; you keep paid features until the end of the billing period.</li>
              <li><strong>Free trial:</strong> Pro includes a 14-day free trial. You can cancel during the trial at no charge.</li>
              <li><strong>Refunds:</strong> 30-day money-back guarantee on your first payment, no questions asked. Statutory refund rights are unaffected.</li>
              <li>Prices may change with at least 30 days' notice; changes apply from your next renewal, never retroactively.</li>
              <li>Taxes (VAT/GST/sales tax) are added where required.</li>
            </ul>

            <h2 id="t7">7. Updates</h2>
            <p>
              We ship app updates and new model versions on an ongoing basis. Updates are optional; declining
              them never disables what you already have, though some fixes and features require current
              versions. We may end support for very old versions with reasonable notice.
            </p>

            <h2 id="t8">8. Privacy</h2>
            <p>
              Our <a href="#/privacy" style={{ color: "var(--violet)" }}>Privacy Policy</a> is part of these
              Terms. Its core commitment bears repeating in the contract itself: the App does not transmit
              your code, prompts, or AI conversations to Veylaro, and no future update will introduce such
              transmission without your explicit, revocable, opt-in consent.
            </p>

            <h2 id="t9">9. AI output disclaimer</h2>
            <p>
              Veylaro generates content with a machine-learning model. Output may be wrong, insecure,
              incomplete, or similar to other code trained on. You are responsible for reviewing, testing and
              validating anything you ship — especially for safety-critical, medical, financial or legal
              applications. Veylaro is a power tool, not a licensed professional.
            </p>

            <h2 id="t10">10. Warranty disclaimer</h2>
            <p>
              THE SERVICES ARE PROVIDED "AS IS" AND "AS AVAILABLE" WITHOUT WARRANTIES OF ANY KIND, EXPRESS OR
              IMPLIED, INCLUDING MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NON-INFRINGEMENT, TO
              THE MAXIMUM EXTENT PERMITTED BY LAW. Some jurisdictions don't allow certain disclaimers, so
              parts of this section may not apply to you.
            </p>

            <h2 id="t11">11. Limitation of liability</h2>
            <p>
              TO THE MAXIMUM EXTENT PERMITTED BY LAW, VEYLARO WILL NOT BE LIABLE FOR INDIRECT, INCIDENTAL,
              SPECIAL, CONSEQUENTIAL OR PUNITIVE DAMAGES, OR LOST PROFITS, DATA OR GOODWILL. OUR TOTAL
              LIABILITY UNDER THESE TERMS IS CAPPED AT THE GREATER OF US$100 OR THE AMOUNT YOU PAID US IN THE
              12 MONTHS BEFORE THE CLAIM. Nothing in these Terms limits liability that cannot be limited by
              law, including for willful misconduct.
            </p>

            <h2 id="t12">12. Termination</h2>
            <p>
              You can stop using the Services at any time. We may suspend or terminate your account for
              material breach of these Terms (notably §4 and §5) after notice and, where practicable, a
              chance to cure. Sections that by nature survive (3, 4, 9–11, 13–14) survive termination.
              Perpetual rights to already-downloaded model versions survive except in cases of weight
              piracy under §4.
            </p>

            <h2 id="t13">13. Changes to these Terms</h2>
            <p>
              We may update these Terms as the product evolves. For material changes we'll give account
              holders at least 30 days' email notice. Continued use after the effective date constitutes
              acceptance; if you disagree, cancel before it takes effect and §6's refund terms apply
              pro-rata for annual plans.
            </p>

            <h2 id="t14">14. General</h2>
            <p>
              These Terms are the entire agreement between us regarding the Services. If a provision is held
              unenforceable, the rest remain in effect. Failure to enforce is not waiver. You may not assign
              these Terms without our consent; we may assign them in connection with a merger or asset sale
              provided the privacy commitments in §8 bind the successor. Questions:
              <strong> legal@veylaro.ai</strong>.
            </p>
          </Reveal>
        </div>
      </section>
    </main>
  );
}
