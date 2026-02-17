import { describe, it, expect } from 'vitest';
import { parseDSL } from '../../../src/parser/dsl-parser.js';

describe('DSL Parser (directive-only)', () => {
  describe('@node and @edge', () => {
    it('parses explicit nodes and edges', () => {
      const result = parseDSL(`
        @node user user "End User"
        @node api orchestrator "API Gateway"
        @node db database "Orders DB"
        @edge user api "calls"
        @edge api db "writes" dashed
      `);

      expect(result.nodes).toHaveLength(3);
      expect(result.edges).toHaveLength(2);

      const userNode = result.nodes.find((n) => n.label === 'End User');
      const apiNode = result.nodes.find((n) => n.label === 'API Gateway');
      const dbNode = result.nodes.find((n) => n.label === 'Orders DB');

      expect(userNode?.type).toBe('ellipse');
      expect(apiNode?.type).toBe('rectangle');
      expect(dbNode?.type).toBe('database');
      expect(apiNode?.style?.strokeWidth).toBe(3);
      expect(userNode?.style?.backgroundColor).toBe('#e7f5ff');
    });

    it('supports @edge arrow variant', () => {
      const result = parseDSL(`
        @node a rectangle "Service A"
        @node b rectangle "Service B"
        @edge a -> b "calls"
      `);

      expect(result.edges).toHaveLength(1);
      expect(result.edges[0].label).toBe('calls');
    });

    it('auto-creates placeholder nodes for unknown edge refs', () => {
      const result = parseDSL('@edge source target "flows"');
      expect(result.nodes.some((n) => n.label === 'source')).toBe(true);
      expect(result.nodes.some((n) => n.label === 'target')).toBe(true);
      expect(result.edges).toHaveLength(1);
    });

    it('deduplicates identical directive edges', () => {
      const result = parseDSL(`
        @node a service "Service A"
        @node b service "Service B"
        @edge a b "calls"
        @edge a b "calls"
      `);

      expect(result.edges).toHaveLength(1);
    });
  });

  describe('layout directives', () => {
    it('parses direction and spacing directives', () => {
      const result = parseDSL(`
        @direction LR
        @spacing 90
        @node a rectangle "A"
        @node b rectangle "B"
        @edge a b
      `);

      expect(result.options.direction).toBe('LR');
      expect(result.options.nodeSpacing).toBe(90);
    });
  });

  describe('style directives', () => {
    it('parses node style tokens inline', () => {
      const result = parseDSL('@node api service "API Gateway" bg:#f1f3f5 stroke:#495057 size:18 font:2 text:#111');
      const api = result.nodes.find((n) => n.label === 'API Gateway');

      expect(api?.style?.backgroundColor).toBe('#f1f3f5');
      expect(api?.style?.strokeColor).toBe('#495057');
      expect(api?.style?.fontSize).toBe(18);
      expect(api?.style?.fontFamily).toBe(2);
      expect(api?.style?.textColor).toBe('#111');
    });

    it('parses edge style tokens inline', () => {
      const result = parseDSL(`
        @node a rectangle "A"
        @node b rectangle "B"
        @edge a b "sync" color:#2f9e44 width:3 arrow:triangle start:dot
      `);

      expect(result.edges).toHaveLength(1);
      expect(result.edges[0].style?.strokeColor).toBe('#2f9e44');
      expect(result.edges[0].style?.strokeWidth).toBe(3);
      expect(result.edges[0].style?.endArrowhead).toBe('triangle');
      expect(result.edges[0].style?.startArrowhead).toBe('dot');
    });
  });

  describe('image and decoration directives', () => {
    it('parses @image absolute and near', () => {
      const result = parseDSL(`
        @node start ellipse "Start"
        @image icon.png at 100,200
        @image badge.png near (Start) top-right
      `);

      expect(result.images).toHaveLength(2);
      expect(result.images![0].position).toEqual({ type: 'absolute', x: 100, y: 200 });
      expect(result.images![1].position).toEqual({
        type: 'near',
        nodeLabel: 'Start',
        anchor: 'top-right',
      });
    });

    it('parses @decorate attached to preceding @node', () => {
      const result = parseDSL('@node start ellipse "Start"\n@decorate holly.png top-left');
      const start = result.nodes.find((n) => n.label === 'Start');

      expect(start?.decorations).toHaveLength(1);
      expect(start?.decorations?.[0].src).toBe('holly.png');
      expect(start?.decorations?.[0].anchor).toBe('top-left');
    });
  });

  describe('sticker, library, scatter', () => {
    it('parses @library and @sticker', () => {
      const result = parseDSL(`
        @library ./stickers/
        @sticker snowflake
        @sticker star at 50,50
      `);

      expect(result.library).toBe('./stickers/');
      expect(result.images).toHaveLength(2);
      expect(result.images![0].src).toBe('sticker:snowflake');
      expect(result.images![1].position).toEqual({ type: 'absolute', x: 50, y: 50 });
    });

    it('parses @scatter', () => {
      const result = parseDSL('@scatter star.png count:10 width:30 height:30');
      expect(result.scatter).toHaveLength(1);
      expect(result.scatter![0]).toEqual({
        src: 'star.png',
        count: 10,
        width: 30,
        height: 30,
      });
    });
  });

  describe('@group', () => {
    it('parses grouping with nodes and style', () => {
      const result = parseDSL(`
        @node web frontend "Web App"
        @node api service "API"
        @group app "Application Tier" nodes:web,api stroke:#495057 dashed padding:20
      `);

      expect(result.groups).toHaveLength(1);
      expect(result.groups?.[0].label).toBe('Application Tier');
      expect(result.groups?.[0].nodeIds).toHaveLength(2);
      expect(result.groups?.[0].style?.strokeColor).toBe('#495057');
      expect(result.groups?.[0].style?.strokeStyle).toBe('dashed');
      expect(result.groups?.[0].style?.padding).toBe(20);
    });
  });

  describe('legacy syntax removal', () => {
    it('throws on bracket/arrow DSL', () => {
      expect(() => parseDSL('[A] -> [B]')).toThrow('Legacy DSL syntax is no longer supported');
    });

    it('throws on inline image syntax', () => {
      expect(() => parseDSL('![logo.png]')).toThrow('Legacy DSL syntax is no longer supported');
    });

    it('throws on non-directive free text', () => {
      expect(() => parseDSL('hello world')).toThrow('Legacy DSL syntax is no longer supported');
    });
  });
});
