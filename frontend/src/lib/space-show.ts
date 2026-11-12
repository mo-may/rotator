export type MissionPhase = 'countdown' | 'launch' | 'asteroids' | 'warp' | 'arrival' | 'complete';

export interface MissionMode {
  quick: boolean;
  direct: boolean;
  reducedMotion: boolean;
}

export interface MissionFrame {
  phase: MissionPhase;
  phaseProgress: number;
  progress: number;
  elapsedMs: number;
  durationMs: number;
  countdown: number | null;
  complete: boolean;
}

type Timeline = ReadonlyArray<readonly [Exclude<MissionPhase, 'complete'>, number]>;
const normalTimeline: Timeline = [
  ['countdown', 2400],
  ['launch', 1600],
  ['asteroids', 3200],
  ['warp', 2500],
  ['arrival', 2300],
];
const directTimeline: Timeline = [
  ['launch', 900],
  ['arrival', 1500],
];
const quickTimeline: Timeline = [
  ['launch', 350],
  ['arrival', 650],
];

/** This timeline only choreographs a stored draw; it never chooses a participant. */
export function missionFrame(elapsedMs: number, mode: MissionMode): MissionFrame {
  const timeline = mode.reducedMotion
    ? []
    : mode.quick
      ? quickTimeline
      : mode.direct
        ? directTimeline
        : normalTimeline;
  const durationMs = timeline.reduce((sum, [, duration]) => sum + duration, 0);
  const elapsed = Math.max(0, Number.isFinite(elapsedMs) ? elapsedMs : durationMs);
  if (elapsed >= durationMs) {
    return {
      phase: 'complete',
      phaseProgress: 1,
      progress: 1,
      elapsedMs: durationMs,
      durationMs,
      countdown: null,
      complete: true,
    };
  }
  let start = 0;
  for (const [phase, duration] of timeline) {
    if (elapsed < start + duration) {
      const phaseProgress = (elapsed - start) / duration;
      return {
        phase,
        phaseProgress,
        progress: elapsed / durationMs,
        elapsedMs: elapsed,
        durationMs,
        countdown: phase === 'countdown' ? Math.max(1, 3 - Math.floor(phaseProgress * 3)) : null,
        complete: false,
      };
    }
    start += duration;
  }
  throw new Error('Invalid mission timeline');
}

export const missionCopy: Record<MissionPhase, { title: string; description: string }> = {
  countdown: {
    title: 'Flotte bereit.',
    description: 'Triebwerke starten. Nächster Halt: eure Aufgabe.',
  },
  launch: {
    title: 'Wir heben ab.',
    description: 'Das Team nimmt gemeinsam Kurs auf die nächste Mission.',
  },
  asteroids: {
    title: 'Bitte kurz festhalten.',
    description: 'Ein Asteroidenfeld. Ein paar sehr knappe Kurven.',
  },
  warp: {
    title: 'Sprung in den Hyperraum.',
    description: 'Alle Schiffe auf Kurs. Das Ziel ist schon gespeichert.',
  },
  arrival: {
    title: 'Landeanflug freigegeben.',
    description: 'Die nächste Zuständigkeit kommt im Teamorbit an.',
  },
  complete: {
    title: 'Mission übernommen.',
    description: 'Die nächste Aufgabe hat eine Besatzung.',
  },
};

export interface Pilot {
  id: number;
  name: string;
}
export interface SpacePalette {
  indigo: string;
  petal: string;
  lilac: string;
  lavender: string;
  charcoal: string;
}

const clamp = (value: number) => Math.max(0, Math.min(1, value));
const ease = (value: number) => 1 - Math.pow(1 - clamp(value), 3);
const mix = (a: number, b: number, t: number) => a + (b - a) * clamp(t);
const noise = (index: number, salt = 1) => {
  const value = Math.sin((index + 1) * 127.1 + salt * 311.7) * 43758.5453;
  return value - Math.floor(value);
};

function alpha(hex: string, opacity: number): string {
  const clean = hex.trim().replace('#', '');
  const full =
    clean.length === 3
      ? clean
          .split('')
          .map((part) => part + part)
          .join('')
      : clean;
  return `rgba(${parseInt(full.slice(0, 2), 16)}, ${parseInt(full.slice(2, 4), 16)}, ${parseInt(full.slice(4, 6), 16)}, ${clamp(opacity)})`;
}

/** A small Canvas 2D scene. Positions and effects are decorative, never selection logic. */
export function createSpaceRenderer(
  canvas: HTMLCanvasElement,
  pilots: readonly Pilot[],
  winnerId: number,
  palette: SpacePalette,
  fontFamily: string,
) {
  const context = canvas.getContext('2d');
  if (!context) return null;
  const ctx = context;
  let width = 1000;
  let height = 440;
  const winner = pilots.find((pilot) => pilot.id === winnerId) || pilots[0];
  // Keep names readable. Larger teams still have the complete, visible HTML flight manifest.
  const fleet =
    pilots.length <= 7
      ? [...pilots]
      : [winner!, ...pilots.filter((pilot) => pilot.id !== winnerId).slice(0, 6)];

  function resize(): void {
    const rect = canvas.getBoundingClientRect();
    width = Math.max(1, rect.width);
    height = Math.max(1, rect.height);
    const ratio = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(width * ratio);
    canvas.height = Math.round(height * ratio);
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
  }

  function glow(color: string, radius: number): void {
    ctx.shadowColor = color;
    ctx.shadowBlur = radius;
  }

  function starfield(frame: MissionFrame): void {
    const background = ctx.createLinearGradient(0, 0, width, height);
    background.addColorStop(0, palette.indigo);
    background.addColorStop(1, alpha(palette.indigo, 0.88));
    ctx.fillStyle = background;
    ctx.fillRect(0, 0, width, height);
    const nebula = ctx.createRadialGradient(
      width * 0.66,
      height * 0.28,
      0,
      width * 0.66,
      height * 0.28,
      width * 0.7,
    );
    nebula.addColorStop(0, alpha(palette.lavender, 0.2));
    nebula.addColorStop(0.5, alpha(palette.lilac, 0.025));
    nebula.addColorStop(1, alpha(palette.indigo, 0));
    ctx.fillStyle = nebula;
    ctx.fillRect(0, 0, width, height);
    const travel =
      frame.elapsedMs * (frame.phase === 'launch' || frame.phase === 'asteroids' ? 0.018 : 0.003);
    for (let index = 0; index < 130; index++) {
      const depth = 0.3 + noise(index, 5) * 0.7;
      const x = (((noise(index, 2) * width - travel * depth) % width) + width) % width;
      const y = noise(index, 3) * height;
      ctx.fillStyle = alpha(index % 4 ? palette.petal : palette.lavender, 0.18 + depth * 0.55);
      ctx.beginPath();
      ctx.arc(x, y, depth * 1.3, 0, Math.PI * 2);
      ctx.fill();
    }
    // A distant ringed planet gives the scene scale without a photographic asset.
    ctx.save();
    ctx.translate(width * 0.84, height * 0.2);
    ctx.rotate(-0.35);
    const radius = Math.min(width, height) * 0.09;
    ctx.strokeStyle = alpha(palette.lilac, 0.21);
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.ellipse(0, 0, radius * 2.0, radius * 0.48, 0, 0, Math.PI * 2);
    ctx.stroke();
    const planet = ctx.createRadialGradient(-radius * 0.35, -radius * 0.35, 0, 0, 0, radius);
    planet.addColorStop(0, alpha(palette.lavender, 0.7));
    planet.addColorStop(1, palette.indigo);
    ctx.fillStyle = planet;
    ctx.beginPath();
    ctx.arc(0, 0, radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  function asteroid(x: number, y: number, radius: number, rotation: number, index: number): void {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(rotation);
    ctx.beginPath();
    for (let point = 0; point < 9; point++) {
      const angle = (point / 9) * Math.PI * 2;
      const size = radius * (0.75 + noise(index + point, 9) * 0.27);
      if (point === 0) ctx.moveTo(Math.cos(angle) * size, Math.sin(angle) * size);
      else ctx.lineTo(Math.cos(angle) * size, Math.sin(angle) * size);
    }
    ctx.closePath();
    const rock = ctx.createLinearGradient(-radius, -radius, radius, radius);
    rock.addColorStop(0, palette.charcoal);
    rock.addColorStop(1, palette.indigo);
    ctx.fillStyle = rock;
    ctx.fill();
    ctx.strokeStyle = alpha(palette.lilac, 0.45);
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.strokeStyle = alpha(palette.indigo, 0.65);
    ctx.beginPath();
    ctx.arc(radius * 0.2, -radius * 0.1, radius * 0.22, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(-radius * 0.25, radius * 0.25, radius * 0.14, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  function asteroids(frame: MissionFrame): void {
    if (frame.phase !== 'asteroids') return;
    const p = frame.phaseProgress;
    for (let index = 0; index < 16; index++) {
      const cycle = (p * 1.9 + noise(index, 12)) % 1;
      const x = width * 1.12 - cycle * width * 1.35;
      const y = noise(index, 13) * height;
      const radius = 12 + noise(index, 14) * (width < 600 ? 19 : 33);
      asteroid(x, y, radius, p * 2 + index, index);
    }
  }

  function ship(
    x: number,
    y: number,
    scale: number,
    roll: number,
    thrust: number,
    time: number,
    hero = false,
  ): void {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(roll);
    ctx.scale(scale, scale);
    // Long exhaust, engine rings and a warm core make the movement readable at meeting distance.
    const flame = 18 + thrust * 45 + Math.sin(time * 0.035) * 5;
    const exhaust = ctx.createLinearGradient(-72 - flame, 0, -26, 0);
    exhaust.addColorStop(0, alpha(palette.lavender, 0));
    exhaust.addColorStop(0.55, alpha(palette.lavender, 0.4));
    exhaust.addColorStop(1, alpha(palette.petal, 0.95));
    ctx.fillStyle = exhaust;
    ctx.beginPath();
    ctx.moveTo(-29, -8);
    ctx.lineTo(-76 - flame, 0);
    ctx.lineTo(-29, 8);
    ctx.fill();
    glow(palette.lavender, 15);
    ctx.fillStyle = palette.lilac;
    ctx.fillRect(-31, -8, 8, 16);
    ctx.shadowBlur = 0;
    // Swept fins, separate engine pods, a beveled fuselage and a glazed cockpit.
    ctx.fillStyle = palette.charcoal;
    ctx.strokeStyle = alpha(palette.lilac, 0.65);
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(5, -9);
    ctx.lineTo(-21, -32);
    ctx.lineTo(-37, -32);
    ctx.lineTo(-26, -7);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(5, 9);
    ctx.lineTo(-21, 32);
    ctx.lineTo(-37, 32);
    ctx.lineTo(-26, 7);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = hero ? palette.petal : palette.lilac;
    ctx.beginPath();
    ctx.moveTo(42, 0);
    ctx.lineTo(12, -13);
    ctx.lineTo(-27, -10);
    ctx.lineTo(-32, 0);
    ctx.lineTo(-27, 10);
    ctx.lineTo(12, 13);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = alpha(palette.petal, 0.75);
    ctx.stroke();
    ctx.fillStyle = palette.lavender;
    ctx.beginPath();
    ctx.moveTo(42, 0);
    ctx.lineTo(-29, 0);
    ctx.lineTo(-27, 10);
    ctx.lineTo(12, 13);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = palette.indigo;
    ctx.beginPath();
    ctx.ellipse(10, -2, 11, 6, -0.05, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = palette.petal;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(3, -5);
    ctx.lineTo(14, -5);
    ctx.stroke();
    glow(palette.petal, 7);
    ctx.fillStyle = palette.petal;
    ctx.beginPath();
    ctx.arc(-25, -29, 2, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(-25, 29, 2, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  function label(name: string, x: number, y: number, hero = false): void {
    ctx.save();
    ctx.font = `${hero ? '500 14px' : '400 12px'} ${fontFamily}`;
    const maxWidth = width < 600 ? 115 : 165;
    let text = name;
    while (ctx.measureText(text).width > maxWidth && text.length > 3) text = text.slice(0, -2);
    if (text !== name) text += '…';
    const labelWidth = ctx.measureText(text).width + 18;
    ctx.fillStyle = alpha(palette.indigo, 0.92);
    ctx.fillRect(x - labelWidth / 2, y - 11, labelWidth, 23);
    ctx.fillStyle = alpha(hero ? palette.petal : palette.lilac, 0.95);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, x, y + 1);
    ctx.restore();
  }

  function fleetFlight(frame: MissionFrame): void {
    const p = frame.phaseProgress;
    const columns = width < 600 ? 2 : 3;
    const rows = Math.ceil(fleet.length / columns);
    const spacingX = Math.min(width * 0.27, 215);
    const spacingY = Math.min((height - 80) / Math.max(rows, 2), 104);
    fleet.forEach((pilot, index) => {
      const column = index % columns;
      const row = Math.floor(index / columns);
      const columnsInRow = Math.min(columns, fleet.length - row * columns);
      const baseX = width * 0.5 + (column - (columnsInRow - 1) / 2) * spacingX;
      const baseY = height * 0.5 + (row - (rows - 1) / 2) * spacingY;
      let x = baseX;
      let y = baseY;
      let roll = 0;
      let scale = width < 600 ? 0.57 : 0.74;
      if (frame.phase === 'launch') {
        x = mix(baseX - width * 0.6, baseX, ease(p));
        y += Math.sin(p * 3 + index) * 8;
      } else if (frame.phase === 'asteroids') {
        const dodge = Math.sin(p * Math.PI * 4 + index * 1.7);
        y += dodge * (width < 600 ? 21 : 35);
        x += Math.cos(p * Math.PI * 3 + index) * 17;
        roll = Math.cos(p * Math.PI * 4 + index * 1.7) * 0.24;
      } else if (frame.phase === 'warp') {
        const jump = ease(clamp((p - index * 0.025) / 0.65));
        x = mix(baseX, width * 1.3, jump);
        scale *= 1 - jump * 0.65;
      }
      ship(x, y, scale, roll, frame.phase === 'countdown' ? 0.1 : 0.8, frame.elapsedMs);
      if (frame.phase !== 'warp' || p < 0.35) label(pilot.name, x, y + 36);
    });
  }

  function warp(frame: MissionFrame): void {
    if (frame.phase !== 'warp') return;
    const centerX = width * 0.47;
    const centerY = height * 0.47;
    const power = Math.sin(frame.phaseProgress * Math.PI);
    for (let index = 0; index < 90; index++) {
      const angle = noise(index, 21) * Math.PI * 2;
      const radius = ((noise(index, 22) + frame.phaseProgress * 2.2) % 1) * width * 0.8;
      const tail = 8 + power * radius * 0.45;
      ctx.strokeStyle = alpha(
        index % 4 ? palette.lavender : palette.petal,
        (0.16 + power * 0.5) * clamp(radius / 90),
      );
      ctx.lineWidth = index % 5 === 0 ? 2 : 1;
      ctx.beginPath();
      ctx.moveTo(centerX + Math.cos(angle) * radius, centerY + Math.sin(angle) * radius * 0.6);
      ctx.lineTo(
        centerX + Math.cos(angle) * (radius + tail),
        centerY + Math.sin(angle) * (radius + tail) * 0.6,
      );
      ctx.stroke();
    }
    ctx.strokeStyle = alpha(palette.lilac, power * 0.45);
    for (let ring = 0; ring < 4; ring++) {
      ctx.beginPath();
      ctx.ellipse(
        centerX,
        centerY,
        40 + ring * 40 + power * 25,
        25 + ring * 24,
        -0.2,
        0,
        Math.PI * 2,
      );
      ctx.stroke();
    }
  }

  function arrival(frame: MissionFrame): void {
    const p = frame.phase === 'complete' ? 1 : ease(frame.phaseProgress);
    const centerX = width / 2;
    const centerY = height * 0.47;
    ctx.save();
    ctx.translate(centerX, centerY);
    for (let ring = 0; ring < 3; ring++) {
      ctx.strokeStyle = alpha(ring === 0 ? palette.petal : palette.lavender, 0.55 - ring * 0.13);
      ctx.lineWidth = ring === 0 ? 1.5 : 1;
      ctx.beginPath();
      ctx.ellipse(0, 8, 90 + ring * 43, 50 + ring * 25, -0.17, 0, Math.PI * 2);
      ctx.stroke();
    }
    for (let index = 0; index < 16; index++) {
      const angle = (index * Math.PI) / 8;
      ctx.fillStyle = alpha(palette.lilac, 0.65);
      ctx.fillRect(Math.cos(angle) * 178, Math.sin(angle) * 103, 3, 3);
    }
    ctx.restore();
    const x = mix(-width * 0.2, centerX, p);
    const y = mix(height * 0.12, centerY, p);
    const scale = mix(0.4, width < 600 ? 1.05 : 1.55, p);
    ship(x, y, scale, (1 - p) * 0.35, (1 - p) * 0.8 + 0.05, frame.elapsedMs, true);
    if (p > 0.7) {
      ctx.strokeStyle = alpha(palette.petal, (p - 0.7) * 2);
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(centerX - 52, centerY + 120);
      ctx.lineTo(centerX + 52, centerY + 120);
      ctx.stroke();
    }
  }

  function paint(frame: MissionFrame): void {
    ctx.clearRect(0, 0, width, height);
    starfield(frame);
    if (frame.phase === 'arrival' || frame.phase === 'complete') arrival(frame);
    else {
      asteroids(frame);
      warp(frame);
      fleetFlight(frame);
    }
  }

  return { resize, paint };
}
