import { useEffect, useState, type FormEvent } from "react";
import { Download, FileText, Plus, Upload } from "lucide-react";
import { useAuth } from "./auth";
import { api } from "./lib/api";
import "./documents.css";

type Document = { id: string; title: string; fileName: string; category: string; size: number; version: number; status: "DRAFT" | "SUBMITTED" | "APPROVED" | "SUPERSEDED"; parentDocumentId?: string | null; createdAt: string; project?: { name: string; code: string } };
type Project = { id: string; name: string; code: string };
const apiBaseUrl = import.meta.env.VITE_API_URL ?? "http://localhost:4000/api";

export function DocumentsPage() {
  const { session } = useAuth();
  const [documents, setDocuments] = useState<Document[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [error, setError] = useState("");
  const [downloadingId, setDownloadingId] = useState("");
  const load = async () => {
    try {
      const [docs, projectData] = await Promise.all([api<{ documents: Document[] }>("/documents", {}, session!.token), api<{ projects: Project[] }>("/projects", {}, session!.token)]);
      setDocuments(docs.documents); setProjects(projectData.projects);
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Unable to load documents"); }
  };
  useEffect(() => { void load(); }, []);

  async function upload(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError("");
    const form = new FormData(event.currentTarget); const file = form.get("file") as File;
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) { setError("Files must be smaller than 5 MB"); return; }
    const contentBase64 = await new Promise<string>((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result).split(",")[1] ?? ""); reader.onerror = reject; reader.readAsDataURL(file); });
    try {
      await api("/documents", { method: "POST", body: JSON.stringify({ title: String(form.get("title")), category: String(form.get("category")), projectId: String(form.get("projectId")) || undefined, parentDocumentId: String(form.get("parentDocumentId")) || undefined, fileName: file.name, contentType: file.type || "application/octet-stream", contentBase64 }) }, session!.token);
      setShowForm(false); await load();
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Unable to upload document"); }
  }

  async function download(document: Document) {
    setError(""); setDownloadingId(document.id);
    try {
      const response = await fetch(`${apiBaseUrl}/documents/${document.id}/file`, { headers: { Authorization: `Bearer ${session!.token}` } });
      if (!response.ok) throw new Error("This document file is not available. Upload a new file to replace it.");
      const fileUrl = URL.createObjectURL(await response.blob()); const anchor = window.document.createElement("a"); anchor.href = fileUrl; anchor.download = document.fileName; anchor.click(); URL.revokeObjectURL(fileUrl);
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Unable to download document"); }
    finally { setDownloadingId(""); }
  }
  async function updateStatus(document: Document, status: Document["status"]) { try { await api(`/documents/${document.id}/status`, { method: "PATCH", body: JSON.stringify({ status }) }, session!.token); await load(); } catch (caught) { setError(caught instanceof Error ? caught.message : "Unable to update document status"); } }

  return <>
    <header className="page-heading"><div><p className="eyebrow">Project records</p><h1>Documents & attachments</h1><p className="muted">Store drawings, contracts, invoices, and downloadable site evidence.</p></div><button className="primary-button" onClick={() => setShowForm(true)}><Plus size={16}/> Upload document</button></header>
    {error && <p className="form-error">{error}</p>}
    {showForm && <section className="card document-form"><form onSubmit={upload}><input name="title" placeholder="Document title" required/><select name="category">{["DRAWING", "CONTRACT", "QUOTATION", "PURCHASE_DOCUMENT", "INVOICE", "BILLING_DOCUMENT", "SITE_PHOTO", "OTHER"].map(item => <option key={item}>{item.replaceAll("_", " ")}</option>)}</select><select name="projectId" defaultValue=""><option value="">Workspace document</option>{projects.map(project => <option key={project.id} value={project.id}>{project.code} · {project.name}</option>)}</select><select name="parentDocumentId" defaultValue=""><option value="">New document</option>{documents.filter(document => document.status !== "SUPERSEDED").map(document => <option key={document.id} value={document.id}>New version of: {document.title} v{document.version}</option>)}</select><input name="file" type="file" required/><button className="primary-button"><Upload size={16}/> Upload</button></form></section>}
    <section className="card document-list">{documents.map(document => <div className="document-row" key={document.id}><FileText size={20}/><span><strong>{document.title} · v{document.version}</strong><small>{document.fileName} · {document.category.replaceAll("_", " ")} · {document.project?.name || "Workspace"}</small></span><small>{(document.size / 1024).toFixed(0)} KB · {new Date(document.createdAt).toLocaleDateString("en-IN")}</small><select value={document.status} onChange={event => void updateStatus(document, event.target.value as Document["status"])}><option value="DRAFT">Draft</option><option value="SUBMITTED">Submitted</option><option value="APPROVED">Approved</option><option value="SUPERSEDED">Superseded</option></select><button className="document-download" onClick={() => void download(document)} disabled={downloadingId === document.id}><Download size={16}/>{downloadingId === document.id ? "Preparing…" : "Download"}</button></div>)}{!documents.length && <p className="muted">No documents uploaded yet.</p>}</section>
  </>;
}
