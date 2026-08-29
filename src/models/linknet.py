import segmentation_models_pytorch as smp
import sys
import os

# Add project root to path
sys.path.append(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))
import src.config as config

def get_linknet_model():
    """
    Returns Linknet model with ResNet34 encoder.
    """
    model = smp.Linknet(
        encoder_name=config.ENCODER_NAME,
        encoder_weights=config.ENCODER_WEIGHTS,
        in_channels=config.IMG_CHANNELS,
        classes=config.NUM_CLASSES,
        activation='sigmoid'
    )
    return model

if __name__ == "__main__":
    model = get_linknet_model()
    print("LinkNet model created successfully.")
