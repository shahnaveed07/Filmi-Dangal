import { ArenaId } from '../types/fighter';

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  alpha: number;
}

export class ArenaRenderer {
  private static particles: Particle[] = [];
  private static cameraFlashes: { x: number; y: number; life: number }[] = [];

  public static init(): void {
    if (this.particles.length === 0) {
      for (let i = 0; i < 40; i++) {
        this.particles.push({
          x: Math.random() * 1280,
          y: Math.random() * 580,
          vx: (Math.random() - 0.5) * 0.6,
          vy: -Math.random() * 0.8 - 0.2,
          radius: Math.random() * 2 + 1,
          alpha: Math.random() * 0.6 + 0.2,
        });
      }
    }
  }

  public static update(frame: number): void {
    // Update ambient particles
    for (const p of this.particles) {
      p.x += p.vx;
      p.y += p.vy;
      if (p.y < 0) {
        p.y = 580;
        p.x = Math.random() * 1280;
      }
    }

    // Paparazzi camera flashes in audience
    if (Math.random() < 0.12) {
      this.cameraFlashes.push({
        x: Math.random() * 1280,
        y: 450 + Math.random() * 120,
        life: 5,
      });
    }

    for (let i = this.cameraFlashes.length - 1; i >= 0; i--) {
      this.cameraFlashes[i].life--;
      if (this.cameraFlashes[i].life <= 0) {
        this.cameraFlashes.splice(i, 1);
      }
    }
  }

  public static render(ctx: CanvasRenderingContext2D, arenaId: ArenaId, frame: number, groundY: number): void {
    this.init();

    if (arenaId === 'award_night') {
      this.renderAwardNight(ctx, frame, groundY);
    } else {
      this.renderFilmCity(ctx, frame, groundY);
    }
  }

  private static renderAwardNight(ctx: CanvasRenderingContext2D, frame: number, groundY: number): void {
    // 1. Midnight Dark Backdrop
    const grad = ctx.createLinearGradient(0, 0, 0, groundY);
    grad.addColorStop(0, '#0A0A12');
    grad.addColorStop(0.7, '#181124');
    grad.addColorStop(1, '#2E1020');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 1280, 720);

    // 2. Grand Architectural Columns
    ctx.fillStyle = '#261B30';
    ctx.fillRect(60, 40, 50, groundY - 40);
    ctx.fillRect(1170, 40, 50, groundY - 40);

    // Gold Trim on Columns
    ctx.fillStyle = '#D6A447';
    ctx.fillRect(55, 30, 60, 14);
    ctx.fillRect(1165, 30, 60, 14);
    ctx.fillRect(55, groundY - 20, 60, 20);
    ctx.fillRect(1165, groundY - 20, 60, 20);

    // 3. Center Award Screen / Marquee
    ctx.fillStyle = '#110D1A';
    ctx.strokeStyle = '#D6A447';
    ctx.lineWidth = 3;
    ctx.fillRect(340, 50, 600, 130);
    ctx.strokeRect(340, 50, 600, 130);

    // Golden Trophy Emblem in Center
    ctx.fillStyle = '#F59E0B';
    ctx.beginPath();
    ctx.arc(640, 105, 24, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillRect(634, 115, 12, 35);
    ctx.fillRect(626, 150, 28, 8);

    // Stage Marquee Text
    ctx.font = '900 24px "Cinzel", Georgia, serif';
    ctx.fillStyle = '#F1E7D0';
    ctx.textAlign = 'center';
    ctx.fillText('FILMI DANGAL AWARDS', 640, 85);

    ctx.font = '700 13px "Rajdhani", sans-serif';
    ctx.fillStyle = '#D6A447';
    ctx.letterSpacing = '3px';
    ctx.fillText('★ NATIONAL CINEMA ACADEMY STAGE ★', 640, 185);

    // 4. Sweeping Dual Spotlights
    const spotAngle1 = Math.sin(frame * 0.02) * 0.4 - 0.2;
    const spotAngle2 = -Math.cos(frame * 0.022) * 0.4 + 0.2;

    ctx.save();
    // Spotlight 1 (Left)
    ctx.translate(100, 0);
    ctx.rotate(spotAngle1);
    const spotGrad1 = ctx.createLinearGradient(0, 0, 0, 650);
    spotGrad1.addColorStop(0, 'rgba(251, 191, 36, 0.35)');
    spotGrad1.addColorStop(1, 'rgba(251, 191, 36, 0.0)');
    ctx.fillStyle = spotGrad1;
    ctx.beginPath();
    ctx.moveTo(-15, 0);
    ctx.lineTo(15, 0);
    ctx.lineTo(120, 650);
    ctx.lineTo(-120, 650);
    ctx.closePath();
    ctx.fill();
    ctx.restore();

    ctx.save();
    // Spotlight 2 (Right)
    ctx.translate(1180, 0);
    ctx.rotate(spotAngle2);
    const spotGrad2 = ctx.createLinearGradient(0, 0, 0, 650);
    spotGrad2.addColorStop(0, 'rgba(239, 68, 68, 0.35)');
    spotGrad2.addColorStop(1, 'rgba(239, 68, 68, 0.0)');
    ctx.fillStyle = spotGrad2;
    ctx.beginPath();
    ctx.moveTo(-15, 0);
    ctx.lineTo(15, 0);
    ctx.lineTo(120, 650);
    ctx.lineTo(-120, 650);
    ctx.closePath();
    ctx.fill();
    ctx.restore();

    // 5. Red Velvet Carpet Ground
    ctx.fillStyle = '#7F1D1D';
    ctx.fillRect(0, groundY, 1280, 720 - groundY);

    // Gold stage border line
    ctx.fillStyle = '#D6A447';
    ctx.fillRect(0, groundY - 4, 1280, 8);

    // Carpet runner pattern
    ctx.fillStyle = '#991B1B';
    ctx.fillRect(150, groundY + 4, 980, 720 - groundY);

    // 6. Audience Silhouettes & Paparazzi Flashes
    ctx.fillStyle = '#09080E';
    for (let x = 30; x < 1250; x += 55) {
      const headH = 14 + (x % 3) * 3;
      ctx.beginPath();
      ctx.ellipse(x, groundY - 20, 16, headH, 0, 0, Math.PI * 2);
      ctx.fill();
    }

    // Flashes
    for (const flash of this.cameraFlashes) {
      ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
      ctx.beginPath();
      ctx.arc(flash.x, flash.y, 16, 0, Math.PI * 2);
      ctx.fill();
    }

    // 7. Ambient Golden Sparkles
    ctx.fillStyle = '#FDE047';
    for (const p of this.particles) {
      ctx.globalAlpha = p.alpha;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1.0;
  }

  private static renderFilmCity(ctx: CanvasRenderingContext2D, frame: number, groundY: number): void {
    // 1. Film Studio Soundstage Dark Industrial Backdrop
    const grad = ctx.createLinearGradient(0, 0, 0, groundY);
    grad.addColorStop(0, '#0F172A');
    grad.addColorStop(1, '#1E293B');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 1280, 720);

    // 2. Brick Wall Details & Movie Posters
    ctx.strokeStyle = '#334155';
    ctx.lineWidth = 1;
    for (let y = 140; y < groundY; y += 30) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(1280, y);
      ctx.stroke();
    }

    // Movie Posters on Wall
    // Poster 1: "SHOLAY DANGAL"
    ctx.fillStyle = '#BE123C';
    ctx.fillRect(120, 200, 130, 180);
    ctx.strokeStyle = '#D6A447';
    ctx.lineWidth = 3;
    ctx.strokeRect(120, 200, 130, 180);
    ctx.fillStyle = '#FEF08A';
    ctx.font = '900 14px "Bungee", Impact, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('SHOLAY', 185, 240);
    ctx.fillText('DANGAL', 185, 260);

    // Poster 2: "DILWALE"
    ctx.fillStyle = '#0369A1';
    ctx.fillRect(1030, 190, 130, 190);
    ctx.strokeStyle = '#E2E8F0';
    ctx.strokeRect(1030, 190, 130, 190);
    ctx.fillStyle = '#FFFFFF';
    ctx.fillText('DILWALE', 1095, 240);
    ctx.fillText('FIGHTER', 1095, 260);

    // 3. Overhead Lighting Grid & Truss
    ctx.fillStyle = '#0F172A';
    ctx.fillRect(0, 0, 1280, 50);
    ctx.strokeStyle = '#64748B';
    ctx.lineWidth = 2;
    for (let x = 40; x < 1280; x += 90) {
      ctx.strokeRect(x, 10, 80, 30);
    }

    // Halogen Lights hanging from grid
    const lights = [200, 480, 800, 1080];
    lights.forEach((lx, idx) => {
      ctx.fillStyle = '#1E293B';
      ctx.fillRect(lx - 12, 45, 24, 25);

      // Light Cone
      const coneGrad = ctx.createLinearGradient(lx, 70, lx, 500);
      const isAmber = idx % 2 === 0;
      coneGrad.addColorStop(0, isAmber ? 'rgba(251, 191, 36, 0.4)' : 'rgba(56, 189, 248, 0.35)');
      coneGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');
      ctx.fillStyle = coneGrad;
      ctx.beginPath();
      ctx.moveTo(lx - 12, 70);
      ctx.lineTo(lx + 12, 70);
      ctx.lineTo(lx + 90, 500);
      ctx.lineTo(lx - 90, 500);
      ctx.closePath();
      ctx.fill();
    });

    // 4. Moving Crane Camera Rig (Left side)
    const craneY = 120 + Math.sin(frame * 0.02) * 35;
    ctx.strokeStyle = '#D97706';
    ctx.lineWidth = 8;
    ctx.beginPath();
    ctx.moveTo(0, 420);
    ctx.lineTo(240, craneY);
    ctx.stroke();

    // Camera Body at Crane Head
    ctx.fillStyle = '#020617';
    ctx.fillRect(230, craneY - 15, 45, 30);
    // Lens
    ctx.fillStyle = '#38BDF8';
    ctx.beginPath();
    ctx.arc(275, craneY, 10, 0, Math.PI * 2);
    ctx.fill();
    // Tally light (red recording dot)
    ctx.fillStyle = frame % 30 < 15 ? '#EF4444' : '#7F1D1D';
    ctx.beginPath();
    ctx.arc(240, craneY - 10, 4, 0, Math.PI * 2);
    ctx.fill();

    // 5. Overhead Boom Mic (Right side)
    const boomAngle = Math.sin(frame * 0.03) * 0.08;
    ctx.save();
    ctx.translate(1120, 50);
    ctx.rotate(boomAngle);
    ctx.strokeStyle = '#475569';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(-260, 220);
    ctx.stroke();
    // Foam mic cover
    ctx.fillStyle = '#0F172A';
    ctx.beginPath();
    ctx.ellipse(-260, 220, 16, 8, 0.4, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // 6. Soundstage Concrete Floor & Dolly Track
    ctx.fillStyle = '#1E293B';
    ctx.fillRect(0, groundY, 1280, 720 - groundY);

    // Hazard yellow/black stage boundary stripe
    ctx.fillStyle = '#EAB308';
    ctx.fillRect(0, groundY - 6, 1280, 10);
    ctx.fillStyle = '#0F172A';
    for (let x = 0; x < 1280; x += 30) {
      ctx.fillRect(x, groundY - 6, 15, 10);
    }

    // Camera Dolly Rails on floor
    ctx.strokeStyle = '#94A3B8';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(0, groundY + 40);
    ctx.lineTo(1280, groundY + 40);
    ctx.moveTo(0, groundY + 80);
    ctx.lineTo(1280, groundY + 80);
    ctx.stroke();

    // Dolly ties
    for (let tx = 20; tx < 1280; tx += 60) {
      ctx.fillStyle = '#334155';
      ctx.fillRect(tx, groundY + 36, 10, 48);
    }

    // Clapboard prop in corner
    ctx.fillStyle = '#0F172A';
    ctx.fillRect(1180, groundY + 15, 60, 45);
    ctx.fillStyle = '#FFFFFF';
    ctx.font = '700 9px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('TAKE: 01', 1210, groundY + 35);
    ctx.fillText('SCENE: 44', 1210, groundY + 48);
  }
}
