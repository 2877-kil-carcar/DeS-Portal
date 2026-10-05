// Data and UI evidence regressions. No network or live game testing.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const d = JSON.parse(fs.readFileSync(path.join(root, 'wos_rally_joiner_gen1-8.json'), 'utf8'));
const hero = id => d.heroes.find(h => h.id === id);
const skill = (id, n) => hero(id).skills[n - 1];
let count = 0;
function test(name, fn) { fn(); console.log('PASS', name); count++; }

test('91 skills have separate published evidence and unverified mechanics', () => {
  assert.equal(d.verifiedAsOf, undefined);
  assert.equal(d.reviewedAsOf, '2026-10-04');
  assert.ok(d.evidencePolicy.extractionNote.includes('83/91'));
  for (const h of d.heroes) for (const s of h.skills) {
    assert.ok(s.evidence.adoptionReason && s.evidence.sourceCheckedAt);
    assert.ok(s.sourceUrls.includes(s.evidence.adoptedSourceUrl), h.id);
    assert.equal(new URL(s.evidence.adoptedSourceUrl).protocol, 'https:');
    assert.equal(s.mechanicsVerified, false);
    assert.equal(h.stacking.pvpVerified, false);
    assert.equal(h.stacking.exactFormula, null);
    assert.ok(h.recommendations.basis.startsWith('【推論】'));
  }
});
test('name extraction counts are not semantic pass counts', () => {
  assert.equal(d.heroes.reduce((n, h) => n + h.thirdSourceCheck.nameMatchCount, 0), 83);
  for (const h of d.heroes) {
    assert.equal(h.thirdSourceCheck.matchedCount, undefined);
    assert.ok(h.thirdSourceCheck.countMeaning.includes('名称'));
  }
});
test('correct hero-specific source URLs and historical URL anomaly', () => {
  assert.ok(skill('gwen', 1).evidence.adoptedSourceUrl.endsWith('/gwen-2/'));
  assert.ok(skill('ling-xue', 1).evidence.adoptedSourceUrl.endsWith('/ling-shuang/'));
  assert.ok(!hero('gwen').sources.includes('https://www.whiteoutsurvival.wiki/heroes/gwen/'));
  assert.ok(hero('norah').thirdSourceCheck.manualAssessment.includes('ノラ'));
});
test('Gwen third skill keeps enemy scope and uncertain actor/timing', () => {
  const s = skill('gwen', 3);
  assert.ok(s.target.includes('敵全部隊') && s.target.includes('資料差'));
  assert.ok(s.condition.includes('未確認'));
  assert.equal(s.evidence.status, 'provisional-conflict');
  assert.equal(s.components[0].target, s.target);
  assert.equal(s.trigger.every, 4);
});
test('Gordon official Lv3 provisional value is consistent everywhere', () => {
  const s = skill('gordon', 3);
  assert.equal(s.levelValues[0].scale, '6% / 12% / 18% / 24% / 30%');
  assert.equal(s.levelValues[1].scale, '6% / 12% / 15% / 24% / 30%');
  assert.ok(s.effect.includes('6/12/15/24/30%'));
  assert.ok(s.components[1].effect.includes('6/12/15/24/30%'));
  assert.ok(s.verificationNotes.join(' ').includes('18%'));
  assert.equal(s.evidence.status, 'provisional-conflict');
});
test('disagreements remain visible instead of becoming verified formulas', () => {
  for (const [id,n] of [['gwen',2],['gwen',3],['mia',2],['philly',2],['gordon',3]]) {
    assert.equal(skill(id,n).evidence.status, 'provisional-conflict');
  }
  assert.deepEqual(skill('wayne',3).slots, ['CRIT']);
  assert.ok(skill('wayne',3).verificationNotes.join(' ').includes('伝聞'));
  assert.equal(hero('renee').stacking.status, 'disputed');
});
test('evidence UI exists in hub and generated single-file version', () => {
  for (const file of ['index.html','standalone.html']) {
    const html = fs.readFileSync(path.join(root,file),'utf8');
    assert.ok(html.includes('id="evidence-policy"'));
    assert.ok(html.includes('ゴードン③'));
  }
  const app = fs.readFileSync(path.join(root,'assets/app.js'),'utf8');
  assert.ok(app.includes('skillEvidence(s)'));
  assert.ok(app.includes('evidenceTag(s)'));
});
console.log(`${count} evidence test groups passed`);
