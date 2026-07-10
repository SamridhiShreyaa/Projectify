import { useEffect, useRef, useState } from 'react';
import mermaid from 'mermaid';

// suppressErrorRendering stops Mermaid from injecting its own "Syntax error"
// bomb SVG into the DOM when a diagram fails to parse — we handle failures
// ourselves and fall back to the raw text instead.
mermaid.initialize({ startOnLoad: false, theme: 'dark', suppressErrorRendering: true });

let renderCounter = 0;

const MermaidDiagram = ({ chart }) => {
    const containerRef = useRef(null);
    const [error, setError] = useState(false);

    useEffect(() => {
        if (!chart || !containerRef.current) return;
        let cancelled = false;
        setError(false);
        const id = `mermaid-diagram-${renderCounter++}`;

        // Validate first so a bad diagram never reaches render() (which would
        // otherwise leave an orphan error node in the DOM).
        (async () => {
            try {
                await mermaid.parse(chart);
                const { svg } = await mermaid.render(id, chart);
                if (!cancelled && containerRef.current) {
                    containerRef.current.innerHTML = svg;
                }
            } catch {
                if (!cancelled) setError(true);
            }
        })();

        return () => { cancelled = true; };
    }, [chart]);

    if (!chart) return null;
    if (error) {
        // Fall back to showing the raw diagram text if it doesn't parse
        return <div className="file-structure-block">{chart}</div>;
    }
    return <div ref={containerRef} style={{ overflowX: 'auto' }} />;
};

export default MermaidDiagram;
