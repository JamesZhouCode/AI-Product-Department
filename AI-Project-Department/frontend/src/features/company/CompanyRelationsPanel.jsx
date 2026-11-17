import { useEffect, useMemo, useState } from 'react';

/**
 * 企业关系明细面板：实控人 / 前十大股东 / 客户 / 供应商。
 *
 * 数据来源 `data/industries/compute-relations.json`（按统一社会信用代码索引，
 * 约 4.7MB），只在打开企业详情时按需加载一次并全局缓存 —— 首屏不背这个包。
 * 储能链没有该分片，请求失败或无对应 key 时整块不渲染，不报错、不占位。
 */

const DETAIL_URL = 'data/industries/compute-relations.json';

let cache = null;
let pending = null;

function loadDetail() {
  if (cache) return Promise.resolve(cache);
  if (pending) return pending;
  const base = document.baseURI;
  pending = fetch(new URL(DETAIL_URL, base))
    .then((response) => {
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return response.json();
    })
    .then((payload) => {
      cache = payload;
      pending = null;
      return payload;
    })
    .catch((error) => {
      pending = null;
      throw error;
    });
  return pending;
}

const AMOUNT_UNIT = 10000; // 万元 -> 亿元

function fmtAmount(value) {
  if (!value) return '未披露金额';
  return value >= AMOUNT_UNIT
    ? `${(value / AMOUNT_UNIT).toFixed(2)} 亿元`
    : `${value.toFixed(0)} 万元`;
}

function fmtPct(value) {
  return value === null || value === undefined ? '' : `${value}%`;
}

function ShareholderList({ items }) {
  if (!items?.length) return null;
  return (
    <ul className="equity-holder-list">
      {items.map((item, index) => (
        <li key={`${item.name}-${index}`}>
          <span className="holder-rank">{index + 1}</span>
          <span className="holder-name">{item.name}</span>
          <span className="holder-pct">{fmtPct(item.pct) || '—'}</span>
        </li>
      ))}
    </ul>
  );
}

function TradeList({ title, items, total, side }) {
  if (!items?.length) return null;
  return (
    <div className="trade-block">
      <div className="trade-head">
        <span>{title}</span>
        <em>
          共 {total} 家 · 已列 {items.length} 家
        </em>
      </div>
      <ul className="trade-list">
        {items.map((item, index) => (
          <li key={`${side}-${item.name}-${index}`}>
            <span className="trade-name">{item.name}</span>
            <span className="trade-meta">
              {fmtAmount(item.amount)}
              {item.sharePct ? ` · 占 ${item.sharePct}%` : ''}
              {item.year ? ` · ${item.year}` : ''}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export default function CompanyRelationsPanel({ entity }) {
  const [payload, setPayload] = useState(cache);
  const [failed, setFailed] = useState(false);
  const [open, setOpen] = useState(false);

  const key = entity?.keyValue || entity?.id;

  useEffect(() => {
    if (cache || !entity) return undefined;
    let cancelled = false;
    loadDetail()
      .then((data) => {
        if (!cancelled) setPayload(data);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [entity]);

  const detail = useMemo(() => {
    if (!payload || !key) return null;
    return payload.byCompany?.[key] || null;
  }, [payload, key]);

  if (failed || !entity) return null;
  if (!detail) return null;

  const hasEquity = Boolean(
    detail.controller || detail.topHolder || detail.shareholders?.length,
  );
  const hasTrade = Boolean(detail.customers?.length || detail.suppliers?.length);
  if (!hasEquity && !hasTrade) return null;

  const holders = open ? detail.shareholders : (detail.shareholders || []).slice(0, 5);
  const concentrationRisk =
    (detail.customerCr5 ?? 0) >= 50 || (detail.supplierCr5 ?? 0) >= 50;

  return (
    <>
      {hasEquity && (
        <div className="detail-section equity-section">
          <div className="section-title">
            <span>股权与实控人</span>
            <em>{detail.shareholderCount ? `股东 ${detail.shareholderCount} 户` : '穿透口径'}</em>
          </div>
          <div className="kv-grid equity-grid">
            <div>
              <span>实际控制人</span>
              <b>{detail.controller || '未取到'}</b>
            </div>
            <div>
              <span>实控人类型</span>
              <b>{detail.controllerType || '—'}</b>
            </div>
            <div>
              <span>实控人持股</span>
              <b>{fmtPct(detail.controllerStake) || '—'}</b>
            </div>
            <div>
              <span>控制层级</span>
              <b>{detail.controlDepth ? `${detail.controlDepth} 层` : '—'}</b>
            </div>
            <div>
              <span>第一大股东</span>
              <b>{detail.topHolder || '—'}</b>
            </div>
            <div>
              <span>第一大股东持股</span>
              <b>{fmtPct(detail.topHolderStake) || '—'}</b>
            </div>
            <div>
              <span>CR10 集中度</span>
              <b>{fmtPct(detail.cr10) || '—'}</b>
            </div>
            <div>
              <span>客户 / 供应商 CR5</span>
              <b>
                {fmtPct(detail.customerCr5) || '—'} / {fmtPct(detail.supplierCr5) || '—'}
              </b>
            </div>
          </div>
          {concentrationRisk && (
            <div className="equity-alert">
              集中度提示：{detail.concentrationFlag || '客户或供应商集中度偏高'}
              {detail.concentrationYear ? `（${detail.concentrationYear} 年报）` : ''}
            </div>
          )}
          {detail.shareholders?.length > 0 && (
            <>
              <ShareholderList items={holders} />
              {detail.shareholders.length > 5 && (
                <button type="button" className="trade-more" onClick={() => setOpen((v) => !v)}>
                  {open ? '收起股东名单' : `展开全部 ${detail.shareholders.length} 位股东`}
                </button>
              )}
            </>
          )}
        </div>
      )}
      {hasTrade && (
        <div className="detail-section trade-section">
          <div className="section-title">
            <span>客户与供应商</span>
            <em>公开披露 / 招投标口径</em>
          </div>
          <TradeList
            title="主要客户"
            items={detail.customers}
            total={detail.customerTotal}
            side="c"
          />
          <TradeList
            title="主要供应商"
            items={detail.suppliers}
            total={detail.supplierTotal}
            side="s"
          />
          <p className="trade-note">
            仅列交易金额最高的前 {Math.max(detail.customers.length, detail.suppliers.length, 1)} 家；
            交易对手不在算力链清单内，故不进入链上关系图。
          </p>
        </div>
      )}
    </>
  );
}
