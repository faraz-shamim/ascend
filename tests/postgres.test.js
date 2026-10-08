import test from 'node:test';
import assert from 'node:assert/strict';
import {PGlite} from '@electric-sql/pglite';
import {createPostgresStore} from '../server/postgres-store.js';
import {emptyStats} from '../web/lib/domain.js';
test('Postgres transactions, rollback, token lookup, public ranking, and expiry cleanup',async()=>{
 const db=new PGlite();const pool={query:(...args)=>db.query(...args),connect:async()=>({query:(...args)=>db.query(...args),release(){}}),end:()=>db.close()};
 const store=await createPostgresStore('test-only',{pool});
 const p={id:'test',tokenHash:'c'.repeat(64),alias:'Test',public:false,stats:emptyStats(),activeQuest:{id:'q',expiresAt:1}};
 await store.create(p);assert.equal((await store.auth(p.tokenHash)).id,'test');assert.equal((await store.publicPlayers()).length,0);
 await store.update('test',player=>{player.stats.xp=150;player.public=true;return player.stats.xp;});assert.equal((await store.get('test')).stats.xp,150);assert.equal((await store.publicPlayers()).length,1);
 await assert.rejects(store.update('test',player=>{player.stats.xp=999;throw new Error('rollback');}));assert.equal((await store.get('test')).stats.xp,150);
 await store.purgeExpired(2);assert.equal((await store.get('test')).activeQuest,null);assert.equal((await store.get('test')).stats.xp,150);await store.close();
});
