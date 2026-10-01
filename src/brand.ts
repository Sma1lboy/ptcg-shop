// The wordmark's canvas drawing, shared by the share images and the 3D table's printed packs. Same lettering as the header's .brand
// (style.css): heavy slanted system sans, red letters in a white outline inside a near-black one. A printed object, so the colours are
// fixed. Keep these values aligned with --brand-red / --brand-white / --brand-edge in style.css.
export const BRAND = { red: '#E8362A', white: '#FFFFFF', edge: '#14171D' } as const;
export const NAME = 'PTCG卡店模拟器', SHORT = 'PTCG卡店';

const FACE = '"PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", "Noto Sans SC", sans-serif';
const SLANT = -0.16; // skewX(-9deg), as the header's

/** Draws `text` with its baseline at y; `at` is the left, centre or right edge by `align`. Returns the width it took (without the outline). */
export function wordmark(x: CanvasRenderingContext2D, text: string, at: number, y: number, size: number, align: 'left' | 'center' | 'right' = 'left'): number {
  x.save();
  x.font = `700 ${size}px ${FACE}`; x.textAlign = 'left'; x.textBaseline = 'alphabetic'; x.lineJoin = 'round'; x.miterLimit = 2; // 700: the bold these families really ship; the page has synthesis off, the heft is the stroke
  const w = x.measureText(text).width, left = align === 'center' ? at - w / 2 : align === 'right' ? at - w : at;
  x.transform(1, 0, SLANT, 1, left, y);
  x.strokeStyle = BRAND.edge; x.lineWidth = size * 0.3; x.strokeText(text, 0, 0);
  x.strokeStyle = BRAND.white; x.lineWidth = size * 0.14; x.strokeText(text, 0, 0);
  x.fillStyle = BRAND.red; x.fillText(text, 0, 0);
  x.restore();
  return w;
}
