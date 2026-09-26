// Display metadata lives here so future collectors can join filters, charts, and legends
// without adding another two-tool conditional to each view.
export const TOOL_DEFINITIONS=Object.freeze([
 {id:'codex',name:'OpenAI Codex',shortName:'Codex',symbol:'⌘',colorStart:'#7390f3',colorEnd:'#4868d8',hasLimits:true},
 {id:'claude',name:'Claude Code',shortName:'Claude',symbol:'✳',colorStart:'#e99b7f',colorEnd:'#d97757',hasLimits:true},
 {id:'hermes',name:'Hermes Agent',shortName:'Hermes',symbol:'H',colorStart:'#5bc4a8',colorEnd:'#278c82',hasLimits:false}
]);
export const TOOL_IDS=Object.freeze(TOOL_DEFINITIONS.map(tool=>tool.id));
export const LIMIT_TOOL_IDS=Object.freeze(TOOL_DEFINITIONS.filter(tool=>tool.hasLimits).map(tool=>tool.id));
export const toolDefinition=id=>TOOL_DEFINITIONS.find(tool=>tool.id===id);
export const toolName=id=>toolDefinition(id)?.name||String(id||'Unbekannt');
