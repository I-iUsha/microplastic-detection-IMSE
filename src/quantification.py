import os
import numpy as np
import cv2

def quantify_particles(mask: np.ndarray) -> dict:
    """
    Quantify microplastic particles from a segmentation mask.
    
    Args:
        mask: 2D numpy array (binary mask, 0 for background, non-zero for particles)
        
    Returns:
        dict: Structured dictionary containing quantification results.
    """
    # Ensure binary format (0 and 255)
    binary_mask = (mask > 0).astype(np.uint8) * 255
    
    # Find connected components
    num_labels, labels, stats, centroids = cv2.connectedComponentsWithStats(
        binary_mask, connectivity=8
    )
    
    particles = []
    total_area = 0
    areas = []
    
    small_count = 0
    medium_count = 0
    large_count = 0
    
    # Note: label 0 is background
    for i in range(1, num_labels):
        x = stats[i, cv2.CC_STAT_LEFT]
        y = stats[i, cv2.CC_STAT_TOP]
        w = stats[i, cv2.CC_STAT_WIDTH]
        h = stats[i, cv2.CC_STAT_HEIGHT]
        area = stats[i, cv2.CC_STAT_AREA]
        
        centroid = centroids[i]
        
        # Equivalent diameter = 2 * sqrt(Area / pi)
        equiv_diameter = 2 * np.sqrt(area / np.pi)
        
        particles.append({
            "id": i,
            "area": float(area),
            "bounding_rect": {"x": int(x), "y": int(y), "w": int(w), "h": int(h)},
            "centroid": {"x": float(centroid[0]), "y": float(centroid[1])},
            "equivalent_diameter": float(equiv_diameter)
        })
        
        total_area += area
        areas.append(area)
        
        # Size classification
        if area < 100:
            small_count += 1
        elif area <= 500:
            medium_count += 1
        else:
            large_count += 1
            
    if len(areas) > 0:
        mean_area = np.mean(areas)
        median_area = np.median(areas)
        max_area = np.max(areas)
        min_area = np.min(areas)
        # Distribution histogram data (10 bins)
        hist, bin_edges = np.histogram(areas, bins=10)
        hist_data = {"counts": hist.tolist(), "bin_edges": bin_edges.tolist()}
    else:
        mean_area = median_area = max_area = min_area = 0.0
        hist_data = {"counts": [], "bin_edges": []}
        
    return {
        "overall_stats": {
            "total_count": num_labels - 1,
            "total_area": float(total_area),
            "mean_particle_area": float(mean_area),
            "median_particle_area": float(median_area),
            "max_particle_area": float(max_area),
            "min_particle_area": float(min_area)
        },
        "size_classification": {
            "small_count": small_count,
            "medium_count": medium_count,
            "large_count": large_count
        },
        "distribution_histogram": hist_data,
        "particles": particles
    }

if __name__ == "__main__":
    # Simple test
    print("Quantification module ready.")
