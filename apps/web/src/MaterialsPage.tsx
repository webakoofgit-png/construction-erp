import { useEffect, useState, type FormEvent } from "react";
import { AlertTriangle, PackagePlus, Plus } from "lucide-react";
import { useAuth } from "./auth";
import { api } from "./lib/api";
import "./materials.css";

export type Material = { id: string; name: string; sku: string; unit: string; minimumStock: string; availableQuantity: number; plannedQuantity: number };

export function MaterialsPage() {
  const { session } = useAuth();
  const [materials, setMaterials] = useState<Material[]>([]);
  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState("");
  const load = async () => { try { const result = await api<{ materials: Material[] }>("/materials", {}, session!.token); setMaterials(result.materials); } catch (caughtError) { setError(caughtError instanceof Error ? caughtError.message : "Unable to load materials"); } };
  useEffect(() => { void load(); }, []);
  async function createMaterial(event: FormEvent<HTMLFormElement>) { event.preventDefault(); const form = new FormData(event.currentTarget); try { await api("/materials", { method: "POST", body: JSON.stringify({ name: String(form.get("name")), sku: String(form.get("sku")), unit: String(form.get("unit")), minimumStock: Number(form.get("minimumStock")) }) }, session!.token); setIsCreating(false); await load(); } catch (caughtError) { setError(caughtError instanceof Error ? caughtError.message : "Unable to add material"); } }
  return <><header className="page-heading"><div><p className="eyebrow">Materials master</p><h1>Materials</h1><p className="muted">Manage approved materials, planned requirements, and stock thresholds.</p></div><button className="primary-button" onClick={() => setIsCreating(true)}><Plus size={16}/> Add material</button></header>{error && <p className="form-error">{error}</p>}{isCreating && <section className="card material-form"><h2>New material</h2><form onSubmit={createMaterial}><input name="name" required placeholder="Material name"/><input name="sku" required placeholder="SKU / code"/><input name="unit" required placeholder="Unit (e.g. Bag)"/><input name="minimumStock" type="number" min="0" step="0.001" required placeholder="Minimum stock"/><button className="primary-button">Add material</button><button type="button" className="text-button" onClick={() => setIsCreating(false)}>Cancel</button></form></section>}<section className="card"><div className="card-title"><div><p className="eyebrow">Stock overview</p><h2>Available material</h2></div><span className="material-count">{materials.length} items</span></div><table><thead><tr><th>Material</th><th>SKU</th><th>Planned requirement</th><th>Available stock</th><th>Minimum level</th><th>Status</th></tr></thead><tbody>{materials.length === 0 ? <tr><td colSpan={6} className="empty-cell"><PackagePlus size={25}/><br/>No materials yet. Add the first approved material.</td></tr> : materials.map(material => { const lowStock = material.availableQuantity <= Number(material.minimumStock); return <tr key={material.id}><td><strong>{material.name}</strong><small className="table-subtitle">{material.unit}</small></td><td>{material.sku}</td><td>{material.plannedQuantity.toLocaleString("en-IN")} {material.unit}</td><td><strong>{material.availableQuantity.toLocaleString("en-IN")} {material.unit}</strong></td><td>{Number(material.minimumStock).toLocaleString("en-IN")} {material.unit}</td><td>{lowStock ? <span className="stock-alert"><AlertTriangle size={13}/> Reorder</span> : <span className="health good">In stock</span>}</td></tr>; })}</tbody></table></section></>;
}
