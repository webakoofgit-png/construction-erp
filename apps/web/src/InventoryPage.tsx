import { useEffect, useState, type FormEvent } from "react";
import { ArrowDownToLine, ArrowUpFromLine } from "lucide-react";
import { useAuth } from "./auth";
import { api } from "./lib/api";
import type { Material } from "./MaterialsPage";
import "./materials.css";

type Project = { id: string; name: string; sites: { id: string; name: string }[] };
type Transaction = { id: string; type: "RECEIPT" | "ISSUE" | "ADJUSTMENT"; quantity: string; reference?: string; createdAt: string; material: { name: string; unit: string }; projectSite: { name: string } };

export function InventoryPage() {
  const { session } = useAuth();
  const [materials, setMaterials] = useState<Material[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [error, setError] = useState("");
  const [isRecording, setIsRecording] = useState(false);
  const load = async () => { try { const [materialResult, projectResult, transactionResult] = await Promise.all([api<{ materials: Material[] }>("/materials", {}, session!.token), api<{ projects: Project[] }>("/projects", {}, session!.token), api<{ transactions: Transaction[] }>("/materials/transactions", {}, session!.token)]); setMaterials(materialResult.materials); setProjects(projectResult.projects); setTransactions(transactionResult.transactions); } catch (caughtError) { setError(caughtError instanceof Error ? caughtError.message : "Unable to load inventory"); } };
  useEffect(() => { void load(); }, []);
  const sites = projects.flatMap(project => project.sites);
  async function recordMovement(event: FormEvent<HTMLFormElement>) { event.preventDefault(); const form = new FormData(event.currentTarget); const materialId = String(form.get("materialId")); try { await api(`/materials/${materialId}/transactions`, { method: "POST", body: JSON.stringify({ type: String(form.get("type")), quantity: Number(form.get("quantity")), projectSiteId: String(form.get("projectSiteId")), reference: String(form.get("reference")) || undefined }) }, session!.token); setIsRecording(false); await load(); } catch (caughtError) { setError(caughtError instanceof Error ? caughtError.message : "Unable to record stock movement"); } }
  return <><header className="page-heading"><div><p className="eyebrow">Site stock control</p><h1>Inventory</h1><p className="muted">Record material receipts and issues at project sites.</p></div><button className="primary-button" onClick={() => setIsRecording(true)}>Record movement</button></header>{error && <p className="form-error">{error}</p>}{isRecording && <section className="card material-form"><h2>Record stock movement</h2><form onSubmit={recordMovement}><select name="type" required><option value="RECEIPT">Material receipt</option><option value="ISSUE">Material issue</option></select><select name="materialId" required defaultValue=""><option value="" disabled>Select material</option>{materials.map(material => <option key={material.id} value={material.id}>{material.name}</option>)}</select><select name="projectSiteId" required defaultValue=""><option value="" disabled>Select site</option>{sites.map(site => <option key={site.id} value={site.id}>{site.name}</option>)}</select><input name="quantity" required type="number" min="0.001" step="0.001" placeholder="Quantity"/><input name="reference" placeholder="GRN / issue reference"/><button className="primary-button">Save movement</button><button type="button" className="text-button" onClick={() => setIsRecording(false)}>Cancel</button></form></section>}<section className="card"><div className="card-title"><div><p className="eyebrow">Movement ledger</p><h2>Recent stock activity</h2></div></div><table><thead><tr><th>Type</th><th>Material</th><th>Quantity</th><th>Site</th><th>Reference</th><th>Recorded</th></tr></thead><tbody>{transactions.length === 0 ? <tr><td colSpan={6} className="empty-cell">No stock movements recorded yet.</td></tr> : transactions.map(transaction => <tr key={transaction.id}><td>{transaction.type === "RECEIPT" ? <span className="movement receipt"><ArrowDownToLine size={13}/> Receipt</span> : <span className="movement issue"><ArrowUpFromLine size={13}/> Issue</span>}</td><td><strong>{transaction.material.name}</strong></td><td>{Number(transaction.quantity).toLocaleString("en-IN")} {transaction.material.unit}</td><td>{transaction.projectSite.name}</td><td>{transaction.reference ?? "—"}</td><td>{new Date(transaction.createdAt).toLocaleDateString("en-IN")}</td></tr>)}</tbody></table></section></>;
}
