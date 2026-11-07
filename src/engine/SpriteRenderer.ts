import { AttackType, FighterId, FighterStateName } from '../types/fighter';
import { Fighter } from './Fighter';
import { HitboxSystem } from './HitboxSystem';

export interface VisualEffect {
  x: number;
  y: number;
  type: 'hitspark' | 'block' | 'dust' | 'comic_text' | 'rose_petal' | 'strobe';
  text?: string;
  color?: string;
  frame: number;
  maxFrames: number;
  scale?: number;
  vx?: number;
  vy?: number;
}

export class SpriteRenderer {
  public static effects: VisualEffect[] = [];

  public static clearEffects(): void {
    SpriteRenderer.effects.length = 0;
  }

  public static addHitspark(x: number, y: number, isBlocked: boolean, isHeavy: boolean): void {
    if (isBlocked) {
      SpriteRenderer.effects.push({
        x,
        y,
        type: 'block',
        frame: 0,
        maxFrames: 12,
        scale: 1,
      });
      return;
    }

    const words = ['DHISHUM!', 'DHAMAKA!', 'DISHOOM!', 'PHATT!', 'FATAAK!'];
    const comicWord = isHeavy ? words[Math.floor(Math.random() * 3)] : words[Math.floor(Math.random() * words.length)];

    SpriteRenderer.effects.push({
      x,
      y,
      type: 'hitspark',
      frame: 0,
      maxFrames: 16,
      scale: isHeavy ? 1.6 : 1.1,
    });

    SpriteRenderer.effects.push({
      x: x + (Math.random() * 20 - 10),
      y: y - 35,
      type: 'comic_text',
      text: comicWord,
      frame: 0,
      maxFrames: 24,
      scale: isHeavy ? 1.4 : 1.0,
      vy: -1.2,
    });
  }

  public static addDust(x: number, y: number): void {
    SpriteRenderer.effects.push({
      x,
      y,
      type: 'dust',
      frame: 0,
      maxFrames: 14,
      scale: 0.8,
      vx: (Math.random() - 0.5) * 1.5,
      vy: -0.5,
    });
  }

  public static updateEffects(): void {
    for (let i = SpriteRenderer.effects.length - 1; i >= 0; i--) {
      const fx = SpriteRenderer.effects[i];
      fx.frame++;
      if (fx.vx) fx.x += fx.vx;
      if (fx.vy) fx.y += fx.vy;
      if (fx.frame >= fx.maxFrames) {
        SpriteRenderer.effects.splice(i, 1);
      }
    }
  }

  public static renderEffects(ctx: CanvasRenderingContext2D): void {
    for (const fx of SpriteRenderer.effects) {
      const progress = fx.frame / fx.maxFrames;
      const alpha = 1 - progress;

      ctx.save();
      if (fx.type === 'hitspark') {
        const radius = (fx.scale || 1) * (18 + progress * 24);
        ctx.translate(fx.x, fx.y);
        ctx.fillStyle = `rgba(255, 230, 80, ${alpha})`;
        ctx.strokeStyle = `rgba(220, 38, 38, ${alpha})`;
        ctx.lineWidth = 3;

        // Draw classic 8-point arcade comic starburst
        ctx.beginPath();
        const points = 8;
        for (let p = 0; p < points * 2; p++) {
          const r = p % 2 === 0 ? radius : radius * 0.45;
          const angle = (p * Math.PI) / points;
          const px = Math.cos(angle) * r;
          const py = Math.sin(angle) * r;
          if (p === 0) ctx.moveTo(px, py);
          else ctx.lineTo(px, py);
        }
        ctx.closePath();
        ctx.fill();
        ctx.stroke();

        // Inner core flash
        ctx.fillStyle = `rgba(255, 255, 255, ${alpha})`;
        ctx.beginPath();
        ctx.arc(0, 0, radius * 0.35, 0, Math.PI * 2);
        ctx.fill();
      } else if (fx.type === 'block') {
        const radius = 22 + progress * 15;
        ctx.strokeStyle = `rgba(56, 189, 248, ${alpha})`;
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.arc(fx.x, fx.y, radius, 0, Math.PI * 2);
        ctx.stroke();
      } else if (fx.type === 'dust') {
        const radius = 6 + progress * 14;
        ctx.fillStyle = `rgba(214, 164, 71, ${alpha * 0.45})`;
        ctx.beginPath();
        ctx.arc(fx.x, fx.y, radius, 0, Math.PI * 2);
        ctx.fill();
      } else if (fx.type === 'comic_text' && fx.text) {
        ctx.font = `900 ${Math.round(22 * (fx.scale || 1))}px "Bungee", Impact, sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';

        // Outer stroke
        ctx.strokeStyle = `rgba(16, 17, 27, ${alpha})`;
        ctx.lineWidth = 6;
        ctx.strokeText(fx.text, fx.x, fx.y);

        // Gradient or bright fill
        ctx.fillStyle = `rgba(253, 224, 71, ${alpha})`;
        ctx.fillText(fx.text, fx.x, fx.y);
      }
      ctx.restore();
    }
  }

  /**
   * Render debug visualization for hurtboxes, active/startup/recovery hitboxes, origin, and facing
   */
  public static renderDebugOverlay(ctx: CanvasRenderingContext2D, fighter: Fighter): void {
    ctx.save();

    // 1. Hurtbox (Green when normal, Cyan when blocking, Gray when invulnerable)
    const hurtbox = HitboxSystem.getHurtbox(fighter.x, fighter.y, fighter.state, fighter.facing);
    if (fighter.isInvulnerable()) {
      ctx.strokeStyle = 'rgba(148, 163, 184, 0.9)';
      ctx.fillStyle = 'rgba(148, 163, 184, 0.2)';
    } else if (fighter.isBlocking()) {
      ctx.strokeStyle = 'rgba(56, 189, 248, 0.95)';
      ctx.fillStyle = 'rgba(56, 189, 248, 0.22)';
    } else {
      ctx.strokeStyle = 'rgba(34, 197, 94, 0.95)';
      ctx.fillStyle = 'rgba(34, 197, 94, 0.18)';
    }
    ctx.lineWidth = 2;
    ctx.fillRect(hurtbox.x, hurtbox.y, hurtbox.w, hurtbox.h);
    ctx.strokeRect(hurtbox.x, hurtbox.y, hurtbox.w, hurtbox.h);

    // 2. Attack Hitbox (Red when active, Yellow during startup/recovery)
    if (fighter.isAttacking() && fighter.currentAttack) {
      const move = fighter.character.moves[fighter.currentAttack];
      const hitbox = HitboxSystem.getAttackHitbox(
        fighter.x,
        fighter.y,
        fighter.facing,
        move.hitboxOffset
      );
      const isActive = fighter.isAttackActive();
      ctx.strokeStyle = isActive ? 'rgba(239, 68, 68, 1)' : 'rgba(250, 204, 21, 0.85)';
      ctx.fillStyle = isActive ? 'rgba(239, 68, 68, 0.35)' : 'rgba(250, 204, 21, 0.15)';
      ctx.lineWidth = isActive ? 3 : 1.5;
      ctx.fillRect(hitbox.x, hitbox.y, hitbox.w, hitbox.h);
      ctx.strokeRect(hitbox.x, hitbox.y, hitbox.w, hitbox.h);
    }

    // 3. Fighter Origin Crosshair & Facing Vector
    ctx.strokeStyle = '#FFFFFF';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(fighter.x - 8, fighter.y);
    ctx.lineTo(fighter.x + 8, fighter.y);
    ctx.moveTo(fighter.x, fighter.y - 8);
    ctx.lineTo(fighter.x, fighter.y + 8);
    ctx.stroke();

    // Facing direction arrow
    ctx.strokeStyle = '#F59E0B';
    ctx.beginPath();
    ctx.moveTo(fighter.x, fighter.y - 50);
    ctx.lineTo(fighter.x + fighter.facing * 28, fighter.y - 50);
    ctx.stroke();

    // State & Frame Telemetry Label
    ctx.font = '700 11px monospace';
    ctx.fillStyle = '#FEF08A';
    ctx.textAlign = 'center';
    ctx.fillText(
      `${fighter.state.toUpperCase()} [F:${fighter.frameInState}]`,
      fighter.x,
      hurtbox.y - 8
    );

    ctx.restore();
  }

  /**
   * Main Fighter Rendering Engine
   */
  public static renderFighter(ctx: CanvasRenderingContext2D, fighter: Fighter, groundY: number): void {
    ctx.save();

    // 1. Shadow underneath fighter on stage floor
    const distToGround = Math.max(0, groundY - fighter.y);
    const shadowScale = Math.max(0.3, 1 - distToGround / 350);
    ctx.fillStyle = 'rgba(0, 0, 0, 0.4)';
    ctx.beginPath();
    ctx.ellipse(fighter.x, groundY + 4, 38 * shadowScale, 11 * shadowScale, 0, 0, Math.PI * 2);
    ctx.fill();

    // Transform coordinate system to fighter position
    ctx.translate(fighter.x, fighter.y);
    // Facing direction: 1 = normal, -1 = flip horizontal
    ctx.scale(fighter.facing, 1);

    const fId = fighter.character.id;
    const v = fighter.character.visuals;
    const state = fighter.state;
    const frame = fighter.frameInState;

    // Super aura glow if in super state or full meter
    if (fighter.state === 'super' || fighter.meter >= 100) {
      ctx.save();
      ctx.fillStyle = v.auraColor;
      ctx.filter = 'blur(6px)';
      ctx.beginPath();
      ctx.arc(0, -50, 60, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    // Hit flash: target flashes solid white/yellow for 2 frames when hit
    if (state === 'hurt' && fighter.hitStun > fighter.character.moves.punch.hitStunFrames - 3) {
      ctx.fillStyle = '#FFFFFF';
    }

    // Pose dispatch
    switch (state) {
      case 'idle':
        SpriteRenderer.drawIdlePose(ctx, fId, v, frame);
        break;
      case 'walk_forward':
      case 'walk_backward':
        SpriteRenderer.drawWalkPose(ctx, fId, v, frame, state === 'walk_forward');
        break;
      case 'jump':
        SpriteRenderer.drawJumpPose(ctx, fId, v, fighter.vy);
        break;
      case 'crouch':
      case 'crouch_block':
        SpriteRenderer.drawCrouchPose(ctx, fId, v, state === 'crouch_block');
        break;
      case 'block':
        SpriteRenderer.drawBlockPose(ctx, fId, v);
        break;
      case 'punch':
        SpriteRenderer.drawPunchPose(ctx, fId, v, frame);
        break;
      case 'kick':
        SpriteRenderer.drawKickPose(ctx, fId, v, frame);
        break;
      case 'sweep':
        SpriteRenderer.drawSweepPose(ctx, fId, v, frame);
        break;
      case 'forward_punch':
        SpriteRenderer.drawForwardPunchPose(ctx, fId, v, frame);
        break;
      case 'forward_kick':
        SpriteRenderer.drawForwardKickPose(ctx, fId, v, frame);
        break;
      case 'grab':
        SpriteRenderer.drawGrabPose(ctx, fId, v, frame);
        break;
      case 'super':
        SpriteRenderer.drawSuperPose(ctx, fId, v, frame);
        break;
      case 'hurt':
        SpriteRenderer.drawHurtPose(ctx, fId, v, frame);
        break;
      case 'knockdown':
        SpriteRenderer.drawKnockdownPose(ctx, fId, v);
        break;
      case 'recovery':
        SpriteRenderer.drawRecoveryPose(ctx, fId, v, frame);
        break;
      case 'victory':
        SpriteRenderer.drawVictoryPose(ctx, fId, v, frame);
        break;
      case 'defeat':
        SpriteRenderer.drawDefeatPose(ctx, fId, v);
        break;
      default:
        SpriteRenderer.drawIdlePose(ctx, fId, v, frame);
        break;
    }

    ctx.restore();
  }

  // --- CHARACTER-SPECIFIC DETAILS HELPER ---
  private static drawHeadAndFace(
    ctx: CanvasRenderingContext2D,
    fId: FighterId,
    v: Fighter['character']['visuals'],
    headX: number,
    headY: number,
    angle: number = 0
  ): void {
    ctx.save();
    ctx.translate(headX, headY);
    ctx.rotate(angle);

    // Head base
    ctx.fillStyle = v.skinTone;
    ctx.strokeStyle = '#10111B';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.ellipse(0, 0, 16, 20, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // Hair
    ctx.fillStyle = v.hairColor;
    if (fId === 'action_sultan') {
      // Short cropped machismo haircut
      ctx.beginPath();
      ctx.ellipse(0, -11, 17, 12, 0, Math.PI, Math.PI * 2);
      ctx.fill();
      ctx.stroke();

      // Signature Aviator Sunglasses
      ctx.fillStyle = '#111827';
      ctx.strokeStyle = '#D6A447';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.roundRect(2, -4, 11, 8, 3);
      ctx.fill();
      ctx.stroke();

      // Prominent Bollywood Action Mustache
      ctx.fillStyle = '#1F2937';
      ctx.beginPath();
      ctx.ellipse(6, 6, 9, 3, 0.1, 0, Math.PI * 2);
      ctx.fill();
    } else if (fId === 'romance_raja') {
      // Flowing 90s Bollywood wavy romantic hair
      ctx.beginPath();
      ctx.arc(0, -10, 18, Math.PI * 0.9, Math.PI * 2.2);
      ctx.lineTo(12, 4);
      ctx.lineTo(-14, 2);
      ctx.fill();
      ctx.stroke();

      // Charming eye and dimple smirk
      ctx.fillStyle = '#10111B';
      ctx.beginPath();
      ctx.arc(6, -2, 2.5, 0, Math.PI * 2);
      ctx.fill();
      // Smirk
      ctx.strokeStyle = '#10111B';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(5, 5, 5, 0.2, Math.PI * 0.8);
      ctx.stroke();
    } else if (fId === 'dance_dynamo') {
      // Modern spiked disco/popstar hair with cyan streaks
      ctx.beginPath();
      ctx.moveTo(-14, -8);
      ctx.lineTo(-10, -26);
      ctx.lineTo(-2, -18);
      ctx.lineTo(6, -28);
      ctx.lineTo(14, -16);
      ctx.lineTo(16, -6);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();

      // Cyan highlight streak
      ctx.strokeStyle = '#38BDF8';
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.moveTo(2, -22);
      ctx.lineTo(10, -14);
      ctx.stroke();

      // Piercing focused eyes
      ctx.fillStyle = '#0284C7';
      ctx.beginPath();
      ctx.arc(6, -3, 3, 0, Math.PI * 2);
      ctx.fill();
    } else if (fId === 'villain_saab') {
      // Slicked back salt & pepper hair
      ctx.beginPath();
      ctx.ellipse(-2, -12, 17, 10, -0.2, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();

      // Wicked arched eyebrows and thin mustache
      ctx.strokeStyle = '#10111B';
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.moveTo(1, -6);
      ctx.lineTo(10, -9);
      ctx.stroke();

      // Villain smirk
      ctx.beginPath();
      ctx.moveTo(3, 7);
      ctx.lineTo(12, 4);
      ctx.stroke();
    }

    ctx.restore();
  }

  // --- POSES ---

  private static drawIdlePose(ctx: CanvasRenderingContext2D, fId: FighterId, v: Fighter['character']['visuals'], frame: number): void {
    const bob = Math.sin(frame * 0.12) * 3;

    // Torso / Attire
    ctx.fillStyle = v.primaryColor;
    ctx.strokeStyle = '#10111B';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.roundRect(-16, -80 + bob, 32, 42, 6);
    ctx.fill();
    ctx.stroke();

    // Specialty attire features
    if (fId === 'action_sultan') {
      // Rolled up sleeves & chest band
      ctx.fillStyle = v.secondaryColor;
      ctx.fillRect(-16, -55 + bob, 32, 7);
      // Kada (steel bangle)
      ctx.fillStyle = '#E2E8F0';
      ctx.fillRect(16, -62 + bob, 6, 6);
    } else if (fId === 'romance_raja') {
      // Iconic red flowing scarf
      ctx.fillStyle = '#E11D48';
      ctx.beginPath();
      ctx.moveTo(-10, -78 + bob);
      ctx.quadraticCurveTo(-26, -55 + bob + Math.sin(frame * 0.15) * 4, -32, -40 + bob);
      ctx.lineTo(-24, -38 + bob);
      ctx.quadraticCurveTo(-14, -58 + bob, -2, -75 + bob);
      ctx.fill();
    } else if (fId === 'villain_saab') {
      // Gold chain
      ctx.strokeStyle = '#F59E0B';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(0, -72 + bob, 10, 0.2, Math.PI * 0.8);
      ctx.stroke();
    }

    // Head
    SpriteRenderer.drawHeadAndFace(ctx, fId, v, 0, -94 + bob);

    // Legs
    ctx.fillStyle = v.secondaryColor;
    ctx.strokeStyle = '#10111B';
    ctx.lineWidth = 3;

    // Left leg
    ctx.beginPath();
    ctx.roundRect(-14, -38 + bob, 12, 38 - bob, 4);
    ctx.fill();
    ctx.stroke();
    // Right leg
    ctx.beginPath();
    ctx.roundRect(4, -38 + bob, 12, 38 - bob, 4);
    ctx.fill();
    ctx.stroke();

    // Guarding Arms
    ctx.fillStyle = v.skinTone;
    ctx.strokeStyle = '#10111B';
    ctx.lineWidth = 3;
    // Back arm fist
    ctx.beginPath();
    ctx.ellipse(-12, -62 + bob, 9, 9, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    // Front arm fist
    ctx.beginPath();
    ctx.ellipse(18, -66 + bob + Math.sin(frame * 0.12) * 2, 10, 10, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  }

  private static drawWalkPose(ctx: CanvasRenderingContext2D, fId: FighterId, v: Fighter['character']['visuals'], frame: number, forward: boolean): void {
    const cycle = (frame * 0.25) % (Math.PI * 2);
    const legSwing = Math.sin(cycle) * 16;
    const armSwing = Math.cos(cycle) * 14;

    // Torso
    ctx.fillStyle = v.primaryColor;
    ctx.strokeStyle = '#10111B';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.roundRect(-16, -80, 32, 42, 6);
    ctx.fill();
    ctx.stroke();

    // Head
    SpriteRenderer.drawHeadAndFace(ctx, fId, v, 0, -94);

    // Legs walking stride
    ctx.fillStyle = v.secondaryColor;
    ctx.strokeStyle = '#10111B';
    ctx.lineWidth = 3;

    // Back leg
    ctx.beginPath();
    ctx.roundRect(-14 - legSwing * 0.6, -38, 12, 38, 4);
    ctx.fill();
    ctx.stroke();
    // Front leg
    ctx.beginPath();
    ctx.roundRect(4 + legSwing * 0.6, -38, 12, 38, 4);
    ctx.fill();
    ctx.stroke();

    // Swinging Arms
    ctx.fillStyle = v.skinTone;
    ctx.strokeStyle = '#10111B';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.ellipse(16 + armSwing, -64, 9, 9, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  }

  private static drawJumpPose(ctx: CanvasRenderingContext2D, fId: FighterId, v: Fighter['character']['visuals'], vy: number): void {
    const isTucked = Math.abs(vy) > 2;

    // Tucked Torso
    ctx.fillStyle = v.primaryColor;
    ctx.strokeStyle = '#10111B';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.roundRect(-16, -75, 32, 38, 6);
    ctx.fill();
    ctx.stroke();

    // Head tilted up
    SpriteRenderer.drawHeadAndFace(ctx, fId, v, 2, -90, 0.15);

    // Legs tucked up in air
    ctx.fillStyle = v.secondaryColor;
    ctx.strokeStyle = '#10111B';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.roundRect(-12, -37, 24, isTucked ? 20 : 32, 6);
    ctx.fill();
    ctx.stroke();

    // Raised airborne fists
    ctx.fillStyle = v.skinTone;
    ctx.beginPath();
    ctx.ellipse(12, -72, 10, 10, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  }

  private static drawCrouchPose(ctx: CanvasRenderingContext2D, fId: FighterId, v: Fighter['character']['visuals'], isBlock: boolean): void {
    // Low crouching torso
    ctx.fillStyle = v.primaryColor;
    ctx.strokeStyle = '#10111B';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.roundRect(-16, -48, 34, 30, 6);
    ctx.fill();
    ctx.stroke();

    // Head lower
    SpriteRenderer.drawHeadAndFace(ctx, fId, v, 4, -60, isBlock ? -0.2 : 0);

    // Squatting bent legs
    ctx.fillStyle = v.secondaryColor;
    ctx.beginPath();
    ctx.roundRect(-18, -20, 38, 20, 6);
    ctx.fill();
    ctx.stroke();

    // Guard arms
    ctx.fillStyle = v.skinTone;
    ctx.beginPath();
    ctx.ellipse(isBlock ? 10 : 16, -42, 10, 10, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  }

  private static drawBlockPose(ctx: CanvasRenderingContext2D, fId: FighterId, v: Fighter['character']['visuals']): void {
    // Braced upright stance
    ctx.fillStyle = v.primaryColor;
    ctx.strokeStyle = '#10111B';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.roundRect(-16, -78, 32, 40, 6);
    ctx.fill();
    ctx.stroke();

    // Head tucked behind guard
    SpriteRenderer.drawHeadAndFace(ctx, fId, v, -4, -92, -0.15);

    // Legs firmly braced
    ctx.fillStyle = v.secondaryColor;
    ctx.beginPath();
    ctx.roundRect(-16, -38, 14, 38, 4);
    ctx.roundRect(4, -38, 14, 38, 4);
    ctx.fill();
    ctx.stroke();

    // Crossed Forearms Guard
    ctx.fillStyle = v.skinTone;
    ctx.strokeStyle = '#10111B';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.roundRect(4, -76, 16, 26, 4);
    ctx.fill();
    ctx.stroke();

    // Shimmering blue guard shield
    ctx.strokeStyle = 'rgba(56, 189, 248, 0.75)';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(22, -64, 26, -Math.PI * 0.4, Math.PI * 0.4);
    ctx.stroke();
  }

  private static drawPunchPose(ctx: CanvasRenderingContext2D, fId: FighterId, v: Fighter['character']['visuals'], frame: number): void {
    // Torso thrust forward
    ctx.fillStyle = v.primaryColor;
    ctx.strokeStyle = '#10111B';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.roundRect(-14, -78, 34, 40, 6);
    ctx.fill();
    ctx.stroke();

    // Head
    SpriteRenderer.drawHeadAndFace(ctx, fId, v, 2, -92);

    // Legs
    ctx.fillStyle = v.secondaryColor;
    ctx.beginPath();
    ctx.roundRect(-14, -38, 13, 38, 4);
    ctx.roundRect(6, -38, 13, 38, 4);
    ctx.fill();
    ctx.stroke();

    // Extended Punch Arm & Fist
    const extension = frame < 4 ? 35 : frame < 8 ? 58 : 42;
    ctx.fillStyle = v.skinTone;
    ctx.strokeStyle = '#10111B';
    ctx.lineWidth = 3;

    // Arm
    ctx.beginPath();
    ctx.roundRect(8, -75, extension - 10, 14, 4);
    ctx.fill();
    ctx.stroke();

    // Fist
    ctx.beginPath();
    ctx.ellipse(extension, -68, 11, 11, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // Punch speedlines
    ctx.strokeStyle = '#FCD34D';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(extension - 30, -74);
    ctx.lineTo(extension + 10, -74);
    ctx.moveTo(extension - 25, -62);
    ctx.lineTo(extension + 8, -62);
    ctx.stroke();
  }

  private static drawKickPose(ctx: CanvasRenderingContext2D, fId: FighterId, v: Fighter['character']['visuals'], frame: number): void {
    // Torso leaned back for leverage
    ctx.fillStyle = v.primaryColor;
    ctx.strokeStyle = '#10111B';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.roundRect(-18, -76, 32, 40, 6);
    ctx.fill();
    ctx.stroke();

    // Head
    SpriteRenderer.drawHeadAndFace(ctx, fId, v, -6, -90, -0.2);

    // Support leg
    ctx.fillStyle = v.secondaryColor;
    ctx.beginPath();
    ctx.roundRect(-12, -36, 14, 36, 4);
    ctx.fill();
    ctx.stroke();

    // Extended High Kick Leg
    const kickExtension = frame < 5 ? 40 : frame < 9 ? 65 : 45;
    ctx.beginPath();
    ctx.save();
    ctx.translate(6, -45);
    ctx.rotate(-0.4);
    ctx.roundRect(0, -6, kickExtension, 16, 4);
    ctx.fill();
    ctx.stroke();

    // Boot / Foot
    ctx.fillStyle = '#10111B';
    ctx.fillRect(kickExtension - 6, -10, 16, 12);
    ctx.restore();

    // Kick motion arc
    ctx.strokeStyle = 'rgba(251, 191, 36, 0.8)';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(10, -50, 50, -0.6, 0.3);
    ctx.stroke();
  }

  private static drawSweepPose(ctx: CanvasRenderingContext2D, fId: FighterId, v: Fighter['character']['visuals'], frame: number): void {
    // Low slide torso
    ctx.fillStyle = v.primaryColor;
    ctx.strokeStyle = '#10111B';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.roundRect(-18, -36, 34, 24, 6);
    ctx.fill();
    ctx.stroke();

    // Head low
    SpriteRenderer.drawHeadAndFace(ctx, fId, v, -2, -48);

    // Sweeping leg extended along ground
    ctx.fillStyle = v.secondaryColor;
    const extension = frame < 6 ? 50 : 68;
    ctx.beginPath();
    ctx.roundRect(0, -16, extension, 14, 4);
    ctx.fill();
    ctx.stroke();

    // Dust particles at floor
    ctx.fillStyle = 'rgba(214, 164, 71, 0.6)';
    ctx.beginPath();
    ctx.arc(extension + 10, -8, 8, 0, Math.PI * 2);
    ctx.fill();
  }

  private static drawForwardPunchPose(ctx: CanvasRenderingContext2D, fId: FighterId, v: Fighter['character']['visuals'], frame: number): void {
    // Heavy lunging haymaker
    ctx.fillStyle = v.primaryColor;
    ctx.strokeStyle = '#10111B';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.roundRect(-10, -78, 38, 42, 6);
    ctx.fill();
    ctx.stroke();

    // Head focused forward
    SpriteRenderer.drawHeadAndFace(ctx, fId, v, 10, -92, 0.15);

    // Wide lunging stance
    ctx.fillStyle = v.secondaryColor;
    ctx.beginPath();
    ctx.roundRect(-22, -36, 16, 36, 4);
    ctx.roundRect(14, -36, 16, 36, 4);
    ctx.fill();
    ctx.stroke();

    // Giant Thunder Fist
    const punchX = frame < 6 ? 45 : 75;
    ctx.fillStyle = v.skinTone;
    ctx.strokeStyle = '#10111B';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.roundRect(12, -76, punchX - 16, 18, 4);
    ctx.fill();
    ctx.stroke();

    ctx.beginPath();
    ctx.ellipse(punchX, -67, 16, 16, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // Thunder flame aura around fist
    ctx.fillStyle = v.auraColor;
    ctx.beginPath();
    ctx.arc(punchX, -67, 26, 0, Math.PI * 2);
    ctx.fill();
  }

  private static drawForwardKickPose(ctx: CanvasRenderingContext2D, fId: FighterId, v: Fighter['character']['visuals'], frame: number): void {
    // Leaping Flying Kick / Roundhouse
    ctx.fillStyle = v.primaryColor;
    ctx.strokeStyle = '#10111B';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.roundRect(-14, -72, 34, 38, 6);
    ctx.fill();
    ctx.stroke();

    // Head
    SpriteRenderer.drawHeadAndFace(ctx, fId, v, 6, -88, 0.2);

    // Flying extended kick
    ctx.fillStyle = v.secondaryColor;
    ctx.beginPath();
    ctx.roundRect(-10, -52, 72, 16, 4);
    ctx.fill();
    ctx.stroke();

    // Boot
    ctx.fillStyle = '#10111B';
    ctx.fillRect(56, -56, 18, 20);
  }

  private static drawGrabPose(ctx: CanvasRenderingContext2D, fId: FighterId, v: Fighter['character']['visuals'], frame: number): void {
    // Both arms reaching forward to grapple
    ctx.fillStyle = v.primaryColor;
    ctx.strokeStyle = '#10111B';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.roundRect(-14, -78, 32, 40, 6);
    ctx.fill();
    ctx.stroke();

    SpriteRenderer.drawHeadAndFace(ctx, fId, v, 4, -92);

    // Legs
    ctx.fillStyle = v.secondaryColor;
    ctx.beginPath();
    ctx.roundRect(-14, -38, 12, 38, 4);
    ctx.roundRect(4, -38, 12, 38, 4);
    ctx.fill();
    ctx.stroke();

    // Dual grabbing hands
    ctx.fillStyle = v.skinTone;
    ctx.beginPath();
    ctx.roundRect(10, -78, 36, 10, 3);
    ctx.roundRect(10, -62, 36, 10, 3);
    ctx.fill();
    ctx.stroke();
  }

  private static drawSuperPose(ctx: CanvasRenderingContext2D, fId: FighterId, v: Fighter['character']['visuals'], frame: number): void {
    // Golden radiant aura explosion
    ctx.fillStyle = v.auraColor;
    ctx.beginPath();
    ctx.arc(20, -60, 85, 0, Math.PI * 2);
    ctx.fill();

    // Dramatic super lunge
    ctx.fillStyle = v.primaryColor;
    ctx.strokeStyle = '#F59E0B';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.roundRect(-12, -80, 42, 44, 6);
    ctx.fill();
    ctx.stroke();

    SpriteRenderer.drawHeadAndFace(ctx, fId, v, 14, -94, 0.25);

    // Massive cinematic finishing strike
    ctx.fillStyle = '#FEF08A';
    ctx.strokeStyle = '#DC2626';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.ellipse(75, -65, 25, 25, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  }

  private static drawHurtPose(ctx: CanvasRenderingContext2D, fId: FighterId, v: Fighter['character']['visuals'], frame: number): void {
    // Reeled back in pain
    ctx.fillStyle = v.primaryColor;
    ctx.strokeStyle = '#10111B';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.roundRect(-24, -76, 32, 40, 6);
    ctx.fill();
    ctx.stroke();

    // Head tilted backward with grimace
    SpriteRenderer.drawHeadAndFace(ctx, fId, v, -18, -90, -0.35);

    // Staggered legs
    ctx.fillStyle = v.secondaryColor;
    ctx.beginPath();
    ctx.roundRect(-24, -36, 14, 36, 4);
    ctx.roundRect(-4, -36, 14, 36, 4);
    ctx.fill();
    ctx.stroke();

    // Flailing arms
    ctx.fillStyle = v.skinTone;
    ctx.beginPath();
    ctx.ellipse(-26, -58, 9, 9, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  }

  private static drawKnockdownPose(ctx: CanvasRenderingContext2D, fId: FighterId, v: Fighter['character']['visuals']): void {
    // Lying flat on ground
    ctx.fillStyle = v.primaryColor;
    ctx.strokeStyle = '#10111B';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.roundRect(-35, -20, 45, 18, 4);
    ctx.fill();
    ctx.stroke();

    // Head on ground
    SpriteRenderer.drawHeadAndFace(ctx, fId, v, -45, -12, -Math.PI / 2);

    // Outstretched legs
    ctx.fillStyle = v.secondaryColor;
    ctx.beginPath();
    ctx.roundRect(10, -18, 38, 14, 4);
    ctx.fill();
    ctx.stroke();
  }

  private static drawRecoveryPose(ctx: CanvasRenderingContext2D, fId: FighterId, v: Fighter['character']['visuals'], frame: number): void {
    // Getting up from one knee
    ctx.fillStyle = v.primaryColor;
    ctx.strokeStyle = '#10111B';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.roundRect(-16, -55, 32, 34, 6);
    ctx.fill();
    ctx.stroke();

    SpriteRenderer.drawHeadAndFace(ctx, fId, v, 0, -68);

    // Kneeling legs
    ctx.fillStyle = v.secondaryColor;
    ctx.beginPath();
    ctx.roundRect(-16, -24, 28, 24, 4);
    ctx.fill();
    ctx.stroke();
  }

  private static drawVictoryPose(ctx: CanvasRenderingContext2D, fId: FighterId, v: Fighter['character']['visuals'], frame: number): void {
    // Heroic upright victory stance
    ctx.fillStyle = v.primaryColor;
    ctx.strokeStyle = '#D6A447';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.roundRect(-16, -82, 32, 44, 6);
    ctx.fill();
    ctx.stroke();

    SpriteRenderer.drawHeadAndFace(ctx, fId, v, 0, -96);

    // Legs firm
    ctx.fillStyle = v.secondaryColor;
    ctx.beginPath();
    ctx.roundRect(-16, -38, 14, 38, 4);
    ctx.roundRect(4, -38, 14, 38, 4);
    ctx.fill();
    ctx.stroke();

    // Character-specific victory gesture
    ctx.fillStyle = v.skinTone;
    ctx.strokeStyle = '#10111B';
    ctx.lineWidth = 3;

    if (fId === 'action_sultan') {
      // Flexing biceps with steel kada shine
      ctx.beginPath();
      ctx.ellipse(-20, -80, 10, 10, 0, 0, Math.PI * 2);
      ctx.ellipse(20, -80, 10, 10, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    } else if (fId === 'romance_raja') {
      // Iconic open arms gesture
      ctx.beginPath();
      ctx.roundRect(-38, -75, 26, 10, 4);
      ctx.roundRect(14, -75, 26, 10, 4);
      ctx.fill();
      ctx.stroke();
    } else if (fId === 'dance_dynamo') {
      // Pointing up to the ceiling disco pose
      ctx.beginPath();
      ctx.roundRect(12, -110, 10, 36, 4);
      ctx.fill();
      ctx.stroke();
    } else {
      // Villain cigar tip and sinister laugh
      ctx.beginPath();
      ctx.ellipse(14, -84, 9, 9, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }
  }

  private static drawDefeatPose(ctx: CanvasRenderingContext2D, fId: FighterId, v: Fighter['character']['visuals']): void {
    // Collapsed on knees, head hung low
    ctx.fillStyle = v.primaryColor;
    ctx.strokeStyle = '#334155';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.roundRect(-18, -48, 34, 32, 6);
    ctx.fill();
    ctx.stroke();

    SpriteRenderer.drawHeadAndFace(ctx, fId, v, 8, -50, 0.6);

    // Collapsed knees
    ctx.fillStyle = v.secondaryColor;
    ctx.beginPath();
    ctx.roundRect(-20, -18, 40, 18, 4);
    ctx.fill();
    ctx.stroke();
  }
}
