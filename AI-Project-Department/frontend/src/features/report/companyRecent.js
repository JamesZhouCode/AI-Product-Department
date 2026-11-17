// 「近况分析」客户端：点击按钮后为某家上市公司取回最近情况。
//
// 数据通道按优先级自上而下回落，任何一层失败都不会抛给调用方：
//   1) snapshot —— 构建期抓取的企业近况快照（scripts/prepare-company-digest.mjs 产出）。
//   2) local    —— 本期舆情快照里命中该企业的条目。
//   3) none     —— 都没有数据时返回「暂无」。
//
// 说明：本模块不做任何运行时联网请求（实时抓取层已为内网部署移除），
// 全部数据来自随包部署的本地快照文件。

import { buildCompanyRecent, summarizeCompanyRecent } from './sentimentModel.js';

/**
 * 取回企业近况。
 * @param {string} name 企业简称
 * @param {object} options {aliases, digest, corpus, limit}
 * @returns {Promise<{mode, summary, items, note, fetchedAt}>}
 */
export async function analyzeCompanyRecent(name, options = {}) {
  const aliases = (options.aliases && options.aliases.length ? options.aliases : [name]).filter(
    (value) => value && value.length >= 3,
  );
  const limit = options.limit ?? 5;

  const snapshot = options.digest?.companies?.[name];
  if (snapshot?.items?.length) {
    return {
      mode: 'snapshot',
      items: snapshot.items.slice(0, limit),
      summary: snapshot.summary || summarizeCompanyRecent(name, snapshot.items),
      note: `企业近况快照${snapshot.updatedAt ? `（更新至 ${snapshot.updatedAt}）` : ''}，来自构建期资讯抓取结果。`,
    };
  }

  const local = buildCompanyRecent(name, options.corpus || [], { aliases, limit });
  if (local.length) {
    return {
      mode: 'local',
      items: local,
      summary: summarizeCompanyRecent(name, local),
      note: '来自本期行业资讯快照中提及该企业的条目。',
    };
  }

  return {
    mode: 'none',
    items: [],
    summary: '暂无',
    note: '近况快照与舆情库中均未取得该企业的近期资讯。',
  };
}
