// 「生态经营」版面：客户经理的营销工作台。
//
// 数据来自客户经理在「图谱」「授信」里关注的企业（useFollowedCompanies 统一管理），
// 本页只做三件事：呈现营销视角的企业清单、给出基于画像的营销建议、支持取消关注。
// 所有建议都是规则推导（拜访优先级 / 上市属性 / 产业链环节），不引入臆测数据。
import { useMemo } from 'react';
import { marketingTipsFor } from './ecoAdvice';
import { POLICY_META } from '../policy/policyData';
import './eco.css';

function formatFollowedAt(iso) {
  if (!iso) return '—';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '—';
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(
    date.getDate(),
  ).padStart(2, '0')}`;
}

function SummaryCard({ label, value, hint }) {
  return (
    <div className="eco-summary-card">
      <b>{value}</b>
      <span>{label}</span>
      {hint && <em>{hint}</em>}
    </div>
  );
}

function FollowCard({ item, onUnfollow }) {
  const tips = marketingTipsFor(item);
  return (
    <article className="eco-card">
      <header className="eco-card-head">
        <div className="eco-card-title">
          <h3>{item.name}</h3>
          <div className="eco-card-chips">
            {item.chain && <span className="eco-chip is-chain">{item.chain}</span>}
            {item.sector && <span className="eco-chip">{item.sector}</span>}
            <span className={`eco-chip ${item.listed ? 'is-listed' : ''}`}>
              {item.listed ? '上市企业' : '非上市企业'}
            </span>
            {item.visit && (
              <span className={`eco-chip is-priority tone-${item.visit.tone || 'pending'}`}>
                拜访优先级 {item.visit.label} · {item.visit.total} 分
              </span>
            )}
          </div>
        </div>
        <div className="eco-card-actions">
          <span className="eco-followed-at">关注于 {formatFollowedAt(item.followedAt)}</span>
          <button
            type="button"
            className="eco-unfollow"
            onClick={() => onUnfollow(item)}
            title="取消关注，同时从本版面移除"
          >
            取消关注
          </button>
        </div>
      </header>
      <ul className="eco-tips">
        {tips.map((tip) => (
          <li key={tip}>{tip}</li>
        ))}
      </ul>
    </article>
  );
}

export default function EcoPage({ followed, onNavigate }) {
  const items = useMemo(() => followed?.items || [], [followed]);

  const summary = useMemo(() => {
    const chains = new Set(items.map((item) => item.chain).filter(Boolean));
    const listed = items.filter((item) => item.listed).length;
    const hot = items.filter(
      (item) => item.visit?.label === '优先拜访' || item.visit?.label === '重点关注',
    ).length;
    return { total: items.length, chains: chains.size, listed, hot };
  }, [items]);

  // 营销清单按拜访优先级从高到低，同分时新关注的在前。
  const sorted = useMemo(
    () =>
      [...items].sort((a, b) => {
        const priority = (b.visit?.total || 0) - (a.visit?.total || 0);
        if (priority !== 0) return priority;
        return String(b.followedAt || '').localeCompare(String(a.followedAt || ''));
      }),
    [items],
  );

  return (
    <main className="eco-page">
      <header className="eco-toolbar">
        <div className="eco-title-lockup">
          <span className="eco-eyebrow">ECOSYSTEM · 客户经理营销工作台</span>
          <h2>生态经营</h2>
          <p>
            在「图谱」或「授信」里关注企业后，这里会汇总成你的营销名单：拜访优先级、切入场景与跟踪建议一目了然。
          </p>
        </div>
        <div className="eco-toolbar-actions">
          <button
            type="button"
            className="eco-ghost-button"
            onClick={() => onNavigate?.('fishbone')}
          >
            去图谱关注企业
          </button>
          <button type="button" className="eco-ghost-button" onClick={() => onNavigate?.('credit')}>
            去授信关注企业
          </button>
        </div>
      </header>

      {items.length ? (
        <>
          <section className="eco-summary" aria-label="关注概览">
            <SummaryCard label="关注企业" value={summary.total} hint="可在下方卡片取消关注" />
            <SummaryCard
              label="覆盖产业链环节"
              value={summary.chains}
              hint="环节越多，营销组合越完整"
            />
            <SummaryCard label="上市企业" value={summary.listed} hint="可切入资本市场场景" />
            <SummaryCard
              label="优先 / 重点拜访"
              value={summary.hot}
              hint={`结合「${POLICY_META.industry}」政策与行业景气安排走访`}
            />
          </section>
          <section className="eco-list" aria-label="关注企业营销清单">
            {sorted.map((item) => (
              <FollowCard
                key={item.key || item.id || item.name}
                item={item}
                onUnfollow={followed.unfollow}
              />
            ))}
          </section>
          <p className="eco-note">
            关注名单保存在浏览器本地，与「图谱」「授信」的公司信息卡实时互通；取消关注即从名单移除，不影响图谱与授信中的企业数据。
          </p>
        </>
      ) : (
        <section className="eco-empty" aria-label="暂无关注企业">
          <div className="eco-empty-mark">◎</div>
          <h3>还没有关注的企业</h3>
          <p>
            在「图谱」点击企业查看信息卡，或在「授信」打开企业画像，点击卡上的
            <b>「☆ 关注」</b>
            ，企业就会进入这份营销名单。
          </p>
          <div className="eco-empty-actions">
            <button
              type="button"
              className="eco-ghost-button"
              onClick={() => onNavigate?.('fishbone')}
            >
              去图谱关注企业
            </button>
            <button
              type="button"
              className="eco-ghost-button"
              onClick={() => onNavigate?.('credit')}
            >
              去授信关注企业
            </button>
          </div>
        </section>
      )}
    </main>
  );
}
