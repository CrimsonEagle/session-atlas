import test from 'node:test';
import assert from 'node:assert/strict';
import {createPolling} from '../public/polling.js';
test('Polling cancels on blur/hide, resumes immediately and does not schedule after background completion',()=>{
 let active=true,calls=0;const timers=new Map();let next=0;
 const poll=createPolling({isActive:()=>active,delay:()=>30000,refresh:()=>calls++,setTimer:(fn,delay)=>{assert.equal(delay,30000);timers.set(++next,fn);return next;},clearTimer:id=>timers.delete(id)});
 poll.schedule();assert.equal(timers.size,1);
 active=false;poll.visibilityChanged();assert.equal(timers.size,0);assert.equal(calls,0);
 // A refresh finishing after minimization must not re-arm the timer.
 poll.schedule();assert.equal(timers.size,0);
 active=true;poll.visibilityChanged();assert.equal(calls,1);
 poll.schedule();assert.equal(timers.size,1);
 poll.pause();assert.equal(timers.size,0);
 poll.stop();poll.visibilityChanged();poll.schedule();assert.equal(calls,1);assert.equal(timers.size,0);
});
test('A queued timer also rechecks foreground state before reading logs',()=>{
 let active=true,callback,calls=0;const poll=createPolling({isActive:()=>active,delay:()=>10000,refresh:()=>calls++,setTimer:fn=>{callback=fn;return 1;},clearTimer:()=>{}});
 poll.schedule();active=false;callback();assert.equal(calls,0);
});
