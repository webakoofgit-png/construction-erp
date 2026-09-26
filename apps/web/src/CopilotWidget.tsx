import { useState, type FormEvent } from "react";
import { Bot, MessageCircle, Send, X } from "lucide-react";
import { useAuth } from "./auth";
import { api } from "./lib/api";
import "./copilot-widget.css";

type Reply = { answer: string; insights: string[]; sources: string[] };
type Message = { role: "assistant" | "user"; content: string; insights?: string[] };
const starterQuestions = ["Which materials need ordering?", "Show outstanding client payments.", "Summarise site risks."];

export function CopilotWidget() {
  const { session } = useAuth();
  const [isOpen, setIsOpen] = useState(false);
  const [question, setQuestion] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [messages, setMessages] = useState<Message[]>([{ role: "assistant", content: "Hi, I’m Kravient Copilot. Ask me about costs, materials, payments, progress, or site risks." }]);
  async function ask(rawQuestion: string) { const cleanQuestion = rawQuestion.trim(); if (!cleanQuestion || isSending) return; setMessages(current => [...current, { role: "user", content: cleanQuestion }]); setQuestion(""); setIsSending(true); try { const reply = await api<Reply>("/copilot/ask", { method: "POST", body: JSON.stringify({ question: cleanQuestion }) }, session!.token); setMessages(current => [...current, { role: "assistant", content: reply.answer, insights: reply.insights }]); } catch (caughtError) { setMessages(current => [...current, { role: "assistant", content: caughtError instanceof Error ? caughtError.message : "I couldn't retrieve that information." }]); } finally { setIsSending(false); } }
  function submit(event: FormEvent<HTMLFormElement>) { event.preventDefault(); void ask(question); }
  return <div className="copilot-widget">{isOpen && <section className="copilot-panel card"><header><div><Bot size={20}/><span><strong>Kravient Copilot</strong><small>Workspace assistant</small></span></div><button className="widget-close" onClick={() => setIsOpen(false)} aria-label="Close Copilot"><X size={18}/></button></header><div className="widget-messages">{messages.map((message, index) => <div className={`widget-message ${message.role}`} key={index}><p>{message.content}</p>{message.insights?.length ? <ul>{message.insights.map(insight => <li key={insight}>{insight}</li>)}</ul> : null}</div>)}{isSending && <div className="widget-message assistant"><p>Reviewing workspace data…</p></div>}</div>{messages.length === 1 && <div className="widget-starters">{starterQuestions.map(starter => <button key={starter} onClick={() => void ask(starter)}>{starter}</button>)}</div>}<form onSubmit={submit}><input value={question} onChange={event => setQuestion(event.target.value)} placeholder="Ask Copilot…" maxLength={500}/><button className="primary-button" disabled={isSending} aria-label="Send question"><Send size={16}/></button></form></section>}<button className="copilot-launcher" onClick={() => setIsOpen(open => !open)} aria-label="Open Kravient Copilot"><MessageCircle size={23}/><span>Ask Copilot</span></button></div>;
}
