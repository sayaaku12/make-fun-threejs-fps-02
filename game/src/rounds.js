// Rounds: the match state machine and the economy. A match is first to 7
// round wins (at most 13 rounds); every round is buy phase, then live play,
// then a result. Kills pay $300, a round win $3,250, a loss $1,900 plus
// $500 per consecutive loss up to $3,400, planting or defusing $300.
// The module owns the timers and the money; main.js owns the actors and
// calls back in when the round's actors change.
import { MAP } from './map.js';
import { WEAPONS, GRENADE_PRICE, ARMOR_PRICE } from './weapons.js';

export const WIN_SCORE = 7;
export const MAX_ROUNDS = 13;
export const KILL_REWARD = 300;
export const WIN_REWARD = 3250;
export const LOSS_REWARD = 1900;
export const LOSS_STREAK_BONUS = 500;
export const LOSS_REWARD_CAP = 3400;
export const PLANT_REWARD = 300;

export const BUY_ITEMS = [
  { id: 'rifle', label: 'AR-77 Dune — rifle', price: WEAPONS.rifle.price, key: '1' },
  { id: 'smg', label: 'VK-9 Raptor — SMG', price: WEAPONS.smg.price, key: '2' },
  { id: 'shotgun', label: 'SG-12 Breacher — shotgun', price: WEAPONS.shotgun.price, key: '3' },
  { id: 'sniper', label: 'LW-50 Longshot — sniper', price: WEAPONS.sniper.price, key: '4' },
  { id: 'grenade', label: 'Frag grenade', price: GRENADE_PRICE, key: '5' },
  { id: 'armor', label: 'Kevlar vest', price: ARMOR_PRICE, key: '6' },
];

export function createRounds(hooks) {
  const G = {
    phase: 'menu', // menu | buy | live | over
    round: 0,
    scoreV: 0,
    scoreE: 0,
    money: 800,
    lossStreak: 0,
    roundTime: MAP.roundTime,
    buyTime: MAP.buyTime,
    attackSite: 'A',
    plantedSite: null,
    fuseTime: 0,
    plantProgress: 0,
    defuseProgress: 0,
    planting: false,
    defusing: false,
    matchWinner: null,
    matchReason: '',
    roundWinner: null,
    roundReason: '',
    grenades: 1,
    armor: 0,
  };

  function startMatch() {
    G.round = 0;
    G.scoreV = 0;
    G.scoreE = 0;
    G.money = 800;
    G.lossStreak = 0;
    G.matchWinner = null;
    G.matchReason = '';
    G.grenades = 1;
    G.armor = 0;
    startBuyPhase();
  }

  function startBuyPhase() {
    G.round += 1;
    G.phase = 'buy';
    G.buyTime = MAP.buyTime;
    G.plantedSite = null;
    G.fuseTime = 0;
    G.plantProgress = 0;
    G.defuseProgress = 0;
    G.planting = false;
    G.defusing = false;
    G.roundWinner = null;
    G.roundReason = '';
    // The called site alternates each round so both lanes see play.
    G.attackSite = G.round % 2 === 1 ? 'A' : 'B';
    hooks.onBuyPhase(G);
  }

  function startRound() {
    if (G.phase === 'live') return;
    G.phase = 'live';
    G.roundTime = MAP.roundTime;
    hooks.onRoundStart(G);
  }

  function award(amount) {
    G.money += amount;
    hooks.hud.setMoney(G.money);
  }

  function endRound(winner, reason) {
    if (G.phase === 'over') return;
    G.phase = 'over';
    G.roundWinner = winner;
    G.roundReason = reason;
    if (winner === 'vanguard') {
      G.scoreV += 1;
      award(WIN_REWARD);
      G.lossStreak = 0;
      hooks.audio.roundWin();
    } else {
      G.scoreE += 1;
      const lossPay = Math.min(LOSS_REWARD_CAP, LOSS_REWARD + G.lossStreak * LOSS_STREAK_BONUS);
      award(lossPay);
      G.lossStreak += 1;
      hooks.audio.roundLose();
    }
    hooks.hud.setScore(G.scoreV, G.scoreE);
    hooks.hud.banner(winner === 'vanguard' ? 'ROUND WON' : 'ROUND LOST', reason);
    if (G.scoreV >= WIN_SCORE || G.scoreE >= WIN_SCORE || G.round >= MAX_ROUNDS) {
      G.matchWinner = G.scoreV > G.scoreE ? 'vanguard' : G.scoreE > G.scoreV ? 'ember' : 'draw';
      G.matchReason = G.matchWinner === 'draw'
        ? 'Dead even after 13 rounds.'
        : `${G.matchWinner === 'vanguard' ? 'Vanguard' : 'Ember'} takes the match ${Math.max(G.scoreV, G.scoreE)}–${Math.min(G.scoreV, G.scoreE)}.`;
      hooks.onMatchEnd(G);
    } else {
      hooks.onRoundEnd(G);
    }
  }

  // The round clock and the fuse. Returns an event string when the round
  // ends by itself ('time' | 'fuse'), otherwise null.
  function tick(dt) {
    if (G.phase !== 'live') return null;
    if (G.plantedSite) {
      G.fuseTime -= dt;
      if (G.fuseTime <= 0) {
        endRound('vanguard', 'The charge detonated at Site ' + G.plantedSite + '.');
        return 'fuse';
      }
    } else {
      G.roundTime -= dt;
      if (G.roundTime <= 0) {
        endRound('ember', 'Time expired — the charge was never planted.');
        return 'time';
      }
    }
    return null;
  }

  function tickBuy(dt) {
    if (G.phase !== 'buy') return;
    G.buyTime -= dt;
    // The round itself starts only when the player clicks Deploy (main.js
    // moves buy -> ready -> live), so the clock never runs while unlocked.
  }

  function buy(id) {
    if (G.phase !== 'buy') return false;
    if (id === 'grenade') {
      if (G.money < GRENADE_PRICE || G.grenades >= 2) return false;
      G.money -= GRENADE_PRICE;
      G.grenades += 1;
      hooks.audio.buy();
      hooks.hud.setMoney(G.money);
      hooks.hud.setGrenades(G.grenades);
      return true;
    }
    if (id === 'armor') {
      if (G.money < ARMOR_PRICE || G.armor >= 100) return false;
      G.money -= ARMOR_PRICE;
      G.armor = 100;
      hooks.audio.buy();
      hooks.hud.setMoney(G.money);
      hooks.hud.setArmor(G.armor);
      return true;
    }
    const def = WEAPONS[id];
    if (!def || G.money < def.price) return false;
    G.money -= def.price;
    hooks.audio.buy();
    hooks.hud.setMoney(G.money);
    hooks.onBuyWeapon(id);
    return true;
  }

  return {
    state: G,
    startMatch, startBuyPhase, startRound, endRound, tick, tickBuy, buy, award,
  };
}
