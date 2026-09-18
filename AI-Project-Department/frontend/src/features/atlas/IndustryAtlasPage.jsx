import { useEffect, useMemo, useState } from 'react';
import { INDUSTRY_OPTIONS } from '../../chainPalette';
import { normalize } from '../../shared/text';
import CompanyDetailRail from '../company/CompanyDetailRail';
import { buildIndustryAtlasModel } from '../insights/industryModel';
import './atlas.css';

function regionLabelFor(company) {
  return (
    [company.region?.province, company.region?.city, company.region?.district]
      .filter(Boolean)
      .join(' · ') || '区域待补'
  );
}

function AtlasTertiaryNode({ node, index, active, showCompanies, onOpen, onOpenCompany }) {
  return (
    <div className={`ic-atlas-node-wrap ${active ? 'is-active' : ''}`}>
      <button
        type="button"
        className="ic-atlas-node"
        style={{ '--atlas-node-color': node.color }}
        aria-expanded={active}
        aria-label={`${node.label}，${node.count}家上市企业，查看详情`}
        onClick={() => onOpen(node)}
      >
        <span className="ic-atlas-node-code">{String(index + 1).padStart(2, '0')}</span>
        <span className="ic-atlas-node-label">{node.label}</span>
        <span className="ic-atlas-node-count">
          <b>{node.count}</b>
          <small>家</small>
          <em>{node.relationCount} 关系</em>
        </span>
      </button>
      {showCompanies && (
        <div className="ic-atlas-company-list">
          {node.companies.map((company) => (
            <button
              type="button"
              className="ic-atlas-company-chip"
              key={company.id}
              onClick={(event) => {
                event.stopPropagation();
                onOpenCompany(node, company);
              }}
            >
              {company.name}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function AtlasStageCard({ group, selectedNodeId, showCompanies, onOpen, onOpenCompany }) {
  return (
    <article className="ic-atlas-stage-card" style={{ '--atlas-stage-color': group.color }}>
      <header className="ic-atlas-stage-head">
        <span className="ic-atlas-stage-number">{group.code}</span>
        <div className="ic-atlas-stage-title">
          <small>{group.note}</small>
          <h3>{group.label}</h3>
        </div>
        <div className="ic-atlas-stage-total">
          <b>{group.count}</b>
          <span>家</span>
        </div>
      </header>
      <div className="ic-atlas-stage-meta">
        <span>{group.tertiary.length} 个三级环节</span>
        <span>{group.relationCount} 条关系</span>
      </div>
      <div className="ic-atlas-node-list">
        {group.tertiary.map((node, index) => (
          <AtlasTertiaryNode
            key={node.id}
            node={node}
            index={index}
            active={selectedNodeId === node.id}
            showCompanies={showCompanies}
            onOpen={onOpen}
            onOpenCompany={onOpenCompany}
          />
        ))}
      </div>
    </article>
  );
}

function AtlasStageRow({ groups, selectedNodeId, showCompanies, onOpen, onOpenCompany }) {
  // 列数跟随二级链数量（集成电路 6、储能产业 7、生物医药 4…），
  // 否则多出的链会被硬编码的 6 列挤到第二行。
  return (
    <div
      className="ic-atlas-stage-row"
      style={{ gridTemplateColumns: `repeat(${groups.length}, minmax(0, 1fr))` }}
    >
      {groups.map((group) => (
        <AtlasStageCard
          key={group.id}
          group={group}
          selectedNodeId={selectedNodeId}
          showCompanies={showCompanies}
          onOpen={onOpen}
          onOpenCompany={onOpenCompany}
        />
      ))}
    </div>
  );
}

function AtlasDetailDrawer({ node, industryLabel, totalCompanies, onClose, onSelectCompany }) {
  return (
    <aside
      className="ic-atlas-drawer"
      role="dialog"
      aria-modal="false"
      aria-label={`${node.label}详情`}
    >
      <div className="ic-atlas-drawer-top detail-header">
        <div className="ic-atlas-drawer-context">
          <span className="eyebrow">TERTIARY / 三级环节</span>
          <small>{node.secondaryLabel}</small>
        </div>
        <button type="button" className="close-detail" aria-label="关闭详情" onClick={onClose}>
          关闭
        </button>
      </div>
      <div className="ic-atlas-drawer-heading">
        <span>DETAIL VIEW / 详细信息</span>
        <h2>{node.label}</h2>
        <p>
          {node.count} 家上市企业 · {node.mappedCount} 家已落图 · {node.relationCount} 条企业内关系
        </p>
      </div>
      <div className="ic-atlas-node-detail">
        <div className="ic-atlas-detail-metrics">
          <div>
            <b>{node.count}</b>
            <span>企业</span>
          </div>
          <div>
            <b>{node.mappedCount}</b>
            <span>已落图</span>
          </div>
          <div>
            <b>{node.relationCount}</b>
            <span>企业内关系</span>
          </div>
        </div>
        <p className="ic-atlas-drawer-note">
          企业名单来自 {industryLabel} 调研表，仅展示这 {totalCompanies}{' '}
          家上市企业研究对象；供应商、经销商和关联外部企业不会作为图谱节点出现。
        </p>
        <div className="ic-atlas-list-heading">
          <span>企业清单</span>
          <small>点击企业查看技术与产品</small>
        </div>
        <div className="ic-atlas-company-listing">
          {node.companies.map((item) => (
            <button
              type="button"
              className="ic-atlas-company-row"
              key={item.id}
              onClick={() => onSelectCompany(item)}
            >
              <span>
                <b>{item.name}</b>
                <small>{regionLabelFor(item)}</small>
              </span>
              <strong>查看</strong>
            </button>
          ))}
        </div>
      </div>
    </aside>
  );
}

export default function IndustryAtlasPage({
  data,
  selectedIndustry = INDUSTRY_OPTIONS[0],
  companyDetailPropsFor,
}) {
  const model = useMemo(
    () => buildIndustryAtlasModel(data, selectedIndustry),
    [data, selectedIndustry],
  );
  const [selectedNodeId, setSelectedNodeId] = useState('');
  const [selectedCompanyId, setSelectedCompanyId] = useState('');
  const [showCompanies, setShowCompanies] = useState(true);
  const selectedNode = useMemo(
    () => model.tertiary.find((node) => node.id === selectedNodeId) || null,
    [model.tertiary, selectedNodeId],
  );
  const selectedCompany = useMemo(
    () => selectedNode?.companies.find((company) => company.id === selectedCompanyId) || null,
    [selectedCompanyId, selectedNode],
  );
  const selectedCompanyRelations = useMemo(() => {
    if (!selectedCompany) return [];
    const selectedName = normalize(selectedCompany.name);
    return (data.relations || []).filter(
      (relation) =>
        normalize(relation.from) === selectedName || normalize(relation.to) === selectedName,
    );
  }, [data.relations, selectedCompany]);

  useEffect(() => {
    if (selectedNodeId && !selectedNode) {
      setSelectedNodeId('');
      setSelectedCompanyId('');
    }
  }, [selectedNode, selectedNodeId]);

  useEffect(() => {
    setSelectedNodeId('');
    setSelectedCompanyId('');
  }, [selectedIndustry]);

  useEffect(() => {
    if (!selectedNodeId) return undefined;
    const onKeyDown = (event) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      event.stopPropagation();
      setSelectedNodeId('');
      setSelectedCompanyId('');
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [selectedNodeId]);

  const openNode = (node) => {
    setSelectedNodeId(node.id);
    setSelectedCompanyId('');
  };
  const openCompany = (node, company) => {
    setSelectedNodeId(node.id);
    setSelectedCompanyId(company.id);
  };
  const closeDrawer = () => {
    setSelectedNodeId('');
    setSelectedCompanyId('');
  };

  return (
    <main className="ic-atlas-page">
      <header className="ic-atlas-toolbar">
        <div className="ic-atlas-title-lockup">
          <span>产业链图谱</span>
          <strong>{model.label}</strong>
        </div>
        <div className="ic-atlas-toolbar-summary">
          <b>{model.companies.length}</b> 家上市企业 <i>·</i> <b>{model.secondary.length}</b>{' '}
          条二级链路 <i>·</i> <b>{model.tertiary.length}</b> 个三级环节
        </div>
        <button
          type="button"
          className={`ic-atlas-toggle ${showCompanies ? 'active' : ''}`}
          aria-pressed={showCompanies}
          onClick={() => setShowCompanies((visible) => !visible)}
        >
          {showCompanies ? '收起企业名称' : '展开企业名称'}
        </button>
      </header>
      <section className="ic-atlas-graph-shell">
        <div className="ic-atlas-graph-scroll">
          <div
            className="ic-atlas-graph"
            // 每列至少 180px，列数随二级链数量变化，窄屏时横向滚动而不是压缩卡片。
            style={{ minWidth: `${Math.max(1080, model.secondary.length * 180)}px` }}
          >
            <AtlasStageRow
              groups={model.secondary}
              selectedNodeId={selectedNodeId}
              showCompanies={showCompanies}
              onOpen={openNode}
              onOpenCompany={openCompany}
            />
          </div>
        </div>
        {selectedNode && !selectedCompany && (
          <AtlasDetailDrawer
            node={selectedNode}
            industryLabel={model.label}
            totalCompanies={model.companies.length}
            onClose={closeDrawer}
            onSelectCompany={(company) => setSelectedCompanyId(company.id)}
          />
        )}
        {selectedNode && selectedCompany && (
          <CompanyDetailRail
            entity={selectedCompany}
            detailProps={companyDetailPropsFor?.(selectedCompany, selectedCompanyRelations)}
            onClearSelection={closeDrawer}
            className="company-detail-rail--atlas ic-atlas-company-detail-rail"
          />
        )}
      </section>
    </main>
  );
}
