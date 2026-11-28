import { useEffect, useRef } from 'react';
import { flightTime, sampleAt, trajectory, type ProjectileSample } from '@pw/physics-core';
import type { RunState } from '@pw/contracts';

interface Props {
  v0: number;
  h: number;
  g: number;
  t: number;
  runState: RunState;
  accentColor?: string;
  ghostPoints?: ProjectileSample[] | null;
  showGhost?: boolean;
  onDragHeight?: (nextH: number) => void;
  minH?: number;
  maxH?: number;
}

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
  life: number;
  decay: number;
  color: string;
}

/**
 * 水粉手绘「救援飞机空投物资」平抛运动画布。
 * 所有轨迹与落地数据严格来自 @pw/physics-core，支持地球/月球水粉实景切换与鼠标上下拖动调高。
 */
export default function ProjectileCanvas(props: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const propsRef = useRef(props);
  propsRef.current = props;

  const animRef = useRef({
    cloudOffset: 0,
    flagPop: 0,
    wasLanded: false,
    draggingHeight: false,
    hoveringPlane: false,
    particles: [] as Particle[],
    lastTs: 0,
  });

  const spritesRef = useRef<{
    bg: HTMLImageElement;
    bgMoon: HTMLImageElement;
    plane: HTMLImageElement;
    crate: HTMLImageElement;
  } | null>(null);

  if (!spritesRef.current && typeof Image !== 'undefined') {
    const bg = new Image();
    const bgMoon = new Image();
    const plane = new Image();
    const crate = new Image();
    bg.src = '/assets/bg-earth.jpg';
    bgMoon.src = '/assets/bg-moon.jpg';
    plane.src = '/assets/plane.png';
    crate.src = '/assets/crate.png';
    spritesRef.current = { bg, bgMoon, plane, crate };
  }

  useEffect(() => {
    const canvas = canvasRef.current;
    const wrap = wrapRef.current;
    if (!canvas || !wrap) return;

    const getMetrics = () => {
      const { v0, h, g } = propsRef.current;
      const w = wrap.clientWidth;
      const ch = wrap.clientHeight;
      const padL = 86;
      const padR = 54;
      const padT = 68;
      const groundH = Math.max(54, Math.round(ch * 0.17));
      const plotW = Math.max(100, w - padL - padR);
      const plotH = Math.max(100, ch - padT - groundH);
      const params = { v0, h, g };
      const T = flightTime(params);
      const L = v0 * T;
      const maxX = Math.max(60, Math.ceil((L * 1.18) / 10) * 10);
      const maxY = Math.max(74, Math.ceil((h * 1.12) / 10) * 10);
      return {
        w,
        ch,
        padL,
        padR,
        padT,
        groundH,
        plotW,
        plotH,
        maxX,
        maxY,
        T,
        L,
        groundY: padT + plotH,
        toX: (x: number) => padL + (x / maxX) * plotW,
        toY: (y: number) => padT + plotH - (y / maxY) * plotH,
      };
    };

    const spawnParticles = (x: number, y: number) => {
      const colors = ['#6AD69A', '#FFE07D', '#FFFFFF', '#F2785C'];
      for (let i = 0; i < 14; i += 1) {
        const ang = -Math.PI * Math.random();
        const spd = 135 * (0.4 + Math.random() * 0.8);
        animRef.current.particles.push({
          x,
          y,
          vx: Math.cos(ang) * spd,
          vy: Math.sin(ang) * spd - 20,
          r: 3 + Math.random() * 4.5,
          life: 1,
          decay: 1.4 + Math.random() * 0.9,
          color: colors[i % colors.length] ?? '#FFFFFF',
        });
      }
    };

    const resize = () => {
      const dpr = window.devicePixelRatio || 1;
      const w = wrap.clientWidth;
      const ch = wrap.clientHeight;
      if (!w || !ch) return;
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(ch * dpr);
      canvas.style.width = `${w}px`;
      canvas.style.height = `${ch}px`;
      const ctx = canvas.getContext('2d');
      if (ctx) ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };

    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(wrap);

    // 鼠标/触控直接上下拖动飞机调节飞行高度
    const isNearPlane = (x: number, y: number) => {
      const { runState, t, h } = propsRef.current;
      if (runState !== 'idle' && t > 0) return false;
      const m = getMetrics();
      const px = m.toX(0);
      const py = m.toY(h) - 18;
      return Math.abs(x - px) < 76 && Math.abs(y - py) < 58;
    };

    const updateHeightFromClientY = (clientY: number) => {
      const { onDragHeight, minH = 5, maxH = 70 } = propsRef.current;
      if (!onDragHeight) return;
      const rect = canvas.getBoundingClientRect();
      const yPx = clientY - rect.top;
      const m = getMetrics();
      const ratio = (m.groundY - (yPx + 18)) / m.plotH;
      const rawH = Math.round(ratio * m.maxY);
      const clamped = Math.max(minH, Math.min(maxH, rawH));
      if (clamped !== propsRef.current.h) {
        onDragHeight(clamped);
      }
    };

    const onPointerDown = (e: PointerEvent) => {
      const rect = canvas.getBoundingClientRect();
      if (isNearPlane(e.clientX - rect.left, e.clientY - rect.top)) {
        animRef.current.draggingHeight = true;
        canvas.setPointerCapture(e.pointerId);
        canvas.style.cursor = 'grabbing';
        updateHeightFromClientY(e.clientY);
      }
    };

    const onPointerMove = (e: PointerEvent) => {
      if (animRef.current.draggingHeight) {
        updateHeightFromClientY(e.clientY);
        return;
      }
      const rect = canvas.getBoundingClientRect();
      const near = isNearPlane(e.clientX - rect.left, e.clientY - rect.top);
      animRef.current.hoveringPlane = near;
      canvas.style.cursor = near ? 'grab' : 'default';
    };

    const onPointerUp = (e: PointerEvent) => {
      if (animRef.current.draggingHeight) {
        animRef.current.draggingHeight = false;
        const rect = canvas.getBoundingClientRect();
        canvas.style.cursor = isNearPlane(e.clientX - rect.left, e.clientY - rect.top)
          ? 'grab'
          : 'default';
      }
    };

    const onPointerLeave = () => {
      if (!animRef.current.draggingHeight) {
        animRef.current.hoveringPlane = false;
        canvas.style.cursor = 'default';
      }
    };

    canvas.addEventListener('pointerdown', onPointerDown);
    canvas.addEventListener('pointermove', onPointerMove);
    canvas.addEventListener('pointerup', onPointerUp);
    canvas.addEventListener('pointerleave', onPointerLeave);

    let raf = 0;
    const render = (now: number) => {
      const st = animRef.current;
      if (!st.lastTs) st.lastTs = now;
      const dt = Math.min((now - st.lastTs) / 1000, 0.05);
      st.lastTs = now;
      st.cloudOffset = (st.cloudOffset + dt * 14) % 1400;

      const ctx = canvas.getContext('2d');
      const sp = spritesRef.current;
      if (ctx && sp) {
        const {
          v0,
          h,
          g,
          t,
          runState,
          accentColor = '#F2785C',
          ghostPoints,
          showGhost = true,
        } = propsRef.current;
        const m = getMetrics();
        const { w, ch, padL, groundY, maxX, toX, toY, L } = m;
        const params = { v0, h, g };
        const cur = sampleAt(params, t);
        const points = trajectory(params, 100);
        const isMoon = g <= 3.0;

        if (runState === 'landed' && !st.wasLanded) {
          st.wasLanded = true;
          st.flagPop = 0;
          spawnParticles(toX(L), groundY);
        } else if (runState !== 'landed') {
          st.wasLanded = false;
          st.flagPop = 0;
        }
        if (runState === 'landed' && st.flagPop < 1) {
          st.flagPop = Math.min(1, st.flagPop + dt * 4.5);
        }

        // 粒子步进
        for (let i = st.particles.length - 1; i >= 0; i -= 1) {
          const pt = st.particles[i];
          if (!pt) continue;
          pt.x += pt.vx * dt;
          pt.y += pt.vy * dt;
          pt.vy += 260 * dt;
          pt.life -= pt.decay * dt;
          if (pt.life <= 0) st.particles.splice(i, 1);
        }

        ctx.clearRect(0, 0, w, ch);

        // 1. 地球 / 月球水粉全景背景
        const activeBg = isMoon ? sp.bgMoon : sp.bg;
        if (activeBg.complete && activeBg.naturalWidth > 0) {
          const iw = activeBg.naturalWidth;
          const ih = activeBg.naturalHeight;
          const scale = Math.max(w / iw, ch / ih);
          const dw = iw * scale;
          const dh = ih * scale;
          ctx.drawImage(activeBg, (w - dw) / 2, ch - dh, dw, dh);
        } else {
          ctx.fillStyle = isMoon ? '#1B2848' : '#CBEBFF';
          ctx.fillRect(0, 0, w, ch);
        }

        // 2. 草地/月面距离标尺
        const stepX = maxX > 100 ? 20 : 10;
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.55)';
        ctx.lineWidth = 1.6;
        ctx.beginPath();
        ctx.moveTo(padL - 20, groundY);
        ctx.lineTo(w - 24, groundY);
        ctx.stroke();

        ctx.textAlign = 'center';
        for (let gx = 0; gx <= maxX; gx += stepX) {
          const px = toX(gx);
          ctx.strokeStyle = 'rgba(255, 255, 255, 0.65)';
          ctx.beginPath();
          ctx.moveTo(px, groundY);
          ctx.lineTo(px, groundY + 9);
          ctx.stroke();
          ctx.fillStyle = 'rgba(255, 255, 255, 0.94)';
          ctx.font = 'bold 11.5px monospace';
          ctx.fillText(`${gx}m`, px, groundY + 25);
        }

        // 3. 投放点高度虚线与徽标
        const flightY = toY(h);
        ctx.save();
        ctx.strokeStyle = isMoon ? 'rgba(255, 255, 255, 0.35)' : 'rgba(35, 45, 54, 0.22)';
        ctx.lineWidth = 1.3;
        ctx.setLineDash([4, 4]);
        ctx.beginPath();
        ctx.moveTo(padL, flightY + 12);
        ctx.lineTo(padL, groundY);
        ctx.stroke();
        ctx.restore();

        ctx.fillStyle = 'rgba(255, 255, 255, 0.88)';
        ctx.beginPath();
        ctx.roundRect(14, (flightY + groundY) / 2 - 11, 60, 22, 11);
        ctx.fill();
        ctx.fillStyle = '#384652';
        ctx.font = 'bold 11px monospace';
        ctx.textAlign = 'center';
        ctx.fillText(`h=${Math.round(h)}m`, 44, (flightY + groundY) / 2 + 4);

        // 4. 地面预判着陆靶环
        const targetX = toX(L);
        ctx.save();
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.68)';
        ctx.lineWidth = 1.8;
        ctx.beginPath();
        ctx.ellipse(targetX, groundY + 2, 18, 5, 0, 0, Math.PI * 2);
        ctx.stroke();
        ctx.fillStyle = 'rgba(242, 120, 92, 0.48)';
        ctx.beginPath();
        ctx.ellipse(targetX, groundY + 2, 7, 2.4, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();

        // 5. 上一次对比轨迹
        if (showGhost && ghostPoints && ghostPoints.length > 1) {
          ctx.save();
          ctx.strokeStyle = isMoon ? 'rgba(255, 255, 255, 0.36)' : 'rgba(35, 45, 54, 0.25)';
          ctx.lineWidth = 2.2;
          ctx.setLineDash([6, 6]);
          ctx.beginPath();
          ghostPoints.forEach((gp, idx) => {
            const px = toX(gp.x);
            const py = toY(gp.y);
            if (idx === 0) ctx.moveTo(px, py);
            else ctx.lineTo(px, py);
          });
          ctx.stroke();
          ctx.restore();
        }

        // 6. 理论抛物线预判虚线
        ctx.save();
        ctx.strokeStyle = isMoon ? 'rgba(255, 224, 125, 0.48)' : 'rgba(242, 120, 92, 0.42)';
        ctx.lineWidth = 2;
        ctx.setLineDash([5, 6]);
        ctx.beginPath();
        points.forEach((pt, idx) => {
          const px = toX(pt.x);
          const py = toY(pt.y);
          if (idx === 0) ctx.moveTo(px, py);
          else ctx.lineTo(px, py);
        });
        ctx.stroke();
        ctx.restore();

        // 7. 已飞行轨迹 + 频闪点
        if (cur.t > 0) {
          ctx.strokeStyle = accentColor;
          ctx.lineWidth = 3;
          ctx.lineCap = 'round';
          ctx.beginPath();
          let started = false;
          for (const pt of points) {
            if (pt.t > cur.t) break;
            const px = toX(pt.x);
            const py = toY(pt.y);
            if (!started) {
              ctx.moveTo(px, py);
              started = true;
            } else {
              ctx.lineTo(px, py);
            }
          }
          if (started) ctx.stroke();

          for (let stTime = 0.25; stTime <= cur.t; stTime += 0.25) {
            const spPt = sampleAt(params, stTime);
            ctx.fillStyle = '#FFF5D6';
            ctx.strokeStyle = '#E5A032';
            ctx.lineWidth = 1.6;
            ctx.beginPath();
            ctx.arc(toX(spPt.x), toY(spPt.y), 3.8, 0, Math.PI * 2);
            ctx.fill();
            ctx.stroke();
          }
        }

        // 8. 飞机与物资箱（未投放时由机腹双侧吊绳紧固为一体，投放后飞机水平伴飞）
        const planePx = toX(cur.x);
        const planeBob = st.draggingHeight ? 0 : Math.sin(st.cloudOffset * 0.35) * 2.0;
        const planePy = flightY - 26 + planeBob;
        const cratePx = toX(cur.x);
        const attached = runState === 'idle' || cur.t === 0;
        const cratePy = attached ? planePy + 26 : toY(cur.y);

        if (cur.t > 0.02) {
          ctx.save();
          ctx.strokeStyle = 'rgba(255, 255, 255, 0.72)';
          ctx.lineWidth = 2.4;
          ctx.setLineDash([8, 6]);
          ctx.beginPath();
          ctx.moveTo(padL - 18, flightY - 26);
          ctx.lineTo(planePx - 44, planePy);
          ctx.stroke();

          if (runState === 'running' || runState === 'paused') {
            ctx.strokeStyle = isMoon ? 'rgba(255, 255, 255, 0.38)' : 'rgba(35, 45, 54, 0.24)';
            ctx.lineWidth = 1.3;
            ctx.setLineDash([3, 4]);
            ctx.beginPath();
            ctx.moveTo(planePx, planePy + 14);
            ctx.lineTo(cratePx, cratePy - 16);
            ctx.stroke();
          }
          ctx.restore();
        }

        if (attached) {
          ctx.save();
          ctx.strokeStyle = isMoon ? '#E7DEC8' : '#5E4633';
          ctx.lineWidth = 2;
          ctx.lineCap = 'round';
          ctx.beginPath();
          ctx.moveTo(planePx - 12, planePy + 8);
          ctx.lineTo(cratePx - 9, cratePy - 9);
          ctx.moveTo(planePx + 12, planePy + 8);
          ctx.lineTo(cratePx + 9, cratePy - 9);
          ctx.stroke();
          ctx.restore();
        }

        // 先画补给箱再画机身形成自然遮挡
        if (sp.crate.complete && sp.crate.naturalWidth > 0) {
          const cw = 32;
          const chBox = 32;
          const drawY = runState === 'landed' ? groundY - chBox + 5 : cratePy - chBox / 2;
          ctx.save();
          ctx.translate(cratePx, drawY + chBox / 2);
          if (runState === 'running') ctx.rotate(Math.sin(cur.t * 4) * 0.08);
          ctx.drawImage(sp.crate, -cw / 2, -chBox / 2, cw, chBox);
          ctx.restore();
        }

        if (sp.plane.complete && sp.plane.naturalWidth > 0) {
          const pw = 132;
          const ph = pw * (sp.plane.naturalHeight / sp.plane.naturalWidth);
          ctx.drawImage(sp.plane, planePx - pw * 0.52, planePy - ph * 0.54, pw, ph);
        }

        // 悬停/拖动飞机提示
        if (attached && (st.hoveringPlane || st.draggingHeight)) {
          ctx.save();
          const ty = planePy - 44;
          ctx.fillStyle = 'rgba(35, 45, 54, 0.86)';
          ctx.beginPath();
          ctx.roundRect(planePx - 58, ty - 12, 116, 24, 12);
          ctx.fill();
          ctx.fillStyle = '#FFFFFF';
          ctx.font = '600 11px sans-serif';
          ctx.textAlign = 'center';
          ctx.fillText(st.draggingHeight ? `当前高度 ${Math.round(h)} m` : '↕ 上下拖动调高度', planePx, ty + 4);
          ctx.restore();
        }

        // 速度矢量箭头
        if (runState !== 'landed') {
          const vScale = 2.0;
          const ex = cratePx + cur.vx * vScale;
          const ey = cratePy - cur.vy * vScale;
          ctx.strokeStyle = accentColor;
          ctx.lineWidth = 2.6;
          ctx.lineCap = 'round';
          ctx.beginPath();
          ctx.moveTo(cratePx, cratePy);
          ctx.lineTo(ex, ey);
          ctx.stroke();

          const ang = Math.atan2(ey - cratePy, ex - cratePx);
          ctx.fillStyle = accentColor;
          ctx.beginPath();
          ctx.moveTo(ex, ey);
          ctx.lineTo(ex - 9 * Math.cos(ang - 0.45), ey - 9 * Math.sin(ang - 0.45));
          ctx.lineTo(ex - 9 * Math.cos(ang + 0.45), ey - 9 * Math.sin(ang + 0.45));
          ctx.closePath();
          ctx.fill();
        }

        // 落地里程牌
        if (runState === 'landed') {
          const pop = Math.min(1, st.flagPop);
          const bx = Math.min(Math.max(toX(L), 56), w - 58);
          const by = groundY - 38 - 10 * pop;
          ctx.save();
          ctx.globalAlpha = pop;
          ctx.fillStyle = '#FFFFFF';
          ctx.strokeStyle = accentColor;
          ctx.lineWidth = 1.8;
          ctx.beginPath();
          ctx.roundRect(bx - 42, by - 12, 84, 24, 12);
          ctx.fill();
          ctx.stroke();
          ctx.fillStyle = '#C94B30';
          ctx.font = 'bold 11.5px monospace';
          ctx.textAlign = 'center';
          ctx.fillText(`着陆 ${L.toFixed(1)}m`, bx, by + 4);
          ctx.restore();
        }

        // 粒子绘制
        st.particles.forEach((pt) => {
          ctx.save();
          ctx.globalAlpha = Math.max(0, pt.life);
          ctx.fillStyle = pt.color;
          ctx.beginPath();
          ctx.arc(pt.x, pt.y, pt.r, 0, Math.PI * 2);
          ctx.fill();
          ctx.restore();
        });
      }

      raf = requestAnimationFrame(render);
    };

    raf = requestAnimationFrame(render);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      canvas.removeEventListener('pointerdown', onPointerDown);
      canvas.removeEventListener('pointermove', onPointerMove);
      canvas.removeEventListener('pointerup', onPointerUp);
      canvas.removeEventListener('pointerleave', onPointerLeave);
    };
  }, []);

  return (
    <div className="pw-canvas-inner" ref={wrapRef}>
      <canvas ref={canvasRef} />
    </div>
  );
}
