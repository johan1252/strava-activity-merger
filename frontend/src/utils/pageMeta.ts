import { useEffect } from 'react';

const PRODUCTION_HOST = 'streventools.com';
const SITE_URL = `https://${PRODUCTION_HOST}`;

interface PageMeta {
    title: string;
    description: string;
    path: string; // e.g. '/faq'
    noindex?: boolean;
    jsonLd?: object; // extra structured data for this page
}

function setMeta(selector: string, attribute: 'name' | 'property', key: string, content: string) {
    let element = document.head.querySelector<HTMLMetaElement>(selector);
    if (!element) {
        element = document.createElement('meta');
        element.setAttribute(attribute, key);
        document.head.appendChild(element);
    }
    element.setAttribute('content', content);
}

function setCanonical(href: string) {
    let element = document.head.querySelector<HTMLLinkElement>('link[rel="canonical"]');
    if (!element) {
        element = document.createElement('link');
        element.setAttribute('rel', 'canonical');
        document.head.appendChild(element);
    }
    element.setAttribute('href', href);
}

// Sets the title, description, canonical URL and social tags for the current page. Search engines
// that run JavaScript read these per route; the static tags in index.html cover the home page.
// Any host other than the production one (staging, previews) is marked noindex so it never
// competes with the real site.
export function usePageMeta({ title, description, path, noindex, jsonLd }: PageMeta) {
    useEffect(() => {
        const url = `${SITE_URL}${path}`;
        const hide = noindex || window.location.hostname !== PRODUCTION_HOST;

        document.title = title;
        setMeta('meta[name="description"]', 'name', 'description', description);
        setMeta('meta[name="robots"]', 'name', 'robots', hide ? 'noindex, nofollow' : 'index, follow, max-image-preview:large');
        setCanonical(url);
        setMeta('meta[property="og:title"]', 'property', 'og:title', title);
        setMeta('meta[property="og:description"]', 'property', 'og:description', description);
        setMeta('meta[property="og:url"]', 'property', 'og:url', url);
        setMeta('meta[name="twitter:title"]', 'name', 'twitter:title', title);
        setMeta('meta[name="twitter:description"]', 'name', 'twitter:description', description);

        let script: HTMLScriptElement | null = null;
        if (jsonLd) {
            script = document.createElement('script');
            script.type = 'application/ld+json';
            script.setAttribute('data-page-meta', 'true');
            script.text = JSON.stringify(jsonLd);
            document.head.appendChild(script);
        }
        return () => {
            script?.remove();
        };
        // jsonLd is a constant per page, so the other fields are the only real dependencies
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [title, description, path, noindex]);
}
