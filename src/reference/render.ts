/**
 * Render reference data for terminal output or JSON export.
 */

import { PALETTES, ELEMENT_FORMAT, SIZING, TIPS } from './data.js';

type Section = 'colors' | 'elements' | 'sizing' | 'tips' | 'all';

const VALID_SECTIONS = new Set<string>(['colors', 'elements', 'sizing', 'tips', 'all']);

function validateSection(section: string): Section {
    if (!VALID_SECTIONS.has(section)) {
        console.warn(`Unknown section "${section}". Showing all.`);
        return 'all';
    }
    return section as Section;
}

function renderColors(): void {
    console.log('\n  ## Color Palettes\n');

    console.log('  ### Primary fills');
    for (const [name, hex] of Object.entries(PALETTES.primary)) {
        console.log(`    ${name.padEnd(10)} ${hex}`);
    }

    console.log('\n  ### Pastel fills (lighter)');
    for (const [name, hex] of Object.entries(PALETTES.pastel)) {
        console.log(`    ${name.padEnd(10)} ${hex}`);
    }

    console.log('\n  ### Stroke colors');
    for (const [name, hex] of Object.entries(PALETTES.strokes)) {
        console.log(`    ${name.padEnd(10)} ${hex}`);
    }

    console.log('\n  ### Dark mode');
    console.log(`    Background:  ${PALETTES.dark.background}`);
    console.log(`    Surface:     ${PALETTES.dark.surface}`);
    console.log(`    Fills:       ${PALETTES.dark.fills.join(', ')}`);
    console.log(`    Accents:     ${PALETTES.dark.accents.join(', ')}`);
    console.log(`    Borders:     ${PALETTES.dark.borders.join(', ')}`);

    console.log('\n  ### Semantic (by component type)');
    for (const [name, colors] of Object.entries(PALETTES.semantic)) {
        console.log(`    ${name.padEnd(15)} bg: ${colors.bg}  stroke: ${colors.stroke}`);
    }
}

function renderElements(): void {
    console.log('\n  ## Element Format\n');

    console.log('  ### Shape types');
    for (const shape of ELEMENT_FORMAT.shapes) {
        console.log(`    ${shape.type.padEnd(12)} ${shape.use}`);
    }

    console.log('\n  ### Required fields');
    console.log(`    Shape: ${ELEMENT_FORMAT.requiredFields.shape.join(', ')}`);
    console.log(`    Arrow: ${ELEMENT_FORMAT.requiredFields.arrow.join(', ')}`);

    console.log('\n  ### Optional fields');
    console.log(`    Shape: ${ELEMENT_FORMAT.optionalFields.shape.join(', ')}`);
    console.log(`    Arrow: ${ELEMENT_FORMAT.optionalFields.arrow.join(', ')}`);

    console.log('\n  ### Label format');
    console.log(`    String: ${ELEMENT_FORMAT.labelFormat.string}`);
    console.log(`    Object: ${ELEMENT_FORMAT.labelFormat.object}`);
    console.log('    Font families:');
    for (const [id, name] of Object.entries(ELEMENT_FORMAT.labelFormat.fontFamilies)) {
        console.log(`      ${id} = ${name}`);
    }

    console.log('\n  ### Pseudo-elements');
    for (const pseudo of ELEMENT_FORMAT.pseudoElements) {
        console.log(`    ${pseudo.type.padEnd(20)} ${pseudo.fields.padEnd(25)} ${pseudo.use}`);
    }
}

function renderSizing(): void {
    console.log('\n  ## Sizing Rules\n');
    for (const [key, value] of Object.entries(SIZING)) {
        const label = key.replace(/([A-Z])/g, ' $1').toLowerCase();
        console.log(`    ${label.padEnd(25)} ${value}${typeof value === 'number' && key !== 'lineHeight' ? 'px' : ''}`);
    }
}

function renderTips(): void {
    console.log('\n  ## Tips\n');
    for (let i = 0; i < TIPS.length; i++) {
        console.log(`    ${i + 1}. ${TIPS[i]}`);
    }
}

/**
 * Render reference to terminal.
 */
export function renderReference(sectionRaw: string): void {
    const section = validateSection(sectionRaw);

    console.log('\n  ◆ Excalidraw Diagram Reference');
    console.log('  ━'.repeat(20));

    if (section === 'all' || section === 'colors') renderColors();
    if (section === 'all' || section === 'elements') renderElements();
    if (section === 'all' || section === 'sizing') renderSizing();
    if (section === 'all' || section === 'tips') renderTips();

    console.log();
}

/**
 * Get reference data as structured object (for --json output).
 */
export function getReferenceData(sectionRaw: string): Record<string, unknown> {
    const section = validateSection(sectionRaw);
    const data: Record<string, unknown> = {};

    if (section === 'all' || section === 'colors') data.palettes = PALETTES;
    if (section === 'all' || section === 'elements') data.elementFormat = ELEMENT_FORMAT;
    if (section === 'all' || section === 'sizing') data.sizing = SIZING;
    if (section === 'all' || section === 'tips') data.tips = TIPS;

    return data;
}
