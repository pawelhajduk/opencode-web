import type { Theme } from '@/types/theme';

/**
 * VSCode theme token structure (simplified)
 */
type VSCodeTextMateRule = {
  scope?: string | string[];
  settings: {
    foreground?: string;
    background?: string;
    fontStyle?: string;
  };
};

type VSCodeThemeData = {
  name?: string;
  tokenColors?: VSCodeTextMateRule[];
  colors?: Record<string, string>;
  semanticTokenColors?: Record<string, string | { foreground?: string; background?: string; fontStyle?: string }>;
};

/**
 * Extract a color from VSCode theme tokenColors by scope name(s)
 */
function findColorByScope(
  tokenColors: VSCodeTextMateRule[] | undefined,
  scopes: string | string[],
  property: 'foreground' | 'background' = 'foreground'
): string | undefined {
  if (!tokenColors) return undefined;
  
  const targetScopes = Array.isArray(scopes) ? scopes : [scopes];
  
  for (const scope of targetScopes) {
    for (const rule of tokenColors) {
      if (!rule.scope) continue;
      
      const ruleScopes = Array.isArray(rule.scope) ? rule.scope : [rule.scope];
      
      // Check for exact match or parent scope match
      if (ruleScopes.some(s => s === scope || scope.startsWith(s + '.'))) {
        const color = rule.settings[property];
        if (color) return color;
      }
    }
  }
  
  return undefined;
}

/**
 * Generate react-syntax-highlighter theme from VSCode theme JSON
 */
export function generateVSCodeSyntaxTheme(vscodeThemeData: VSCodeThemeData, baseTheme: Theme) {
  const tokenColors = vscodeThemeData.tokenColors || [];
  const colors = vscodeThemeData.colors || {};
  
  // Fallback to base theme colors
  const syntax = baseTheme.colors.syntax;
  const surface = baseTheme.colors.surface;
  
  // Extract common colors from VSCode theme
  const background = colors['editor.background'] || surface.background;
  const foreground = colors['editor.foreground'] || syntax.base.foreground;
  
  // Map VSCode TextMate scopes to syntax theme properties
  const commentColor = findColorByScope(tokenColors, ['comment', 'punctuation.definition.comment']) || syntax.base.comment;
  const keywordColor = findColorByScope(tokenColors, ['keyword', 'storage.type', 'storage.modifier']) || syntax.base.keyword;
  const stringColor = findColorByScope(tokenColors, ['string', 'string.quoted']) || syntax.base.string;
  const numberColor = findColorByScope(tokenColors, ['constant.numeric']) || syntax.base.number;
  const functionColor = findColorByScope(tokenColors, ['entity.name.function', 'support.function']) || syntax.base.function;
  const variableColor = findColorByScope(tokenColors, ['variable', 'variable.other']) || syntax.base.variable;
  const typeColor = findColorByScope(tokenColors, ['entity.name.type', 'support.type', 'storage.type']) || syntax.base.type;
  const operatorColor = findColorByScope(tokenColors, ['keyword.operator']) || syntax.base.operator;
  const punctuationColor = findColorByScope(tokenColors, ['punctuation']) || surface.mutedForeground;
  const propertyColor = findColorByScope(tokenColors, ['variable.other.property', 'support.type.property-name']) || variableColor;
  const tagColor = findColorByScope(tokenColors, ['entity.name.tag']) || keywordColor;
  const attributeColor = findColorByScope(tokenColors, ['entity.other.attribute-name']) || variableColor;
  const classNameColor = findColorByScope(tokenColors, ['entity.name.type.class', 'support.class']) || typeColor;
  const regexColor = findColorByScope(tokenColors, ['string.regexp']) || stringColor;
  const constantColor = findColorByScope(tokenColors, ['constant.language', 'variable.language']) || numberColor;
  
  return {
    'code[class*="language-"]': {
      color: foreground,
      background: 'transparent',
      fontFamily: 'Consolas, Monaco, "Andale Mono", "Ubuntu Mono", monospace',
      fontSize: '1em',
      textAlign: 'left' as const,
      whiteSpace: 'pre',
      wordSpacing: 'normal',
      wordBreak: 'normal' as const,
      wordWrap: 'normal' as const,
      lineHeight: '1.5',
      MozTabSize: '4',
      OTabSize: '4',
      tabSize: '4',
      WebkitHyphens: 'none' as const,
      MozHyphens: 'none' as const,
      msHyphens: 'none' as const,
      hyphens: 'none' as const,
    },
    'pre[class*="language-"]': {
      color: foreground,
      background: 'transparent',
      fontFamily: 'Consolas, Monaco, "Andale Mono", "Ubuntu Mono", monospace',
      fontSize: '1em',
      textAlign: 'left' as const,
      whiteSpace: 'pre',
      wordSpacing: 'normal',
      wordBreak: 'normal' as const,
      wordWrap: 'normal' as const,
      lineHeight: '1.5',
      MozTabSize: '4',
      OTabSize: '4',
      tabSize: '4',
      WebkitHyphens: 'none' as const,
      MozHyphens: 'none' as const,
      msHyphens: 'none' as const,
      hyphens: 'none' as const,
      padding: '0',
      margin: '0',
      overflow: 'auto',
    },

    comment: {
      color: commentColor,
      fontStyle: 'italic',
    },
    prolog: {
      color: commentColor,
    },
    doctype: {
      color: commentColor,
    },
    cdata: {
      color: commentColor,
    },

    punctuation: {
      color: punctuationColor,
    },

    property: {
      color: propertyColor,
    },
    tag: {
      color: tagColor,
    },
    'attr-name': {
      color: attributeColor,
    },
    'attr-value': {
      color: stringColor,
    },

    boolean: {
      color: constantColor,
    },
    number: {
      color: numberColor,
    },
    constant: {
      color: constantColor,
    },
    symbol: {
      color: constantColor,
    },

    string: {
      color: stringColor,
    },
    char: {
      color: stringColor,
    },

    function: {
      color: functionColor,
    },
    builtin: {
      color: functionColor,
    },

    'class-name': {
      color: classNameColor,
    },
    namespace: {
      color: typeColor,
      opacity: 0.8,
    },

    keyword: {
      color: keywordColor,
    },
    atrule: {
      color: keywordColor,
    },
    selector: {
      color: functionColor,
    },

    operator: {
      color: operatorColor,
    },

    variable: {
      color: variableColor,
    },

    regex: {
      color: regexColor,
    },

    url: {
      color: functionColor,
      textDecoration: 'underline',
    },
    entity: {
      color: functionColor,
      cursor: 'help',
    },

    '.language-css .token.string': {
      color: stringColor,
    },
    '.style .token.string': {
      color: stringColor,
    },

    deleted: {
      color: baseTheme.colors.status.error,
      backgroundColor: baseTheme.colors.status.errorBackground,
    },
    inserted: {
      color: baseTheme.colors.status.success,
      backgroundColor: baseTheme.colors.status.successBackground,
    },

    title: {
      color: baseTheme.colors.primary.base,
      fontWeight: 'bold',
    },
    'code-block': {
      color: stringColor,
    },
    'code-snippet': {
      color: stringColor,
    },
    list: {
      color: variableColor,
    },
    hr: {
      color: surface.mutedForeground,
    },
    table: {
      color: functionColor,
    },
    blockquote: {
      color: surface.mutedForeground,
      fontStyle: 'italic',
    },

    important: {
      color: keywordColor,
      fontWeight: 'bold',
    },
    bold: {
      fontWeight: 'bold',
    },
    italic: {
      fontStyle: 'italic',
    },
    strike: {
      textDecoration: 'line-through',
    },

    decorator: {
      color: functionColor,
    },
    annotation: {
      color: functionColor,
    },
  };
}
