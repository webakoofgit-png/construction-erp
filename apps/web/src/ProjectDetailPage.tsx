import { useEffect, useState } from "react";
import { AlertTriangle, ArrowLeft, HardHat, Package, Users } from "lucide-react";
import { Link, useParams } from "react-router-dom";
import { useAuth } from "./auth";
import { api } from "./lib/api";
import "./project-detail.css";

type Overview = {
  project: { name: string; code: string; status: string; sites: { name: string }[]; workOrders: { title: string; status: string; contractor: { name: string } }[]; dailyReports: { reportDate: string; summary: string }[]; siteIssues: { title: string; severity: string }[] };
  summary: { budget: number; cost: number; billed: number; paid: number; progress: number; outstanding: number };
  equipment: { equipment: { name: string; assetCode: string; status: string }; projectSite?: { name: string } }[];
  materialStock: { name: string; unit: string; planned: number; available: number; minimum: number }[];
};
type QualitySummary = { critical: number; overdue: number };
const money = (value: number) => `₹${Math.round(value).toLocaleString("en-IN")}`;

export function ProjectDetailPage() {
  const { projectId } = useParams();
  const { session } = useAuth();
  const [data, setData] = useState<Overview | null>(null);
  const [qualitySummary, setQualitySummary] = useState<QualitySummary | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!projectId || !session) return;
    void api<Overview>(`/projects/${projectId}/overview`, {}, session.token).then(setData).catch((caughtError) => setError(caughtError instanceof Error ? caughtError.message : "Unable to load project overview"));
    void api<{ summary: QualitySummary }>(`/project-quality/${projectId}`, {}, session.token).then((result) => setQualitySummary(result.summary)).catch(() => setQualitySummary(null));
  }, [projectId, session]);

  if (error) return <p className="form-error">{error}</p>;
  if (!data) return <section className="empty"><h1>Loading project overview…</h1></section>;
  const qualityCounts = qualitySummary && (qualitySummary.critical || qualitySummary.overdue) ? `${qualitySummary.critical} critical · ${qualitySummary.overdue} overdue` : "All clear";

  return <>
    <Link className="back-link" to="/projects"><ArrowLeft size={16} /> Back to projects</Link>
    <header className="page-heading project-detail-heading">
      <div><p className="eyebrow">{data.project.code} · {data.project.status}</p><h1>{data.project.name}</h1><p className="muted">{data.project.sites.map((site) => site.name).join(" · ") || "No site added"}</p></div>
      <div className="project-detail-actions"><Link className="text-button" to={`/projects/${projectId}/quality`}>Quality &amp; Safety <span className="quality-count">{qualityCounts}</span></Link><Link className="primary-button" to="/analytics">Open analytics</Link></div>
    </header>
    <section className="detail-metrics">
      <article className="card"><small>BOQ progress</small><strong>{data.summary.progress}%</strong><i><b style={{ width: `${data.summary.progress}%` }} /></i></article>
      <article className="card"><small>Budget / cost</small><strong>{money(data.summary.cost)}</strong><span>of {money(data.summary.budget)}</span></article>
      <article className="card"><small>Client collections</small><strong>{money(data.summary.paid)}</strong><span>{money(data.summary.outstanding)} outstanding</span></article>
      <article className="card"><small>Active site risks</small><strong>{data.project.siteIssues.length}</strong><span>Open issues to resolve</span></article>
    </section>
    <section className="detail-grid">
      <article className="card"><p className="eyebrow">Recent site progress</p><h2>Daily reports</h2>{data.project.dailyReports.length ? data.project.dailyReports.map((report) => <div className="detail-row" key={report.reportDate}><strong>{new Date(report.reportDate).toLocaleDateString("en-IN")}</strong><span>{report.summary}</span></div>) : <p className="muted">No progress reports recorded.</p>}<Link className="text-button" to="/progress">View site progress</Link></article>
      <article className="card"><p className="eyebrow">Project risks</p><h2>Open issues</h2>{data.project.siteIssues.length ? data.project.siteIssues.map((issue) => <div className="detail-risk" key={issue.title}><AlertTriangle size={16} /><span><strong>{issue.title}</strong><small>{issue.severity} priority</small></span></div>) : <p className="muted">No open risks recorded.</p>}<Link className="text-button" to="/notifications">View notifications</Link></article>
    </section>
    <section className="detail-grid second">
      <article className="card"><p className="eyebrow"><Package size={14} /> Materials</p><h2>Required project stock</h2>{data.materialStock.map((material) => <div className="detail-row material" key={material.name}><span><strong>{material.name}</strong><small>{material.available} {material.unit} available · {material.planned} planned</small></span><b className={material.available < material.minimum ? "stock-low" : ""}>{material.available < material.minimum ? "Low stock" : "In stock"}</b></div>)}{!data.materialStock.length && <p className="muted">No material requirements set.</p>}<Link className="text-button" to="/materials">View materials</Link></article>
      <article className="card"><p className="eyebrow"><HardHat size={14} /> Site resources</p><h2>People &amp; equipment</h2>{data.project.workOrders.map((order) => <div className="detail-row" key={order.title}><span><strong>{order.title}</strong><small>{order.contractor.name} · {order.status}</small></span></div>)}{data.equipment.map((item) => <div className="detail-row" key={item.equipment.assetCode}><span><strong>{item.equipment.name}</strong><small>{item.equipment.assetCode} · {item.projectSite?.name || "Project assignment"}</small></span></div>)}{!data.project.workOrders.length && !data.equipment.length && <p className="muted">No contractor or equipment assignments.</p>}<Link className="text-button" to="/machinery"><Users size={14} /> Manage resources</Link></article>
    </section>
  </>;
}
