#!/bin/bash
# Raspberry Pi Initial Setup Script for Microplastic Detection System

echo "Starting Raspberry Pi Environment Setup..."

# 1. Update apt packages
echo "Updating system packages..."
sudo apt-get update && sudo apt-get upgrade -y

# 2. Install system dependencies
echo "Installing system dependencies..."
sudo apt-get install -y \
    libopencv-dev \
    python3-opencv \
    python3-pip \
    python3-venv \
    i2c-tools \
    git \
    v4l-utils

# 3. Enable serial port for GPS (non-interactive)
echo "Enabling Serial Port..."
# Disable serial console, enable serial hardware
sudo raspi-config nonint do_serial_hw 0
sudo raspi-config nonint do_serial_cons 1

# 4. Set up Python virtual environment
echo "Setting up Python virtual environment..."
PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$PROJECT_DIR" || exit
python3 -m venv venv
source venv/bin/activate

# 5. Install Python packages
echo "Installing Python dependencies..."
# Upgrade pip
pip install --upgrade pip

# Install PyTorch for ARM64 (Official wheels for Pi 5)
echo "Installing PyTorch for ARM64..."
pip install torch torchvision torchaudio --index-url https://download.pytorch.org/whl/cpu

# Install other requirements
pip install -r requirements_pi.txt

# 6. Test Hardware
echo "Hardware Setup Complete. Please reboot the system for serial changes to take effect."
echo "After reboot, run: python3 src/iot/hardware_test.py to verify."

# Optional: Create systemd service
# cat << EOF | sudo tee /etc/systemd/system/microplastic-edge.service
# [Unit]
# Description=Microplastic Edge Pipeline
# After=network.target
#
# [Service]
# ExecStart=/home/pi/major/venv/bin/python /home/pi/major/src/iot/edge_pipeline.py
# WorkingDirectory=/home/pi/major
# StandardOutput=inherit
# StandardError=inherit
# Restart=always
# User=pi
#
# [Install]
# WantedBy=multi-user.target
# EOF
# sudo systemctl enable microplastic-edge.service

echo "Setup script finished."
