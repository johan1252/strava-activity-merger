import React, { useEffect, useRef, useState } from 'react';

export interface TrainingPlanChatMessage {
    role: 'user' | 'assistant';
    content: string;
    at: number;
}

const MAX_MESSAGE_LENGTH = 1000;
const MOBILE_QUERY = '(max-width: 768px)';

const SUGGESTIONS = [
    'Add days of the week to every session',
    'I only want to run 3 times a week',
    'Add some weight lifting',
    'Add swimming as well',
    'Make the plan a bit easier',
];

interface TrainingPlanChatProps {
    messages: TrainingPlanChatMessage[];
    isBusy: boolean;
    error: string | null;
    onSend: (message: string) => void;
}

const bubbleStyle = (role: TrainingPlanChatMessage['role']): React.CSSProperties => ({
    alignSelf: role === 'user' ? 'flex-end' : 'flex-start',
    maxWidth: '85%',
    padding: '8px 12px',
    borderRadius: role === 'user' ? '14px 14px 2px 14px' : '14px 14px 14px 2px',
    background: role === 'user' ? '#FC4C02' : '#f3f3f3',
    color: role === 'user' ? '#fff' : '#333',
    fontSize: '0.9rem',
    lineHeight: 1.4,
    whiteSpace: 'pre-wrap',
    overflowWrap: 'anywhere',
});

function useIsMobile(): boolean {
    const [isMobile, setIsMobile] = useState(() => window.matchMedia(MOBILE_QUERY).matches);

    useEffect(() => {
        const query = window.matchMedia(MOBILE_QUERY);
        const update = () => setIsMobile(query.matches);
        update();
        query.addEventListener('change', update);
        return () => query.removeEventListener('change', update);
    }, []);

    return isMobile;
}

const ChatBody: React.FC<TrainingPlanChatProps & { isMobile: boolean }> = ({ messages, isBusy, error, onSend, isMobile }) => {
    const [draft, setDraft] = useState('');
    const threadRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const thread = threadRef.current;
        if (thread) thread.scrollTop = thread.scrollHeight;
    }, [messages.length, isBusy]);

    const send = (text: string) => {
        const message = text.trim();
        if (!message || isBusy) return;
        onSend(message);
        setDraft('');
    };

    return (
        <>
            <div ref={threadRef} style={{ flex: 1, overflowY: 'auto', padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {messages.length === 0 && (
                    <div style={{ color: '#888', fontSize: '0.85rem' }}>
                        For example, you can ask to run fewer days, add weights or swimming, or make a week easier.
                    </div>
                )}
                {messages.map((m, i) => (
                    <div key={`${m.at}-${i}`} style={bubbleStyle(m.role)}>{m.content}</div>
                ))}
                {isBusy && (
                    <div style={{ ...bubbleStyle('assistant'), color: '#888', fontStyle: 'italic' }}>Thinking…</div>
                )}
            </div>

            {messages.length === 0 && !isBusy && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', padding: '0 16px 10px' }}>
                    {SUGGESTIONS.map(s => (
                        <button
                            key={s}
                            type="button"
                            onClick={() => send(s)}
                            style={{
                                border: '1px solid #ffd9c2',
                                background: '#fff7f2',
                                color: '#FC4C02',
                                borderRadius: '14px',
                                padding: '4px 10px',
                                fontSize: '0.8rem',
                                fontWeight: 600,
                                cursor: 'pointer',
                            }}
                        >
                            {s}
                        </button>
                    ))}
                </div>
            )}

            {error && <div style={{ color: '#a33', fontSize: '0.8rem', padding: '0 16px 8px' }}>{error}</div>}

            <form
                onSubmit={e => { e.preventDefault(); send(draft); }}
                style={{ display: 'flex', gap: '8px', padding: '10px 16px 14px', borderTop: '1px solid #eee' }}
            >
                <textarea
                    value={draft}
                    onChange={e => setDraft(e.target.value)}
                    onKeyDown={e => {
                        if (e.key === 'Enter' && !e.shiftKey) {
                            e.preventDefault();
                            send(draft);
                        }
                    }}
                    maxLength={MAX_MESSAGE_LENGTH}
                    rows={2}
                    disabled={isBusy}
                    placeholder="e.g. I only want to run 3 times a week"
                    style={{
                        flex: 1,
                        resize: 'none',
                        border: '1px solid #ddd',
                        borderRadius: '8px',
                        padding: '8px 10px',
                        // 16px stops iOS Safari zooming the page when the field is focused
                        fontSize: isMobile ? '16px' : '0.9rem',
                        fontFamily: 'inherit',
                    }}
                />
                <button
                    type="submit"
                    disabled={isBusy || !draft.trim()}
                    style={{
                        alignSelf: 'flex-end',
                        padding: '8px 14px',
                        borderRadius: '8px',
                        border: 'none',
                        background: isBusy || !draft.trim() ? '#f0a878' : '#FC4C02',
                        color: '#fff',
                        fontWeight: 700,
                        cursor: isBusy || !draft.trim() ? 'default' : 'pointer',
                    }}
                >
                    Send
                </button>
            </form>
        </>
    );
};

const panelHeader = (onClose?: () => void) => (
    <div style={{ padding: '14px 16px 10px', borderBottom: '1px solid #eee', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '8px' }}>
        <div>
            <div style={{ fontWeight: 700, fontSize: '1rem' }}>Adjust your plan</div>
            <div style={{ color: '#888', fontSize: '0.8rem', marginTop: '2px' }}>
                Tell your coach what to change. Past weeks stay as they are.
            </div>
        </div>
        {onClose && (
            <button
                type="button"
                onClick={onClose}
                aria-label="Close chat"
                style={{ background: 'none', border: 'none', fontSize: '1.2rem', lineHeight: 1, color: '#888', cursor: 'pointer', padding: '2px 4px' }}
            >
                ✕
            </button>
        )}
    </div>
);

const cardShadow = '0 2px 8px rgba(0,0,0,0.07)';

const TrainingPlanChat: React.FC<TrainingPlanChatProps> = props => {
    const isMobile = useIsMobile();
    const [open, setOpen] = useState(false);
    const [seenCount, setSeenCount] = useState(props.messages.length);

    // The panel counts as read while open; a reply that arrives while it's closed shows a dot.
    useEffect(() => {
        if (open) setSeenCount(props.messages.length);
    }, [open, props.messages.length]);

    useEffect(() => {
        if (!open) return;
        const onKeyDown = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
        window.addEventListener('keydown', onKeyDown);
        return () => window.removeEventListener('keydown', onKeyDown);
    }, [open]);

    if (!isMobile) {
        return (
            <div
                style={{
                    flex: '0 1 340px',
                    minWidth: '280px',
                    position: 'sticky',
                    top: '16px',
                    background: '#fff',
                    borderRadius: '10px',
                    boxShadow: cardShadow,
                    display: 'flex',
                    flexDirection: 'column',
                    maxHeight: 'calc(100vh - 100px)',
                    minHeight: '360px',
                }}
            >
                {panelHeader()}
                <ChatBody {...props} isMobile={false} />
            </div>
        );
    }

    const unread = !open && props.messages.length > seenCount;

    return (
        <>
            {/* Keeps the last plan card clear of the floating button */}
            <div style={{ width: '100%', height: '72px' }} />

            {open ? (
                <div
                    role="dialog"
                    aria-label="Adjust your plan"
                    style={{
                        position: 'fixed',
                        left: '12px',
                        right: '12px',
                        bottom: 'calc(12px + env(safe-area-inset-bottom))',
                        height: 'min(70vh, 520px)',
                        zIndex: 1000,
                        background: '#fff',
                        borderRadius: '14px',
                        boxShadow: '0 6px 24px rgba(0,0,0,0.25)',
                        display: 'flex',
                        flexDirection: 'column',
                        overflow: 'hidden',
                    }}
                >
                    {panelHeader(() => setOpen(false))}
                    <ChatBody {...props} isMobile />
                </div>
            ) : (
                <button
                    type="button"
                    onClick={() => setOpen(true)}
                    aria-label="Open plan chat"
                    style={{
                        position: 'fixed',
                        right: '16px',
                        bottom: 'calc(16px + env(safe-area-inset-bottom))',
                        zIndex: 1000,
                        width: '56px',
                        height: '56px',
                        borderRadius: '50%',
                        border: 'none',
                        background: '#FC4C02',
                        color: '#fff',
                        fontSize: '1.5rem',
                        cursor: 'pointer',
                        boxShadow: '0 4px 14px rgba(0,0,0,0.3)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                    }}
                >
                    <span aria-hidden="true">{props.isBusy ? '…' : '💬'}</span>
                    {unread && (
                        <span
                            style={{
                                position: 'absolute',
                                top: '2px',
                                right: '2px',
                                width: '14px',
                                height: '14px',
                                borderRadius: '50%',
                                background: '#2e7d32',
                                border: '2px solid #fff',
                            }}
                        />
                    )}
                </button>
            )}
        </>
    );
};

export default TrainingPlanChat;
