import test from 'node:test';
import assert from 'node:assert/strict';
import {systemdTimestamp} from '../lib/hermes-collector-service.mjs';

test('systemd unix timestamps retain a recent last run regardless of localized timezone names',()=>{
 assert.equal(systemdTimestamp('@1790465599'),'2026-09-26T23:33:19.000Z');
 assert.equal(systemdTimestamp('@1790465599.375'),'2026-09-26T23:33:19.375Z');
 assert.equal(systemdTimestamp(''),null);
 assert.equal(systemdTimestamp('@not-a-timestamp'),null);
});
