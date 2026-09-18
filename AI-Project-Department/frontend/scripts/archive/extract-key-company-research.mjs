import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const root = process.cwd();
const outputPath = path.join(root, 'docs', 'key-company-research.json');
const legacyCommit = process.env.LEGACY_COMPANIES_COMMIT || '6614cc6^';

const legacyJson = execFileSync(
  'git',
  ['show', `${legacyCommit}:public/data/companies.json`],
  { cwd: root, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 },
);
const legacy = JSON.parse(legacyJson);
const profiles = (legacy.companies || []).filter((company) => company.role === 'seed');
const profileNames = new Set(profiles.map((profile) => profile.name));
const relations = (legacy.relations || []).filter(
  (relation) => profileNames.has(relation.from) && profileNames.has(relation.to),
);

fs.writeFileSync(
  outputPath,
  JSON.stringify(
    {
      generatedAt: new Date().toISOString(),
      sourceCommit: legacyCommit,
      source: '旧版本 public/data/companies.json 中的 130 家重点企业研究记录',
      profileCount: profiles.length,
      profiles,
      relations,
    },
    null,
    2,
  ),
);

console.log(
  JSON.stringify(
    {
      outputPath,
      sourceCommit: legacyCommit,
      profileCount: profiles.length,
      relationCount: relations.length,
    },
    null,
    2,
  ),
);
