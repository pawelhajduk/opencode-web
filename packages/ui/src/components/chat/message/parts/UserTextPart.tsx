import React from 'react';

import { cn } from '@/lib/utils';
import type { Part } from '@opencode-ai/sdk/v2';
import type { AgentMentionInfo } from '../types';

type PartWithText = Part & { text?: string; content?: string; value?: string };

type UserTextPartProps = {
    part: Part;
    messageId: string;
    isMobile: boolean;
    agentMention?: AgentMentionInfo;
};

const buildMentionUrl = (name: string): string => {
    const encoded = encodeURIComponent(name);
    return `https://opencode.ai/docs/agents/#${encoded}`;
};

const parseInlineCode = (text: string | React.ReactNode): Array<string | React.ReactNode> => {
    if (typeof text !== 'string') return [text];
    const codeRegex = /`([^`]+)`/g;
    const parts: Array<string | React.ReactNode> = [];
    let lastIndex = 0;
    
    const matches = Array.from(text.matchAll(codeRegex));
    
    for (const match of matches) {
        if (match.index !== undefined && match.index > lastIndex) {
            parts.push(text.slice(lastIndex, match.index));
        }
        if (match.index !== undefined) {
            parts.push(
                <code key={`code-${match.index}`} className="px-1 py-0.5 rounded bg-muted text-foreground font-mono text-sm">
                    {match[1]}
                </code>
            );
            lastIndex = match.index + match[0].length;
        }
    }
    
    if (lastIndex < text.length) {
        parts.push(text.slice(lastIndex));
    }
    
    return parts.length > 0 ? parts : [text];
};

const parseFilePaths = (text: string | React.ReactNode): React.ReactNode => {
    if (typeof text !== 'string') return text;
    return text;
};

const UserTextPart: React.FC<UserTextPartProps> = ({ part, messageId, agentMention }) => {
    const partWithText = part as PartWithText;
    const rawText = partWithText.text;
    const textContent = typeof rawText === 'string' ? rawText : partWithText.content || partWithText.value || '';

    const [isExpanded, setIsExpanded] = React.useState(false);
    const [isTruncated, setIsTruncated] = React.useState(false);
    const textRef = React.useRef<HTMLDivElement>(null);

    React.useEffect(() => {
        const el = textRef.current;
        if (!el || isExpanded) return;

        const checkTruncation = () => {
            setIsTruncated(el.scrollHeight > el.clientHeight);
        };

        checkTruncation();

        const resizeObserver = new ResizeObserver(checkTruncation);
        resizeObserver.observe(el);

        return () => resizeObserver.disconnect();
    }, [isExpanded]);

    const handleClick = React.useCallback(() => {
        if (isTruncated || isExpanded) {
            setIsExpanded((prev) => !prev);
        }
    }, [isTruncated, isExpanded]);

    const handleKeyDown = React.useCallback((e: React.KeyboardEvent) => {
        if ((e.key === 'Enter' || e.key === ' ') && (isTruncated || isExpanded)) {
            e.preventDefault();
            setIsExpanded((prev) => !prev);
        }
    }, [isTruncated, isExpanded]);

    if (!textContent || textContent.trim().length === 0) {
        return null;
    }

    // Render content with optional agent mention link
    const renderContent = () => {
        if (!agentMention?.token || !textContent.includes(agentMention.token)) {
            const codeSegments = parseInlineCode(textContent);
            return codeSegments.map((segment, idx) => {
                const key = typeof segment === 'string' 
                    ? `seg-${idx}-${segment.slice(0, 20)}` 
                    : `seg-${idx}`;
                return (
                    <React.Fragment key={key}>
                        {parseFilePaths(segment)}
                    </React.Fragment>
                );
            });
        }
        const idx = textContent.indexOf(agentMention.token);
        const before = textContent.slice(0, idx);
        const after = textContent.slice(idx + agentMention.token.length);
        
        const beforeSegments = parseInlineCode(before);
        const afterSegments = parseInlineCode(after);
        
        return (
            <>
                {beforeSegments.map((segment, idx) => {
                    const key = typeof segment === 'string'
                        ? `before-${idx}-${segment.slice(0, 20)}`
                        : `before-${idx}`;
                    return (
                        <React.Fragment key={key}>
                            {parseFilePaths(segment)}
                        </React.Fragment>
                    );
                })}
                <a
                    href={buildMentionUrl(agentMention.name)}
                    className="text-[var(--vscode-textLink-foreground,hsl(var(--primary)))] hover:underline"
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={(e) => e.stopPropagation()}
                >
                    {agentMention.token}
                </a>
                {afterSegments.map((segment, idx) => {
                    const key = typeof segment === 'string'
                        ? `after-${idx}-${segment.slice(0, 20)}`
                        : `after-${idx}`;
                    return (
                        <React.Fragment key={key}>
                            {parseFilePaths(segment)}
                        </React.Fragment>
                    );
                })}
            </>
        );
    };

    const isInteractive = isTruncated || isExpanded;

    return (
        <div
            className={cn(
                "break-words whitespace-pre-wrap font-sans typography-markdown",
                !isExpanded && "line-clamp-3",
                isInteractive && "cursor-pointer"
            )}
            ref={textRef}
            {...(isInteractive && {
                onClick: handleClick,
                onKeyDown: handleKeyDown,
                role: "button",
                tabIndex: 0,
                "aria-label": isExpanded ? "Collapse text" : "Expand text"
            })}
            key={part.id || `${messageId}-user-text`}
        >
            {renderContent()}
        </div>
    );
};

export default React.memo(UserTextPart);
