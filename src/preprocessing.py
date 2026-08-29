import cv2
import numpy as np
import os
import sys

# Add project root to path
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
import src.config as config

def apply_clahe(image):
    """Applies Contrast Limited Adaptive Histogram Equalization."""
    if len(image.shape) == 3:
        # Convert to LAB color space
        lab = cv2.cvtColor(image, cv2.COLOR_BGR2LAB)
        l_channel, a, b = cv2.split(lab)
        
        # Apply CLAHE to L-channel
        clahe = cv2.createCLAHE(clipLimit=config.CLAHE_CLIP_LIMIT, tileGridSize=config.CLAHE_TILE_GRID_SIZE)
        cl = clahe.apply(l_channel)
        
        # Merge back
        limg = cv2.merge((cl, a, b))
        return cv2.cvtColor(limg, cv2.COLOR_LAB2BGR)
    else:
        # Grayscale
        clahe = cv2.createCLAHE(clipLimit=config.CLAHE_CLIP_LIMIT, tileGridSize=config.CLAHE_TILE_GRID_SIZE)
        return clahe.apply(image)

def preprocess_image(image, use_clahe=True, use_blur=False):
    """
    Preprocess image: optional CLAHE, optional blur, resize, normalize.
    """
    # 1. Contrast enhancement (CLAHE)
    if use_clahe:
        image = apply_clahe(image)
        
    # 2. Noise removal
    if use_blur:
        image = cv2.GaussianBlur(image, config.GAUSSIAN_BLUR_KERNEL, 0)
        
    # 3. Resize
    image = cv2.resize(image, (config.IMG_SIZE, config.IMG_SIZE), interpolation=cv2.INTER_LINEAR)
    
    # 4. Normalize to [0, 1]
    image = image.astype(np.float32) / 255.0
    
    return image

def preprocess_mask(mask):
    """
    Preprocess mask: resize and normalize to 0 or 1.
    """
    # Resize using nearest neighbor to keep binary values
    mask = cv2.resize(mask, (config.IMG_SIZE, config.IMG_SIZE), interpolation=cv2.INTER_NEAREST)
    
    # Binarize and cast to float32
    mask = (mask > 127).astype(np.float32)
    
    # Ensure it has channel dimension (H, W, 1)
    mask = np.expand_dims(mask, axis=-1)
    
    return mask

def main():
    print("Preprocessing module functions are ready to use.")
    print(f"Target size: {config.IMG_SIZE}x{config.IMG_SIZE}")
    print(f"CLAHE settings: clipLimit={config.CLAHE_CLIP_LIMIT}, tileSize={config.CLAHE_TILE_GRID_SIZE}")

if __name__ == "__main__":
    main()
