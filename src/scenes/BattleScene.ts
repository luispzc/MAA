import Phaser from 'phaser';
import { abilityById, classesData, heroById } from '../data';
import {
  canUseAbility,
  chooseAiAction,
  createBattle,
  currentActor,
  describeEvent,
  performAction,
  selectableTargets,
  statusName,
  type Action,
  type BattleEvent,
  type BattleState,
  type Combatant,
} from '../core/combat';
import type { Ability, HeroClassId } from '../types/game';

/** Equipos del prototipo. Más adelante saldrán de la pantalla de selección. */
const PLAYER_TEAM = ['iron_man', 'captain_america', 'thor'];
const ENEMY_TEAM = ['hulk', 'wolverine', 'black_widow'];

const CLASS_COLORS: Record<HeroClassId, number> = {
  blaster: 0xd9822b,
  bruiser: 0x3fa34d,
  scrapper: 0xb83b5e,
  infiltrator: 0x6c4ab6,
  tactician: 0x2f6fbf,
  generalist: 0x7d8597,
};

const FONT = 'sans-serif';
const CARD_W = 270;
const CARD_H = 104;
const ENEMY_DELAY = 750;
const AFTER_ACTION_DELAY = 650;
const LOG_LINES = 17;

type Mode = 'busy' | 'choose-ability' | 'choose-target' | 'over';

interface CardView {
  bg: Phaser.GameObjects.Rectangle;
  hpFill: Phaser.GameObjects.Rectangle;
  hpText: Phaser.GameObjects.Text;
  staminaFill: Phaser.GameObjects.Rectangle;
  statusText: Phaser.GameObjects.Text;
  koShade: Phaser.GameObjects.Rectangle;
  x: number;
  y: number;
}

/** Combate 3 contra 3. La lógica vive en src/core/combat; aquí solo se dibuja y se recibe la entrada. */
export class BattleScene extends Phaser.Scene {
  private state!: BattleState;
  private mode: Mode = 'busy';
  private cards = new Map<string, CardView>();
  private pendingAbility: Ability | null = null;
  private logLines: string[] = [];
  private logText!: Phaser.GameObjects.Text;
  private headerText!: Phaser.GameObjects.Text;
  private hintText!: Phaser.GameObjects.Text;
  private actionButtons: Phaser.GameObjects.GameObject[] = [];

  constructor() {
    super('Battle');
  }

  create(): void {
    const hero = (id: string) => {
      const h = heroById.get(id);
      if (!h) throw new Error(`No existe el héroe ${id}`);
      return h;
    };
    this.state = createBattle(PLAYER_TEAM.map(hero), ENEMY_TEAM.map(hero), { classes: classesData, abilityById });
    this.cards.clear();
    this.logLines = [];
    this.actionButtons = [];
    this.mode = 'busy';

    const { width } = this.scale;
    this.headerText = this.add.text(width / 2, 22, '', { fontFamily: FONT, fontSize: '20px', color: '#ffffff' }).setOrigin(0.5);
    this.add.text(40, 44, 'Tu equipo', { fontFamily: FONT, fontSize: '14px', color: '#9aa4bf' });
    this.add.text(width - 40, 44, 'Enemigos', { fontFamily: FONT, fontSize: '14px', color: '#9aa4bf' }).setOrigin(1, 0);

    this.add.rectangle(width / 2, 222, 330, 340, 0x121829).setStrokeStyle(1, 0x2a3350);
    this.logText = this.add.text(width / 2 - 155, 62, '', {
      fontFamily: FONT,
      fontSize: '13px',
      color: '#c9d1e6',
      wordWrap: { width: 310 },
      lineSpacing: 4,
    });
    this.hintText = this.add.text(width / 2, 578, '', { fontFamily: FONT, fontSize: '14px', color: '#9aa4bf' }).setOrigin(0.5);

    for (const c of this.state.combatants) this.createCard(c);
    this.pushLog(this.state.log);
    this.refresh();

    if (import.meta.env.DEV) (window as unknown as { __maa: unknown }).__maa = this;
    this.nextTurn();
  }

  /** Estado actual de la batalla (solo lectura; útil para depurar desde la consola). */
  get battle(): BattleState {
    return this.state;
  }

  private createCard(c: Combatant): void {
    const x = c.team === 'player' ? 40 : this.scale.width - 40 - CARD_W;
    const y = 66 + c.slot * (CARD_H + 16);
    const bg = this.add.rectangle(x, y, CARD_W, CARD_H, 0x161d31).setOrigin(0).setStrokeStyle(2, 0x2a3350);
    bg.on('pointerdown', () => this.onCardClicked(c.uid));
    this.add.rectangle(x, y, 8, CARD_H, CLASS_COLORS[c.classId]).setOrigin(0);
    this.add.text(x + 18, y + 8, c.name, { fontFamily: FONT, fontSize: '17px', color: '#ffffff', fontStyle: 'bold' });
    const className = classesData.classes.find((k) => k.id === c.classId)?.name ?? c.classId;
    this.add
      .text(x + CARD_W - 10, y + 10, className, { fontFamily: FONT, fontSize: '12px', color: '#9aa4bf' })
      .setOrigin(1, 0);

    const barW = CARD_W - 28;
    this.add.rectangle(x + 18, y + 38, barW, 14, 0x2a3350).setOrigin(0);
    const hpFill = this.add.rectangle(x + 18, y + 38, barW, 14, 0x3fbf6a).setOrigin(0);
    const hpText = this.add.text(x + 18 + barW / 2, y + 45, '', { fontFamily: FONT, fontSize: '11px', color: '#ffffff' }).setOrigin(0.5);
    this.add.rectangle(x + 18, y + 57, barW, 6, 0x2a3350).setOrigin(0);
    const staminaFill = this.add.rectangle(x + 18, y + 57, barW, 6, 0x3d8bfd).setOrigin(0);
    const statusText = this.add.text(x + 18, y + 70, '', {
      fontFamily: FONT,
      fontSize: '12px',
      color: '#f2c14e',
      wordWrap: { width: barW },
    });
    const koShade = this.add.rectangle(x, y, CARD_W, CARD_H, 0x0b0f1a, 0.6).setOrigin(0).setVisible(false);
    this.cards.set(c.uid, { bg, hpFill, hpText, staminaFill, statusText, koShade, x, y });
  }

  private refresh(): void {
    const actor = currentActor(this.state);
    const targets =
      this.mode === 'choose-target' && actor && this.pendingAbility
        ? new Set(selectableTargets(this.state, actor, this.pendingAbility).map((t) => t.uid))
        : new Set<string>();

    for (const c of this.state.combatants) {
      const view = this.cards.get(c.uid)!;
      const hpRatio = c.hp / c.stats.health;
      view.hpFill.width = (CARD_W - 28) * hpRatio;
      view.hpFill.fillColor = hpRatio > 0.5 ? 0x3fbf6a : hpRatio > 0.25 ? 0xe0b53d : 0xd9483b;
      view.hpText.setText(c.hp > 0 ? `${c.hp} / ${c.stats.health}` : 'Fuera de combate');
      view.staminaFill.width = (CARD_W - 28) * (c.stamina / c.stats.stamina);
      view.statusText.setText(c.statuses.map((s) => `${statusName(s.id)} ${s.turnsLeft}`).join(' · '));

      const isActor = actor?.uid === c.uid;
      const isTarget = targets.has(c.uid);
      view.bg.setStrokeStyle(isActor || isTarget ? 3 : 2, isTarget ? 0xff5d5d : isActor ? 0xf2c14e : 0x2a3350);
      view.koShade.setVisible(c.hp === 0);
      if (isTarget) view.bg.setInteractive({ useHandCursor: true });
      else view.bg.disableInteractive();
    }

    this.headerText.setText(
      this.state.winner
        ? this.state.winner === 'player'
          ? '¡Victoria!'
          : 'Derrota'
        : `Ronda ${this.state.round} · Turno de ${actor?.name ?? ''}`,
    );
  }

  private nextTurn(): void {
    this.clearButtons();
    const actor = currentActor(this.state);
    if (!actor) {
      this.showEnd();
      return;
    }
    if (actor.team === 'enemy') {
      this.mode = 'busy';
      this.hintText.setText(`${actor.name} está pensando…`);
      this.refresh();
      this.time.delayedCall(ENEMY_DELAY, () => this.execute(chooseAiAction(this.state)));
      return;
    }
    this.mode = 'choose-ability';
    this.pendingAbility = null;
    this.hintText.setText(`Elige una habilidad para ${actor.name}`);
    this.refresh();
    this.showAbilityButtons(actor);
  }

  private showAbilityButtons(actor: Combatant): void {
    const w = 280;
    const gap = 20;
    const startX = (this.scale.width - (w * 3 + gap * 2)) / 2;
    actor.abilities.forEach((ability, i) => {
      const x = startX + i * (w + gap);
      const y = 440;
      const usable = canUseAbility(actor, ability);
      const bg = this.add
        .rectangle(x, y, w, 110, usable ? 0x1f2a48 : 0x151a28)
        .setOrigin(0)
        .setStrokeStyle(2, usable ? 0x3d8bfd : 0x2a3350);
      const cd = actor.cooldowns[ability.id] ?? 0;
      const detail = [
        ability.damage ? `${ability.damage.min}-${ability.damage.max}${ability.hits > 1 ? ` x${ability.hits}` : ''}` : null,
        ability.staminaCost ? `${ability.staminaCost} stamina` : 'Gratis',
        cd > 0 ? `espera ${cd}` : null,
      ]
        .filter(Boolean)
        .join(' · ');
      const title = this.add.text(x + 12, y + 10, ability.name, {
        fontFamily: FONT,
        fontSize: '16px',
        color: usable ? '#ffffff' : '#5c6580',
        fontStyle: 'bold',
      });
      const info = this.add.text(x + 12, y + 34, detail, { fontFamily: FONT, fontSize: '12px', color: usable ? '#9aa4bf' : '#5c6580' });
      const desc = this.add.text(x + 12, y + 54, ability.description, {
        fontFamily: FONT,
        fontSize: '12px',
        color: usable ? '#c9d1e6' : '#5c6580',
        wordWrap: { width: w - 24 },
      });
      if (usable) {
        bg.setInteractive({ useHandCursor: true });
        bg.on('pointerover', () => bg.setFillStyle(0x2a3a64));
        bg.on('pointerout', () => bg.setFillStyle(0x1f2a48));
        bg.on('pointerdown', () => this.onAbilityChosen(ability));
      }
      this.actionButtons.push(bg, title, info, desc);
    });
  }

  private onAbilityChosen(ability: Ability): void {
    const actor = currentActor(this.state);
    if (this.mode !== 'choose-ability' || !actor) return;
    if (ability.target === 'single_enemy' || ability.target === 'single_ally') {
      this.pendingAbility = ability;
      this.mode = 'choose-target';
      this.clearButtons();
      this.hintText.setText(`${ability.name}: elige un objetivo`);
      const cancel = this.add
        .text(this.scale.width / 2, 490, 'Cancelar', {
          fontFamily: FONT,
          fontSize: '16px',
          color: '#ffffff',
          backgroundColor: '#2a3350',
          padding: { x: 16, y: 8 },
        })
        .setOrigin(0.5)
        .setInteractive({ useHandCursor: true })
        .on('pointerdown', () => this.nextTurn());
      this.actionButtons.push(cancel);
      this.refresh();
      return;
    }
    this.execute({ actorUid: actor.uid, abilityId: ability.id });
  }

  private onCardClicked(uid: string): void {
    const actor = currentActor(this.state);
    if (this.mode !== 'choose-target' || !actor || !this.pendingAbility) return;
    this.execute({ actorUid: actor.uid, abilityId: this.pendingAbility.id, targetUid: uid });
  }

  private execute(action: Action): void {
    this.mode = 'busy';
    this.pendingAbility = null;
    this.clearButtons();
    const events = performAction(this.state, action);
    this.pushLog(events);
    this.animate(events);
    this.refresh();
    this.time.delayedCall(AFTER_ACTION_DELAY, () => this.nextTurn());
  }

  /** Números flotantes de daño, curación y fallos sobre cada carta. */
  private animate(events: BattleEvent[]): void {
    const perCard = new Map<string, number>();
    for (const e of events) {
      let text: string | null = null;
      let color = '#ffffff';
      let uid = '';
      if (e.type === 'damage') {
        uid = e.targetUid;
        text = `-${e.amount}${e.crit ? '!' : ''}`;
        color = e.cause === 'ability' ? (e.crit ? '#ffdd57' : '#ff6b6b') : '#d98cff';
      } else if (e.type === 'heal' && e.amount > 0) {
        uid = e.targetUid;
        text = `+${e.amount}`;
        color = '#6bff9e';
      } else if (e.type === 'miss') {
        uid = e.targetUid;
        text = 'Esquiva';
        color = '#9aa4bf';
      }
      if (!text) continue;
      const view = this.cards.get(uid)!;
      const n = perCard.get(uid) ?? 0;
      perCard.set(uid, n + 1);
      const label = this.add
        .text(view.x + CARD_W / 2, view.y + CARD_H / 2, text, {
          fontFamily: FONT,
          fontSize: '22px',
          color,
          fontStyle: 'bold',
          stroke: '#000000',
          strokeThickness: 4,
        })
        .setOrigin(0.5)
        .setAlpha(0);
      this.tweens.add({
        targets: label,
        y: label.y - 40,
        alpha: { from: 1, to: 0 },
        delay: n * 140,
        duration: 900,
        onComplete: () => label.destroy(),
      });
    }
  }

  private pushLog(events: BattleEvent[]): void {
    for (const e of events) {
      const line = describeEvent(this.state, e);
      if (line) this.logLines.push(line);
    }
    this.logText.setText(this.logLines.slice(-LOG_LINES).join('\n'));
  }

  private clearButtons(): void {
    for (const b of this.actionButtons) b.destroy();
    this.actionButtons = [];
  }

  private showEnd(): void {
    this.mode = 'over';
    this.refresh();
    const won = this.state.winner === 'player';
    this.hintText.setText(`La batalla duró ${this.state.round} rondas.`);
    const { width } = this.scale;
    this.add
      .text(width / 2, 470, won ? '¡Victoria!' : 'Derrota', {
        fontFamily: FONT,
        fontSize: '36px',
        color: won ? '#6bff9e' : '#ff6b6b',
        fontStyle: 'bold',
      })
      .setOrigin(0.5);
    this.add
      .text(width / 2, 530, 'Jugar de nuevo', {
        fontFamily: FONT,
        fontSize: '18px',
        color: '#ffffff',
        backgroundColor: '#3d8bfd',
        padding: { x: 18, y: 10 },
      })
      .setOrigin(0.5)
      .setInteractive({ useHandCursor: true })
      .on('pointerdown', () => this.scene.restart());
  }
}
