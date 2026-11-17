import { useEffect, useRef, useState } from 'react';
import { answerQuestion, SUGGESTIONS } from './assistantBrain';
import './assistant.css';

const WELCOME = '您好，我是链知助手，有什么可以帮您？';

// 产业名称 → 后端分片编码
const INDUSTRY_CODES = {
  集成电路: 'IC',
  电力装备: 'PE',
  '电力装备（含储能）': 'PE',
  储能产业: 'ES',
  生物医药: 'BM',
  人工智能: 'AI',
  算力产业: 'CP',
};

let messageSeed = 0;
const nextId = () => {
  messageSeed += 1;
  return `msg-${messageSeed}`;
};

async function fetchWithTimeout(url, options = {}, timeout = 12000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

export default function ChainAssistantPage({ selectedIndustry = '储能产业', data, onNavigate }) {
  const [messages, setMessages] = useState([
    { id: nextId(), role: 'assistant', text: WELCOME, suggestions: SUGGESTIONS },
  ]);
  const [input, setInput] = useState('');
  const [thinking, setThinking] = useState(false);
  const [engine, setEngine] = useState({
    mode: 'local',
    label: '本地引擎',
    detail: '后端未连接，使用内置规则引擎',
  });
  const bodyRef = useRef(null);
  const timerRef = useRef(null);
  const inputRef = useRef(null);

  useEffect(() => {
    inputRef.current?.focus();
    return () => clearTimeout(timerRef.current);
  }, []);

  useEffect(() => {
    const body = bodyRef.current;
    if (body) body.scrollTop = body.scrollHeight;
  }, [messages, thinking]);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const response = await fetchWithTimeout('/api/health', {}, 1500);
        if (!response.ok) throw new Error('health check failed');
        const health = await response.json();
        if (!alive) return;
        const count = (health.industries || []).find(
          (item) => item.code === (INDUSTRY_CODES[selectedIndustry] || 'ES'),
        );
        setEngine({
          mode: 'server',
          label: '数据服务已连接',
          detail: `${count ? `${count.label} ${count.companyCount} 家` : selectedIndustry} · 模板生成`,
        });
      } catch {
        if (alive) {
          setEngine({ mode: 'local', label: '本地引擎', detail: '后端未连接，使用内置规则引擎' });
        }
      }
    })();
    return () => {
      alive = false;
    };
  }, [selectedIndustry]);

  const askLocal = (text) =>
    answerQuestion(text, {
      industry: selectedIndustry,
      counts: data?.counts,
      companies: data?.companies,
    });

  const askServer = async (text) => {
    const response = await fetchWithTimeout(
      '/api/assistant/chat',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          question: text,
          industry: INDUSTRY_CODES[selectedIndustry] || 'ES',
        }),
      },
      20000,
    );
    if (!response.ok) throw new Error(`chat failed: ${response.status}`);
    return response.json();
  };

  const ask = (raw) => {
    const text = String(raw ?? input).trim();
    if (!text || thinking) return;

    setMessages((current) => [...current, { id: nextId(), role: 'user', text }]);
    setInput('');
    setThinking(true);

    const run = async () => {
      let payload;
      let mode = 'server';
      try {
        payload = await askServer(text);
      } catch {
        payload = askLocal(text);
        mode = 'local';
      }
      setEngine((current) => ({ ...current, mode: mode === 'server' ? 'server' : 'local' }));
      setMessages((current) => [
        ...current,
        {
          id: nextId(),
          role: 'assistant',
          text: payload.answer,
          bullets: payload.bullets,
          note: payload.note,
          citations: payload.citations,
          route: payload.route,
        },
      ]);
      setThinking(false);
    };

    timerRef.current = setTimeout(run, 420);
  };

  const handleKeyDown = (event) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      ask();
    }
  };

  return (
    <section className="assistant-page" aria-label="链知智答">
      <div className="assistant-panel">
        <header className="assistant-head">
          <div className="assistant-avatar" aria-hidden="true">
            链
          </div>
          <div className="assistant-head-copy">
            <h1>链知智答</h1>
            <p>基于当前产业链数据与方法论文档回答问题，结论可回溯到环节与企业。</p>
          </div>
          <span className={`assistant-engine ${engine.mode}`} title={engine.detail}>
            <i />
            {engine.label}
          </span>
          <span className="assistant-chain">当前链 · {selectedIndustry}</span>
        </header>

        <div className="assistant-body" ref={bodyRef}>
          <div className="assistant-thread">
            {messages.map((message) => (
              <div key={message.id} className={`msg msg-${message.role}`}>
                {message.role === 'assistant' && (
                  <span className="msg-avatar" aria-hidden="true">
                    链
                  </span>
                )}
                <div className="msg-main">
                  <div className="msg-bubble">{message.text}</div>
                  {message.bullets?.length > 0 && (
                    <ul className="msg-list">
                      {message.bullets.map((item) => (
                        <li key={item}>{item}</li>
                      ))}
                    </ul>
                  )}
                  {message.note && <p className="msg-note">{message.note}</p>}
                  {message.citations?.length > 0 && (
                    <div className="msg-citations">
                      {message.citations.slice(0, 5).map((citation) => (
                        <span
                          key={`${citation.kind}-${citation.id}`}
                          className={`citation ${citation.kind}`}
                        >
                          {citation.label}
                        </span>
                      ))}
                    </div>
                  )}
                  {message.action && (
                    <button
                      type="button"
                      className="msg-action"
                      onClick={() => onNavigate?.(message.action.tab)}
                    >
                      {message.action.label} →
                    </button>
                  )}
                  {message.suggestions?.length > 0 && (
                    <div className="msg-suggestions">
                      {message.suggestions.map((item) => (
                        <button key={item} type="button" onClick={() => ask(item)}>
                          {item}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            ))}

            {thinking && (
              <div className="msg msg-assistant">
                <span className="msg-avatar" aria-hidden="true">
                  链
                </span>
                <div className="msg-main">
                  <div className="msg-bubble msg-typing" aria-label="正在生成回答">
                    <i />
                    <i />
                    <i />
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        <footer className="assistant-composer">
          <div className="composer-box">
            <textarea
              ref={inputRef}
              rows={1}
              value={input}
              placeholder="问问这条链：企业规模、环节分布、分层口径、某家企业的归属……"
              onChange={(event) => setInput(event.target.value)}
              onKeyDown={handleKeyDown}
            />
            <button
              type="button"
              className="composer-send"
              disabled={!input.trim() || thinking}
              onClick={() => ask()}
            >
              发送
            </button>
          </div>
          <p className="composer-hint">
            Enter 发送 · Shift + Enter 换行 · 回答优先由数据服务生成，服务不可用时自动回退本地引擎
          </p>
        </footer>
      </div>
    </section>
  );
}
