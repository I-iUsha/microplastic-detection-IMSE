import os
import torch
import torch.nn as nn
import torch.optim as optim
import matplotlib.pyplot as plt
from tqdm import tqdm
import sys
import numpy as np
import segmentation_models_pytorch as smp

# Add project root to path
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
import src.config as config
from src.dataset_loader import get_dataloaders
from src.models.unet import get_unet_model
from src.models.deeplabv3plus import get_deeplabv3plus_model
from src.models.linknet import get_linknet_model

# Set seeds
torch.manual_seed(config.RANDOM_SEED)
np.random.seed(config.RANDOM_SEED)
if torch.cuda.is_available():
    torch.cuda.manual_seed_all(config.RANDOM_SEED)

class BCEDiceLoss(nn.Module):
    def __init__(self, bce_weight=config.BCE_WEIGHT, dice_weight=config.DICE_WEIGHT):
        super(BCEDiceLoss, self).__init__()
        self.bce_weight = bce_weight
        self.dice_weight = dice_weight
        self.bce = nn.BCELoss()
        
    def forward(self, inputs, targets):
        bce_loss = self.bce(inputs, targets)
        
        smooth = 1e-5
        # inputs are already sigmoided
        intersection = (inputs * targets).sum()                            
        dice = (2.*intersection + smooth)/(inputs.sum() + targets.sum() + smooth)  
        dice_loss = 1 - dice
        
        return self.bce_weight * bce_loss + self.dice_weight * dice_loss

def calculate_dice(inputs, targets):
    inputs = (inputs > 0.5).float()
    intersection = (inputs * targets).sum()
    dice = (2. * intersection) / (inputs.sum() + targets.sum() + 1e-5)
    return dice.item()

def train_model(model_name, model, train_loader, val_loader, device):
    print(f"\n--- Training {model_name} ---")
    model.to(device)
    
    criterion = BCEDiceLoss()
    optimizer = optim.Adam(model.parameters(), lr=config.LEARNING_RATE, weight_decay=config.WEIGHT_DECAY)
    
    best_val_dice = 0.0
    patience_counter = 0
    
    train_losses, val_losses = [], []
    train_dices, val_dices = [], []
    
    for epoch in range(config.NUM_EPOCHS):
        model.train()
        train_loss = 0.0
        train_dice = 0.0
        
        loop = tqdm(train_loader, desc=f"Epoch {epoch+1}/{config.NUM_EPOCHS} [Train]")
        for images, masks in loop:
            images = images.to(device)
            masks = masks.to(device)
            
            optimizer.zero_grad()
            outputs = model(images)
            loss = criterion(outputs, masks)
            
            loss.backward()
            optimizer.step()
            
            train_loss += loss.item()
            train_dice += calculate_dice(outputs, masks)
            
            loop.set_postfix(loss=loss.item())
            
        train_loss /= len(train_loader)
        train_dice /= len(train_loader)
        train_losses.append(train_loss)
        train_dices.append(train_dice)
        
        # Validation
        model.eval()
        val_loss = 0.0
        val_dice = 0.0
        with torch.no_grad():
            loop = tqdm(val_loader, desc=f"Epoch {epoch+1}/{config.NUM_EPOCHS} [Valid]")
            for images, masks in loop:
                images = images.to(device)
                masks = masks.to(device)
                
                outputs = model(images)
                loss = criterion(outputs, masks)
                
                val_loss += loss.item()
                val_dice += calculate_dice(outputs, masks)
                
        val_loss /= len(val_loader)
        val_dice /= len(val_loader)
        val_losses.append(val_loss)
        val_dices.append(val_dice)
        
        print(f"Epoch {epoch+1}: Train Loss: {train_loss:.4f}, Train Dice: {train_dice:.4f} | Val Loss: {val_loss:.4f}, Val Dice: {val_dice:.4f}")
        
        # Early stopping and model save
        if val_dice > best_val_dice:
            best_val_dice = val_dice
            patience_counter = 0
            save_path = os.path.join(config.MODELS_DIR, f"{model_name}_best.pth")
            torch.save(model.state_dict(), save_path)
            print(f"--> Saved best model to {save_path}")
        else:
            patience_counter += 1
            if patience_counter >= config.EARLY_STOPPING_PATIENCE:
                print("Early stopping triggered.")
                break

    # Plot metrics
    plt.figure(figsize=(12, 5))
    plt.subplot(1, 2, 1)
    plt.plot(train_losses, label='Train Loss')
    plt.plot(val_losses, label='Val Loss')
    plt.title(f'{model_name} Loss')
    plt.legend()
    
    plt.subplot(1, 2, 2)
    plt.plot(train_dices, label='Train Dice')
    plt.plot(val_dices, label='Val Dice')
    plt.title(f'{model_name} Dice Score')
    plt.legend()
    
    plt.savefig(os.path.join(config.RESULTS_DIR, f"{model_name}_training_curves.png"))
    plt.close()

def main():
    config.create_output_dirs()
    device = torch.device('cuda' if torch.cuda.is_available() else 'cpu')
    print(f"Using device: {device}")
    
    # Train on original data only (CPU mode - augmented data used in IMSE eval phase)
    train_loader, val_loader = get_dataloaders(include_augmented=False)
    
    models = {
        "UNet": get_unet_model(),
        "DeepLabV3Plus": get_deeplabv3plus_model(),
        "LinkNet": get_linknet_model()
    }
    
    for name, model in models.items():
        train_model(name, model, train_loader, val_loader, device)
        
    print("\nAll models trained successfully!")

if __name__ == "__main__":
    main()
