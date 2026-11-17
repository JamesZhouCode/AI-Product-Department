// 「政策分析」页（集合解读版）：政策库前置 → 按两个解读范围自动出集合结论。
//
// 页面结构：
//   工具栏 → 政策库条（chips + 「＋ 添加政策」小按钮 + 添加弹层）→ 解读范围切换
//   → 集合解读画布
//   集合画布（储能视图）：01 总体政策判断 / 02 政策清单 / 03 来源与空间 / 04 政策目标
//                         / 05 产业链影响 / 06 区域影响 / 07 企业影响 / 08 时间周期 / 09 银行业务
//   集合画布（全行业对比）：01 行业政策地位对比（储能 vs 26 个重点行业）+ 其后公共模块。
//
// 两个解读范围：
//   ① 储能行业 · 有效期内政策：只看储能行业、且未过期的政策（已过期自动排除，未标注有效期保留），
//      顶部「总体判断」给出对储能行业的整体政策结论；
//   ② 全行业政策地位对比：以 26 个重点行业（科技金融十大赛道、工信部十大稳增长行业、
//      六大未来产业）为参照系，与储能比较政策数量与支持强度，看储能当前的政策地位。
//   每条政策的行业标签与有效期由规则自动识别，识别不准可在「政策清单」模块里人工修正。
//
// 与「宏观」「流程」页同一套设计语言（浅灰底、白卡片细边、蓝色强调、DIN 数字）。
// 整页纵向滚动，滚动条固定在窗口最右侧（画布头部吸顶），任何窗口高度下内容都可达。
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import './policy.css';
import { modulesFor } from './policyData';
import { POLICY_INDUSTRIES, policyFocusFor } from './policyIndustry';
import { readPolicyFile, usePolicyLibrary } from './usePolicyLibrary';
import { isPdfFile } from './policyPdf';
import { digestPolicies, policyScopesFor } from './policyDigest';
import { todayIso } from './policyValidity';
import PolicySourceBadge, { PolicySourceModal } from './PolicySourceBadge';
import { PolicyScoreStandardModal } from './PolicyScoreStandard';
import PolicyDigestCanvas from './PolicyDigestCanvas';

const ACCEPT = '.md,.markdown,.txt,.pdf,text/plain,application/pdf';

/* ---------------- 政策库条（前置） + 添加弹层 ---------------- */

function LibraryBar({ library, industryLabel = '储能产业' }) {
  const [addOpen, setAddOpen] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [composeOpen, setComposeOpen] = useState(false);
  const [composeTitle, setComposeTitle] = useState('');
  const [composeText, setComposeText] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState('');
  const fileRef = useRef(null);

  const ingest = useCallback(
    async (fileList) => {
      const files = Array.from(fileList || []);
      if (!files.length) return;
      const parsed = [];
      const failures = [];
      for (const file of files) {
        // PDF 要解析文本层，页数多时耗时可见，给出进度避免误以为卡住。
        if (isPdfFile(file)) setBusy(`正在解析 ${file.name} …`);
        try {
          parsed.push(await readPolicyFile(file));
        } catch (err) {
          failures.push(err.message);
        }
      }
      setBusy('');
      if (parsed.length) {
        const added = library.addItems(parsed);
        if (added.length) {
          setError('');
          setComposeOpen(false);
          setComposeText('');
          setComposeTitle('');
          setAddOpen(false);
        }
      }
      if (failures.length) setError(`部分文件未能读取：${failures.join('；')}`);
      else if (!parsed.length) setError('未读取到可用的政策文本（支持 .md / .txt / .pdf）。');
    },
    [library],
  );

  const submitCompose = () => {
    if (!composeText.trim()) {
      setError('请先粘贴政策文本。');
      return;
    }
    library.addItems([
      {
        title: composeTitle.trim() || '粘贴的政策文本',
        text: composeText,
        sourceName: '粘贴文本',
      },
    ]);
    setError('');
    setComposeOpen(false);
    setComposeText('');
    setComposeTitle('');
    setAddOpen(false);
  };

  return (
    <section className="policy-libbar" aria-label="政策库">
      <header className="policy-libbar-head">
        <div className="policy-libbar-title">
          <h2>政策库</h2>
          <span>
            共 <b>{library.items.length}</b> 份 · 保存在本机浏览器
            <PolicySourceBadge sourceKey="libraryLocal" />
          </span>
        </div>
        <div className="policy-libbar-actions">
          <button
            type="button"
            className={addOpen ? 'policy-ghost-button' : 'policy-primary-button'}
            onClick={() => setAddOpen((value) => !value)}
          >
            {addOpen ? '收起添加面板' : '＋ 添加政策'}
          </button>
          <button type="button" className="policy-ghost-button" onClick={library.loadSamples}>
            载入{industryLabel.replace(/产业$/, '')}示例政策
          </button>
          {library.items.length > 0 && (
            <button
              type="button"
              className="policy-ghost-button is-danger"
              onClick={library.clearAll}
            >
              清空
            </button>
          )}
        </div>
      </header>

      <ul className="policy-libbar-chips">
        {library.items.map((item) => (
          <li key={item.id} className="policy-libbar-chip" title={item.title}>
            <b>{item.title}</b>
            <span>
              {item.sourceName}
              {item.isSample ? ' · 示例' : ''}
            </span>
            <button
              type="button"
              className="policy-libbar-chip-remove"
              aria-label={`移除 ${item.title}`}
              title={`移除 ${item.title}`}
              onClick={() => library.removeItem(item.id)}
            >
              ×
            </button>
          </li>
        ))}
        {!library.items.length && (
          <li className="is-empty">
            政策库为空：点「＋ 添加政策」导入 .pdf / .md / .txt 文件或粘贴政策原文，也可先「载入
            {industryLabel.replace(/产业$/, '')}示例政策」。
          </li>
        )}
      </ul>

      {addOpen && (
        <div className="policy-libbar-add">
          <div
            className={`policy-dropzone is-compact ${dragging ? 'is-dragging' : ''}`}
            role="button"
            tabIndex={0}
            onClick={() => fileRef.current?.click()}
            onKeyDown={(event) => {
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                fileRef.current?.click();
              }
            }}
            onDragOver={(event) => {
              event.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={(event) => {
              event.preventDefault();
              setDragging(false);
              ingest(event.dataTransfer?.files);
            }}
          >
            <b>拖入政策文件</b>
            <span>或点击选择文件 · .pdf / .md / .txt，单份上限 6 万字 · PDF 仅读取文本层</span>
            <input
              ref={fileRef}
              type="file"
              accept={ACCEPT}
              multiple
              hidden
              onChange={(event) => {
                ingest(event.target.files);
                event.target.value = '';
              }}
            />
          </div>
          <div className="policy-libbar-add-row">
            <button
              type="button"
              className="policy-ghost-button"
              onClick={() => setComposeOpen((value) => !value)}
            >
              {composeOpen ? '收起粘贴框' : '改为粘贴文本'}
            </button>
            <span>扫描件（图片版 PDF）请改用「粘贴文本」。</span>
          </div>
          {composeOpen && (
            <div className="policy-compose">
              <input
                type="text"
                placeholder="政策标题（可留空，默认取正文首个一级标题）"
                value={composeTitle}
                onChange={(event) => setComposeTitle(event.target.value)}
              />
              <textarea
                rows={6}
                placeholder="在此粘贴政策原文……"
                value={composeText}
                onChange={(event) => setComposeText(event.target.value)}
              />
              <div className="policy-compose-actions">
                <button type="button" className="policy-primary-button" onClick={submitCompose}>
                  纳入解读
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {busy && <p className="policy-import-notice is-busy">{busy}</p>}

      {!busy && (error || library.notice) && (
        <p className={`policy-import-notice ${error ? 'is-error' : ''}`}>
          {error || library.notice}
        </p>
      )}
    </section>
  );
}

/* ---------------- 页面 ---------------- */

export default function PolicyPage({ selectedIndustry = '', onNavigate }) {
  // 视角随一级链切换：储能产业 → 储能口径，算力产业 → 算力关键词口径。
  const focus = policyFocusFor(selectedIndustry);
  // 示例政策按行业成套提供，切链时由政策库自动换成本行业的示例；
  // 用户自己导入的政策不受影响（见 usePolicyLibrary 的行业同步逻辑）。
  const library = usePolicyLibrary(focus.key);
  const scopes = useMemo(() => policyScopesFor(focus), [focus]);
  const [scope, setScope] = useState('storage');
  const [sourceModalOpen, setSourceModalOpen] = useState(false);
  // 「打分标准」弹窗：按需查看八维档位与等级评定规则，不在页面上常驻。
  const [scoreStandardOpen, setScoreStandardOpen] = useState(false);
  const [activeRegion, setActiveRegion] = useState('');
  // 整页是滚动容器：滚动条固定在窗口最右侧，短窗口下政策库条不会把画布压扁。
  const pageRef = useRef(null);
  // 有效期判定基准固定为「进入页面那一刻」，避免同一次浏览里状态随时间漂移。
  const now = useMemo(() => new Date(), []);

  const digest = useMemo(
    () => digestPolicies(library.items, { scope, now, focus }),
    [library.items, scope, now, focus],
  );
  // 模块导航按视图区分：切换视图后回到该视图的首个模块（总体判断 / 行业对比）。
  const modules = useMemo(() => modulesFor(scope), [scope]);
  const [activeModule, setActiveModule] = useState(modules[0].id);

  useEffect(() => {
    setActiveModule(modules[0].id);
  }, [modules]);

  const industryMismatch = selectedIndustry && !POLICY_INDUSTRIES.includes(selectedIndustry);

  // 画布头部吸顶后占掉一段可视高度，定位时必须扣掉，否则目标模块会被压在头部下面。
  // 吸顶位置 = 整页上内边距的下沿（页面已改为上侧不留 padding，即滚动容器顶端），
  // 所以守卫高度 = 上内边距（动态读，当前为 0）+ 头部高度。
  const stickyGuard = useCallback(() => {
    const page = pageRef.current;
    const head = page?.querySelector('.policy-canvas-head');
    if (!page || !head) return 0;
    const padTop = Number.parseFloat(window.getComputedStyle(page).paddingTop) || 0;
    return padTop + head.getBoundingClientRect().height;
  }, []);

  const jumpTo = useCallback(
    (id) => {
      const page = pageRef.current;
      const node = page?.querySelector(`#policy-${id}`);
      if (!page || !node) return;
      const offset = node.getBoundingClientRect().top - page.getBoundingClientRect().top;
      page.scrollTo({ top: page.scrollTop + offset - stickyGuard() - 10, behavior: 'smooth' });
      setActiveModule(id);
    },
    [stickyGuard],
  );

  const handleScroll = useCallback(() => {
    const page = pageRef.current;
    if (!page) return;
    // 用吸顶头部的实际下沿当基准线：无论头部是否已吸顶都成立。
    const head = page.querySelector('.policy-canvas-head');
    const line =
      (head ? head.getBoundingClientRect().bottom : page.getBoundingClientRect().top) + 16;
    let current = modules[0].id;
    modules.forEach((module) => {
      const node = page.querySelector(`#policy-${module.id}`);
      if (node && node.getBoundingClientRect().top <= line) current = module.id;
    });
    // 滚到底时，末尾模块的顶边可能始终到不了基准线（模块较短时更明显），
    // 此时直接高亮最后一个模块，否则它永远不会被点亮。
    if (page.scrollHeight - page.clientHeight - page.scrollTop <= 4) {
      current = modules.at(-1).id;
    }
    setActiveModule((prev) => (prev === current ? prev : current));
  }, [modules]);

  useEffect(() => {
    pageRef.current?.scrollTo({ top: 0 });
  }, [scope]);

  return (
    <main className="policy-page" ref={pageRef} onScroll={handleScroll}>
      <header className="policy-toolbar">
        <div className="policy-title-lockup">
          <span>政策智能研判</span>
          <strong>{focus.industryLabel} · 政策分析</strong>
        </div>
        <div className="policy-toolbar-summary">
          <b>2</b> 个解读范围 <i>·</i>{' '}
          <b>{digest.compare.totalIndustries + (digest.compare.focusInLexicon ? 0 : 1)}</b>{' '}
          行业参照系 <i>·</i> <b>8</b> 维评分模型 <i>·</i> 有效期判定基准 <b>{todayIso(now)}</b>
        </div>
        <button
          type="button"
          className="policy-source-button"
          onClick={() => setSourceModalOpen(true)}
        >
          数据来源说明
        </button>
      </header>

      {industryMismatch && (
        <p className="policy-industry-notice">
          {`本页目前已完成${POLICY_INDUSTRIES.join('、')}的政策解读；顶部当前一级链为「${selectedIndustry}」，`}
          暂按储能口径展示，图谱 / 地图 / 周报页签会跟随该选择切换。
        </p>
      )}

      {/* 政策库前置：chips + 小按钮添加；导入政策文件收纳进「＋ 添加政策」弹层 */}
      <LibraryBar library={library} industryLabel={focus.industryLabel} />

      {/* 解读范围：储能行业·有效期内政策 / 全行业政策地位对比 */}
      <nav className="policy-scopes" aria-label="解读范围">
        {scopes.map((item) => (
          <button
            key={item.key}
            type="button"
            className={`policy-scope ${scope === item.key ? 'is-active' : ''}`}
            aria-pressed={scope === item.key}
            onClick={() => setScope(item.key)}
          >
            <b>{item.label}</b>
            <span>{item.short}</span>
            <em>{digest.scopeCounts[item.key] ?? 0} 份</em>
          </button>
        ))}
      </nav>

      <PolicyDigestCanvas
        digest={digest}
        activeModule={activeModule}
        onJump={jumpTo}
        activeRegion={activeRegion}
        onPickRegion={setActiveRegion}
        onCorrect={library.updateItem}
        onRemove={library.removeItem}
        onOpenStandard={() => setScoreStandardOpen(true)}
        onNavigate={onNavigate}
      />

      {sourceModalOpen && <PolicySourceModal onClose={() => setSourceModalOpen(false)} />}
      {scoreStandardOpen && (
        <PolicyScoreStandardModal
          result={digest.rows[0]?.result || null}
          onClose={() => setScoreStandardOpen(false)}
        />
      )}
    </main>
  );
}
