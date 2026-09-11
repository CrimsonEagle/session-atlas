// No timer runs while the document is hidden or its window has lost focus.
// Dependencies are injectable so the lifecycle can be tested without a browser.
export function createPolling({isActive,delay,refresh,onState=()=>{},setTimer=setTimeout,clearTimer=clearTimeout}) {
 let timer=null,stopped=false;
 function pause(){if(timer!==null)clearTimer(timer);timer=null;onState();}
 function schedule(){pause();if(!stopped&&isActive())timer=setTimer(()=>{timer=null;if(isActive())refresh();},delay());}
 function visibilityChanged(){pause();if(!stopped&&isActive())refresh();}
 function stop(){stopped=true;pause();}
 return {schedule,pause,visibilityChanged,stop};
}
