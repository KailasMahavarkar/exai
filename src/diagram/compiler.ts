/**
 * Compiles SimplifiedElement[] into D2 syntax.
 */

import type { SimplifiedElement, SimplifiedShape, SimplifiedArrow, SimplifiedZone, SimplifiedText, DiagramDirection } from './types.js';

const SHAPE_MAP: Record<string, string | undefined> = {
  rectangle: undefined,
  ellipse: 'circle',
  diamond: 'diamond',
  circle: 'circle',
  oval: 'oval',
  hexagon: 'hexagon',
  cylinder: 'cylinder',
  queue: 'queue',
  package: 'package',
  page: 'page',
};

function sanitizeId(id: string): string {
  if (/^[a-zA-Z_][a-zA-Z0-9_-]*$/.test(id)) return id;
  return `"${id.replace(/"/g, '\\"')}"`;
}

function escapeLabel(text: string): string {
  // Handle multiline text: replace literal \n with D2 newline escape
  let label = text.replace(/\\n/g, '\\n');
  // Escape special D2 chars in labels: pipes, braces, colons at start
  label = label.replace(/([|{}])/g, '\\$1');
  return label;
}

function emitStyles(indent: string, styles: Record<string, string | number | boolean>): string[] {
  const lines: string[] = [];
  for (const [key, value] of Object.entries(styles)) {
    if (value === undefined || value === null) continue;
    const v = typeof value === 'string' ? `"${value}"` : value;
    lines.push(`${indent}style.${key}: ${v}`);
  }
  return lines;
}

function shapeStyles(shape: SimplifiedShape): Record<string, string | number | boolean> {
  const styles: Record<string, string | number | boolean> = {};
  if (shape.backgroundColor) styles.fill = shape.backgroundColor;
  if (shape.strokeColor) styles.stroke = shape.strokeColor;
  if (shape.fontSize) styles['font-size'] = shape.fontSize;
  return styles;
}

function arrowStyles(arrow: SimplifiedArrow): Record<string, string | number | boolean> {
  const styles: Record<string, string | number | boolean> = {};
  if (arrow.strokeColor) styles.stroke = arrow.strokeColor;
  if (arrow.strokeStyle === 'dashed') styles['stroke-dash'] = 3;
  if (arrow.strokeStyle === 'dotted') styles['stroke-dash'] = 1;
  if (arrow.animated) styles.animated = true;
  return styles;
}

export function compileToD2(elements: SimplifiedElement[], direction: DiagramDirection = 'TB'): string {
  const lines: string[] = [];

  // Direction
  lines.push(`direction: ${direction === 'LR' ? 'right' : 'down'}`);
  lines.push('');

  // Separate by type
  const shapes: SimplifiedShape[] = [];
  const arrows: SimplifiedArrow[] = [];
  const zones: SimplifiedZone[] = [];
  const texts: SimplifiedText[] = [];

  for (const el of elements) {
    if (el.type === 'arrow') arrows.push(el);
    else if (el.type === 'zone') zones.push(el);
    else if (el.type === 'text') texts.push(el);
    else shapes.push(el as SimplifiedShape);
  }

  // Zone membership
  const childToZone = new Map<string, string>();
  for (const zone of zones) {
    for (const childId of zone.children) {
      childToZone.set(childId, zone.id);
    }
  }

  // Title text (position: above)
  for (const t of texts) {
    if (t.position === 'above') {
      const id = t.id || 'title';
      lines.push(`${sanitizeId(id)}: ${escapeLabel(t.text)} {`);
      lines.push('  shape: text');
      lines.push('  style.font-size: 24');
      lines.push('}');
      lines.push('');
    }
  }

  // Zones with children
  for (const zone of zones) {
    lines.push(`${sanitizeId(zone.id)}: ${escapeLabel(zone.label)} {`);
    const zStyles: Record<string, string | number | boolean> = {};
    if (zone.backgroundColor) zStyles.fill = zone.backgroundColor;
    if (zone.strokeColor) zStyles.stroke = zone.strokeColor;
    zStyles['stroke-dash'] = 3;
    zStyles.opacity = 0.3;
    lines.push(...emitStyles('  ', zStyles));
    lines.push('');

    for (const childId of zone.children) {
      const child = shapes.find(s => s.id === childId);
      if (!child) {
        lines.push(`  ${sanitizeId(childId)}`);
        continue;
      }
      const d2Shape = SHAPE_MAP[child.type];
      lines.push(`  ${sanitizeId(child.id)}: ${escapeLabel(child.text)}${d2Shape ? ` { shape: ${d2Shape} }` : ''}`);
      const cs = shapeStyles(child);
      if (Object.keys(cs).length > 0) {
        // Rewrite last line to open block
        const lastLine = lines.pop()!;
        if (lastLine.includes('{ shape:')) {
          const base = lastLine.replace(/ \{ shape: (\w+) \}$/, '');
          lines.push(`${base} {`);
          lines.push(`    shape: ${d2Shape}`);
        } else {
          lines.push(`${lastLine} {`);
        }
        lines.push(...emitStyles('    ', cs));
        lines.push('  }');
      }
    }

    lines.push('}');
    lines.push('');
  }

  // Top-level shapes (not in zones)
  for (const shape of shapes) {
    if (childToZone.has(shape.id)) continue;
    const d2Shape = SHAPE_MAP[shape.type];
    const cs = shapeStyles(shape);
    const hasShape = !!d2Shape;
    const hasStyles = Object.keys(cs).length > 0;

    if (!hasShape && !hasStyles) {
      lines.push(`${sanitizeId(shape.id)}: ${escapeLabel(shape.text)}`);
    } else {
      lines.push(`${sanitizeId(shape.id)}: ${escapeLabel(shape.text)} {`);
      if (hasShape) lines.push(`  shape: ${d2Shape}`);
      if (hasStyles) lines.push(...emitStyles('  ', cs));
      lines.push('}');
    }
  }

  if (shapes.some(s => !childToZone.has(s.id))) lines.push('');

  // Bottom text
  for (const t of texts) {
    if (t.position === 'below') {
      const id = t.id || 'footer';
      lines.push(`${sanitizeId(id)}: ${escapeLabel(t.text)} {`);
      lines.push('  shape: text');
      lines.push('  style.font-size: 14');
      lines.push('}');
      lines.push('');
    }
  }

  // Arrows
  if (arrows.length > 0) lines.push('');
  for (const arrow of arrows) {
    const src = childToZone.has(arrow.from)
      ? `${sanitizeId(childToZone.get(arrow.from)!)}.${sanitizeId(arrow.from)}`
      : sanitizeId(arrow.from);
    const dst = childToZone.has(arrow.to)
      ? `${sanitizeId(childToZone.get(arrow.to)!)}.${sanitizeId(arrow.to)}`
      : sanitizeId(arrow.to);

    const as = arrowStyles(arrow);
    const label = arrow.text ? `: ${escapeLabel(arrow.text)}` : '';

    if (Object.keys(as).length === 0) {
      lines.push(`${src} -> ${dst}${label}`);
    } else {
      lines.push(`${src} -> ${dst}${label} {`);
      lines.push(...emitStyles('  ', as));
      lines.push('}');
    }
  }

  return lines.join('\n') + '\n';
}
