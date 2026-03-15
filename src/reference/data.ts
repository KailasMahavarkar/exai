/**
 * Reference data for diagram elements.
 *
 * Color palettes, element format specs, sizing rules, and drawing tips.
 * Used by the `reference` command and available for import by prompts.ts.
 */

// ── Color Palettes ──

export const PALETTES = {
    primary: {
        blue: '#a5d8ff',
        green: '#b2f2bb',
        red: '#ffc9c9',
        purple: '#d0bfff',
        yellow: '#ffec99',
        orange: '#ffd8a8',
        gray: '#e9ecef',
        cyan: '#99e9f2',
        pink: '#fcc2d7',
        teal: '#96f2d7',
    },
    pastel: {
        blue: '#e7f5ff',
        green: '#ebfbee',
        red: '#fff5f5',
        purple: '#f3f0ff',
        yellow: '#fff9db',
        orange: '#fff4e6',
    },
    dark: {
        background: '#121212',
        surface: '#1e1e1e',
        fills: ['#2d3436', '#34495e', '#2c3e50', '#1e272e'],
        accents: ['#74b9ff', '#a29bfe', '#81ecec', '#fab1a0', '#ffeaa7', '#55efc4'],
        borders: ['#dfe6e9', '#b2bec3'],
    },
    strokes: {
        blue: '#1971c2',
        green: '#2f9e44',
        red: '#e03131',
        purple: '#7048e8',
        yellow: '#f08c00',
        orange: '#fd7e14',
        gray: '#868e96',
    },
    semantic: {
        frontend: { bg: '#a5d8ff', stroke: '#1971c2' },
        backend: { bg: '#d0bfff', stroke: '#7048e8' },
        database: { bg: '#b2f2bb', stroke: '#2f9e44' },
        storage: { bg: '#ffec99', stroke: '#f08c00' },
        ai: { bg: '#e599f7', stroke: '#9c36b5' },
        external: { bg: '#ffc9c9', stroke: '#e03131' },
        orchestration: { bg: '#ffa8a8', stroke: '#c92a2a' },
        queue: { bg: '#fff3bf', stroke: '#fab005' },
        cache: { bg: '#ffe8cc', stroke: '#fd7e14' },
        user: { bg: '#e7f5ff', stroke: '#1971c2' },
    },
} as const;

// ── Element Format ──

export const ELEMENT_FORMAT = {
    shapes: [
        { type: 'rectangle', use: 'Services, components, processes (default)' },
        { type: 'ellipse', use: 'Users, external systems, start/end points' },
        { type: 'diamond', use: 'Decision points, routers' },
    ],
    requiredFields: {
        shape: ['type', 'id', 'label'],
        arrow: ['type ("arrow")', 'from (source id)', 'to (target id)'],
    },
    optionalFields: {
        shape: ['backgroundColor', 'strokeColor', 'width', 'height', 'group'],
        arrow: ['label', 'strokeColor', 'strokeStyle', 'id'],
    },
    labelFormat: {
        string: '"My Label"',
        object: '{ "text": "My Label", "fontSize": 20, "fontFamily": 2, "strokeColor": "#c92a2a" }',
        fontFamilies: { 1: 'Virgil (hand)', 2: 'Helvetica', 3: 'Cascadia (code)', 5: 'Excalifont' },
    },
    pseudoElements: [
        { type: 'cameraUpdate', fields: 'zoom?, scrollX?, scrollY?', use: 'Override viewport' },
        { type: 'delete', fields: 'targetId', use: 'Remove element by ID' },
        { type: 'restoreCheckpoint', fields: 'name', use: 'Load checkpoint as base' },
    ],
} as const;

// ── Sizing Rules ──

export const SIZING = {
    defaultShapeWidth: 200,
    defaultShapeHeight: 80,
    defaultFontSize: 16,
    arrowLabelFontSize: 13,
    nodeGapX: 80,
    nodeGapY: 100,
    padding: 60,
    lineHeight: 1.25,
    charWidthEstimate: 8,
} as const;

// ── Tips ──

export const TIPS = [
    'Use short, descriptive IDs in kebab-case (e.g., "api-gateway", "auth-service")',
    'Keep labels concise (1-3 words) for readability',
    'Use arrows to show data flow direction, not just connections',
    'Group related shapes with the same `group` string',
    'Use dashed strokeStyle for optional or async connections',
    'Choose background colors based on component type (see semantic palette)',
    'For dark mode, use muted fills (#2d3436) with bright accent borders',
    'Use rich labels ({text, fontSize}) for emphasis on key components',
    'The cameraUpdate pseudo-element can zoom out for large diagrams (zoom: 0.5)',
    'Use --from-checkpoint to iteratively build complex diagrams across sessions',
] as const;
