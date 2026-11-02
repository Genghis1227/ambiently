import React, { useState, useRef, useEffect } from 'react';

export interface TextBoxConfig {
  content?: string;
  fontSize?: 'xs' | 'sm' | 'base' | 'lg' | 'xl' | '2xl' | '3xl' | '4xl' | '5xl';
  fontWeight?: 'normal' | 'medium' | 'semibold' | 'bold' | 'extrabold';
  textAlign?: 'left' | 'center' | 'right';
  fontFamily?: 'sans' | 'serif' | 'mono' | 'script';
  textColor?: string;
  textShadow?: boolean;
  textTransform?: 'none' | 'uppercase' | 'lowercase' | 'capitalize';
  letterSpacing?: 'normal' | 'wide' | 'widest';
  bgStyle?: 'transparent' | 'glass' | 'solid';
}

interface TextBoxWidgetProps {
  content?: string;
  fontSize?: TextBoxConfig['fontSize'];
  fontWeight?: TextBoxConfig['fontWeight'];
  textAlign?: TextBoxConfig['textAlign'];
  fontFamily?: TextBoxConfig['fontFamily'];
  textColor?: string;
  textShadow?: boolean;
  textTransform?: TextBoxConfig['textTransform'];
  letterSpacing?: TextBoxConfig['letterSpacing'];
  bgStyle?: TextBoxConfig['bgStyle'];
  onUpdateConfig?: (updates: Partial<TextBoxConfig>) => void;
}

export const FONT_SIZE_MAP: Record<NonNullable<TextBoxConfig['fontSize']>, string> = {
  xs: 'text-xs',
  sm: 'text-sm',
  base: 'text-base',
  lg: 'text-lg',
  xl: 'text-xl',
  '2xl': 'text-2xl',
  '3xl': 'text-3xl',
  '4xl': 'text-4xl',
  '5xl': 'text-5xl',
};

export const FONT_WEIGHT_MAP: Record<NonNullable<TextBoxConfig['fontWeight']>, string> = {
  normal: 'font-normal',
  medium: 'font-medium',
  semibold: 'font-semibold',
  bold: 'font-bold',
  extrabold: 'font-extrabold',
};

export const TEXT_ALIGN_MAP: Record<NonNullable<TextBoxConfig['textAlign']>, string> = {
  left: 'text-left items-start',
  center: 'text-center items-center',
  right: 'text-right items-end',
};

export const FONT_FAMILY_MAP: Record<NonNullable<TextBoxConfig['fontFamily']>, string> = {
  sans: 'font-sans',
  serif: 'font-serif',
  mono: 'font-mono',
  script: 'font-serif italic',
};

export const LETTER_SPACING_MAP: Record<NonNullable<TextBoxConfig['letterSpacing']>, string> = {
  normal: 'tracking-normal',
  wide: 'tracking-wide',
  widest: 'tracking-widest',
};

/**
 * Lightweight inline markdown renderer for bold (**), italic (*), strikethrough (~~), and underline (__)
 */
function renderFormattedInline(text: string): React.ReactNode[] {
  // Regex splitting by markdown tokens: **bold**, *italic*, ~~strike~~, __underline__
  const regex = /(\*\*.*?\*\*|\*.*?\*|~~.*?~~|__.*?__)/g;
  const parts = text.split(regex);

  return parts.map((part, index) => {
    if (part.startsWith('**') && part.endsWith('**')) {
      return (
        <strong key={index} className="font-extrabold">
          {part.slice(2, -2)}
        </strong>
      );
    }
    if (part.startsWith('__') && part.endsWith('__')) {
      return (
        <span key={index} className="underline decoration-current underline-offset-4">
          {part.slice(2, -2)}
        </span>
      );
    }
    if (part.startsWith('~~') && part.endsWith('~~')) {
      return (
        <del key={index} className="line-through opacity-75">
          {part.slice(2, -2)}
        </del>
      );
    }
    if (part.startsWith('*') && part.endsWith('*')) {
      return (
        <em key={index} className="italic">
          {part.slice(1, -1)}
        </em>
      );
    }
    return <React.Fragment key={index}>{part}</React.Fragment>;
  });
}

export const TextBoxWidget: React.FC<TextBoxWidgetProps> = ({
  content = 'Welcome to Ambiently\nSmart Display & Dashboard',
  fontSize = '2xl',
  fontWeight = 'bold',
  textAlign = 'center',
  fontFamily = 'sans',
  textColor = '#ffffff',
  textShadow = true,
  textTransform = 'none',
  letterSpacing = 'normal',
  bgStyle = 'transparent',
  onUpdateConfig,
}) => {
  const [isInlineEditing, setIsInlineEditing] = useState(false);
  const [editingText, setEditingText] = useState(content);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    setEditingText(content);
  }, [content]);

  useEffect(() => {
    if (isInlineEditing && textareaRef.current) {
      textareaRef.current.focus();
      textareaRef.current.select();
    }
  }, [isInlineEditing]);

  const handleSaveInline = () => {
    setIsInlineEditing(false);
    if (onUpdateConfig && editingText !== content) {
      onUpdateConfig({ content: editingText });
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Escape') {
      setEditingText(content);
      setIsInlineEditing(false);
    } else if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      handleSaveInline();
    }
  };

  const sizeClass = FONT_SIZE_MAP[fontSize] || 'text-2xl';
  const weightClass = FONT_WEIGHT_MAP[fontWeight] || 'font-bold';
  const alignClass = TEXT_ALIGN_MAP[textAlign] || 'text-center items-center';
  const familyClass = FONT_FAMILY_MAP[fontFamily] || 'font-sans';
  const spacingClass = LETTER_SPACING_MAP[letterSpacing] || 'tracking-normal';

  const transformStyle =
    textTransform !== 'none' ? ({ textTransform } as React.CSSProperties) : {};

  const lines = (content || '').split('\n');

  return (
    <div
      onDoubleClick={(e) => {
        e.stopPropagation();
        setIsInlineEditing(true);
      }}
      className={`w-full h-full flex flex-col justify-center ${alignClass} select-none transition-all p-2 ${
        bgStyle === 'glass'
          ? 'rounded-2xl bg-gray-950/40 backdrop-blur-md border border-white/10'
          : bgStyle === 'solid'
          ? 'rounded-2xl bg-gray-900/90 border border-gray-800'
          : 'bg-transparent'
      }`}
    >
      {isInlineEditing ? (
        <div
          data-no-drag="true"
          className="w-full h-full flex flex-col justify-center"
          onClick={(e) => e.stopPropagation()}
        >
          <textarea
            ref={textareaRef}
            value={editingText}
            onChange={(e) => setEditingText(e.target.value)}
            onBlur={handleSaveInline}
            onKeyDown={handleKeyDown}
            className={`w-full h-full resize-none bg-black/60 text-white rounded-xl p-3 border border-blue-500/80 focus:outline-none focus:ring-2 focus:ring-blue-500 font-sans ${sizeClass}`}
            placeholder="Type your message, heading, or notes..."
          />
          <div className="flex items-center justify-between mt-1 px-1 text-[10px] text-gray-400">
            <span>Esc to cancel • Ctrl+Enter to save</span>
            <button
              onClick={handleSaveInline}
              className="px-2 py-0.5 rounded bg-blue-600 hover:bg-blue-500 text-white font-semibold cursor-pointer"
            >
              Done
            </button>
          </div>
        </div>
      ) : (
        <div
          className={`w-full flex flex-col justify-center ${alignClass} ${familyClass} ${sizeClass} ${weightClass} ${spacingClass} leading-snug break-words`}
          style={{
            color: textColor,
            ...(textShadow
              ? {
                  textShadow:
                    '0 2px 8px rgba(0,0,0,0.85), 0 1px 2px rgba(0,0,0,0.95), 0 0 1px rgba(0,0,0,0.95)',
                }
              : {}),
            ...transformStyle,
          }}
        >
          {lines.length === 0 || (lines.length === 1 && !lines[0].trim()) ? (
            <span className="opacity-40 italic text-sm font-normal">
              Double-click to write text...
            </span>
          ) : (
            lines.map((line, idx) => {
              // Check for markdown headers
              if (line.startsWith('# ')) {
                return (
                  <div key={idx} className="text-[1.3em] font-extrabold my-0.5">
                    {renderFormattedInline(line.slice(2))}
                  </div>
                );
              }
              if (line.startsWith('## ')) {
                return (
                  <div key={idx} className="text-[1.15em] font-bold my-0.5">
                    {renderFormattedInline(line.slice(3))}
                  </div>
                );
              }
              if (line.startsWith('### ')) {
                return (
                  <div key={idx} className="text-[1.05em] font-semibold my-0.5 opacity-90">
                    {renderFormattedInline(line.slice(4))}
                  </div>
                );
              }
              if (line.startsWith('- ') || line.startsWith('* ')) {
                return (
                  <div key={idx} className="flex items-start gap-1.5 my-0.5">
                    <span className="opacity-70 leading-normal">•</span>
                    <span>{renderFormattedInline(line.slice(2))}</span>
                  </div>
                );
              }

              return (
                <div key={idx} className="min-h-[1em]">
                  {line.trim() ? renderFormattedInline(line) : <span>&nbsp;</span>}
                </div>
              );
            })
          )}
        </div>
      )}
    </div>
  );
};
