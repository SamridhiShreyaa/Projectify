const Milestone = ({ milestone, index }) => {
    // Parse milestone text — usually formatted like "Week N: description"
    const parts = milestone.split(':');
    const title = parts[0]?.trim() || `Stage ${index + 1}`;
    const description = parts.slice(1).join(':').trim() || milestone;

    return (
        <div className="milestone fade-in" style={{ animationDelay: `${index * 0.08}s` }}>
            <div className="milestone-number">
                {index + 1}
            </div>
            <div className="milestone-content">
                <div className="milestone-title">📍 {title}</div>
                <div className="milestone-desc">{description}</div>
            </div>
        </div>
    );
};

export default Milestone;
