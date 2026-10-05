(function (root) {
  'use strict';
  const troops = ['infantry', 'lancer', 'marksman'];
  function normalizeState(input, heroes) {
    const s = input && typeof input === 'object' ? input : {};
    const generation = Math.max(1, Math.min(8, Number.parseInt(s.generation, 10) || 8));
    const available = id => heroes.find(h => h.id === id && h.generation <= generation);
    return {
      generation,
      leaders: troops.map((t, i) => available(s.leaders?.[i])?.troopType === t ? s.leaders[i] : ''),
      joiners: Array.from({ length: 4 }, (_, i) => available(s.joiners?.[i]) ? s.joiners[i] : ''),
      purpose: s.purpose === 'defense' ? 'defense' : 'attack',
      mode: s.mode === 'all' ? 'all' : 'primary',
      search: typeof s.search === 'string' ? s.search.slice(0, 100) : '',
      troop: troops.includes(s.troop) ? s.troop : 'all',
      trigger: ['constant','probability','periodic','periodic_delayed','conditional','accumulating','utility','decaying','on_attack','critical'].includes(s.trigger) ? s.trigger : 'all',
      frame: ['A',"A'",'B','C','D','E','F','G','H','I','J','S','S+','CRIT','DEF','SH','EV','CC','CITY'].includes(s.frame) ? s.frame : '',
      basis: 'description'
    };
  }
  const slots = skill => skill.slots;
  function leaderFrames(state, heroes) {
    return new Set(state.leaders.flatMap(id => heroes.find(h => h.id === id)?.skills.flatMap(s => slots(s, state.basis)) || []));
  }
  function filterHeroes(heroes, state) {
    const q = state.search.trim().toLocaleLowerCase();
    return heroes.filter(h => {
      const ss = state.mode === 'primary' ? h.skills.filter(s => s.isPrimary) : h.skills;
      return h.generation <= state.generation && (state.troop === 'all' || h.troopType === state.troop)
        && (!q || [h.name,h.nameEn,...h.aliases,...ss.map(s => s.effect)].join(' ').toLocaleLowerCase().includes(q))
        && ss.some(s => (state.trigger === 'all' || s.trigger.type === state.trigger) && (!state.frame || slots(s,state.basis).includes(state.frame)));
    });
  }
  // Pedagogic deterministic model, not the game's damage formula.
  function resolveRound(left, right, rate = 12) {
    const a = left.map(v => Math.max(0, Math.min(1500, Math.floor(Number(v) || 0))));
    const b = right.map(v => Math.max(0, Math.min(1500, Math.floor(Number(v) || 0))));
    const p = Math.max(1, Math.min(100, Number(rate) || 12)) / 100;
    const targetA = a.findIndex(v => v > 0), targetB = b.findIndex(v => v > 0);
    const damageToA = [0,0,0], damageToB = [0,0,0];
    if (targetA >= 0 && targetB >= 0) {
      damageToA[targetA] = b.reduce((sum, n) => sum + (n ? Math.ceil(n * p) : 0), 0);
      damageToB[targetB] = a.reduce((sum, n) => sum + (n ? Math.ceil(n * p) : 0), 0);
    }
    return { left: a.map((n,i) => Math.max(0,n-damageToA[i])), right: b.map((n,i) => Math.max(0,n-damageToB[i])), damageToA, damageToB, targetA, targetB };
  }
  const api = { troops, normalizeState, slots, leaderFrames, filterHeroes, resolveRound };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.WOS_CORE = api;
})(typeof window !== 'undefined' ? window : globalThis);
