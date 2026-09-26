const apiBaseUrl = import.meta.env.VITE_API_URL ?? "http://localhost:4000/api";
import { queueRequest } from "./offlineQueue";

export class ApiError extends Error {
  constructor(message: string) {
    super(message);
  }
}

export async function api<T>(path: string, options: RequestInit = {}, token?: string): Promise<T> {
  let response: Response;
  try { response = await fetch(`${apiBaseUrl}${path}`, {
    ...options,
    headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}), ...options.headers }
  }); } catch (error) { if (token && options.method && !["GET","HEAD"].includes(options.method)) { queueRequest({ path, method: options.method, body: String(options.body ?? ""), token }); throw new ApiError("Saved offline. This entry will sync automatically when you reconnect."); } throw error; }
  const body = await response.json().catch(() => ({}));
  if (response.status === 401 && token) window.dispatchEvent(new Event("kravient-session-expired"));
  if (!response.ok) throw new ApiError(body.error ?? "Something went wrong");
  return body as T;
}
