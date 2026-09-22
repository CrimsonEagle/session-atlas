export function sessionName(session) {
 const id=String(session?.sessionId||session?.id||'').trim(),name=String(session?.name||session?.title||'').trim();
 return name&&name!==id?name:'';
}

export function sessionLabel(session) {
 return sessionName(session)||String(session?.sessionId||session?.id||'Unbekannte Session');
}

export function shortSessionId(session,length=18) {
 return String(session?.sessionId||session?.id||'').slice(0,length);
}

export function sessionSecondaryId(session,length=18) {
 return sessionName(session)?shortSessionId(session,length):'';
}
