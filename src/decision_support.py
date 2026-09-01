"""
Environmental Decision Support Module.
Provides contamination assessment, risk scoring, trend analysis, and report generation.
All outputs are derived from actual detection results — no guessed or overclaimed values.
"""

import os
import sys
import json
import numpy as np
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
from datetime import datetime

# Add project root to path
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
import src.config as config


def get_contamination_level(particle_count: int) -> str:
    """Determine contamination level based on particle count."""
    for level, (min_val, max_val) in config.CONTAMINATION_THRESHOLDS.items():
        if min_val <= particle_count <= max_val:
            return level
    return "Unknown"


def calculate_risk_score(particle_count: int, size_classification: dict, density_metric: float) -> float:
    """
    Calculate a multi-factor risk score (0-100).

    Args:
        particle_count: Total detected particles
        size_classification: Dict with small_count, medium_count, large_count
        density_metric: Percentage of mask area covered by particles
    """
    # Normalize particle count (assume 200 is very high)
    norm_count = min(particle_count / 200.0, 1.0)

    # Normalize size distribution (larger particles = higher risk)
    total = sum(size_classification.values())
    if total > 0:
        size_factor = (
            size_classification.get('large_count', 0) * 1.0
            + size_classification.get('medium_count', 0) * 0.5
            + size_classification.get('small_count', 0) * 0.1
        ) / total
    else:
        size_factor = 0.0

    # Normalize density (assume 10.0 is very high)
    norm_density = min(density_metric / 10.0, 1.0)

    score = (
        norm_count * config.RISK_WEIGHTS['particle_count']
        + size_factor * config.RISK_WEIGHTS['size_distribution']
        + norm_density * config.RISK_WEIGHTS['density']
    ) * 100

    return min(max(score, 0), 100)


def analyze_trends(history_file: str) -> dict:
    """Analyze trend from a JSON history file of previous samples."""
    if not os.path.exists(history_file):
        return {"status": "No history available"}

    try:
        with open(history_file, 'r') as f:
            history = json.load(f)

        if len(history) < 2:
            return {"status": "Insufficient data for trend analysis"}

        counts = [entry.get('particle_count', 0) for entry in history]
        if counts[-1] > counts[0]:
            trend = "Increasing"
        elif counts[-1] < counts[0]:
            trend = "Decreasing"
        else:
            trend = "Stable"

        return {
            "status": "Success",
            "trend": trend,
            "recent_counts": counts[-5:],
        }
    except Exception as e:
        return {"status": f"Error analyzing trends: {str(e)}"}


def generate_contamination_map(locations: list, output_path: str):
    """
    Generate a matplotlib figure mapping contamination levels by GPS coordinates.

    Args:
        locations: List of dicts with 'lat', 'lon', 'level' keys
        output_path: Path to save the figure
    """
    if not locations:
        print("No GPS locations provided for mapping.")
        return

    plt.figure(figsize=(10, 8))
    color_map = {'Low': '#10b981', 'Moderate': '#f59e0b', 'High': '#f97316', 'Critical': '#ef4444'}

    for loc in locations:
        lat = loc.get('lat')
        lon = loc.get('lon')
        level = loc.get('level', 'Low')

        if lat is not None and lon is not None:
            plt.scatter(
                lon, lat,
                c=color_map.get(level, 'gray'),
                s=150, edgecolor='white', linewidths=0.5,
                label=level if level not in plt.gca().get_legend_handles_labels()[1] else "",
                zorder=5,
            )

    plt.xlabel('Longitude')
    plt.ylabel('Latitude')
    plt.title('Microplastic Contamination Map')

    handles, labels = plt.gca().get_legend_handles_labels()
    by_label = dict(zip(labels, handles))
    if by_label:
        plt.legend(by_label.values(), by_label.keys(), title="Contamination Level")

    plt.grid(True, linestyle='--', alpha=0.3)
    plt.savefig(output_path, dpi=300, bbox_inches='tight')
    plt.close()


def identify_hotspots(locations: list, threshold_distance: float = 0.01) -> list:
    """Simple distance-based clustering to find hotspots among High/Critical locations."""
    high_risk = [loc for loc in locations if loc.get('level') in ['High', 'Critical']]
    if not high_risk:
        return []

    hotspots = []
    used = set()
    for i, loc1 in enumerate(high_risk):
        if i in used:
            continue
        cluster = [loc1]
        used.add(i)

        for j, loc2 in enumerate(high_risk):
            if j not in used:
                dist = np.sqrt(
                    (loc1['lat'] - loc2['lat']) ** 2 + (loc1['lon'] - loc2['lon']) ** 2
                )
                if dist < threshold_distance:
                    cluster.append(loc2)
                    used.add(j)

        if len(cluster) > 1:
            avg_lat = sum(l['lat'] for l in cluster) / len(cluster)
            avg_lon = sum(l['lon'] for l in cluster) / len(cluster)
            hotspots.append({
                "lat": avg_lat,
                "lon": avg_lon,
                "num_locations": len(cluster),
            })

    return hotspots


def suggest_pollution_sources(quantification_results: dict) -> list:
    """Rule-based heuristics for pollution source identification."""
    sources = []
    small = quantification_results['size_classification']['small_count']
    medium = quantification_results['size_classification']['medium_count']
    large = quantification_results['size_classification']['large_count']
    total = quantification_results['overall_stats']['total_count']

    if total == 0:
        return ["No particles detected — no pollution sources identified."]

    if total > 0 and small / total > 0.7:
        sources.append(
            "High proportion of small fragments suggests degraded secondary microplastics, "
            "possibly from prolonged environmental exposure or UV degradation."
        )

    if total > 0 and large / total > 0.4:
        sources.append(
            "Significant presence of large particles suggests recent primary pollution "
            "or proximity to a direct emission source (e.g., industrial discharge)."
        )

    if total > 0 and medium / total > 0.5:
        sources.append(
            "Predominance of medium-sized fragments may indicate intermediate degradation "
            "from consumer plastic waste."
        )

    return sources if sources else ["General diffuse pollution from multiple sources suspected."]


def generate_recommendations(level: str, risk_score: float) -> list:
    """Generate stakeholder-specific recommendations based on contamination level."""
    recs = []
    if risk_score > 75 or level == "Critical":
        recs.append("IMMEDIATE ACTION: Alert local environmental regulators.")
        recs.append("Conduct comprehensive sampling in the surrounding 5km radius.")
        recs.append("Investigate potential point sources (industrial discharge, wastewater treatment plants).")
    elif risk_score > 50 or level == "High":
        recs.append("Schedule follow-up sampling within 30 days.")
        recs.append("Review local waste management practices and potential runoff sources.")
    elif level == "Moderate":
        recs.append("Maintain regular monitoring schedule.")
        recs.append("Consider community awareness programs for plastic waste reduction.")
    else:
        recs.append("Contamination is within baseline levels. Continue standard periodic monitoring.")

    return recs


def generate_report(
    quantification_results: dict,
    sample_id: str = "unknown",
    locations: list = None,
    model_used: str = None,
    features: dict = None,
) -> str:
    """Generate a comprehensive markdown environmental report."""
    config.create_output_dirs()

    total_count = quantification_results['overall_stats']['total_count']
    level = get_contamination_level(total_count)

    # Density metric: percentage of 256x256 frame covered
    density_metric = (quantification_results['overall_stats']['total_area'] / (config.IMG_SIZE ** 2)) * 100
    risk_score = calculate_risk_score(total_count, quantification_results['size_classification'], density_metric)

    sources = suggest_pollution_sources(quantification_results)
    recommendations = generate_recommendations(level, risk_score)

    report = f"# Microplastic Contamination Report\n"
    report += f"**Sample ID:** {sample_id}\n"
    report += f"**Date:** {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}\n\n"

    report += f"## 1. Executive Summary\n"
    report += f"- **Contamination Level:** {level}\n"
    report += f"- **Risk Assessment Score:** {risk_score:.2f} / 100\n"
    report += f"- **Total Particles Detected:** {total_count}\n"
    if model_used:
        report += f"- **Segmentation Model Used (IMSE):** {model_used}\n"
    report += "\n"

    if features:
        report += f"## 2. Image Quality Assessment\n"
        report += f"| Feature | Value |\n|---------|-------|\n"
        for k, v in features.items():
            report += f"| {k.replace('_', ' ').title()} | {v:.4f} |\n"
        report += "\n"

    report += f"## 3. Quantification Results\n"
    report += f"- **Total Area:** {quantification_results['overall_stats']['total_area']:.2f} px²\n"
    report += f"- **Mean Particle Area:** {quantification_results['overall_stats']['mean_particle_area']:.2f} px²\n"
    report += f"- **Median Particle Area:** {quantification_results['overall_stats']['median_particle_area']:.2f} px²\n"

    sizes = quantification_results['size_classification']
    report += f"- **Size Distribution:**\n"
    report += f"  - Small (<100px²): {sizes['small_count']}\n"
    report += f"  - Medium (100-500px²): {sizes['medium_count']}\n"
    report += f"  - Large (>500px²): {sizes['large_count']}\n\n"

    report += f"## 4. Environmental Analysis\n"
    report += f"### Potential Pollution Sources\n"
    for s in sources:
        report += f"- {s}\n"

    report += f"\n### Stakeholder Recommendations\n"
    for r in recommendations:
        report += f"- {r}\n"

    if locations:
        report += f"\n## 5. Geospatial Analysis\n"
        hotspots = identify_hotspots(locations)
        if hotspots:
            report += f"Identified {len(hotspots)} potential hotspot(s).\n"
            for hs in hotspots:
                report += f"  - Hotspot at ({hs['lat']:.4f}, {hs['lon']:.4f}) covering {hs['num_locations']} sampling points\n"
        else:
            report += "No specific geographic hotspots identified from current data.\n"
    else:
        report += "\n## 5. Geospatial Analysis\n"
        report += "GPS coordinates not available for this sample. Geospatial analysis requires location data.\n"

    report_path = os.path.join(config.REPORTS_DIR, f"report_{sample_id}.md")
    with open(report_path, 'w', encoding='utf-8') as f:
        f.write(report)

    # Update index.json in REPORTS_DIR so dashboard can discover reports
    try:
        index_path = os.path.join(config.REPORTS_DIR, "index.json")
        reports_list = []
        if os.path.exists(index_path):
            try:
                with open(index_path, 'r', encoding='utf-8') as f:
                    reports_list = json.load(f)
            except Exception:
                reports_list = []

        fname = f"report_{sample_id}.md"
        # Remove existing if present to update
        reports_list = [r for r in reports_list if r.get('name') != fname]
        reports_list.insert(0, {
            'name': fname,
            'sample_id': sample_id,
            'date': datetime.now().strftime('%Y-%m-%d %H:%M:%S'),
            'content': report
        })

        with open(index_path, 'w', encoding='utf-8') as f:
            json.dump(reports_list, f, indent=2)
    except Exception as e:
        print(f"Warning: Could not update reports index.json: {e}")

    print(f"Report saved to {report_path}")
    return report_path


if __name__ == "__main__":
    print("Decision support module ready.")
