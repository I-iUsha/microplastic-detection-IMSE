import os
import cv2
import numpy as np
import torch
from torch.utils.data import Dataset, DataLoader
import sys

# Add project root to path
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
import src.config as config
from src.preprocessing import preprocess_image, preprocess_mask

class MicroplasticDataset(Dataset):
    """
    Dataset class for loading Microplastic images and masks.
    """
    def __init__(self, image_paths, mask_paths, is_train=True):
        self.image_paths = image_paths
        self.mask_paths = mask_paths
        self.is_train = is_train

    def __len__(self):
        return len(self.image_paths)

    def apply_augmentations(self, image, mask):
        """Standard spatial augmentations for training."""
        # Random Horizontal Flip
        if np.random.rand() > 0.5:
            image = cv2.flip(image, 1)
            mask = cv2.flip(mask, 1)
            
        # Random Vertical Flip
        if np.random.rand() > 0.5:
            image = cv2.flip(image, 0)
            mask = cv2.flip(mask, 0)
            
        # Random Rotation (90, 180, 270)
        rot_k = np.random.randint(0, 4)
        if rot_k > 0:
            image = np.rot90(image, k=rot_k).copy()
            mask = np.rot90(mask, k=rot_k).copy()
            
        return image, mask

    def __getitem__(self, idx):
        img_path = self.image_paths[idx]
        mask_path = self.mask_paths[idx]
        
        # Read image and mask
        image = cv2.imread(img_path)
        mask = cv2.imread(mask_path, cv2.IMREAD_GRAYSCALE)
        
        if image is None:
            raise ValueError(f"Failed to read image at {img_path}")
        if mask is None:
            raise ValueError(f"Failed to read mask at {mask_path}")
            
        # Preprocess
        image = preprocess_image(image, use_clahe=True, use_blur=False)
        mask = preprocess_mask(mask)  # returns (H, W, 1)
        
        # Spatial augmentations for training
        if self.is_train:
            image, mask = self.apply_augmentations(image, mask)
            
        # If mask lost channel dim in rotation/flip, add it back
        if len(mask.shape) == 2:
            mask = np.expand_dims(mask, axis=-1)
            
        # Convert HWC to CHW for PyTorch
        image = np.transpose(image, (2, 0, 1))
        mask = np.transpose(mask, (2, 0, 1))
        
        return torch.tensor(image, dtype=torch.float32), torch.tensor(mask, dtype=torch.float32)


def get_paths(image_dir, mask_dir, include_augmented=False, aug_img_dir=None, aug_mask_dir=None):
    """Gathers lists of image and mask paths."""
    image_paths = []
    mask_paths = []
    
    # Original data
    valid_exts = ['.jpg', '.jpeg', '.png']
    if os.path.exists(image_dir) and os.path.exists(mask_dir):
        for fname in os.listdir(image_dir):
            if any(fname.lower().endswith(ext) for ext in valid_exts):
                mask_fname = os.path.splitext(fname)[0] + '.png'
                mask_path = os.path.join(mask_dir, mask_fname)
                if os.path.exists(mask_path):
                    image_paths.append(os.path.join(image_dir, fname))
                    mask_paths.append(mask_path)
                    
    # Augmented data
    if include_augmented and aug_img_dir and aug_mask_dir:
        if os.path.exists(aug_img_dir) and os.path.exists(aug_mask_dir):
            for fname in os.listdir(aug_img_dir):
                if any(fname.lower().endswith(ext) for ext in valid_exts):
                    mask_fname = os.path.splitext(fname)[0] + '.png'
                    mask_path = os.path.join(aug_mask_dir, mask_fname)
                    # For augmented data, the mask might just be the original mask copied over
                    # but named with the augmented stem.
                    if os.path.exists(mask_path):
                        image_paths.append(os.path.join(aug_img_dir, fname))
                        mask_paths.append(mask_path)
                        
    return image_paths, mask_paths


def get_dataloaders(include_augmented=True):
    """Creates train and validation DataLoaders."""
    
    # Train paths
    train_img_paths, train_mask_paths = get_paths(
        config.TRAIN_DIR, config.TRAIN_MASKS_DIR, 
        include_augmented=include_augmented,
        aug_img_dir=config.AUGMENTED_IMAGES_DIR,
        aug_mask_dir=config.AUGMENTED_MASKS_DIR
    )
    
    # Validation paths (no augmented data used for basic validation)
    val_img_paths, val_mask_paths = get_paths(
        config.VALID_DIR, config.VALID_MASKS_DIR,
        include_augmented=False
    )
    
    print(f"Found {len(train_img_paths)} training samples (augmented={include_augmented}).")
    print(f"Found {len(val_img_paths)} validation samples.")
    
    train_dataset = MicroplasticDataset(train_img_paths, train_mask_paths, is_train=True)
    val_dataset = MicroplasticDataset(val_img_paths, val_mask_paths, is_train=False)
    
    train_loader = DataLoader(train_dataset, batch_size=config.BATCH_SIZE, shuffle=True, num_workers=0, drop_last=True)
    val_loader = DataLoader(val_dataset, batch_size=config.BATCH_SIZE, shuffle=False, num_workers=0, drop_last=False)
    
    return train_loader, val_loader

def main():
    print("Dataset loader is ready.")
    train_loader, val_loader = get_dataloaders(include_augmented=False)
    
    if len(train_loader) > 0:
        imgs, masks = next(iter(train_loader))
        print(f"Train batch shapes - Images: {imgs.shape}, Masks: {masks.shape}")
        print(f"Image min: {imgs.min():.3f}, max: {imgs.max():.3f}")
        print(f"Mask min: {masks.min():.3f}, max: {masks.max():.3f}")

if __name__ == "__main__":
    main()
