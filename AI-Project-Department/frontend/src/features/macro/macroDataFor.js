// 「行业」页按产业链选择数据集：
//   储能产业 → macroData.js（原储能宏观研判，7 个一级环节口径）
//   算力产业 → macroDataCompute.js（算力产业宏观研判，4 个一级环节 / 19 个二级环节口径）
// 两个数据集导出同一套常量名，页面按当前产业链取用，其他行业暂回落到储能口径并给出提示。
import * as STORAGE_DATA from './macroData.js';
import * as COMPUTE_DATA from './macroDataCompute.js';
import * as STORAGE_SOURCES from './macroSources.js';
import * as COMPUTE_SOURCES from './macroSourcesCompute.js';

export const MACRO_INDUSTRIES = ['储能产业', '算力产业'];

export function macroDataFor(industry) {
  return industry === '算力产业' ? COMPUTE_DATA : STORAGE_DATA;
}

export function macroSourcesFor(industry) {
  return industry === '算力产业' ? COMPUTE_SOURCES : STORAGE_SOURCES;
}
