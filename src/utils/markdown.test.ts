import { describe, it, expect } from 'vitest';
import { markdownToHtml } from './markdown.js';

describe('markdownToHtml', () => {
  describe('headings', () => {
    it('converts h1', () => {
      expect(markdownToHtml('# Hello')).toContain('<h1>Hello</h1>');
    });

    it('converts h2', () => {
      expect(markdownToHtml('## Hello')).toContain('<h2>Hello</h2>');
    });

    it('converts h3 through h6', () => {
      expect(markdownToHtml('### H3')).toContain('<h3>H3</h3>');
      expect(markdownToHtml('#### H4')).toContain('<h4>H4</h4>');
      expect(markdownToHtml('##### H5')).toContain('<h5>H5</h5>');
      expect(markdownToHtml('###### H6')).toContain('<h6>H6</h6>');
    });

    it('does not convert # in the middle of a line', () => {
      const result = markdownToHtml('This is not # a heading');
      expect(result).not.toContain('<h1>');
    });
  });

  describe('inline formatting', () => {
    it('converts bold with **', () => {
      expect(markdownToHtml('**bold**')).toContain('<b>bold</b>');
    });

    it('converts italic with *', () => {
      expect(markdownToHtml('*italic*')).toContain('<i>italic</i>');
    });

    it('converts bold+italic with ***', () => {
      expect(markdownToHtml('***both***')).toContain('<b><i>both</i></b>');
    });

    it('converts strikethrough with ~~', () => {
      expect(markdownToHtml('~~deleted~~')).toContain('<s>deleted</s>');
    });

    it('converts inline code', () => {
      expect(markdownToHtml('use `npm install`')).toContain('<code>npm install</code>');
    });

    it('escapes HTML in inline code', () => {
      expect(markdownToHtml('`<div>`')).toContain('<code>&lt;div&gt;</code>');
    });
  });

  describe('links', () => {
    it('converts markdown links', () => {
      expect(markdownToHtml('[Google](https://google.com)')).toContain(
        '<a href="https://google.com">Google</a>'
      );
    });
  });

  describe('code blocks', () => {
    it('converts fenced code blocks', () => {
      const md = '```js\nconst x = 1;\n```';
      const result = markdownToHtml(md);
      expect(result).toContain('<pre><code>');
      expect(result).toContain('const x = 1;');
      expect(result).toContain('</code></pre>');
    });

    it('escapes HTML inside code blocks', () => {
      const md = '```\n<div>test</div>\n```';
      const result = markdownToHtml(md);
      expect(result).toContain('&lt;div&gt;');
    });
  });

  describe('lists', () => {
    it('converts unordered lists with -', () => {
      const md = '- item 1\n- item 2';
      const result = markdownToHtml(md);
      expect(result).toContain('<ul>');
      expect(result).toContain('<li>item 1</li>');
      expect(result).toContain('<li>item 2</li>');
      expect(result).toContain('</ul>');
    });

    it('converts unordered lists with *', () => {
      const md = '* item 1\n* item 2';
      const result = markdownToHtml(md);
      expect(result).toContain('<ul>');
      expect(result).toContain('<li>item 1</li>');
    });

    it('converts ordered lists', () => {
      const md = '1. first\n2. second';
      const result = markdownToHtml(md);
      expect(result).toContain('<ol>');
      expect(result).toContain('<li>first</li>');
      expect(result).toContain('<li>second</li>');
      expect(result).toContain('</ol>');
    });
  });

  describe('blockquotes', () => {
    it('converts blockquotes', () => {
      const md = '> This is a quote\n> Second line';
      const result = markdownToHtml(md);
      expect(result).toContain('<blockquote>');
      expect(result).toContain('This is a quote');
      expect(result).toContain('</blockquote>');
    });
  });

  describe('horizontal rules', () => {
    it('converts ---', () => {
      expect(markdownToHtml('---')).toContain('<hr>');
    });

    it('converts ***', () => {
      expect(markdownToHtml('***')).toContain('<hr>');
    });
  });

  describe('paragraphs', () => {
    it('wraps plain text in <p> tags', () => {
      expect(markdownToHtml('Hello world')).toContain('<p>Hello world</p>');
    });

    it('separates paragraphs on double newlines', () => {
      const result = markdownToHtml('Para 1\n\nPara 2');
      expect(result).toContain('<p>Para 1</p>');
      expect(result).toContain('<p>Para 2</p>');
    });

    it('converts single newlines to <br> within paragraphs', () => {
      const result = markdownToHtml('Line 1\nLine 2');
      expect(result).toContain('Line 1<br>Line 2');
    });

    it('does not wrap block elements in <p>', () => {
      const result = markdownToHtml('# Heading');
      expect(result).not.toContain('<p><h1>');
    });
  });
});
