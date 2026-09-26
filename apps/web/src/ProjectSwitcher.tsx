import { useEffect, useState } from "react";
import { Building2 } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "./auth";
import { api } from "./lib/api";
type Project = { id: string; name: string; code: string };
export function ProjectSwitcher() { const { session } = useAuth(); const navigate = useNavigate(); const [projects, setProjects] = useState<Project[]>([]); useEffect(() => { void api<{ projects: Project[] }>("/projects", {}, session!.token).then(data => setProjects(data.projects)).catch(() => undefined); }, []); return <label className="project-switcher"><Building2 size={16}/><select aria-label="Switch project" defaultValue="" onChange={event => { if (event.target.value) navigate(`/projects/${event.target.value}`); }}><option value="">All projects</option>{projects.map(project => <option key={project.id} value={project.id}>{project.code} · {project.name}</option>)}</select></label>; }
