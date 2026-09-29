import Phaser from 'phaser';
import { abilityById, classesData, heroById } from '../data';
import {
  canUseAbility,
  chooseAiAction,
  createBattle,
  currentActor,
  describeEvent,
  getCombatant,
  isAlive,
  performAction,
  selectableTargets,
  statusName,
  type Action,
  type BattleEvent,
  type BattleState,
  type Combatant,
} from '../core/combat';
import type { Ability } from '../types/game';
import { CLASS_COLORS, createAbilityIcon, createFigure, createPortrait, drawStage } from './battle/art';

/** Equipos del prototipo. Más adelante saldrán de la pantalla de selección. */
const PLAYER_TEAM = ['iron_man', 'captain_america', 'thor'];
const ENEMY_TEAM = ['hulk', 'wolverine', 'black_widow'];

const FONT = 'sans-serif';
const ENEMY_DELAY = 800;
const AFTER_ACTION_DELAY = 750;

// Disposición (lienzo de 960x640, igual que la pantalla del juego original):
// escenario arriba, barra de habilidades sobre su borde inferior y paneles de equipo abajo.
const STAGE_H = 540;
const BAR_Y = 505;
const ICON = 48;
const PANEL_Y = 544;
const ROW_H = 32;
/** Pies de cada héroe del jugador por puesto; los enemigos van en espejo. */
const PLAYER_SPOTS = [
  { x: 205, y: 305 },
  { x: 330, y: 372 },
  { x: 150, y: 440 },
];
const PLATE_W = 124;

type Mode = 'busy' | 'choose-ability' | 'choose-target' | 'over';

interface UnitView {
  root: Phaser.GameObjects.Container;
  body: Phaser.GameObjects.Container;
  ring: Phaser.GameObjects.Ellipse;
  hit: Phaser.GameObjects.Rectangle;
  x: number;
  y: number;
}

interface RowView {
  bg: Phaser.GameObjects.Rectangle;
  hpFill: Phaser.GameObjects.Rectangle;
  hpText: Phaser.GameObjects.Text;
  staminaFill?: Phaser.GameObjects.Rectangle;
  staminaText?: Phaser.GameObjects.Text;
  name: Phaser.GameObjects.Text;
  statuses: Phaser.GameObjects.Text;
  barW: number;
}

/** Combate 3 contra 3. La lógica vive en src/core/combat; aquí solo se dibuja y se recibe la entrada. */
export class BattleScene extends Phaser.Scene {
  private state!: BattleState;
  private mode: Mode = 'busy';
  private pendingAbility: Ability | null = null;
  private hovered: string | null = null;
  private units = new Map<string, UnitView>();
  private rows = new Map<string, RowView>();
  private plate!: Phaser.GameObjects.Container;
  private turnStrip!: Phaser.GameObjects.Container;
  private abilityBar!: Phaser.GameObjects.Container;
  private tooltip!: Phaser.GameObjects.Container;
  private hintText!: Phaser.GameObjects.Text;
  private captionText!: Phaser.GameObjects.Text;
  private logLines: string[] = [];

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
    this.units.clear();
    this.rows.clear();
    this.logLines = [];
    this.mode = 'busy';
    this.pendingAbility = null;
    this.hovered = null;

    const { width, height } = this.scale;
    drawStage(this, width, STAGE_H);

    // Los de atrás (arriba) se dibujan antes que los de adelante.
    const bySlotDepth = [...this.state.combatants].sort((a, b) => this.spot(a).y - this.spot(b).y);
    for (const c of bySlotDepth) this.createUnit(c);

    this.plate = this.add.container(0, 0).setDepth(20);
    this.turnStrip = this.add.container(width / 2, 0).setDepth(30);
    this.captionText = this.add
      .text(width / 2, 78, '', {
        fontFamily: FONT,
        fontSize: '14px',
        color: '#ffffff',
        align: 'center',
        stroke: '#000000',
        strokeThickness: 4,
      })
      .setOrigin(0.5, 0)
      .setDepth(30);

    // Barra inferior del escenario.
    this.add.rectangle(0, BAR_Y - ICON / 2 - 8, width, ICON + 16, 0x05070d, 0.75).setOrigin(0).setDepth(25);
    this.hintText = this.add
      .text(width / 2, BAR_Y - ICON / 2 - 26, '', {
        fontFamily: FONT,
        fontSize: '22px',
        color: '#ff3b30',
        fontStyle: 'bold italic',
        stroke: '#000000',
        strokeThickness: 5,
      })
      .setOrigin(0.5)
      .setDepth(30);
    this.abilityBar = this.add.container(0, BAR_Y).setDepth(30);
    this.tooltip = this.add.container(0, 0).setDepth(40).setVisible(false);

    this.add.rectangle(0, STAGE_H, width, height - STAGE_H, 0x070a12).setOrigin(0);
    this.createTeamPanel('player', 6, width / 2 - 9);
    this.createTeamPanel('enemy', width / 2 + 3, width / 2 - 9);

    this.input.keyboard?.on('keydown-ESC', () => this.cancelTarget());
    this.input.mouse?.disableContextMenu();
    this.input.on('pointerdown', (p: Phaser.Input.Pointer) => {
      if (p.rightButtonDown()) this.cancelTarget();
    });

    this.pushLog(this.state.log);
    this.refresh();

    if (import.meta.env.DEV) (window as unknown as { __maa: unknown }).__maa = this;
    this.nextTurn();
  }

  /** Estado actual de la batalla (solo lectura; útil para depurar desde la consola). */
  get battle(): BattleState {
    return this.state;
  }

  private spot(c: Combatant): { x: number; y: number } {
    const s = PLAYER_SPOTS[c.slot];
    return c.team === 'player' ? s : { x: this.scale.width - s.x, y: s.y };
  }

  private createUnit(c: Combatant): void {
    const { x, y } = this.spot(c);
    const root = this.add.container(x, y);
    const ring = this.add.ellipse(0, 0, 96, 26).setStrokeStyle(3, 0xffffff).setFillStyle(0xffffff, 0.08).setVisible(false);
    const body = createFigure(this, c.heroId, c.name, c.classId, c.team === 'enemy');
    const hit = this.add.rectangle(0, -85, 90, 170, 0xffffff, 0);
    root.add([ring, body, hit]);
    hit.on('pointerdown', () => this.onTargetClicked(c.uid));
    hit.on('pointerover', () => this.setHovered(c.uid));
    hit.on('pointerout', () => this.setHovered(null));
    this.tweens.add({
      targets: body,
      y: -3,
      duration: 900 + c.slot * 130,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });
    this.units.set(c.uid, { root, body, ring, hit, x, y });
  }

  private createTeamPanel(team: 'player' | 'enemy', x: number, w: number): void {
    const members = this.state.combatants.filter((c) => c.team === team);
    this.add.rectangle(x, PANEL_Y, w, ROW_H * 3 + 6, 0x0f1424).setOrigin(0).setStrokeStyle(1, 0x26304d);
    members.forEach((c, i) => {
      const y = PANEL_Y + 3 + i * ROW_H;
      const bg = this.add.rectangle(x + 3, y, w - 6, ROW_H - 2, 0x141b30).setOrigin(0);
      bg.on('pointerdown', () => this.onTargetClicked(c.uid));
      bg.on('pointerover', () => this.setHovered(c.uid));
      bg.on('pointerout', () => this.setHovered(null));
      const label = { fontFamily: FONT, fontSize: '9px', color: '#8f9bbd', fontStyle: 'bold' };
      const num = { fontFamily: FONT, fontSize: '10px', color: '#ffffff' };
      const barX = x + 58;
      const barW = 118;
      const twoBars = team === 'player';
      const hpY = twoBars ? y + 5 : y + 11;
      this.add.text(x + 10, hpY - 1, 'SALUD', label);
      this.add.rectangle(barX, hpY, barW, 8, 0x3a0d0d).setOrigin(0);
      const hpFill = this.add.rectangle(barX, hpY, barW, 8, 0xd9302b).setOrigin(0);
      const hpText = this.add.text(barX + barW + 6, hpY - 2, '', num);
      let staminaFill: Phaser.GameObjects.Rectangle | undefined;
      let staminaText: Phaser.GameObjects.Text | undefined;
      if (twoBars) {
        const sy = y + 17;
        this.add.text(x + 10, sy - 1, 'STAMINA', label);
        this.add.rectangle(barX, sy, barW, 8, 0x0d1f3a).setOrigin(0);
        staminaFill = this.add.rectangle(barX, sy, barW, 8, 0x2f7de0).setOrigin(0);
        staminaText = this.add.text(barX + barW + 6, sy - 2, '', num);
      }
      const name = this.add
        .text(x + 222, y + ROW_H / 2 - 1, c.name.toUpperCase(), {
          fontFamily: FONT,
          fontSize: '13px',
          color: '#ffffff',
          fontStyle: 'bold',
        })
        .setOrigin(0, 0.5);
      const statuses = this.add
        .text(x + w - 44, y + ROW_H / 2 - 1, '', { fontFamily: FONT, fontSize: '10px', color: '#f2c14e', align: 'right' })
        .setOrigin(1, 0.5);
      const cls = classesData.classes.find((k) => k.id === c.classId);
      this.add
        .rectangle(x + w - 22, y + ROW_H / 2 - 1, 26, 20, CLASS_COLORS[c.classId])
        .setStrokeStyle(1, 0x000000, 0.6);
      this.add
        .text(x + w - 22, y + ROW_H / 2 - 1, (cls?.name ?? c.classId).slice(0, 2).toUpperCase(), {
          fontFamily: FONT,
          fontSize: '11px',
          color: '#ffffff',
          fontStyle: 'bold',
        })
        .setOrigin(0.5);
      this.rows.set(c.uid, { bg, hpFill, hpText, staminaFill, staminaText, name, statuses, barW });
    });
  }

  private targetSet(): Set<string> {
    const actor = currentActor(this.state);
    if (this.mode !== 'choose-target' || !actor || !this.pendingAbility) return new Set();
    return new Set(selectableTargets(this.state, actor, this.pendingAbility).map((t) => t.uid));
  }

  private refresh(): void {
    const actor = currentActor(this.state);
    const targets = this.targetSet();

    for (const c of this.state.combatants) {
      const unit = this.units.get(c.uid)!;
      const row = this.rows.get(c.uid)!;
      const isActor = actor?.uid === c.uid && this.mode !== 'over';
      const isTarget = targets.has(c.uid);
      const hot = isTarget && this.hovered === c.uid;

      unit.ring.setVisible(isActor || isTarget);
      unit.ring.setStrokeStyle(hot ? 4 : 3, isTarget ? 0xff3b30 : 0xffffff);
      unit.ring.setFillStyle(isTarget ? 0xff3b30 : 0xffffff, hot ? 0.25 : 0.08);
      unit.body.setAlpha(isAlive(c) ? 1 : 0.25);
      for (const o of [unit.hit, row.bg]) {
        if (isTarget) o.setInteractive({ useHandCursor: true });
        else o.disableInteractive();
      }

      row.hpFill.width = row.barW * (c.hp / c.stats.health);
      row.hpText.setText(`${c.hp}`);
      if (row.staminaFill && row.staminaText) {
        row.staminaFill.width = row.barW * (c.stamina / c.stats.stamina);
        row.staminaText.setText(`${c.stamina}`);
      }
      row.bg.setFillStyle(isActor ? 0x1d4f8f : hot ? 0x5a1a1a : isTarget ? 0x3a1616 : 0x141b30);
      row.name.setColor(isAlive(c) ? '#ffffff' : '#5c6580');
      row.statuses.setText(c.statuses.map((s) => `${statusName(s.id)} ${s.turnsLeft}`).join('  '));
    }

    const plateFor = this.hovered && targets.has(this.hovered) ? getCombatant(this.state, this.hovered) : actor;
    this.drawPlate(this.mode === 'over' ? null : plateFor);
    this.drawTurnStrip();
    this.drawAbilityBar();
  }

  /** Placa sobre la cabeza: nombre, vida, stamina y efectos del héroe activo o del objetivo señalado. */
  private drawPlate(c: Combatant | null): void {
    this.plate.removeAll(true);
    if (!c) return;
    const unit = this.units.get(c.uid)!;
    const top = unit.y - (c.classId === 'bruiser' ? 190 : 172);
    this.plate.setPosition(unit.x - PLATE_W / 2 + 12, top);
    const color = CLASS_COLORS[c.classId];
    this.plate.add([
      this.add.circle(-4, 14, 13, color).setStrokeStyle(2, 0xffffff),
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
      const bad = ['stun', 'bleed', 'attack_down', 'defense_down', 'accuracy_down'].includes(s.id);
      this.plate.add([
        this.add.rectangle(12 + i * 20, 33, 18, 16, bad ? 0x8f1d1d : 0x1d7a3a).setOrigin(0).setStrokeStyle(1, 0xffffff, 0.8),
        this.add
          .text(21 + i * 20, 41, statusName(s.id).slice(0, 1).toUpperCase(), {
            fontFamily: FONT,
            fontSize: '11px',
            color: '#ffffff',
            fontStyle: 'bold',
          })
          .setOrigin(0.5),
      ]);
    });
  }

  /** Fila de retratos arriba: quien actúa ahora y los siguientes turnos. */
  private drawTurnStrip(): void {
    this.turnStrip.removeAll(true);
    if (this.mode === 'over') return;
    const order = this.state.turnOrder;
    const upcoming: Combatant[] = [];
    for (let i = this.state.turnIndex; upcoming.length < 7 && i < this.state.turnIndex + order.length * 2; i++) {
      const c = getCombatant(this.state, order[i % order.length]);
      if (isAlive(c)) upcoming.push(c);
    }
    const big = 52;
    const small = 34;
    const gap = 4;
    const totalW = big + (upcoming.length - 1) * (small + gap) + gap;
    const left = -totalW / 2;
    this.turnStrip.add(this.add.rectangle(left - 10, 0, totalW + 20, big + 18, 0x05070d, 0.85).setOrigin(0).setStrokeStyle(1, 0x3a4468));
    upcoming.forEach((c, i) => {
      const size = i === 0 ? big : small;
      const x = i === 0 ? left + big / 2 : left + big + gap + (i - 1) * (small + gap) + small / 2 + gap;
      const y = i === 0 ? 6 + big / 2 : 8 + small / 2;
      const p = createPortrait(this, c.heroId, c.name, c.classId, size).setPosition(x, y);
      const frame = this.add
        .rectangle(x, y, size, size)
        .setStrokeStyle(i === 0 ? 3 : 2, i === 0 ? 0xf2c14e : c.team === 'player' ? 0x3d8bfd : 0xd9302b);
      this.turnStrip.add([p, frame]);
      if (i === 0) {
        this.turnStrip.add(
          this.add
            .text(x, y + big / 2 + 1, 'AHORA', {
              fontFamily: FONT,
              fontSize: '10px',
              color: '#000000',
              fontStyle: 'bold',
              backgroundColor: '#f2c14e',
              padding: { x: 4, y: 0 },
            })
            .setOrigin(0.5, 0),
        );
      }
    });
  }

  /** Barra de iconos: habilidades del héroe activo y ranuras de objetos (aún sin uso). */
  private drawAbilityBar(): void {
    this.abilityBar.removeAll(true);
    this.tooltip.setVisible(false);
    const actor = currentActor(this.state);
    const mine = actor?.team === 'player' && (this.mode === 'choose-ability' || this.mode === 'choose-target');
    const abilities = mine && actor ? actor.abilities : [];
    const itemSlots = 3;
    const slots = Math.max(abilities.length, 3) + itemSlots;
    const step = ICON + 8;
    const startX = this.scale.width / 2 - ((slots - 1) * step) / 2;

    for (let i = 0; i < slots; i++) {
      const x = startX + i * step + (i >= slots - itemSlots ? 14 : 0);
      const ability = abilities[i];
      const frame = this.add.rectangle(x, 0, ICON + 4, ICON + 4, 0x1a2135).setStrokeStyle(2, 0x3a4468);
      this.abilityBar.add(frame);
      if (!ability || !actor) {
        if (i >= slots - itemSlots) {
          this.abilityBar.add(
            this.add.text(x, 0, '+', { fontFamily: FONT, fontSize: '20px', color: '#3a4468' }).setOrigin(0.5),
          );
        }
        continue;
      }
      const usable = canUseAbility(actor, ability);
      const selected = this.pendingAbility?.id === ability.id;
      const icon = createAbilityIcon(this, ability.id, ability.type, ICON).setPosition(x, 0).setAlpha(usable ? 1 : 0.35);
      this.abilityBar.add(icon);
      frame.setStrokeStyle(selected ? 4 : 2, selected ? 0xff3b30 : usable ? 0x8fa3d6 : 0x3a4468);
      const cd = actor.cooldowns[ability.id] ?? 0;
      if (cd > 0) {
        this.abilityBar.add(
          this.add
            .text(x, 0, `${cd}`, { fontFamily: FONT, fontSize: '22px', color: '#ffffff', fontStyle: 'bold', stroke: '#000', strokeThickness: 4 })
            .setOrigin(0.5),
        );
      } else if (ability.staminaCost > 0) {
        this.abilityBar.add(
          this.add
            .text(x + ICON / 2 - 2, ICON / 2 - 2, `${ability.staminaCost}`, {
              fontFamily: FONT,
              fontSize: '10px',
              color: '#ffffff',
              backgroundColor: '#1d4f8f',
              padding: { x: 2, y: 0 },
            })
            .setOrigin(1, 1),
        );
      }
      frame.setInteractive({ useHandCursor: usable });
      frame.on('pointerover', () => this.showTooltip(ability, actor, x));
      frame.on('pointerout', () => this.tooltip.setVisible(false));
      if (usable) frame.on('pointerdown', () => this.onAbilityChosen(ability));
    }
  }

  private showTooltip(ability: Ability, actor: Combatant, x: number): void {
    this.tooltip.removeAll(true);
    const cd = actor.cooldowns[ability.id] ?? 0;
    const detail = [
      ability.damage ? `Daño ${ability.damage.min}-${ability.damage.max}${ability.hits > 1 ? ` x${ability.hits}` : ''}` : null,
      ability.staminaCost ? `${ability.staminaCost} stamina` : 'Sin coste',
      cd > 0 ? `Lista en ${cd} turno${cd > 1 ? 's' : ''}` : null,
    ]
      .filter(Boolean)
      .join(' · ');
    const w = 250;
    const text = this.add.text(10, 8, [ability.name, detail, ability.description], {
      fontFamily: FONT,
      fontSize: '12px',
      color: '#dfe6f7',
      wordWrap: { width: w - 20 },
      lineSpacing: 3,
    });
    const h = text.height + 16;
    this.tooltip.add([this.add.rectangle(0, 0, w, h, 0x0b1020, 0.95).setOrigin(0).setStrokeStyle(1, 0x8fa3d6), text]);
    this.tooltip.setPosition(Phaser.Math.Clamp(x - w / 2, 6, this.scale.width - w - 6), BAR_Y - ICON / 2 - 44 - h);
    this.tooltip.setVisible(true);
  }

  private setHovered(uid: string | null): void {
    if (this.hovered === uid) return;
    this.hovered = uid;
    if (this.mode === 'choose-target') this.refresh();
  }

  private nextTurn(): void {
    const actor = currentActor(this.state);
    if (!actor) {
      this.showEnd();
      return;
    }
    this.pendingAbility = null;
    if (actor.team === 'enemy') {
      this.mode = 'busy';
      this.hintText.setText('').setColor('#ff3b30');
      this.refresh();
      this.time.delayedCall(ENEMY_DELAY, () => this.execute(chooseAiAction(this.state)));
      return;
    }
    this.mode = 'choose-ability';
    this.setHint('ELIGE UNA HABILIDAD', '#ffffff');
    this.refresh();
  }

  private setHint(text: string, color: string): void {
    this.hintText.setText(text).setColor(color);
  }

  private onAbilityChosen(ability: Ability): void {
    const actor = currentActor(this.state);
    if ((this.mode !== 'choose-ability' && this.mode !== 'choose-target') || !actor) return;
    if (this.pendingAbility?.id === ability.id) {
      this.cancelTarget();
      return;
    }
    if (ability.target === 'single_enemy' || ability.target === 'single_ally') {
      this.pendingAbility = ability;
      this.mode = 'choose-target';
      this.setHint(ability.target === 'single_enemy' ? 'SELECCIONA UN ENEMIGO' : 'SELECCIONA UN ALIADO', '#ff3b30');
      this.refresh();
      return;
    }
    this.execute({ actorUid: actor.uid, abilityId: ability.id });
  }

  private cancelTarget(): void {
    if (this.mode !== 'choose-target') return;
    this.mode = 'choose-ability';
    this.pendingAbility = null;
    this.setHint('ELIGE UNA HABILIDAD', '#ffffff');
    this.refresh();
  }

  private onTargetClicked(uid: string): void {
    const actor = currentActor(this.state);
    if (this.mode !== 'choose-target' || !actor || !this.pendingAbility) return;
    if (!this.targetSet().has(uid)) return;
    this.execute({ actorUid: actor.uid, abilityId: this.pendingAbility.id, targetUid: uid });
  }

  private execute(action: Action): void {
    this.mode = 'busy';
    this.pendingAbility = null;
    this.hovered = null;
    this.hintText.setText('');
    const events = performAction(this.state, action);
    this.pushLog(events);
    this.animate(action, events);
    this.refresh();
    this.time.delayedCall(AFTER_ACTION_DELAY, () => this.nextTurn());
  }

  /** Embestida del atacante, sacudida de los golpeados y números flotantes. */
  private animate(action: Action, events: BattleEvent[]): void {
    const used = events.find((e) => e.type === 'ability-used');
    const attacker = this.units.get(action.actorUid);
    if (used && used.type === 'ability-used' && attacker) {
      const foe = used.targets.map((t) => getCombatant(this.state, t)).find((t) => t.uid !== action.actorUid);
      const actor = getCombatant(this.state, action.actorUid);
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
        text = statusName(e.statusId);
        color = '#f2c14e';
      }
      if (!text) continue;
      const unit = this.units.get(uid)!;
      const n = perUnit.get(uid) ?? 0;
      perUnit.set(uid, n + 1);
      if (e.type === 'damage') {
        this.tweens.add({ targets: unit.body, x: { from: -6, to: 0 }, duration: 60, repeat: 2, delay: 120 + n * 140 });
      }
      const label = this.add
        .text(unit.x, unit.y - 150, text, {
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

  private pushLog(events: BattleEvent[]): void {
    for (const e of events) {
      const line = describeEvent(this.state, e);
      if (line) this.logLines.push(line);
    }
    // En pantalla solo se ve lo último que pasó; el registro completo queda en logLines.
    this.captionText.setText(this.logLines.slice(-2).join('\n'));
  }

  private showEnd(): void {
    this.mode = 'over';
    this.hintText.setText('');
    this.refresh();
    const won = this.state.winner === 'player';
    const { width } = this.scale;
    this.add.rectangle(0, 0, width, STAGE_H, 0x000000, 0.55).setOrigin(0).setDepth(50);
    this.add
      .text(width / 2, 210, won ? '¡VICTORIA!' : 'DERROTA', {
        fontFamily: FONT,
        fontSize: '52px',
        color: won ? '#6bff9e' : '#ff5a4f',
        fontStyle: 'bold italic',
        stroke: '#000000',
        strokeThickness: 8,
      })
      .setOrigin(0.5)
      .setDepth(51);
    this.add
      .text(width / 2, 262, `La batalla duró ${this.state.round} rondas`, { fontFamily: FONT, fontSize: '16px', color: '#dfe6f7' })
      .setOrigin(0.5)
      .setDepth(51);
    this.add
      .text(width / 2, 320, 'Jugar de nuevo', {
        fontFamily: FONT,
        fontSize: '18px',
        color: '#ffffff',
        backgroundColor: '#2f7de0',
        padding: { x: 18, y: 10 },
      })
      .setOrigin(0.5)
      .setDepth(51)
      .setInteractive({ useHandCursor: true })
      .on('pointerdown', () => this.scene.restart());
  }
}
