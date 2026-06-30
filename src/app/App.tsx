import { useState, useEffect, useRef } from "react";
import { ImageWithFallback } from "@/app/components/figma/ImageWithFallback";
import logoSrc from "@/imports/9c3af3f8-78b4-4529-8b48-896faf0fb0bb.png";
import {
  Globe,
  Sparkles,
  ArrowRight,
  ChevronRight,
  GraduationCap,
  Briefcase,
  BookOpen,
  Users,
  Award,
  Map,
  SendHorizonal,
  Bot,
  CheckCircle2,
  Search,
  Star,
  Calendar,
  DollarSign,
  X,
  Menu,
  Zap,
  Target,
  BarChart3,
  ChevronDown,
  ExternalLink,
  Building2,
  Loader2,
  Sun,
  Moon,
} from "lucide-react";

type Screen = "landing" | "profile" | "country" | "analyzing" | "dashboard";

/* ── Accent gradient for progress fills ── */
const ACCENT_GRADIENT = "linear-gradient(135deg, #2563EB, #38BDF8)";

const OPPORTUNITY_TYPES = [
  { label: "Scholarships", icon: GraduationCap, color: "#2563EB" },
  { label: "Fellowships", icon: Award, color: "#818CF8" },
  { label: "Internships", icon: Briefcase, color: "#34D399" },
  { label: "Conferences", icon: Users, color: "#F59E0B" },
  { label: "Research", icon: BookOpen, color: "#38BDF8" },
  { label: "Exchange Programs", icon: Map, color: "#F472B6" },
  { label: "Grants", icon: DollarSign, color: "#A78BFA" },
  { label: "Competitions", icon: Star, color: "#FB923C" },
];

const HOW_IT_WORKS = [
  {
    step: "01",
    title: "Describe Yourself",
    desc: "Write your profile once — academic background, achievements, goals, and aspirations.",
    icon: BookOpen,
  },
  {
    step: "02",
    title: "AI Analyzes Your Profile",
    desc: "Our engine evaluates your strengths, identifies gaps, and maps your readiness score.",
    icon: Zap,
  },
  {
    step: "03",
    title: "Discover Opportunities",
    desc: "Get a curated list of scholarships, fellowships, internships and more matched to you.",
    icon: Globe,
  },
  {
    step: "04",
    title: "Follow Your Roadmap",
    desc: "Chat with your AI advisor to build a step-by-step plan that maximizes your chances.",
    icon: Target,
  },
];

const COUNTRIES = [
  "United States", "United Kingdom", "Canada", "Australia", "Germany",
  "Netherlands", "Sweden", "Norway", "Denmark", "Switzerland",
  "France", "Japan", "South Korea", "Singapore", "UAE",
  "New Zealand", "Austria", "Finland", "Ireland", "Belgium",
];

const DEGREES = [
  "High School", "Bachelor's Degree", "Master's Degree", "MBA",
  "PhD / Doctorate", "Postdoctoral Research", "Professional Certificate",
];

type Opportunity = {
  id: number;
  title: string;
  org: string;
  type: string;
  country: string;
  deadline: string;
  funding: string;
  match: number;
  tags: string[];
  url?: string;
  why?: string;
  color: string;
};

const OPP_COLORS = ["#2563EB", "#818CF8", "#34D399", "#F59E0B", "#38BDF8", "#F472B6", "#A78BFA", "#FB923C"];

// Map the AI/n8n response (real, web-grounded opportunities) into card data.
function normalizeOpportunities(raw: any): Opportunity[] {
  const list = Array.isArray(raw) ? raw : raw?.opportunities ?? raw?.output?.opportunities ?? [];
  if (!Array.isArray(list)) return [];
  return list.map((o: any, i: number) => ({
    id: i + 1,
    title: String(o.title ?? "Untitled opportunity"),
    org: String(o.org ?? o.organization ?? ""),
    type: String(o.type ?? "Opportunity"),
    country: String(o.country ?? ""),
    deadline: String(o.deadline ?? "Check official site"),
    funding: String(o.funding ?? ""),
    match: Number.isFinite(+o.match) ? (+o.match <= 1 ? Math.round(+o.match * 100) : Math.round(Math.min(+o.match, 100))) : 0,
    tags: Array.isArray(o.tags) ? o.tags.map(String).slice(0, 4) : [],
    url: o.url ? String(o.url) : undefined,
    why: o.why ? String(o.why) : undefined,
    color: OPP_COLORS[i % OPP_COLORS.length],
  }));
}

// The opportunities webhook returns JSON text (possibly fenced, and the backend
// stream can get cut off mid-response) — parse defensively, salvaging whatever
// complete opportunity objects made it through.
function parseOpportunitiesText(txt: string): Opportunity[] {
  if (!txt) return [];
  const s = txt.trim();
  // 1) Try a clean full parse of the whole JSON object.
  const a = s.indexOf("{");
  const b = s.lastIndexOf("}");
  if (a >= 0 && b > a) {
    try {
      const opps = normalizeOpportunities(JSON.parse(s.slice(a, b + 1)));
      if (opps.length) return opps;
    } catch { /* fall through to recovery */ }
  }
  // 2) Recovery: extract each complete {...} object inside the array, even if
  //    the response was truncated before the closing braces.
  const arrStart = s.indexOf("[");
  if (arrStart < 0) return [];
  const items: any[] = [];
  let depth = 0;
  let objStart = -1;
  for (let k = arrStart; k < s.length; k++) {
    const ch = s[k];
    if (ch === "{") { if (depth === 0) objStart = k; depth++; }
    else if (ch === "}") {
      depth--;
      if (depth === 0 && objStart >= 0) {
        try { items.push(JSON.parse(s.slice(objStart, k + 1))); } catch { /* skip partial */ }
        objStart = -1;
      }
    }
  }
  return items.length ? normalizeOpportunities({ opportunities: items }) : [];
}

// fetch with an abort timeout so the UI never hangs forever on a stuck backend.
async function fetchWithTimeout(url: string, init: RequestInit, ms: number): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

// Fetch real opportunities from the n8n agentic workflow (Tavily + Gemini).
async function fetchOpportunities(
  profile: string,
  countries: string[],
  degree: string,
): Promise<Opportunity[]> {
  const url = import.meta.env.VITE_OPPORTUNITIES_WEBHOOK_URL as string | undefined;
  if (!url) throw new Error("VITE_OPPORTUNITIES_WEBHOOK_URL is not configured");
  const res = await fetchWithTimeout(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ profile, countries, degree }),
  }, 70000);
  if (!res.ok) throw new Error(`Opportunities webhook responded ${res.status}`);
  const txt = await res.text();
  return parseOpportunitiesText(txt);
}

const GUIDELINE_CHIPS = [
  "Country & Age", "Current Degree", "GPA / Grades", "IELTS / TOEFL",
  "SAT / GRE / GMAT", "Extracurriculars", "Leadership Experience",
  "Volunteer Work", "Research Experience", "Awards & Achievements",
  "Projects", "Skills", "Career Interests", "Financial Need",
];

function countCompleteness(text: string): number {
  const keywords = [
    ["country", "nationality", "from", "born"],
    ["gpa", "grade", "cgpa", "score"],
    ["ielts", "toefl", "duolingo", "english"],
    ["bachelor", "master", "phd", "degree", "studying"],
    ["research", "paper", "publication", "lab"],
    ["volunteer", "community", "nonprofit"],
    ["intern", "work experience", "job"],
    ["award", "scholarship", "prize", "honor"],
    ["skill", "programming", "language", "software"],
    ["goal", "aspire", "dream", "want to"],
  ];
  if (!text.trim()) return 0;
  const lower = text.toLowerCase();
  let count = 0;
  for (const group of keywords) {
    if (group.some((kw) => lower.includes(kw))) count++;
  }
  return Math.min(100, Math.round((count / keywords.length) * 100));
}

/* ── Nav ── */
function Nav({ onStart }: { onStart: () => void }) {
  const [open, setOpen] = useState(false);
  return (
    <nav className="fixed top-0 left-0 right-0 z-50 flex items-center justify-between px-6 py-4"
      style={{ background: "var(--bar-bg)", backdropFilter: "blur(12px)" }}>
      <div className="flex items-center gap-2.5 min-w-0">
        <div className="w-10 h-10 rounded-2xl flex items-center justify-center neo-raised-sm shrink-0">
          <ImageWithFallback src={logoSrc} alt="Global Opportunity Engine" className="w-7 h-7 object-contain app-logo" />
        </div>
        <span className="font-bold text-base sm:text-lg text-slate-800 truncate" style={{ fontFamily: "'Plus Jakarta Sans', sans-serif" }}>
          Global Opportunity Engine
        </span>
      </div>
      <div className="hidden md:flex items-center gap-8">
        <a href="#how" className="text-sm text-slate-500 hover:text-blue-600 transition-colors">How It Works</a>
        <a href="#types" className="text-sm text-slate-500 hover:text-blue-600 transition-colors">Opportunities</a>
        <button
          onClick={onStart}
          className="neo-accent px-5 py-2 rounded-full text-sm font-semibold text-white">
          Start Free Evaluation
        </button>
      </div>
      <button className="md:hidden text-slate-600 w-10 h-10 rounded-xl flex items-center justify-center neo-button" onClick={() => setOpen(!open)}>
        {open ? <X size={20} /> : <Menu size={20} />}
      </button>
      {open && (
        <div className="absolute top-full left-4 right-4 mt-2 rounded-2xl neo-raised md:hidden flex flex-col gap-4 p-6">
          <a href="#how" className="text-sm text-slate-600">How It Works</a>
          <a href="#types" className="text-sm text-slate-600">Opportunities</a>
          <button onClick={onStart} className="neo-accent px-5 py-2 rounded-full text-sm font-semibold text-white">
            Start Free Evaluation
          </button>
        </div>
      )}
    </nav>
  );
}

/* ── Landing Page ── */
function LandingPage({ onStart }: { onStart: () => void }) {
  return (
    <div className="min-h-screen bg-background text-foreground overflow-x-hidden" style={{ fontFamily: "'Plus Jakarta Sans', sans-serif" }}>
      <Nav onStart={onStart} />

      {/* Hero */}
      <section className="relative min-h-screen flex items-center justify-center pt-20 pb-16 px-6 overflow-hidden">
        {/* Soft light background accents */}
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute top-1/4 left-1/2 -translate-x-1/2 w-[700px] h-[700px] rounded-full opacity-10"
            style={{ background: "radial-gradient(circle, #2563EB 0%, transparent 70%)" }} />
          <div className="absolute bottom-1/4 right-1/4 w-[300px] h-[300px] rounded-full opacity-[0.07]"
            style={{ background: "radial-gradient(circle, #38BDF8 0%, transparent 70%)" }} />
        </div>

        <div className="relative z-10 max-w-5xl mx-auto text-center">
          {/* Logo mark */}
          <div className="flex justify-center mb-8">
            <ImageWithFallback src={logoSrc} alt="Global Opportunity Engine"
              className="w-24 h-24 object-contain app-logo" />
          </div>

          <h1 className="text-4xl sm:text-5xl md:text-7xl font-extrabold leading-tight mb-6 tracking-tight"
            style={{ background: "linear-gradient(135deg, #1E3A8A 0%, #2563EB 50%, #38BDF8 100%)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>
            Discover Global<br />Opportunities<br />
            <span style={{ background: "linear-gradient(90deg, #2563EB, #38BDF8)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>
              Powered by AI
            </span>
          </h1>

          <p className="text-lg md:text-xl text-slate-600 max-w-2xl mx-auto mb-4 leading-relaxed">
            Tell us about yourself once.
          </p>
          <p className="text-base md:text-lg text-slate-500 max-w-2xl mx-auto mb-12 leading-relaxed">
            Our AI will analyze your profile, identify your strengths, evaluate your readiness, recommend opportunities from around the world, and create your personalized success roadmap.
          </p>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <button
              onClick={onStart}
              className="neo-accent group flex items-center gap-2 px-8 py-4 rounded-full font-bold text-white text-lg">
              Start Free Evaluation
              <ArrowRight size={20} className="group-hover:translate-x-1 transition-transform" />
            </button>
            <a href="#how"
              className="neo-button flex items-center gap-2 px-8 py-4 rounded-full font-semibold text-slate-600 text-lg hover:text-blue-600">
              How It Works
              <ChevronDown size={18} />
            </a>
          </div>

          {/* Stats row */}
          <div className="flex flex-wrap justify-center gap-8 mt-16 pt-8" style={{ borderTop: "1px solid var(--hairline)" }}>
            {[
              { val: "50,000+", label: "Opportunities" },
              { val: "180+", label: "Countries" },
              { val: "AI-Powered", label: "Matching" },
              { val: "Free", label: "No Account Needed" },
            ].map((s) => (
              <div key={s.label} className="text-center">
                <div className="text-2xl font-extrabold text-slate-800">{s.val}</div>
                <div className="text-xs text-slate-400 mt-1">{s.label}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Opportunity Types */}
      <section id="types" className="py-20 px-6">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-12">
            <p className="text-xs uppercase tracking-widest text-blue-600 mb-3">What we find for you</p>
            <h2 className="text-3xl md:text-4xl font-extrabold text-slate-800">Every type of opportunity,<br />in one place</h2>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-5">
            {OPPORTUNITY_TYPES.map((t) => (
              <div key={t.label}
                className="neo-card flex flex-col items-center gap-3 p-6 rounded-3xl cursor-default">
                <div className="w-12 h-12 rounded-2xl flex items-center justify-center neo-raised-sm">
                  <t.icon size={22} style={{ color: t.color }} />
                </div>
                <span className="text-sm font-semibold text-slate-700">{t.label}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* How It Works */}
      <section id="how" className="py-20 px-6">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-14">
            <p className="text-xs uppercase tracking-widest text-blue-600 mb-3">Simple & fast</p>
            <h2 className="text-3xl md:text-4xl font-extrabold text-slate-800">How It Works</h2>
          </div>
          <div className="grid md:grid-cols-4 gap-6">
            {HOW_IT_WORKS.map((s, i) => (
              <div key={s.step} className="neo-card relative p-6 rounded-3xl">
                <div className="text-5xl font-black text-slate-300/60 absolute top-4 right-4">{s.step}</div>
                <div className="w-11 h-11 rounded-2xl flex items-center justify-center mb-4 neo-raised-sm">
                  <s.icon size={18} className="text-blue-600" />
                </div>
                <h3 className="font-bold text-slate-800 mb-2">{s.title}</h3>
                <p className="text-sm text-slate-500 leading-relaxed">{s.desc}</p>
                {i < HOW_IT_WORKS.length - 1 && (
                  <ChevronRight size={16} className="hidden md:block absolute -right-4 top-1/2 -translate-y-1/2 text-slate-300 z-10" />
                )}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA Banner */}
      <section className="py-20 px-6">
        <div className="neo-raised-lg max-w-3xl mx-auto text-center p-12 rounded-[2rem] relative overflow-hidden">
          <h2 className="text-3xl md:text-4xl font-extrabold text-slate-800 mb-4">Ready to find your opportunity?</h2>
          <p className="text-slate-500 mb-8 text-lg">No signup. No login. No forms. Just tell us about yourself.</p>
          <button
            onClick={onStart}
            className="neo-accent group inline-flex items-center gap-2 px-8 py-4 rounded-full font-bold text-white text-lg">
            Start Free Evaluation
            <ArrowRight size={20} className="group-hover:translate-x-1 transition-transform" />
          </button>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-10 px-6 text-center" style={{ borderTop: "1px solid var(--hairline)" }}>
        <div className="flex items-center justify-center gap-2 mb-3">
          <div className="w-8 h-8 rounded-xl flex items-center justify-center neo-raised-sm">
            <ImageWithFallback src={logoSrc} alt="GOE" className="w-5 h-5 object-contain app-logo" />
          </div>
          <span className="font-bold text-slate-700">Global Opportunity Engine</span>
        </div>
        <p className="text-xs text-slate-400">AI-Powered Opportunity Intelligence Platform</p>
      </footer>
    </div>
  );
}

/* ── Step Indicator ── */
function StepBar({ step }: { step: number }) {
  const steps = ["Profile", "Destination", "Analyzing", "Dashboard"];
  return (
    <div className="flex items-center gap-1 justify-center mb-10">
      {steps.map((s, i) => (
        <div key={s} className="flex items-center gap-1">
          <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold transition-all ${i < step ? "text-blue-600" : i === step ? "text-blue-700 neo-pressed-sm" : "text-slate-400"}`}>
            {i < step ? <CheckCircle2 size={12} className="text-blue-600" /> : <span className="w-4 h-4 rounded-full border border-current flex items-center justify-center text-[10px]">{i + 1}</span>}
            <span className="hidden sm:inline">{s}</span>
          </div>
          {i < steps.length - 1 && <div className="w-6 h-px bg-slate-300" />}
        </div>
      ))}
    </div>
  );
}

/* ── Profile Summary Page ── */
function ProfilePage({ value, onChange, onNext }: { value: string; onChange: (v: string) => void; onNext: () => void }) {
  const text = value;
  const setText = onChange;
  const completeness = countCompleteness(text);

  return (
    <div className="min-h-screen bg-background text-foreground py-10 px-6" style={{ fontFamily: "'Plus Jakarta Sans', sans-serif" }}>
      <div className="max-w-2xl mx-auto">
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-2">
            <div className="w-9 h-9 rounded-xl flex items-center justify-center neo-raised-sm">
              <ImageWithFallback src={logoSrc} alt="GOE" className="w-6 h-6 object-contain app-logo" />
            </div>
            <span className="font-bold text-slate-800 text-sm">Global Opportunity Engine</span>
          </div>
        </div>

        <StepBar step={0} />

        <h1 className="text-3xl md:text-4xl font-extrabold text-slate-800 mb-3">Tell Us About Yourself</h1>
        <p className="text-slate-500 mb-2 text-sm leading-relaxed">
          This is the most important step of your evaluation. Our AI carefully analyzes everything you write to understand your academic background, experiences, achievements, interests, and future goals.
        </p>
        <p className="text-slate-400 text-xs mb-6">The better your summary, the better your recommendations. Take your time and include as much relevant information as possible.</p>

        {/* Completeness bar */}
        <div className="neo-raised p-4 rounded-2xl mb-5">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-semibold text-slate-500">Profile Completeness</span>
            <span className="text-xs font-bold" style={{ color: completeness > 70 ? "#10B981" : completeness > 40 ? "#F59E0B" : "#94A3B8" }}>
              {completeness}%
            </span>
          </div>
          <div className="w-full h-3 rounded-full neo-pressed-sm">
            <div className="h-3 rounded-full transition-all duration-300"
              style={{
                width: `${completeness}%`,
                background: completeness > 70 ? "linear-gradient(90deg, #34D399, #38BDF8)" : completeness > 40 ? "linear-gradient(90deg, #F59E0B, #38BDF8)" : ACCENT_GRADIENT
              }} />
          </div>
        </div>

        {/* Guideline chips */}
        <div className="flex flex-wrap gap-2 mb-5">
          {GUIDELINE_CHIPS.map((chip) => (
            <span key={chip} className="px-3 py-1.5 rounded-full text-xs text-slate-500 neo-raised-sm">
              {chip}
            </span>
          ))}
        </div>

        {/* Main textarea */}
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={"I am a 22-year-old computer science student from Kenya, currently in my final year at the University of Nairobi with a GPA of 3.8/4.0. I have completed two software engineering internships, led my university's coding club, and published a research paper on machine learning applications in healthcare. I scored 7.5 on IELTS and am passionate about AI and global health innovation. I am looking for graduate scholarships in the US, UK, or Germany for my Masters..."}
          className="neo-pressed w-full h-64 p-4 rounded-2xl text-sm resize-none outline-none text-slate-700 placeholder-slate-400 leading-relaxed"
          style={{ fontFamily: "'Inter', sans-serif" }}
        />
        <div className="flex items-center justify-between mt-2 mb-6">
          <span className="text-xs text-slate-400">{text.length} characters</span>
          <span className="text-xs text-slate-400">Write as much as you like — more detail means better matches</span>
        </div>

        {/* AI hint */}
        {completeness < 60 && text.length > 50 && (
          <div className="neo-raised flex gap-3 p-4 rounded-2xl mb-6 text-sm">
            <Bot size={18} className="text-blue-600 shrink-0 mt-0.5" />
            <div className="text-slate-600">
              <span className="font-semibold text-slate-800">AI Tip: </span>
              Consider adding your GPA, test scores (IELTS/TOEFL), specific achievements, and career interests for better recommendations.
            </div>
          </div>
        )}
        {completeness >= 60 && text.length > 100 && (
          <div className="neo-raised flex gap-3 p-4 rounded-2xl mb-6 text-sm">
            <CheckCircle2 size={18} className="text-emerald-500 shrink-0 mt-0.5" />
            <div className="text-slate-600">
              <span className="font-semibold text-emerald-600">Great profile! </span>
              Your summary covers many key areas. You can continue or add more detail for even better results.
            </div>
          </div>
        )}

        <button
          onClick={onNext}
          disabled={text.trim().length === 0}
          className={`w-full py-4 rounded-full font-bold text-lg flex items-center justify-center gap-2 transition-all ${text.trim().length > 0 ? "neo-accent text-white" : "neo-pressed text-slate-400 cursor-not-allowed"}`}>
          Continue
          <ArrowRight size={20} />
        </button>
      </div>
    </div>
  );
}

/* ── Country & Degree Page ── */
function CountryPage({ countries, setCountries, degree, setDegree, onNext }: {
  countries: string[];
  setCountries: (v: string[] | ((prev: string[]) => string[])) => void;
  degree: string;
  setDegree: (v: string) => void;
  onNext: () => void;
}) {
  const [countrySearch, setCountrySearch] = useState("");
  const selectedCountries = countries;
  const setSelectedCountries = setCountries;
  const selectedDegree = degree;
  const setSelectedDegree = setDegree;

  const filtered = COUNTRIES.filter((c) =>
    c.toLowerCase().includes(countrySearch.toLowerCase())
  );

  const toggleCountry = (c: string) => {
    setSelectedCountries((prev) =>
      prev.includes(c) ? prev.filter((x) => x !== c) : prev.length < 5 ? [...prev, c] : prev
    );
  };

  return (
    <div className="min-h-screen bg-background text-foreground py-10 px-6" style={{ fontFamily: "'Plus Jakarta Sans', sans-serif" }}>
      <div className="max-w-2xl mx-auto">
        <div className="flex items-center gap-2 mb-8">
          <div className="w-9 h-9 rounded-xl flex items-center justify-center neo-raised-sm">
            <ImageWithFallback src={logoSrc} alt="GOE" className="w-6 h-6 object-contain app-logo" />
          </div>
          <span className="font-bold text-slate-800 text-sm">Global Opportunity Engine</span>
        </div>

        <StepBar step={1} />

        <h1 className="text-3xl md:text-4xl font-extrabold text-slate-800 mb-3">Where do you want to go?</h1>
        <p className="text-slate-500 mb-8 text-sm">Select up to 5 dream countries and your target degree level.</p>

        {/* Country search */}
        <div className="mb-6">
          <label className="block text-xs font-semibold text-slate-500 mb-2 uppercase tracking-widest">Dream Countries (up to 5)</label>
          <div className="relative mb-4">
            <Search size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 z-10" />
            <input
              value={countrySearch}
              onChange={(e) => setCountrySearch(e.target.value)}
              placeholder="Search countries..."
              className="neo-pressed w-full pl-10 pr-4 py-3 rounded-xl text-sm outline-none text-slate-700 placeholder-slate-400"
              style={{ fontFamily: "'Inter', sans-serif" }}
            />
          </div>
          {selectedCountries.length > 0 && (
            <div className="flex flex-wrap gap-2 mb-4">
              {selectedCountries.map((c) => (
                <button key={c} onClick={() => toggleCountry(c)}
                  className="neo-accent flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold text-white">
                  {c} <X size={12} />
                </button>
              ))}
            </div>
          )}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 max-h-52 overflow-y-auto p-1"
            style={{ scrollbarWidth: "none" }}>
            {filtered.map((c) => {
              const active = selectedCountries.includes(c);
              return (
                <button key={c} onClick={() => toggleCountry(c)}
                  className={`flex items-center gap-2 px-3 py-2.5 rounded-xl text-sm text-left transition-all ${active ? "neo-pressed text-blue-700 font-semibold" : "neo-raised-sm text-slate-600 hover:text-blue-600"}`}>
                  <Globe size={13} className={active ? "text-blue-600" : "text-slate-400"} />
                  {c}
                </button>
              );
            })}
          </div>
        </div>

        {/* Degree selection */}
        <div className="mb-8">
          <label className="block text-xs font-semibold text-slate-500 mb-3 uppercase tracking-widest">Target Degree Level</label>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {DEGREES.map((d) => {
              const active = selectedDegree === d;
              return (
                <button key={d} onClick={() => setSelectedDegree(d)}
                  className={`flex items-center gap-3 px-4 py-3 rounded-xl text-sm text-left transition-all ${active ? "neo-pressed text-blue-700 font-semibold" : "neo-raised-sm text-slate-600 hover:text-blue-600"}`}>
                  <GraduationCap size={16} className={active ? "text-blue-600" : "text-slate-400"} />
                  {d}
                  {active && <CheckCircle2 size={14} className="text-blue-600 ml-auto" />}
                </button>
              );
            })}
          </div>
        </div>

        <button
          onClick={onNext}
          disabled={selectedCountries.length === 0 || !selectedDegree}
          className={`w-full py-4 rounded-full font-bold text-lg flex items-center justify-center gap-2 transition-all ${selectedCountries.length > 0 && selectedDegree ? "neo-accent text-white" : "neo-pressed text-slate-400 cursor-not-allowed"}`}>
          Analyze My Profile
          <Sparkles size={18} />
        </button>
      </div>
    </div>
  );
}

/* ── AI Analyzing Page ── */
function AnalyzingPage({ profile, countries, degree, onDone }: {
  profile: string;
  countries: string[];
  degree: string;
  onDone: (opps: Opportunity[], error: string | null) => void;
}) {
  const [progress, setProgress] = useState(0);
  const [phase, setPhase] = useState(0);
  const resultRef = useRef<{ opps: Opportunity[]; error: string | null } | null>(null);
  const doneRef = useRef(false);

  const phases = [
    "Reading your profile summary...",
    "Identifying your strengths and goals...",
    "Searching the web for live opportunities...",
    "Matching real opportunities to your profile...",
    "Verifying details and deadlines...",
    "Building your personalized list...",
    "Almost there...",
  ];

  // Kick off the real AI + web-search call once.
  useEffect(() => {
    let cancelled = false;
    fetchOpportunities(profile, countries, degree)
      .then((opps) => {
        if (!cancelled) resultRef.current = { opps, error: opps.length ? null : "No matching opportunities were found. Try adding more detail to your profile." };
      })
      .catch((e) => {
        if (!cancelled) resultRef.current = { opps: [], error: String(e?.message || e) };
      });
    return () => { cancelled = true; };
  }, [profile, countries, degree]);

  // Climb to 92%, hold until the real results land, then finish and navigate.
  useEffect(() => {
    const interval = setInterval(() => {
      setProgress((p) => {
        const ready = resultRef.current !== null;
        if (ready && p >= 100) {
          clearInterval(interval);
          if (!doneRef.current) {
            doneRef.current = true;
            const r = resultRef.current!;
            setTimeout(() => onDone(r.opps, r.error), 400);
          }
          return 100;
        }
        if (!ready && p >= 92) return 92;
        return Math.min(ready ? 100 : 92, p + 1.4);
      });
    }, 60);
    return () => clearInterval(interval);
  }, [onDone]);

  useEffect(() => {
    setPhase(Math.min(phases.length - 1, Math.floor((progress / 100) * phases.length)));
  }, [progress]);

  return (
    <div className="min-h-screen bg-background text-foreground flex items-center justify-center px-6"
      style={{ fontFamily: "'Plus Jakarta Sans', sans-serif" }}>
      <div className="max-w-lg w-full text-center">
        {/* Animated globe on neo pad */}
        <div className="relative flex items-center justify-center mb-10">
          <div className="absolute w-48 h-48 rounded-full animate-ping opacity-10"
            style={{ background: "radial-gradient(circle, #2563EB, transparent)" }} />
          <div className="absolute w-36 h-36 rounded-full animate-pulse opacity-20"
            style={{ background: "radial-gradient(circle, #38BDF8, transparent)" }} />
          <div className="relative z-10 w-32 h-32 rounded-full flex items-center justify-center neo-raised-lg">
            <ImageWithFallback src={logoSrc} alt="GOE" className="w-20 h-20 object-contain app-logo" />
          </div>
        </div>

        <h2 className="text-3xl font-extrabold text-slate-800 mb-3">Analyzing Your Profile</h2>
        <p className="text-slate-500 mb-10 text-sm">Our AI is working hard to find the best opportunities for you.</p>

        {/* Progress */}
        <div className="w-full h-3 rounded-full neo-pressed-sm mb-4 overflow-hidden">
          <div className="h-3 rounded-full transition-all duration-300"
            style={{ width: `${progress}%`, background: ACCENT_GRADIENT }} />
        </div>
        <div className="flex justify-between text-xs text-slate-400 mb-8">
          <span>{Math.round(progress)}% complete</span>
          <span>{Math.round((100 - progress) / 1.4 * 0.06)}s remaining</span>
        </div>

        <div className="neo-raised p-4 rounded-2xl text-sm text-slate-600 flex items-center gap-3">
          <Loader2 size={16} className="text-blue-600 animate-spin shrink-0" />
          <span className="transition-all">{phases[phase]}</span>
        </div>
      </div>
    </div>
  );
}

/* ── Dashboard Page ── */
function DashboardPage({ opportunities, oppError }: { opportunities: Opportunity[]; oppError: string | null }) {
  const [messages, setMessages] = useState(() => [{
    role: "ai" as const,
    text: opportunities.length
      ? `I've found ${opportunities.length} real opportunities matched to your profile. Ask me anything about them, your eligibility, or how to plan your applications.`
      : "Hi! I'm your AI advisor. Ask me anything about opportunities, your eligibility, or how to plan your applications.",
  }]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [activeFilter, setActiveFilter] = useState("All");
  const [expandedCard, setExpandedCard] = useState<number | null>(null);
  const [chatOpen, setChatOpen] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  const filters = ["All", "Scholarships", "Fellowships", "Internships", "Exchange"];

  const filtered = activeFilter === "All"
    ? opportunities
    : opportunities.filter((o) => o.type.startsWith(activeFilter.slice(0, -1)));

  const sendMessage = async () => {
    if (!input.trim() || loading) return;
    const userMsg = { role: "user" as const, text: input };
    const history = messages.map((m) => ({
      role: m.role === "ai" ? "assistant" : "user",
      content: m.text,
    }));
    setMessages((m) => [...m, userMsg]);
    setInput("");
    setLoading(true);

    try {
      const webhookUrl = import.meta.env.VITE_CHAT_WEBHOOK_URL as string | undefined;
      if (!webhookUrl) {
        throw new Error("VITE_CHAT_WEBHOOK_URL is not configured");
      }

      // Browser -> n8n webhook -> AI Agent (Gemini). The API key lives in n8n.
      const res = await fetchWithTimeout(webhookUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: userMsg.text, history }),
      }, 45000);
      if (!res.ok) throw new Error(`Webhook responded ${res.status}`);

      // Be tolerant of common n8n response shapes
      const data = await res.json().catch(() => null);
      const reply =
        (typeof data === "string" && data) ||
        data?.reply ||
        data?.output ||
        data?.text ||
        data?.message ||
        (Array.isArray(data) ? data[0]?.output ?? data[0]?.text : "") ||
        "Sorry, I couldn't generate a response.";

      setMessages((m) => [...m, { role: "ai" as const, text: String(reply) }]);
    } catch (err) {
      console.error("Chat request failed:", err);
      setMessages((m) => [
        ...m,
        {
          role: "ai" as const,
          text: "⚠️ I couldn't reach the AI advisor right now. Please check that the n8n chat webhook is configured (VITE_CHAT_WEBHOOK_URL) and running.",
        },
      ]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  return (
    <div className="min-h-screen bg-background text-foreground" style={{ fontFamily: "'Plus Jakarta Sans', sans-serif" }}>
      {/* Top bar */}
      <div className="sticky top-0 z-40 flex items-center justify-between px-4 md:px-6 py-3"
        style={{ background: "var(--bar-bg)", backdropFilter: "blur(12px)", boxShadow: "0 4px 12px rgba(0,0,0,0.05)" }}>
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-xl flex items-center justify-center neo-raised-sm">
            <ImageWithFallback src={logoSrc} alt="GOE" className="w-5 h-5 object-contain app-logo" />
          </div>
          <span className="font-bold text-slate-800 text-sm hidden sm:inline">Global Opportunity Engine</span>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-full text-xs neo-pressed-sm">
            <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
            <span className="text-emerald-600 font-medium">AI Active</span>
          </div>
          <div className="px-3 py-1.5 rounded-full text-xs text-slate-500 neo-pressed-sm">
            {opportunities.length} Opportunities Found
          </div>
        </div>
      </div>

      <div className="flex h-[calc(100vh-56px)]">
        {/* Left: Opportunities */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Header */}
          <div className="px-4 md:px-6 py-4" style={{ borderBottom: "1px solid var(--hairline)" }}>
            <div className="flex items-center justify-between gap-2 flex-wrap mb-3">
              <div>
                <h2 className="font-extrabold text-slate-800 text-xl">Your Opportunities</h2>
                <p className="text-xs text-slate-400">Real matches sourced live from the web for your profile</p>
              </div>
              <div className="flex items-center gap-2 text-xs text-slate-500 neo-pressed-sm px-3 py-2 rounded-full">
                <Globe size={12} className="text-blue-600" />
                Live web results
              </div>
            </div>
            <div className="flex gap-2 flex-wrap">
              {filters.map((f) => {
                const active = activeFilter === f;
                return (
                  <button key={f} onClick={() => setActiveFilter(f)}
                    className={`px-4 py-1.5 rounded-full text-xs font-medium transition-all ${active ? "neo-accent text-white" : "neo-raised-sm text-slate-500"}`}>
                    {f}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Cards */}
          <div className="flex-1 overflow-y-auto px-4 md:px-6 py-4 space-y-4"
            style={{ scrollbarWidth: "none" }}>
            {opportunities.length === 0 && (
              <div className="neo-raised rounded-2xl p-6 text-center text-sm text-slate-600">
                <Globe size={26} className="text-blue-600 mx-auto mb-3" />
                <p className="font-semibold text-slate-800 mb-1">No opportunities to show</p>
                <p className="text-slate-500">{oppError || "We couldn't find matches. Go back and add more detail to your profile, then try again."}</p>
              </div>
            )}
            {opportunities.length > 0 && filtered.length === 0 && (
              <div className="neo-raised rounded-2xl p-5 text-center text-sm text-slate-500">
                No {activeFilter.toLowerCase()} in your list — try another filter.
              </div>
            )}
            {filtered.map((opp) => (
              <div key={opp.id}
                className={`rounded-2xl p-4 cursor-pointer transition-all ${expandedCard === opp.id ? "neo-pressed" : "neo-card"}`}
                onClick={() => setExpandedCard(expandedCard === opp.id ? null : opp.id)}>
                <div className="flex items-start gap-3">
                  <div className="w-11 h-11 rounded-2xl flex items-center justify-center shrink-0 neo-raised-sm">
                    <GraduationCap size={18} style={{ color: opp.color }} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <h3 className="font-bold text-slate-800 text-sm leading-tight">{opp.title}</h3>
                        <div className="flex items-center gap-1.5 mt-0.5">
                          <Building2 size={11} className="text-slate-400" />
                          <span className="text-xs text-slate-500">{opp.org}</span>
                        </div>
                      </div>
                      <div className="flex flex-col items-end gap-1 shrink-0">
                        <div className="flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold neo-raised-sm"
                          style={{ color: opp.color }}>
                          <Star size={10} fill="currentColor" />
                          {opp.match}% match
                        </div>
                      </div>
                    </div>
                    <div className="flex flex-wrap items-center gap-3 mt-2 text-xs text-slate-500">
                      <span className="flex items-center gap-1"><Globe size={11} />{opp.country}</span>
                      <span className="flex items-center gap-1"><Calendar size={11} />{opp.deadline}</span>
                      <span className="flex items-center gap-1 text-emerald-600"><DollarSign size={11} />{opp.funding}</span>
                    </div>
                    <div className="flex flex-wrap gap-1.5 mt-3">
                      {opp.tags.map((t) => (
                        <span key={t} className="px-2.5 py-1 rounded-full text-[10px] text-slate-500 neo-raised-sm">
                          {t}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
                {expandedCard === opp.id && (
                  <div className="mt-4 pt-4" style={{ borderTop: "1px solid var(--hairline)" }}>
                    {opp.why && (
                      <p className="text-xs text-slate-500 mb-3 leading-relaxed">
                        <span className="font-semibold text-slate-700">Why this fits: </span>{opp.why}
                      </p>
                    )}
                    <div className="flex gap-2" onClick={(e) => e.stopPropagation()}>
                      {opp.url ? (
                        <a href={opp.url} target="_blank" rel="noopener noreferrer"
                          className="neo-accent flex-1 py-2.5 rounded-xl text-sm font-semibold text-white flex items-center justify-center gap-2">
                          Visit official site <ExternalLink size={14} />
                        </a>
                      ) : (
                        <span className="neo-pressed flex-1 py-2.5 rounded-xl text-sm font-semibold text-slate-400 text-center">
                          No link available
                        </span>
                      )}
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Backdrop (mobile drawer) */}
        {chatOpen && (
          <div onClick={() => setChatOpen(false)}
            className="fixed inset-0 z-40 bg-slate-900/20 backdrop-blur-[1px] lg:hidden" />
        )}

        {/* Right: AI Chat — side panel on desktop, slide-over drawer on mobile */}
        <div className={`flex flex-col fixed inset-y-0 right-0 z-50 w-full max-w-sm shadow-2xl transition-transform duration-300 lg:static lg:w-96 lg:max-w-none lg:z-auto lg:shadow-none lg:translate-x-0 ${chatOpen ? "translate-x-0" : "translate-x-full lg:translate-x-0"}`}
          style={{ borderLeft: "1px solid var(--hairline)", background: "var(--chat-bg)" }}>
          <div className="p-4 flex items-center gap-3" style={{ borderBottom: "1px solid var(--hairline)" }}>
            <div className="neo-accent w-10 h-10 rounded-full flex items-center justify-center">
              <Bot size={18} className="text-white" />
            </div>
            <div>
              <div className="text-sm font-bold text-slate-800">AI Advisor</div>
              <div className="text-xs text-emerald-600 flex items-center gap-1">
                <div className="w-1.5 h-1.5 rounded-full bg-emerald-500" /> Online
              </div>
            </div>
            <button onClick={() => setChatOpen(false)}
              className="lg:hidden ml-auto w-9 h-9 rounded-xl flex items-center justify-center text-slate-500 neo-button">
              <X size={16} />
            </button>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto p-4 space-y-4"
            style={{ scrollbarWidth: "none" }}>
            {messages.map((m, i) => (
              <div key={i} className={`flex gap-2 ${m.role === "user" ? "flex-row-reverse" : ""}`}>
                {m.role === "ai" && (
                  <div className="neo-accent w-7 h-7 rounded-full shrink-0 flex items-center justify-center">
                    <Bot size={14} className="text-white" />
                  </div>
                )}
                <div className={`max-w-[85%] px-3.5 py-2.5 rounded-2xl text-xs leading-relaxed ${m.role === "ai" ? "neo-raised-sm text-slate-700" : "neo-accent text-white"}`}>
                  {m.text}
                </div>
              </div>
            ))}
            {loading && (
              <div className="flex gap-2">
                <div className="neo-accent w-7 h-7 rounded-full shrink-0 flex items-center justify-center">
                  <Bot size={14} className="text-white" />
                </div>
                <div className="neo-raised-sm px-4 py-3 rounded-2xl flex items-center gap-1">
                  {[0, 1, 2].map((i) => (
                    <div key={i} className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-bounce"
                      style={{ animationDelay: `${i * 0.15}s` }} />
                  ))}
                </div>
              </div>
            )}
            <div ref={bottomRef} />
          </div>

          {/* Input */}
          <div className="p-4" style={{ borderTop: "1px solid var(--hairline)" }}>
            <div className="neo-pressed flex items-center gap-2 px-3 py-2 rounded-xl">
              <input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && sendMessage()}
                placeholder="Ask your AI advisor..."
                className="flex-1 bg-transparent outline-none text-xs text-slate-700 placeholder-slate-400"
                style={{ fontFamily: "'Inter', sans-serif" }}
              />
              <button onClick={sendMessage} disabled={!input.trim() || loading}
                className={`p-1.5 rounded-lg transition-all ${input.trim() && !loading ? "neo-accent" : "opacity-40"}`}>
                <SendHorizonal size={14} className={input.trim() && !loading ? "text-white" : "text-slate-400"} />
              </button>
            </div>
            <p className="text-[10px] text-slate-400 text-center mt-2">Ask about any opportunity or get personalized advice</p>
          </div>
        </div>
      </div>

      {/* Floating chat trigger (mobile only) */}
      {!chatOpen && (
        <button onClick={() => setChatOpen(true)}
          className="neo-accent lg:hidden fixed bottom-5 right-5 z-30 w-14 h-14 rounded-full flex items-center justify-center text-white">
          <Bot size={22} />
        </button>
      )}
    </div>
  );
}

/* ── Theme Toggle (light / dark) ── */
function ThemeToggle() {
  const [dark, setDark] = useState(false);

  // Apply stored preference on mount (defaults to light)
  useEffect(() => {
    const stored = localStorage.getItem("goe-theme");
    const isDark = stored === "dark";
    setDark(isDark);
    document.documentElement.classList.toggle("dark", isDark);
  }, []);

  const toggle = () => {
    setDark((prev) => {
      const next = !prev;
      document.documentElement.classList.toggle("dark", next);
      localStorage.setItem("goe-theme", next ? "dark" : "light");
      return next;
    });
  };

  return (
    <button
      onClick={toggle}
      aria-label="Toggle dark mode"
      title={dark ? "Switch to light mode" : "Switch to dark mode"}
      className="neo-button fixed bottom-5 left-5 z-[60] w-12 h-12 rounded-full flex items-center justify-center">
      {dark ? <Sun size={18} className="text-amber-400" /> : <Moon size={18} className="text-slate-600" />}
    </button>
  );
}

/* ── Root App ── */
export default function App() {
  const [screen, setScreen] = useState<Screen>("landing");
  const [profile, setProfile] = useState("");
  const [countries, setCountries] = useState<string[]>([]);
  const [degree, setDegree] = useState("");
  const [opportunities, setOpportunities] = useState<Opportunity[]>([]);
  const [oppError, setOppError] = useState<string | null>(null);

  // Keep document title in sync (favicon is set statically in index.html)
  useEffect(() => {
    document.title = "Global Opportunity Engine";
  }, []);

  const renderScreen = () => {
    if (screen === "landing") return <LandingPage onStart={() => setScreen("profile")} />;
    if (screen === "profile") return <ProfilePage value={profile} onChange={setProfile} onNext={() => setScreen("country")} />;
    if (screen === "country") return <CountryPage countries={countries} setCountries={setCountries} degree={degree} setDegree={setDegree} onNext={() => setScreen("analyzing")} />;
    if (screen === "analyzing") return (
      <AnalyzingPage
        profile={profile}
        countries={countries}
        degree={degree}
        onDone={(opps, error) => { setOpportunities(opps); setOppError(error); setScreen("dashboard"); }}
      />
    );
    return <DashboardPage opportunities={opportunities} oppError={oppError} />;
  };

  return (
    <>
      {renderScreen()}
      <ThemeToggle />
    </>
  );
}
