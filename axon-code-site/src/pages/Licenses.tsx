import { Reveal } from "../components/FX";

export function Licenses() {
  return (
    <main>
      <section className="page-hero" style={{ paddingBottom: 20 }}>
        <div className="container">
          <Reveal>
            <span className="eyebrow"><span className="dot" />Licences &amp; notices</span>
            <h1 className="h-display" style={{ fontSize: "clamp(38px, 5.5vw, 68px)" }}>
              What Veylaro is built on.
            </h1>
            <p className="lede">
              We think you should know exactly what's inside the thing running on your machine.
              Here's every piece, and the licence it arrives under.
            </p>
          </Reveal>
        </div>
      </section>

      <section className="section tight" style={{ paddingTop: 0 }}>
        <div className="container legal">
          <div className="callout">
            <p>
              <strong>The short version.</strong> Laro is built on Google's <strong>Gemma</strong> open-weight
              models. Gemma is released by Google under the <strong>Apache License 2.0</strong> together with
              the Gemma Terms of Use and Prohibited Use Policy — and because our models are derived from
              Gemma, <strong>those terms flow through to every Veylaro product</strong> until we ship our own
              base model trained from scratch. Our own work on top — the training layers, the agent, the
              safety guard and the apps — is Veylaro Labs' proprietary software, and the weights we ship are
              closed.
            </p>
          </div>

          <h2>1. The base model</h2>
          <p>
            Laro Lite, Laro Med and Laro Max are all fine-tuned from Google's Gemma family of open-weight
            models. Google publishes Gemma under the Apache License 2.0, alongside the Gemma Terms of Use.
            Using Gemma as a base carries obligations, and we pass them on rather than hide them:
          </p>
          <ul>
            <li>The Apache 2.0 licence applies to the Gemma-derived components of every Veylaro product.</li>
            <li>
              We pass along Google's <strong>Gemma Prohibited Use Policy</strong> to you as a user of a
              Gemma-derived model, exactly as the terms require.
            </li>
            <li>We state clearly, wherever it matters, that our models are modified versions of Gemma.</li>
            <li>Google retains the ability to restrict uses that violate its policy.</li>
          </ul>
          <p>
            Read them yourself:{" "}
            <a href="https://ai.google.dev/gemma/terms" target="_blank" rel="noreferrer">Gemma Terms of Use</a>{" · "}
            <a href="https://ai.google.dev/gemma/prohibited_use_policy" target="_blank" rel="noreferrer">Prohibited Use Policy</a>{" · "}
            <a href="https://www.apache.org/licenses/LICENSE-2.0" target="_blank" rel="noreferrer">Apache License 2.0</a>.
          </p>
          <p>
            <strong>Where this is going.</strong> Gemma is the starting point, not the destination. When
            Veylaro ships a base model trained from scratch, these obligations fall away and we'll say so
            here on the same day.
          </p>

          <h2>2. What is ours, and closed</h2>
          <p>
            Everything we added is Veylaro Labs' proprietary work and is not open source:
          </p>
          <ul>
            <li>The Laro training layers — the adapters and fine-tunes that make Laro behave like Laro.</li>
            <li>The agent runtime: planning, verification, the adversarial ratchet, the existence gate.</li>
            <li>The safety guard that stands between the model and your disk.</li>
            <li>Veylaro Code (desktop + CLI) and this website.</li>
            <li>The Veylaro and Laro names, the twin-blade mark, and the brand.</li>
          </ul>
          <p>
            <strong>The shipped weights are closed.</strong> They're distributed in a packaged form for use
            inside Veylaro Code. You may not extract, redistribute, re-host or use them to train another
            model. Your <em>personal</em> adapter — the small layer Laro learns about you if you turn on
            overnight learning — belongs to you, stays on your machine, and is never collected by us.
          </p>

          <h2>3. Your code and your data</h2>
          <p>
            You own everything you write and everything Laro writes for you. We claim no licence over your
            code, your prompts, or the output — none of it reaches us in the first place. See the{" "}
            <a href="/#/privacy">privacy policy</a> for the full detail.
          </p>

          <h2>4. Open-source components</h2>
          <p>
            Veylaro Code is an Electron application and ships with open-source software, each under its own
            licence — including Electron and Node.js (MIT), React (MIT), Vite (MIT), and the Inter, Space
            Grotesk, Jost and JetBrains Mono typefaces (SIL Open Font License 1.1). Full attribution ships
            inside the app under <strong>Settings → About &amp; licences</strong>, and a complete
            machine-readable list is included in every build.
          </p>

          <h2>5. Benchmarks</h2>
          <p>
            Every performance figure we publish ships with the harness that produced it, the exact instance
            list, and a confidence interval — so you can re-run it and check us. Where a number is a
            projection or hasn't been measured, we label it that way rather than quietly rounding up. If you
            ever find a number on this site you can't reproduce, tell us and we'll correct it publicly.
          </p>

          <h2>6. Trademarks</h2>
          <p>
            Gemma and Google are trademarks of Google LLC. Veylaro Labs is not affiliated with, endorsed by,
            or sponsored by Google. "Veylaro" and "Laro" are trademarks of Veylaro Labs.
          </p>

          <h2>7. Contact</h2>
          <p>
            Licensing questions, or think we've got something wrong here? Email{" "}
            <a href="mailto:support@arohacalls.com">support@arohacalls.com</a> and we'll answer properly.
          </p>

          <p className="footnote" style={{ marginTop: 40 }}>
            Last updated {new Date().toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" })}.
          </p>
        </div>
      </section>
    </main>
  );
}
