import os
import cv2
import numpy as np
import shutil
from tqdm import tqdm
import sys

# Add project root to path
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
import src.config as config

np.random.seed(config.RANDOM_SEED)

def apply_blur(image, k):
    return cv2.GaussianBlur(image, (k, k), 0)

def apply_brightness(image, factor):
    hsv = cv2.cvtColor(image, cv2.COLOR_BGR2HSV).astype(np.float32)
    hsv[:, :, 2] = hsv[:, :, 2] * factor
    hsv[:, :, 2] = np.clip(hsv[:, :, 2], 0, 255)
    return cv2.cvtColor(hsv.astype(np.uint8), cv2.COLOR_HSV2BGR)

def apply_gamma(image, gamma):
    invGamma = 1.0 / gamma
    table = np.array([((i / 255.0) ** invGamma) * 255 for i in np.arange(0, 256)]).astype("uint8")
    return cv2.LUT(image, table)

def apply_noise(image, sigma):
    row, col, ch = image.shape
    gauss = np.random.normal(0, sigma, (row, col, ch))
    noisy = image + gauss
    return np.clip(noisy, 0, 255).astype(np.uint8)

def save_augmented(img, mask_path, base_stem, suffix, out_img_dir, out_mask_dir):
    """Saves augmented image and copies original mask."""
    out_img_name = f"{base_stem}_{suffix}.png"
    out_mask_name = f"{base_stem}_{suffix}.png"
    
    cv2.imwrite(os.path.join(out_img_dir, out_img_name), img)
    shutil.copy(mask_path, os.path.join(out_mask_dir, out_mask_name))

def generate_augmentations(image_dir, mask_dir, out_img_dir, out_mask_dir, aug_config):
    valid_exts = ['.jpg', '.jpeg', '.png']
    
    files = [f for f in os.listdir(image_dir) if any(f.lower().endswith(ext) for ext in valid_exts)]
    
    print(f"Generating augmented data in {out_img_dir}...")
    for filename in tqdm(files):
        img_path = os.path.join(image_dir, filename)
        mask_fname = os.path.splitext(filename)[0] + '.png'
        mask_path = os.path.join(mask_dir, mask_fname)
        
        if not os.path.exists(mask_path):
            continue
            
        img = cv2.imread(img_path)
        if img is None:
            continue
            
        stem = os.path.splitext(filename)[0]
        
        # 1. Blur
        for k in aug_config['blur_kernels']:
            aug = apply_blur(img, k)
            save_augmented(aug, mask_path, stem, f"blur{k}", out_img_dir, out_mask_dir)
            
        # 2. Brightness
        for f in aug_config['brightness_factors']:
            aug = apply_brightness(img, f)
            save_augmented(aug, mask_path, stem, f"bright{f}", out_img_dir, out_mask_dir)
            
        # 3. Contrast (Gamma)
        for g in aug_config['gamma_values']:
            aug = apply_gamma(img, g)
            save_augmented(aug, mask_path, stem, f"gamma{g}", out_img_dir, out_mask_dir)
            
        # 4. Noise
        for s in aug_config['noise_sigmas']:
            aug = apply_noise(img, s)
            save_augmented(aug, mask_path, stem, f"noise{s}", out_img_dir, out_mask_dir)
            
        # 5. Combined
        for i in range(aug_config['num_combined_per_image']):
            aug = img.copy()
            # Randomly pick operations
            if np.random.rand() > 0.5:
                k = np.random.choice(aug_config['blur_kernels'])
                aug = apply_blur(aug, k)
            if np.random.rand() > 0.5:
                f = np.random.choice(aug_config['brightness_factors'])
                aug = apply_brightness(aug, f)
            if np.random.rand() > 0.5:
                g = np.random.choice(aug_config['gamma_values'])
                aug = apply_gamma(aug, g)
            if np.random.rand() > 0.5:
                s = np.random.choice(aug_config['noise_sigmas'])
                aug = apply_noise(aug, s)
                
            save_augmented(aug, mask_path, stem, f"combo{i}", out_img_dir, out_mask_dir)

def main():
    config.create_output_dirs()
    
    print("--- Augmenting Training Data ---")
    generate_augmentations(
        config.TRAIN_DIR, 
        config.TRAIN_MASKS_DIR,
        config.AUGMENTED_IMAGES_DIR, 
        config.AUGMENTED_MASKS_DIR,
        config.AUGMENTATION_CONFIG
    )
    
    print("--- Augmenting Validation Data ---")
    generate_augmentations(
        config.VALID_DIR, 
        config.VALID_MASKS_DIR,
        config.AUGMENTED_IMAGES_DIR, 
        config.AUGMENTED_MASKS_DIR,
        config.AUGMENTATION_CONFIG
    )
    
    print("Augmentation complete!")

if __name__ == "__main__":
    main()
