"""
Centralized configuration for the Microplastic Detection System.
All paths, hyperparameters, and constants are defined here.
"""

import os

# ─── Project Root ───────────────────────────────────────────────────────────────
PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

# ─── Dataset Paths ──────────────────────────────────────────────────────────────
DATASET_DIR = os.path.join(PROJECT_ROOT, "dataset")
TRAIN_DIR = os.path.join(DATASET_DIR, "train")
VALID_DIR = os.path.join(DATASET_DIR, "valid")
TRAIN_ANNOTATIONS = os.path.join(TRAIN_DIR, "_annotations.csv")
VALID_ANNOTATIONS = os.path.join(VALID_DIR, "_annotations.csv")

# ─── GPS Fallback Configuration ────────────────────────────────────────────────
# Used when the NEO-6M GPS module is not detected.
# Change this to your actual field deployment coordinates.
GPS_FALLBACK_LOCATION = {
    'lat': 17.3850,       # Hyderabad, Telangana (matches mock GPS in gps_reader.py)
    'lon': 78.4867,
    'altitude': 542.0,
    'satellites': 0,      # 0 = no real satellite fix
    'is_fallback': True   # Flag so dashboard can mark data as estimated
}

# ─── Output Paths ───────────────────────────────────────────────────────────────
OUTPUTS_DIR = os.path.join(PROJECT_ROOT, "outputs")
MASKS_DIR = os.path.join(OUTPUTS_DIR, "masks")
TRAIN_MASKS_DIR = os.path.join(MASKS_DIR, "train")
VALID_MASKS_DIR = os.path.join(MASKS_DIR, "valid")
MODELS_DIR = os.path.join(OUTPUTS_DIR, "models")
RESULTS_DIR = os.path.join(OUTPUTS_DIR, "results")
IMSE_DIR = os.path.join(OUTPUTS_DIR, "imse")
REPORTS_DIR = os.path.join(OUTPUTS_DIR, "reports")

# Augmented data directories
AUGMENTED_DIR = os.path.join(OUTPUTS_DIR, "augmented")
AUGMENTED_IMAGES_DIR = os.path.join(AUGMENTED_DIR, "images")
AUGMENTED_MASKS_DIR = os.path.join(AUGMENTED_DIR, "masks")

# ─── Image Configuration ────────────────────────────────────────────────────────
ORIGINAL_WIDTH = 563
ORIGINAL_HEIGHT = 537
IMG_SIZE = 256          # Resize dimension for model input (256x256)
IMG_CHANNELS = 3        # RGB
NUM_CLASSES = 1         # Binary segmentation (microplastic vs background)

# ─── Model Configuration ────────────────────────────────────────────────────────
MODEL_NAMES = ["UNet", "DeepLabV3Plus", "LinkNet"]
ENCODER_NAME = "resnet34"
ENCODER_WEIGHTS = "imagenet"

# ─── Training Hyperparameters ────────────────────────────────────────────────────
BATCH_SIZE = 8
LEARNING_RATE = 1e-4
NUM_EPOCHS = 10
EARLY_STOPPING_PATIENCE = 3
WEIGHT_DECAY = 1e-5

# Loss weights for combined BCE + Dice loss
BCE_WEIGHT = 0.5
DICE_WEIGHT = 0.5

# ─── Augmentation Configuration ─────────────────────────────────────────────────
AUGMENTATION_CONFIG = {
    "blur_kernels": [5, 9],
    "brightness_factors": [0.5, 1.5],
    "gamma_values": [0.5, 2.0],
    "noise_sigmas": [15, 50],
    "num_combined_per_image": 2,  # Number of random combined augmentations per image
}

# ─── Feature Extraction ─────────────────────────────────────────────────────────
FEATURE_NAMES = ["blur", "brightness", "contrast", "particle_density", "edge_density"]

# ─── IMSE Configuration ─────────────────────────────────────────────────────────
LIGHTGBM_PARAMS = {
    "objective": "multiclass",
    "num_class": 3,
    "metric": "multi_logloss",
    "boosting_type": "gbdt",
    "num_leaves": 31,
    "learning_rate": 0.05,
    "feature_fraction": 0.9,
    "bagging_fraction": 0.8,
    "bagging_freq": 5,
    "verbose": -1,
    "n_estimators": 200,
    "random_state": 42,
}

# Model label mapping for IMSE
MODEL_LABEL_MAP = {
    "UNet": 0,
    "DeepLabV3Plus": 1,
    "LinkNet": 2,
}
LABEL_MODEL_MAP = {v: k for k, v in MODEL_LABEL_MAP.items()}

# ─── Environmental Decision Support ─────────────────────────────────────────────
# Contamination levels based on particle count per sample
CONTAMINATION_THRESHOLDS = {
    "Low": (0, 10),
    "Moderate": (11, 50),
    "High": (51, 100),
    "Critical": (101, float("inf")),
}

# Risk score weights
RISK_WEIGHTS = {
    "particle_count": 0.4,
    "size_distribution": 0.3,
    "density": 0.3,
}

# ─── Preprocessing ───────────────────────────────────────────────────────────────
CLAHE_CLIP_LIMIT = 2.0
CLAHE_TILE_GRID_SIZE = (8, 8)
GAUSSIAN_BLUR_KERNEL = (3, 3)

# ─── Seed for Reproducibility ───────────────────────────────────────────────────
RANDOM_SEED = 42


def create_output_dirs():
    """Create all output directories if they don't exist."""
    dirs = [
        OUTPUTS_DIR, MASKS_DIR, TRAIN_MASKS_DIR, VALID_MASKS_DIR,
        MODELS_DIR, RESULTS_DIR, IMSE_DIR, REPORTS_DIR,
        AUGMENTED_DIR, AUGMENTED_IMAGES_DIR, AUGMENTED_MASKS_DIR,
    ]
    for d in dirs:
        os.makedirs(d, exist_ok=True)


if __name__ == "__main__":
    create_output_dirs()
    print(f"Project Root: {PROJECT_ROOT}")
    print(f"Train Dir: {TRAIN_DIR}")
    print(f"Valid Dir: {VALID_DIR}")
    print("All output directories created.")
