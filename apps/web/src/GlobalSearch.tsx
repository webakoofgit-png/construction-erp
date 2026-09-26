import { useEffect, useState, type KeyboardEvent } from "react";
import { Search } from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "./auth";
import { api } from "./lib/api";
import { canAccessPath } from "./lib/permissions";
import { ProjectSwitcher } from "./ProjectSwitcher";

type SearchResult = { id: string; title: string; subtitle: string; type: string; to: string };
const modules: SearchResult[] = ["Dashboard:/","Projects:/projects","Project Templates:/project-templates","Tasks & Actions:/tasks","Daily Work Plan:/daily-work-plan","BOQ & Budget:/boq","Schedule:/schedule","Change Orders:/change-orders","Site Progress:/progress","DPR Photos:/dpr-photos","Photo Gallery:/photo-gallery","Quality & Safety:/quality","Corrective Actions:/corrective-actions","Materials:/materials","Inventory:/inventory","Procurement:/procurement","Contractors:/contractors","Labour:/labour","Machinery:/machinery","Expenses:/expenses","Client Billing:/client-billing","Payments:/payments","Cash Flow:/cash-flow","Collections:/collections","Analytics:/analytics","Team & Roles:/team","Documents:/documents","Approvals:/approvals","Reports:/reports","Settings:/settings"].map((item) => { const [title, to] = item.split(":"); return { id: `module-${to}`, title, subtitle: "Open module", type: "Module", to }; });

export function GlobalSearch() {
  const { session } = useAuth(); const navigate = useNavigate(); const [query, setQuery] = useState(""); const [results, setResults] = useState<SearchResult[]>([]); const [isOpen, setIsOpen] = useState(false); const [isSearching, setIsSearching] = useState(false); const [error, setError] = useState("");
  useEffect(() => {
    if (query.trim().length < 2) { setResults([]); setIsOpen(false); setError(""); setIsSearching(false); return; }
    const searchTerms = query.trim().toLowerCase().split(/\s+/); const visibleModules = modules.filter(module => canAccessPath(session!.role, module.to)); const moduleMatches = visibleModules.filter((module) => searchTerms.every((term) => module.title.toLowerCase().includes(term)));
    setIsOpen(true); setIsSearching(true); setError(""); setResults(moduleMatches);
    const timeout = window.setTimeout(() => { void api<{ results: SearchResult[] }>(`/search?q=${encodeURIComponent(query.trim())}`, {}, session!.token).then((result) => setResults([...moduleMatches, ...result.results.filter((item) => !moduleMatches.some((module) => module.to === item.to && module.title === item.title))])).catch(() => setError("Some record results are temporarily unavailable.")).finally(() => setIsSearching(false)); }, 220);
    return () => window.clearTimeout(timeout);
  }, [query, session]);
  const close = () => { setIsOpen(false); setQuery(""); setResults([]); };
  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => { if (event.key === "Enter" && results[0]) { event.preventDefault(); navigate(results[0].to); close(); } if (event.key === "Escape") close(); };
  return <div className="global-search"><ProjectSwitcher/><label><Search size={18} /><input value={query} onChange={(event) => setQuery(event.target.value)} onKeyDown={onKeyDown} onFocus={() => query.length >= 2 && setIsOpen(true)} placeholder="Search every module and record" /></label>{isOpen && <div className="search-results">{results.length ? <>{results.map((result) => <Link key={result.id} to={result.to} onClick={close}><span><strong>{result.title}</strong><small>{result.subtitle}</small></span><b>{result.type}</b></Link>)}{isSearching && <p>Searching more records…</p>}{error && <p>{error}</p>}</> : isSearching ? <p>Searching workspace…</p> : error ? <p>{error}</p> : <p>No matching records found.</p>}</div>}</div>;
}
