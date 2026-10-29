import { useCallback, useEffect, useRef, useState, type PointerEvent } from "react";
import styles from "./ImageCropper.module.css";

interface Props {
  /** URL (data/blob) da imagem original escolhida */
  imagem: string;
  /** Tamanho final do recorte em pixels (quadrado) */
  saida?: number;
  onRecorte: (dataUrl: string) => void;
}

const VISOR = 260;

/**
 * Recorte de foto com zoom e enquadramento (arrastar).
 * Gera um JPEG quadrado; o círculo mostra como a foto aparece no avatar.
 */
export function ImageCropper({ imagem, saida = 320, onRecorte }: Props) {
  const [img, setImg] = useState<HTMLImageElement | null>(null);
  const [zoom, setZoom] = useState(1);
  const [pos, setPos] = useState({ x: 0, y: 0 });
  const arraste = useRef<{ x: number; y: number; px: number; py: number } | null>(null);

  useEffect(() => {
    const i = new Image();
    i.onload = () => { setImg(i); setZoom(1); setPos({ x: 0, y: 0 }); };
    i.src = imagem;
  }, [imagem]);

  // escala que faz o menor lado da imagem cobrir o visor
  const base = img ? VISOR / Math.min(img.width, img.height) : 1;
  const largura = img ? img.width * base * zoom : 0;
  const altura = img ? img.height * base * zoom : 0;
  const limitar = useCallback((p: { x: number; y: number }) => {
    const mx = Math.max(0, (largura - VISOR) / 2), my = Math.max(0, (altura - VISOR) / 2);
    return { x: Math.min(mx, Math.max(-mx, p.x)), y: Math.min(my, Math.max(-my, p.y)) };
  }, [largura, altura]);
  useEffect(() => { setPos((p) => limitar(p)); }, [limitar]);

  // gera o recorte sempre que muda zoom ou posição
  useEffect(() => {
    if (!img) return;
    const c = document.createElement("canvas");
    c.width = saida; c.height = saida;
    const ctx = c.getContext("2d");
    if (!ctx) return;
    const k = saida / VISOR;
    ctx.fillStyle = "#ffffff"; ctx.fillRect(0, 0, saida, saida);
    ctx.drawImage(img, (VISOR / 2 - largura / 2 + pos.x) * k, (VISOR / 2 - altura / 2 + pos.y) * k, largura * k, altura * k);
    onRecorte(c.toDataURL("image/jpeg", 0.86));
  }, [img, zoom, pos, largura, altura, saida, onRecorte]);

  const iniciar = (e: PointerEvent<HTMLDivElement>) => {
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    arraste.current = { x: e.clientX, y: e.clientY, px: pos.x, py: pos.y };
  };
  const mover = (e: PointerEvent<HTMLDivElement>) => {
    const a = arraste.current; if (!a) return;
    setPos(limitar({ x: a.px + e.clientX - a.x, y: a.py + e.clientY - a.y }));
  };
  const soltar = () => { arraste.current = null; };

  return (
    <div className={styles.cropper}>
      <div className={styles.visor} style={{ width: VISOR, height: VISOR }} onPointerDown={iniciar} onPointerMove={mover} onPointerUp={soltar} onPointerCancel={soltar}
        role="img" aria-label="Arraste para enquadrar a foto">
        {img && <img src={imagem} alt="" draggable={false} className={styles.imagem}
          style={{ width: largura, height: altura, transform: `translate(${VISOR / 2 - largura / 2 + pos.x}px, ${VISOR / 2 - altura / 2 + pos.y}px)` }} />}
        <span className={styles.mascara} aria-hidden />
      </div>
      <label className={styles.zoom}>
        <span>Zoom</span>
        <input type="range" min={1} max={4} step={0.01} value={zoom} onChange={(e) => setZoom(Number(e.target.value))} />
        <b>{Math.round(zoom * 100)}%</b>
      </label>
      <div className={styles.botoes}>
        <button type="button" onClick={() => setPos({ x: 0, y: 0 })}>Centralizar</button>
        <button type="button" onClick={() => { setZoom(1); setPos({ x: 0, y: 0 }); }}>Restaurar</button>
      </div>
      <p className={styles.dica}>Arraste a foto para enquadrar e use o zoom para aproximar.</p>
    </div>
  );
}
