import Phaser from 'phaser';
import {
  currentActor,
  getCombatant,
  isAlive,
  isDebuff,
  statusName,
  type Action,
  type BattleEvent,
  type Combatant,
  type Hero,
} from '@maa/shared';
import type { BattleController } from './BattleController';
import { classColor, createFigure, drawStage, figureHeight, figureWidth, preloadArt } from './art';
import { STAGE_H } from './theme';

const FONT = 'sans-serif';
/** Pies de cada héroe del jugador por puesto; los enemigos van en espejo. */
const PLAYER_SPOTS = [
  { x: 205, y: 305 },
  { x: 330, y: 372 },
  { x: 150, y: 440 },
];
const PLATE_W = 124;

interface UnitView {
  root: Phaser.GameObjects.Container;
  body: Phaser.GameObjects.Container;
  ring: Phaser.GameObjects.Ellipse;
  hit: Phaser.GameObjects.Rectangle;
  x: number;
  y: number;
  /** Alto de la figura en pantalla, para poner la placa y los números encima. */
  height: number;
}

/**
 * Escenario de la batalla: fondo, figuras, anillos de selección, placa sobre la
 * cabeza y animaciones. El resto de la interfaz (barra de habilidades, turnos,
 * paneles) es React. La escena solo lee el BattleController y le manda clics.
 */
export class StageScene extends Phaser.Scene {
  private units = new Map<string, UnitView>();
  private plate!: Phaser.GameObjects.Container;
  private battleId = -1;
  private unsubscribe: (() => void)[] = [];

  constructor(
    private readonly controller: BattleController,
    private readonly heroes: readonly Hero[],
  ) {
    super('Stage');
  }

  preload(): void {
    preloadArt(this, this.heroes);
  }

  create(): void {
    this.units.clear();
    this.battleId = this.controller.getSnapshot().battleId;
    const { width } = this.scale;
    drawStage(this, width, STAGE_H);

    const state = this.controller.state;
    // Los de atrás (arriba) se dibujan antes que los de adelante.
    const byDepth = [...state.combatants].sort((a, b) => this.spot(a).y - this.spot(b).y);
    for (const c of byDepth) this.createUnit(c);
    this.plate = this.add.container(0, 0).setDepth(20);

    this.input.mouse?.disableContextMenu();
    this.input.on('pointerdown', (p: Phaser.Input.Pointer) => {
      if (p.rightButtonDown()) this.controller.cancelTarget();
    });

    this.unsubscribe = [
      this.controller.subscribe(() => this.onChange()),
      this.controller.onAction((action, events) => this.animate(action, events)),
    ];
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.unsubscribe.forEach((u) => u()));
    this.refresh();
  }

  private onChange(): void {
    // Jugar de nuevo: se rehace el escenario con los combatientes nuevos.
    if (this.controller.getSnapshot().battleId !== this.battleId) {
      this.scene.restart();
      return;
    }
    this.refresh();
  }

  private spot(c: Combatant): { x: number; y: number } {
    const s = PLAYER_SPOTS[c.slot];
    return c.team === 'player' ? s : { x: this.scale.width - s.x, y: s.y };
  }

  private createUnit(c: Combatant): void {
    const { x, y } = this.spot(c);
    const root = this.add.container(x, y);
    const height = figureHeight(this, c.heroId, c.classId);
    const width = Math.max(80, Math.min(140, figureWidth(this, c.heroId) * 0.8));
    const ring = this.add.ellipse(0, 0, Math.max(96, width), 26).setStrokeStyle(3, 0xffffff).setFillStyle(0xffffff, 0.08).setVisible(false);
    const body = createFigure(this, c.heroId, c.name, c.classId, c.team === 'enemy');
    const hit = this.add.rectangle(0, -height / 2, width, height, 0xffffff, 0);
    root.add([ring, body, hit]);
    hit.on('pointerdown', (p: Phaser.Input.Pointer) => {
      if (!p.rightButtonDown()) this.controller.clickTarget(c.uid);
    });
    hit.on('pointerover', () => this.controller.setHovered(c.uid));
    hit.on('pointerout', () => this.controller.setHovered(null));
    this.tweens.add({
      targets: body,
      y: -3,
      duration: 900 + c.slot * 130,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });
    this.units.set(c.uid, { root, body, ring, hit, x, y, height });
  }

  private refresh(): void {
    const { state, mode, hovered } = this.controller.getSnapshot();
    const actor = currentActor(state);
    const targets = this.controller.targetSet();

    for (const c of state.combatants) {
      const unit = this.units.get(c.uid);
      if (!unit) continue;
      const isActor = actor?.uid === c.uid && mode !== 'over';
      const isTarget = targets.has(c.uid);
      const hot = isTarget && hovered === c.uid;
      unit.ring.setVisible(isActor || isTarget);
      unit.ring.setStrokeStyle(hot ? 4 : 3, isTarget ? 0xff3b30 : 0xffffff);
      unit.ring.setFillStyle(isTarget ? 0xff3b30 : 0xffffff, hot ? 0.25 : 0.08);
      unit.body.setAlpha(isAlive(c) ? 1 : 0.25);
      if (isTarget) unit.hit.setInteractive({ useHandCursor: true });
      else unit.hit.disableInteractive();
    }

    const plateFor = hovered && targets.has(hovered) ? getCombatant(state, hovered) : actor;
    this.drawPlate(mode === 'over' ? null : plateFor);
  }

  /** Placa sobre la cabeza: nombre, vida, stamina y efectos del héroe activo o del objetivo señalado. */
  private drawPlate(c: Combatant | null): void {
    this.plate.removeAll(true);
    if (!c) return;
    const state = this.controller.state;
    const unit = this.units.get(c.uid)!;
    const top = Math.max(84, unit.y - unit.height - 40);
    this.plate.setPosition(unit.x - PLATE_W / 2 + 12, top);
    this.plate.add([
      this.add.circle(-4, 14, 13, classColor(c.classId)).setStrokeStyle(2, 0xffffff),
      this.add
        .text(14, 0, c.name.toUpperCase(), {
          fontFamily: FONT,
          fontSize: '12px',
          color: '#ffffff',
          fontStyle: 'bold italic',
          stroke: '#000000',
          strokeThickness: 3,
        })
        .setOrigin(0, 0),
      this.add.rectangle(12, 16, PLATE_W - 12, 7, 0x3a0d0d).setOrigin(0).setStrokeStyle(1, 0x000000),
      this.add.rectangle(12, 16, (PLATE_W - 12) * (c.hp / c.stats.health), 7, 0xd9302b).setOrigin(0),
      this.add.rectangle(12, 24, PLATE_W - 12, 5, 0x0d1f3a).setOrigin(0).setStrokeStyle(1, 0x000000),
      this.add.rectangle(12, 24, (PLATE_W - 12) * (c.stamina / c.stats.stamina), 5, 0xf2a93b).setOrigin(0),
    ]);
    c.statuses.forEach((s, i) => {
      const bad = isDebuff(state, s.id);
      this.plate.add([
        this.add.rectangle(12 + i * 20, 33, 18, 16, bad ? 0x8f1d1d : 0x1d7a3a).setOrigin(0).setStrokeStyle(1, 0xffffff, 0.8),
        this.add
          .text(21 + i * 20, 41, statusName(state, s.id).slice(0, 1).toUpperCase(), {
            fontFamily: FONT,
            fontSize: '11px',
            color: '#ffffff',
            fontStyle: 'bold',
          })
          .setOrigin(0.5),
      ]);
    });
  }

  /** Embestida del atacante, sacudida de los golpeados y números flotantes. */
  private animate(action: Action, events: BattleEvent[]): void {
    const state = this.controller.state;
    const used = events.find((e) => e.type === 'ability-used');
    const attacker = this.units.get(action.actorUid);
    if (used && used.type === 'ability-used' && attacker) {
      const foe = used.targets.map((t) => getCombatant(state, t)).find((t) => t.uid !== action.actorUid);
      const actor = getCombatant(state, action.actorUid);
      if (foe && foe.team !== actor.team) {
        const dir = actor.team === 'player' ? 1 : -1;
        this.tweens.add({ targets: attacker.root, x: attacker.x + dir * 45, duration: 120, yoyo: true, ease: 'Quad.easeOut' });
      }
    }

    const perUnit = new Map<string, number>();
    for (const e of events) {
      let text: string | null = null;
      let color = '#ffffff';
      let uid = '';
      if (e.type === 'damage') {
        uid = e.targetUid;
        text = `-${e.amount}${e.crit ? '!' : ''}`;
        color = e.cause === 'ability' ? (e.crit ? '#ffdd57' : '#ff5a4f') : '#d98cff';
      } else if (e.type === 'heal' && e.amount > 0) {
        uid = e.targetUid;
        text = `+${e.amount}`;
        color = '#6bff9e';
      } else if (e.type === 'miss') {
        uid = e.targetUid;
        text = 'ESQUIVA';
        color = '#c9d1e6';
      } else if (e.type === 'status-applied') {
        uid = e.targetUid;
        text = statusName(state, e.statusId) + (e.stacks > 1 ? ` x${e.stacks}` : '');
        color = isDebuff(state, e.statusId) ? '#ff9a5a' : '#6bd0ff';
      } else if (e.type === 'stamina' && e.amount > 0) {
        uid = e.targetUid;
        text = `+${e.amount} stamina`;
        color = '#6bb8ff';
      }
      if (!text) continue;
      const unit = this.units.get(uid);
      if (!unit) continue;
      const n = perUnit.get(uid) ?? 0;
      perUnit.set(uid, n + 1);
      if (e.type === 'damage') {
        this.tweens.add({ targets: unit.body, x: { from: -6, to: 0 }, duration: 60, repeat: 2, delay: 120 + n * 140 });
      }
      const label = this.add
        .text(unit.x, unit.y - unit.height + 20, text, {
          fontFamily: FONT,
          fontSize: e.type === 'damage' ? '26px' : '18px',
          color,
          fontStyle: 'bold',
          stroke: '#000000',
          strokeThickness: 5,
        })
        .setOrigin(0.5)
        .setDepth(35)
        .setAlpha(0);
      this.tweens.add({
        targets: label,
        y: label.y - 45,
        alpha: { from: 1, to: 0 },
        delay: 120 + n * 160,
        duration: 1000,
        onComplete: () => label.destroy(),
      });
    }
  }
}
