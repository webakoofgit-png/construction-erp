import { useState, type FormEvent } from "react";
import { Bot, CornerDownLeft, Sparkles } from "lucide-react";
import { useAuth } from "./auth";
import { api } from "./lib/api";
import "./copilot.css";

type Reply = { answer: string; insights: string[]; sources: string[] };
type Message = { role: "assistant" | "user"; content: string; insights?: string[]; sources?: string[] };
const starterQuestions = ["Which materials need ordering this week?", "Show overdue client payments.", "Summarise site progress and risks.", "What is the budget and cost position?"];

export function CopilotPage() {
  const { session } = useAuth();
  const [messages, setMessages] = useState<Message[]>([{ role: "assistant", content: "Hi, I’m Kravient Copilot. I use your workspace records to surface construction risks, costs, materials, billing, and progress updates." }]);
  const [question, setQuestion] = useState("");
  const [isSending, setIsSending] = useState(false);
  async function ask(rawQuestion: string) { const cleanQuestion = rawQuestion.trim(); if (!cleanQuestion || isSending) return; setMessages(current => [...current, { role: "user", content: cleanQuestion }]); setQuestion(""); setIsSending(true); try { const reply = await api<Reply>("/copilot/ask", { method: "POST", body: JSON.stringify({ question: cleanQuestion }) }, session!.token); setMessages(current => [...current, { role: "assistant", content: reply.answer, insights: reply.insights, sources: reply.sources }]); } catch (caughtError) { setMessages(current => [...current, { role: "assistant", content: caughtError instanceof Error ? caughtError.message : "I couldn't retrieve that workspace information." }]); } finally { setIsSending(false); } }
  function submit(event: FormEvent<HTMLFormElement>) { event.preventDefault(); void ask(question); }
  return <><header className="page-heading"><div><p className="eyebrow">Construction intelligence</p><h1>Kravient Copilot</h1><p className="muted">Ask questions about the live records in your workspace.</p></div><span className="copilot-live"><Sparkles size={15}/> Data-aware assistant</span></header><section className="copilot-layout"><article className="card conversation"><div className="conversation-header"><Bot size={20}/><div><strong>Kravient Copilot</strong><small>Uses your permitted workspace data</small></div></div><div className="messages">{messages.map((message, index) => <div className={`message ${message.role}`} key={index}><p>{message.content}</p>{message.insights?.length ? <ul>{message.insights.map(insight => <li key={insight}>{insight}</li>)}</ul> : null}{message.sources?.length ? <small>Sources: {message.sources.join(" · ")}</small> : null}</div>)}{isSending && <div className="message assistant"><p>Reviewing your workspace records…</p></div>}</div><form className="copilot-form" onSubmit={submit}><input value={question} onChange={event => setQuestion(event.target.value)} placeholder="Ask about costs, materials, payments, or site risks" maxLength={500}/><button className="primary-button" disabled={isSending}><CornerDownLeft size={17}/> Ask</button></form></article><aside className="card copilot-starters"><p className="eyebrow">Start here</p><h2>Suggested questions</h2>{starterQuestions.map(starter => <button key={starter} onClick={() => void ask(starter)} disabled={isSending}>{starter}</button>)}<div><strong>How it works</strong><p>Copilot reads only data available to your role and does not make changes to project records.</p></div></aside></section></>;
}
