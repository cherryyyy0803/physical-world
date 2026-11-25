import { useEffect, useRef } from 'react';
import { flightTime, sampleAt, trajectory } from '@pw/core';

interface Props {
  v0: number;
  h: number;
  g: number;
  t: number;
}

/**
 * 平抛运动画面。只负责画，所有数值都来自 @pw/core，
 * 保证画面、AI 解释、挑战判定读的是同一组参数（PRD 5.10）。
 */
export default function ProjectileCanvas(props: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const drawRef = useRef<() => void>(() => {});

  // 每次渲染刷新绘制函数；rAF / ResizeObserver 都通过 ref 调它，避免重建观察器
  drawRef.current = () => {
    const canvas = canvasRef.current;
    const wrap = wrapRef.current;
    if (!canvas || !wrap) return;
    const { v0, h, g, t } = props;

    const dpr = window.devicePixelRatio || 1;
    const cw = wrap.clientWidth;
    const ch = wrap.clientHeight;
    if (cw === 0 || ch === 0) return;

    canvas.width = cw * dpr;
    canvas.height = ch * dpr;
    canvas.style.width = `${cw}px`;
    canvas.style.height = `${ch}px`;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, cw, ch);

    const params = { v0, h, g };
    const T = flightTime(params);
    const points = trajectory(params, 160);
    const maxX = Math.max(points[points.length - 1]?.x ?? 1, 1);
    const maxY = h;

    const padL = 52;
    const padR = 28;
    const padT = 30;
    const padB = 46;
    const plotW = Math.max(cw - padL - padR, 10);
    const plotH = Math.max(ch - padT - padB, 10);

    const worldW = Math.max(maxX * 1.12, 6);
    const worldH = Math.max(maxY * 1.15, 6);
    const s = Math.min(plotW / worldW, plotH / worldH);

    const originX = padL;
    const originY = padT + plotH;
    const toPx = (x: number, y: number) => ({ px: originX + x * s, py: originY - y * s });

    /* 网格 */
    ctx.strokeStyle = '#EFE9E0';
    ctx.lineWidth = 1;
    const stepX = niceStep(worldW / 6);
    for (let gx = 0; gx <= worldW; gx += stepX) {
      const { px } = toPx(gx, 0);
      ctx.beginPath();
      ctx.moveTo(px, padT);
      ctx.lineTo(px, originY);
      ctx.stroke();
    }
    const stepY = niceStep(worldH / 5);
    for (let gy = 0; gy <= worldH; gy += stepY) {
      const { py } = toPx(0, gy);
      ctx.beginPath();
      ctx.moveTo(originX, py);
      ctx.lineTo(originX + plotW, py);
      ctx.stroke();
    }

    /* 地面 */
    ctx.strokeStyle = '#C9BFB2';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(originX - 12, originY);
    ctx.lineTo(originX + plotW, originY);
    ctx.stroke();

    /* 完整轨迹（虚线参考） */
    ctx.setLineDash([4, 6]);
    ctx.strokeStyle = '#D9D2C7';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    points.forEach((p, i) => {
      const { px, py } = toPx(p.x, p.y);
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    });
    ctx.stroke();
    ctx.setLineDash([]);

    /* 已走过的轨迹 */
    const cur = sampleAt(params, t);
    ctx.strokeStyle = '#8FBF9F';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    let started = false;
    for (const p of points) {
      if (p.t > cur.t) break;
      const { px, py } = toPx(p.x, p.y);
      if (!started) {
        ctx.moveTo(px, py);
        started = true;
      } else {
        ctx.lineTo(px, py);
      }
    }
    if (started) ctx.stroke();

    /* 抛出点 */
    const launch = toPx(0, h);
    ctx.fillStyle = '#C9BFB2';
    ctx.beginPath();
    ctx.arc(launch.px, launch.py, 3.5, 0, Math.PI * 2);
    ctx.fill();

    /* 小球 */
    const ball = toPx(cur.x, cur.y);
    ctx.beginPath();
    ctx.arc(ball.px, ball.py, 9, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(143,191,159,0.22)';
    ctx.fill();
    ctx.beginPath();
    ctx.arc(ball.px, ball.py, 5, 0, Math.PI * 2);
    ctx.fillStyle = '#5C9673';
    ctx.fill();

    /* 落点标记 */
    if (cur.landed) {
      const land = toPx(maxX, 0);
      ctx.strokeStyle = '#E0A03C';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(land.px, land.py, 7, 0, Math.PI * 2);
      ctx.stroke();
    }

    /* 刻度与轴名 */
    ctx.fillStyle = '#9A9085';
    ctx.font = '11px system-ui, "Noto Sans SC", sans-serif';
    ctx.textAlign = 'center';
    for (let gx = 0; gx <= worldW; gx += stepX) {
      const { px } = toPx(gx, 0);
      ctx.fillText(`${Math.round(gx)}`, px, originY + 16);
    }
    ctx.textAlign = 'right';
    for (let gy = 0; gy <= worldH; gy += stepY) {
      const { py } = toPx(0, gy);
      ctx.fillText(`${Math.round(gy)}`, originX - 8, py + 4);
    }
    ctx.textAlign = 'left';
    ctx.fillText('水平距离 / m', originX + plotW - 78, originY + 32);
    ctx.save();
    ctx.translate(14, padT + 52);
    ctx.rotate(-Math.PI / 2);
    ctx.fillText('高度 / m', 0, 0);
    ctx.restore();

    /* 时间 */
    ctx.fillStyle = '#7A8792';
    ctx.font = '12px system-ui, "Noto Sans SC", sans-serif';
    ctx.fillText(`t = ${cur.t.toFixed(2)} s　T = ${T.toFixed(2)} s`, originX, padT - 10);
  };

  useEffect(() => {
    drawRef.current();
  }, [props.v0, props.h, props.g, props.t]);

  useEffect(() => {
    const wrap = wrapRef.current;
    if (!wrap) return;
    const ro = new ResizeObserver(() => drawRef.current());
    ro.observe(wrap);
    return () => ro.disconnect();
  }, []);

  return (
    <div className="canvas-wrap" ref={wrapRef}>
      <canvas ref={canvasRef} />
    </div>
  );
}

/** 找一个「好看」的刻度间隔：1 / 2 / 5 × 10^n */
function niceStep(raw: number): number {
  const exp = Math.floor(Math.log10(Math.max(raw, 1e-6)));
  const base = 10 ** exp;
  const n = raw / base;
  const mult = n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10;
  return mult * base;
}
