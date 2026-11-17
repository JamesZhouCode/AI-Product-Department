import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { answerQuestion } from '../src/features/assistant/assistantBrain.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const read = (relative) => readFileSync(join(HERE, '..', relative), 'utf8');

const COUNTS = {
  totalCompanies: 1977,
  listed: 237,
  nonListed: 1740,
  relationCount: 235,
  classification: {
    secondary: {
      资源与材料: 79,
      核心电子器件: 6,
      核心装备: 23,
      检测认证与标准: 5,
      电池与核心部件: 108,
      系统集成与工程建设: 53,
      应用与运营: 40,
    },
  },
  headTiers: { 龙头: 63, 骨干: 113, 长尾: 61 },
  relationTypes: { 供应: 231, 股权: 4 },
};

const COMPANIES = [
  {
    id: 'es-0001',
    name: '宁德时代新能源科技股份有限公司',
    aliases: ['宁德时代', 'CATL'],
    chain: '电池与核心部件',
    sector: '储能电池本体',
    tags: ['上市企业'],
    region: { province: '福建省', city: '宁德市' },
    products: '储能电芯',
  },
];

const ctx = { industry: '储能产业', counts: COUNTS, companies: COMPANIES };

test('分层问题给出头腰尾家数，并标注只覆盖上市企业', () => {
  const answer = answerQuestion('头部企业有多少家？', ctx);
  assert.match(answer.text, /63/);
  assert.match(answer.text, /113/);
  assert.match(answer.text, /61/);
  assert.ok(answer.bullets.some((item) => item.includes('硬门槛')));
  assert.match(answer.note, /上市企业/);
});

test('环节分布按企业数降序，并给出占比', () => {
  const answer = answerQuestion('哪个环节企业最多？', ctx);
  assert.equal(answer.bullets.length, 7);
  assert.ok(answer.bullets[0].startsWith('电池与核心部件：108 家'));
  assert.match(answer.bullets[0], /占 5\.5%/);
  assert.match(answer.note, /1,977/);
});

test('指名企业可直接定位环节', () => {
  const answer = answerQuestion('宁德时代属于哪个环节？', ctx);
  assert.match(answer.text, /宁德时代新能源科技股份有限公司/);
  assert.ok(answer.bullets.some((item) => item.includes('电池与核心部件')));
  assert.ok(answer.bullets.some((item) => item.includes('上市企业')));
});

test('规模问题返回总数与上市占比', () => {
  const answer = answerQuestion('这条链有多少家企业？', ctx);
  assert.match(answer.text, /1,977/);
  assert.match(answer.text, /237/);
  assert.equal(answer.action.tab, 'flow');
});

test('建链方法返回六步法', () => {
  const answer = answerQuestion('储能产业链是怎么建起来的？', ctx);
  assert.equal(answer.bullets.length, 6);
  assert.ok(answer.bullets[0].includes('拆解环节骨架'));
  assert.equal(answer.action.tab, 'flow');
});

test('无法回答时给出能力边界，不编造数据', () => {
  const answer = answerQuestion('明天天气怎么样？', ctx);
  assert.match(answer.text, /暂时没有把握/);
  assert.match(answer.note, /原始来源/);
});

test('左侧导航与问答页已接入 App', () => {
  const app = read('src/App.jsx');
  assert.ok(app.includes('SideRail'), 'App 未接入左侧导航');
  assert.ok(app.includes('ChainAssistantPage'), 'App 未接入链知智答页面');
  assert.ok(app.includes("workspace === 'assistant'"), 'App 缺少问答工作台分支');

  const rail = read('src/features/app/SideRail.jsx');
  assert.ok(rail.includes('全景链图'));
  assert.ok(rail.includes('链知智答'));

  const page = read('src/features/assistant/ChainAssistantPage.jsx');
  assert.ok(page.includes('您好，我是链知助手，有什么可以帮您？'), '缺少欢迎语');
});
