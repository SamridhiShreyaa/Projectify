import { useEffect, useRef, useState } from 'react';
import mermaid from 'mermaid';

mermaid.initialize({ startOnLoad: false, theme: 'dark' });

let renderCounter = 0;

const MermaidDiagram = ({ chart }) => {
    const containerRef = useRef(null);
    const [error, setError] = useState(false);

    useEffect(() => {
        if (!chart || !containerRef.current) return;
        let cancelled = false;
        const id = `mermaid-diagram-${renderCounter++}`;

        mermaid.render(id, chart)
            .then(({ svg }) => {
                if (!cancelled && containerRef.current) {
                    containerRef.current.innerHTML = svg;
                }
            })
            .catch(() => {
                if (!cancelled) setError(true);
            });

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
