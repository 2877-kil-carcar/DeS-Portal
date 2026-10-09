const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const shared = fs.readFileSync('assets/admin-auth.js', 'utf8');
const svsHtml = fs.readFileSync('apps/svs/index.html', 'utf8');
const svsAuth = fs.readFileSync('apps/svs/auth.js', 'utf8');
const redeemHtml = fs.readFileSync('apps/redeem/index.html', 'utf8');
const redeem = fs.readFileSync('apps/redeem/redeem.js', 'utf8');

const context = {};
vm.runInNewContext(shared, context, {filename: 'admin-auth.js'});
assert.deepEqual({...context.DES_ADMIN_CREDENTIALS}, {username: 'isozaki', password: '3732'});
assert.equal(Object.isFrozen(context.DES_ADMIN_CREDENTIALS), true);
assert.equal(svsAuth.includes('username: "isozaki"'), false);
assert.equal(redeem.includes("username:'isozaki'"), false);
assert.ok(svsAuth.includes('window.DES_ADMIN_CREDENTIALS || null'));
assert.ok(redeem.includes('globalThis.DES_ADMIN_CREDENTIALS||null'));
assert.ok(svsHtml.indexOf('../../assets/admin-auth.js?v=3.38') < svsHtml.indexOf('auth.js?v=3.38'));
assert.ok(redeemHtml.indexOf('../../assets/admin-auth.js?v=3.39') < redeemHtml.indexOf('./redeem.js?v=3.39'));
console.log('PASS shared administrator credentials: one immutable source, both apps fail closed');
