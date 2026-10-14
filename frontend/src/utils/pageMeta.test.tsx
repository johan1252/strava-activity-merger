import React, { act } from 'react';
import { createRoot, Root } from 'react-dom/client';
import { usePageMeta } from './pageMeta';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const Page: React.FC<{ noindex?: boolean; jsonLd?: object }> = ({ noindex, jsonLd }) => {
    usePageMeta({ title: 'FAQ | Streven', description: 'Answers.', path: '/faq', noindex, jsonLd });
    return null;
};

function setHost(hostname: string) {
    Object.defineProperty(window, 'location', { value: { hostname }, writable: true, configurable: true });
}

const meta = (selector: string) => document.head.querySelector(selector)?.getAttribute('content');

describe('usePageMeta', () => {
    let container: HTMLDivElement;
    let root: Root;

    const render = (element: React.ReactElement) => act(() => { root.render(element); });

    beforeEach(() => {
        container = document.createElement('div');
        root = createRoot(container);
        document.head.innerHTML = '';
    });

    afterEach(() => {
        act(() => root.unmount());
    });

    it('sets the title, description, canonical URL and social tags on the production host', () => {
        setHost('streventools.com');

        render(<Page />);

        expect(document.title).toBe('FAQ | Streven');
        expect(meta('meta[name="description"]')).toBe('Answers.');
        expect(document.head.querySelector('link[rel="canonical"]')?.getAttribute('href')).toBe('https://streventools.com/faq');
        expect(meta('meta[property="og:url"]')).toBe('https://streventools.com/faq');
        expect(meta('meta[property="og:title"]')).toBe('FAQ | Streven');
        expect(meta('meta[name="robots"]')).toBe('index, follow, max-image-preview:large');
    });

    it('marks any other host noindex, so staging never competes with the real site', () => {
        setHost('staging.streventools.com');

        render(<Page />);

        expect(meta('meta[name="robots"]')).toBe('noindex, nofollow');
        expect(document.head.querySelector('link[rel="canonical"]')?.getAttribute('href')).toBe('https://streventools.com/faq');
    });

    it('marks a page noindex when asked, even on the production host', () => {
        setHost('streventools.com');

        render(<Page noindex />);

        expect(meta('meta[name="robots"]')).toBe('noindex, nofollow');
    });

    it('adds the page structured data and removes it when the page goes away', () => {
        setHost('streventools.com');

        render(<Page jsonLd={{ '@type': 'FAQPage' }} />);
        expect(document.head.querySelector('script[data-page-meta]')?.textContent).toBe('{"@type":"FAQPage"}');

        act(() => root.render(<div />));
        expect(document.head.querySelector('script[data-page-meta]')).toBeNull();
    });
});
