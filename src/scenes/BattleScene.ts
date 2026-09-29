import Phaser from 'phaser';
import { abilityById, classesData, heroById } from '../data';
import { Battle, type BattleEvent, type Combatant, type StatusId } from '../core/battle';
import type { Ability } from '../types/game';

// Equipos del prototipo. Más adelante saldrán de la selección de equipo y de las misiones.
const PLAYER_TEAM = ['hulk', 'iron_man', 'captain_america'];
const ENEMY_TEAM = ['wolverine', 'black_widow', 'thor'];

const ENEMY_TURN_DELAY_MS = 800;
const CARD_W = 220;
const CARD_H = 100;

const CLASS_COLORS: Record<string, number> = {
  bruiser: 0xd9534f,
  blaster: 0xf0ad4e,
  tactician: 0x5bc0de,
  scrapper: 0x9b59b6,
  infiltrator: 0x2ecc71,
  generalist: 0xaaaaaa,
};

const STATUS_LABELS: Record<StatusId, string> = {
  stun: 'Aturdido',
  attack_up: 'Ataque+',
  defense_down: 'Defensa-',
  accuracy_up: 'Precisión+',
  accuracy_down: 'Precisión-',
  bleed: 'Sangrado',
  regeneration: 'Regeneración',
};

interface CombatantView {
  frame: Phaser.GameObjects.Rectangle;
  healthBar: Phaser.GameObjects.Rectangle;
  staminaBar: Phaser.GameObjects.Rectangle;
  healthText: Phaser.GameObjects.Text;
  statusText: Phaser.GameObjects.Text;
}

/** Escena de combate 3 contra 3: el jugador elige habilidad y objetivo, los enemigos usan la IA. */
export class BattleScene extends Phaser.Scene {
  private battle!: Battle;
  private views = new Map<string, CombatantView>();
  private abilityButtons: Phaser.GameObjects.GameObject[] = [];
  private pendingAbility: Ability | null = null;
  private logLines: string[] = [];
  private logText!: Phaser.GameObjects.Text;
  private turnText!: Phaser.GameObjects.Text;
  private busy = false;

  constructor() {
    super('Battle');
  }

  create(): void {
    this.views.clear();
    this.abilityButtons = [];
    this.pendingAbility = null;
    this.logLines = [];
    this.busy = false;

    this.battle = new Battle({
      players: PLAYER_TEAM.map((id) => heroById.get(id)!),
      enemies: ENEMY_TEAM.map((id) => heroById.get(id)!),
      abilityById,
      classesData,
      rng: Math.random,
    });

    const { width } = this.scale;
    this.turnText = this.add
      .text(width / 2, 20, '', { fontFamily: 'sans-serif', fontSize: '20px', color: '#ffffff' })
      .setOrigin(0.5, 0);

    this.battle.combatants.forEach((c) => this.createCombatantView(c));

    this.logText = this.add.text(40, 476, '', {
      fontFamily: 'monospace',
      fontSize: '13px',
      color: '#c8d0e6',
      lineSpacing: 2,
    });

    this.handleEvents(this.battle.start());
  }

  private cardPosition(c: Combatant): { x: number; y: number } {
    const index = Number(c.uid.split('-')[1]);
    const x = c.team === 'player' ? 40 : this.scale.width - 40 - CARD_W;
    return { x, y: 60 + index * (CARD_H + 12) };
  }

  private createCombatantView(c: Combatant): void {
    const { x, y } = this.cardPosition(c);
    const frame = this.add
      .rectangle(x, y, CARD_W, CARD_H, 0x1a2135)
      .setOrigin(0)
      .setStrokeStyle(2, 0x2c3654)
      .setInteractive({ useHandCursor: true })
      .on('pointerdown', () => this.onCombatantClicked(c));

    this.add.rectangle(x, y, 6, CARD_H, CLASS_COLORS[c.hero.classId] ?? 0xffffff).setOrigin(0);
    const className = classesData.classes.find((k) => k.id === c.hero.classId)?.name ?? '';
    this.add.text(x + 14, y + 8, c.hero.name, { fontFamily: 'sans-serif', fontSize: '17px', color: '#ffffff' });
    this.add.text(x + 14, y + 30, className, { fontFamily: 'sans-serif', fontSize: '12px', color: '#9aa4bf' });

    const barW = CARD_W - 28;
    this.add.rectangle(x + 14, y + 52, barW, 10, 0x3a1f25).setOrigin(0);
    const healthBar = this.add.rectangle(x + 14, y + 52, barW, 10, 0x4caf50).setOrigin(0);
    this.add.rectangle(x + 14, y + 66, barW, 6, 0x1f2a3a).setOrigin(0);
    const staminaBar = this.add.rectangle(x + 14, y + 66, barW, 6, 0x42a5f5).setOrigin(0);
    const healthText = this.add
      .text(x + CARD_W - 14, y + 30, '', { fontFamily: 'sans-serif', fontSize: '12px', color: '#ffffff' })
      .setOrigin(1, 0);
    const statusText = this.add.text(x + 14, y + 80, '', {
      fontFamily: 'sans-serif',
      fontSize: '11px',
      color: '#ffcc66',
      wordWrap: { width: barW },
    });

    this.views.set(c.uid, { frame, healthBar, staminaBar, healthText, statusText });
  }

  private refresh(): void {
    const current = this.battle.current;
    const targets = this.pendingAbility && current ? this.battle.selectableTargets(current, this.pendingAbility) : [];
    for (const c of this.battle.combatants) {
      const v = this.views.get(c.uid)!;
      const barW = CARD_W - 28;
      v.healthBar.width = (barW * c.health) / c.stats.health;
      v.staminaBar.width = (barW * c.stamina) / c.stats.stamina;
      v.healthText.setText(`${c.health} / ${c.stats.health}`);
      v.statusText.setText(c.statuses.map((s) => `${STATUS_LABELS[s.id] ?? s.id} (${s.turnsLeft})`).join(' · '));
      v.frame.setAlpha(c.health > 0 ? 1 : 0.35);

      let stroke = 0x2c3654;
      if (current === c) stroke = 0xffffff;
      if (targets.includes(c)) stroke = 0xffcc00;
      v.frame.setStrokeStyle(current === c || targets.includes(c) ? 3 : 2, stroke);
    }
  }

  private handleEvents(events: BattleEvent[]): void {
    for (const e of events) {
      const line = this.describe(e);
      if (line) this.logLines.push(line);
    }
    this.logLines = this.logLines.slice(-7);
    this.logText.setText(this.logLines.join('\n'));
    this.refresh();

    if (this.battle.winner) return this.showEnd();

    const current = this.battle.current!;
    const who = current.team === 'player' ? 'Tu turno' : 'Turno enemigo';
    this.turnText.setText(`Ronda ${this.battle.round} · ${who}: ${current.hero.name}`);

    if (current.team === 'player') {
      this.showAbilityButtons(current);
    } else {
      this.clearAbilityButtons();
      this.busy = true;
      this.time.delayedCall(ENEMY_TURN_DELAY_MS, () => {
        this.busy = false;
        const { abilityId, targetUid } = this.battle.chooseAiAction(current);
        this.handleEvents(this.battle.act(abilityId, targetUid));
      });
    }
  }

  private showAbilityButtons(actor: Combatant): void {
    this.clearAbilityButtons();
    const options = this.battle.abilityOptions(actor);
    const btnW = 200;
    const gap = 12;
    const startX = (this.scale.width - (options.length * btnW + (options.length - 1) * gap)) / 2;
    options.forEach((opt, i) => {
      const x = startX + i * (btnW + gap);
      const y = 410;
      const selected = this.pendingAbility?.id === opt.ability.id;
      const bg = this.add
        .rectangle(x, y, btnW, 52, selected ? 0x3d4f80 : 0x243052)
        .setOrigin(0)
        .setStrokeStyle(2, opt.usable ? 0x5b6fa8 : 0x333a4d)
        .setAlpha(opt.usable ? 1 : 0.5);
      const cd = actor.cooldowns[opt.ability.id] ?? 0;
      const detail =
        opt.reason === 'cooldown'
          ? `Espera ${cd} turno${cd === 1 ? '' : 's'}`
          : `Aguante ${opt.ability.staminaCost}`;
      const label = this.add.text(x + 10, y + 8, `${opt.ability.name}\n${detail}`, {
        fontFamily: 'sans-serif',
        fontSize: '13px',
        color: opt.usable ? '#ffffff' : '#8088a0',
      });
      if (opt.usable) {
        bg.setInteractive({ useHandCursor: true }).on('pointerdown', () => this.onAbilityClicked(opt.ability));
      }
      this.abilityButtons.push(bg, label);
    });
  }

  private clearAbilityButtons(): void {
    this.abilityButtons.forEach((b) => b.destroy());
    this.abilityButtons = [];
  }

  private onAbilityClicked(ability: Ability): void {
    const actor = this.battle.current;
    if (this.busy || !actor || actor.team !== 'player') return;
    if (this.battle.selectableTargets(actor, ability).length === 0) {
      this.pendingAbility = null;
      this.handleEvents(this.battle.act(ability.id));
      return;
    }
    this.pendingAbility = ability;
    this.showAbilityButtons(actor);
    this.refresh();
  }

  private onCombatantClicked(target: Combatant): void {
    const actor = this.battle.current;
    const ability = this.pendingAbility;
    if (this.busy || !actor || !ability || actor.team !== 'player') return;
    if (!this.battle.selectableTargets(actor, ability).includes(target)) return;
    this.pendingAbility = null;
    this.handleEvents(this.battle.act(ability.id, target.uid));
  }

  private describe(e: BattleEvent): string | null {
    const name = (uid: string) => this.battle.get(uid).hero.name;
    switch (e.type) {
      case 'ability':
        return `${name(e.actor)} usa ${abilityById.get(e.abilityId)?.name ?? e.abilityId}`;
      case 'damage': {
        const tag = e.matchup === 'advantage' ? ' (ventaja)' : e.matchup === 'disadvantage' ? ' (desventaja)' : '';
        return `  ${name(e.target)} recibe ${e.amount} de daño${tag}`;
      }
      case 'miss':
        return `  ${name(e.target)} esquiva el ataque`;
      case 'heal':
        return `${name(e.target)} recupera ${e.amount} de vida`;
      case 'bleed':
        return `${name(e.target)} sangra y pierde ${e.amount}`;
      case 'status':
        return `  ${name(e.target)}: ${STATUS_LABELS[e.status] ?? e.status}`;
      case 'stunned':
        return `${name(e.target)} está aturdido y pierde el turno`;
      case 'ko':
        return `  ¡${name(e.target)} queda fuera de combate!`;
      default:
        return null;
    }
  }

  private showEnd(): void {
    this.clearAbilityButtons();
    const { width, height } = this.scale;
    const won = this.battle.winner === 'player';
    this.turnText.setText('');
    this.add.rectangle(0, 0, width, height, 0x000000, 0.6).setOrigin(0);
    this.add
      .text(width / 2, height / 2 - 20, won ? '¡Victoria!' : 'Derrota', {
        fontFamily: 'sans-serif',
        fontSize: '44px',
        color: won ? '#66ff99' : '#ff6666',
      })
      .setOrigin(0.5);
    this.add
      .text(width / 2, height / 2 + 30, 'Haz clic para jugar otra vez', {
        fontFamily: 'sans-serif',
        fontSize: '16px',
        color: '#ffffff',
      })
      .setOrigin(0.5);
    // Espera un poco para que el mismo clic que terminó el combate no lo reinicie.
    this.time.delayedCall(300, () => this.input.once('pointerdown', () => this.scene.restart()));
  }
}
