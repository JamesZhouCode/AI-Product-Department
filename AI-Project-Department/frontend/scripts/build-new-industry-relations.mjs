#!/usr/bin/env node
// 一次性：为三条新链（电力装备/生物医药/人工智能）的上市企业生成图谱关系（供应/经销）。
// 关系基于公开的产业链上下游结构梳理，来源标注「行业公开信息」，depth 统一为 1，
// 与集成电路 companies.json 的 relations 字段保持一致（from/to 用企业全名，两端均为上市企业）。
// 本脚本只生成 docs/new-industry-relations.json，由 prepare-new-industries.mjs 消费。
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const industryDir = path.join(root, 'public', 'data', 'industries');
const listedEntityOverridesPath = path.join(
  root,
  'docs',
  'new-industry-listed-entity-overrides.json',
);
const outputPath = path.join(root, 'docs', 'new-industry-relations.json');
const listedEntityOverrides = fs.existsSync(listedEntityOverridesPath)
  ? JSON.parse(fs.readFileSync(listedEntityOverridesPath, 'utf8'))
  : {};

const normalize = (value) =>
  String(value || '')
    .replace(/[（）()\s·.。、“”‘’\-—_]/g, '')
    .toLowerCase();

// 三链上市企业全名索引（按行业分组）。
const listedByIndustry = {};
for (const key of ['power', 'biomed', 'ai']) {
  const payload = JSON.parse(
    fs.readFileSync(path.join(industryDir, `companies-${key}.json`), 'utf8'),
  );
  listedByIndustry[key] = (payload.companies || [])
    .filter((company) => {
      if (!(company.tags || []).includes('上市企业')) return false;
      const stockCode = company.research?.additionalFields?.stockCode;
      const override = stockCode ? listedEntityOverrides[String(stockCode)] : null;
      return !override || normalize(company.name) === normalize(override.canonicalName);
    })
    .map((company) => company.name);
}

// 用关键词解析企业全名：精确匹配优先；剩余歧义必须显式处理，不能靠名称长度猜主体。
function resolve(industry, keyword) {
  const wanted = normalize(keyword);
  const candidates = listedByIndustry[industry].filter((name) => normalize(name).includes(wanted));
  if (!candidates.length) {
    throw new Error(`[${industry}] 未找到上市企业「${keyword}」`);
  }
  if (candidates.length === 1) return candidates[0];
  const exact = candidates.find((name) => normalize(name) === wanted);
  if (exact) return exact;
  throw new Error(
    `[${industry}] 企业关键词「${keyword}」存在歧义，请补充完整主体：${candidates.join(' / ')}`,
  );
}

// 关系定义：[行业, 上游(供应方), 下游(需方), 关系类型]
const DEFINITIONS = [
  // 电力装备（含储能）：储能电芯 → 储能系统集成
  ['power', '亿纬锂能', '阳光电源', '供应'],
  ['power', '亿纬锂能', '海博思创', '供应'],
  ['power', '亿纬锂能', '科陆电子', '供应'],
  ['power', '亿纬锂能', '许继电气', '供应'],
  ['power', '孚能科技', '海博思创', '供应'],
  // 电力装备：伺服/电机 → 工业机器人
  ['power', '汇川技术', '埃斯顿', '供应'],
  ['power', '鸣志电器', '埃斯顿', '供应'],
  ['power', '科力尔电机', '埃斯顿', '供应'],
  // 生物医药：科研试剂/分子砌块 → CXO
  ['biomed', '泰坦科技', '药明康德', '供应'],
  ['biomed', '皓元医药', '药明康德', '供应'],
  ['biomed', '诺唯赞', '药明康德', '供应'],
  // 生物医药：CXO 研发服务 → 创新药
  ['biomed', '药明康德', '百奥泰', '供应'],
  ['biomed', '药明康德', '百利天恒', '供应'],
  ['biomed', '药明康德', '智翔金泰', '供应'],
  ['biomed', '康龙化成', '艾迪药业', '供应'],
  ['biomed', '美迪西', '众生药业', '供应'],
  // 生物医药：原料药/CDMO → 制剂
  ['biomed', '圣诺生物', '华东医药', '供应'],
  ['biomed', '九洲药业', '京新药业', '供应'],
  ['biomed', '赛托生物', '京新药业', '供应'],
  // 人工智能：封测/特气 → 芯片设计
  ['ai', '华天科技', '景嘉微', '供应'],
  ['ai', '华天科技', '国科微', '供应'],
  ['ai', '华天科技', '全志科技', '供应'],
  ['ai', '华天科技', '国芯科技', '供应'],
  ['ai', '华特气体', '华天科技', '供应'],
  // 人工智能：网络设备 → 数据中心/云算力
  ['ai', '锐捷网络', '科华数据', '供应'],
  ['ai', '锐捷网络', '网宿科技', '供应'],
  ['ai', '锐捷网络', '首都在线', '供应'],
  ['ai', '锐捷网络', '光环新网', '供应'],
  ['ai', '锐捷网络', '奥飞数据', '供应'],
  ['ai', '锐捷网络', '数据港', '供应'],
  ['ai', '锐捷网络', '优刻得', '供应'],
  // 人工智能：连接器/光模块 → 网络设备
  ['ai', '立讯精密', '锐捷网络', '供应'],
  // 人工智能：训练数据 → 大模型
  ['ai', '海天瑞声', '昆仑万维', '供应'],
  ['ai', '海天瑞声', '云从科技', '供应'],
  // 人工智能：IT 分销 → 网络设备
  ['ai', '神州数码', '锐捷网络', '经销'],
];

const relations = DEFINITIONS.map(([industry, fromKeyword, toKeyword, type], index) => {
  const from = resolve(industry, fromKeyword);
  const to = resolve(industry, toKeyword);
  if (normalize(from) === normalize(to)) {
    throw new Error(`关系两端相同：${from}（${industry}）`);
  }
  return {
    id: `relation-${String(index + 1).padStart(4, '0')}`,
    from,
    to,
    relationType: type,
    depth: 1,
    source: '行业公开信息',
    sourceFromProfile: fromKeyword,
    sourceToProfile: toKeyword,
    industry,
  };
});

// 校验：两端必须都是对应行业的上市企业。
for (const relation of relations) {
  const names = listedByIndustry[relation.industry];
  if (!names.some((name) => normalize(name) === normalize(relation.from))) {
    throw new Error(`from 端非上市企业：${relation.from}`);
  }
  if (!names.some((name) => normalize(name) === normalize(relation.to))) {
    throw new Error(`to 端非上市企业：${relation.to}`);
  }
}

const payload = {
  generatedAt: new Date().toISOString().slice(0, 10),
  note: '三条新链上市企业图谱关系（种子版）。基于产业链上下游公开结构梳理，来源标注「行业公开信息」，仅供图谱连边展示，具体供应/经销关系建议业务侧复核。',
  relations,
};

fs.writeFileSync(outputPath, `${JSON.stringify(payload, null, 2)}\n`);

const byType = {};
const byIndustry = {};
for (const relation of relations) {
  byType[relation.relationType] = (byType[relation.relationType] || 0) + 1;
  byIndustry[relation.industry] = (byIndustry[relation.industry] || 0) + 1;
}
console.log(`已生成 ${relations.length} 条关系 → docs/new-industry-relations.json`);
console.log('按行业：', JSON.stringify(byIndustry));
console.log('按类型：', JSON.stringify(byType));
