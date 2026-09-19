import { strict as A } from 'assert';
import * as cheerio from 'cheerio';
import { DEFAULT_INDEX_HTML } from '../src/default_index_html';

// Executes the page script against stubs and returns the config the line chart
// was built with. The sibling spec only parses the script; this runs it, which
// is what catches undefined references and misplaced Chart.js options.
function renderWithEntries(entries: any[]): { config: any; opened: () => string | null } {
    const q = cheerio.load(DEFAULT_INDEX_HTML);
    const src = q('#main-script').html() as string;

    const configs: any[] = [];
    function Chart(this: unknown, _canvas: unknown, config: unknown) {
        configs.push(config);
    }
    (Chart as any).register = () => undefined;

    const el = (): any => ({
        style: {},
        className: '',
        href: '',
        textContent: '',
        onclick: null,
        appendChild: () => undefined,
        setAttribute: () => undefined,
        getContext: () => ({}),
        click: () => undefined,
    });
    const document = { createElement: el, getElementById: () => el(), body: el() };

    let opened: string | null = null;
    const window = {
        location: { pathname: '/' },
        addEventListener: () => undefined,
        open: (url: string) => {
            opened = url;
        },
        BENCHMARK_DATA: { lastUpdate: 0, repoUrl: 'https://github.com/o/r', entries: { 'Redis PING': entries } },
    };

    // eslint-disable-next-line no-new-func
    new Function('Chart', 'document', 'window', src)(Chart, document, window);

    const config = configs.find((c) => c.type === 'line');
    A.ok(config, 'no line chart was rendered');
    return { config, opened: () => opened };
}

function entry(i: number, releaseUrl?: string) {
    return {
        commit: {
            id: `abcdef${String(i).padStart(2, '0')}00000`,
            message: `commit ${i}`,
            timestamp: '2026-09-21T10:00:00Z',
            committer: { username: 'gvipat' },
            url: `https://github.com/o/r/commit/abcdef${i}`,
        },
        date: 0,
        tool: 'customBiggerIsBetter',
        title: 'Redis PING',
        display: true,
        benches: [
            { name: 'RPS on Linux', value: 1000 + i, unit: 'requests per second', extra: 'linux_result' },
            {
                name: 'RPS on Asterinas',
                value: 2000 + i,
                unit: 'requests per second',
                range: '± 12',
                extra: 'aster_result',
            },
        ],
        ...(releaseUrl ? { releaseUrl } : {}),
    };
}

const RELEASE = 'https://github.com/o/r/releases/tag/run-20260921-110000';

// Chart.js hands tooltip callbacks a TooltipItem (point index in `dataIndex`) but
// onClick an ActiveElement (point index in `index`), so the two are built separately.
const ctx = (dataIndex: number, formattedValue: string) => ({
    datasetIndex: 1,
    dataIndex,
    dataset: { label: 'RPS on Asterinas' },
    formattedValue,
});
const activeElem = (index: number) => ({ element: {}, datasetIndex: 1, index });

describe('benchmark chart tooltip', function () {
    // 65 entries so the chart's .slice(-60) is exercised
    const entries = Array.from({ length: 65 }, (_, i) => entry(i, i === 64 ? RELEASE : undefined));

    it('registers callbacks where Chart.js v3+ reads them', function () {
        const { config } = renderWithEntries(entries);
        A.ok(config.options.plugins?.tooltip?.callbacks, 'callbacks must live under options.plugins.tooltip');
    });

    it('shows commit, unit and range', function () {
        const { config } = renderWithEntries(entries);
        const cb = config.options.plugins.tooltip.callbacks;
        const title = cb.afterTitle([ctx(59, '2,064')]);
        A.ok(title.includes('commit 64'), title);
        A.ok(title.includes('committed by @gvipat'), title);
        A.equal(cb.label(ctx(59, '2,064')), 'RPS on Asterinas: 2,064 requests per second (± 12)');
    });

    it('keeps point lookup aligned with the sliced chart data', function () {
        const { config } = renderWithEntries(entries);
        const cb = config.options.plugins.tooltip.callbacks;
        // 65 entries sliced to the last 60, so dataIndex 0 is entry 5
        A.ok(cb.afterTitle([ctx(0, '2,005')]).includes('commit 5'));
    });

    it('shows the release only for points that have one', function () {
        const { config } = renderWithEntries(entries);
        const cb = config.options.plugins.tooltip.callbacks;
        A.ok(cb.afterLabel(ctx(59, '2,064')).includes(`release: ${RELEASE}`));
        A.equal(cb.afterLabel(ctx(0, '2,005')).includes('release:'), false);
    });

    it('opens the release on click, falling back to the commit', function () {
        const { config, opened } = renderWithEntries(entries);
        config.options.onClick(null, [activeElem(59)]);
        A.equal(opened(), RELEASE);
        config.options.onClick(null, [activeElem(0)]);
        A.equal(opened(), 'https://github.com/o/r/commit/abcdef5');
    });
});
