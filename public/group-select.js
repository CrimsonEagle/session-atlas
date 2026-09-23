const choices=[
 ['sessions','Einzelne Sessions'],
 ['tasks','Aufgaben mit Agents'],
 ['repository','Nach Repository'],
 ['tool','Nach KI-Tool'],
 ['model','Nach Modell'],
 ['branch','Nach Branch'],
 ['agent','Hauptsessions / Subagents']
];

export function groupSelect(selected,showToolGroup=true){
 const options=choices.filter(([value])=>value!=='tool'||showToolGroup);
 return `<select id="group" aria-label="Gruppierung">${options.map(([value,label])=>`<option value="${value}" ${selected===value?'selected':''}>${label}</option>`).join('')}</select>`;
}
