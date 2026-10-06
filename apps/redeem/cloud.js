(() => {
  'use strict';
  const config = {
    apiKey: 'AIzaSyDpkyMsrC8_5Xif_GOQdYk1p0cuM9Aj1dY',
    authDomain: 'des-portal-gift-code.firebaseapp.com',
    projectId: 'des-portal-gift-code',
    storageBucket: 'des-portal-gift-code.firebasestorage.app',
    messagingSenderId: '306057358747',
    appId: '1:306057358747:web:b242982e7aeb08b879c53e'
  };
  const app = firebase.apps.find(item => item.name === 'des-redeem') || firebase.initializeApp(config, 'des-redeem');
  const auth = app.auth(), db = app.firestore();
  const playersRef = db.collection('redeemPlayers');
  const historyRef = db.collection('redeemHistory');
  const migrationRef = db.collection('redeemMeta').doc('local-v1');
  let players = [], history = {}, stopPlayers = null, stopHistory = null, onState = () => {};

  function normalizedPlayer(value) {
    return {fid: String(value.fid || ''), kid: String(value.kid || '2856'), name: String(value.name || '').slice(0, 100)};
  }
  function emit() { onState({kingdom: '2856', players: [...players].sort((a,b) => a.name.localeCompare(b.name, 'ja')), history}); }
  function rebuildHistory(snapshot) {
    history = {};
    snapshot.docs.forEach(item => {
      const value = item.data(), cdk = String(value.cdk || ''), fid = String(value.fid || '');
      if (cdk && fid) (history[cdk] ||= {})[fid] = {
        msg: String(value.msg || ''),
        at: String(value.atText || ''),
        atMillis: Number(value.updatedAt?.toMillis?.() || Date.parse(value.atText || '') || 0)
      };
    });
  }
  function historyId(cdk, fid) { return encodeURIComponent(cdk) + '--' + fid; }

  async function migrate(localState) {
    const [marker, remotePlayers] = await Promise.all([migrationRef.get(), playersRef.limit(1).get()]);
    if (marker.exists) return;
    const batch = db.batch();
    if (remotePlayers.empty) {
      (localState.players || []).forEach(value => {
        const player = normalizedPlayer(value);
        if (player.fid) batch.set(playersRef.doc(player.fid), {...player, updatedAt: firebase.firestore.FieldValue.serverTimestamp()});
      });
      Object.entries(localState.history || {}).forEach(([cdk, records]) => Object.entries(records || {}).forEach(([fid, record]) => {
        batch.set(historyRef.doc(historyId(cdk, fid)), {cdk, fid, msg: String(record.msg || ''), atText: String(record.at || ''), updatedAt: firebase.firestore.FieldValue.serverTimestamp()});
      }));
    }
    batch.set(migrationRef, {done: true, at: firebase.firestore.FieldValue.serverTimestamp()});
    await batch.commit();
  }

  async function connect(localState, callback, onError) {
    onState = callback;
    await auth.signInAnonymously();
    await migrate(localState || {players: [], history: {}});
    stopPlayers?.(); stopHistory?.();
    stopPlayers = playersRef.onSnapshot(snapshot => { players = snapshot.docs.map(item => normalizedPlayer(item.data())); emit(); }, onError);
    stopHistory = historyRef.onSnapshot(snapshot => { rebuildHistory(snapshot); emit(); }, onError);
  }
  async function setPlayer(value) {
    const player = normalizedPlayer(value);
    await playersRef.doc(player.fid).set({...player, updatedAt: firebase.firestore.FieldValue.serverTimestamp()});
  }
  async function deletePlayer(fid) { await playersRef.doc(String(fid)).delete(); }
  async function recordHistory(cdk, fid, result) {
    await historyRef.doc(historyId(cdk, fid)).set({cdk, fid: String(fid), msg: String(result.msg || ''), atText: new Date().toLocaleString('ja-JP'), updatedAt: firebase.firestore.FieldValue.serverTimestamp()});
  }
  window.WOS_REDEEM_CLOUD = {connect, setPlayer, deletePlayer, recordHistory};
})();
