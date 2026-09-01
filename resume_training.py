"""Resume training — only train models without checkpoints or with incomplete training."""
import os
import sys
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

import src.config as config
from src.train_segmentation import train_model
from src.dataset_loader import get_dataloaders
from src.models.deeplabv3plus import get_deeplabv3plus_model
from src.models.linknet import get_linknet_model
import torch
import numpy as np

torch.manual_seed(config.RANDOM_SEED)
np.random.seed(config.RANDOM_SEED)

config.create_output_dirs()
device = torch.device('cuda' if torch.cuda.is_available() else 'cpu')
print(f"Using device: {device}")

train_loader, val_loader = get_dataloaders(include_augmented=False)

# Check which models need training
# DeepLabV3+ has a partial checkpoint — retrain from scratch for proper convergence
remaining = {}

dlv3_path = os.path.join(config.MODELS_DIR, "DeepLabV3Plus_best.pth")
linknet_path = os.path.join(config.MODELS_DIR, "LinkNet_best.pth")

# DeepLabV3+ was interrupted mid-epoch 4, retrain fully
print("Training DeepLabV3Plus (retraining for full convergence)...")
remaining["DeepLabV3Plus"] = get_deeplabv3plus_model()

if not os.path.exists(linknet_path):
    print("Training LinkNet...")
    remaining["LinkNet"] = get_linknet_model()
else:
    print("LinkNet already trained, skipping.")

for name, model in remaining.items():
    train_model(name, model, train_loader, val_loader, device)

print("\nAll remaining models trained successfully!")
