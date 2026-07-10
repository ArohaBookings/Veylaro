import {
  CSSProperties,
  Fragment,
  ReactNode,
  useEffect,
  useRef,
  useState,
} from "react";

/* ---------------- Reveal: blur/slide in when scrolled into view ---------------- */
export function Reveal({
  children,
  delay = 0,
  variant = "",
  className = "",
  as: Tag = "div",
  style,
}: {
  children: ReactNode;
  delay?: number;
  variant?: "" | "from-left" | "from-right" | "zoom";
  className?: string;
  as?: keyof JSX.IntrinsicElements;
  style?: CSSProperties;
}) {
  const ref = useRef<HTMLElement | null>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (e.isIntersecting) {
            e.target.classList.add("in");
            io.unobserve(e.target);
          }
        });
      },
      { threshold: 0.12, rootMargin: "0px 0px -40px 0px" }
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);
  const T = Tag as any;
  return (
    <T
      ref={ref}
      className={`reveal ${variant} ${className}`}
      style={{ ...style, "--d": `${delay}ms` } as CSSProperties}
    >
      {children}
    </T>
  );
}

/* ---------------- CountUp: animated number when visible ---------------- */
export function CountUp({
  to,
  decimals = 0,
  duration = 1600,
  prefix = "",
  suffix = "",
}: {
  to: number;
  decimals?: number;
  duration?: number;
  prefix?: string;
  suffix?: string;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const [val, setVal] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let raf = 0;
    const io = new IntersectionObserver(
      ([e]) => {
        if (!e.isIntersecting) return;
        io.disconnect();
        const start = performance.now();
        const tick = (now: number) => {
          const p = Math.min(1, (now - start) / duration);
          const eased = 1 - Math.pow(1 - p, 4);
          setVal(to * eased);
          if (p < 1) raf = requestAnimationFrame(tick);
        };
        raf = requestAnimationFrame(tick);
      },
      { threshold: 0.4 }
    );
    io.observe(el);
    return () => {
      io.disconnect();
      cancelAnimationFrame(raf);
    };
  }, [to, duration]);
  return (
    <span ref={ref}>
      {prefix}
      {val.toLocaleString(undefined, {
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals,
      })}
      {suffix}
    </span>
  );
}

/* ---------------- GlowCard: card with mouse-tracked radial glow ---------------- */
export function GlowCard({
  children,
  className = "",
  style,
}: {
  children: ReactNode;
  className?: string;
  style?: CSSProperties;
}) {
  const ref = useRef<HTMLDivElement>(null);
  return (
    <div
      ref={ref}
      className={`card glow ${className}`}
      style={style}
      onMouseMove={(e) => {
        const el = ref.current;
        if (!el) return;
        const r = el.getBoundingClientRect();
        el.style.setProperty("--mx", `${e.clientX - r.left}px`);
        el.style.setProperty("--my", `${e.clientY - r.top}px`);
      }}
    >
      {children}
    </div>
  );
}

/* ---------------- Tilt: subtle 3D tilt on hover ---------------- */
export function Tilt({
  children,
  max = 7,
  className = "",
}: {
  children: ReactNode;
  max?: number;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  return (
    <div
      ref={ref}
      className={`tilt ${className}`}
      onMouseMove={(e) => {
        const el = ref.current;
        if (!el) return;
        const r = el.getBoundingClientRect();
        const px = (e.clientX - r.left) / r.width - 0.5;
        const py = (e.clientY - r.top) / r.height - 0.5;
        el.style.transform = `perspective(900px) rotateY(${px * max}deg) rotateX(${-py * max}deg)`;
      }}
      onMouseLeave={() => {
        if (ref.current) ref.current.style.transform = "";
      }}
    >
      {children}
    </div>
  );
}

/* ---------------- Backdrop: aurora blobs + parallax starfield + grain ---------------- */
export function Backdrop() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = canvasRef.current!;
    const ctx = canvas.getContext("2d")!;
    let w = 0;
    let h = 0;
    let raf = 0;
    const DPR = Math.min(window.devicePixelRatio || 1, 2);
    type Star = { x: number; y: number; r: number; depth: number; phase: number; speed: number };
    let stars: Star[] = [];

    const resize = () => {
      w = window.innerWidth;
      h = window.innerHeight;
      canvas.width = w * DPR;
      canvas.height = h * DPR;
      ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
      const count = Math.min(190, Math.floor((w * h) / 11000));
      stars = Array.from({ length: count }, () => ({
        x: Math.random() * w,
        y: Math.random() * h,
        r: Math.random() * 1.3 + 0.3,
        depth: Math.random() * 0.75 + 0.25,
        phase: Math.random() * Math.PI * 2,
        speed: Math.random() * 0.7 + 0.35,
      }));
    };

    const draw = (t: number) => {
      ctx.clearRect(0, 0, w, h);
      const scroll = window.scrollY;
      for (const s of stars) {
        const twinkle = 0.45 + 0.55 * Math.sin(t * 0.001 * s.speed + s.phase);
        const y = (((s.y - scroll * s.depth * 0.18) % h) + h) % h;
        const violet = s.phase > Math.PI * 1.4;
        ctx.beginPath();
        ctx.arc(s.x, y, s.r, 0, Math.PI * 2);
        ctx.fillStyle = violet
          ? `rgba(167, 139, 250, ${0.5 * twinkle})`
          : `rgba(210, 220, 255, ${0.55 * twinkle})`;
        ctx.fill();
      }
      raf = requestAnimationFrame(draw);
    };

    resize();
    window.addEventListener("resize", resize);
    raf = requestAnimationFrame(draw);
    return () => {
      window.removeEventListener("resize", resize);
      cancelAnimationFrame(raf);
    };
  }, []);

  return (
    <>
      <div className="backdrop" aria-hidden>
        <div className="aurora a1" />
        <div className="aurora a2" />
        <div className="aurora a3" />
        <canvas ref={canvasRef} />
      </div>
      <div className="grain" aria-hidden />
    </>
  );
}

/* ---------------- WordReveal: staggered word-by-word headline ---------------- */
export function WordReveal({
  text,
  startDelay = 0,
  step = 70,
  gradient = false,
}: {
  text: string;
  startDelay?: number;
  step?: number;
  gradient?: boolean;
}) {
  return (
    <span className="word-reveal">
      {text.split(" ").map((word, i) => (
        <Fragment key={i}>
          <span className="w">
            {/* gradient goes on the innermost span — background-clip:text can't
                see through the overflow-hidden inline-block wrapper */}
            <span
              className={gradient ? "grad-text" : ""}
              style={{ "--wd": `${startDelay + i * step}ms` } as CSSProperties}
            >
              {word}
            </span>
          </span>{" "}
        </Fragment>
      ))}
    </span>
  );
}
