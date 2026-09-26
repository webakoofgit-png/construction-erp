import { useEffect, useState } from "react";
import { AlertTriangle, CircleAlert, ClipboardCheck, PackageSearch } from "lucide-react";
import { Link } from "react-router-dom";
import { useAuth } from "./auth";
import { api } from "./lib/api";
import { canAccessFinancials, canAccessPath } from "./lib/permissions";
import { RoleQuickActions } from "./RoleQuickActions";
import "./live-dashboard.css";

type DashboardData = { portfolio: { activeProjects: number; totalBudget: number | null; totalCost: number | null; budgetUsed: number | null; healthScore: number; overdueCollections: number | null; openActions: number }; projects: { id: string; name: string; code: string; status: string; budget: number | null; recordedCost: number | null; progress: number; health: number; healthStatus: "GOOD" | "WATCH" | "AT_RISK"; healthFactors: string[] }[]; alerts: { level: "critical" | "warning"; title: string; detail: string }[]; actions: { lowStock: number; purchaseRequests: number; reports: number; risks: number } };
const money = (value: number | null) => value === null ? "—" : `₹${Math.round(value).toLocaleString("en-IN")}`;

export function LiveDashboard() {
  const { session } = useAuth();
  const [data, setData] = useState<DashboardData | null>(null);
  const [error, setError] = useState("");
  const canSeeFinance = canAccessFinancials(session!.role);

  useEffect(() => { void api<DashboardData>("/dashboard", {}, session!.token).then(setData).catch(error => setError(error instanceof Error ? error.message : "Unable to load dashboard")); }, [session]);
  if (error) return <p className="form-error">{error}</p>;
  if (!data) return <section className="empty"><h1>Loading portfolio health…</h1></section>;

  const healthLabel = data.portfolio.healthScore >= 80 ? "Healthy" : data.portfolio.healthScore >= 60 ? "Watch" : "At risk";
  return <>
    <header className="page-heading"><div><p className="eyebrow">Live portfolio overview</p><h1>Project health dashboard</h1><p className="muted">{canSeeFinance ? "Current costs, progress, risks, and actions across your workspace." : "Current site progress, risks, and actions across your assigned projects."}</p></div><Link className="primary-button" to="/projects">View projects</Link></header>
    <RoleQuickActions role={session!.role}/>
    <section className="live-summary">
      <article className="card live-health"><div className="live-score" style={{ background: `conic-gradient(#4d8b59 0 ${data.portfolio.healthScore}%, #e9eef0 ${data.portfolio.healthScore}% 100%)` }}><strong>{data.portfolio.healthScore}</strong></div><div><p className="eyebrow">Portfolio health</p><h2>{healthLabel}</h2><p>Calculated from active risks, low stock, and open actions.</p></div></article>
      <article className="card live-metric"><small>Active projects</small><strong>{data.portfolio.activeProjects}</strong><span>Across your workspace</span></article>
      {canSeeFinance ? <article className="card live-metric"><small>Budget used</small><strong>{(data.portfolio.budgetUsed ?? 0).toFixed(1)}%</strong><span>{money(data.portfolio.totalCost)} of {money(data.portfolio.totalBudget)}</span></article> : <article className="card live-metric"><small>Open site actions</small><strong>{data.portfolio.openActions}</strong><span>Items needing team attention</span></article>}
      {canSeeFinance && <article className="card live-metric"><small>Open actions</small><strong>{data.portfolio.openActions}</strong><span>{money(data.portfolio.overdueCollections)} overdue collections</span></article>}
    </section>
    <section className="live-grid"><article className="card"><div className="card-title"><div><p className="eyebrow">Project portfolio</p><h2>Live delivery status</h2></div>{canAccessPath(session!.role, "/analytics") && <Link className="text-button" to="/analytics">Open analytics</Link>}</div><table><thead><tr><th>Project</th><th>Progress</th>{canSeeFinance && <th>Budget / cost</th>}<th>Health &amp; risks</th></tr></thead><tbody>{data.projects.map(project => <tr key={project.id}><td><strong>{project.name}</strong><small>{project.code}</small><Link className="project-health-link" to={`/projects/${project.id}`}>Open project →</Link></td><td><div className="table-progress"><i style={{ width: `${project.progress}%` }}/></div><small>{project.progress}% reported</small></td>{canSeeFinance && <td>{money(project.budget)}<small>{money(project.recordedCost)} recorded</small></td>}<td><span className={`health ${project.healthStatus === "GOOD" ? "good" : project.healthStatus === "WATCH" ? "watch" : "risk"}`}>{project.health} · {project.healthStatus === "GOOD" ? "Good" : project.healthStatus === "WATCH" ? "Watch" : "At risk"}</span>{project.healthFactors.length ? <small className="health-reasons">{project.healthFactors.join(" · ")}</small> : <small className="health-reasons good-reason">On track with no active delivery risk.</small>}</td></tr>)}</tbody></table></article><article className="card"><p className="eyebrow">Action centre</p><h2>What needs attention?</h2><div className="live-alerts">{data.alerts.map((alert, index) => <div className={`live-alert ${alert.level}`} key={`${alert.title}-${index}`}>{alert.level === "critical" ? <CircleAlert size={18}/> : <AlertTriangle size={18}/>}<span><strong>{alert.title}</strong><small>{alert.detail}</small></span></div>)}{data.alerts.length === 0 && <p className="muted">No urgent alerts right now.</p>}</div><Link className="text-button" to="/notifications">View all notifications</Link></article></section>
    <section className="live-actions"><Link to="/inventory"><PackageSearch size={19}/><span><strong>{data.actions.lowStock}</strong> low-stock materials</span></Link>{canAccessPath(session!.role, "/procurement") && <Link to="/procurement"><ClipboardCheck size={19}/><span><strong>{data.actions.purchaseRequests}</strong> purchase actions</span></Link>}<Link to="/progress"><ClipboardCheck size={19}/><span><strong>{data.actions.reports}</strong> DPRs awaiting review</span></Link><Link to="/notifications"><AlertTriangle size={19}/><span><strong>{data.actions.risks}</strong> open site risks</span></Link></section>
  </>;
}
