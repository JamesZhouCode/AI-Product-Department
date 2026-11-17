// 「行业」页来源元数据的上下文。
//
// 页面按当前产业链选择数据集：储能产业用 macroSources.js、算力产业用
// macroSourcesCompute.js。徽章与「数据来源说明」弹窗通过本上下文取元数据，
// 避免把行业参数逐层透传到几十个徽章调用点。
import { createContext, useContext } from 'react';
import * as STORAGE_SOURCES from './macroSources';

const MacroSourceContext = createContext(STORAGE_SOURCES);

export default MacroSourceContext;

export function useMacroSources() {
  return useContext(MacroSourceContext);
}
