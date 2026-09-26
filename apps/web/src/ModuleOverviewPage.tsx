import { Building2, ClipboardCheck, ClipboardList, HardHat, Landmark, ShoppingCart, Users } from "lucide-react";
import { Link } from "react-router-dom";
import { useAuth } from "./auth";
import { canAccessPath } from "./lib/permissions";
import "./module-overview.css";

type Module = { label: string; to: string };
type ModuleGroup = { title: string; description: string; icon: typeof Building2; modules: Module[] };

const moduleGroups: ModuleGroup[] = [
  { title: "Planning", description: "Set up scope, budgets and delivery timelines.", icon: ClipboardList, modules: [{ label: "Project Templates", to: "/project-templates" }, { label: "BOQ & Budget", to: "/boq" }, { label: "Schedule", to: "/schedule" }, { label: "Change Orders", to: "/change-orders" }] },
  { title: "Site Operations", description: "Run daily site work, progress and quality control.", icon: HardHat, modules: [{ label: "Daily Work Plan", to: "/daily-work-plan" }, { label: "Site Progress", to: "/progress" }, { label: "DPR Photos", to: "/dpr-photos" }, { label: "Quality & Safety", to: "/quality" }, { label: "Corrective Actions", to: "/corrective-actions" }] },
  { title: "Procurement & Resources", description: "Manage material supply, workforce and equipment.", icon: ShoppingCart, modules: [{ label: "Materials", to: "/materials" }, { label: "Inventory", to: "/inventory" }, { label: "Procurement", to: "/procurement" }, { label: "Contractors", to: "/contractors" }, { label: "Labour", to: "/labour" }, { label: "Machinery", to: "/machinery" }] },
  { title: "Finance", description: "Control cost, billing, collections and profitability.", icon: Landmark, modules: [{ label: "Expenses", to: "/expenses" }, { label: "Client Billing", to: "/client-billing" }, { label: "Cash Flow", to: "/cash-flow" }, { label: "Collections", to: "/collections" }, { label: "Analytics", to: "/analytics" }] },
  { title: "Workspace", description: "Manage people, documents, approvals and reporting.", icon: Users, modules: [{ label: "Team & Roles", to: "/team" }, { label: "Documents", to: "/documents" }, { label: "Approvals", to: "/approvals" }, { label: "Reports", to: "/reports" }, { label: "Settings", to: "/settings" }] }
];

export function ModuleOverviewPage({ onChoose }: { onChoose: () => void }) {
  const { session } = useAuth();
  const visibleGroups = moduleGroups.map(group => ({ ...group, modules: group.modules.filter(module => canAccessPath(session!.role, module.to)) })).filter(group => group.modules.length);
  return <><header className="page-heading module-heading"><div><p className="eyebrow">Kravient Build workspace</p><h1>Choose a module</h1><p className="muted">All available tools are organised by the way your construction team works.</p></div>{canAccessPath(session!.role, "/projects") && <Link className="primary-button" to="/projects" onClick={onChoose}><Building2 size={16} /> Open projects</Link>}</header><section className="module-overview-grid">{visibleGroups.map((group) => { const Icon = group.icon; return <article className="card module-group-card" key={group.title}><div className="module-group-title"><span><Icon size={20} /></span><div><h2>{group.title}</h2><p>{group.description}</p></div></div><div className="module-links">{group.modules.map((module) => <Link key={module.to} to={module.to} onClick={onChoose}>{module.label}<span>→</span></Link>)}</div></article>; })}</section><section className="module-overview-footer"><ClipboardCheck size={18} /><span>Use the sidebar any time to move between modules. Your key daily tools stay at the top.</span></section></>;
}
