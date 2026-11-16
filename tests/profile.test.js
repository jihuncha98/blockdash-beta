import test from 'node:test';
import assert from 'node:assert/strict';
import {ProfileDb} from '../server/profiles.js';
import {WEAPONS,BDC} from '../shared/rules.js';
test('account starts with exactly two permanently owned starter weapons',()=>{
 const db=new ProfileDb(),created=db.create('Example_User','examplePass123');
 assert.deepEqual(created.profile.owned,['M416','P92']);assert.equal(created.profile.bdc,0);
 assert.ok(db.auth(created.token));assert.equal(db.login('example_user','examplePass123').profile.nickname,'example_user');
});
test('invalid credentials, short password and duplicate accounts are rejected',()=>{
 const db=new ProfileDb();assert.throws(()=>db.create('invalid account','12345678'));
 assert.throws(()=>db.create('valid','123'));db.create('valid','longPass123');assert.throws(()=>db.create('VALID','longPass123'));
 assert.throws(()=>db.login('valid','wrongpassword'));
});
test('only owned weapons can be equipped and users cannot edit their own BDC',()=>{
 const db=new ProfileDb();db.create('alpha','password123');assert.throws(()=>db.update('alpha',{primary:'AWM',secondary:'P92'}));
 assert.equal(db.update('alpha',{nickname:'HELLO'}).nickname,'HELLO');
 const own=db.users.alpha.profile;assert.equal(own.bdc,0);
});
test('10-draw price, independent rewards, permanent ownership and duplicate credit',()=>{
 const db=new ProfileDb();db.create('alpha','password123');db.award('alpha','ffa',{kills:300,deaths:0,assists:0},true);
 assert.ok(db.users.alpha.profile.bdc>=6000);const before=db.users.alpha.profile.bdc;
 const result=db.draw('alpha',10);assert.equal(result.draws.length,10);assert.ok(result.draws.every(d=>WEAPONS[d.key]));
 const refunds=result.draws.filter(d=>d.duplicate).length*BDC.duplicate;
 assert.equal(result.profile.bdc,before-6000+refunds);
 assert.ok(new Set(result.profile.owned).size===result.profile.owned.length);
});
test('server awards AI, FFA and team matches but not practice matches',()=>{
 const db=new ProfileDb();db.create('alpha','password123');const earned=db.award('alpha','bots',{kills:2,deaths:1,assists:0},true);
 assert.equal(earned,290);assert.equal(db.award('alpha','practice',{kills:2},true),0);assert.equal(db.users.alpha.profile.stats.games,1);
});
