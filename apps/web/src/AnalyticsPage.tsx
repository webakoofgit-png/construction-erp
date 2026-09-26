import { useEffect, useState } from "react";
import { AlertTriangle, ArrowDownRight, ChartNoAxesCombined, Landmark, Wallet } from "lucide-react";
import { useAuth } from "./auth";
import { api } from "./lib/api";
import "./analytics.css";

type Warning = { level: "warning" | "info" | "critical"; message: string };
type ProjectAnalytics = { id: string; name: string; code: string; budget: number; actualCost: number; committedCost: number; forecastCost: number; plannedRevenue: number; billed: number; paymentsReceived: number; outstandingReceivables: number; expectedProfit: number; profitMargin: number | null; budgetVariance: number | null; categories: { name: string; amount: number; share: number }[]; warnings: Warning[] };
type Analytics = { portfolio: { budget: number; actualCost: number; committedCost: number; plannedRevenue: number; billed: number; paymentsReceived: number; outstandingReceivables: number; expectedProfit: number }; projects: ProjectAnalytics[] };
const money = (value: number) => `₹${Math.round(value).toLocaleString("en-IN")}`;

export function AnalyticsPage() {
  const { session } = useAuth();
  const [data, setData] = useState<Analytics | null>(null);
  const [error, setError] = useState("");

  useEffect(() => { void (async () => { try { setData(await api<Analytics>("/analytics/profitability", {}, session!.token)); } catch (caughtError) { setError(caughtError instanceof Error ? caughtError.message : "Unable to load profitability data"); } })(); }, []);
  if (error) return <p className="form-error">{error}</p>;
  if (!data) return <section className="empty"><h1>Loading analytics…</h1></section>;
  const margin = data.portfolio.plannedRevenue > 0 ? (data.portfolio.expectedProfit / data.portfolio.plannedRevenue) * 100 : null;
  const selected = data.projects[0];
  return <><header className="page-heading"><div><p className="eyebrow">Financial health</p><h1>Profitability & analytics</h1><p className="muted">A live view of project costs, collections, and projected margins.</p></div></header>
    <section className="metric-grid analytics-metrics">
      <article className="card metric"><p>BOQ budget</p><strong>{money(data.portfolio.budget)}</strong><span>Approved active BOQs</span></article>
      <article className="card metric"><p>Actual cost</p><strong>{money(data.portfolio.actualCost)}</strong><span>Received material, approved expenses, labour and contractor bills</span></article>
      <article className="card metric"><p>Forecast profit</p><strong className={data.portfolio.expectedProfit < 0 ? "negative" : ""}>{money(data.portfolio.expectedProfit)}</strong><span>{margin === null ? "Set contract value to calculate margin" : `${margin.toFixed(1)}% projected margin`}</span></article>
      <article className="card metric"><p>Cash received</p><strong>{money(data.portfolio.paymentsReceived)}</strong><span>{money(data.portfolio.outstandingReceivables)} client receivables open</span></article>
    </section>
    {data.projects.length === 0 ? <section className="empty"><h2>No project data yet</h2><p>Create a project, set its contract value, and add a BOQ to see profitability.</p></section> : <>
      <section className="analytics-grid"><article className="card"><div className="card-title"><div><p className="eyebrow">Project forecast</p><h2>{selected.name}</h2></div><span className="badge active">{selected.code}</span></div><div className="forecast-stack"><div><span>Contract value</span><strong>{money(selected.plannedRevenue)}</strong></div><div><span>Forecast cost</span><strong>{money(selected.forecastCost)}</strong></div><div className={selected.expectedProfit < 0 ? "forecast-negative" : "forecast-positive"}><span>Expected profit</span><strong>{money(selected.expectedProfit)}</strong><small>{selected.profitMargin === null ? "No revenue forecast" : `${selected.profitMargin.toFixed(1)}% margin`}</small></div></div></article><article className="card"><p className="eyebrow">Cash flow</p><h2>Billing and collections</h2><div className="cash-list"><div><Landmark size={18}/><span><small>Client billed</small><strong>{money(selected.billed)}</strong></span></div><div><ArrowDownRight size={18}/><span><small>Payments received</small><strong>{money(selected.paymentsReceived)}</strong></span></div><div><Wallet size={18}/><span><small>Open receivables</small><strong>{money(selected.outstandingReceivables)}</strong></span></div></div></article></section>
      <section className="analytics-grid second-row"><article className="card"><p className="eyebrow">Cost breakdown</p><h2>BOQ budget by category</h2><div className="category-list">{selected.categories.map(category => <div key={category.name}><div><span>{category.name}</span><strong>{money(category.amount)}</strong></div><div className="category-bar"><i style={{ width: `${category.share}%` }} /></div><small>{category.share.toFixed(1)}% of total budget</small></div>)}</div></article><article className="card"><p className="eyebrow">Cost position</p><h2>Budget, commitments, actuals</h2><div className="cost-comparison"><div><span>Budget</span><strong>{money(selected.budget)}</strong></div><div><span>Committed orders</span><strong>{money(selected.committedCost)}</strong></div><div><span>Actual recorded cost</span><strong>{money(selected.actualCost)}</strong></div><div><span>Budget variance</span><strong className={(selected.budgetVariance ?? 0) > 0 ? "negative" : ""}>{selected.budgetVariance === null ? "—" : `${selected.budgetVariance.toFixed(1)}%`}</strong></div></div></article></section>
      <section className="card project-health"><div className="card-title"><div><p className="eyebrow">Project health</p><h2>Warnings that need attention</h2></div><ChartNoAxesCombined size={22}/></div>{data.projects.flatMap(project => project.warnings.map((warning, index) => <div className={`health-warning ${warning.level}`} key={`${project.id}-${index}`}><AlertTriangle size={17}/><span><strong>{project.name}</strong>{warning.message}</span></div>)).slice(0, 8)}{data.projects.every(project => project.warnings.length === 0) && <p className="muted">No financial warnings right now.</p>}</section>
    </>}</>;
}
