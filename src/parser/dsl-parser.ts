/**
 * DSL Parser for Flowchart Syntax
 *
 * Directive syntax (legacy bracket/arrow syntax removed):
 *   @node <id> <type-or-kind> "<label>"
 *   @edge <fromId> <toId> ["label"] [dashed]
 *
 * Additional directives:
 *   @direction TB  - Set flow direction (TB, BT, LR, RL)
 *   @spacing N     - Set node spacing
 *   @group <id> "<label>" nodes:a,b,c [style...] - Group related nodes
 *   @image path at X,Y           - Position image at absolute coordinates
 *   @image path near (NodeLabel) - Position image near a node
 *   @decorate path anchor        - Attach decoration to preceding node
 *   @sticker name [at X,Y]       - Add sticker from library
 *   @library path                - Set custom sticker library path
 *   @scatter path count:N        - Scatter images across canvas
 */

import { nanoid } from 'nanoid';
import type {
    FlowchartGraph,
    GraphNode,
    GraphEdge,
    GraphGroup,
    LayoutOptions,
    NodeType,
    NodeStyle,
    EdgeStyle,
    GroupStyle,
    GlobalDiagramStyle,
    PositionedImage,
    ScatterConfig,
    DecorationAnchor,
} from '../types/dsl.js';
import { DEFAULT_LAYOUT_OPTIONS } from '../types/dsl.js';

interface Token {
    type: 'directive' | 'newline' | 'decorate';
    value: string;
    // Decoration-specific properties
    imageSrc?: string;
    decorationAnchor?: DecorationAnchor;
}

/**
 * Tokenize directive-style DSL input into tokens.
 */
function tokenize(input: string): Token[] {
    const tokens: Token[] = [];
    let i = 0;
    const len = input.length;

    while (i < len) {
        // Skip whitespace (except newlines)
        if (input[i] === ' ' || input[i] === '\t') {
            i++;
            continue;
        }

        // Newline
        if (input[i] === '\n') {
            tokens.push({ type: 'newline', value: '\n' });
            i++;
            continue;
        }

        // Comment (skip rest of line)
        if (input[i] === '#') {
            while (i < len && input[i] !== '\n') i++;
            continue;
        }

        // Directive (@direction, @spacing, @node, @edge, @group, @image, ...)
        if (input[i] === '@') {
            let directive = '';
            i++; // skip @
            while (i < len && /[a-zA-Z0-9]/.test(input[i])) {
                directive += input[i];
                i++;
            }
            // Get directive value (stop at newline or another @)
            while (i < len && (input[i] === ' ' || input[i] === '\t')) i++;
            let value = '';
            while (i < len && input[i] !== '\n' && input[i] !== '@') {
                value += input[i];
                i++;
            }
            const cleanedValue = value.replace(/\s+#(?![0-9a-fA-F]{3,8}\b).*$/, '').trim();

            // Handle @decorate as a special token type (attaches to preceding node)
            if (directive === 'decorate') {
                // Parse: @decorate path anchor
                const parts = cleanedValue.split(/\s+/);
                const src = parts[0] || '';
                const anchor = (parts[1] || 'top-right') as DecorationAnchor;
                tokens.push({
                    type: 'decorate',
                    value: src,
                    imageSrc: src,
                    decorationAnchor: anchor,
                });
            } else {
                tokens.push({ type: 'directive', value: `${directive} ${cleanedValue}` });
            }
            continue;
        }

        // Skip unknown characters
        i++;
    }

    return tokens;
}

/**
 * Parse @image directive value
 * Formats:
 *   @image path at X,Y
 *   @image path near (NodeLabel)
 *   @image path near (NodeLabel) anchor
 */
function parseImageDirective(value: string): PositionedImage | null {
    // Match: path at X,Y
    const atMatch = value.match(/^(.+?)\s+at\s+(\d+)\s*,\s*(\d+)$/i);
    if (atMatch) {
        return {
            id: nanoid(10),
            src: atMatch[1].trim(),
            position: {
                type: 'absolute',
                x: parseInt(atMatch[2], 10),
                y: parseInt(atMatch[3], 10),
            },
        };
    }

    // Match: path near (NodeLabel) [anchor]
    const nearMatch = value.match(/^(.+?)\s+near\s+\(([^)]+)\)(?:\s+(\S+))?$/i);
    if (nearMatch) {
        return {
            id: nanoid(10),
            src: nearMatch[1].trim(),
            position: {
                type: 'near',
                nodeLabel: nearMatch[2].trim(),
                anchor: (nearMatch[3] as DecorationAnchor) || undefined,
            },
        };
    }

    return null;
}

/**
 * Parse @scatter directive value
 * Format: @scatter path count:N [width:W] [height:H]
 */
function parseScatterDirective(value: string): ScatterConfig | null {
    const parts = value.trim().split(/\s+/);
    if (parts.length < 2) return null;

    const src = parts[0];
    let count = 10; // default
    let width: number | undefined;
    let height: number | undefined;

    for (let i = 1; i < parts.length; i++) {
        const [key, val] = parts[i].split(':');
        if (key === 'count' && val) count = parseInt(val, 10);
        if (key === 'width' && val) width = parseInt(val, 10);
        if (key === 'height' && val) height = parseInt(val, 10);
    }

    return { src, count, width, height };
}

/**
 * Split directive args while preserving quoted substrings.
 * Example: a rectangle "API Gateway" -> ["a", "rectangle", "API Gateway"]
 */
function splitDirectiveArgs(value: string): string[] {
    const args: string[] = [];
    const regex = /"((?:\\.|[^"\\])*)"|'((?:\\.|[^'\\])*)'|(\S+)/g;

    let match: RegExpExecArray | null;
    while ((match = regex.exec(value)) !== null) {
        const raw = match[1] ?? match[2] ?? match[3] ?? '';
        const unescaped = raw.replace(/\\(["'\\])/g, '$1').trim();
        if (unescaped) args.push(unescaped);
    }

    return args;
}

const SHAPE_OR_KIND_TOKENS = new Set([
    'rectangle',
    'diamond',
    'ellipse',
    'database',
    'process',
    'condition',
    'start',
    'end',
    'oval',
    'cylinder',
    'frontend',
    'backend',
    'api',
    'service',
    'worker',
    'db',
    'storage',
    'queue',
    'mq',
    'broker',
    'cache',
    'external',
    'user',
    'orchestrator',
    'hub',
    'router',
    'decision',
]);

const FONT_FAMILY_BY_NAME: Record<string, number> = {
    virgil: 1,
    hand: 1,
    helvetica: 2,
    normal: 2,
    cascadia: 3,
    code: 3,
    excalifont: 5,
};

function isShapeOrKindToken(token: string | undefined): boolean {
    if (!token) return false;
    return SHAPE_OR_KIND_TOKENS.has(token.toLowerCase());
}

function parseNumber(value: string): number | undefined {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) return undefined;
    return parsed;
}

function parseStrokeStyle(value: string): NodeStyle['strokeStyle'] | undefined {
    const v = value.toLowerCase();
    if (v === 'solid' || v === 'dashed' || v === 'dotted') return v;
    return undefined;
}

function parseFillStyle(value: string): NodeStyle['fillStyle'] | undefined {
    const v = value.toLowerCase();
    if (v === 'solid' || v === 'hachure' || v === 'cross-hatch' || v === 'dots' || v === 'dashed' || v === 'zigzag' || v === 'none') return v;
    return undefined;
}

function parseArrowhead(value: string): EdgeStyle['endArrowhead'] | undefined {
    const v = value.toLowerCase();
    if (v === 'none' || v === 'null') return null;
    if (v === 'arrow' || v === 'bar' || v === 'dot' || v === 'triangle') return v;
    return undefined;
}

function parseFontFamily(value: string): number | undefined {
    if (!value) return undefined;
    const direct = parseNumber(value);
    if (direct !== undefined) return Math.round(direct);
    return FONT_FAMILY_BY_NAME[value.toLowerCase()];
}

function parseStyleDirective(key: string, value: string): Partial<GlobalDiagramStyle> {
    const k = key.toLowerCase();
    const v = value.trim();
    const result: Partial<GlobalDiagramStyle> = {};

    if (k === 'strokewidth' || k === 'width') {
        const n = parseNumber(v);
        if (n !== undefined) result.strokeWidth = n;
    } else if (k === 'fillstyle' || k === 'fill') {
        const fs = parseFillStyle(v);
        if (fs !== undefined) result.fillStyle = fs;
    } else if (k === 'strokestyle' || k === 'style') {
        const ss = parseStrokeStyle(v);
        if (ss !== undefined) result.strokeStyle = ss;
    } else if (k === 'roughness') {
        const n = parseNumber(v);
        if (n !== undefined) result.roughness = n;
    } else if (k === 'edges') {
        const lv = v.toLowerCase();
        if (lv === 'round') result.roundEdges = true;
        else if (lv === 'sharp') result.roundEdges = false;
    } else if (k === 'arrowhead' || k === 'arrow' || k === 'endarrowhead') {
        const a = parseArrowhead(v);
        if (a !== undefined) result.endArrowhead = a;
    } else if (k === 'fontfamily' || k === 'font') {
        const ff = parseFontFamily(v);
        if (ff !== undefined) result.fontFamily = ff;
    } else if (k === 'fontsize' || k === 'size') {
        const n = parseNumber(v);
        if (n !== undefined && n > 0) result.fontSize = n;
    } else if (k === 'textalign' || k === 'align') {
        const lv = v.toLowerCase();
        if (lv === 'left' || lv === 'center' || lv === 'right') {
            result.textAlign = lv as 'left' | 'center' | 'right';
        }
    }

    return result;
}

function parseNodeStyleToken(style: NodeStyle, token: string): boolean {
    const parts = token.split(':');
    if (parts.length < 2) return false;

    const key = parts[0].toLowerCase();
    const rawValue = parts.slice(1).join(':').trim();
    if (!rawValue) return false;

    if (key === 'bg' || key === 'background' || key === 'backgroundcolor' || key === 'fillcolor') {
        style.backgroundColor = rawValue;
        return true;
    }
    if (key === 'stroke' || key === 'strokecolor' || key === 'color' || key === 'border') {
        style.strokeColor = rawValue;
        return true;
    }
    if (key === 'width' || key === 'strokewidth') {
        const width = parseNumber(rawValue);
        if (width !== undefined) style.strokeWidth = width;
        return true;
    }
    if (key === 'style' || key === 'strokestyle') {
        const strokeStyle = parseStrokeStyle(rawValue);
        if (strokeStyle) style.strokeStyle = strokeStyle;
        return true;
    }
    if (key === 'fill' || key === 'fillstyle') {
        const fillStyle = parseFillStyle(rawValue);
        if (fillStyle) style.fillStyle = fillStyle;
        return true;
    }
    if (key === 'opacity') {
        const opacity = parseNumber(rawValue);
        if (opacity !== undefined) style.opacity = Math.max(0, Math.min(100, opacity));
        return true;
    }
    if (key === 'roughness') {
        const roughness = parseNumber(rawValue);
        if (roughness !== undefined) style.roughness = roughness;
        return true;
    }
    if (key === 'font' || key === 'fontfamily') {
        const fontFamily = parseFontFamily(rawValue);
        if (fontFamily !== undefined) style.fontFamily = fontFamily;
        return true;
    }
    if (key === 'size' || key === 'fontsize') {
        const fontSize = parseNumber(rawValue);
        if (fontSize !== undefined && fontSize > 0) style.fontSize = fontSize;
        return true;
    }
    if (key === 'text' || key === 'textcolor') {
        style.textColor = rawValue;
        return true;
    }

    return false;
}

function parseEdgeStyleToken(style: EdgeStyle, token: string): boolean {
    const parts = token.split(':');
    if (parts.length < 2) return false;

    const key = parts[0].toLowerCase();
    const rawValue = parts.slice(1).join(':').trim();
    if (!rawValue) return false;

    if (key === 'color' || key === 'stroke' || key === 'strokecolor') {
        style.strokeColor = rawValue;
        return true;
    }
    if (key === 'width' || key === 'strokewidth') {
        const width = parseNumber(rawValue);
        if (width !== undefined) style.strokeWidth = width;
        return true;
    }
    if (key === 'style' || key === 'strokestyle') {
        const strokeStyle = parseStrokeStyle(rawValue);
        if (strokeStyle) style.strokeStyle = strokeStyle;
        return true;
    }
    if (key === 'roughness') {
        const roughness = parseNumber(rawValue);
        if (roughness !== undefined) style.roughness = roughness;
        return true;
    }
    if (key === 'start' || key === 'startarrow' || key === 'startarrowhead') {
        const head = parseArrowhead(rawValue);
        if (head !== undefined) style.startArrowhead = head;
        return true;
    }
    if (key === 'end' || key === 'arrow' || key === 'endarrow' || key === 'endarrowhead') {
        const head = parseArrowhead(rawValue);
        if (head !== undefined) style.endArrowhead = head;
        return true;
    }

    return false;
}

function parseGroupStyleToken(style: GroupStyle, token: string): boolean {
    const parts = token.split(':');
    if (parts.length < 2) return false;

    const key = parts[0].toLowerCase();
    const rawValue = parts.slice(1).join(':').trim();
    if (!rawValue) return false;

    if (key === 'bg' || key === 'background' || key === 'backgroundcolor' || key === 'fillcolor') {
        style.backgroundColor = rawValue;
        return true;
    }
    if (key === 'stroke' || key === 'strokecolor' || key === 'color' || key === 'border') {
        style.strokeColor = rawValue;
        return true;
    }
    if (key === 'width' || key === 'strokewidth') {
        const width = parseNumber(rawValue);
        if (width !== undefined) style.strokeWidth = width;
        return true;
    }
    if (key === 'style' || key === 'strokestyle') {
        const strokeStyle = parseStrokeStyle(rawValue);
        if (strokeStyle) style.strokeStyle = strokeStyle;
        return true;
    }
    if (key === 'opacity') {
        const opacity = parseNumber(rawValue);
        if (opacity !== undefined) style.opacity = Math.max(0, Math.min(100, opacity));
        return true;
    }
    if (key === 'roughness') {
        const roughness = parseNumber(rawValue);
        if (roughness !== undefined) style.roughness = roughness;
        return true;
    }
    if (key === 'padding') {
        const padding = parseNumber(rawValue);
        if (padding !== undefined && padding >= 0) style.padding = padding;
        return true;
    }
    if (key === 'font' || key === 'fontfamily') {
        const fontFamily = parseFontFamily(rawValue);
        if (fontFamily !== undefined) style.fontFamily = fontFamily;
        return true;
    }
    if (key === 'size' || key === 'fontsize') {
        const fontSize = parseNumber(rawValue);
        if (fontSize !== undefined && fontSize > 0) style.fontSize = fontSize;
        return true;
    }
    if (key === 'text' || key === 'textcolor') {
        style.textColor = rawValue;
        return true;
    }

    return false;
}

function semanticStyle(kind: string): NodeStyle | undefined {
    const k = kind.toLowerCase();

    if (k === 'frontend') return { backgroundColor: '#a5d8ff', strokeColor: '#1971c2' };
    if (k === 'backend' || k === 'api' || k === 'service' || k === 'worker') {
        return { backgroundColor: '#d0bfff', strokeColor: '#7048e8' };
    }
    if (k === 'database' || k === 'db') return { backgroundColor: '#b2f2bb', strokeColor: '#2f9e44' };
    if (k === 'storage') return { backgroundColor: '#ffec99', strokeColor: '#f08c00' };
    if (k === 'queue' || k === 'mq' || k === 'broker') return { backgroundColor: '#fff3bf', strokeColor: '#fab005' };
    if (k === 'cache') return { backgroundColor: '#ffe8cc', strokeColor: '#fd7e14' };
    if (k === 'external') return { backgroundColor: '#ffc9c9', strokeColor: '#e03131' };
    if (k === 'user') return { backgroundColor: '#e7f5ff', strokeColor: '#1971c2' };
    if (k === 'orchestrator' || k === 'hub' || k === 'router') {
        return { backgroundColor: '#ffa8a8', strokeColor: '#c92a2a', strokeWidth: 3 };
    }
    if (k === 'decision') return { backgroundColor: '#ffd8a8', strokeColor: '#e8590c', strokeStyle: 'dashed' };

    return undefined;
}

function mapNodeKind(kind: string | undefined): { type: NodeType; style?: NodeStyle } {
    const k = (kind || 'rectangle').toLowerCase();

    if (k === 'rectangle' || k === 'process') return { type: 'rectangle', style: semanticStyle(k) };
    if (k === 'diamond' || k === 'decision' || k === 'condition') return { type: 'diamond', style: semanticStyle(k) };
    if (k === 'ellipse' || k === 'oval' || k === 'user' || k === 'external' || k === 'start' || k === 'end') {
        return { type: 'ellipse', style: semanticStyle(k) };
    }
    if (k === 'database' || k === 'db' || k === 'storage' || k === 'cylinder') {
        return { type: 'database', style: semanticStyle(k) };
    }

    // Semantic aliases default to rectangle with semantic style
    return { type: 'rectangle', style: semanticStyle(k) };
}

interface NodeDirective {
    refId: string;
    type: NodeType;
    label: string;
    style?: NodeStyle;
}

function parseNodeDirective(value: string): NodeDirective | null {
    const args = splitDirectiveArgs(value);
    if (args.length === 0) return null;

    const refId = args[0].trim();
    if (!refId) return null;

    let kind = 'rectangle';
    let valueStart = 1;
    if (isShapeOrKindToken(args[1])) {
        kind = args[1];
        valueStart = 2;
    }

    const mapped = mapNodeKind(kind);
    const style: NodeStyle = mapped.style ? { ...mapped.style } : {};

    const labelParts: string[] = [];
    for (const token of args.slice(valueStart)) {
        const lower = token.toLowerCase();
        if (lower === 'dashed' || lower === 'solid' || lower === 'dotted') {
            const strokeStyle = parseStrokeStyle(lower);
            if (strokeStyle) style.strokeStyle = strokeStyle;
            continue;
        }
        if (parseNodeStyleToken(style, token)) continue;
        labelParts.push(token);
    }

    const label = labelParts.join(' ').trim() || refId;
    const resolvedStyle = Object.keys(style).length > 0 ? style : undefined;

    return {
        refId,
        type: mapped.type,
        label,
        style: resolvedStyle,
    };
}

interface EdgeDirective {
    fromRef: string;
    toRef: string;
    label?: string;
    style?: EdgeStyle;
}

function parseEdgeDirective(value: string): EdgeDirective | null {
    const args = splitDirectiveArgs(value);
    if (args.length < 2) return null;

    const fromRef = args[0];
    let toRef: string | undefined;
    let idx = 1;
    const style: EdgeStyle = {};

    if (args[idx] === '->' || args[idx] === '-->') {
        if (args[idx] === '-->') {
            style.strokeStyle = 'dashed';
        }
        toRef = args[idx + 1];
        idx += 2;
    } else {
        toRef = args[idx];
        idx += 1;
    }

    if (!fromRef || !toRef) return null;

    const rest = args.slice(idx);
    const labelParts: string[] = [];
    for (const token of rest) {
        const lower = token.toLowerCase();
        if (lower === 'dashed' || lower === '-->') {
            style.strokeStyle = 'dashed';
            continue;
        }
        if (lower === 'solid' || lower === 'dotted' || lower === '->') {
            const strokeStyle = parseStrokeStyle(lower);
            if (strokeStyle) style.strokeStyle = strokeStyle;
            continue;
        }
        if (parseEdgeStyleToken(style, token)) {
            continue;
        }
        labelParts.push(token);
    }

    const label = labelParts.join(' ').trim() || undefined;
    const resolvedStyle = Object.keys(style).length > 0 ? style : undefined;

    return {
        fromRef,
        toRef,
        label,
        style: resolvedStyle,
    };
}

interface GroupDirective {
    refId: string;
    label: string;
    nodeRefs: string[];
    style?: GroupStyle;
}

function parseNodeRefList(raw: string): string[] {
    return raw
        .split(',')
        .map((item) => item.trim())
        .filter(Boolean);
}

function parseGroupDirective(value: string): GroupDirective | null {
    const args = splitDirectiveArgs(value);
    if (args.length === 0) return null;

    const refId = args[0].trim();
    if (!refId) return null;

    let label = refId;
    const style: GroupStyle = {};
    const nodeRefs = new Set<string>();

    for (let i = 1; i < args.length; i++) {
        const token = args[i];
        const lower = token.toLowerCase();

        if (lower.startsWith('nodes:')) {
            const list = token.slice(token.indexOf(':') + 1);
            for (const ref of parseNodeRefList(list)) {
                nodeRefs.add(ref);
            }
            continue;
        }

        if (lower === 'dashed' || lower === 'solid' || lower === 'dotted') {
            const strokeStyle = parseStrokeStyle(lower);
            if (strokeStyle) style.strokeStyle = strokeStyle;
            continue;
        }

        if (parseGroupStyleToken(style, token)) continue;

        // Treat first free token as label.
        if (label === refId) {
            label = token;
            continue;
        }

        // Additional free tokens can specify node refs directly.
        for (const ref of parseNodeRefList(token)) {
            nodeRefs.add(ref);
        }
    }

    return {
        refId,
        label,
        nodeRefs: Array.from(nodeRefs),
        style: Object.keys(style).length > 0 ? style : undefined,
    };
}

/**
 * Parse tokens into a FlowchartGraph
 */
export function parseDSL(input: string): FlowchartGraph {
    // Strict mode: only directive-style DSL is supported.
    // Any non-empty, non-comment line must start with "@".
    const lines = input.split(/\r?\n/);
    for (let lineNo = 0; lineNo < lines.length; lineNo++) {
        const trimmed = lines[lineNo].trim();
        if (!trimmed || trimmed.startsWith('#')) continue;
        if (!trimmed.startsWith('@')) {
            throw new Error(
                `Legacy DSL syntax is no longer supported (line ${lineNo + 1}).\n` +
                'Use directive-style DSL: @node / @edge / @group / @direction / @spacing.'
            );
        }
    }

    const tokens = tokenize(input);

    const nodes: Map<string, GraphNode> = new Map();
    const edges: GraphEdge[] = [];
    const groups: GraphGroup[] = [];
    const options: LayoutOptions = { ...DEFAULT_LAYOUT_OPTIONS };
    const images: PositionedImage[] = [];
    const scatter: ScatterConfig[] = [];
    const nodeRefs: Map<string, GraphNode> = new Map();
    const directiveEdges: EdgeDirective[] = [];
    const directiveGroups: GroupDirective[] = [];
    let library: string | undefined;
    let globalStyle: GlobalDiagramStyle | undefined;

    // Helper to get or create node by label
    function getOrCreateNode(
        label: string,
        type: NodeType,
        refId?: string,
        style?: NodeStyle
    ): GraphNode {
        // Use explicit ref IDs when provided, otherwise dedupe by type + label
        const key = refId ? `ref:${refId}` : `${type}:${label}`;
        if (!nodes.has(key)) {
            const node: GraphNode = {
                id: nanoid(10),
                type,
                label,
            };
            if (style) {
                node.style = style;
            }
            nodes.set(key, node);
        }
        const node = nodes.get(key)!;
        if (refId) {
            nodeRefs.set(refId, node);
        }
        return node;
    }

    let i = 0;
    let lastNode: GraphNode | null = null;

    while (i < tokens.length) {
        const token = tokens[i];

        if (token.type === 'newline') {
            i++;
            continue;
        }

        if (token.type === 'directive') {
            const [directive, ...valueParts] = token.value.split(' ');
            const value = valueParts.join(' ');

            if (directive === 'direction') {
                const dir = value.toUpperCase();
                if (dir === 'TB' || dir === 'BT' || dir === 'LR' || dir === 'RL') {
                    options.direction = dir;
                }
            } else if (directive === 'spacing') {
                const spacing = parseInt(value, 10);
                if (!isNaN(spacing)) {
                    options.nodeSpacing = spacing;
                }
            } else if (directive === 'image') {
                const img = parseImageDirective(value);
                if (img) images.push(img);
            } else if (directive === 'node') {
                const nodeDirective = parseNodeDirective(value);
                if (nodeDirective) {
                    const node = getOrCreateNode(
                        nodeDirective.label,
                        nodeDirective.type,
                        nodeDirective.refId,
                        nodeDirective.style
                    );
                    lastNode = node;
                }
            } else if (directive === 'edge') {
                const edgeDirective = parseEdgeDirective(value);
                if (edgeDirective) {
                    directiveEdges.push(edgeDirective);
                }
                lastNode = null;
            } else if (directive === 'group') {
                const groupDirective = parseGroupDirective(value);
                if (groupDirective) {
                    directiveGroups.push(groupDirective);
                }
                lastNode = null;
            } else if (directive === 'scatter') {
                const cfg = parseScatterDirective(value);
                if (cfg) scatter.push(cfg);
            } else if (directive === 'library') {
                library = value.trim();
            } else if (directive === 'style') {
                // @style key value
                const parts = value.trim().split(/\s+/);
                if (parts.length >= 2) {
                    const styleKey = parts[0];
                    const styleValue = parts.slice(1).join(' ');
                    const parsed = parseStyleDirective(styleKey, styleValue);
                    if (Object.keys(parsed).length > 0) {
                        globalStyle = { ...globalStyle, ...parsed };
                    }
                }
            } else if (directive === 'sticker') {
                // Stickers are resolved later using the library path
                // For now, treat as positioned image with sticker: prefix
                const parts = value.trim().split(/\s+/);
                const stickerName = parts[0];
                if (stickerName) {
                    // Check for positioning (at or near)
                    const restValue = parts.slice(1).join(' ');
                    if (restValue.includes('at') || restValue.includes('near')) {
                        const img = parseImageDirective(`sticker:${stickerName} ${restValue}`);
                        if (img) images.push(img);
                    } else {
                        // Standalone sticker - will be placed at default position
                        images.push({
                            id: nanoid(10),
                            src: `sticker:${stickerName}`,
                            position: { type: 'absolute', x: 0, y: 0 }, // Will be resolved later
                        });
                    }
                }
            }
            i++;
            continue;
        }

        if (token.type === 'decorate') {
            // Attach decoration to the last node
            if (lastNode) {
                if (!lastNode.decorations) {
                    lastNode.decorations = [];
                }
                lastNode.decorations.push({
                    src: token.imageSrc!,
                    anchor: token.decorationAnchor || 'top-right',
                });
            }
            i++;
            continue;
        }

        i++;
    }

    // Resolve @edge directives after all nodes are known.
    const edgeDedup = new Set<string>();
    for (const edge of directiveEdges) {
        const sourceNode = nodeRefs.get(edge.fromRef) || getOrCreateNode(edge.fromRef, 'rectangle', edge.fromRef);
        const targetNode = nodeRefs.get(edge.toRef) || getOrCreateNode(edge.toRef, 'rectangle', edge.toRef);
        const styleKey = edge.style ? JSON.stringify(edge.style) : '';
        const dedupKey = `${sourceNode.id}|${targetNode.id}|${edge.label || ''}|${styleKey}`;
        if (edgeDedup.has(dedupKey)) continue;
        edgeDedup.add(dedupKey);

        edges.push({
            id: nanoid(10),
            source: sourceNode.id,
            target: targetNode.id,
            label: edge.label,
            style: edge.style,
        });
    }

    // Resolve @group directives after all nodes are known.
    const groupDedup = new Set<string>();
    for (const group of directiveGroups) {
        const nodeIds = Array.from(
            new Set(
                group.nodeRefs
                    .map((ref) => nodeRefs.get(ref)?.id)
                    .filter((id): id is string => Boolean(id))
            )
        );

        if (nodeIds.length === 0) continue;

        const dedupKey = `${group.refId}|${group.label}|${nodeIds.join(',')}`;
        if (groupDedup.has(dedupKey)) continue;
        groupDedup.add(dedupKey);

        groups.push({
            id: group.refId,
            label: group.label,
            nodeIds,
            style: group.style,
        });
    }

    const result: FlowchartGraph = {
        nodes: Array.from(nodes.values()),
        edges,
        options,
    };

    if (groups.length > 0) result.groups = groups;
    if (images.length > 0) result.images = images;
    if (scatter.length > 0) result.scatter = scatter;
    if (library) result.library = library;
    if (globalStyle) result.globalStyle = globalStyle;

    return result;
}

// Re-export DEFAULT_LAYOUT_OPTIONS
export { DEFAULT_LAYOUT_OPTIONS } from '../types/dsl.js';
